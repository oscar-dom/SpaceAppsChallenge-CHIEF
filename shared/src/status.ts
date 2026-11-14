/** Health status of a metric, a body system or the whole crew member. */
export const STATUSES = ['nominal', 'caution', 'critical'] as const;
export type Status = (typeof STATUSES)[number];

/** Who has to act on a result. */
export const ESCALATION_LEVELS = ['self-care', 'crew-medical-officer', 'flight-surgeon'] as const;
export type EscalationLevel = (typeof ESCALATION_LEVELS)[number];

/** Direction of a metric over the selected period. */
export type Trend = 'rising' | 'falling' | 'stable';
