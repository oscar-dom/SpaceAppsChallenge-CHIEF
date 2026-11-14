import type { BodySystemId } from './systems.js';
import type { EscalationLevel, Status, Trend } from './status.js';

/** Where a reading comes from on board. */
export type MeasurementOrigin = 'sensor' | 'lab' | 'manual' | 'in-app-test';

/** A document backing a value or a threshold, e.g. NASA-STD-3001 Vol. 1 Rev. C, 4.8.2. */
export interface SourceReference {
  document: string;
  section?: string;
  url?: string;
}

/** Definition of something CHIEF measures, e.g. resting heart rate. */
export interface Metric {
  /** Stable id in kebab-case, e.g. "resting-heart-rate". */
  id: string;
  system: BodySystemId;
  name: string;
  /** e.g. "bpm", "mg/dL", "mSv". */
  unit: string;
  description: string;
  /** How the metric is affected by spaceflight, shown in its dashboard. */
  spaceflightEffect?: string;
  origin: MeasurementOrigin;
  /** How often a new reading is produced, in simulated minutes. */
  cadenceMinutes: number;
}

/** One reading of a metric for a crew member. */
export interface Measurement {
  id: string;
  crewMemberId: string;
  metricId: string;
  value: number;
  /** Simulated time of the reading, ISO 8601. */
  takenAt: string;
  /** True when the value is synthetic and not a real NASA measurement. */
  simulated: boolean;
}

/**
 * A value range. A missing bound means "unbounded" on that side.
 * Bounds are inclusive at `min` and exclusive at `max`.
 */
export interface Range {
  min?: number;
  max?: number;
}

/** Thresholds of a metric, used by the rules engine. Every threshold needs a source. */
export interface Threshold {
  metricId: string;
  /** Ranges per status. A value outside every range counts as `critical`. */
  ranges: { status: Status; range: Range }[];
  /** Who acts when the metric is not nominal. */
  escalation: Record<Exclude<Status, 'nominal'>, EscalationLevel>;
  /** Generic advice used when CHIEF (Gemini) is unavailable. */
  fallbackRecommendation: string;
  source: SourceReference;
}

/** Latest evaluated state of one metric. */
export interface MetricStatus {
  metric: Metric;
  latest: Measurement | null;
  status: Status;
  trend: Trend;
}

/** Chart time windows offered by the dashboards. */
export const PERIODS = ['day', 'week', 'month', 'mission'] as const;
export type Period = (typeof PERIODS)[number];
