# CHIEF: database

SQLite database of the CHIEF backend, defined with **Drizzle ORM** (better-sqlite3 driver). It stores what the simulator "measures", the thresholds the rules engine compares against, the alerts, and the onboard formulary CHIEF may suggest from. Every table mirrors a type of [`@chief/shared`](../shared/README.md), the contract between frontend and backend.

- Schema: [`backend/src/db/schema.ts`](../backend/src/db/schema.ts). Migrations: [`backend/drizzle/`](../backend/drizzle) (generated, never edited by hand).
- Reference data (committed, with sources): [`backend/data/`](../backend/data/README.md).
- Access functions and CLI: [`backend/src/db/`](../backend/src/db/README.md).
- Owner: Héctor (Backend DB). The rules engine (Carlos) and the agent context (Óscar) read from here through `queries.ts`.

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

Rule: **no threshold without a source, and none invented by us.** [`backend/data/thresholds.ts`](../backend/data/thresholds.ts) holds 14 thresholds. How far each source was checked:

| Status | Metrics |
| --- | --- |
| **Verified** against the cited document | `vitamin-d-25-oh` (NASA JSC decision flow: deficiency < 20 ng/mL, insufficiency 20–30), `cumulative-radiation-dose` (NASA-STD-3001 Vol. 1 Rev. C, requirement V1 4030, section 4.8.2: career dose < 600 mSv) |
| **To verify** against the public guideline before the demo | heart rate (AHA), SpO2 (WHO), blood pressure (ACC/AHA 2017), urine calcium, glucose (ADA), white blood cells, C-reactive protein, optic disc edema (Frisén), intraocular pressure, sleep duration (AASM/SRS 2015), sleep efficiency (NSF 2017) |
| **Team band** | A caution band between the normal range and the critical limit that the guideline does not define: heart rate, white blood cells, optic disc edema, intraocular pressure, and the 300 mSv ("half the career limit") margin of the radiation dose. Marked `// team-band` in the file |

**Metrics without a threshold yet** (measured and charted, but the rules engine reports no status): heart rate variability, bone mineral density change, muscle strength change, reaction time, mood, stress, isolation, radiation dose rate, calorie, fluid and calcium intake. Two demo scenarios depend on this: *accelerated bone loss* and *solar storm* show up in the charts but cannot raise an alert until a sourced threshold exists (for example a bone-loss rate from the NASA Human Research Program, or a dose-rate trigger tied to the 250 mSv per-event limit of NASA-STD-3001).

## Formulary

[`backend/data/formulary.ts`](../backend/data/formulary.ts): acetaminophen 325 mg, ibuprofen 400 mg, aspirin and melatonin, taken from the NASA ISS Medical Kit Checklist and the ISS medication list released under FOIA. **No dosage is set on purpose**: CHIEF must never give doses beyond the formulary and we do not invent them. Add a dosage only with a cited source.

## Demo scenarios

Planted in the seeded history by [`backend/data/scenarios.ts`](../backend/data/scenarios.ts). They change simulated readings only; statuses come from the thresholds.

| Scenario | Crew | What happens | Expected status |
| --- | --- | --- | --- |
| Accelerated bone loss | C001 Ana Ruiz | Bone density and leg strength fall faster | no threshold yet |
| Rising kidney-stone risk | C001 Ana Ruiz | Urine calcium climbs into the 250–300 mg/day caution band | caution |
| Early SANS | C002 Leo Martín | Optic disc edema grade 1–2, eye pressure about 23 mmHg | caution |
| Vitamin D deficiency | C003 Sara Okafor | Vitamin D falls to about 16 ng/mL | critical |
| Sleep deprivation | C004 Iker Vidal | Sleep about 5.5 h, efficiency about 70 %, slower reactions | critical / caution |
| Solar storm | whole crew | Dose rate +70 µSv/h for about a day (mission day 59) | no threshold yet |

C002's career dose already starts at 280 mSv, so the cumulative dose reaches the 300 mSv caution band by day 60.

## Seed and simulator

`populateDatabase()` loads the crew, mission, metric catalog, thresholds and formulary, then generates about **26,000 measurements** (4 crew members × 25 metrics, from mission day 1 to day 60) with `services/simulator/history.ts`. It is **deterministic**: the same seed gives the same data on every machine (`--seed=7` gives another history). The value model (`services/simulator/model.ts`) is pure, so the live simulator can reuse it to keep writing readings at each metric's cadence.

## Commands

All run from the repository root (`-w backend`). Install dependencies only at the root.

```bash
npm run db:generate -w backend   # after editing schema.ts: creates a new migration in backend/drizzle
npm run db:migrate -w backend    # creates the database if needed and applies the migrations
npm run db:seed -w backend       # loads reference data and the mission history (empty database only)
npm run db:reset -w backend      # rebuilds everything from scratch and saves a clean copy
npm run db:reset -w backend -- --restore   # between demos: back to the clean copy in a second
npm test -w backend              # database tests (in-memory SQLite)
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

The health score is **not stored**: the rules engine computes it from the latest measurements and the thresholds, as `CLAUDE.md` describes.

## Open items

- **`@chief/shared` types still missing on `develop`.** `Medication` and `Alert.recommendation` are added by the agent branch (`feat/chief-agent`). Until it merges, [`backend/src/db/types.ts`](../backend/src/db/types.ts) mirrors them; delete that file afterwards and import from `@chief/shared`.
- **Verify the "to verify" thresholds** against their documents and add sourced thresholds for the metrics that have none (see above).
- **Live simulator** (mission clock ticking, readings written at each cadence, scenarios triggered on demand): the value model and history generator exist; the loop and the Socket.IO events (`measurement:new`) are still to be built.
- **NASA dataset ingestion:** OSDR Inspiration4 blood panels (`osdr.nasa.gov`) to replace the simulated lab values. Real rows must be stored with `simulated = false`.
- **Per-person radiation dose** is simulated from a shared dose rate plus each crew member's prior career dose; a personal dosimeter model would need its own offsets.
- **Dependencies:** the new `backend/package.json` and the root lockfile were updated for Drizzle and Vitest. `npm audit` reports moderate advisories in development tooling.
