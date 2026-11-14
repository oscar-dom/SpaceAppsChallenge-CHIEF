import type { BodySystemId, Status } from '@chief/shared';

/** Planned mission length: a 6-month ISS increment. */
export const MISSION_LENGTH_DAYS = 180;

/** The seed has no agency column; every fictional crew member flies for the same one. */
export const CREW_AGENCY = 'NASA';

/** Score of a metric in each status, averaged into the system score (0-100). */
export const STATUS_SCORE: Record<Status, number> = {
  nominal: 100,
  caution: 60,
  critical: 20,
};

/**
 * Score band of each status. System and health scores are scaled into the band of their
 * status, so a score never looks healthier (or worse) than the status next to it: one
 * critical metric keeps the score under 70. The UI can colour a score with these bands.
 */
export const SCORE_BANDS: Record<Status, { min: number; max: number }> = {
  nominal: { min: 90, max: 100 },
  caution: { min: 70, max: 89 },
  critical: { min: 0, max: 69 },
};

/** Order of severity, used to pick the worst status. */
export const STATUS_RANK: Record<Status, number> = { nominal: 0, caution: 1, critical: 2 };

/**
 * Weight of each body system in the health score. Systems without data are left out
 * and the remaining weights are normalized, so they do not need to add up to 1.
 */
export const SYSTEM_WEIGHTS: Record<BodySystemId, number> = {
  cardiovascular: 0.2,
  musculoskeletal: 0.1,
  'blood-biochemistry': 0.1,
  immune: 0.05,
  vision: 0.1,
  'sleep-cognition': 0.15,
  'behavioral-health': 0.1,
  radiation: 0.1,
  nutrition: 0.1,
};

/** Minimum relative change between the start and the end of a period to call it a trend. */
export const TREND_MIN_CHANGE = 0.03;

/** Maximum points returned for a chart; longer series are averaged in buckets. */
export const MAX_SERIES_POINTS = 300;
