# CHIEF: database

SQLite database of the CHIEF backend, defined with **Drizzle ORM** (better-sqlite3 driver). It stores what the simulator "measures", the thresholds the rules engine compares against, the alerts, and the onboard formulary CHIEF may suggest from. Every table mirrors a type of [`@chief/shared`](../shared/README.md), the contract between frontend and backend.

- Schema: [`backend/src/db/schema.ts`](../backend/src/db/schema.ts). Migrations: [`backend/drizzle/`](../backend/drizzle) (generated, never edited by hand).
- Reference data (committed, with sources): [`backend/data/`](../backend/data/README.md).
- Access functions and CLI: [`backend/src/db/`](../backend/src/db/README.md).
- Owner: Héctor (Backend DB). The rules engine (Carlos) and the agent context (Óscar) read from here through `queries.ts`.
- See also: [simulator](simulator.md), [data sources](data-sources.md) and the [decision log](database-decisions.md).

## Design principles

1. **The shared contract rules.** Table, column and enum names follow `shared/` (statuses `nominal`/`caution`/`critical`, 9 body systems, alert severities `critical`/`caution`/`info`, escalation levels). The enums are imported from `@chief/shared`, so a change there reaches the `CHECK` constraints on the next migration.
2. **No threshold without a source.** A `thresholds` or `formulary` row whose `source.document` is empty is rejected by the database itself.
3. **Synthetic data is always marked.** `measurements.simulated` is `true` for everything the simulator writes; CHIEF has no real sensors.
4. **The database defends itself.** Date format, JSON columns, enums, ranges and foreign keys are checked with `CHECK` constraints and `foreign_keys = ON`, not only in code.
5. **Offline and local.** One SQLite file, no server. The demo runs on one laptop.
6. **One writer.** Only the backend writes; all SQL lives in `backend/src/db`.

## Tables

| Table | Mirrors | What it stores |
| --- | --- | --- |
| `mission` | `MissionClock` | The simulated mission (single row): start, length (180 days), `timeScale` and the current simulated time |
| `crew_members` | `CrewMember` | The 4 fictional crew members. Ids `C001`–`C004` are the anonymous OSDR Inspiration4 codes |
| `metrics` | `Metric` | Catalog of everything CHIEF measures: body system, unit, description, origin, cadence |
| `measurements` | `Measurement` | Every reading: crew member, metric, value, simulated time, `simulated` flag |
| `thresholds` | `Threshold` | One row per metric: ranges per status, escalation, fallback recommendation, **source** |
| `alerts` | `Alert` | Alerts of a crew member (`anomaly` or `scheduled`), with severity, escalation and acknowledgement |
| `formulary` | `Medication` | The onboard formulary: the only medication CHIEF may suggest |

### Conventions

| Topic | Rule |
| --- | --- |
| Dates | `TEXT` `YYYY-MM-DDTHH:mm:ssZ`, UTC, **no milliseconds**, in **simulated mission time**. A `GLOB` `CHECK` rejects other formats, so text comparison of ranges is always correct. Use `toIso()` / ISO strings without milliseconds; `toISOString()` adds them |
| Ids | Crew and metrics use text ids (`C001`, `resting-heart-rate`); `measurements` and `alerts` use autoincrement integers that the API turns into strings |
| JSON | `ranges`, `escalation` and `source` are JSON text, typed from `@chief/shared` and validated with `json_valid` |
| Booleans | `integer` 0/1 mapped to `boolean` by Drizzle |
| Uniqueness | One measurement per crew member, metric and instant (`measurements_crew_metric_time_uq`); it doubles as the index for charts and "latest value" |

### Constraints worth knowing

- `crew_members.id` must match `C###`; `mission` can only have one row (`id = 1`) and its clock cannot be before the start.
- `alerts`: an `anomaly` needs a `metric_id`; a `scheduled` alert needs a `due_at`; severity, kind, system and escalation are restricted to the shared values.
- `thresholds.source` and `formulary.source` must be valid JSON with a non-empty `document`.

## Mission clock

`mission.sim_time` is the simulated "now". The seed leaves it at **mission day 60** (12:00 UTC), so weekly, monthly and whole-mission charts already have two months of history. `getMissionClock()` returns the shared `MissionClock`; `setMissionTime()` lets the simulator advance it. `timeScale` is 600 (1 real second = 10 simulated minutes).

## Metric catalog

25 metrics in the 9 body systems (full list with descriptions in [`backend/data/metrics.ts`](../backend/data/metrics.ts)).

| System | Metrics | Origin and cadence |
| --- | --- | --- |
| cardiovascular | resting heart rate, heart rate variability, blood oxygen saturation, systolic and diastolic blood pressure | sensor hourly; blood pressure manual daily |
| musculoskeletal | bone mineral density change, muscle strength change | lab / manual weekly |
| blood-biochemistry | vitamin D (25-OH), urine calcium, fasting glucose | lab every 14 / 7 days |
| immune | white blood cell count, C-reactive protein | lab weekly |
| vision | optic disc edema grade, intraocular pressure | manual weekly |
| sleep-cognition | sleep duration, sleep efficiency, mean reaction time | sensor / in-app test daily |
| behavioral-health | mood, stress, isolation | in-app survey daily |
| radiation | dose rate, cumulative dose | sensor hourly / daily |
| nutrition | calorie, fluid and calcium intake | manual daily |

The cumulative radiation dose is the career dose of previous flights (fictional values) plus the integral of the simulated dose rate.

## Thresholds and their sources

Rule: **no threshold without a source, and none invented by us.** [`backend/data/thresholds.ts`](../backend/data/thresholds.ts) holds **17 thresholds**; each entry carries its source and a `verification` field.

| Verification | Metrics and source |
| --- | --- |
| **Verified** (cut-offs found in the document or in several sources quoting it) | heart rate 60–100 bpm (AHA); blood pressure (2017 ACC/AHA: normal < 120/80, stage 2 ≥ 140/90); vitamin D (NASA JSC: deficiency < 20 ng/mL, insufficiency 20–30); urine calcium (hypercalciuria review, PubMed 28846247: > 250 mg/day women, 275–300 men); white blood cells (reference interval of the Inspiration4 lab in NASA OSDR: 3.8–10.8 ×10³/µL); intraocular pressure (normal 10–21 mmHg); sleep duration (AASM/SRS 2015: 7 h or more); career radiation dose (NASA-STD-3001 Vol. 1 Rev. C, V1 4030, section 4.8.2: < 600 mSv); calcium intake and fluid intake (NASA JSC-67378 Rev. 1: calcium 1000–1200 mg/day, max 2500; fluid ≥ 2100 mL/day women, ≥ 2500 men); SpO2 (WHO pulse oximetry manual: ≥ 95 %, < 90 % emergency); bone mineral density (NASA-STD-3001 Vol. 1 Rev. C, V1 4027: hip/spine ≥ 95 %, femoral neck ≥ 90 % of pre-mission); glucose (ADA: prediabetes 100–125, diabetes ≥ 126, hypoglycemia level 1 < 70, level 2 < 54 mg/dL); C-reactive protein (CDC/AHA 2003: > 3 mg/L high risk, persistent > 10 mg/L look for another cause); optic disc edema (Frisén 1982 grades 0–5); sleep efficiency (NSF 2017, adults: ≥ 85 % good, ≤ 74 % not good) |
| **Team band** | A caution band between the normal range and the critical limit that the source does not define, marked `// team-band`: heart rate, white blood cells, optic disc edema (which Frisén grades are caution or critical), intraocular pressure, sleep duration, calcium and fluid intake, and the 300 mSv ("half the career limit") margin of the radiation dose. The normal range always comes from the source |

The fluid threshold uses the lower floor (2100 mL/day, women) because a threshold has no sex dimension; men need 2500 mL/day, which the rules engine could personalize later.

**Metrics without a threshold** (measured and charted, but the rules engine reports no status), on purpose:

- heart rate variability: it only makes sense against each person's own baseline;
- muscle strength change, reaction time, mood, stress and isolation: no clinical cut-offs exist for these measures or self-reports;
- radiation dose rate: NASA limits apply to accumulated dose, not to the rate. The *solar storm* scenario therefore shows up in the dose-rate chart and in the cumulative dose, but does not raise a dose alert by itself. Its alert should come from space weather: NOAA's solar radiation storm scale starts at S1 when protons ≥ 10 MeV reach 10 pfu, and the DONKI events in `backend/data/datasets/` mark those onsets (a rule for the rules engine);
- calorie intake: NASA sets energy needs per person with the DRI equations.

## Formulary

[`backend/data/formulary.ts`](../backend/data/formulary.ts): acetaminophen 325 mg, ibuprofen 400 mg, aspirin and melatonin, taken from the NASA ISS Medical Kit Checklist and the ISS medication list released under FOIA. **No dosage is set on purpose**: CHIEF must never give doses beyond the formulary and we do not invent them. Add a dosage only with a cited source.

## Demo scenarios

Planted in the seeded history by [`backend/data/scenarios.ts`](../backend/data/scenarios.ts). They change simulated readings only; statuses come from the thresholds.

| Scenario | Crew | What happens | Expected status |
| --- | --- | --- | --- |
| Accelerated bone loss | C001 Ana Ruiz | Bone density falls past −5 % of the pre-mission value; leg strength falls faster | caution |
| Rising kidney-stone risk | C001 Ana Ruiz | Urine calcium climbs into the 250–300 mg/day caution band | caution |
| Early SANS | C002 Leo Martín | Optic disc edema grade 1–2, eye pressure about 23 mmHg | caution |
| Vitamin D deficiency | C003 Sara Okafor | Vitamin D falls to about 16 ng/mL | critical |
| Sleep deprivation | C004 Iker Vidal | Sleep about 5.5 h, efficiency about 67 %, slower reactions | critical |
| Solar storm | whole crew | Replays the proton events of the May 2024 storm (NASA DONKI), days 56–59: the dose rate jumps and fades | no dose-rate threshold (see above) |

C002's career dose already starts at 280 mSv, so the cumulative dose reaches the 300 mSv caution band by day 60.

## Real NASA data

Processed by `npm run data:fetch -w backend` into `backend/data/datasets/` and committed, so the demo works offline. Each file keeps its source and retrieval date.

| Dataset | What CHIEF uses | How |
| --- | --- | --- |
| **NASA OSDR**, Inspiration4 crew: OSD-569 (complete blood count) and OSD-575 (comprehensive metabolic panel) | White blood cell count and glucose of C001–C004 at 7 timepoints (L-92, L-44, L-3, R+1, R+45, R+82, R+194) | The 3 **preflight** values are stored as **real readings** (`simulated = false`), placed the same number of days before this mission's start. Their mean is the **baseline** the simulator starts from for each crew member |
| **NASA DONKI**, May 2024 solar storm | Onsets of the GOES >10 MeV and >100 MeV proton events (10, 11 and 13 May 2024) and the Kp index of the geomagnetic storms | The *solar storm* scenario replays the real timing of the proton events; the size of the dose-rate increase on board (+40 / +80 µSv/h, fading over about 10 h) is a simulated assumption |

Notes:

- Inspiration4 flew for 3 days, so OSDR has no 6-month in-flight data: the evolution during the mission stays simulated.
- The OSDR crew codes match ours (C001–C004), but the names, roles and sexes of our crew are fictional.
- OSD-575 also has a C-reactive protein value, from a research multiplex panel (Eve Technologies). It is not used: it is not comparable to the clinical CRP threshold.
- The OSDR metabolic panel is not labelled as fasting; it is stored under `fasting-glucose` as the closest metric.
- DONKI needs `NASA_API_KEY` (free at api.nasa.gov) in `backend/.env`; without it the script uses `DEMO_KEY`, which is rate limited.

## Seed and simulator

`populateDatabase()` loads the crew, mission, metric catalog, thresholds and formulary, the **24 real OSDR preflight readings**, and about **26,000 simulated measurements** (4 crew members × 25 metrics, from mission day 1 to day 60) generated by `services/simulator/history.ts`. It is **deterministic**: the same seed gives the same data on every machine (`--seed=7` gives another history).

### Live simulator

`services/simulator/live.ts` (`MissionSimulator`) keeps the mission going after the seed:

- Each tick advances `mission.sim_time` by the real time elapsed × `timeScale` (600 by default: 1 real second = 10 simulated minutes) and stops at the end of the mission (day 180).
- It writes every reading that falls due in that interval, at each metric's cadence (`schedule.ts`): hourly sensors on the hour, daily metrics at their hour, weekly and fortnightly labs staggered by crew member. The cumulative radiation dose adds up the dose-rate readings.
- A reading's value depends only on the seed, crew member, metric and instant (`model.ts`), so the live readings continue the seeded history exactly, however time is split into ticks.
- `triggerScenario('solar-storm')` replays the DONKI storm starting at the current simulated time.
- It emits `measurement`, `clock`, `scenario` and `end` events and knows nothing about HTTP: the backend forwards them to Socket.IO (`measurement:new`, `mission:clock`).

```ts
const simulator = new MissionSimulator(db);
simulator.on('measurement', (m) => io.emit('measurement:new', m));
simulator.on('clock', (clock) => io.emit('mission:clock', clock));
simulator.start();
```

`npm run simulate -w backend -- --speed=3600 --scenario=solar-storm` runs it on its own and logs what it writes.

## Commands

All run from the repository root (`-w backend`). Install dependencies only at the root.

```bash
npm run db:generate -w backend   # after editing schema.ts: creates a new migration in backend/drizzle
npm run db:migrate -w backend    # creates the database if needed and applies the migrations
npm run db:seed -w backend       # loads reference data and the mission history (empty database only)
npm run db:reset -w backend      # rebuilds everything from scratch and saves a clean copy
npm run db:reset -w backend -- --restore   # between demos: back to the clean copy in a second
npm run data:fetch -w backend    # refresh the NASA datasets in backend/data/datasets (needs internet)
npm run simulate -w backend      # run the live simulator on its own
npm test -w backend              # database and simulator tests (in-memory SQLite)
```

The database file is `backend/var/chief.db` (git-ignored); `CHIEF_DB_PATH` points to another file.

## Access functions (`backend/src/db/queries.ts`)

They return `@chief/shared` types, so controllers and the rules engine never see table rows.

| Function | Returns | Used by |
| --- | --- | --- |
| `getCrew(db)` | `CrewMember[]` | `GET /api/crew` |
| `getMissionClock(db)`, `setMissionTime(db, iso)` | `MissionClock` | `GET /api/mission/clock`, simulator |
| `getMetrics(db)` | `Metric[]` | `GET /api/metrics` |
| `getThresholds(db)` | `Threshold[]` | rules engine |
| `getMeasurements(db, { crewId, metricId, from?, to? })` | `Measurement[]`, oldest first | `GET /api/crew/:id/measurements` |
| `getLatestMeasurements(db, crewId)` | latest reading of every metric | rules engine, health score |
| `insertMeasurement(db, m)` | `{ inserted, id }` (a repeat is ignored) | simulator |
| `getAlerts(db, crewId)`, `getAlert`, `insertAlert`, `acknowledgeAlert` | `Alert[]`, most urgent first | `GET /api/crew/:id/alerts`, `POST /api/alerts/:id/acknowledge` |
| `getFormulary(db)` | `Medication[]` | agent context |
| `getLatestMeasurementBefore`, `sumMeasurementValues` | helpers for the cumulative radiation dose | simulator |

The health score is **not stored**: the rules engine computes it from the latest measurements and the thresholds, as `CLAUDE.md` describes.

## Open items

- **Solar-storm alert:** decide with Carlos the space-weather rule (NOAA S1) that should raise it. Every threshold is verified (see [data sources](data-sources.md#thresholds)).
- **Wire the live simulator to the API:** the backend (Express + Socket.IO) has to create the `MissionSimulator`, forward its events and expose a way to launch the solar storm during the demo.
- **More NASA data:** only white blood cells and glucose come from OSDR. Other Inspiration4 panels (hemoglobin, electrolytes, cytokines) could feed new metrics once they have sourced thresholds.
- **Per-person radiation dose** is simulated from a shared dose rate plus each crew member's prior career dose; a personal dosimeter model would need its own offsets.
- **Dependencies:** the new `backend/package.json` and the root lockfile were updated for Drizzle and Vitest. `npm audit` reports moderate advisories in development tooling.
