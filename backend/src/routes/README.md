# `src/routes`: REST routes

`index.ts` exports `apiRouter(services)`, mounted under `/api` (`API_PREFIX` from
`@chief/shared`) in [`app.ts`](../app.ts). It only maps a method and path to a
controller handler; the logic lives in `controllers/` and `services/`.

The contract is the comment block in [`shared/src/api.ts`](../../../shared/src/api.ts):
a route is added there first, agreed with the team, then here.

| Method | Path | Handler | Answer (`@chief/shared` type) |
| --- | --- | --- | --- |
| GET | `/crew` | `crew.list` | `CrewMember[]` |
| GET | `/mission/clock` | `crew.missionClock` | `MissionClock` |
| GET | `/metrics` | `crew.metrics` | `Metric[]` |
| GET | `/thresholds` | `crew.thresholds` | `Threshold[]`, only metrics with a sourced threshold |
| GET | `/crew/:crewId/health` | `crew.healthScore` | `HealthScore` |
| GET | `/crew/:crewId/systems/:systemId` | `crew.system` | `SystemStatus` |
| GET | `/crew/:crewId/measurements?metricId=&period=` | `crew.measurements` | `Measurement[]` (≤ 300, oldest first) |
| GET | `/crew/:crewId/alerts` | `crew.crewAlerts` | `Alert[]` (most urgent first) |
| POST | `/alerts/:alertId/acknowledge` | `alerts.acknowledge` | `Alert` |
| POST | `/alerts/:alertId/actions` | `alerts.actions` | `AlertActionsResponse` |
| POST | `/chief/chat` | `chief.chat` | `ChiefChatResponse` |
| POST | `/chief/stt` | `chief.speechToText` | `{ text: string }` |
| POST | `/chief/tts` | `chief.textToSpeech` | `audio/wav` bytes |
| GET | `/journey` | `journey.route` | `Journey` (10 stages, CHIEF's position, hazards, cargo ships) |
| GET | `/journey/stages/:index/inventory` | `journey.stageInventory` | `StageInventory` (real for past stages, a forecast for upcoming ones) |
| GET | `/inventory` | `journey.stocks` | `InventoryStock[]` |
| GET | `/inventory/:itemId/history` | `journey.history` | `InventoryHistory` (stock at the end of each mission day) |
| POST | `/inventory/:itemId/adjust` | `journey.adjust` | `InventoryStock` |

Outside `/api`, `app.ts` serves `GET /health` → `{ "status": "ok" }`.

## Request formats

- Ids: crew members `C001`…`C004` (`/^C\d{3}$/`), alerts numeric strings (`"12"`),
  systems the `BodySystemId` values of `shared/src/systems.ts` (`cardiovascular`, `vision`…).
- `period`: `day` (default), `week`, `month`, `mission`.
- `POST /chief/chat` body: `{ crewMemberId, message, history? }` (`ChiefChatRequest`).
  The backend stores no chat history: the frontend sends the last messages (≤ 50).
- `POST /chief/stt`: the recording **as the raw body**, with its type
  (`Content-Type: audio/webm`, `audio/*`, `video/webm` or `application/octet-stream`),
  up to 10 MB. That is why this route has its own `express.raw` parser.
- `POST /chief/tts` body: `{ text }` (≤ 2000 characters).
- `POST /inventory/:itemId/adjust` body: `{ delta, note?, crewMemberId? }` (`InventoryAdjustRequest`): `delta` adds (positive) or removes (negative) units, never zero; `note` ≤ 200 characters. Removing more than the stock answers 400.
- Stage `index`: 1–10.

Every error answers `{ "error": { "code", "message" } }` (see `middlewares/`).

## Adding a route

1. Add it to the comment in `shared/src/api.ts` (and any new type to `shared/`).
2. Add the handler to the right controller (or a new `x.controller.ts`).
3. Register it here and add a test in `src/app.test.ts`.
4. Add it to the API table in [`backend/README.md`](../../README.md).
