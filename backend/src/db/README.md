# `src/db`: database (SQLite)

All database access goes through this folder. **Only the backend writes**; no other module writes
SQL. The full design (tables, decisions, sync) is in
[`docs/database-schema.md`](../../../docs/database-schema.md).

| File | Purpose |
| --- | --- |
| `schema.sql` | Schema v3 (25 tables + 1 view). **Source of truth**; declares `PRAGMA user_version` |
| `seed.sql` | Reference data: crew, medical profiles, inventory, an example prescription and protocols. Uses `{{NOW}}`, so it is not run with the `sqlite3` client |
| `seed-simulated.js` | Deterministic simulated data (14 days up to "now") for the demo |
| `reset.js` | Recreates `data/chief.db` (or restores it to its initial state) |
| `index.js` | `openDb()`, `toDbDate()`, `runIdempotentInsert()` |

## Getting started

Needs Node (the same version for the whole team; `better-sqlite3` is a native module) and the dependency:

```bash
npm install better-sqlite3
```

Recommended scripts for `backend/package.json`:

```json
"scripts": {
  "db:reset": "node src/db/reset.js",
  "db:restore": "node src/db/reset.js --restore"
}
```

```bash
npm run db:reset      # creates data/chief.db + the initial copy data/chief.base.db
npm run db:restore    # between demos: back to the initial state (stop the backend first)
```

`reset.js` options: `--now=2026-11-14T10:00:00Z` (freezes "now"), `--seed=7`, `--no-simulated`
(reference data only). Variables: `CHIEF_NOW`, `CHIEF_SEED`, `CHIEF_DB_PATH`.

> The `.js` files are CommonJS (`require`). If the backend uses TypeScript or `"type": "module"`, convert
> `index.js`, `reset.js` and `seed-simulated.js` to `import`/`export` (a mechanical change). `CLAUDE.md`
> plans Drizzle ORM for the schema; if the team adopts it, `schema.sql` stays as the reference for the
> constraints (date format, JSON, ranges) that the Drizzle schema must reproduce.

## Rules for writing access functions

1. **Open with `openDb()`**: it enables `foreign_keys` and `WAL` and checks the schema version.
2. **Always use `toDbDate()` for dates**, including the `from`/`to` that arrive from the API. Format
   `YYYY-MM-DDTHH:mm:ssZ`, no milliseconds. The database rejects any other format. In SQL use
   `strftime('%Y-%m-%dT%H:%M:%SZ', ...)`, never `datetime('now')`.
3. **Idempotent inserts** (tables with `client_id`): `INSERT ... ON CONFLICT DO NOTHING` and
   `runIdempotentInsert()`. Do not use `lastInsertRowid` on its own: after a conflict it returns the id
   of the previous insert.
4. **`insertDose` in one transaction**: record the dose and decrement `medications.stock` together
   (`db.transaction`). Check `v_medication_warnings` first.
5. **Long series**: aggregate in SQL (`GROUP BY strftime(...)`) instead of returning thousands of rows;
   `better-sqlite3` is synchronous and blocks the server while it queries.
6. **Sync with the ground**: set `synced_at` and `sync_package_id` when **packaging**, not on delivery;
   if the ground does not acknowledge, set them back to `NULL`.
7. **Return `snake_case`**; the translation to camelCase happens in a single place in the backend.

## Changing the schema

Edit `schema.sql`, **bump `PRAGMA user_version`**, update `docs/database-schema.md` and tell the team to
run `npm run db:reset` (`CHECK` constraints cannot be altered in SQLite). Anyone with an old database
gets a clear error when the backend starts instead of strange failures.
