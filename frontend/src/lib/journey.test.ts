import type { Hazard, InventoryItem, InventoryStock, JourneyStage, Resupply } from '@chief/shared';
import { describe, expect, it } from 'vitest';
import {
  at,
  cargoBetween,
  daysLeftText,
  forecast,
  hazardStatus,
  hazardWhen,
  px,
  qty,
  routeHazards,
  routePath,
  stageAt,
  stageState,
  stockStatus,
  vehicleName,
} from './journey';

const source = { document: 'Test' };
const hazard = (id: string, startDay: number, endDay: number): Hazard => ({
  id,
  kind: 'radiation',
  title: id,
  startDay,
  endDay,
  severity: 'caution',
  effect: '',
  preparation: '',
  simulated: true,
  source,
});
const stage = (index: number, hazards: Hazard[] = []): JourneyStage => ({
  index,
  title: `Stage ${index}`,
  summary: '',
  startDay: (index - 1) * 18 + 1,
  endDay: index * 18,
  state: 'upcoming',
  progress: 0,
  hazards,
  resupplies: [],
});
const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'melatonin',
  name: 'Melatonin',
  category: 'medication',
  unit: 'tablets',
  purpose: '',
  initialQuantity: 40,
  expectedDailyUse: 0.32,
  recoveryRate: 0,
  cautionDays: 40,
  criticalDays: 14,
  source,
  ...over,
});
const stock = (quantity: number, dailyUse: number): InventoryStock => ({
  item: item(),
  quantity,
  dailyUse,
  daysLeft: quantity / dailyUse,
  status: 'nominal',
  nextResupplyDay: 95,
  updatedAt: '2026-10-30T12:00:00Z',
});
const dragon: Resupply = {
  id: 'dragon-1',
  vehicle: 'Cargo Dragon, Commercial Resupply Services (simulated flight)',
  day: 95,
  cargo: [{ itemId: 'melatonin', quantity: 40 }],
  simulated: true,
  source,
};

describe('route geometry', () => {
  it('runs from the left edge on day 1 to the right edge on day 180', () => {
    expect(px(1)).toBeCloseTo(46);
    expect(px(180)).toBeCloseTo(954);
    expect(px(90)).toBeGreaterThan(px(60));
  });

  it('puts a positive offset above the path', () => {
    const [, onPath] = at(60);
    const [, above] = at(60, 30);
    expect(above).toBeLessThan(onPath);
  });

  it('draws a path between two days and nothing for an empty range', () => {
    expect(routePath(1, 10)).toMatch(/^M\d/);
    expect(routePath(10, 10)).toBe('');
  });
});

describe('stages and hazards', () => {
  const stages = [1, 2, 3, 4].map((i) => stage(i));

  it('marks stages done, current or upcoming from the fractional mission day', () => {
    expect(stageState(stages[0]!, 19)).toBe('done');
    expect(stageState(stages[1]!, 19)).toBe('current');
    expect(stageState(stages[1]!, 36.9)).toBe('current');
    expect(stageState(stages[2]!, 36.9)).toBe('upcoming');
    expect(stageAt(stages, 40)?.index).toBe(3);
  });

  it('lists each hazard once and keeps the daily South Atlantic Anomaly apart', () => {
    const saa = hazard('south-atlantic-anomaly', 1, 180);
    const storm = hazard('storm', 56.3, 60.8);
    const result = routeHazards([stage(1, [saa]), stage(4, [saa, storm]), stage(5, [saa, storm])]);
    expect(result.saa?.id).toBe('south-atlantic-anomaly');
    expect(result.hazards.map((h) => h.id)).toEqual(['storm']);
  });

  it('describes when a hazard happens', () => {
    const storm = hazard('storm', 56.3, 60.8);
    expect(hazardWhen(storm)).toBe('MD 56.3–60.8 · 4.5 days');
    expect(hazardWhen(hazard('beta', 48, 54))).toBe('MD 48–54 · 7 days');
    expect(hazardStatus(storm, 50)).toBe('In 7 days');
    expect(hazardStatus(storm, 58)).toBe('Active now');
    expect(hazardStatus(storm, 61)).toBe('Passed');
  });

  it('shortens vehicle names', () => {
    expect(vehicleName(dragon.vehicle)).toBe('Cargo Dragon');
    expect(vehicleName('Progress MS cargo ship (simulated flight)')).toBe('Progress MS');
  });
});

describe('stock', () => {
  it('flags caution and critical from days of supply', () => {
    expect(stockStatus(item(), 15, 0.5).status).toBe('caution');
    expect(stockStatus(item(), 20, 0.5).status).toBe('nominal');
    expect(stockStatus(item(), 5, 0.5).status).toBe('critical');
    expect(stockStatus(item(), 100, 0.5).status).toBe('nominal');
    expect(stockStatus(item(), 10, 0).daysLeft).toBe(Infinity);
  });

  it('forecasts the stock with the burn rate and the cargo ships, never below zero', () => {
    const fc = forecast(stock(10, 0.5), [dragon], 87);
    expect(fc.get(87)).toBe(10);
    expect(fc.get(94)).toBeCloseTo(6.5);
    expect(fc.get(95)).toBeCloseTo(46);
    expect(forecast(stock(1, 0.5), [], 87).get(100)).toBe(0);
  });

  it('adds up the cargo of one item between two days', () => {
    expect(cargoBetween([dragon], 'melatonin', 90, 95)).toBe(40);
    expect(cargoBetween([dragon], 'melatonin', 95, 100)).toBe(0);
    expect(cargoBetween([dragon], 'aspirin', 90, 95)).toBe(0);
  });

  it('formats counted items as whole units and kg with one decimal', () => {
    expect(qty(item(), 9.6)).toBe('10');
    expect(qty(item(), 9.6, true)).toBe('9.6');
    expect(qty(item({ unit: 'kg' }), 1288.06)).toBe('1,288.1');
    expect(qty(item(), null)).toBe('—');
    expect(daysLeftText(Infinity)).toBe('∞');
    expect(daysLeftText(6327.3)).toBe('6,327');
  });
});
