import { INVENTORY, type InventorySeed } from '../../../data/inventory.js';
import { RESUPPLIES } from '../../../data/journey.js';
import type { Db } from '../../db/client.js';
import {
  getDeliveredResupplies,
  getInventoryItems,
  getLastUsageDay,
  getStockDeltas,
  insertInventoryEvents,
  type NewInventoryEvent,
} from '../../db/inventory-queries.js';
import { getCrew } from '../../db/queries.js';
import { createRandom, gaussian, hashString } from '../simulator/random.js';

/**
 * Simulated use of the inventory. Each mission day ends with one `consumption` event per item
 * (plus a `recovery` event for reclaimed water), and each cargo ship adds a `resupply` event when
 * it docks. The numbers are deterministic for a seed, like the rest of the simulator, so the
 * seeded history and the live loop write exactly the same ledger.
 */

export const DAY_MS = 86_400_000;
/** Daily use is booked at 23:00 of the mission day, a resupply at 12:00 of its docking day. */
const USAGE_HOUR_MS = 23 * 3_600_000;
const DOCKING_HOUR_MS = 12 * 3_600_000;

const toIso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const round = (value: number, unit: string) =>
  unit === 'kg' ? Math.round(value * 100) / 100 : Math.round(value);

/** Gross use of one item on one mission day by the whole crew. */
export function dailyUse(
  item: InventorySeed,
  day: number,
  crewIds: readonly string[],
  seed: number,
): number {
  const rand = createRandom(hashString(`${seed}:inventory:${item.id}:${day}`));
  const use = item.use;
  if (use.kind === 'mass') {
    const value = use.perCrewPerDay * crewIds.length * (1 + gaussian(rand, 0, use.noise));
    return Math.max(0, round(value, item.unit));
  }
  let units = 0;
  for (const crewId of crewIds) {
    const boost = (use.boosts ?? [])
      .filter((b) => day >= b.fromDay && day <= b.toDay && (!b.crewId || b.crewId === crewId))
      .reduce((factor, b) => factor * b.factor, 1);
    if (rand() < Math.min(1, use.chance * boost)) units += use.unitsPerUse;
  }
  return units;
}

export interface CatchUpOptions {
  startMs: number;
  nowMs: number;
  lengthDays: number;
  seed?: number;
}

/**
 * Writes every daily use and resupply due up to `nowMs` that is not in the ledger yet, in time
 * order, never taking the stock below zero. Returns the number of events written.
 */
export function catchUpInventory(db: Db, options: CatchUpOptions): number {
  const { startMs, nowMs, lengthDays } = options;
  const seed = options.seed ?? 42;
  const seeds = new Map(INVENTORY.map((i) => [i.id, i]));
  const items = getInventoryItems(db).filter((i) => seeds.has(i.id));
  if (items.length === 0) return 0;
  const crewIds = getCrew(db).map((c) => c.id);

  const deltas = getStockDeltas(db);
  const stock = new Map(items.map((i) => [i.id, i.initialQuantity + (deltas.get(i.id) ?? 0)]));

  // Days whose 23:00 booking time has passed, within the mission.
  const lastDue = Math.min(lengthDays, Math.floor((nowMs - startMs - USAGE_HOUR_MS) / DAY_MS) + 1);
  const firstDay = getLastUsageDay(db) + 1;
  const delivered = getDeliveredResupplies(db);

  type Pending = { ms: number; write: () => NewInventoryEvent[] };
  const pending: Pending[] = [];

  for (const resupply of RESUPPLIES) {
    const ms = startMs + (resupply.day - 1) * DAY_MS + DOCKING_HOUR_MS;
    if (ms > nowMs || delivered.has(resupply.id)) continue;
    pending.push({
      ms,
      write: () =>
        resupply.cargo.flatMap(({ itemId, quantity }) => {
          if (!stock.has(itemId) || quantity <= 0) return [];
          stock.set(itemId, (stock.get(itemId) ?? 0) + quantity);
          return [
            {
              itemId,
              at: toIso(ms),
              day: resupply.day,
              delta: quantity,
              reason: 'resupply' as const,
              ref: resupply.id,
              note: resupply.vehicle,
              crewMemberId: null,
            },
          ];
        }),
    });
  }

  for (let day = firstDay; day <= lastDue; day++) {
    const ms = startMs + (day - 1) * DAY_MS + USAGE_HOUR_MS;
    pending.push({
      ms,
      write: () =>
        items.flatMap((item) => {
          const seedItem = seeds.get(item.id);
          if (!seedItem) return [];
          const available = stock.get(item.id) ?? 0;
          const used = round(
            Math.min(available, dailyUse(seedItem, day, crewIds, seed)),
            item.unit,
          );
          const recovered = round(used * item.recoveryRate, item.unit);
          stock.set(item.id, available - used + recovered);
          const base = { itemId: item.id, at: toIso(ms), day, note: null, crewMemberId: null };
          const events: NewInventoryEvent[] = [];
          if (used > 0)
            events.push({ ...base, delta: -used, reason: 'consumption', ref: `day-${day}` });
          if (recovered > 0)
            events.push({ ...base, delta: recovered, reason: 'recovery', ref: `day-${day}` });
          return events;
        }),
    });
  }

  pending.sort((a, b) => a.ms - b.ms);
  if (pending.length === 0) return 0;
  // Each simulated event has a ref unique per item and reason, so if a day is ever processed
  // twice (e.g. every item ran out and no consumption was booked), nothing is written twice.
  return db.transaction(() =>
    insertInventoryEvents(
      db,
      pending.flatMap((p) => p.write()),
    ),
  );
}
