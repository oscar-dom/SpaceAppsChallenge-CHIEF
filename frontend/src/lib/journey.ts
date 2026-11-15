import type {
  Hazard,
  InventoryItem,
  InventoryStock,
  JourneyStage,
  Resupply,
  StageState,
} from '@chief/shared';

/**
 * Pure helpers of the JOURNEY views: where things sit on the route map, the stage CHIEF is
 * in, stock forecasts and number formatting. "Day" is the 1-based mission day with a fraction
 * (day 61.25 is 06:00 of mission day 61), so day 1.0 is launch and day 181.0 the return.
 */

export const ROUTE_DAYS = 180;

// --- route map geometry (SVG viewBox 1000 × 270) -------------------------------------------------

export const MAP_W = 1000;
export const MAP_H = 270;
const X0 = 46;
const X1 = 954;
const CY = 135;
const AMP = 24;

/** A gentle wave across the map: day 1 on the left, day 180 on the right. */
export function px(day: number): number {
  return X0 + ((day - 1) / (ROUTE_DAYS - 1)) * (X1 - X0);
}
export function py(day: number): number {
  return CY - AMP * Math.sin(((day - 1) / (ROUTE_DAYS - 1)) * Math.PI * 2.1 + 0.35);
}

/** A point `offset` units to the side of the route at `day` (positive: above the path). */
export function at(day: number, offset = 0): [number, number] {
  const tx = px(day + 0.5) - px(day - 0.5);
  const ty = py(day + 0.5) - py(day - 0.5);
  const len = Math.hypot(tx, ty);
  return [px(day) + (ty / len) * offset, py(day) - (tx / len) * offset];
}

/** SVG path along the route between two days, optionally shifted to one side. */
export function routePath(from: number, to: number, offset = 0): string {
  if (to <= from) return '';
  const points: [number, number][] = [];
  for (let d = from; d < to; d += 0.5) points.push(at(d, offset));
  points.push(at(to, offset));
  return 'M' + points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
}

/** Position as CSS percentages of the map box, for HTML elements laid over the SVG. */
export function pct([x, y]: [number, number]): { left: string; top: string } {
  return { left: `${((x / MAP_W) * 100).toFixed(2)}%`, top: `${((y / MAP_H) * 100).toFixed(2)}%` };
}

// --- mission position ----------------------------------------------------------------------------

export function stageState(stage: JourneyStage, day: number): StageState {
  if (day >= stage.endDay + 1) return 'done';
  if (day >= stage.startDay) return 'current';
  return 'upcoming';
}

export function stageAt(stages: JourneyStage[], day: number): JourneyStage | undefined {
  return stages.find((s) => day >= s.startDay && day < s.endDay + 1) ?? stages[stages.length - 1];
}

/** Hazards of the route, once each, with the South Atlantic Anomaly (every day) apart. */
export function routeHazards(stages: JourneyStage[]): { saa: Hazard | null; hazards: Hazard[] } {
  const seen = new Map<string, Hazard>();
  for (const stage of stages) for (const h of stage.hazards) seen.set(h.id, h);
  const saa = seen.get('south-atlantic-anomaly') ?? null;
  seen.delete('south-atlantic-anomaly');
  return { saa, hazards: [...seen.values()].sort((a, b) => a.startDay - b.startDay) };
}

export function routeResupplies(stages: JourneyStage[]): Resupply[] {
  return stages.flatMap((s) => s.resupplies).sort((a, b) => a.day - b.day);
}

export function hazardStatus(h: Hazard, day: number): string {
  if (h.id === 'south-atlantic-anomaly') return 'Several passes a day';
  if (h.endDay < day) return 'Passed';
  if (h.startDay <= day) return 'Active now';
  return `In ${Math.ceil(h.startDay - day)} days`;
}

export function hazardWhen(h: Hazard): string {
  if (h.id === 'south-atlantic-anomaly') return `Daily · MD 1–${ROUTE_DAYS}`;
  const whole = Number.isInteger(h.startDay) && Number.isInteger(h.endDay);
  const days = whole ? h.endDay - h.startDay + 1 : Math.round((h.endDay - h.startDay) * 10) / 10;
  return `MD ${dayText(h.startDay)}–${dayText(h.endDay)} · ${days} days`;
}

/** "Progress MS cargo ship (simulated flight)" → "Progress MS". */
export function vehicleName(vehicle: string): string {
  return vehicle
    .split(',')[0]!
    .replace(/ cargo ship.*$/, '')
    .replace(/ \(.*\)/, '');
}

// --- stock -----------------------------------------------------------------------------------------

/** Units counted one by one (no decimals). */
export function isDiscrete(item: InventoryItem): boolean {
  return item.unit !== 'kg';
}

export function stockStatus(item: InventoryItem, quantity: number, dailyUse: number) {
  const daysLeft = dailyUse > 0 ? quantity / dailyUse : Infinity;
  const status =
    daysLeft < item.criticalDays ? 'critical' : daysLeft < item.cautionDays ? 'caution' : 'nominal';
  return { daysLeft, status } as const;
}

/** Cargo of one item delivered by the ships docking in (fromDay, toDay]. */
export function cargoBetween(
  resupplies: Resupply[],
  itemId: string,
  fromDay: number,
  toDay: number,
): number {
  return resupplies
    .filter((r) => r.day > fromDay && r.day <= toDay)
    .flatMap((r) => r.cargo)
    .filter((c) => c.itemId === itemId)
    .reduce((total, c) => total + c.quantity, 0);
}

/**
 * Expected stock at the end of each mission day from today to the return: today's burn rate
 * (net use over the last 14 days) plus the cargo ships. Index = mission day.
 */
export function forecast(
  stock: InventoryStock,
  resupplies: Resupply[],
  today: number,
  lastDay = ROUTE_DAYS,
): Map<number, number> {
  const out = new Map<number, number>([[today, stock.quantity]]);
  let q = stock.quantity;
  for (let d = today + 1; d <= lastDay; d++) {
    q = Math.max(0, q - stock.dailyUse) + cargoBetween(resupplies, stock.item.id, d - 1, d);
    out.set(d, q);
  }
  return out;
}

// --- formatting ------------------------------------------------------------------------------------

export function dayText(day: number): string {
  return Number.isInteger(day) ? String(day) : day.toFixed(1);
}

export function num(value: number, decimals = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Quantity in the item's unit: whole units for counted items, one decimal for kg. */
export function qty(
  item: InventoryItem,
  value: number | null | undefined,
  projected = false,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return isDiscrete(item) && !projected ? num(Math.round(value)) : num(value, 1);
}

export function daysLeftText(daysLeft: number): string {
  if (!Number.isFinite(daysLeft)) return '∞';
  return daysLeft > 999 ? num(Math.round(daysLeft)) : num(daysLeft, 0);
}
