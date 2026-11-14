# `data/`

Reference data of the project, committed to Git and loaded into the database by `npm run db:seed -w backend`. Every file says where its values come from.

| File | Contents | Source rule |
| --- | --- | --- |
| `crew.ts` | The 4 fictional crew members and the simulated mission (start, 180 days, time scale, demo day) | Names are made up; ids are the anonymous OSDR codes |
| `metrics.ts` | Catalog of the 25 metrics, by body system | HRP Spaceflight Standard Measures (which indicators NASA tracks) |
| `thresholds.ts` | Ranges per status, escalation and fallback advice | **No threshold without a source**; each entry says how far the source was checked |
| `formulary.ts` | Onboard formulary CHIEF may suggest from | NASA ISS Medical Kit Checklist. No dosages without a cited source |
| `datasets/` + `datasets.ts` | Real NASA data: Inspiration4 blood panels (OSDR) and the May 2024 solar storm (DONKI), processed by `npm run data:fetch -w backend` | Each file keeps its source and retrieval date |
| `simulation.ts` | Parameters of the simulated values (baseline, noise, trend) | Plausible values, not medical thresholds; blood baselines come from OSDR |
| `scenarios.ts` | Demo scenarios planted on crew members | Change simulated readings only |

Everything generated from `simulation.ts` and `scenarios.ts` is stored with `simulated = true` and must never be presented as a real measurement. Only the OSDR preflight readings are stored with `simulated = false`.

The SQLite file is **not** here: it lives in `backend/var/` and is git-ignored. See [`src/db/README.md`](../src/db/README.md) and [`docs/database-schema.md`](../../docs/database-schema.md).
