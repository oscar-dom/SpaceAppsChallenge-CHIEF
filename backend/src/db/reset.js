'use strict';

/**
 * Rebuilds the database from scratch (or restores it to its initial state).
 *
 *   node src/db/reset.js                 deletes chief.db and creates it from schema.sql + seed.sql + simulated data
 *   node src/db/reset.js --restore       goes back to the initial state by copying chief.base.db over chief.db
 *   node src/db/reset.js --no-simulated  schema + reference data only (crew, inventory, protocols)
 *   node src/db/reset.js --now=2026-11-14T10:00:00Z --seed=7
 *
 * Environment variables: CHIEF_NOW (reference instant), CHIEF_SEED (seed), CHIEF_DB_PATH (another database).
 *
 * After creating the database, a clean copy `chief.base.db` is saved (same folder). With --restore you go
 * back to it in a second: useful between demos, because launching a scenario (solar storm...) leaves
 * simulated alerts and readings in the database.
 *
 * IMPORTANT: stop the backend before running it; on Windows an open .db file cannot be deleted.
 */

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { DB_PATH, SCHEMA_PATH, SEED_PATH, schemaVersion, toDbDate } = require('./index.js');
const { seedSimulated } = require('./seed-simulated.js');

const DB_SIDE_FILES = ['', '-wal', '-shm'];
const BASE_PATH = path.join(path.dirname(DB_PATH), 'chief.base.db');

function parseArgs(argv) {
  const opts = { restore: false, simulated: true, now: process.env.CHIEF_NOW, seed: process.env.CHIEF_SEED };
  for (const arg of argv) {
    if (arg === '--restore') opts.restore = true;
    else if (arg === '--no-simulated') opts.simulated = false;
    else if (arg.startsWith('--now=')) opts.now = arg.slice('--now='.length);
    else if (arg.startsWith('--seed=')) opts.seed = arg.slice('--seed='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  const now = opts.now ? new Date(opts.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now: ${opts.now}`);
  const seed = opts.seed === undefined ? 42 : Number(opts.seed);
  if (!Number.isInteger(seed)) throw new Error(`--seed must be an integer: ${opts.seed}`);
  return { ...opts, now, seed };
}

function removeDbFiles(file) {
  for (const suffix of DB_SIDE_FILES) {
    try {
      fs.rmSync(file + suffix, { force: true });
    } catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EPERM') {
        throw new Error(`Cannot delete ${file + suffix}: it is in use. Stop the backend and try again.`);
      }
      throw err;
    }
  }
}

function build({ now, seed, simulated }) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  removeDbFiles(DB_PATH);

  const db = new Database(DB_PATH);
  try {
    db.pragma('foreign_keys = ON');
    db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

    // seed.sql is UTF-8 and uses {{NOW}} so dates are relative to the reference instant.
    const seedSql = fs.readFileSync(SEED_PATH, 'utf8').replaceAll('{{NOW}}', `'${toDbDate(now)}'`);
    db.exec(seedSql);

    const summary = simulated ? seedSimulated(db, { now, seed }) : null;

    const violations = db.pragma('foreign_key_check');
    if (violations.length > 0) {
      throw new Error(`Foreign key violations after seeding: ${JSON.stringify(violations.slice(0, 5))}`);
    }

    // Clean copy of the initial state for --restore.
    removeDbFiles(BASE_PATH);
    db.exec(`VACUUM INTO '${BASE_PATH.replaceAll("'", "''")}'`);
    return summary;
  } finally {
    db.close();
  }
}

function restore() {
  if (!fs.existsSync(BASE_PATH)) {
    throw new Error(`No initial copy found (${BASE_PATH}). Create the database with: node src/db/reset.js (npm run db:reset)`);
  }
  removeDbFiles(DB_PATH);
  fs.copyFileSync(BASE_PATH, DB_PATH);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.restore) {
    restore();
    console.log(`Database restored from ${BASE_PATH}`);
    return;
  }
  const summary = build(opts);
  console.log(`Database created: ${DB_PATH} (schema v${schemaVersion()})`);
  console.log(`Initial copy: ${BASE_PATH}`);
  if (summary) {
    console.log(`Simulated data: now=${summary.now} seed=${summary.seed}`);
    for (const [table, n] of Object.entries(summary.counts)) console.log(`  ${table.padEnd(22)} ${n}`);
  }
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
}
