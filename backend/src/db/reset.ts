import fs from 'node:fs';
import path from 'node:path';
import { createDatabase, DB_PATH } from './client.js';
import { runMigrations } from './migrations.js';
import { populateDatabase } from './populate.js';

/**
 * `npm run db:reset -w backend`          rebuilds the database from scratch (migrations + seed)
 * `npm run db:reset -w backend -- --restore`  goes back to the clean copy saved by the last reset
 *
 * The clean copy (`chief.base.db`, next to the database) lets you return to the initial state
 * between demos in a second: launching a scenario leaves alerts and readings in the database.
 * Stop the backend first: on Windows an open database file cannot be deleted.
 */
const BASE_PATH = path.join(path.dirname(DB_PATH), 'chief.base.db');

function removeDatabaseFiles(file: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(file + suffix, { force: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EBUSY' || code === 'EPERM') {
        throw new Error(
          `Cannot delete ${file + suffix}: it is in use. Stop the backend and try again.`,
        );
      }
      throw error;
    }
  }
}

function restore(): void {
  if (!fs.existsSync(BASE_PATH))
    throw new Error(`No clean copy found (${BASE_PATH}). Run db:reset first.`);
  removeDatabaseFiles(DB_PATH);
  fs.copyFileSync(BASE_PATH, DB_PATH);
  console.log(`Database restored from ${BASE_PATH}`);
}

function rebuild(seed: number | undefined): void {
  removeDatabaseFiles(DB_PATH);
  const { db, sqlite, close } = createDatabase();
  try {
    runMigrations(db);
    const summary = populateDatabase(db, { seed });
    removeDatabaseFiles(BASE_PATH);
    sqlite.exec(`VACUUM INTO '${BASE_PATH.replaceAll("'", "''")}'`);
    console.log(`Database created: ${DB_PATH}`);
    console.log(`Seeded: ${JSON.stringify(summary)}`);
  } finally {
    close();
  }
}

try {
  const args = process.argv.slice(2);
  if (args.includes('--restore')) {
    restore();
  } else {
    const seedArg = args.find((a) => a.startsWith('--seed='));
    rebuild(seedArg ? Number(seedArg.slice('--seed='.length)) : undefined);
  }
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
