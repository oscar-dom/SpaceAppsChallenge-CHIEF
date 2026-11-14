import { createDatabase } from './client.js';
import { runMigrations } from './migrations.js';

/** `npm run db:migrate -w backend`: creates the database if needed and applies the migrations. */
const { db, close } = createDatabase();
try {
  runMigrations(db);
  console.log('Migrations applied.');
} finally {
  close();
}
