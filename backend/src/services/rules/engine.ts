// Rules engine: deterministic, no AI, no I/O. It turns readings into statuses, system
// scores, the health score and the anomaly alerts the UI shows. It is the source of
// truth for every status; CHIEF only explains its output.
import type {
  BodySystemId,
  HealthScore,
  MetricStatus,
  Status,
  SystemStatus,
  Threshold,
  Trend,
} from '@chief/shared';
import {
  SCORE_BANDS,
  STATUS_RANK,
  STATUS_SCORE,
  TREND_MIN_CHANGE,
} from '../../config/constants.js';

/**
 * A 0-100 average scaled linearly into the band of its status (SCORE_BANDS) and rounded.
 * Scaling, not clamping, keeps the order: two critical crew members still differ.
 */
export function scoreInBand(score: number, status: Status): number {
  const { min, max } = SCORE_BANDS[status];
  const ratio = Math.min(100, Math.max(0, score)) / 100;
  return Math.round(min + ratio * (max - min));
}

/** Status of a value: the first range that contains it, or critical if none does. */
export function evaluateValue(value: number, threshold: Threshold): Status {
  for (const { status, range } of threshold.ranges) {
    const aboveMin = range.min === undefined || value >= range.min;
    const belowMax = range.max === undefined || value < range.max;
    if (aboveMin && belowMax) return status;
  }
  return 'critical';
}

/** The nominal range of a threshold, used to explain a reading ("normal range 60-100"). */
export function nominalRange(threshold: Threshold): { min?: number; max?: number } | undefined {
  return threshold.ranges.find((r) => r.status === 'nominal')?.range;
}

/** Whether a value is below or above the nominal range (undefined when inside it). */
export function deviation(value: number, threshold: Threshold): 'low' | 'high' | undefined {
  const range = nominalRange(threshold);
  if (!range) return undefined;
  if (range.min !== undefined && value < range.min) return 'low';
  if (range.max !== undefined && value >= range.max) return 'high';
  return undefined;
}

export function worstStatus(statuses: Iterable<Status>): Status {
  let worst: Status = 'nominal';
  for (const status of statuses) {
    if (STATUS_RANK[status] > STATUS_RANK[worst]) worst = status;
  }
  return worst;
}

/**
 * Direction of a series, oldest value first: the mean of the last third against the mean
 * of the first third. Changes smaller than TREND_MIN_CHANGE count as stable.
 */
export function computeTrend(values: readonly number[]): Trend {
  if (values.length < 3) return 'stable';
  const third = Math.max(1, Math.floor(values.length / 3));
  const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const first = mean(values.slice(0, third));
  const last = mean(values.slice(-third));
  if (first === 0) return last === 0 ? 'stable' : last > 0 ? 'rising' : 'falling';
  const change = (last - first) / Math.abs(first);
  if (change > TREND_MIN_CHANGE) return 'rising';
  if (change < -TREND_MIN_CHANGE) return 'falling';
  return 'stable';
}

/** Whether a metric counts for the scores: by default, when it has data. */
export type IsScored = (metric: MetricStatus) => boolean;
const hasData: IsScored = (m) => m.latest !== null;

/**
 * Status and score of one body system. Metrics that are not scored (no data, or no sourced
 * threshold) are listed but do not count. The status is the worst metric status (one
 * critical metric makes the system critical); the score is the mean of the metric scores,
 * scaled into the band of that status. Without any scored metric the system is nominal.
 */
export function evaluateSystem(
  system: BodySystemId,
  metrics: MetricStatus[],
  isScored: IsScored = hasData,
): SystemStatus {
  const measured = metrics.filter(isScored);
  const score =
    measured.length === 0
      ? 100
      : measured.reduce((sum, m) => sum + STATUS_SCORE[m.status], 0) / measured.length;
  const status = worstStatus(measured.map((m) => m.status));
  return { system, status, score: scoreInBand(score, status), metrics };
}

/**
 * Global health score: weighted mean of the scores of the systems with scored metrics, with
 * the weights normalized over those systems, scaled into the band of the status. The status
 * is the worst system status.
 */
export function computeHealthScore(
  crewMemberId: string,
  systems: SystemStatus[],
  weights: Record<BodySystemId, number>,
  computedAt: string,
  isScored: IsScored = hasData,
): HealthScore {
  const withData = systems.filter((s) => s.metrics.some(isScored));
  const totalWeight = withData.reduce((sum, s) => sum + weights[s.system], 0);
  const score =
    totalWeight === 0
      ? 100
      : withData.reduce((sum, s) => sum + s.score * weights[s.system], 0) / totalWeight;
  const status = worstStatus(withData.map((s) => s.status));
  return { crewMemberId, score: scoreInBand(score, status), status, systems, computedAt };
}

/** An anomaly the engine wants on the alerts panel: one per metric out of range. */
export interface AnomalyFinding {
  metricId: string;
  status: Exclude<Status, 'nominal'>;
  title: string;
  message: string;
}

export interface FindingInput {
  metricId: string;
  name: string;
  unit: string;
  value: number;
  status: Status;
  threshold: Threshold;
}

/** One finding per metric that is not nominal, with a title and message for the panel. */
export function findAnomalies(inputs: readonly FindingInput[]): AnomalyFinding[] {
  const findings: AnomalyFinding[] = [];
  for (const input of inputs) {
    if (input.status === 'nominal') continue;
    const direction = deviation(input.value, input.threshold);
    const adjective = direction === 'low' ? 'Low' : direction === 'high' ? 'High' : 'Abnormal';
    const range = nominalRange(input.threshold);
    const rangeText =
      range === undefined
        ? ''
        : range.min !== undefined && range.max !== undefined
          ? ` (nominal ${formatNumber(range.min)} to under ${formatNumber(range.max)} ${input.unit})`
          : range.min !== undefined
            ? ` (nominal ${formatNumber(range.min)} ${input.unit} or more)`
            : ` (nominal below ${formatNumber(range.max ?? 0)} ${input.unit})`;
    findings.push({
      metricId: input.metricId,
      status: input.status,
      title: `${adjective} ${input.name.charAt(0).toLowerCase()}${input.name.slice(1)}`,
      message: `${input.name} is ${formatNumber(input.value)} ${input.unit}${rangeText}.`,
    });
  }
  return findings;
}

/** An alert already open for a metric, as the engine sees it. */
export interface OpenAnomaly {
  id: string;
  metricId: string;
  status: Exclude<Status, 'nominal'>;
  title: string;
  message: string;
}

export interface AlertChanges {
  create: AnomalyFinding[];
  update: { id: string; finding: AnomalyFinding }[];
  resolve: string[];
}

/**
 * Compares the current findings with the open alerts: new anomalies are created, the ones
 * whose severity or text changed are updated, and the ones back to nominal are resolved.
 * One open alert per metric, so a metric that stays out of range does not flood the panel.
 */
export function diffAlerts(
  findings: readonly AnomalyFinding[],
  open: readonly OpenAnomaly[],
): AlertChanges {
  const openByMetric = new Map(open.map((alert) => [alert.metricId, alert]));
  const changes: AlertChanges = { create: [], update: [], resolve: [] };
  const seen = new Set<string>();

  for (const finding of findings) {
    seen.add(finding.metricId);
    const existing = openByMetric.get(finding.metricId);
    if (!existing) {
      changes.create.push(finding);
    } else if (existing.status !== finding.status || existing.title !== finding.title) {
      changes.update.push({ id: existing.id, finding });
    }
  }
  for (const alert of open) {
    if (!seen.has(alert.metricId)) changes.resolve.push(alert.id);
  }
  return changes;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
