import type { MetricStatus } from './metrics.js';
import type { Status } from './status.js';
import type { BodySystemId } from './systems.js';

/** Evaluated state of one body system, computed by the rules engine. */
export interface SystemStatus {
  system: BodySystemId;
  status: Status;
  /** 0-100, higher is healthier. */
  score: number;
  metrics: MetricStatus[];
}

/** Global state of a crew member, shown on the Overview. */
export interface HealthScore {
  crewMemberId: string;
  /** 0-100, weighted average of the system scores. */
  score: number;
  status: Status;
  systems: SystemStatus[];
  /** Simulated time of the evaluation, ISO 8601. */
  computedAt: string;
}
