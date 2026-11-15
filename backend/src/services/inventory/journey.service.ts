import type {
  Journey,
  JourneyStage,
  StageInventory,
  StageItemUsage,
  StageState,
} from '@chief/shared';
import { HAZARDS, RESUPPLIES, STAGES, STAGE_COUNT } from '../../../data/journey.js';
import type { Db } from '../../db/client.js';
import { getDailyTotals, getDeltasBeforeDay } from '../../db/inventory-queries.js';
import { getMissionSpan } from '../../db/queries.js';
import { NotFoundError } from '../../errors/app-error.js';
import type { MissionClock } from '../mission-clock.js';
import type { InventoryService } from './inventory.service.js';
import { DAY_MS } from './simulate.js';

const round = (value: number) => Math.round(value * 100) / 100;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The mission route: 10 stages along the mission timeline with CHIEF's position, the hazards to
 * prepare for, the cargo ships, and what the inventory did (or is expected to do) in each stage.
 */
export class JourneyService {
  constructor(
    private readonly db: Db,
    private readonly clock: MissionClock,
    private readonly inventory: InventoryService,
  ) {}

  /** Days flown since the mission start, fractional (0 at launch). */
  private elapsedDays(): number {
    return (this.clock.now().getTime() - getMissionSpan(this.db).startMs) / DAY_MS;
  }

  private stageLength(): number {
    return getMissionSpan(this.db).lengthDays / STAGE_COUNT;
  }

  journey(): Journey {
    const { lengthDays } = getMissionSpan(this.db);
    const elapsed = this.elapsedDays();
    const stages = STAGES.map((_, i) => this.stage(i + 1, elapsed));
    return {
      missionDay: Math.min(lengthDays, Math.floor(elapsed) + 1),
      missionLengthDays: lengthDays,
      progress: Math.round(clamp01(elapsed / lengthDays) * 1000) / 1000,
      currentStage: Math.min(STAGE_COUNT, Math.floor(elapsed / this.stageLength()) + 1),
      stages,
    };
  }

  private stage(index: number, elapsed: number): JourneyStage {
    const seed = STAGES[index - 1];
    if (!seed) throw new NotFoundError(`Stage ${index} not found`);
    const length = this.stageLength();
    const startDay = Math.round((index - 1) * length) + 1;
    const endDay = Math.round(index * length);
    const progress = clamp01((elapsed - (startDay - 1)) / (endDay - startDay + 1));
    const state: StageState =
      progress >= 1 ? 'done' : elapsed >= startDay - 1 ? 'current' : 'upcoming';
    return {
      index,
      title: seed.title,
      summary: seed.summary,
      startDay,
      endDay,
      state,
      progress: Math.round(progress * 1000) / 1000,
      hazards: HAZARDS.filter((h) => h.startDay < endDay + 1 && h.endDay >= startDay),
      resupplies: RESUPPLIES.filter((r) => r.day >= startDay && r.day <= endDay),
    };
  }

  /** Stock at the start and end of a stage and what was used, reclaimed, delivered or corrected. */
  stageInventory(index: number): StageInventory {
    if (!Number.isInteger(index) || index < 1 || index > STAGE_COUNT)
      throw new NotFoundError(`Stage ${index} not found`);
    const elapsed = this.elapsedDays();
    const stage = this.stage(index, elapsed);
    const items = this.inventory.items();

    if (stage.state === 'upcoming') return { stage, items: this.projected(stage, elapsed) };

    const before = getDeltasBeforeDay(this.db, stage.startDay);
    const totals = getDailyTotals(this.db, stage.startDay, stage.endDay);
    return {
      stage,
      items: items.map((item): StageItemUsage => {
        const sums = { consumption: 0, recovery: 0, resupply: 0, adjustment: 0 };
        for (const row of totals) if (row.itemId === item.id) sums[row.reason] += row.total;
        const start = item.initialQuantity + (before.get(item.id) ?? 0);
        return {
          item,
          startQuantity: round(start),
          endQuantity: round(
            start + sums.consumption + sums.recovery + sums.resupply + sums.adjustment,
          ),
          consumed: round(-sums.consumption),
          recovered: round(sums.recovery),
          resupplied: round(sums.resupply),
          adjusted: round(sums.adjustment),
          projected: false,
        };
      }),
    };
  }

  /** Forecast for a stage not reached yet: today's burn rate from now on, plus the cargo ships due. */
  private projected(stage: JourneyStage, elapsed: number): StageItemUsage[] {
    const days = stage.endDay - stage.startDay + 1;
    const cargo = (itemId: string, fromDay: number, toDay: number) =>
      RESUPPLIES.filter((r) => r.day > fromDay && r.day <= toDay)
        .flatMap((r) => r.cargo)
        .filter((c) => c.itemId === itemId)
        .reduce((total, c) => total + c.quantity, 0);
    return this.inventory.stocks().map(({ item, quantity: now, dailyUse: net }): StageItemUsage => {
      // Gross use: what the crew uses before life support gives part of it back.
      const gross = net / (1 - item.recoveryRate);
      const daysUntil = stage.startDay - 1 - elapsed;
      const atStart = Math.max(
        0,
        now - net * daysUntil + cargo(item.id, elapsed, stage.startDay - 1),
      );
      const resupplied = cargo(item.id, stage.startDay - 1, stage.endDay);
      return {
        item,
        startQuantity: null,
        endQuantity: round(Math.max(0, atStart - net * days + resupplied)),
        consumed: round(gross * days),
        recovered: round(gross * item.recoveryRate * days),
        resupplied,
        adjusted: 0,
        projected: true,
      };
    });
  }
}
