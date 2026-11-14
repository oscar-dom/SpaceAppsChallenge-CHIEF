'use strict';

/**
 * SQLite database access (better-sqlite3).
 *
 * This is the only place where the connection is opened and the PRAGMAs are applied. Only the backend
 * writes to the database. Functions that contain SQL (getVitals, insertAlert...) go in sibling files
 * of this folder and use openDb().
 */

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const SEED_PATH = path.join(__dirname, 'seed.sql');
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
// CHIEF_DB_PATH points to another database (tests, demo copies).
const DB_PATH = process.env.CHIEF_DB_PATH
  ? path.resolve(process.env.CHIEF_DB_PATH)
  : path.join(DATA_DIR, 'chief.db');

/** Schema version: read from `PRAGMA user_version = N` in schema.sql (single source of truth). */
function schemaVersion() {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const match = /PRAGMA\s+user_version\s*=\s*(\d+)/i.exec(sql);
  if (!match) throw new Error('schema.sql does not declare PRAGMA user_version');
  return Number(match[1]);
}

/**
 * Opens the database with the mandatory PRAGMAs and checks that the schema is the expected one.
 * Fails with a clear message if the file is missing or outdated (e.g. an old .db from another
 * branch), instead of producing confusing errors later.
 */
function openDb({ file = DB_PATH, readonly = false } = {}) {
  if (!fs.existsSync(file)) {
    throw new Error(`Database not found (${file}). Create it with: node src/db/reset.js (npm run db:reset)`);
  }
  const db = new Database(file, { readonly, fileMustExist: true });
  db.pragma('foreign_keys = ON');
  if (!readonly) db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  const actual = db.pragma('user_version', { simple: true });
  const expected = schemaVersion();
  if (actual !== expected) {
    db.close();
    throw new Error(
      `Outdated schema: the database is version ${actual} and the code expects ${expected}. ` +
        'Regenerate it with: node src/db/reset.js (npm run db:reset)'
    );
  }
  return db;
}

const DB_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/**
 * Converts a date (Date, epoch ms or string) to the database format: 'YYYY-MM-DDTHH:mm:ssZ', no milliseconds.
 * ALWAYS use this function, both when inserting and for the from/to parameters that come from the API:
 * toISOString() returns milliseconds and breaks range comparisons done as text.
 */
function toDbDate(input = new Date()) {
  if (typeof input === 'string' && DB_DATE_RE.test(input)) return input;
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(input)}`);
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Runs an idempotent INSERT (a repeated client_id does not duplicate) and reports whether it really inserted.
 *
 * With "INSERT OR IGNORE" / "ON CONFLICT DO NOTHING", `lastInsertRowid` is NOT reliable: it returns the id
 * of the previous insert even when this one was ignored. You must look at `changes`.
 *
 * @param {import('better-sqlite3').Statement} stmt statement prepared with OR IGNORE / ON CONFLICT DO NOTHING
 * @returns {{ inserted: boolean, id: number | null }}
 */
function runIdempotentInsert(stmt, params) {
  const info = stmt.run(params);
  return info.changes === 0
    ? { inserted: false, id: null }
    : { inserted: true, id: Number(info.lastInsertRowid) };
}

module.exports = {
  DB_PATH,
  DATA_DIR,
  SCHEMA_PATH,
  SEED_PATH,
  schemaVersion,
  openDb,
  toDbDate,
  runIdempotentInsert,
};
