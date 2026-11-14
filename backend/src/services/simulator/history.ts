import type { Metric } from '@chief/shared';
import { PRIOR_RADIATION_DOSE_MSV, SIMULATION } from '../../../data/simulation.js';
import type { ScenarioDefinition } from '../../../data/scenarios.js';
import { effectAt, sampleValue } from './model.js';
import { createRandom } from './random.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

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

export function toIso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Generates the mission history from its start to the simulated "now": every metric at its own
 * cadence, with the demo scenarios planted. Deterministic for a given seed.
 */
export function generateHistory(options: HistoryOptions): HistoryRow[] {
  const { crewIds, metrics, scenarios, startMs, endMs, seed } = options;
  const rand = createRandom(seed);
  const endDay = (endMs - startMs) / DAY;
  const rows: HistoryRow[] = [];

  crewIds.forEach((crewId, crewIndex) => {
    const effectsFor = (metricId: string) =>
      scenarios
        .filter((s) => s.crewId === null || s.crewId === crewId)
        .flatMap((s) => s.effects)
        .filter((e) => e.metricId === metricId);

    const doseSeries: { ms: number; rate: number }[] = [];

    for (const metric of metrics) {
      const params = SIMULATION[metric.id];
      if (!params) throw new Error(`No simulation parameters for metric "${metric.id}"`);
      if (metric.id === 'cumulative-radiation-dose') continue; // derived below, from the dose rate
      const effects = effectsFor(metric.id);

      const push = (ms: number) => {
        const day = (ms - startMs) / DAY;
        const value = sampleValue(params, {
          crewIndex,
          day,
          hour: (ms % DAY) / HOUR,
          effect: effectAt(effects, day, endDay),
          rand,
        });
        rows.push({ crewId, metricId: metric.id, value, takenAt: toIso(ms), simulated: true });
        if (metric.id === 'radiation-dose-rate') doseSeries.push({ ms, rate: value });
      };

      if (metric.cadenceMinutes < 1440) {
        for (let ms = startMs; ms <= endMs; ms += metric.cadenceMinutes * MINUTE) push(ms);
      } else {
        const periodDays = Math.round(metric.cadenceMinutes / 1440);
        for (let day = 0; ; day++) {
          const ms = startMs + day * DAY + (params.atHour ?? 9) * HOUR;
          if (ms > endMs) break;
          if ((day + crewIndex) % periodDays === 0) push(ms);
        }
      }
    }

    // Cumulative career dose: previous flights plus the integral of the dose rate (hourly samples).
    const cumulative = metrics.find((m) => m.id === 'cumulative-radiation-dose');
    if (cumulative) {
      const params = SIMULATION[cumulative.id];
      const prior = PRIOR_RADIATION_DOSE_MSV[crewIndex] ?? 0;
      const factor = 10 ** (params?.precision ?? 2);
      for (let day = 0; ; day++) {
        const ms = startMs + day * DAY + (params?.atHour ?? 23) * HOUR;
        if (ms > endMs) break;
        let microSv = 0;
        for (const sample of doseSeries) if (sample.ms <= ms) microSv += sample.rate; // 1 h each
        const value = Math.round((prior + microSv / 1000) * factor) / factor;
        rows.push({ crewId, metricId: cumulative.id, value, takenAt: toIso(ms), simulated: true });
      }
    }
  });

  return rows;
}
