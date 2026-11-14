import type { Metric } from '@chief/shared';
import { RAMP_END_DAY, type ScenarioDefinition } from '../../../data/scenarios.js';
import { PRIOR_RADIATION_DOSE_MSV, SIMULATION } from '../../../data/simulation.js';
import { effectsFor, readingValue, toIso } from './model.js';
import { readingTimes } from './schedule.js';

export const DOSE_RATE_METRIC = 'radiation-dose-rate';
export const CUMULATIVE_DOSE_METRIC = 'cumulative-radiation-dose';

export interface HistoryRow {
  crewId: string;
  metricId: string;
  value: number;
  /** ISO 8601 UTC without milliseconds. */
  takenAt: string;
  simulated: true;
}

export interface HistoryOptions {
  crewIds: readonly string[];
  metrics: readonly Metric[];
  scenarios: readonly ScenarioDefinition[];
  /** Mission start, epoch ms. */
  startMs: number;
  /** Simulated "now", epoch ms. Nothing after it is generated. */
  endMs: number;
  seed: number;
}

/** Career dose in mSv: previous dose plus the hourly dose-rate readings (uSv/h x 1 h) added up. */
export function cumulativeDose(previousMsv: number, addedMicroSv: number): number {
  const factor = 10 ** (SIMULATION[CUMULATIVE_DOSE_METRIC]?.precision ?? 2);
  return Math.round((previousMsv + addedMicroSv / 1000) * factor) / factor;
}

/**
 * Generates the mission history from its start to the simulated "now": every metric at its own
 * cadence, with the demo scenarios planted. Deterministic for a given seed, and identical to what
 * the live simulator would have produced over the same period.
 */
export function generateHistory(options: HistoryOptions): HistoryRow[] {
  const { crewIds, metrics, scenarios, startMs, endMs, seed } = options;
  const rows: HistoryRow[] = [];

  crewIds.forEach((crewId, crewIndex) => {
    const doseRates: { ms: number; value: number }[] = [];

    for (const metric of metrics) {
      if (metric.id === CUMULATIVE_DOSE_METRIC) continue; // derived below, from the dose rate
      const effects = effectsFor(scenarios, crewId, metric.id);
      for (const ms of readingTimes(metric, crewIndex, startMs, startMs - 1, endMs)) {
        const value = readingValue({
          seed,
          crewId,
          crewIndex,
          metricId: metric.id,
          ms,
          missionStartMs: startMs,
          rampEndDay: RAMP_END_DAY,
          effects,
        });
        rows.push({ crewId, metricId: metric.id, value, takenAt: toIso(ms), simulated: true });
        if (metric.id === DOSE_RATE_METRIC) doseRates.push({ ms, value });
      }
    }

    const cumulative = metrics.find((m) => m.id === CUMULATIVE_DOSE_METRIC);
    if (!cumulative) return;
    let added = 0;
    let next = 0;
    for (const ms of readingTimes(cumulative, crewIndex, startMs, startMs - 1, endMs)) {
      while (next < doseRates.length && (doseRates[next]?.ms ?? Infinity) <= ms) {
        added += doseRates[next]?.value ?? 0;
        next++;
      }
      const value = cumulativeDose(PRIOR_RADIATION_DOSE_MSV[crewIndex] ?? 0, added);
      rows.push({ crewId, metricId: cumulative.id, value, takenAt: toIso(ms), simulated: true });
    }
  });

  return rows;
}
