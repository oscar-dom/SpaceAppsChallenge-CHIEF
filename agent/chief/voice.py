"""Speech-to-text (faster-whisper) and text-to-speech (Piper), both on CPU.

Models load lazily on first use and stay in memory. The imports are lazy too, so the
agent starts (and its tests run) without the voice packages installed.
"""

import io
import threading
import wave
from typing import Any

from .config import Settings


class VoiceUnavailableError(Exception):
    """The voice packages or the voice model are missing."""


class Voice:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._lock = threading.Lock()
        self._whisper: Any = None
        self._piper: Any = None

    @property
    def tts_available(self) -> bool:
        return self._settings.piper_voice_file.exists()

    def _load_whisper(self) -> Any:
        with self._lock:
            if self._whisper is None:
                try:
                    from faster_whisper import WhisperModel
                except ImportError as exc:
                    raise VoiceUnavailableError(
                        "faster-whisper is not installed (pip install -r requirements-voice.txt)"
                    ) from exc
                self._whisper = WhisperModel(
                    self._settings.whisper_model,
                    device="cpu",
                    compute_type=self._settings.whisper_compute_type,
                )
            return self._whisper

    def _load_piper(self) -> Any:
        with self._lock:
            if self._piper is None:
                try:
                    from piper import PiperVoice
                except ImportError as exc:
                    raise VoiceUnavailableError(
                        "piper-tts is not installed (pip install -r requirements-voice.txt)"
                    ) from exc
                voice_file = self._settings.piper_voice_file
                if not voice_file.exists():
                    raise VoiceUnavailableError(
                        f"Piper voice not found at {voice_file}. See agent/README.md."
                    )
                self._piper = PiperVoice.load(voice_file)
            return self._piper

    def transcribe(self, audio: bytes) -> tuple[str, str | None]:
        """Audio in any format FFmpeg/PyAV can decode (webm, ogg, wav...) → text."""
        model = self._load_whisper()
        segments, info = model.transcribe(io.BytesIO(audio), beam_size=1, vad_filter=True)
        text = " ".join(segment.text.strip() for segment in segments).strip()
        return text, getattr(info, "language", None)

    def synthesize(self, text: str) -> bytes:
        """Text → WAV bytes."""
        voice = self._load_piper()
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav_file:
            voice.synthesize_wav(text, wav_file)
        return buffer.getvalue()
