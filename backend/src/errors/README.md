# `src/errors`: error classes

The errors the backend throws on purpose. Each one carries the HTTP status and the error
code the client will see, so services can fail with `throw` and never touch `res`.

| Class (`app-error.ts`) | Status | `code` | Thrown when |
| --- | --- | --- | --- |
| `AppError(status, code, message)` | any | any | base class; use it directly for a one-off case |
| `NotFoundError` | 404 | `NOT_FOUND` | unknown crew member, metric or alert (`CrewService.get`, `HealthService.metric`, `AlertsService.find`) |
| `ValidationError` | 400 | `VALIDATION_ERROR` | invalid params, query or body (`middlewares/validate.ts`) |
| `AgentUnavailableError` | 503 | `AGENT_UNAVAILABLE` | the agent's voice endpoints (STT/TTS) are down; voice has no fallback |

The agent client also throws `AppError(400 | 413, 'INVALID_AUDIO', ...)` when the agent
rejects a recording.

## How they reach the client

```
service throws NotFoundError ─▶ Express 5 forwards it (also from async handlers)
                              ─▶ middlewares/error-handler.ts
                              ─▶ 404 { "error": { "code": "NOT_FOUND", "message": "Crew member C999 not found" } }
```

The body is always the `ApiError` type of [`shared/src/api.ts`](../../../shared/src/api.ts).
Any error that is **not** an `AppError` (a bug, a database failure) answers a generic
`500 INTERNAL_ERROR` and is logged; its message never reaches the client.

## Rules

- The `message` of an `AppError` is shown to the user: write it in English, without
  internal details (no SQL, no stack, no file paths).
- Codes are `UPPER_SNAKE_CASE` and stable: the frontend may switch on them.
- CHIEF chat and alert actions never throw when the agent is down: they answer in fallback
  mode (`services/chief.service.ts`). Only voice uses `AgentUnavailableError`.
