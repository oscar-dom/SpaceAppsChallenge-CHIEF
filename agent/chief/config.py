"""Agent settings, read from environment variables and agent/.env."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

AGENT_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=AGENT_DIR / ".env", extra="ignore")

    # Gemini. Without an API key the agent still runs and answers in fallback mode.
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-pro"
    gemini_temperature: float = 0.4
    llm_timeout_seconds: float = 45.0

    # Speech-to-text (faster-whisper). Model size: tiny, base, small, medium...
    whisper_model: str = "base.en"
    whisper_compute_type: str = "int8"

    # Text-to-speech (Piper). Path to the .onnx voice, relative to agent/ or absolute.
    piper_voice_path: Path = Path("models/piper/en_US-ryan-medium.onnx")

    # Upper bound on the actions CHIEF returns in one answer.
    max_actions: int = 5

    @property
    def llm_configured(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def piper_voice_file(self) -> Path:
        path = self.piper_voice_path
        return path if path.is_absolute() else AGENT_DIR / path


@lru_cache
def get_settings() -> Settings:
    return Settings()
