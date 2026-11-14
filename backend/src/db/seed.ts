import { createDatabase } from './client.js';
import { runMigrations } from './migrations.js';
import { populateDatabase } from './populate.js';

/**
 * `npm run db:seed -w backend [-- --seed=7]`: loads the reference data and the simulated mission
 * history into an empty database. To start from scratch use `db:reset`.
 */
function parseSeed(argv: string[]): number | undefined {
  const arg = argv.find((a) => a.startsWith('--seed='));
  if (!arg) return undefined;
  const seed = Number(arg.slice('--seed='.length));
  if (!Number.isInteger(seed)) throw new Error(`--seed must be an integer: ${arg}`);
  return seed;
}

const { db, close } = createDatabase();
try {
  runMigrations(db);
  const summary = populateDatabase(db, { seed: parseSeed(process.argv.slice(2)) });
  console.log(`Seeded: ${JSON.stringify(summary)}`);
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  close();
}
