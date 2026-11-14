# `src/services`: business logic

Everything the backend actually does. Controllers and the live loop call these services;
the services call the database (`src/db`) and the agent. They know nothing about HTTP
(no `req`/`res`): they return `@chief/shared` types and throw `src/errors` classes.

## Files

| File / folder | Class | Owns |
| --- | --- | --- |
| `index.ts` | `createServices(db, env, logger)` | wiring: builds every service below once, in dependency order, and returns `Services` |
| `mission-clock.ts` | `MissionClock` | read-only view of the simulated mission time stored in the database; `toDbTime(date)` |
| `crew.service.ts` | `CrewService` | crew members and the onboard formulary (reference data, loaded at startup) |
| `health.service.ts` | `HealthService` | reads a crew member's readings and runs the rules engine on them; chart series |
| `alerts.service.ts` | `AlertsService` | keeps the `alerts` table in line with the engine: anomalies and scheduled reminders |
| `chief.service.ts` | `ChiefService` | builds CHIEF's context, calls the agent, answers in fallback mode when it is down |
| `live.service.ts` | `LiveService` | the tick loop and Socket.IO |
| [`rules/`](rules/README.md) | pure functions | **rules engine**: statuses, system scores, health score, alert diff |
| [`agent/`](agent/README.md) | `AgentClient` | HTTP client of the Python agent |
| [`simulator/`](simulator/README.md) | `MissionSimulator` | Héctor's simulator: moves the clock and writes readings |

Database helpers used only here live in `src/db/engine-queries.ts`:
`getMeasurementSeries` (chart series bucketed in SQL), `updateAlert`, `deleteAlert`.

## How they depend on each other

```
MissionClock ◀───────────────┬──────────────┬──────────────┐
CrewService                  │              │              │
HealthService(db, clock) ────┤──▶ rules/    │              │
AlertsService(db, clock, health) ──▶ rules/ │              │
ChiefService(clock, crew, health, alerts, AgentClient)     │
LiveService(io, clock, MissionSimulator, crew, health, alerts)   ← built in server.ts
```

Each service receives what it needs in its constructor (no globals, no `process.env`), so
the tests build the same graph on an in-memory database (`src/app.test.ts`).

## `MissionClock`: every "now"

The simulator is the only one that moves the mission time (`mission.sim_time`). The rest
of the backend reads it through `clock.now()` / `clock.nowIso()` / `clock.snapshot()`,
so statuses, alert times and chart windows always match the latest readings. Times are
strings `YYYY-MM-DDTHH:mm:ssZ` without milliseconds (`toDbTime`): the database rejects
other formats.

## `HealthService`

- `evaluate(crewId)` → `{ health, findings, latest }`: the `HealthScore` for the UI, the
  inputs for anomaly detection and the latest reading of each metric.
- `system(crewId, systemId)` → one `SystemStatus`.
- `measurements(crewId, metricId, period)` → chart series ending now: `day`, `week`
  (7 d), `month` (30 d) or `mission` (since day 1), at most 300 points.
- Metrics without a sourced threshold are listed and charted but **not scored**.
- The trend of a metric looks at the last day, or at its last four readings when it is
  read less often (e.g. weekly labs).

## `AlertsService`

`sync(crewId, evaluation)` runs in one transaction and returns `{ created, updated }`:

- **Anomalies**: one open alert per metric out of range. Updated if its severity or text
  changes, deleted when the metric is back to nominal (the table has no resolved state).
  Escalation comes from the threshold; the generic advice from the thresholds table is
  stored as `recommendation` (CHIEF's fallback).
- **Scheduled reminders**: infrequent measurements done by the crew (not sensors,
  cadence ≥ 7 days) get a reminder 6 h before they are due (last reading + cadence).
  Measurements due at the same instant share one alert ("Scheduled check-up: 8
  measurements"). Resolved when the new readings arrive.
- A resolved alert is returned once in `updated` with `acknowledged: true`, so the UI can
  remove it.

Also `list`, `find` and `acknowledge` for the REST routes.

## `ChiefService`

- `chat(request)` and `alertActions(alertId)` send the agent an `AgentContext`: crew
  member, mission clock, health score, open alerts and formulary.
- If the agent fails or times out they **do not throw**: they answer with
  `fallback: true, model: null`, built from the open alerts and their `recommendation`.
- `speechToText` / `textToSpeech` have no fallback: they throw `AgentUnavailableError`
  (503) and the frontend uses the browser's Web Speech API instead.

## `LiveService`: the live loop

Every `TICK_INTERVAL_MS` (1 s):

1. `simulator.tick()` advances the clock and writes the due readings. The simulator
   emits `measurement` and `clock` events, forwarded as `measurement:new` (to the crew
   member's room) and `mission:clock` (to everyone).
2. If readings were written, every crew member is re-evaluated: `health:updated`, then
   `alert:new` / `alert:updated` for the changes of `AlertsService.sync`.

A failed tick is logged and the loop goes on (it calls `tick()` itself instead of
`simulator.start()` for that reason). On connection a client receives the clock; after
`crew:select` with a crew id it joins the room `crew:<id>` and receives that crew
member's health at once. Event types: `ServerToClientEvents` in `shared/src/api.ts`.

With `SIMULATOR_ENABLED=false` there is no loop: alerts are raised once at startup.

## Adding a service

Write the class with its dependencies in the constructor, build it in `index.ts` (or
`server.ts` if it needs Socket.IO), add it to `Services` if controllers use it, and test
it through `src/app.test.ts` or a unit test next to it.
