import { OSDR_BASELINES } from '../../../data/datasets.js';
import type { ScenarioDefinition, ScenarioEffect } from '../../../data/scenarios.js';
import { SIMULATION, type SimParams } from '../../../data/simulation.js';
import { createRandom, gaussian, hashString, type Random } from './random.js';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** ISO 8601 UTC without milliseconds: the only date format the database accepts. */
export function toIso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Total change that the scenario effects cause at a given mission day. */
export function effectAt(
  effects: readonly ScenarioEffect[],
  day: number,
  rampEndDay: number,
): number {
  let total = 0;
  for (const effect of effects) {
    if (day < effect.fromDay) continue;
    if (effect.kind === 'window') {
      if (day < (effect.toDay ?? rampEndDay)) total += effect.amount;
    } else if (effect.kind === 'decay') {
      const hours = (day - effect.fromDay) * 24;
      total += effect.amount * Math.exp(-hours / (effect.tauHours ?? 12));
    } else {
      const toDay = effect.toDay ?? rampEndDay;
      const progress =
        toDay > effect.fromDay ? (day - effect.fromDay) / (toDay - effect.fromDay) : 1;
      total += effect.amount * Math.min(1, progress);
    }
  }
  return total;
}

/** Effects of every scenario that applies to this crew member and metric. */
export function effectsFor(
  scenarios: readonly ScenarioDefinition[],
  crewId: string,
  metricId: string,
): ScenarioEffect[] {
  return scenarios
    .filter((s) => s.crewId === null || s.crewId === crewId)
    .flatMap((s) => s.effects)
    .filter((e) => e.metricId === metricId);
}

/** Simulation parameters of a metric for one crew member, with the real OSDR baseline if any. */
export function paramsFor(metricId: string, crewId: string): SimParams {
  const params = SIMULATION[metricId];
  if (!params) throw new Error(`No simulation parameters for metric "${metricId}"`);
  const baseline = OSDR_BASELINES[metricId]?.[crewId];
  return baseline === undefined ? params : { ...params, base: baseline, perCrew: undefined };
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

export interface ReadingInput {
  seed: number;
  crewId: string;
  crewIndex: number;
  metricId: string;
  /** Simulated time of the reading, epoch ms. */
  ms: number;
  missionStartMs: number;
  rampEndDay: number;
  effects: readonly ScenarioEffect[];
}

/**
 * The value of one reading. It depends only on its inputs (one pseudo-random stream per seed, crew
 * member, metric and instant), so the history and the live simulator produce exactly the same values
 * however the time is split into ticks.
 */
export function readingValue(input: ReadingInput): number {
  const day = (input.ms - input.missionStartMs) / DAY_MS;
  return sampleValue(paramsFor(input.metricId, input.crewId), {
    crewIndex: input.crewIndex,
    day,
    hour: (input.ms % DAY_MS) / HOUR_MS,
    effect: effectAt(input.effects, day, input.rampEndDay),
    rand: createRandom(hashString(`${input.seed}|${input.crewId}|${input.metricId}|${input.ms}`)),
  });
}
