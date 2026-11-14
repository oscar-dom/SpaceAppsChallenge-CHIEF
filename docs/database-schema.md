# CHIEF: database schema (SQLite, v3)

Database for the long-duration mission health monitoring project.
The definitive SQL is in [`backend/src/db/schema.sql`](../backend/src/db/schema.sql); this document explains it and **does not repeat the SQL** (so there is a single source of truth). If something does not match, `schema.sql` wins.

- Engine: SQLite with `better-sqlite3`, a single file `backend/data/chief.db` (not versioned).
- Only the backend reads and writes; the PWA uses IndexedDB as a cache and syncs through the API.
- Version 3 = Carlos's schema (aligned with the API contract) + DB improvements + fixes from the review.

## Design principles

1. **Regenerable in seconds:** `schema.sql` + `seed.sql` + `seed-simulated.js`, with a fixed seed (same data on every machine) and dates relative to "now".
2. **The API contract rules** names and `CHECK` values (see [Impact on the API contract](#impact-on-the-api-contract)).
3. **Offline-first:** `client_id UNIQUE` on tables that receive `POST` from the front end, and `synced_at` / `sync_package_id` on those that travel to the ground.
4. **The database defends itself:** date format, JSON, ranges and valid states are enforced with `CHECK`, not only in code.
5. **One writer:** the backend, through the `src/db/` layer.
6. **External data stays out of the database:** Kp, GOES protons and DONKI events live in the backend cache. Only what correlations need is stored: cabin readings (`env_readings`) and ISS position (`iss_positions`).

## Conventions

| Topic | Rule |
| --- | --- |
| Library | `better-sqlite3`. On open: `foreign_keys = ON`, `journal_mode = WAL` (done by `openDb()`) |
| Names | Plural tables, `snake_case` columns. The backend translates to camelCase in a single place |
| Keys | `INTEGER PRIMARY KEY AUTOINCREMENT` (ids are never reused); crew `C001`…`C004` (OSDR codes, enforced with `CHECK`) |
| Dates | `TEXT` `YYYY-MM-DDTHH:mm:ssZ`, UTC, **no milliseconds**. Each column has a `GLOB` `CHECK` that rejects other formats. In JS: `toDbDate()`. In SQL: `strftime('%Y-%m-%dT%H:%M:%SZ', …)` (never `datetime('now')`) |
| `from`/`to` ranges | Also pass them through `toDbDate()`: `toISOString()` adds milliseconds and breaks text comparison |
| Booleans | `INTEGER` 0/1 with `CHECK` |
| JSON | `TEXT` with `CHECK (json_valid(...))` (and `json_type = 'array'` for lists) |
| Enums | `TEXT` with `CHECK (col IN (…))` |
| Traffic light | `level`: `ok`, `watch`, `warning`, `critical`, `unknown`. Exception: `alerts.level` and `anomalies.level` only allow `watch`, `warning`, `critical` (an alert is never "ok") |
| Idempotency | `client_id TEXT UNIQUE`. Insert with `ON CONFLICT DO NOTHING` and check `changes` (not `lastInsertRowid`): see `runIdempotentInsert()` |
| Version | `PRAGMA user_version` (defined in `schema.sql`). The backend refuses to start with a database of another version |
| Regeneration | `CHECK` constraints cannot be altered in SQLite: after a schema change, `npm run db:reset` |

## Overview

```
                           ┌───────────────┐
                           │ crew_members  │
                           └───────┬───────┘
   ┌──────────────┬────────────────┼─────────────────┬──────────────┐
   ▼              ▼                ▼                 ▼              ▼
 BIOMETRICS    WELLBEING       COUNTERMEASURES        AI         PANEL / OPS
 vital_samples wellbeing_      exercise_sessions    anomalies     alerts
 lab_results    entries        countermeasures      copilot_      tasks
 sleep_sessions symptom_       medications           messages     health_scores
 cognitive_     reports        prescriptions        twin_
  tests                        medication_doses      snapshots
 nutrition_                    emergency_protocols
  entries
 medical_profiles

 SPACECRAFT / ENVIRONMENT (no crew_id)      OPERATIONS / DEMO
 env_readings · iss_positions               ops_messages · scenario_runs
```

## Tables (25 + 1 view)

### Core

| Table | What it stores | Key columns |
| --- | --- | --- |
| `crew_members` | The 4 crew members | `id`, `name`, `role`, `sex`, `birth_year`, `height_cm`, `weight_kg`, `blood_type`, `mission_start` |
| `medical_profiles` | Medical profile, 1:1 | `allergies`, `conditions` (JSON, for display), **`risk_tags`** (normalized JSON: `asthma`, `penicillin`…) |

### Biometrics and human health

| Table | What it stores | Key columns |
| --- | --- | --- |
| `vital_samples` | Vital signs, long format | `crew_id`, `metric`, `value`, `unit`, `recorded_at`, `source`, `level`, `client_id`. `UNIQUE(crew_id, metric, recorded_at)` (also serves as the index) |
| `lab_results` | Lab results (OSDR) | `panel`, `analyte_code`, `value`, `ref_low`, `ref_high`, `phase`, `sampled_at` |
| `sleep_sessions` | One row per night | `night_date` (date the night **starts**), `onset_at`, `wake_at`, minutes per stage, `efficiency_pct`. `UNIQUE(crew_id, night_date)` |
| `cognitive_tests` | PVT | `reaction_ms_mean`, `lapses`, `score` |
| `nutrition_entries` | Meals | `meal`, `kcal`, `protein_g`, `water_ml`, `sodium_mg`, `calcium_mg`, `vitamin_d_iu` |
| `health_scores` | Crew Health Score history | `score`, `level`, components `vitals`, `sleep`, `cognitive`, `nutrition`, `wellbeing`, `bone`, `radiation` (0-100) |

### Psychological wellbeing

| Table | What it stores | Key columns |
| --- | --- | --- |
| `wellbeing_entries` | Psychological diary | `mood`, `isolation`, `crew_relations`, `stress` (1-5), `note` |
| `symptom_reports` | Queryable symptoms (basis of CO₂ vs. headache) | `symptom`, `severity` (1-5), `recorded_at` |

### Artificial intelligence

| Table | What it stores | Key columns |
| --- | --- | --- |
| `anomalies` | Detected anomalies | `sample_id` (`ON DELETE SET NULL`), `metric`, `z_score`, `level`, `detected_at` |
| `copilot_messages` | Chat history | `role`, `content`, `triage_level` |
| `twin_snapshots` | Digital twin curve | `horizon_days`, `bone_density_loss_pct`, `muscle_mass_loss_pct`, `exercise_min_per_day`, `resistance_load_pct`, `model_version` |

### Countermeasures, inventory and emergencies

| Table | What it stores | Key columns |
| --- | --- | --- |
| `exercise_sessions` | Exercise sessions | `type`, `duration_min`, `load_pct`, `avg_hr_bpm` |
| `countermeasures` | Rule-triggered recommendations | `rule_code`, `action`, `alert_id`, `status` |
| `medications` | Inventory | `name` (`UNIQUE`), `stock` (`>= 0`), `min_stock`, **`avoid_with`** (JSON of risks), `expires_at` |
| **`prescriptions`** | **Dosing schedule**: what, how much, every how many hours and until when | `crew_id`, `medication_id`, `dose`, `every_h`, `start_at`, `end_at`, `active`, `prescribed_by` |
| `medication_doses` | Doses given | `medication_id`, `prescription_id` (null = one-off dose), `dose`, `given_at` |
| `emergency_protocols` | Triage guides | `code`, `title`, `disclaimer`, `steps` (JSON with `question` / `action` / `end` nodes) |

### Panel, alerts and tasks

| Table | What it stores | Key columns |
| --- | --- | --- |
| `alerts` | Crew or spacecraft alerts (`crew_id` null) | `category`, `level`, `status`, **`decision`**, `decision_at`, `scenario_run_id` |
| `tasks` | Tasks | `type`, `origin`, `alert_id`, `expects` (JSON), `status`, `result` (JSON), `client_id` |

### Spacecraft and environment

| Table | What it stores | Key columns |
| --- | --- | --- |
| `env_readings` | Cabin and dose, long format | `metric` (`ppCO2`, `ppO2`, `cabinPressure`, `cabinTemp`, `humidity`, `doseRate`), `value`, `unit`, `recorded_at`, `source`. `UNIQUE(metric, recorded_at, source)` |
| **`iss_positions`** | ISS position and SAA flag | `recorded_at`, `lat`, `lon`, `alt_km`, `in_saa` |

### Operations and demo

| Table | What it stores | Key columns |
| --- | --- | --- |
| `ops_messages` | Ground ↔ spacecraft messages and telemetry packages | `direction`, `kind`, `alert_id`, `payload` (JSON), `size_bytes`, `sent_at`, `deliver_at` (`>= sent_at`), `delivered` |
| `scenario_runs` | Demo scenarios | `code`, `started_at`, `ended_at`. Unique index: **only one active scenario** at a time |

### View `v_medication_warnings`

Matches `medical_profiles.risk_tags` with `medications.avoid_with`. Before recording a dose:

```sql
SELECT * FROM v_medication_warnings WHERE crew_id = ? AND medication_id = ?;
```

With the seed data it flags **ibuprofen for C004** (mild asthma): a drug-safety demo case.

## Sync with the ground

No generic queue. Each table that travels to the ground has `synced_at` and `sync_package_id`:
`vital_samples`, `sleep_sessions`, `cognitive_tests`, `nutrition_entries`, `wellbeing_entries`, `symptom_reports`, `health_scores`, `exercise_sessions`, `anomalies`, `alerts` and `medication_doses`.

1. **Package:** the backend takes rows with `synced_at IS NULL` (partial indexes on the highest-volume tables), prioritizes summaries (`health_scores`, `anomalies`, `alerts`) over raw vitals, creates an `ops_messages` row with `kind = 'telemetry_package'` and **at that moment** sets `synced_at` and `sync_package_id`.
2. **Why on packaging and not on delivery:** with a delay (20 min in `mars_delay`) a second package would go out with the same rows while the first is still in transit.
3. **If the ground does not acknowledge:** the backend sets `synced_at` and `sync_package_id` back to `NULL` and the rows are pending again.
4. **Resends from the PWA:** `client_id UNIQUE` prevents duplicates.
5. **Privacy:** `wellbeing_entries.note` and `copilot_messages` are sensitive data; do not include them in packages without an explicit decision.

### Time-delay triage

`alerts.status` (lifecycle: `active`, `ack`, `resolved`) and `alerts.decision` (decision with the ground) are **independent**:

| `decision` | Meaning |
| --- | --- |
| `none` | No ground decision needed |
| `pending_ground` | Waiting for the reply; there is a message in `ops_messages` (`kind = 'decision'`) |
| `ground_replied` | The ground replied and its decision was applied |
| `autonomous` | The deadline passed and the autonomous protocol was applied |

So an alert can be acknowledged by the crew member and still pending from the ground, and once resolved you know who decided.

## Main relationships

- `crew_members` 1 → N of almost every table through `crew_id`; `medical_profiles` is 1:1.
- `medications` 1 → N `prescriptions` and `medication_doses`; `prescriptions` 1 → N `medication_doses`.
- `alerts` 1 → N of `tasks`, `countermeasures` and `ops_messages`.
- `vital_samples` 1 → N `anomalies` (`sample_id`, null if the sample is pruned).
- `ops_messages` 1 → N synced rows (`sync_package_id`).
- `env_readings`, `iss_positions` and `symptom_reports` are joined by **time**, not by foreign key: e.g. `ppCO2` in the hours before each headache, or `doseRate` against `in_saa`.

## Seed and simulated data

`reset.js` runs, in this order: `schema.sql` → `seed.sql` → `seed-simulated.js`, and saves a clean copy `chief.base.db`.

- **`seed.sql`** (reference data, relative dates): 4 fictional crew members (Inspiration4 data in OSDR is anonymous and must not be tied to real people), medical profiles, 5 medications, an example prescription and 2 emergency protocols.
- **`seed-simulated.js`** (deterministic, `source = 'simulated'`, 14 days up to "now"): vitals every 10 min (7 days), sleep, cognitive tests, wellbeing, exercise, nutrition, daily blood pressure and weight, cabin environment and ISS position every 10 min, daily health score, digital twin and today's tasks. **C002**'s headaches follow 4 CO₂ spikes on purpose, so the demo shows the correlation.
- **Pending (real data):** `lab_results` from OSDR (`osdr.nasa.gov/osdr/data/osd/files/569` and `/575`), vitals from PhysioNet (`source = 'physionet'`) and cabin data from an OSDR EDA CSV. They will replace the simulated data.

| Id | Name | Role | Medical note |
| --- | --- | --- | --- |
| C001 | Ana Ruiz | Commander | No issues |
| C002 | Leo Martín | Pilot | Occasional migraine, sensitive to high CO₂ (demo protagonist) |
| C003 | Sara Okafor | Medical specialist | No issues |
| C004 | Iker Vidal | Mission specialist | Mild controlled asthma, latex allergy |

Adrenaline expires in 40 days on purpose so the inventory shows an "expires soon" warning (change it in `seed.sql`).

### Between demos

Launching a scenario leaves simulated alerts and readings in the database. With the backend stopped:

```bash
npm run db:restore    # back to the initial state in a second (copies chief.base.db)
npm run db:reset      # rebuild from scratch (new schema, new reference date)
```

## `src/db/` functions

Each function holds its SQL; the backend only calls them. They return `snake_case`; conversion to camelCase happens in a single place. `index.js` **already exists** with `openDb()`, `toDbDate()` and `runIdempotentInsert()`; the rest is still to be implemented.

| Function | Returns | Used by |
| --- | --- | --- |
| `getCrew()` | The 4 crew members | `GET /crew` |
| `getMedicalProfile(crewId)` | Medical profile | `GET /crew/:id/medical` |
| `getLatestVitals(crewId)` | Latest sample of each metric | Summary, health score |
| `getVitals(crewId, metric, from, to, bucketMin?)` | Ordered series; with `bucketMin` it aggregates in SQL (`GROUP BY strftime`) instead of returning 10,000 points | Charts |
| `insertVital(sample)` | `{ inserted, id }` | Ingestion and `POST` |
| `getLabs(crewId, phase?)` | Lab results by panel | Medical profile, baseline |
| `getSleep(crewId, days)`, `getCognitive(crewId)`, `getWellbeing(crewId)`, `getNutrition(crewId, days)` | Recent rows | Tabs |
| `insertSymptom(s)`, `getSymptoms(crewId, from, to)` | Symptoms | Diary, correlations |
| `insertAlert(a)`, `updateAlertStatus(id, status)`, `setAlertDecision(id, decision)`, `getAlerts({ crewId?, status?, decision? })` | Alerts | Right panel, time-delay triage |
| `insertTask(t)`, `completeTask(id, result)`, `getTasks(crewId, status)` | Tasks | Right panel |
| `insertAnomaly(a)`, `getAnomalies(crewId)` | Anomalies | AI |
| `insertHealthScore(s)`, `getHealthScores(crewId, from, to)`, `getLatestHealthScores()` | Traffic light and history | Crew Health Score |
| `insertTwinSnapshot(s)`, `getTwinSnapshots(crewId)` | Twin curve | Digital twin |
| `getExercise(crewId, days)` | Sessions | Twin, countermeasures |
| `insertCopilotMessage(m)`, `getCopilotHistory(crewId)` | Chat | CHIEF |
| `getInventory()`, `getPrescriptions(crewId)`, `getDoseWarnings(crewId, medicationId)` | Inventory, prescriptions and warnings | Countermeasures |
| `insertDose(d)` | Records the dose **and decrements `stock` in the same transaction** | Countermeasures |
| `getProtocols()`, `getProtocol(code)` | Protocols | Emergencies |
| `getEnvHistory(metric, from, to, bucketMin?)`, `getIssPositions(from, to)` | Cabin and ISS | Correlations |
| `getUnsynced({ limitBytes })`, `markPackaged(table, ids, packageId, at)`, `releasePackage(packageId)` | Rows pending for the ground | Packaging |
| `insertOpsMessage(m)`, `getOpsMessages()`, `markDelivered(now)` | Messages | Operations |
| `startScenario(code)`, `stopScenario()` | Active scenario | Simulator |

## Impact on the API contract

Two changes with respect to schema v2 **require updating the API contract** (or a compatibility layer in the backend):

| Change | Before (v2) | Now (v3) | Compatibility |
| --- | --- | --- | --- |
| Alert state | `status`: `active`, `ack`, `resolved`, `pending_ground`, `autonomous` | `status`: `active`, `ack`, `resolved` and `decision`: `none`, `pending_ground`, `ground_replied`, `autonomous` | The backend can keep returning the old `status`: `decision` if it is `pending_ground` or `autonomous`, otherwise `status` |
| ISS position | Metrics `issLat`, `issLon`, `inSaa` in `env_readings` | Table `iss_positions` (`lat`, `lon`, `in_saa`) | Only affects code that queried those `env_readings` metrics; the live position still comes from the cache |

New and conflict-free: tables `prescriptions` and `iss_positions`, columns `risk_tags`, `avoid_with`, `disclaimer`, `decision`, `sync_package_id`, and the view `v_medication_warnings`.

## Relationship with `CLAUDE.md`

`CLAUDE.md` plans the backend in TypeScript with Drizzle ORM (`npm run db:migrate` / `db:seed`), and a shared vocabulary (`nominal` / `caution` / `critical`, body systems, `Measurement`, `Threshold`…). This schema was designed earlier and uses raw SQL with the `ok` / `watch` / `warning` / `critical` levels. Before the backend consumes it, the team must decide:

- Whether to port the schema to Drizzle (keeping `schema.sql` as the reference for the constraints) or keep raw SQL plus `reset.js`.
- Whether to align `level` with the `shared/` status vocabulary, and where the thresholds table and the onboard formulary live (`CLAUDE.md` places them in `backend/data/`; here the formulary is `medications`).

## Changes with respect to v2

| Area | Change |
| --- | --- |
| Dates | Format `CHECK` on every date column; `wake_at > onset_at`, `deliver_at >= sent_at`… |
| Sync | `synced_at` extended from 3 to 11 tables; `sync_package_id`; set on packaging |
| Alerts | `status` and `decision` split |
| Integrity | `json_valid` on every JSON column; `stock >= 0`; `UNIQUE(name)` on medications; a single active scenario; `ON DELETE SET NULL` on `anomalies.sample_id`; `CHECK` ranges on scores and minutes; `AUTOINCREMENT` |
| Idempotency | `client_id` on `sleep_sessions`, `exercise_sessions` and `tasks` (the document said so and the SQL did not) |
| Series uniqueness | `UNIQUE(crew_id, metric, recorded_at)` on vitals and `UNIQUE(metric, recorded_at, source)` on environment |
| Indexes | Added for `cognitive_tests`, `exercise_sessions`, `wellbeing_entries`, `nutrition_entries`, `anomalies`, `medication_doses`, `copilot_messages`, `countermeasures`, `prescriptions`; no longer duplicated in this document |
| Pharmacology | `prescriptions` table, `risk_tags` / `avoid_with` and the `v_medication_warnings` view |
| Protocols | Nodes with `type` (`question`, `action`, `end`), no ambiguous endings; fictional-content `disclaimer` |
| ISS | `iss_positions` table instead of three loose metrics |
| Seed | Relative dates, fixed seed, UTF-8 loading from Node, `--restore` and the `chief.base.db` copy |
| Operations | `PRAGMA user_version` checked on startup; `.gitignore` with `*.db`, `-wal` and `-shm` |

## Open decisions

- **Per-person radiation dose:** `env_readings.doseRate` is for the spacecraft. Cumulative individual dose (which NASA tracks per astronaut) can be computed by integrating `doseRate`; if personal dosimetry is needed, add an optional `crew_id` to `env_readings`.
- **Real data:** import OSDR (`lab_results`) and PhysioNet (`vital_samples`) and decide whether they replace the simulated rows for the same crew member.
- **If volume grows:** aggregate vitals per minute (`vitals_1min`). Today it is about 20,000 rows (7 days at 10 min); at 1 min it would be ~240,000, which SQLite handles.
- **PWA sync (IndexedDB):** proposal to send the pending batch on reconnect and rely on `client_id`.
