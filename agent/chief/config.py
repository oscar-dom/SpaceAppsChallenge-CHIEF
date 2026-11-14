"""Agent settings, read from environment variables and agent/.env."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

AGENT_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=AGENT_DIR / ".env", extra="ignore")

    # Gemini. Without an API key the agent still runs and answers in fallback mode.
    gemini_api_key: str = ""
    # Models tried in order, comma-separated. Free-tier quota is per model, so when one
    # runs out (or is overloaded) the next one answers. Tested on 2026-11-14; Pro models
    # are not available to new free-tier keys.
    gemini_models: str = (
        "gemini-3.5-flash,gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite"
    )
    gemini_temperature: float = 0.4
    # Time limit for one answer across the whole chain. Past it, CHIEF falls back. Keep it
    # below the backend's AGENT_TIMEOUT_MS (20 s), or the backend gives up first.
    llm_timeout_seconds: float = 15.0

    # Speech-to-text (faster-whisper). Model size: tiny, base, small, medium...
    whisper_model: str = "base.en"
    whisper_compute_type: str = "int8"

    # Text-to-speech (Piper). Path to the .onnx voice, relative to agent/ or absolute.
    piper_voice_path: Path = Path("models/piper/en_US-ryan-medium.onnx")

    # Load the voice models in the background at startup, so the first push-to-talk does
    # not wait for them (or for the first Whisper download).
    voice_preload: bool = True

    # Upper bound on the actions CHIEF returns in one answer.
    max_actions: int = 5

    @property
    def model_chain(self) -> list[str]:
        return [m.strip() for m in self.gemini_models.split(",") if m.strip()]

    @property
    def llm_configured(self) -> bool:
        return bool(self.gemini_api_key) and bool(self.model_chain)

    @property
    def piper_voice_file(self) -> Path:
        path = self.piper_voice_path
        return path if path.is_absolute() else AGENT_DIR / path


@lru_cache
def get_settings() -> Settings:
    return Settings()
