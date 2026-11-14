import asyncio
import time
from types import SimpleNamespace
from typing import Any

import pytest
from google.genai import errors

from chief.config import Settings
from chief.llm import (
    COOLDOWN_QUOTA,
    COOLDOWN_UNAVAILABLE,
    GeminiChain,
    LlmError,
    Turn,
)
from chief.schemas import LlmChatOutput

GOOD = '{"reply": "ok", "actions": []}'


def api_error(code: int) -> errors.APIError:
    cls = errors.ClientError if code < 500 else errors.ServerError
    return cls(code, {"error": {"code": code, "message": "x", "status": "X"}})


class FakeModels:
    """Answers per model: an exception to raise, a JSON string, or a delay in seconds."""

    def __init__(self, behaviour: dict[str, Any]) -> None:
        self.behaviour = behaviour
        self.calls: list[str] = []

    async def generate_content(self, *, model: str, contents: Any, config: Any) -> Any:
        self.calls.append(model)
        self.config = config
        result = self.behaviour[model]
        if isinstance(result, BaseException):
            raise result
        if isinstance(result, float):
            await asyncio.sleep(result)
            result = GOOD
        return SimpleNamespace(parsed=None, text=result)


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def make_chain(
    behaviour: dict[str, Any], timeout: float = 30.0, clock: Any = None, attempt: float = 30.0
) -> tuple[GeminiChain, FakeModels]:
    models = FakeModels(behaviour)
    client = SimpleNamespace(aio=SimpleNamespace(models=models))
    settings = Settings(
        _env_file=None,
        gemini_api_key="k",
        gemini_models=",".join(behaviour),
        llm_timeout_seconds=timeout,
        llm_attempt_seconds=attempt,
    )
    chain = GeminiChain(settings, client=client, clock=clock or Clock())
    return chain, models


def run(chain: GeminiChain):
    return asyncio.run(chain.generate("system", [Turn("user", "hi")], LlmChatOutput))


def test_first_model_answers() -> None:
    chain, models = make_chain({"a": GOOD, "b": GOOD})
    result = run(chain)
    assert result.model == "a"
    assert models.calls == ["a"]


@pytest.mark.parametrize("code", [429, 404, 503])
def test_moves_to_next_model_on_api_error(code: int) -> None:
    chain, models = make_chain({"a": api_error(code), "b": GOOD})
    result = run(chain)
    assert result.model == "b"
    assert models.calls == ["a", "b"]


def test_moves_to_next_model_on_invalid_answer() -> None:
    chain, _ = make_chain({"a": "not json", "b": GOOD})
    assert run(chain).model == "b"
    # An invalid answer does not cool the model down.
    assert chain.available_models() == ["a", "b"]


def test_quota_error_skips_model_until_cooldown_ends() -> None:
    clock = Clock()
    chain, models = make_chain({"a": api_error(429), "b": GOOD}, clock=clock)
    run(chain)
    assert chain.available_models() == ["b"]

    run(chain)
    assert models.calls == ["a", "b", "b"]

    clock.now += COOLDOWN_QUOTA + 1
    assert chain.available_models() == ["a", "b"]


def test_unavailable_model_cools_down_longer() -> None:
    clock = Clock()
    chain, _ = make_chain({"a": api_error(404), "b": GOOD}, clock=clock)
    run(chain)
    clock.now += COOLDOWN_QUOTA + 1
    assert chain.available_models() == ["b"]
    clock.now += COOLDOWN_UNAVAILABLE
    assert chain.available_models() == ["a", "b"]


def test_raises_when_every_model_fails() -> None:
    chain, _ = make_chain({"a": api_error(429), "b": api_error(503)})
    with pytest.raises(LlmError) as info:
        run(chain)
    assert "a: 429" in str(info.value) and "b: 503" in str(info.value)

    # Both are cooling down now: fail fast without calling the API.
    with pytest.raises(LlmError, match="cooling down"):
        run(chain)


def test_slow_model_uses_up_the_deadline_and_the_chain_stops(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("chief.llm.MIN_ATTEMPT_SECONDS", 0.1)
    chain, models = make_chain({"a": 5.0, "b": GOOD}, timeout=0.3, clock=time.monotonic)
    started = time.monotonic()
    with pytest.raises(LlmError, match="timed out"):
        run(chain)
    assert time.monotonic() - started < 1.0
    # "b" is not started with less than MIN_ATTEMPT_SECONDS left.
    assert models.calls == ["a"]


def test_does_not_start_a_model_without_enough_time() -> None:
    chain, models = make_chain({"a": GOOD}, timeout=1.0)
    with pytest.raises(LlmError, match="out of time"):
        run(chain)
    assert models.calls == []


def test_slow_model_leaves_time_for_the_next_one(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("chief.llm.MIN_ATTEMPT_SECONDS", 0.1)
    chain, models = make_chain(
        {"a": 5.0, "b": GOOD}, timeout=1.0, attempt=0.3, clock=time.monotonic
    )
    assert run(chain).model == "b"
    assert models.calls == ["a", "b"]


@pytest.mark.parametrize(("level", "expected"), [("low", "LOW"), ("", None)])
def test_thinking_level_is_sent_when_set(level: str, expected: str | None) -> None:
    models = FakeModels({"a": GOOD})
    client = SimpleNamespace(aio=SimpleNamespace(models=models))
    settings = Settings(
        _env_file=None, gemini_api_key="k", gemini_models="a", gemini_thinking_level=level
    )
    run(GeminiChain(settings, client=client))
    thinking = models.config.thinking_config
    level_sent = thinking.thinking_level.name if thinking else None
    assert level_sent == expected
