// Environment variables, validated once at startup. backend/.env is optional: every
// variable has a default that works for local development.
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Origin of the frontend allowed by CORS and Socket.IO. */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Base URL of the Python agent (CHIEF). */
  AGENT_URL: z.string().url().default('http://localhost:8000'),
  AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  /**
   * Simulated seconds per real second. Optional: by default the mission's own time scale
   * (backend/data/crew.ts, 600 = ten simulated minutes per second).
   */
  TIME_SCALE: z.coerce.number().positive().optional(),
  /** Real milliseconds between two simulator ticks. */
  TICK_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
  /** Set to false to serve the database as it is, without live data. */
  SIMULATOR_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n  ${issues.join('\n  ')}`);
  }
  return result.data;
}
