# CHIEF agent

Python service with CHIEF, the AI assistant of the crew health system:

- **Chat** and **alert recommendations** with Gemini (`google-genai`, default
  `gemini-3.5-flash`), structured JSON output and safety guardrails.
- **Speech-to-text** with faster-whisper and **text-to-speech** with Piper, both on CPU.

Only the backend calls this service. The frontend never talks to it directly.

## Setup

Requires Python 3.11+ (tested with 3.14). From `agent/`:

```bash
# Windows: use the Windows Python (py), not the MSYS/Git Bash one
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements-voice.txt -r requirements-dev.txt

# macOS / Linux
python3 -m venv .venv
.venv/bin/pip install -r requirements-voice.txt -r requirements-dev.txt
```

`requirements.txt` holds the core (API + Gemini), `requirements-voice.txt` adds
faster-whisper and Piper, and `requirements-dev.txt` adds pytest and Ruff.

Then:

1. Copy `.env.example` to `.env` and set `GEMINI_API_KEY` (Google AI Studio).
2. `GEMINI_MODEL` defaults to `gemini-3.5-flash`, tested on 2026-11-14: about 6-8 s
   per answer. Pro models (`gemini-2.5-pro`, `gemini-3.1-pro-preview`) return 404 for
   new free-tier keys, and `gemini-3.8-flash` was overloaded (minutes per answer). To
   list the models your key can use (PowerShell, from `agent/`):
   ```powershell
   $env:GEMINI_API_KEY="your_key"; .venv\Scripts\python -c "from google import genai; [print(m.name) for m in genai.Client().models.list() if 'gemini' in m.name]"
   ```
3. Download the Piper voice (about 60 MB, git-ignored):
   ```bash
   .venv/Scripts/python -m piper.download_voices en_US-ryan-medium --download-dir models/piper
   ```
   The Whisper model (`base.en`, about 150 MB) downloads by itself on the first `/stt`
   call.

Run it alone with `.venv/Scripts/python -m uvicorn main:app --reload --port 8000`, or
together with everything else with `npm run dev` from the repository root.

**Without `GEMINI_API_KEY` the agent still works:** it answers in fallback mode, built
only from the rules engine output (`fallback: true` in every response).

## API

JSON uses camelCase and mirrors the TypeScript types in `shared/src/chief.ts`
(`AgentChatRequest`, `AgentChatResponse`, `AgentAlertActionsRequest`,
`AlertActionsResponse`). Interactive docs: `http://localhost:8000/docs`.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/health` | | `{ status, llmConfigured, model, ttsVoiceAvailable }` |
| POST | `/chat` | `AgentChatRequest` | `AgentChatResponse` |
| POST | `/alerts/actions` | `AgentAlertActionsRequest` | `AlertActionsResponse` |
| POST | `/stt` | multipart, field `audio` (webm, ogg, wav...) | `{ text, language }` |
| POST | `/tts` | `{ text }` | `audio/wav` |

Every context request (`/chat`, `/alerts/actions`) carries:

```jsonc
{
  "crewMember": { "id": "crew-1", "name": "Alex Rivera", "role": "Flight Engineer", "agency": "NASA", "age": 41, "sex": "female" },
  "missionClock": { "missionDay": 92, "missionLengthDays": 180, "missionTime": "2026-08-20T09:00:00Z", "timeScale": 3600 },
  "health": { /* HealthScore from the rules engine, with systems and metrics */ },
  "alerts": [ /* Alert[]; acknowledged alerts are ignored */ ],
  "formulary": [ { "id": "vit-d3", "name": "Vitamin D3", "indication": "Vitamin D supplementation", "dosage": "800 IU daily" } ]
}
```

`/chat` adds `message` and `history` (`ChiefMessage[]`, oldest first). `/alerts/actions`
adds `alert`. A full example lives in `tests/conftest.py`.

Each Gemini call is capped at `LLM_TIMEOUT_SECONDS` (30 s) and `LLM_ATTEMPTS` (2);
past that, the answer is a fallback.

Errors: `422` invalid body, `400`/`413` empty or too large audio, `503` voice packages or
voice model missing. Gemini failures never return an error: they return a fallback
answer.

## Guardrails (`chief/safety.py`)

CHIEF follows the rules in the system prompt (`chief/prompts.py`), and the code enforces
the critical ones regardless of what the model answers:

- Medication actions whose `medicationId` is not in the formulary are dropped.
- If the alert (or any active critical alert, in chat) needs the crew medical officer or
  the flight surgeon and no action escalates that far, an escalation action is added
  first.
- At most `max_actions` (5) actions per answer.

## Layout

```
main.py              entry point (uvicorn main:app)
chief/
  api.py             FastAPI routes and app factory
  config.py          settings from .env
  schemas.py         request/response models and the model's output schema
  prompts.py         system prompt and context rendering
  llm.py             Gemini client (LlmClient protocol, fake in tests)
  service.py         chat, alert actions and fallback
  safety.py          guardrails
  voice.py           faster-whisper and Piper
tests/               pytest, no network or voice models needed
```

## Checks

```bash
.venv/Scripts/python -m pytest
.venv/Scripts/python -m ruff check .
.venv/Scripts/python -m ruff format --check .
```
