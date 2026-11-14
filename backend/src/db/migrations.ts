import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { MIGRATIONS_DIR, type Db } from './client.js';

/** Applies every pending migration from `backend/drizzle`. Safe to run on every start. */
export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
