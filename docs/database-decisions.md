# CHIEF: database and data decision log

Why the database, the simulator and the data look the way they do. Newest decisions last. Owner: Héctor (Backend DB). For the current design see [database](database-schema.md), [simulator](simulator.md) and [data sources](data-sources.md).

## Timeline

| Step | Pull request | Result |
| --- | --- | --- |
| 1 | — | Engine chosen: SQLite with Node.js |
| 2 | #8 `feat: add sqlite schema, seed and reset tooling` | First schema: raw SQL v3 (25 tables), merged into `develop` |
| 3 | #8 (follow-up commit) | Tooling converted to ES modules: the root `package.json` sets `"type": "module"` and CI lints and formats JavaScript |
| 4 | #10 `feat: rebuild database on drizzle and the shared contract` | Schema rebuilt on Drizzle and `@chief/shared`; previous SQL removed |
| 5 | #13 `feat: add live simulator and real nasa data` | Live simulator, NASA OSDR and DONKI datasets |
| 6 | `feat: verify threshold sources and add sourced thresholds` | Threshold sources checked; sourced thresholds for bone, calcium and fluid |

## D1. SQLite as the engine

**Decision:** one SQLite file, accessed only by the backend through better-sqlite3.

**Why:** the demo runs on one laptop with no server, and an onboard health system must work offline (`CLAUDE.md`). Options weighed at the start: PostgreSQL (+TimescaleDB) needs a server; CouchDB/PouchDB syncs well but queries and correlations are awkward; MongoDB and Firebase need a server or the internet. SQLite gives SQL, joins and constraints with no setup for a 4-person team.

## D2. The first schema did not match the project (PR #8)

**What happened:** a first design was drafted from the original use-case list (offline-first PWA, ground-control messaging with communication delay, ISS position, prescriptions, emergency protocols). It was merged with a design from the API side into a raw SQL schema v3 (25 tables) and reviewed for bugs (date formats, sync semantics, alert states, JSON validation, missing indexes). That review fixed real problems: dates with milliseconds breaking text comparisons, duplicate rows on telemetry packaging, `lastInsertRowid` being unreliable after ignored inserts.

**Why it was replaced:** reading `CLAUDE.md` and `shared/` afterwards showed the schema diverged from the agreed project:

- the stack is TypeScript + **Drizzle ORM**, not raw SQL and JavaScript;
- statuses are `nominal` / `caution` / `critical`, not `ok` / `watch` / `warning`;
- the contract is built on `Metric`, `Measurement` and `Threshold`, which had no tables;
- there was no thresholds table with sources, which `CLAUDE.md` requires;
- about half the tables (ground messaging, sync columns, ISS position, prescriptions, protocols) belonged to a scope `CLAUDE.md` does not include.

## D3. Rebuild on Drizzle and the shared contract (PR #10)

**Decision:** seven tables that mirror shared types: `mission` (`MissionClock`), `crew_members` (`CrewMember`), `metrics` (`Metric`), `measurements` (`Measurement`), `thresholds` (`Threshold`), `alerts` (`Alert`), `formulary` (`Medication`).

**Consequences:**

- Enums in `CHECK` constraints are imported from `@chief/shared`, so a contract change reaches the database on the next migration.
- The database itself rejects a threshold or formulary item without a source, malformed dates, incomplete alerts and invalid enums; foreign keys are on.
- The **health score is not stored**: the rules engine computes it from the latest readings and the thresholds, as `CLAUDE.md` describes.
- Removed scope: ground messaging and communication delay, telemetry sync columns, ISS position, prescriptions, emergency protocols, chat history, separate tables per measurement kind.
- `backend/package.json`, `tsconfig.json`, the Drizzle config and the first migration were added; scripts `db:generate`, `db:migrate`, `db:seed`, `db:reset`.

## D4. Simulated time with fixed dates

**Decision:** dates in the database are simulated mission time, `YYYY-MM-DDTHH:mm:ssZ` without milliseconds, checked by a `GLOB` constraint. The mission has fixed dates (2026-09-01, 180 days) and the seed stops at day 60.

**Why:** the frontend charts day, week, month and whole mission, so it needs history from the first second; `CLAUDE.md` asks for an accelerated mission clock. Fixed dates make the seed identical on every machine. An earlier version used dates relative to the real "now", which made data drift between runs and machines.

## D5. Deterministic readings

**Decision:** a reading's value depends only on seed, crew member, metric and instant (one pseudo-random stream per reading).

**Why:** the seed is reproducible across the team, bugs can be reproduced, and the live simulator continues the seeded history exactly however time is split into ticks.

## D6. Thresholds: sources, verification levels and team bands

**Decision:** every threshold carries a source and a `verification` level (`verified`, `partially-verified`, `to-verify`). A caution band that the source does not define may be chosen by the team and is marked `team-band`; the normal range always comes from the source. Metrics without a defensible source have no threshold.

**Why:** `CLAUDE.md` forbids invented thresholds and doses. Being explicit about what was verified lets the team close the gaps before the demo instead of hiding them. NASA sources were preferred (NASA-STD-3001, OCHMO briefs, JSC-67378, JSC vitamin D flow); clinical guidelines fill the gaps.

**Formulary:** items come from the ISS medical kit; no dosages are stored, because none had a citable source.

## D7. Real NASA data where it fits

**Decision:**

- **OSDR Inspiration4** preflight blood values are stored as real readings (`simulated = false`), shifted to the same number of days before our mission start, and their mean is the simulator baseline for each crew member. The lab's reference interval is the white blood cell threshold.
- **DONKI** gives the real timing of the May 2024 solar storm, which the solar-storm scenario replays.
- The processed datasets are committed so the demo works offline; `npm run data:fetch -w backend` refreshes them.

**Not used, and why:** OSDR C-reactive protein (research multiplex assay, not comparable to the clinical threshold), hemoglobin (sex-specific ranges, fictional sexes), postflight timepoints (after a 3-day flight). Inspiration4 has no 6-month in-flight data, so the in-mission evolution stays simulated.

## D8. Solar-storm alert from space weather, not dose rate

**Decision (proposal, not implemented):** keep the radiation dose rate without a threshold and raise the solar-storm alert from a space-weather rule (NOAA solar radiation storm scale, S1: protons ≥ 10 MeV at 10 pfu), using the DONKI onsets.

**Why:** NASA limits accumulated dose (career 600 mSv), not the rate; a dose-rate threshold would have to be invented. The rule belongs to the rules engine and must be agreed with Carlos.

## D9. Simulator decoupled from the API

**Decision:** `MissionSimulator` emits events (`measurement`, `clock`, `scenario`, `end`) and knows nothing about Express or Socket.IO.

**Why:** the simulator (Backend DB) and the API (Backend API) have different owners; the backend only forwards the events to `measurement:new` and `mission:clock`. It also makes the simulator testable with a fake clock.

## D10. Shared types only from `@chief/shared`

**Decision:** while the agent branch was unmerged, `Medication` and `Alert.recommendation` were mirrored in a temporary `backend/src/db/types.ts`; it was deleted as soon as the agent contract reached `develop` (PR #13).

**Why:** `shared/` is owned by the whole team and must not be changed unilaterally, but the database could not wait for it.

## Open items

- Close the remaining threshold verifications (Frisén mapping, partially verified entries, Rev C bone requirement).
- Agree on the space-weather rule for the solar-storm alert.
- Wire `MissionSimulator` into the backend (Express + Socket.IO) and expose a way to launch the storm during the demo.
- Import more OSDR panels only together with sourced thresholds.
