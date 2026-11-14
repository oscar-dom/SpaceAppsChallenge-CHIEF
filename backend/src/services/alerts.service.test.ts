import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrations.js';
import { populateDatabase } from '../db/populate.js';
import { createServices } from './index.js';

const DAY_MS = 86_400_000;

describe('scheduled reminders', () => {
  const { db } = createDatabase(':memory:');
  runMigrations(db);
  populateDatabase(db, { seed: 42 });
  const { alerts, clock, crew, health } = createServices(
    db,
    { AGENT_URL: 'http://127.0.0.1:9', AGENT_TIMEOUT_MS: 1_000, TIME_SCALE: 1 },
    pino({ level: 'silent' }),
  );
  for (const member of crew.list()) alerts.sync(member.id, health.evaluate(member.id));
  const tasks = crew
    .list()
    .flatMap((member) => alerts.list(member.id))
    .filter((a) => a.kind === 'scheduled');

  it('lists the next check-ups of the crew, so the Tasks tab is never empty', () => {
    expect(tasks.length).toBeGreaterThan(0);
  });

  it('only lists measurements due within the next five mission days', () => {
    const now = clock.now().getTime();
    for (const task of tasks) {
      const due = Date.parse(task.dueAt as string);
      expect(due - now).toBeLessThanOrEqual(5 * DAY_MS);
    }
  });

  it('groups the measurements of one appointment into one task', () => {
    const keys = tasks.map((t) => `${t.crewMemberId} ${t.dueAt}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
