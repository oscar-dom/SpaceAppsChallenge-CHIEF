import type { ScenarioEffect } from '../../../data/scenarios.js';
import type { SimParams } from '../../../data/simulation.js';
import { gaussian, type Random } from './random.js';

/** Total change that the scenario effects cause at a given mission day. */
export function effectAt(effects: readonly ScenarioEffect[], day: number, endDay: number): number {
  let total = 0;
  for (const effect of effects) {
    const toDay = effect.toDay ?? endDay;
    if (effect.kind === 'window') {
      if (day >= effect.fromDay && day < toDay) total += effect.amount;
    } else if (day >= effect.fromDay) {
      const progress =
        toDay > effect.fromDay ? (day - effect.fromDay) / (toDay - effect.fromDay) : 1;
      total += effect.amount * Math.min(1, progress);
    }
  }
  return total;
}

export interface SampleContext {
  crewIndex: number;
  /** Days since the mission start (fractional). */
  day: number;
  /** UTC hour of the day, 0-24. */
  hour: number;
  /** Sum of the scenario effects at this moment. */
  effect: number;
  rand: Random;
}

/** One simulated value of a metric. Pure: all randomness comes from `ctx.rand`. */
export function sampleValue(params: SimParams, ctx: SampleContext): number {
  const cycle = params.daily
    ? params.daily.amp * Math.cos(((ctx.hour - params.daily.peakHour) / 24) * 2 * Math.PI)
    : 0;
  let value =
    params.base +
    (params.perCrew?.[ctx.crewIndex] ?? 0) +
    (params.trendPerDay ?? 0) * ctx.day +
    cycle +
    ctx.effect +
    (params.noise > 0 ? gaussian(ctx.rand, 0, params.noise) : 0);
  if (params.min !== undefined) value = Math.max(params.min, value);
  if (params.max !== undefined) value = Math.min(params.max, value);
  const factor = 10 ** params.precision;
  return Math.round(value * factor) / factor;
}
