import { defineConfig } from 'drizzle-kit';

/** `npm run db:generate -w backend` turns schema.ts changes into a new SQL migration in ./drizzle. */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
