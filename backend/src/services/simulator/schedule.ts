import type { Metric } from '@chief/shared';
import { SIMULATION } from '../../../data/simulation.js';
import { DAY_MS, HOUR_MS, MINUTE_MS } from './model.js';

/**
 * When a metric is read, on a fixed grid from the mission start:
 *  - cadence under a day: every `cadenceMinutes` (e.g. hourly sensors at :00);
 *  - daily or slower: once on the reading days, at the metric's `atHour` (UTC). Metrics read every
 *    N days are staggered by crew member so the crew is not measured on the same day.
 *
 * Returns the reading times in `(afterMs, untilMs]`, oldest first.
 */
export function readingTimes(
  metric: Pick<Metric, 'id' | 'cadenceMinutes'>,
  crewIndex: number,
  missionStartMs: number,
  afterMs: number,
  untilMs: number,
): number[] {
  const times: number[] = [];
  if (untilMs <= afterMs) return times;

  if (metric.cadenceMinutes < 1440) {
    const step = metric.cadenceMinutes * MINUTE_MS;
    const first = Math.max(0, Math.floor((afterMs - missionStartMs) / step) + 1);
    for (let k = first; ; k++) {
      const ms = missionStartMs + k * step;
      if (ms > untilMs) break;
      times.push(ms);
    }
    return times;
  }

  const periodDays = Math.max(1, Math.round(metric.cadenceMinutes / 1440));
  const atHour = SIMULATION[metric.id]?.atHour ?? 9;
  const firstDay = Math.max(0, Math.floor((afterMs - missionStartMs) / DAY_MS));
  for (let day = firstDay; ; day++) {
    const ms = missionStartMs + day * DAY_MS + atHour * HOUR_MS;
    if (ms > untilMs) break;
    if (ms > afterMs && (day + crewIndex) % periodDays === 0) times.push(ms);
  }
  return times;
}
