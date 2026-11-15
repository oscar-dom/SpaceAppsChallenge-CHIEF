import type { SourceReference } from './metrics.js';
import type { Status } from './status.js';

/**
 * JOURNEY: the mission drawn as a route of 10 stages, the hazards along it, and the ship's
 * inventory of medication and supplies. The mission is an ISS increment, so the "route" is the
 * mission timeline: CHIEF (the ship) moves along it as the mission clock advances.
 */

/** What a hazard does to the crew. */
export const HAZARD_KINDS = ['radiation', 'thermal'] as const;
export type HazardKind = (typeof HAZARD_KINDS)[number];

/** Something along the route that can harm the crew's health, so they can prepare for it. */
export interface Hazard {
  /** Stable kebab-case id, e.g. "solar-particle-event". */
  id: string;
  kind: HazardKind;
  title: string;
  /** 1-based mission days, inclusive. Fractional days place an event inside a day. */
  startDay: number;
  endDay: number;
  /** How hard it can hit: `caution` (prepare) or `critical` (act, shelter or limit exposure). */
  severity: Exclude<Status, 'nominal'>;
  /** Why it matters for health. */
  effect: string;
  /** What the crew should do before and during it. */
  preparation: string;
  /** True when the timing is simulated (the phenomenon and its effects are real). */
  simulated: boolean;
  source: SourceReference;
}

/** A cargo ship that docks and refills the inventory. */
export interface Resupply {
  /** e.g. "progress-ms-31". */
  id: string;
  /** Vehicle, e.g. "Progress MS (simulated flight)". */
  vehicle: string;
  /** 1-based mission day it docks. */
  day: number;
  /** Units delivered per inventory item. */
  cargo: { itemId: string; quantity: number }[];
  simulated: boolean;
  source: SourceReference;
}

export type StageState = 'done' | 'current' | 'upcoming';

/** One of the 10 points of the route. */
export interface JourneyStage {
  /** 1..10. */
  index: number;
  title: string;
  /** What happens in this part of the mission. */
  summary: string;
  /** 1-based mission days, inclusive. */
  startDay: number;
  endDay: number;
  state: StageState;
  /** 0..1 of the stage already flown. */
  progress: number;
  /** Hazards that overlap the stage. */
  hazards: Hazard[];
  /** Cargo ships docking during the stage. */
  resupplies: Resupply[];
}

/** GET /api/journey */
export interface Journey {
  missionDay: number;
  missionLengthDays: number;
  /** 0..1 of the whole mission flown. */
  progress: number;
  /** Index of the stage CHIEF is in now. */
  currentStage: number;
  stages: JourneyStage[];
}

// --- inventory -------------------------------------------------------------------------------------

export const INVENTORY_CATEGORIES = ['medication', 'food', 'water'] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

/** Why the stock of an item changed. */
export const INVENTORY_REASONS = [
  /** Daily use by the crew (simulated). */
  'consumption',
  /** Water reclaimed by the life support system. */
  'recovery',
  /** A cargo ship docked. */
  'resupply',
  /** A crew member corrected the count by hand. */
  'adjustment',
] as const;
export type InventoryReason = (typeof INVENTORY_REASONS)[number];

/** An item the ship carries. */
export interface InventoryItem {
  /** Stable kebab-case id, e.g. "food-packaged". */
  id: string;
  name: string;
  category: InventoryCategory;
  /** e.g. "kg", "tablets", "doses". */
  unit: string;
  /** What the item is for. */
  purpose: string;
  /** Stock at mission start. */
  initialQuantity: number;
  /** Expected gross use per day for the whole crew, from the sources below. */
  expectedDailyUse: number;
  /** Share of the use the life support system gives back (water: 0.98 on the ISS), else 0. */
  recoveryRate: number;
  /** Below this many days of supply the item is `caution`, below `criticalDays` it is `critical`. */
  cautionDays: number;
  criticalDays: number;
  /** Where the use rate comes from. */
  source: SourceReference;
}

/** Current stock of an item (GET /api/inventory). */
export interface InventoryStock {
  item: InventoryItem;
  quantity: number;
  /**
   * Net use per day (use minus recovery) averaged over the last 14 finished days; the expected
   * use before the mission has 14 days behind it. This is the burn rate the crew sees.
   */
  dailyUse: number;
  /** Days of supply left at `dailyUse`; null when nothing is being used. */
  daysLeft: number | null;
  /** `nominal` while above `cautionDays` of supply. */
  status: Status;
  /** Mission day of the next resupply that brings this item, if any. */
  nextResupplyDay: number | null;
  updatedAt: string;
}

/** One change in the stock. Stock = initial quantity + sum of every delta. */
export interface InventoryEvent {
  id: string;
  itemId: string;
  /** Simulated time, ISO 8601. */
  at: string;
  /** 1-based mission day. */
  day: number;
  /** Positive adds stock, negative removes it. */
  delta: number;
  reason: InventoryReason;
  /** Free text: the vehicle of a resupply, or the crew member's note on an adjustment. */
  note: string | null;
  /** Crew member who made an adjustment. */
  crewMemberId: string | null;
}

/** Stock of an item at the end of one mission day (GET /api/inventory/:itemId/history). */
export interface InventoryDay {
  day: number;
  quantity: number;
  consumed: number;
  recovered: number;
  resupplied: number;
  adjusted: number;
}

/** A resupply or crew adjustment with the stock right after it. */
export interface InventoryLogEntry extends InventoryEvent {
  quantityAfter: number;
}

export interface InventoryHistory {
  item: InventoryItem;
  days: InventoryDay[];
  /** Resupplies and crew adjustments, oldest first (daily use is summed up in `days`). */
  events: InventoryLogEntry[];
}

/** What one item did during one stage (GET /api/journey/stages/:index/inventory). */
export interface StageItemUsage {
  item: InventoryItem;
  /** Stock when the stage started; null for an upcoming stage. */
  startQuantity: number | null;
  /** Stock at the end of the stage, or now for the current one; projected for upcoming ones. */
  endQuantity: number;
  consumed: number;
  recovered: number;
  resupplied: number;
  adjusted: number;
  /** True when the figures are a forecast at the expected use (upcoming stage). */
  projected: boolean;
}

export interface StageInventory {
  stage: JourneyStage;
  items: StageItemUsage[];
}

/** POST /api/inventory/:itemId/adjust */
export interface InventoryAdjustRequest {
  /** Units to add (positive) or remove (negative). Not zero. */
  delta: number;
  /** Why, e.g. "Recount after stowage", "Used 2 for C003's headache". Up to 200 characters. */
  note?: string;
  /** Crew member making the change. */
  crewMemberId?: string;
}
