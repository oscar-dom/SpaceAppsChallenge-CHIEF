import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  AgentChatRequest,
  Alert,
  CrewMember,
  HealthScore,
  Measurement,
  Threshold,
} from '@chief/shared';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDatabase } from './db/client.js';
import { runMigrations } from './db/migrations.js';
import { populateDatabase } from './db/populate.js';
import { setMissionTime } from './db/queries.js';
import { createServices, type Services } from './services/index.js';
import { MissionSimulator } from './services/simulator/live.js';

const logger = pino({ level: 'silent' });

/** Port 9 is blocked by fetch: the agent fails at once, like a stopped service. */
const DOWN_AGENT_URL = 'http://127.0.0.1:9';

/** TIME_SCALE 1: the simulated clock barely moves while the tests run. */
const TEST_ENV = { AGENT_URL: DOWN_AGENT_URL, AGENT_TIMEOUT_MS: 2_000, TIME_SCALE: 1 };

/** A fresh in-memory database with the seeded mission (seed 42: same data on every run). */
function buildApp(agentUrl = DOWN_AGENT_URL) {
  const { db } = createDatabase(':memory:');
  runMigrations(db);
  populateDatabase(db, { seed: 42 });
  const services = createServices(db, { ...TEST_ENV, AGENT_URL: agentUrl }, logger);
  return { db, services, app: createApp({ services, logger, corsOrigin: '*' }) };
}

/** Moves the simulated mission forward `hours`, as the live loop does tick by tick. */
function advance(db: ReturnType<typeof buildApp>['db'], hours: number) {
  let realMs = 0;
  const simulator = new MissionSimulator(db, { timeScale: 1, now: () => realMs });
  realMs = hours * 3_600_000;
  return simulator.tick();
}

/** Raises the alerts of a crew member, as the live loop does on every tick. */
function syncAlerts(services: Services, crewId: string) {
  return services.alerts.sync(crewId, services.health.evaluate(crewId));
}

describe('REST API', () => {
  const { app, services } = buildApp();

  it('lists the crew', async () => {
    const res = await request(app).get('/api/crew').expect(200);
    const crew = res.body as CrewMember[];
    expect(crew.map((c) => c.id)).toEqual(['C001', 'C002', 'C003', 'C004']);
  });

  it('returns the mission clock at the seeded demo day', async () => {
    const res = await request(app).get('/api/mission/clock').expect(200);
    expect(res.body).toMatchObject({ missionDay: 60, missionLengthDays: 180, timeScale: 1 });
  });

  it('lists the metric catalog', async () => {
    const res = await request(app).get('/api/metrics').expect(200);
    expect(res.body.length).toBe(services.health.metrics.length);
  });

  it('lists the sourced thresholds for the charts', async () => {
    const res = await request(app).get('/api/thresholds').expect(200);
    const thresholds = res.body as Threshold[];
    expect(thresholds.length).toBeGreaterThan(0);
    const metricIds = new Set(services.health.metrics.map((m) => m.id));
    for (const threshold of thresholds) {
      expect(metricIds.has(threshold.metricId)).toBe(true);
      expect(threshold.ranges.some((r) => r.status === 'nominal')).toBe(true);
      expect(threshold.source.document).toBeTruthy();
    }
  });

  it('evaluates the health of a crew member over every body system', async () => {
    const res = await request(app).get('/api/crew/C001/health').expect(200);
    const health = res.body as HealthScore;
    expect(health.systems).toHaveLength(9);
    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);
  });

  it('detects the planted vitamin D deficiency of C003', async () => {
    const res = await request(app).get('/api/crew/C003/systems/blood-biochemistry').expect(200);
    const vitaminD = res.body.metrics.find(
      (m: { metric: { id: string } }) => m.metric.id === 'vitamin-d-25-oh',
    );
    expect(vitaminD.status).not.toBe('nominal');
    expect(res.body.status).not.toBe('nominal');
  });

  it('does not score metrics without a sourced threshold', async () => {
    const res = await request(app).get('/api/crew/C004/systems/behavioral-health').expect(200);
    // Mood and stress have no threshold yet: they are listed but the system stays nominal.
    expect(res.body.metrics.length).toBeGreaterThan(0);
    expect(res.body).toMatchObject({ status: 'nominal', score: 100 });
  });

  it('returns chart series, oldest first and capped in size', async () => {
    for (const period of ['day', 'week', 'month', 'mission']) {
      const res = await request(app)
        .get('/api/crew/C001/measurements')
        .query({ metricId: 'resting-heart-rate', period })
        .expect(200);
      const points = res.body as Measurement[];
      expect(points.length, period).toBeGreaterThan(0);
      expect(points.length, period).toBeLessThanOrEqual(300);
      const times = points.map((p) => p.takenAt);
      expect(times, period).toEqual([...times].sort());
    }
  });

  it('opens one alert per anomaly and does not duplicate it on the next evaluation', async () => {
    const first = syncAlerts(services, 'C004');
    const sleep = first.created.find((a) => a.metricId === 'sleep-duration');
    expect(sleep).toMatchObject({ kind: 'anomaly', system: 'sleep-cognition' });
    expect(sleep?.recommendation).toBeTruthy();
    expect(syncAlerts(services, 'C004').created).toEqual([]);

    const res = await request(app).get('/api/crew/C004/alerts').expect(200);
    const ids = (res.body as Alert[]).filter((a) => a.metricId === 'sleep-duration');
    expect(ids).toHaveLength(1);
  });

  it('acknowledges an alert', async () => {
    const [alert] = syncAlerts(services, 'C003').created;
    expect(alert).toBeDefined();
    const res = await request(app).post(`/api/alerts/${alert?.id}/acknowledge`).expect(200);
    expect(res.body).toMatchObject({ id: alert?.id, acknowledged: true });
  });

  it('answers alert actions with the fallback when the agent is down', async () => {
    const [alert] = syncAlerts(services, 'C001').created;
    expect(alert).toBeDefined();
    const res = await request(app).post(`/api/alerts/${alert?.id}/actions`).expect(200);
    expect(res.body).toMatchObject({ alertId: alert?.id, fallback: true, model: null });
    expect(res.body.actions).toHaveLength(1);
  });

  it('answers the chat with the fallback when the agent is down', async () => {
    const res = await request(app)
      .post('/api/chief/chat')
      .send({ crewMemberId: 'C004', message: 'How am I doing?' })
      .expect(200);
    expect(res.body).toMatchObject({ fallback: true, model: null, reply: { role: 'chief' } });
    expect(res.body.reply.text).toContain('offline');
  });

  it('answers voice requests with 503 when the agent is down', async () => {
    const res = await request(app).post('/api/chief/tts').send({ text: 'Hello' }).expect(503);
    expect(res.body.error.code).toBe('AGENT_UNAVAILABLE');
  });

  it('rejects invalid input with a 400 ApiError', async () => {
    const res = await request(app).get('/api/crew/not-an-id/health').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    await request(app)
      .get('/api/crew/C001/measurements')
      .query({ metricId: 'resting-heart-rate', period: 'year' })
      .expect(400);
    await request(app).post('/api/alerts/abc/acknowledge').expect(400);
    await request(app)
      .post('/api/chief/chat')
      .set('content-type', 'application/json')
      .send('{bad json')
      .expect(400);
  });

  it('answers 404 for unknown crew members, metrics, alerts and routes', async () => {
    await request(app).get('/api/crew/C999/health').expect(404);
    await request(app)
      .get('/api/crew/C001/measurements')
      .query({ metricId: 'unknown' })
      .expect(404);
    await request(app).post('/api/alerts/999999/acknowledge').expect(404);
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('alert lifecycle', () => {
  it('resolves an anomaly once its metric is back to nominal', () => {
    const { services } = buildApp();
    const [alert] = syncAlerts(services, 'C004').created.filter((a) => a.kind === 'anomaly');
    expect(alert).toBeDefined();
    const evaluation = services.health.evaluate('C004');
    const healthy = {
      ...evaluation,
      findings: evaluation.findings.map((f) =>
        f.metricId === alert?.metricId ? { ...f, status: 'nominal' as const } : f,
      ),
    };
    const { updated } = services.alerts.sync('C004', healthy);
    expect(updated).toContainEqual(expect.objectContaining({ id: alert?.id, acknowledged: true }));
    expect(services.alerts.list('C004').some((a) => a.id === alert?.id)).toBe(false);
  });

  it('reminds of an appointment once, and resolves it when its readings arrive', () => {
    const { db, services } = buildApp();

    // C003's weekly labs and exams were last taken on 2026-10-25 09:00: due a week later.
    setMissionTime(db, '2026-11-01T04:00:00Z');
    const reminders = syncAlerts(services, 'C003').created.filter((a) => a.kind === 'scheduled');
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      dueAt: '2026-11-01T09:00:00Z',
      severity: 'info',
      title: expect.stringMatching(/^Scheduled check-up: \d+ measurements$/),
    });
    expect(syncAlerts(services, 'C003').created).toEqual([]);

    // The appointment happens: the simulator moves the clock to 10:00 and writes the readings.
    advance(db, 6);
    expect(services.clock.nowIso()).toBe('2026-11-01T10:00:00Z');
    const { updated } = syncAlerts(services, 'C003');
    expect(updated).toContainEqual(
      expect.objectContaining({ id: reminders[0]?.id, acknowledged: true }),
    );
    expect(services.alerts.list('C003').some((a) => a.kind === 'scheduled')).toBe(false);
  });
});

describe('live simulator', () => {
  it('drives the mission clock and the readings the API serves', async () => {
    const { app, db } = buildApp();
    const before = await request(app).get('/api/mission/clock').expect(200);
    expect(advance(db, 6).inserted).toBeGreaterThan(0);

    const after = await request(app).get('/api/mission/clock').expect(200);
    expect(Date.parse(after.body.missionTime) - Date.parse(before.body.missionTime)).toBe(
      6 * 3_600_000,
    );
    const day = await request(app)
      .get('/api/crew/C001/measurements')
      .query({ metricId: 'resting-heart-rate', period: 'day' })
      .expect(200);
    expect((day.body as Measurement[]).at(-1)?.takenAt).toBe(after.body.missionTime);
  });
});

describe('CHIEF agent integration', () => {
  let agent: Server;
  let received: AgentChatRequest | undefined;
  let app: ReturnType<typeof buildApp>['app'];

  beforeAll(async () => {
    // Fake agent: records the request and answers like agent/chief/api.py.
    agent = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        received = JSON.parse(body) as AgentChatRequest;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            reply: 'Your vitals look stable.',
            actions: [
              {
                category: 'sleep',
                title: 'Protect your sleep',
                description: 'Dim the crew quarters an hour earlier.',
                escalation: 'self-care',
                medicationId: null,
              },
            ],
            fallback: false,
            model: 'gemini-test',
          }),
        );
      });
    });
    await new Promise<void>((resolve) => agent.listen(0, '127.0.0.1', resolve));
    const { port } = agent.address() as AddressInfo;
    app = buildApp(`http://127.0.0.1:${port}`).app;
  });

  afterAll(() => new Promise<void>((resolve) => agent.close(() => resolve())));

  it('forwards the rules engine context and returns the agent answer', async () => {
    const res = await request(app)
      .post('/api/chief/chat')
      .send({ crewMemberId: 'C004', message: 'Why am I so tired?' })
      .expect(200);

    expect(res.body).toMatchObject({
      fallback: false,
      model: 'gemini-test',
      reply: { role: 'chief', text: 'Your vitals look stable.' },
    });
    expect(res.body.actions[0].medicationId).toBeUndefined();

    expect(received?.crewMember.id).toBe('C004');
    expect(received?.message).toBe('Why am I so tired?');
    expect(received?.health.systems).toHaveLength(9);
    expect(received?.missionClock?.missionDay).toBe(60);
    expect(received?.formulary.length).toBeGreaterThan(0);
  });
});
