# `src/services/simulator`: mission simulator

Héctor's area. The full documentation (model, schedule, scenarios, parameters) is in
[`docs/simulator.md`](../../../../docs/simulator.md); this file only explains how the
rest of the backend uses it.

| File | Used by the API? |
| --- | --- |
| `live.ts` (`MissionSimulator`) | yes: `server.ts` builds it, `LiveService` ticks it |
| `model.ts`, `schedule.ts`, `random.ts` | indirectly, through `live.ts` and `history.ts` |
| `history.ts` | no: seed only (`npm run db:seed` / `db:reset`) |
| `cli.ts` | no: `npm run simulate -w backend` runs the simulator alone |

## The contract with the backend

- **The simulator owns the mission clock.** Each `tick()` advances it by the real time
  elapsed × `timeScale` and stores it in `mission.sim_time`. `MissionClock`
  (`../mission-clock.ts`) only reads it.
- `tick()` returns `{ inserted, missionTime }` and emits, after its transaction:
  `measurement` (each new `Measurement`), `clock` (`MissionClock`), `end` (day 180).
- `LiveService` calls `tick()` on its own interval (not `start()`), so a failed tick is
  logged instead of crashing the server, and forwards the events over Socket.IO.
- `triggerScenario('solar-storm')` launches a live scenario. It is not exposed through the
  API yet.

Options used by the backend: `new MissionSimulator(db, { timeScale: env.TIME_SCALE })`.
The tests pass `{ timeScale: 1, now: () => fakeMs }` to move time by hand
(`advance()` in `src/app.test.ts`).
