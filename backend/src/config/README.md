# `src/config`: configuration

Everything the backend can be tuned with, in one place: environment variables, fixed
constants of the rules engine and the logger. Nothing here does I/O except reading
`process.env` once at startup.

| File | What it holds |
| --- | --- |
| `env.ts` | `loadEnv()`: reads `backend/.env` (optional, via dotenv) and validates every variable with zod. Exports the `Env` type |
| `constants.ts` | Values that are decisions, not settings: status scores, system weights, trend sensitivity, chart size |
| `logger.ts` | `createLogger(env)`: pino logger; pretty output in development, silent in tests |

## Environment variables (`env.ts`)

Every variable has a default that works for local development, so `.env` is only needed
to change one. The list with comments is in [`backend/.env.example`](../../.env.example).

| Variable | Default | Used by |
| --- | --- | --- |
| `NODE_ENV` | `development` | logger (`test` silences it) |
| `PORT` | `3000` | `server.ts` (HTTP + Socket.IO on the same port) |
| `CORS_ORIGIN` | `http://localhost:5173` | `app.ts` (CORS) and `server.ts` (Socket.IO) |
| `LOG_LEVEL` | `info` | logger |
| `AGENT_URL` | `http://localhost:8000` | `services/agent/client.ts` |
| `AGENT_TIMEOUT_MS` | `20000` | agent client: a slower answer counts as "agent down" |
| `TIME_SCALE` | mission's own (600) | simulator and `MissionClock`: simulated seconds per real second |
| `TICK_INTERVAL_MS` | `1000` | `services/live.service.ts`: real time between ticks |
| `SIMULATOR_ENABLED` | `true` | `false` serves the database as it is; the clock stands still |

`CHIEF_DB_PATH` and `NASA_API_KEY` are read by the database layer and the data scripts
(Héctor's area), not by `env.ts`.

An invalid value stops the server at startup with a clear message (`Invalid environment
variables: PORT: ...`) instead of failing later.

## Constants (`constants.ts`)

| Constant | Value | Meaning |
| --- | --- | --- |
| `STATUS_SCORE` | nominal 100, caution 60, critical 20 | score of one metric, averaged into the system score |
| `STATUS_RANK` | nominal < caution < critical | order used to pick the worst status |
| `SYSTEM_WEIGHTS` | cardiovascular 0.2, sleep-cognition 0.15, immune 0.05, the rest 0.1 | weight of each body system in the health score. Normalized over the systems with data, so they need not add up to 1 |
| `TREND_MIN_CHANGE` | 0.03 | a change under 3 % between the first and last third of a series is `stable` |
| `MAX_SERIES_POINTS` | 300 | most points a chart receives; longer series are averaged in SQL |
| `MISSION_LENGTH_DAYS` | 180 | planned mission length |
| `CREW_AGENCY` | `NASA` | the seed has no agency column |

These are product decisions: changing one changes every score in the UI. The rules engine
tests (`services/rules/engine.test.ts`) pin their effect.

## Adding a variable

1. Add it to the zod schema in `env.ts` with a default (or `.optional()`).
2. Add it, commented and without a real value, to `backend/.env.example`.
3. Pass it to the service that needs it from `server.ts` or `services/index.ts`; services
   never read `process.env` themselves (this keeps them testable).

Secrets (API keys) never get a default and never go in `.env.example` with a value.
