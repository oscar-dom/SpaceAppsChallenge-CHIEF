# `src/services/agent`: client of the CHIEF agent

`client.ts` exports `AgentClient`, the HTTP client of the Python agent (`agent/`, Óscar's
area, see [`agent/README.md`](../../../../agent/README.md)). **The backend is the only
gateway**: the frontend never calls the agent or Gemini.

```
Frontend ─REST─▶ ChiefService ─▶ AgentClient ─HTTP─▶ agent :8000 ─▶ Gemini
```

## Methods

| Method | Agent endpoint | Request → response (`@chief/shared`, `shared/src/chief.ts`) |
| --- | --- | --- |
| `chat(body)` | `POST /chat` | `AgentChatRequest` → `AgentChatResponse` |
| `alertActions(body)` | `POST /alerts/actions` | `AgentAlertActionsRequest` → `AlertActionsResponse` |
| `speechToText(audio, contentType)` | `POST /stt` | multipart, field `audio` → `{ text }` |
| `textToSpeech(text)` | `POST /tts` | `{ text }` → WAV bytes |

Base URL `AGENT_URL` (default `http://localhost:8000`); every call is aborted after
`AGENT_TIMEOUT_MS` (20 s).

## Formats

Both chat requests carry the `AgentContext` built by `ChiefService`:

```jsonc
{
  "crewMember": { "id": "C003", "name": "...", ... },
  "missionClock": { "missionDay": 60, "missionTime": "2026-10-30T14:00:00Z", ... },
  "health": { "score": 82, "status": "critical", "systems": [ ... ] },   // rules engine
  "alerts": [ { "id": "8", "severity": "critical", "recommendation": "...", ... } ],
  "formulary": [ { "id": "...", "name": "...", "indication": "..." } ],
  "message": "Why am I so tired?", "history": [ ... ]                   // chat only
  // "alert": { ... }                                                   // alert actions only
}
```

The agent answers `{ reply | summary, actions[], fallback, model }`. Every action has
`category`, `title`, `description`, `escalation` and an optional `medicationId` from the
formulary.

The Python side mirrors these types with Pydantic in `agent/chief/schemas.py`: **change
both sides together**.

## Validation and errors

- Answers are validated with zod before use: an agent that sends something unexpected is
  treated as down instead of breaking the frontend. `medicationId: null` becomes
  `undefined`; a missing `model` becomes `null`.
- `chat` / `alertActions`: any failure (network, timeout, non-2xx as `AgentHttpError`,
  invalid answer) is thrown, and `ChiefService` turns it into a fallback answer.
- Voice: unreachable or 5xx → `AgentUnavailableError` (503); the agent rejecting the
  audio (4xx) → `AppError` 400/413 `INVALID_AUDIO`.

## Testing

`src/app.test.ts` starts a fake agent on a random port and checks the context the
backend sends and how it reads the answer. Tests point `AGENT_URL` to port 9, which
`fetch` refuses at once, to test the fallback. The real agent with Gemini is not tested
here.
