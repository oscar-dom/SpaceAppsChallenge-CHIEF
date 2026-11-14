import type { EscalationLevel } from './status.js';
import type { BodySystemId } from './systems.js';

/**
 * `anomaly`: a metric left its nominal range (e.g. elevated heart rate, low vitamin D).
 * `scheduled`: something the crew member has to do (e.g. blood draw in 3 h).
 */
export type AlertKind = 'anomaly' | 'scheduled';

/** Order used to sort the alerts panel, most urgent first. */
export const ALERT_SEVERITIES = ['critical', 'caution', 'info'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export interface Alert {
  id: string;
  crewMemberId: string;
  system: BodySystemId;
  kind: AlertKind;
  severity: AlertSeverity;
  /** Short title for the alerts panel, e.g. "Elevated resting heart rate". */
  title: string;
  /** One or two sentences with the detail. */
  message: string;
  escalation: EscalationLevel;
  /** Metric that triggered an `anomaly` alert. */
  metricId?: string;
  /** When a `scheduled` alert is due, ISO 8601 simulated time. */
  dueAt?: string;
  /** Simulated time of creation, ISO 8601. */
  createdAt: string;
  acknowledged: boolean;
}
