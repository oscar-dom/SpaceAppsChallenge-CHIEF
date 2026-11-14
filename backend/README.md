# CHIEF backend

Express + Socket.IO API over the SQLite database. It runs the **rules engine** (statuses,
health score, alerts), the **mission clock** and the **live simulator**, and is the only
gateway to the CHIEF agent. Project-wide decisions are in [`CLAUDE.md`](../CLAUDE.md);
the database is documented in [`src/db/README.md`](src/db/README.md).

## Getting started

```bash
npm install                   # at the repository root (npm workspaces)
npm run db:reset -w backend   # creates backend/var/chief.db with the seeded mission
npm run dev -w backend        # http://localhost:3000, restarts on change
```

`npm run dev` at the root starts the backend, the frontend and the agent together.
Configuration is optional: copy `.env.example` to `.env` to change a default. Without the
agent running, CHIEF answers in fallback mode (generic advice from the thresholds table).

| Script | What it does |
| --- | --- |
| `dev` / `start` | Start the server (with / without watch mode) |
| `test` | Vitest: rules engine, API (in-memory database), database tests |
| `typecheck` | `tsc --noEmit` |
| `db:*` | Database scripts, see `src/db/README.md` |

## API

REST under `/api` (contract in [`shared/src/api.ts`](../shared/src/api.ts)); every error
answers `{ "error": { "code", "message" } }`.

| Method | Path | Answer |
| --- | --- | --- |
| GET | `/api/crew` | `CrewMember[]` |
| GET | `/api/mission/clock` | `MissionClock` |
| GET | `/api/metrics` | `Metric[]` |
| GET | `/api/crew/:crewId/health` | `HealthScore` |
| GET | `/api/crew/:crewId/systems/:systemId` | `SystemStatus` |
| GET | `/api/crew/:crewId/measurements?metricId=&period=` | `Measurement[]`, at most 300 points |
| GET | `/api/crew/:crewId/alerts` | `Alert[]`, most urgent first |
| POST | `/api/alerts/:alertId/acknowledge` | `Alert` |
| POST | `/api/alerts/:alertId/actions` | `AlertActionsResponse` (CHIEF) |
| POST | `/api/chief/chat` | `ChiefChatResponse` |
| POST | `/api/chief/stt` | raw audio body (`audio/webm`...) → `{ text }` |
| POST | `/api/chief/tts` | `{ text }` → `audio/wav` |

`period` is `day` (default), `week`, `month` or `mission`. `GET /health` answers
`{ "status": "ok" }` for a quick check.

Socket.IO (same port): the server emits `mission:clock` to everyone, and
`measurement:new`, `health:updated`, `alert:new` and `alert:updated` only to the clients
that sent `crew:select` with that crew member. A resolved alert is sent once more with
`acknowledged: true` and then disappears from `GET .../alerts`.

## How it works

```
src/
  server.ts          entry point: database, HTTP, Socket.IO, live loop
  app.ts             Express app (the tests use it without listening)
  config/            env (validated with zod), constants (system weights...), logger
  routes/            REST routes → thin controllers/
  middlewares/       input validation and the ApiError handler
  services/
    rules/engine.ts  rules engine: pure functions, no I/O, no AI
    health, alerts, crew, chief   services used by the controllers
    agent/client.ts  HTTP client of the Python agent
    mission-clock    read-only view of the stored mission time; every "now" comes from here
    simulator/       Héctor's simulator (docs/simulator.md): moves the clock, writes readings
    live.service     the tick loop: simulator tick → rules engine → Socket.IO
  db/                database (see its README); engine-queries.ts holds the chart
                     series and the alert updates used by the API
```

- **Rules engine.** A reading is classified by the first range of its threshold that
  contains it (min inclusive, max exclusive), otherwise `critical`. A system takes the
  worst status of its metrics and the mean of their scores (nominal 100, caution 60,
  critical 20). The health score is the weighted mean of the systems with scored metrics
  (`config/constants.ts`), and its status is the worst system status: a high score can
  still be `critical` when one system is.
- **No threshold, no status.** Metrics without a sourced threshold (`data/thresholds.ts`)
  are listed and charted but do not count for any score.
- **Alerts.** One alert per metric out of range: it is updated if its severity changes
  and deleted when the metric is back to nominal (the table has no resolved state).
  Infrequent measurements done by the crew (weekly labs, eye exams) get a `scheduled`
  reminder 6 h before they are due, resolved when the new reading arrives.
- **Mission clock.** The live simulator (`MissionSimulator`) is the only one that moves it:
  every tick (`TICK_INTERVAL_MS`, 1 s) it advances `timeScale` times faster than real time
  (600 by default: 10 minutes per second) and stores it, so a restart resumes the mission.
  The rest of the backend only reads it. With `SIMULATOR_ENABLED=false` the clock stands
  still.

## Known limitations

- Chat history is not stored: the frontend sends `history` with every message.
- Scheduled reminders are derived from the measurement cadence; there is no task table.
- Cabin CO2 is not modelled: `shared/` has no environment system.
