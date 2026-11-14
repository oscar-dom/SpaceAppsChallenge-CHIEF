import type { MetricStatus } from './metrics.js';
import type { Status } from './status.js';
import type { BodySystemId } from './systems.js';

/** Evaluated state of one body system, computed by the rules engine. */
export interface SystemStatus {
  system: BodySystemId;
  status: Status;
  /**
   * 0-100, higher is healthier. Always inside the band of `status`: nominal 90-100,
   * caution 70-89, critical 0-69.
   */
  score: number;
  metrics: MetricStatus[];
}

/** Global state of a crew member, shown on the Overview. */
export interface HealthScore {
  crewMemberId: string;
  /**
   * 0-100, weighted average of the system scores, kept inside the band of `status`
   * (nominal 90-100, caution 70-89, critical 0-69).
   */
  score: number;
  status: Status;
  systems: SystemStatus[];
  /** Simulated time of the evaluation, ISO 8601. */
  computedAt: string;
}
