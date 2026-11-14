import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  Alert,
  ClientToServerEvents,
  HealthScore,
  Measurement,
  MissionClock,
  ServerToClientEvents,
} from '@chief/shared';
import { pino } from 'pino';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrations.js';
import { populateDatabase } from '../db/populate.js';
import { createServices } from './index.js';
import { LiveService, type ChiefServer } from './live.service.js';
import { MissionSimulator } from './simulator/live.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type EventName = keyof ServerToClientEvents;

const logger = pino({ level: 'silent' });
const HOUR_MS = 3_600_000;

/** Resolves with the first `event` that passes `accept`, or fails after `timeoutMs`. */
function next<E extends EventName>(
  socket: ClientSocket,
  event: E,
  accept: (payload: Parameters<ServerToClientEvents[E]>[0]) => boolean = () => true,
  timeoutMs = 3_000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener as never);
      reject(new Error(`No ${event} within ${timeoutMs} ms`));
    }, timeoutMs);
    const listener = (payload: Parameters<ServerToClientEvents[E]>[0]) => {
      if (!accept(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener as never);
      resolve(payload);
    };
    socket.on(event, listener as never);
  });
}

/** Collects every payload of `event` until the returned function is called. */
function record<E extends EventName>(socket: ClientSocket, event: E) {
  const payloads: Parameters<ServerToClientEvents[E]>[0][] = [];
  const listener = (payload: Parameters<ServerToClientEvents[E]>[0]) => payloads.push(payload);
  socket.on(event, listener as never);
  return () => {
    socket.off(event, listener as never);
    return payloads;
  };
}

describe('live loop over Socket.IO', () => {
  const { db } = createDatabase(':memory:');
  runMigrations(db);
  populateDatabase(db, { seed: 42 });
  const services = createServices(
    db,
    { AGENT_URL: 'http://127.0.0.1:9', AGENT_TIMEOUT_MS: 1_000, TIME_SCALE: 1 },
    logger,
  );

  // Real time is driven by the test: each tick advances the mission by what we add here.
  let realMs = 0;
  const simulator = new MissionSimulator(db, { timeScale: 1, now: () => realMs });

  let http: HttpServer;
  let io: ChiefServer;
  let live: LiveService;
  let url: string;
  const clients: ClientSocket[] = [];

  async function client(crewId: string): Promise<ClientSocket> {
    const socket: ClientSocket = connect(url, { transports: ['websocket'], forceNew: true });
    clients.push(socket);
    const health = next(socket, 'health:updated', (h) => h.crewMemberId === crewId);
    await next(socket, 'mission:clock');
    socket.emit('crew:select', crewId);
    await health;
    return socket;
  }

  beforeAll(async () => {
    http = createServer();
    io = new Server(http);
    // A long interval: the test calls tick() itself.
    live = new LiveService(
      io,
      services.clock,
      simulator,
      services.crew,
      services.health,
      services.alerts,
      HOUR_MS,
      logger,
    );
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    live.stop();
    for (const socket of clients) socket.disconnect();
    await io.close();
  });

  it('sends the mission clock on connect and the health score on crew:select', async () => {
    const socket: ClientSocket = connect(url, { transports: ['websocket'], forceNew: true });
    clients.push(socket);
    const clock = (await next(socket, 'mission:clock')) as MissionClock;
    expect(clock).toMatchObject({ missionDay: 60, missionLengthDays: 180 });

    const health = next(socket, 'health:updated');
    socket.emit('crew:select', 'C003');
    expect(((await health) as HealthScore).crewMemberId).toBe('C003');
  });

  it('ignores crew:select with an unknown crew member', async () => {
    const socket = await client('C002');
    const stop = record(socket, 'health:updated');
    socket.emit('crew:select', 'C999');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(stop()).toHaveLength(0);
  });

  it('raises the open alerts of the selected crew member when the loop starts', async () => {
    const socket = await client('C001');
    const stop = record(socket, 'alert:new');
    live.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const alerts = stop() as Alert[];
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every((a) => a.crewMemberId === 'C001')).toBe(true);
    expect(alerts.some((a) => a.metricId === 'bone-mineral-density-change')).toBe(true);
  });

  it('streams new readings only to the clients of that crew member', async () => {
    const c001 = await client('C001');
    const c004 = await client('C004');
    const stop001 = record(c001, 'measurement:new');
    const stop004 = record(c004, 'measurement:new');
    const clock = next(c001, 'mission:clock');
    const health = next(c001, 'health:updated', (h) => h.crewMemberId === 'C001');

    realMs += 2 * HOUR_MS;
    live.tick();
    await Promise.all([clock, health]);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const for001 = stop001() as Measurement[];
    const for004 = stop004() as Measurement[];
    expect(for001.some((m) => m.metricId === 'resting-heart-rate')).toBe(true);
    expect(for001.every((m) => m.crewMemberId === 'C001')).toBe(true);
    expect(for004.length).toBeGreaterThan(0);
    expect(for004.every((m) => m.crewMemberId === 'C004')).toBe(true);
  });
});
