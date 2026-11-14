"""Language model client: a chain of Gemini models. Tests plug in a fake."""

import asyncio
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Generic, Literal, Protocol, TypeVar

from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from .config import Settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


@dataclass(frozen=True)
class Turn:
    role: Literal["user", "model"]
    text: str


@dataclass(frozen=True)
class LlmResult(Generic[T]):
    output: T
    model: str


class LlmError(Exception):
    """No model produced a valid answer. Callers fall back to the rules engine."""


class LlmClient(Protocol):
    async def generate(self, system: str, turns: list[Turn], schema: type[T]) -> LlmResult[T]: ...


# How long a failing model is skipped before it is tried again, by kind of failure.
COOLDOWN_QUOTA = 300.0  # 429: quota or rate limit exhausted
COOLDOWN_UNAVAILABLE = 3600.0  # 400/403/404: model not available to this key
COOLDOWN_TRANSIENT = 60.0  # 5xx, timeout, network error
COOLDOWN_NONE = 0.0  # invalid answer: try the next model, keep this one

# Never start a model with less time than this left: it would only time out.
MIN_ATTEMPT_SECONDS = 3.0


def cooldown_for(exc: BaseException) -> float:
    if isinstance(exc, errors.APIError):
        if exc.code == 429:
            return COOLDOWN_QUOTA
        if exc.code in (400, 403, 404):
            return COOLDOWN_UNAVAILABLE
    return COOLDOWN_TRANSIENT


class GeminiChain:
    """Tries each configured model in order until one gives a valid answer.

    A model that fails is skipped for a while (see the COOLDOWN_* values), so a model
    without quota does not slow down every answer. The whole chain shares one deadline,
    and each model gets at most `llm_attempt_seconds` of it.
    """

    def __init__(
        self,
        settings: Settings,
        client: genai.Client | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._settings = settings
        self._models = settings.model_chain
        self._clock = clock
        self._cooldown_until: dict[str, float] = {}
        self._client = client or genai.Client(
            api_key=settings.gemini_api_key,
            # Retries happen across models, not inside the SDK.
            http_options=types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=1)),
        )

    @property
    def models(self) -> list[str]:
        return list(self._models)

    def available_models(self) -> list[str]:
        now = self._clock()
        return [m for m in self._models if self._cooldown_until.get(m, 0.0) <= now]

    def _cool_down(self, model: str, seconds: float) -> None:
        if seconds > 0:
            self._cooldown_until[model] = self._clock() + seconds

    async def generate(self, system: str, turns: list[Turn], schema: type[T]) -> LlmResult[T]:
        contents = [
            types.Content(role=turn.role, parts=[types.Part(text=turn.text)]) for turn in turns
        ]
        config = types.GenerateContentConfig(
            system_instruction=system,
            temperature=self._settings.gemini_temperature,
            response_mime_type="application/json",
            response_schema=schema,
            thinking_config=_thinking(self._settings.gemini_thinking_level),
        )
        deadline = self._clock() + self._settings.llm_timeout_seconds
        failures: list[str] = []

        for model in self.available_models():
            remaining = deadline - self._clock()
            if remaining < MIN_ATTEMPT_SECONDS:
                failures.append("out of time")
                break
            try:
                response = await asyncio.wait_for(
                    self._client.aio.models.generate_content(
                        model=model, contents=contents, config=config
                    ),
                    timeout=min(remaining, self._settings.llm_attempt_seconds),
                )
                return LlmResult(output=_parse(response, schema), model=model)
            except _InvalidAnswerError as exc:
                cooldown, reason = COOLDOWN_NONE, str(exc)
            except TimeoutError:
                cooldown, reason = COOLDOWN_TRANSIENT, "timed out"
            except Exception as exc:  # API, quota, network: all move on to the next model
                cooldown, reason = cooldown_for(exc), _describe(exc)
            self._cool_down(model, cooldown)
            failures.append(f"{model}: {reason}")
            logger.warning("Gemini model %s failed (%s), trying the next one", model, reason)

        if not failures:
            failures.append("every model is cooling down after recent failures")
        raise LlmError("; ".join(failures))


def _thinking(level: str) -> types.ThinkingConfig | None:
    level = level.strip().lower()
    return types.ThinkingConfig(thinking_level=level) if level else None  # type: ignore[arg-type]


class _InvalidAnswerError(Exception):
    pass


def _parse(response: types.GenerateContentResponse, schema: type[T]) -> T:
    parsed = response.parsed
    if isinstance(parsed, schema):
        return parsed
    if not response.text:
        raise _InvalidAnswerError("empty answer")
    try:
        return schema.model_validate_json(response.text)
    except ValueError as exc:
        raise _InvalidAnswerError("answer does not match the schema") from exc


def _describe(exc: BaseException) -> str:
    if isinstance(exc, errors.APIError):
        return f"{exc.code} {exc.status or ''}".strip()
    return type(exc).__name__
