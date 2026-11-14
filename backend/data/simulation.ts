/**
 * Parameters of the simulated measurements. Everything generated from these values is stored with
 * `simulated = true`: CHIEF has no real sensors and must never present these as real data.
 *
 * value = base + perCrew + trendPerDay * day + daily cycle + scenario effects + noise
 *
 * The numbers are plausible for a healthy adult on the ISS; they are NOT medical thresholds (those
 * live in thresholds.ts, with sources). Metrics sampled less than once a day are staggered by crew
 * member, so the four crew members are not measured on the same day.
 */
export interface SimParams {
  base: number;
  /** Offset per crew member, in crew order (C001..C004). */
  perCrew?: readonly [number, number, number, number];
  noise: number;
  trendPerDay?: number;
  /** Daily sinusoidal cycle: `amp` peaks at `peakHour` (UTC). */
  daily?: { amp: number; peakHour: number };
  /** Decimal places kept. 0 rounds to integers (scores, grades, mmHg). */
  precision: number;
  min?: number;
  max?: number;
  /** UTC hour of the reading for metrics sampled once a day or less. */
  atHour?: number;
}

export const SIMULATION: Record<string, SimParams> = {
  'resting-heart-rate': {
    base: 62,
    perCrew: [0, 3, -2, 5],
    noise: 2.5,
    daily: { amp: 3, peakHour: 15 },
    precision: 0,
    min: 40,
  },
  'heart-rate-variability': { base: 62, perCrew: [0, -6, 5, -3], noise: 6, precision: 0, min: 10 },
  'blood-oxygen-saturation': { base: 97.5, noise: 0.5, precision: 0, min: 85, max: 100 },
  'systolic-blood-pressure': { base: 114, perCrew: [0, 6, -4, 3], noise: 4, precision: 0, atHour: 8 },
  'diastolic-blood-pressure': { base: 72, perCrew: [0, 4, -3, 2], noise: 3, precision: 0, atHour: 8 },
  'bone-mineral-density-change': { base: 0, trendPerDay: -0.035, noise: 0.25, precision: 2, atHour: 9 },
  'muscle-strength-change': { base: 0, trendPerDay: -0.06, noise: 1.2, precision: 1, atHour: 9 },
  'vitamin-d-25-oh': {
    base: 34,
    perCrew: [0, -2, 3, -1],
    trendPerDay: -0.03,
    noise: 1.5,
    precision: 1,
    atHour: 9,
  },
  'urine-calcium': { base: 190, perCrew: [0, 10, -15, 20], noise: 12, precision: 0, min: 20, atHour: 9 },
  'fasting-glucose': { base: 88, perCrew: [0, 3, -2, 4], noise: 4, precision: 0, atHour: 9 },
  'white-blood-cell-count': {
    base: 6.2,
    perCrew: [0, 0.4, -0.5, 0.3],
    noise: 0.6,
    precision: 1,
    min: 2,
    atHour: 9,
  },
  'c-reactive-protein': { base: 1.2, noise: 0.5, precision: 1, min: 0.1, atHour: 9 },
  'optic-disc-edema-grade': { base: 0, noise: 0, precision: 0, min: 0, max: 5, atHour: 9 },
  'intraocular-pressure': { base: 15, perCrew: [0, 1, -1, 0.5], noise: 1.1, precision: 0, atHour: 9 },
  'sleep-duration': {
    base: 7.5,
    perCrew: [0, -0.2, 0.2, -0.3],
    noise: 0.45,
    precision: 1,
    min: 3,
    max: 10,
    atHour: 7,
  },
  'sleep-efficiency': { base: 91, noise: 2.5, precision: 0, min: 40, max: 100, atHour: 7 },
  'reaction-time-mean': { base: 265, perCrew: [0, 5, -5, 8], noise: 18, precision: 0, min: 150, atHour: 10 },
  'mood-score': { base: 4, noise: 0.6, precision: 0, min: 1, max: 5, atHour: 21 },
  'stress-level': { base: 2, noise: 0.6, precision: 0, min: 1, max: 5, atHour: 21 },
  'isolation-level': { base: 2, trendPerDay: 0.012, noise: 0.5, precision: 0, min: 1, max: 5, atHour: 21 },
  'radiation-dose-rate': { base: 18, noise: 2.5, precision: 1, min: 5 },
  // Not sampled from a distribution: integrated from the dose rate, starting at the dose of previous flights.
  'cumulative-radiation-dose': { base: 0, noise: 0, precision: 2, atHour: 23 },
  'calorie-intake': { base: 2600, noise: 180, precision: 0, min: 800, atHour: 20 },
  hydration: { base: 2650, noise: 200, precision: 0, min: 500, atHour: 20 },
  'calcium-intake': { base: 1150, noise: 100, precision: 0, min: 200, atHour: 20 },
};

/** Career dose in mSv of each crew member before this mission (C001..C004). Fictional. */
export const PRIOR_RADIATION_DOSE_MSV = [120, 280, 45, 90] as const;
