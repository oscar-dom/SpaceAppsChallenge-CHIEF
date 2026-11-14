# CHIEF: mission simulator

CHIEF has no real sensors, so a simulator "measures" every crew member. It writes readings to SQLite at each metric's cadence; the rules engine turns them into statuses and alerts. This document explains how the values are produced, the demo scenarios, and how to use the simulator from the backend.

Code: [`backend/src/services/simulator/`](../backend/src/services/simulator). Parameters: [`backend/data/simulation.ts`](../backend/data/simulation.ts) and [`backend/data/scenarios.ts`](../backend/data/scenarios.ts). Related: [database](database-schema.md), [data sources](data-sources.md), [decision log](database-decisions.md).

## Overview

```
backend/data/                        backend/src/services/simulator/
  metrics.ts      what is measured  ─┐
  simulation.ts   baselines, noise  ─┼─▶ model.ts     value of one reading (pure, deterministic)
  scenarios.ts    planted cases     ─┤   schedule.ts  when each metric is read
  datasets/       real NASA data    ─┘   history.ts   mission history for the seed (day 1 to 60)
                                         live.ts      MissionSimulator: keeps the mission going
                                         cli.ts       npm run simulate -w backend
```

Two ways of producing readings share the same model:

1. **History** (`history.ts`), used by `npm run db:seed` / `db:reset`: from mission day 1 to the demo day, so weekly, monthly and whole-mission charts have data from the first second.
2. **Live** (`live.ts`), used while the backend runs: advances the mission clock and writes the readings that fall due.

Because a reading's value depends only on its inputs, the live simulator continues the seeded history exactly.

## Mission clock

| Setting | Value | Where |
| --- | --- | --- |
| Start | 2026-09-01 00:00 UTC | `backend/data/crew.ts` (`MISSION`) |
| Length | 180 days (a 6-month ISS increment) | same |
| Demo day | the seed stops at mission day 60, 12:00 UTC (`2026-10-30T12:00:00Z`) | same |
| Time scale | 600 simulated seconds per real second (1 real second = 10 simulated minutes) | same; overridable |

The clock lives in the database (`mission.sim_time`), so it survives restarts. It only moves while the simulator ticks: time the backend is stopped does not count. `getMissionClock()` returns the shared `MissionClock` (mission day is 1-based).

## When metrics are read (`schedule.ts`)

Readings sit on a fixed grid from the mission start:

- **Cadence under a day** (hourly sensors: heart rate, heart rate variability, SpO2, dose rate): every `cadenceMinutes`, on the hour.
- **Daily or slower**: once on each reading day at the metric's `atHour` (UTC). Metrics read every 7 or 14 days are **staggered by crew member** (`(day + crewIndex) % period`), so the four crew members are not measured on the same day.

| Hour (UTC) | Daily readings |
| --- | --- |
| 07:00 | sleep duration, sleep efficiency (last night) |
| 08:00 | systolic and diastolic blood pressure |
| 09:00 | weekly / fortnightly labs and exams (bone density, muscle strength, vitamin D, urine calcium, glucose, white blood cells, CRP, optic disc, eye pressure) |
| 10:00 | reaction time test |
| 20:00 | calorie, fluid and calcium intake |
| 21:00 | mood, stress, isolation survey |
| 23:00 | cumulative radiation dose |

## How a value is produced (`model.ts`)

```
value = base + perCrew[crew] + trendPerDay × day + daily cycle + scenario effects + noise
```

then clamped to `[min, max]` and rounded to `precision` decimals.

- `day` is days since the mission start (fractional); the daily cycle is `amp × cos(2π (hour − peakHour) / 24)`.
- **Real baselines:** for white blood cell count and glucose, `base` is the mean of the crew member's real Inspiration4 preflight values (NASA OSDR) and `perCrew` is ignored.
- **Noise** is Gaussian (Box-Muller) from a pseudo-random generator (mulberry32) seeded with a hash (FNV-1a) of `seed | crewId | metricId | time`. One independent stream per reading means:
  - the same seed gives the same data on every machine;
  - the value does not depend on how time is split into ticks, so live readings continue the history exactly.
- The default seed is 42 (`--seed=7` on `db:seed` / `db:reset` gives another history).

### Parameters

All values are simulated, not sourced (see [data sources](data-sources.md#simulated-values-and-assumptions)). `perCrew` is in crew order C001, C002, C003, C004.

| Metric | Base | Per crew | Noise (sd) | Trend / day | Other |
| --- | --- | --- | --- | --- | --- |
| Resting heart rate (bpm) | 62 | 0, +3, −2, +5 | 2.5 | — | daily cycle ±3, peak 15:00; min 40 |
| Heart rate variability (ms) | 62 | 0, −6, +5, −3 | 6 | — | min 10 |
| Blood oxygen saturation (%) | 97.5 | — | 0.5 | — | 85–100 |
| Systolic BP (mmHg) | 114 | 0, +6, −4, +3 | 4 | — | |
| Diastolic BP (mmHg) | 72 | 0, +4, −3, +2 | 3 | — | |
| Bone mineral density change (%) | 0 | — | 0.25 | −0.035 | about −1 %/month |
| Muscle strength change (%) | 0 | — | 1.2 | −0.06 | |
| Vitamin D (ng/mL) | 34 | 0, −2, +3, −1 | 1.5 | −0.03 | |
| Urine calcium (mg/day) | 190 | 0, +10, −15, +20 | 12 | — | min 20 |
| Fasting glucose (mg/dL) | OSDR baseline | — | 4 | — | |
| White blood cell count (×10³/µL) | OSDR baseline | — | 0.6 | — | min 2 |
| C-reactive protein (mg/L) | 1.2 | — | 0.5 | — | min 0.1 |
| Optic disc edema grade | 0 | — | 0 | — | 0–5, integer |
| Intraocular pressure (mmHg) | 15 | 0, +1, −1, +0.5 | 1.1 | — | integer |
| Sleep duration (h) | 7.5 | 0, −0.2, +0.2, −0.3 | 0.45 | — | 3–10 |
| Sleep efficiency (%) | 91 | — | 2.5 | — | 40–100 |
| Reaction time (ms) | 265 | 0, +5, −5, +8 | 18 | — | min 150 |
| Mood / stress (1–5) | 4 / 2 | — | 0.6 | — | integer, 1–5 |
| Isolation (1–5) | 2 | — | 0.5 | +0.012 | integer, 1–5 |
| Radiation dose rate (µSv/h) | 18 | — | 2.5 | — | min 5 |
| Calorie intake (kcal/day) | 2600 | — | 180 | — | min 800 |
| Fluid intake (mL/day) | 2650 | — | 200 | — | min 500 |
| Calcium intake (mg/day) | 1150 | — | 100 | — | min 200 |

### Cumulative radiation dose

The career dose is not sampled: it is the crew member's dose from previous flights (fictional: C001 120, C002 280, C003 45, C004 90 mSv) plus the sum of the hourly dose-rate readings (µSv/h × 1 h ÷ 1000 = mSv). Live, each daily reading adds the dose-rate readings since the previous one. At about 18 µSv/h the dose grows by about 0.43 mSv/day.

## Demo scenarios (`scenarios.ts`)

Synthetic cases planted on specific crew members so alerts fire and CHIEF has something to explain, as `CLAUDE.md` asks. They change simulated readings only; the status always comes from the thresholds.

Effect kinds (days since the mission start):

- `ramp`: grows linearly from 0 at `fromDay` to `amount` at the demo day (59.5) and then stays constant;
- `window`: adds `amount` between `fromDay` and `toDay`;
- `decay`: jumps by `amount` at `fromDay` and fades exponentially (`tauHours`).

| Scenario | Crew | Effects | Value at day 60 | Status |
| --- | --- | --- | --- | --- |
| `accelerated-bone-loss` | C001 Ana Ruiz | bone density −3.5 %, muscle strength −8 % (ramps from day 20) | bone density about −5.4 % | caution |
| `kidney-stone-risk` | C001 Ana Ruiz | urine calcium +110 mg/day (ramp from day 25) | about 270 mg/day | caution |
| `early-sans` | C002 Leo Martín | optic disc edema +2.2 grades, eye pressure +8 mmHg (ramps from day 30) | grade 2, about 22 mmHg | caution |
| `vitamin-d-deficiency` | C003 Sara Okafor | vitamin D −22 ng/mL (ramp from day 1) | about 16 ng/mL | critical |
| `sleep-deprivation` | C004 Iker Vidal | sleep −2 h, efficiency −22 %, reaction time +75 ms, mood −1.2, stress +1.5 (ramps from day 44) | sleep about 5.6 h, efficiency about 67 %, reaction about 370 ms | critical (sleep), caution (efficiency) |
| `solar-storm` | whole crew | dose rate +40 µSv/h (>10 MeV onset) or +80 µSv/h (>100 MeV), 10 h decay, at the real offsets of the May 2024 storm (NASA DONKI) | first onset at day 56.3 in the history | no dose-rate threshold: see below |

C002's prior career dose (280 mSv) also puts the cumulative dose in the 300–600 mSv caution band by day 60. The tests check that every planted case leaves the nominal range and that the healthy crew members stay nominal.

**Solar storm:** NASA limits accumulated dose, not the dose rate, so the storm shows in the charts and the cumulative dose but does not raise a dose alert. The proposal is a space-weather rule in the rules engine (NOAA S1: protons ≥ 10 MeV at 10 pfu), see [data sources](data-sources.md#thresholds).

## Live simulator (`live.ts`)

```ts
import { MissionSimulator } from './services/simulator/live.js';

const simulator = new MissionSimulator(db); // options: { seed, tickMs, timeScale, now }
simulator.on('measurement', (m) => io.emit('measurement:new', m));
simulator.on('clock', (clock) => io.emit('mission:clock', clock));
simulator.on('end', () => console.log('Mission complete'));
simulator.start();

// During the demo:
simulator.triggerScenario('solar-storm');
```

| Member | What it does |
| --- | --- |
| `start()` / `stop()` / `running` | Ticks every `tickMs` (default 1000 ms) |
| `tick()` | Advances the clock by the real time elapsed × time scale, writes the due readings in one transaction, updates `mission.sim_time` and emits the events. Returns `{ inserted, missionTime }` |
| `triggerScenario(code)` | Launches a live scenario from the current simulated time. Available: `solar-storm` (`LIVE_SCENARIOS`) |
| `measurement` event | A new reading (`Measurement` from `@chief/shared`), after the transaction commits |
| `clock` event | The new `MissionClock` |
| `scenario` event | A live scenario was launched |
| `end` event | Day 180 reached; the simulator stops |

The simulator knows nothing about HTTP or Socket.IO; the backend owns the wiring. Repeated readings are ignored by the database (unique crew + metric + time), so ticking twice over the same instant is harmless.

### Running it on its own

```bash
npm run simulate -w backend -- --speed=3600 --scenario=solar-storm
```

`--speed` overrides the time scale, `--tick` the real milliseconds between ticks, `--scenario` launches a live scenario at start. It logs the clock and the first readings; stop it with Ctrl+C. Run `npm run db:reset -w backend` first.

## Tests

`npm test -w backend` runs Vitest on in-memory databases:

- `src/db/db.test.ts`: seed contents, determinism, real vs simulated readings, scenarios, queries, database constraints, and thresholds against the demo scenarios (no overlapping ranges, planted cases leave nominal, healthy crew stays nominal).
- `src/services/simulator/simulator.test.ts`: reading schedule, scenario effects, live ticks (readings, events, clock), same values for any tick split, cumulative dose, live solar storm, OSDR baselines and end of mission.

## Extending

- **New metric:** add it to `metrics.ts` (id, system, unit, origin, cadence) and its parameters to `simulation.ts`; add a threshold to `thresholds.ts` only with a source. No migration is needed (metrics are rows). Then `npm run db:reset -w backend`.
- **New planted scenario:** add an entry to `SCENARIOS` in `scenarios.ts` with its effects, and a test that it leaves the nominal range.
- **New live scenario:** add a builder to `LIVE_SCENARIOS` that returns the effects starting at the current day.
- **New real data:** extend `scripts/fetch-nasa-data.ts`, commit the processed file in `data/datasets/` with its source, and store real readings with `simulated = false`.

## Limitations

- Values are plausible but simulated; only the OSDR preflight readings are real.
- The dose rate is the same model for the whole crew (no personal dosimetry or shielding differences).
- Scenarios are fixed in the seed; only the solar storm can be launched live.
- The clock does not advance while the backend is stopped, by design.
