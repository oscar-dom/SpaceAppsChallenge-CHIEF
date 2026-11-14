# `src/controllers`: request handlers

Thin handlers: **validate the input → call a service → send the result**. No business
logic, no database access. Each file exports a factory that receives the `Services`
object (`services/index.ts`) and returns the handlers that `routes/index.ts` registers.

```ts
export function crewController({ crew, health, alerts, clock }: Services) {
  const healthScore: RequestHandler = (req, res) => {
    const { crewId } = parseInput(crewParams, req.params); // 400 if invalid
    crew.get(crewId);                                       // 404 if unknown
    res.json(health.evaluate(crewId).health);
  };
  ...
}
```

Errors are thrown, never answered by hand: Express 5 forwards them (also from `async`
handlers) to `middlewares/error-handler.ts`.

## Files

### `crew.controller.ts`: crew, mission and health data

| Handler | Route | Calls |
| --- | --- | --- |
| `list` | `GET /crew` | `crew.list()` |
| `missionClock` | `GET /mission/clock` | `clock.snapshot()` |
| `metrics` | `GET /metrics` | `health.metrics` (catalog loaded at startup) |
| `healthScore` | `GET /crew/:crewId/health` | `health.evaluate(crewId).health` |
| `system` | `GET /crew/:crewId/systems/:systemId` | `health.system(crewId, systemId)` |
| `measurements` | `GET /crew/:crewId/measurements` | `health.measurements(crewId, metricId, period)` |
| `crewAlerts` | `GET /crew/:crewId/alerts` | `alerts.list(crewId)` |

Schemas: `crewParams` (`/^C\d{3}$/`), `systemParams` (`systemId` in `BODY_SYSTEMS`),
`measurementsQuery` (`metricId` required, `period` in `PERIODS`, default `day`).

### `alerts.controller.ts`: one alert

| Handler | Route | Calls |
| --- | --- | --- |
| `acknowledge` | `POST /alerts/:alertId/acknowledge` | `alerts.acknowledge(id)` → the updated `Alert` |
| `actions` | `POST /alerts/:alertId/actions` | `chief.alertActions(id)` → CHIEF's recommended actions, or the fallback |

`alertId` must be numeric (`/^\d+$/`).

### `chief.controller.ts`: CHIEF chat and voice

| Handler | Route | Calls |
| --- | --- | --- |
| `chat` | `POST /chief/chat` | `chief.chat(body)` |
| `speechToText` | `POST /chief/stt` | `chief.speechToText(buffer, contentType)` |
| `textToSpeech` | `POST /chief/tts` | `chief.textToSpeech(text)` → `audio/wav` |

`chatBody` mirrors the agent's limits (`agent/chief/schemas.py`): message 1–4000
characters, history ≤ 50 messages. Change both together.

## Why `crew.get(crewId)` before the real call

A well-formed but unknown id (`C999`) must answer 404, not an empty health score. The
check is one line and keeps the services free of HTTP concerns.

## Adding a handler

Write the zod schema next to the handler, parse with `parseInput`, call one service
method, `res.json(...)`. If the handler needs a new query or calculation, put it in a
service, not here.
