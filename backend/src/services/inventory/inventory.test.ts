import type { InventoryHistory, InventoryStock, Journey, StageInventory } from '@chief/shared';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { INVENTORY } from '../../../data/inventory.js';
import { MISSION } from '../../../data/crew.js';
import { createApp } from '../../app.js';
import { createDatabase } from '../../db/client.js';
import { getDailyTotals } from '../../db/inventory-queries.js';
import { runMigrations } from '../../db/migrations.js';
import { populateDatabase } from '../../db/populate.js';
import { createServices } from '../index.js';
import { MissionSimulator } from '../simulator/live.js';
import { dailyUse } from './simulate.js';

const logger = pino({ level: 'silent' });
const TEST_ENV = { AGENT_URL: 'http://127.0.0.1:9', AGENT_TIMEOUT_MS: 2_000, TIME_SCALE: 1 };
const CREW = ['C001', 'C002', 'C003', 'C004'];

/** A fresh seeded mission (clock at day 60, 12:00 UTC). */
function build() {
  const { db } = createDatabase(':memory:');
  runMigrations(db);
  const summary = populateDatabase(db, { seed: 42 });
  const services = createServices(db, TEST_ENV, logger);
  return { db, summary, services, app: createApp({ services, logger, corsOrigin: '*' }) };
}

/** Moves the mission clock forward `hours`, as the live loop does. */
function advance(db: ReturnType<typeof build>['db'], hours: number) {
  let realMs = 0;
  const simulator = new MissionSimulator(db, { timeScale: 1, now: () => realMs });
  realMs = hours * 3_600_000;
  simulator.tick();
}

const seedItem = (id: string) => {
  const item = INVENTORY.find((i) => i.id === id);
  if (!item) throw new Error(id);
  return item;
};

describe('simulated daily use', () => {
  it('uses about 1.83 kg of food per crew member per day (NASA BVAD)', () => {
    const food = seedItem('food-packaged');
    const days = Array.from({ length: 100 }, (_, i) => dailyUse(food, i + 1, CREW, 42));
    const mean = days.reduce((a, b) => a + b, 0) / days.length;
    expect(mean).toBeGreaterThan(1.83 * 4 * 0.97);
    expect(mean).toBeLessThan(1.83 * 4 * 1.03);
  });

  it('gives promethazine mostly in the first three days (motion sickness)', () => {
    const drug = seedItem('promethazine-25');
    const early = [1, 2, 3].reduce((n, d) => n + dailyUse(drug, d, CREW, 42), 0);
    const later = Array.from({ length: 60 }, (_, i) => dailyUse(drug, i + 20, CREW, 42)).reduce(
      (a, b) => a + b,
      0,
    );
    expect(early).toBeGreaterThan(later);
  });

  it('uses more sleep medication once the sleep-deprivation scenario starts (day 44)', () => {
    const melatonin = seedItem('melatonin');
    const sum = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) =>
        dailyUse(melatonin, from + i, CREW, 42),
      ).reduce((a, b) => a + b, 0);
    expect(sum(44, 120)).toBeGreaterThan(sum(1, 43) * 1.3);
  });

  it('is deterministic for a seed', () => {
    const food = seedItem('food-packaged');
    expect(dailyUse(food, 10, CREW, 7)).toBe(dailyUse(food, 10, CREW, 7));
  });
});

describe('inventory ledger', () => {
  it('books every finished day and the first resupply in the seed', () => {
    const { db, summary, services } = build();
    expect(summary.inventoryItems).toBe(INVENTORY.length);
    expect(summary.inventoryEvents).toBeGreaterThan(0);
    const food = services.inventory.history('food-packaged');
    expect(food.days).toHaveLength(MISSION.simDay);
    expect(food.days.filter((d) => d.consumed > 0)).toHaveLength(MISSION.simDay - 1);
    expect(food.events.filter((e) => e.reason === 'resupply')).toEqual([
      expect.objectContaining({ day: 40, delta: 400, note: expect.stringContaining('Progress') }),
    ]);
    // Water: 98% of what is used comes back.
    const water = getDailyTotals(db, 1, 59, 'water-potable');
    const used = -water.filter((r) => r.reason === 'consumption').reduce((a, r) => a + r.total, 0);
    const back = water.filter((r) => r.reason === 'recovery').reduce((a, r) => a + r.total, 0);
    expect(back / used).toBeCloseTo(0.98, 2);
  });

  it('stock equals the last day of the history', () => {
    const { services } = build();
    for (const stock of services.inventory.stocks()) {
      const days = services.inventory.history(stock.item.id).days;
      expect(days.at(-1)?.quantity).toBeCloseTo(stock.quantity, 2);
      expect(stock.quantity).toBeGreaterThanOrEqual(0);
    }
  });

  it('catching up twice writes nothing new', () => {
    const { services } = build();
    expect(services.inventory.catchUp()).toBe(0);
  });

  it('books the next day once the clock passes 23:00', () => {
    const { db, services } = build();
    let changed = 0;
    services.inventory.on('changed', () => changed++);
    advance(db, 10); // 12:00 -> 22:00, day not over yet
    expect(services.inventory.catchUp()).toBe(0);
    advance(db, 2); // 00:00 of day 61
    expect(services.inventory.catchUp()).toBeGreaterThan(0);
    expect(changed).toBe(1);
    expect(services.inventory.history('food-packaged').days.at(-2)?.consumed).toBeGreaterThan(0);
  });

  it('reports days of supply, status and the next resupply', () => {
    const { services } = build();
    const food = services.inventory.stock('food-packaged');
    expect(food.status).toBe('nominal');
    expect(food.daysLeft).toBeGreaterThan(21);
    expect(food.nextResupplyDay).toBe(95);
    const water = services.inventory.stock('water-potable');
    // Net water use is small: most of it is reclaimed.
    expect(water.daysLeft).toBeGreaterThan(180);
  });
});

describe('journey', () => {
  it('splits the mission into 10 stages and places CHIEF in stage 4 on day 60', () => {
    const { services } = build();
    const journey = services.journey.journey();
    expect(journey.stages).toHaveLength(10);
    expect(journey.missionDay).toBe(60);
    expect(journey.currentStage).toBe(4);
    expect(journey.stages.map((s) => s.state)).toEqual([
      'done',
      'done',
      'done',
      'current',
      ...Array(6).fill('upcoming'),
    ]);
    expect(journey.stages[0]).toMatchObject({ startDay: 1, endDay: 18 });
    expect(journey.stages[9]).toMatchObject({ startDay: 163, endDay: 180 });
  });

  it('marks the solar storm in stage 4 and the cargo ships where they dock', () => {
    const { services } = build();
    const stages = services.journey.journey().stages;
    expect(stages[3]?.hazards.map((h) => h.id)).toContain('solar-particle-event');
    expect(stages[2]?.resupplies.map((r) => r.id)).toEqual(['progress-1']);
    expect(stages[5]?.resupplies.map((r) => r.id)).toEqual(['dragon-1']);
    // The South Atlantic Anomaly is crossed every day, so every stage lists it.
    for (const stage of stages)
      expect(stage.hazards.map((h) => h.id)).toContain('south-atlantic-anomaly');
  });

  it('gives real figures for past stages and a forecast for upcoming ones', () => {
    const { services } = build();
    const past = services.journey.stageInventory(3);
    const food = past.items.find((i) => i.item.id === 'food-packaged');
    expect(food).toMatchObject({ projected: false, resupplied: 400 });
    expect(food?.endQuantity).toBeCloseTo(
      (food?.startQuantity ?? 0) - (food?.consumed ?? 0) + 400,
      1,
    );

    const next = services.journey.stageInventory(6);
    const nextFood = next.items.find((i) => i.item.id === 'food-packaged');
    expect(nextFood).toMatchObject({ projected: true, startQuantity: null, resupplied: 420 });
  });
});

describe('REST', () => {
  it('serves the journey, the stock and the history', async () => {
    const { app } = build();
    const journey = (await request(app).get('/api/journey').expect(200)).body as Journey;
    expect(journey.currentStage).toBe(4);
    const stage = (await request(app).get('/api/journey/stages/4/inventory').expect(200))
      .body as StageInventory;
    expect(stage.items).toHaveLength(INVENTORY.length);
    await request(app).get('/api/journey/stages/11/inventory').expect(400);
    const stocks = (await request(app).get('/api/inventory').expect(200)).body as InventoryStock[];
    expect(stocks.map((s) => s.item.id).sort()).toEqual(INVENTORY.map((i) => i.id).sort());
    const history = (await request(app).get('/api/inventory/melatonin/history').expect(200))
      .body as InventoryHistory;
    expect(history.days).toHaveLength(60);
    await request(app).get('/api/inventory/unknown-item/history').expect(404);
  });

  it('lets the crew add and remove stock, never below zero', async () => {
    const { app, services } = build();
    const before = services.inventory.stock('ibuprofen-400').quantity;
    const added = (
      await request(app)
        .post('/api/inventory/ibuprofen-400/adjust')
        .send({ delta: 10, note: 'Found a spare pack', crewMemberId: 'C002' })
        .expect(200)
    ).body as InventoryStock;
    expect(added.quantity).toBe(before + 10);
    const removed = (
      await request(app).post('/api/inventory/ibuprofen-400/adjust').send({ delta: -3 }).expect(200)
    ).body as InventoryStock;
    expect(removed.quantity).toBe(before + 7);

    const events = services.inventory.history('ibuprofen-400').events;
    const adjustments = events.filter((e) => e.reason === 'adjustment');
    expect(adjustments.map((e) => e.quantityAfter)).toEqual([before + 10, before + 7]);
    expect(adjustments).toEqual([
      expect.objectContaining({
        delta: 10,
        note: 'Found a spare pack',
        crewMemberId: 'C002',
        day: 60,
      }),
      expect.objectContaining({ delta: -3, note: null, crewMemberId: null }),
    ]);

    const tooMuch = await request(app)
      .post('/api/inventory/ibuprofen-400/adjust')
      .send({ delta: -(before + 1000) })
      .expect(400);
    expect(tooMuch.body.error.code).toBe('VALIDATION_ERROR');
    await request(app).post('/api/inventory/ibuprofen-400/adjust').send({ delta: 0 }).expect(400);
    await request(app)
      .post('/api/inventory/ibuprofen-400/adjust')
      .send({ delta: 1, crewMemberId: 'C999' })
      .expect(404);
    await request(app)
      .post('/api/inventory/ibuprofen-400/adjust')
      .send({ delta: 1, extra: true })
      .expect(400);
  });
});
