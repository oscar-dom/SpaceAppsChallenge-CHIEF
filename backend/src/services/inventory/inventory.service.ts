import { EventEmitter } from 'node:events';
import type {
  InventoryAdjustRequest,
  InventoryDay,
  InventoryHistory,
  InventoryItem,
  InventoryStock,
  Status,
} from '@chief/shared';
import { RESUPPLIES } from '../../../data/journey.js';
import type { Db } from '../../db/client.js';
import {
  getDailyTotals,
  getInventoryItem,
  getInventoryItems,
  getNotableEvents,
  getStockDeltas,
  insertInventoryEvents,
} from '../../db/inventory-queries.js';
import { getCrew, getMissionSpan } from '../../db/queries.js';
import { NotFoundError, ValidationError } from '../../errors/app-error.js';
import type { MissionClock } from '../mission-clock.js';
import { DAY_MS, catchUpInventory } from './simulate.js';

export interface InventoryEvents {
  /** The stock of one or more items changed. */
  changed: [];
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Net use per day: what the crew uses minus what life support gives back. */
export function netDailyUse(item: InventoryItem): number {
  return item.expectedDailyUse * (1 - item.recoveryRate);
}

/** Days of recent use that set the burn rate. */
export const RECENT_DAYS = 14;

/**
 * Inventory status from days of supply at `dailyUse` (net units per day). Logistics, not health:
 * same colours, own thresholds.
 */
export function stockStatus(
  item: InventoryItem,
  quantity: number,
  dailyUse: number,
): { daysLeft: number | null; status: Status } {
  const net = dailyUse;
  if (net <= 0) return { daysLeft: null, status: 'nominal' };
  const daysLeft = Math.round((quantity / net) * 10) / 10;
  const status: Status =
    daysLeft < item.criticalDays ? 'critical' : daysLeft < item.cautionDays ? 'caution' : 'nominal';
  return { daysLeft, status };
}

/**
 * The ship's inventory: current stock, day-by-day history and crew adjustments. Stock is never
 * stored; it is the initial quantity plus the ledger. `catchUp()` books the simulated daily use
 * and resupplies up to the mission clock (the live loop calls it on every tick).
 */
export class InventoryService extends EventEmitter<InventoryEvents> {
  constructor(
    private readonly db: Db,
    private readonly clock: MissionClock,
    private readonly seed = 42,
  ) {
    super();
  }

  private get startMs(): number {
    return getMissionSpan(this.db).startMs;
  }

  /** Mission day (1-based) of a time. */
  dayOf(ms: number): number {
    return Math.floor((ms - this.startMs) / DAY_MS) + 1;
  }

  /** Books simulated use and resupplies up to now. Emits `changed` when anything was written. */
  catchUp(): number {
    const { startMs, lengthDays } = getMissionSpan(this.db);
    const written = catchUpInventory(this.db, {
      startMs,
      nowMs: this.clock.now().getTime(),
      lengthDays,
      seed: this.seed,
    });
    if (written > 0) this.emit('changed');
    return written;
  }

  items(): InventoryItem[] {
    return getInventoryItems(this.db);
  }

  private item(itemId: string): InventoryItem {
    const item = getInventoryItem(this.db, itemId);
    if (!item) throw new NotFoundError(`Inventory item ${itemId} not found`);
    return item;
  }

  /** Current stock of every item. */
  stocks(): InventoryStock[] {
    const deltas = getStockDeltas(this.db);
    const recent = this.recentUse();
    return this.items().map((item) =>
      this.toStock(item, item.initialQuantity + (deltas.get(item.id) ?? 0), recent),
    );
  }

  stock(itemId: string): InventoryStock {
    const item = this.item(itemId);
    const quantity = item.initialQuantity + (getStockDeltas(this.db).get(itemId) ?? 0);
    return this.toStock(item, quantity, this.recentUse(itemId));
  }

  /**
   * Net use per day over the last RECENT_DAYS finished days, per item. Early in the mission, with
   * fewer days behind, it falls back to the expected use.
   */
  private recentUse(itemId?: string): Map<string, number> {
    const today = this.dayOf(this.clock.now().getTime());
    const from = today - RECENT_DAYS;
    const used = new Map<string, number>();
    if (from < 1) return used;
    for (const row of getDailyTotals(this.db, from, today - 1, itemId)) {
      if (row.reason !== 'consumption' && row.reason !== 'recovery') continue;
      used.set(row.itemId, (used.get(row.itemId) ?? 0) - row.total);
    }
    for (const [id, total] of used) used.set(id, Math.max(0, total / RECENT_DAYS));
    return used;
  }

  private toStock(
    item: InventoryItem,
    quantity: number,
    recent: Map<string, number>,
  ): InventoryStock {
    const dailyUse = recent.get(item.id) ?? netDailyUse(item);
    const now = this.clock.now().getTime();
    const next = RESUPPLIES.filter(
      (r) =>
        r.cargo.some((c) => c.itemId === item.id) &&
        this.startMs + (r.day - 1) * DAY_MS + 12 * 3_600_000 > now,
    ).sort((a, b) => a.day - b.day)[0];
    return {
      item,
      quantity: round(quantity),
      dailyUse: Math.round(dailyUse * 1000) / 1000,
      ...stockStatus(item, quantity, dailyUse),
      nextResupplyDay: next?.day ?? null,
      updatedAt: this.clock.nowIso(),
    };
  }

  /** Stock at the end of each mission day so far, with what was used, reclaimed, delivered or corrected. */
  history(itemId: string): InventoryHistory {
    const item = this.item(itemId);
    const today = this.dayOf(this.clock.now().getTime());
    const byDay = new Map<number, InventoryDay>();
    for (let day = 1; day <= today; day++)
      byDay.set(day, { day, quantity: 0, consumed: 0, recovered: 0, resupplied: 0, adjusted: 0 });
    for (const row of getDailyTotals(this.db, 1, today, itemId)) {
      const entry = byDay.get(row.day);
      if (!entry) continue;
      if (row.reason === 'consumption') entry.consumed += -row.total;
      else if (row.reason === 'recovery') entry.recovered += row.total;
      else if (row.reason === 'resupply') entry.resupplied += row.total;
      else entry.adjusted += row.total;
    }
    let quantity = item.initialQuantity;
    const days = [...byDay.values()].map((d) => {
      quantity += -d.consumed + d.recovered + d.resupplied + d.adjusted;
      return {
        day: d.day,
        quantity: round(quantity),
        consumed: round(d.consumed),
        recovered: round(d.recovered),
        resupplied: round(d.resupplied),
        adjusted: round(d.adjusted),
      };
    });
    return { item, days, events: getNotableEvents(this.db, itemId) };
  }

  /** A crew member corrects the count: adds or removes units. The stock can never go below zero. */
  adjust(itemId: string, request: InventoryAdjustRequest): InventoryStock {
    const item = this.item(itemId);
    if (request.crewMemberId && !getCrew(this.db).some((c) => c.id === request.crewMemberId))
      throw new NotFoundError(`Crew member ${request.crewMemberId} not found`);
    const current = this.stock(itemId).quantity;
    if (current + request.delta < 0)
      throw new ValidationError(
        `Cannot remove ${-request.delta} ${item.unit}: only ${current} ${item.unit} of ${item.name} left`,
      );
    const now = this.clock.now();
    insertInventoryEvents(this.db, [
      {
        itemId,
        at: this.clock.nowIso(),
        day: this.dayOf(now.getTime()),
        delta: request.delta,
        reason: 'adjustment',
        ref: null,
        note: request.note?.trim() || null,
        crewMemberId: request.crewMemberId ?? null,
      },
    ]);
    this.emit('changed');
    return this.stock(itemId);
  }
}
