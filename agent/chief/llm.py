"""Language model client. Gemini in production; tests plug in a fake."""

import asyncio
from dataclasses import dataclass
from typing import Literal, Protocol, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel

from .config import Settings

T = TypeVar("T", bound=BaseModel)


@dataclass(frozen=True)
class Turn:
    role: Literal["user", "model"]
    text: str


class LlmError(Exception):
    """The model could not produce a valid answer. Callers fall back to the rules engine."""


class LlmClient(Protocol):
    async def generate(self, system: str, turns: list[Turn], schema: type[T]) -> T: ...


class GeminiClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = genai.Client(api_key=settings.gemini_api_key)

    async def generate(self, system: str, turns: list[Turn], schema: type[T]) -> T:
        contents = [
            types.Content(role=turn.role, parts=[types.Part(text=turn.text)]) for turn in turns
        ]
        config = types.GenerateContentConfig(
            system_instruction=system,
            temperature=self._settings.gemini_temperature,
            response_mime_type="application/json",
            response_schema=schema,
        )
        try:
            response = await asyncio.wait_for(
                self._client.aio.models.generate_content(
                    model=self._settings.gemini_model, contents=contents, config=config
                ),
                timeout=self._settings.llm_timeout_seconds,
            )
        except TimeoutError as exc:
            raise LlmError("Gemini timed out") from exc
        except Exception as exc:  # network, quota, auth: all handled the same way
            raise LlmError(f"Gemini request failed: {exc}") from exc

        parsed = response.parsed
        if isinstance(parsed, schema):
            return parsed
        if not response.text:
            raise LlmError("Gemini returned an empty answer")
        try:
            return schema.model_validate_json(response.text)
        except ValueError as exc:
            raise LlmError("Gemini returned an answer that does not match the schema") from exc
