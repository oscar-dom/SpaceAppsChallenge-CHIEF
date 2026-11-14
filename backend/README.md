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
| GET | `/api/thresholds` | `Threshold[]`: ranges, escalation and source of every scored metric |
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

## Where things are

Each folder has its own README with its files, formats and connections. Start there
before changing a part (and point your AI assistant to it).

| Folder | What it is | Owner |
| --- | --- | --- |
| `src/server.ts` | entry point: database, HTTP, Socket.IO, live loop | Carlos |
| `src/app.ts` | Express app without listening (the tests use it directly) | Carlos |
| [`src/config/`](src/config/README.md) | environment variables, rules engine constants, logger | Carlos |
| [`src/routes/`](src/routes/README.md) | REST routes and request formats | Carlos |
| [`src/controllers/`](src/controllers/README.md) | thin handlers: validate, call a service, answer | Carlos |
| [`src/middlewares/`](src/middlewares/README.md) | input validation and the `ApiError` handler | Carlos |
| [`src/errors/`](src/errors/README.md) | error classes and the codes the client sees | Carlos |
| [`src/services/`](src/services/README.md) | business logic: health, alerts, CHIEF, mission clock, live loop | Carlos |
| [`src/services/rules/`](src/services/rules/README.md) | **rules engine**: statuses, scores, alerts | Carlos |
| [`src/services/agent/`](src/services/agent/README.md) | HTTP client of the Python agent | Carlos |
| [`src/services/simulator/`](src/services/simulator/README.md) | mission simulator (full docs: [`docs/simulator.md`](../docs/simulator.md)) | Héctor |
| [`src/db/`](src/db/README.md) | Drizzle schema, migrations, queries (`engine-queries.ts`: the API's chart and alert queries) | Héctor |
| [`data/`](data/README.md) | metrics, thresholds with sources, formulary, scenarios, NASA datasets | Héctor |
| `scripts/` | `fetch-nasa-data.ts` (`npm run data:fetch`) | Héctor |

```
request ─▶ routes ─▶ controllers ─▶ services ─▶ rules engine (pure)
                                       │   └──▶ db ─▶ SQLite
                                       └──────▶ agent client ─▶ Python agent
tick ─▶ simulator ─▶ SQLite ─▶ services (re-evaluate) ─▶ Socket.IO ─▶ frontend
```

Key rules, explained in each README: the rules engine decides every status (CHIEF only
explains it); metrics without a sourced threshold are charted but not scored; the
simulator is the only one that moves the mission clock; CHIEF chat never fails, it
answers in fallback mode when the agent is down.

## Known limitations

- Chat history is not stored: the frontend sends `history` with every message.
- Scheduled reminders are derived from the measurement cadence; there is no task table.
- Cabin CO2 is not modelled: `shared/` has no environment system.
