import {
  BODY_SYSTEMS,
  type BodySystemId,
  type HealthScore,
  type Measurement,
  type Metric,
  type MetricStatus,
  type Period,
  type SystemStatus,
  type Threshold,
} from '@chief/shared';
import { MAX_SERIES_POINTS, SYSTEM_WEIGHTS } from '../config/constants.js';
import type { Db } from '../db/client.js';
import { getMeasurementSeries } from '../db/engine-queries.js';
import { getLatestMeasurements, getMetrics, getThresholds } from '../db/queries.js';
import { NotFoundError } from '../errors/app-error.js';
import { toDbTime, type MissionClock } from './mission-clock.js';
import {
  computeHealthScore,
  computeTrend,
  evaluateSystem,
  evaluateValue,
  type FindingInput,
  type IsScored,
} from './rules/engine.js';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const PERIOD_MS: Record<Exclude<Period, 'mission'>, number> = {
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
};

export interface CrewEvaluation {
  health: HealthScore;
  /** Metrics with data and a threshold, ready for the anomaly detection. */
  findings: FindingInput[];
  /** Latest reading of every metric, by metric id. */
  latest: ReadonlyMap<string, Measurement>;
}

/** Reads the data of a crew member and runs the rules engine on it. */
export class HealthService {
  /** The catalog and thresholds are reference data: loaded once at startup. */
  readonly metrics: readonly Metric[];
  private readonly thresholds: ReadonlyMap<string, Threshold>;
  private readonly isScored: IsScored;

  constructor(
    private readonly db: Db,
    private readonly clock: MissionClock,
  ) {
    this.metrics = getMetrics(db);
    this.thresholds = new Map(getThresholds(db).map((t) => [t.metricId, t]));
    // Metrics without a sourced threshold are measured and charted, but get no status.
    this.isScored = (m) => m.latest !== null && this.thresholds.has(m.metric.id);
  }

  metric(metricId: string): Metric {
    const metric = this.metrics.find((m) => m.id === metricId);
    if (!metric) throw new NotFoundError(`Metric ${metricId} not found`);
    return metric;
  }

  threshold(metricId: string): Threshold | undefined {
    return this.thresholds.get(metricId);
  }

  /** Every sourced threshold, ordered by metric id: the dashboards draw their ranges. */
  listThresholds(): Threshold[] {
    return [...this.thresholds.values()];
  }

  evaluate(crewId: string): CrewEvaluation {
    const now = this.clock.now();
    const latest = new Map(getLatestMeasurements(this.db, crewId).map((m) => [m.metricId, m]));
    const findings: FindingInput[] = [];
    const statuses = new Map<string, MetricStatus>();

    for (const metric of this.metrics) {
      const reading = latest.get(metric.id) ?? null;
      const threshold = this.thresholds.get(metric.id);
      const status = reading && threshold ? evaluateValue(reading.value, threshold) : 'nominal';
      statuses.set(metric.id, {
        metric,
        latest: reading,
        status,
        trend: computeTrend(this.trendValues(crewId, metric, now)),
      });
      if (reading && threshold) {
        findings.push({
          metricId: metric.id,
          name: metric.name,
          unit: metric.unit,
          value: reading.value,
          status,
          threshold,
        });
      }
    }

    const systems = BODY_SYSTEMS.map(({ id }) =>
      evaluateSystem(
        id,
        this.metrics.filter((m) => m.system === id).map((m) => statuses.get(m.id) as MetricStatus),
        this.isScored,
      ),
    );
    return {
      health: computeHealthScore(crewId, systems, SYSTEM_WEIGHTS, toDbTime(now), this.isScored),
      findings,
      latest,
    };
  }

  system(crewId: string, systemId: BodySystemId): SystemStatus {
    return this.evaluate(crewId).health.systems.find((s) => s.system === systemId) as SystemStatus;
  }

  /** Chart data of one metric over a period ending now (`mission`: since the mission start). */
  measurements(crewId: string, metricId: string, period: Period): Measurement[] {
    this.metric(metricId);
    const now = this.clock.now();
    const clock = this.clock.snapshot();
    const from =
      period === 'mission'
        ? new Date(now.getTime() - clock.missionDay * DAY_MS)
        : new Date(now.getTime() - PERIOD_MS[period]);
    return getMeasurementSeries(this.db, {
      crewId,
      metricId,
      from: toDbTime(from),
      to: toDbTime(now),
      maxPoints: MAX_SERIES_POINTS,
    });
  }

  /** Values for the trend: the last day, or the last four readings for slower metrics. */
  private trendValues(crewId: string, metric: Metric, now: Date): number[] {
    const span = Math.max(DAY_MS, 4 * metric.cadenceMinutes * MINUTE_MS);
    return getMeasurementSeries(this.db, {
      crewId,
      metricId: metric.id,
      from: toDbTime(new Date(now.getTime() - span)),
      to: toDbTime(now),
      maxPoints: MAX_SERIES_POINTS,
    }).map((m) => m.value);
  }
}
