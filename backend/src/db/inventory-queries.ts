import type { InventoryEvent, InventoryItem, InventoryReason } from '@chief/shared';
import { and, asc, eq, gte, inArray, lt, lte, max, sum } from 'drizzle-orm';
import type { Db } from './client.js';
import { inventoryEvents, inventoryItems } from './schema.js';

/** Database access for the ship's inventory (items and the ledger of stock changes). */

export type NewInventoryEvent = Omit<InventoryEvent, 'id'> & { ref: string | null };

export function getInventoryItems(db: Db): InventoryItem[] {
  return db.select().from(inventoryItems).orderBy(asc(inventoryItems.id)).all();
}

export function getInventoryItem(db: Db, id: string): InventoryItem | null {
  return db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get() ?? null;
}

/** Sum of every delta per item: stock = initial quantity + this. */
export function getStockDeltas(db: Db): Map<string, number> {
  const rows = db
    .select({ itemId: inventoryEvents.itemId, total: sum(inventoryEvents.delta) })
    .from(inventoryEvents)
    .groupBy(inventoryEvents.itemId)
    .all();
  return new Map(rows.map((r) => [r.itemId, Number(r.total ?? 0)]));
}

export interface ReasonTotal {
  itemId: string;
  day: number;
  reason: InventoryReason;
  total: number;
}

/** Totals per item, mission day and reason, for days in [fromDay, toDay]. */
export function getDailyTotals(
  db: Db,
  fromDay: number,
  toDay: number,
  itemId?: string,
): ReasonTotal[] {
  const filters = [gte(inventoryEvents.day, fromDay), lte(inventoryEvents.day, toDay)];
  if (itemId) filters.push(eq(inventoryEvents.itemId, itemId));
  return db
    .select({
      itemId: inventoryEvents.itemId,
      day: inventoryEvents.day,
      reason: inventoryEvents.reason,
      total: sum(inventoryEvents.delta),
    })
    .from(inventoryEvents)
    .where(and(...filters))
    .groupBy(inventoryEvents.itemId, inventoryEvents.day, inventoryEvents.reason)
    .orderBy(asc(inventoryEvents.day))
    .all()
    .map((r) => ({ ...r, total: Number(r.total ?? 0) }));
}

/** Sum of deltas per item before a mission day (stock at the start of that day minus initial). */
export function getDeltasBeforeDay(db: Db, day: number): Map<string, number> {
  const rows = db
    .select({ itemId: inventoryEvents.itemId, total: sum(inventoryEvents.delta) })
    .from(inventoryEvents)
    .where(lt(inventoryEvents.day, day))
    .groupBy(inventoryEvents.itemId)
    .all();
  return new Map(rows.map((r) => [r.itemId, Number(r.total ?? 0)]));
}

/** Last mission day whose daily use is already in the ledger (0 if none). */
export function getLastUsageDay(db: Db): number {
  const row = db
    .select({ day: max(inventoryEvents.day) })
    .from(inventoryEvents)
    .where(eq(inventoryEvents.reason, 'consumption'))
    .get();
  return row?.day ?? 0;
}

/** Refs of the resupplies already delivered. */
export function getDeliveredResupplies(db: Db): Set<string> {
  const rows = db
    .selectDistinct({ ref: inventoryEvents.ref })
    .from(inventoryEvents)
    .where(eq(inventoryEvents.reason, 'resupply'))
    .all();
  return new Set(rows.flatMap((r) => (r.ref ? [r.ref] : [])));
}

/** Resupplies and crew adjustments of one item, oldest first. */
export function getNotableEvents(db: Db, itemId: string): InventoryEvent[] {
  return db
    .select()
    .from(inventoryEvents)
    .where(
      and(
        eq(inventoryEvents.itemId, itemId),
        inArray(inventoryEvents.reason, ['resupply', 'adjustment']),
      ),
    )
    .orderBy(asc(inventoryEvents.at), asc(inventoryEvents.id))
    .all()
    .map(toEvent);
}

/** Writes events; simulated ones already in the ledger (same item, reason and ref) are skipped. */
export function insertInventoryEvents(db: Db, events: NewInventoryEvent[]): number {
  let written = 0;
  for (const e of events) {
    const result = db
      .insert(inventoryEvents)
      .values({
        itemId: e.itemId,
        at: e.at,
        day: e.day,
        delta: e.delta,
        reason: e.reason,
        ref: e.ref,
        note: e.note,
        crewId: e.crewMemberId,
      })
      .onConflictDoNothing()
      .run();
    written += result.changes;
  }
  return written;
}

function toEvent(row: typeof inventoryEvents.$inferSelect): InventoryEvent {
  return {
    id: String(row.id),
    itemId: row.itemId,
    at: row.at,
    day: row.day,
    delta: row.delta,
    reason: row.reason,
    note: row.note,
    crewMemberId: row.crewId,
  };
}
