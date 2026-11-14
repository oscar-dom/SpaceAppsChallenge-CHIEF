import { count } from 'drizzle-orm';
import { CREW, MISSION } from '../../data/crew.js';
import { FORMULARY } from '../../data/formulary.js';
import { METRICS } from '../../data/metrics.js';
import { SCENARIOS } from '../../data/scenarios.js';
import { THRESHOLDS } from '../../data/thresholds.js';
import { OSDR_METRICS, OSDR_PREFLIGHT } from '../../data/datasets.js';
import { generateHistory } from '../services/simulator/history.js';
import { toIso } from '../services/simulator/model.js';
import type { Db } from './client.js';
import { crewMembers, formulary, measurements, metrics, mission, thresholds } from './schema.js';

const DAY = 86_400_000;
const CHUNK = 500;

export interface PopulateOptions {
  /** Seed of the pseudo-random generator: the same seed gives the same history. */
  seed?: number;
}

export interface PopulateSummary {
  seed: number;
  simTime: string;
  crew: number;
  metrics: number;
  thresholds: number;
  formulary: number;
  /** Simulated readings generated for the mission. */
  measurements: number;
  /** Real NASA OSDR readings (preflight baselines), stored with simulated = false. */
  realMeasurements: number;
}

/** Checks that the data files agree with each other before anything is written. */
function validateData(): void {
  const metricIds = new Set(METRICS.map((m) => m.id));
  const crewIds = new Set(CREW.map((c) => c.id));
  for (const t of THRESHOLDS) {
    if (!metricIds.has(t.metricId)) throw new Error(`Threshold for unknown metric "${t.metricId}"`);
    if (!t.source.document.trim()) throw new Error(`Threshold "${t.metricId}" has no source`);
  }
  for (const s of SCENARIOS) {
    if (s.crewId !== null && !crewIds.has(s.crewId))
      throw new Error(`Scenario "${s.code}": unknown crew "${s.crewId}"`);
    for (const e of s.effects) {
      if (!metricIds.has(e.metricId))
        throw new Error(`Scenario "${s.code}": unknown metric "${e.metricId}"`);
    }
  }
}

/** Loads the reference data and the simulated mission history into an empty, migrated database. */
export function populateDatabase(db: Db, options: PopulateOptions = {}): PopulateSummary {
  validateData();
  const seed = options.seed ?? 42;

  const [existing] = db.select({ n: count() }).from(crewMembers).all();
  if (existing && existing.n > 0) {
    throw new Error(
      'The database already has data. Run `npm run db:reset -w backend` to start from scratch.',
    );
  }

  const startMs = Date.parse(MISSION.startAt);
  // The clock stands at 12:00 UTC of the demo's starting mission day.
  const simMs = startMs + (MISSION.simDay - 1) * DAY + 12 * 3_600_000;
  const history = generateHistory({
    crewIds: CREW.map((c) => c.id),
    metrics: METRICS,
    scenarios: SCENARIOS,
    startMs,
    endMs: simMs,
    seed,
  });

  // Real preflight blood values of the Inspiration4 crew (NASA OSDR), placed the same number of days
  // before this mission's start as they were taken before launch. Stored as real (simulated = false).
  const crewIds = new Set(CREW.map((c) => c.id));
  const realReadings = OSDR_PREFLIGHT.filter((sample) => crewIds.has(sample.crewId)).flatMap(
    (sample) =>
      Object.entries(OSDR_METRICS).flatMap(([metricId, field]) => {
        const value = sample[field];
        if (value === null) return [];
        const takenAt = toIso(startMs + sample.daysFromLaunch * DAY + 9 * 3_600_000);
        return [{ crewId: sample.crewId, metricId, value, takenAt, simulated: false }];
      }),
  );

  db.transaction((tx) => {
    tx.insert(crewMembers).values(CREW).run();
    tx.insert(mission)
      .values({
        id: 1,
        name: MISSION.name,
        startAt: MISSION.startAt,
        lengthDays: MISSION.lengthDays,
        timeScale: MISSION.timeScale,
        simTime: toIso(simMs),
      })
      .run();
    tx.insert(metrics).values(METRICS).run();
    tx.insert(thresholds)
      .values(
        THRESHOLDS.map((t) => ({
          metricId: t.metricId,
          ranges: t.ranges,
          escalation: t.escalation,
          fallbackRecommendation: t.fallbackRecommendation,
          source: t.source,
        })),
      )
      .run();
    tx.insert(formulary).values(FORMULARY).run();
    if (realReadings.length > 0) tx.insert(measurements).values(realReadings).run();
    for (let i = 0; i < history.length; i += CHUNK) {
      tx.insert(measurements)
        .values(history.slice(i, i + CHUNK))
        .run();
    }
  });

  return {
    seed,
    simTime: toIso(simMs),
    crew: CREW.length,
    metrics: METRICS.length,
    thresholds: THRESHOLDS.length,
    formulary: FORMULARY.length,
    measurements: history.length,
    realMeasurements: realReadings.length,
  };
}
