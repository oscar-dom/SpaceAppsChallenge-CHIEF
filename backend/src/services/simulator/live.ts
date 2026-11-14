import { EventEmitter } from 'node:events';
import type { CrewMember, Measurement, Metric, MissionClock } from '@chief/shared';
import {
  LIVE_SCENARIOS,
  RAMP_END_DAY,
  SCENARIOS,
  type ScenarioDefinition,
} from '../../../data/scenarios.js';
import { PRIOR_RADIATION_DOSE_MSV } from '../../../data/simulation.js';
import type { Db } from '../../db/client.js';
import {
  getCrew,
  getLatestMeasurementBefore,
  getMetrics,
  getMissionClock,
  insertMeasurement,
  setMissionTime,
  sumMeasurementValues,
} from '../../db/queries.js';
import { mission } from '../../db/schema.js';
import { CUMULATIVE_DOSE_METRIC, DOSE_RATE_METRIC, cumulativeDose } from './history.js';
import { DAY_MS, effectsFor, readingValue, toIso } from './model.js';
import { readingTimes } from './schedule.js';

export interface SimulatorEvents {
  /** A new reading was stored (backend: forward it as `measurement:new`). */
  measurement: [Measurement];
  /** The mission clock moved (backend: forward it as `mission:clock`). */
  clock: [MissionClock];
  /** A live scenario was launched. */
  scenario: [string];
  /** The mission reached its last day; the simulator stopped. */
  end: [];
}

export interface SimulatorOptions {
  /** Same seed as the seed data, so live readings continue the same deterministic streams. */
  seed?: number;
  /** Real milliseconds between ticks. */
  tickMs?: number;
  /** Simulated seconds per real second. Defaults to the mission's `timeScale`. */
  timeScale?: number;
  /** Real clock, injectable for tests. */
  now?: () => number;
}

export interface TickResult {
  inserted: number;
  missionTime: string;
}

/**
 * Live simulator: advances the mission clock and writes each metric at its own cadence, exactly as
 * the seeded history would have continued. It knows nothing about HTTP or Socket.IO: the backend
 * listens to its events and forwards them.
 *
 *   const simulator = new MissionSimulator(db);
 *   simulator.on('measurement', (m) => io.emit('measurement:new', m));
 *   simulator.on('clock', (clock) => io.emit('mission:clock', clock));
 *   simulator.start();
 */
export class MissionSimulator extends EventEmitter<SimulatorEvents> {
  private readonly seed: number;
  private readonly tickMs: number;
  private readonly now: () => number;
  private readonly timeScale: number;
  private readonly startMs: number;
  private readonly endMs: number;
  private readonly crew: CrewMember[];
  private readonly metrics: Metric[];
  private simMs: number;
  private lastRealMs: number;
  private timer: NodeJS.Timeout | null = null;
  private readonly liveScenarios: ScenarioDefinition[] = [];

  constructor(
    private readonly db: Db,
    options: SimulatorOptions = {},
  ) {
    super();
    const row = db.select().from(mission).get();
    if (!row) throw new Error('The mission is not set up. Run `npm run db:reset -w backend`.');
    this.seed = options.seed ?? 42;
    this.tickMs = options.tickMs ?? 1000;
    this.now = options.now ?? Date.now;
    this.timeScale = options.timeScale ?? row.timeScale;
    this.startMs = Date.parse(row.startAt);
    this.endMs = this.startMs + row.lengthDays * DAY_MS;
    this.simMs = Date.parse(row.simTime);
    this.lastRealMs = this.now();
    this.crew = getCrew(db);
    this.metrics = getMetrics(db);
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer) return;
    this.lastRealMs = this.now();
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Launches a scenario now, e.g. 'solar-storm'. See LIVE_SCENARIOS in data/scenarios.ts. */
  triggerScenario(code: string): void {
    const build = LIVE_SCENARIOS[code];
    if (!build) {
      throw new Error(
        `Unknown live scenario "${code}". Available: ${Object.keys(LIVE_SCENARIOS).join(', ')}`,
      );
    }
    const definition = SCENARIOS.find((s) => s.code === code);
    this.liveScenarios.push({
      code,
      title: definition?.title ?? code,
      description: definition?.description ?? '',
      crewId: definition?.crewId ?? null,
      effects: build((this.simMs - this.startMs) / DAY_MS),
    });
    this.emit('scenario', code);
  }

  /** Advances the clock by the real time elapsed since the last tick and writes the due readings. */
  tick(): TickResult {
    const realNow = this.now();
    const elapsed = Math.max(0, realNow - this.lastRealMs);
    this.lastRealMs = realNow;
    const target =
      Math.floor(Math.min(this.simMs + elapsed * this.timeScale, this.endMs) / 1000) * 1000;
    if (target <= this.simMs) return { inserted: 0, missionTime: toIso(this.simMs) };

    const created: Measurement[] = [];
    const scenarios = [...SCENARIOS, ...this.liveScenarios];
    const store = (crewId: string, metricId: string, ms: number, value: number) => {
      const reading = {
        crewMemberId: crewId,
        metricId,
        value,
        takenAt: toIso(ms),
        simulated: true,
      };
      const result = insertMeasurement(this.db, reading);
      if (result.inserted && result.id) created.push({ ...reading, id: result.id });
    };

    this.db.transaction(() => {
      this.crew.forEach(({ id: crewId }, crewIndex) => {
        for (const metric of this.metrics) {
          if (metric.id === CUMULATIVE_DOSE_METRIC) continue;
          const effects = effectsFor(scenarios, crewId, metric.id);
          for (const ms of readingTimes(metric, crewIndex, this.startMs, this.simMs, target)) {
            const value = readingValue({
              seed: this.seed,
              crewId,
              crewIndex,
              metricId: metric.id,
              ms,
              missionStartMs: this.startMs,
              rampEndDay: RAMP_END_DAY,
              effects,
            });
            store(crewId, metric.id, ms, value);
          }
        }
        // The cumulative dose goes last: it adds up the dose-rate readings written just above.
        const cumulative = this.metrics.find((m) => m.id === CUMULATIVE_DOSE_METRIC);
        if (!cumulative) return;
        for (const ms of readingTimes(cumulative, crewIndex, this.startMs, this.simMs, target)) {
          const previous = getLatestMeasurementBefore(this.db, crewId, cumulative.id, toIso(ms));
          const added = sumMeasurementValues(
            this.db,
            crewId,
            DOSE_RATE_METRIC,
            previous?.takenAt ?? null,
            toIso(ms),
          );
          const base = previous?.value ?? PRIOR_RADIATION_DOSE_MSV[crewIndex] ?? 0;
          store(crewId, cumulative.id, ms, cumulativeDose(base, added));
        }
      });
      setMissionTime(this.db, toIso(target));
    });

    this.simMs = target;
    for (const measurement of created) this.emit('measurement', measurement);
    this.emit('clock', getMissionClock(this.db));
    if (this.simMs >= this.endMs) {
      this.stop();
      this.emit('end');
    }
    return { inserted: created.length, missionTime: toIso(this.simMs) };
  }
}
