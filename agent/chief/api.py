"""HTTP API of the agent. Only the backend calls it."""

import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import APIRouter, FastAPI, File, HTTPException, Request, Response, UploadFile
from starlette.concurrency import run_in_threadpool

from .config import Settings, get_settings
from .llm import GeminiChain, LlmClient
from .schemas import (
    AlertActionsRequest,
    AlertActionsResponse,
    ChatRequest,
    ChatResponse,
    HealthCheckResponse,
    SttResponse,
    TtsRequest,
)
from .service import ChiefService
from .voice import Voice, VoiceUnavailableError

MAX_AUDIO_BYTES = 10 * 1024 * 1024

logger = logging.getLogger("chief.voice")

router = APIRouter()


def _service(request: Request) -> ChiefService:
    return request.app.state.chief


def _voice(request: Request) -> Voice:
    return request.app.state.voice


@router.get("/health", response_model=HealthCheckResponse)
def health(request: Request) -> HealthCheckResponse:
    settings: Settings = request.app.state.settings
    llm = request.app.state.llm
    available = llm.available_models() if isinstance(llm, GeminiChain) else []
    return HealthCheckResponse(
        status="ok",
        llm_configured=llm is not None,
        models=settings.model_chain,
        available_models=available,
        tts_voice_available=_voice(request).tts_available,
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest, request: Request) -> ChatResponse:
    return await _service(request).chat(body)


@router.post("/alerts/actions", response_model=AlertActionsResponse)
async def alert_actions(body: AlertActionsRequest, request: Request) -> AlertActionsResponse:
    return await _service(request).alert_actions(body)


@router.post("/stt", response_model=SttResponse)
async def speech_to_text(request: Request, audio: Annotated[UploadFile, File()]) -> SttResponse:
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio file")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio file too large")
    try:
        text, language = await run_in_threadpool(_voice(request).transcribe, data)
    except VoiceUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return SttResponse(text=text, language=language)


@router.post("/tts", response_class=Response)
async def text_to_speech(body: TtsRequest, request: Request) -> Response:
    try:
        audio = await run_in_threadpool(_voice(request).synthesize, body.text)
    except VoiceUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(content=audio, media_type="audio/wav")


def _preload_voice(voice: Voice) -> None:
    problems = voice.warm_up()
    for problem in problems:
        logger.warning("Voice not preloaded (%s); /stt or /tts will answer 503", problem)
    if not problems:
        logger.info("Voice models loaded")


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    # In a thread: the agent answers /health and /chat while the models load.
    if app.state.settings.voice_preload:
        threading.Thread(target=_preload_voice, args=(app.state.voice,), daemon=True).start()
    yield


def create_app(settings: Settings | None = None, llm: LlmClient | None = None) -> FastAPI:
    """Build the app. Tests pass their own settings and a fake LLM."""
    settings = settings or get_settings()
    if llm is None and settings.llm_configured:
        llm = GeminiChain(settings)

    app = FastAPI(title="CHIEF agent", version="0.1.0", lifespan=_lifespan)
    app.state.settings = settings
    app.state.llm = llm
    app.state.chief = ChiefService(settings, llm)
    app.state.voice = Voice(settings)
    app.include_router(router)
    return app
