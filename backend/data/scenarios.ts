import { MISSION } from './crew.js';
import { DONKI_STORM } from './datasets.js';

/**
 * Demo scenarios: synthetic cases planted on specific crew members so alerts fire and CHIEF has
 * something to explain. They change simulated measurements only (see simulation.ts); statuses are
 * decided by the rules engine from the thresholds, never here.
 *
 * Days are days since the start of the mission (0 = start, may be fractional).
 *  - `ramp`: grows linearly from 0 at `fromDay` to `amount` at `toDay` (default: the demo day) and
 *    stays there.
 *  - `window`: adds `amount` between `fromDay` and `toDay`.
 *  - `decay`: jumps by `amount` at `fromDay` and fades exponentially with time constant `tauHours`.
 */
export interface ScenarioEffect {
  metricId: string;
  kind: 'ramp' | 'window' | 'decay';
  amount: number;
  fromDay: number;
  toDay?: number;
  tauHours?: number;
}

export interface ScenarioDefinition {
  code: string;
  title: string;
  description: string;
  /** Crew member the case is planted on; null means the whole crew. */
  crewId: string | null;
  effects: ScenarioEffect[];
}

/** Ramps reach their full amount at the demo day (12:00 UTC) and then stay constant. */
export const RAMP_END_DAY = MISSION.simDay - 0.5;

const DAY_MS = 86_400_000;

/**
 * Dose-rate increase of each proton event onset. The timing comes from NASA DONKI (real May 2024
 * storm); the size of the increase on board is a simulated assumption, documented as such.
 */
const STORM_DOSE_RATE_INCREASE = { 10: 40, 100: 80 } as const; // uSv/h
const STORM_DECAY_HOURS = 10;

/** Proton events of the storm itself: the first onset and those within 7 days after it. */
const STORM_EVENTS = (() => {
  const [first] = DONKI_STORM.particleEvents;
  if (!first) return [];
  const firstMs = Date.parse(first.onset);
  return DONKI_STORM.particleEvents
    .map((event) => ({ ...event, offsetDays: (Date.parse(event.onset) - firstMs) / DAY_MS }))
    .filter((event) => event.offsetDays <= 7);
})();

/** Replays the real storm with its first proton onset at `onsetDay`. */
export function solarStormEffects(onsetDay: number): ScenarioEffect[] {
  return STORM_EVENTS.map((event) => ({
    metricId: 'radiation-dose-rate',
    kind: 'decay',
    amount: STORM_DOSE_RATE_INCREASE[event.energyMeV],
    fromDay: onsetDay + event.offsetDays,
    tauHours: STORM_DECAY_HOURS,
  }));
}

export const SCENARIOS: ScenarioDefinition[] = [
  {
    code: 'accelerated-bone-loss',
    title: 'Accelerated bone loss',
    description: 'Bone density and leg strength fall faster than expected for the exercise done.',
    crewId: 'C001',
    effects: [
      { metricId: 'bone-mineral-density-change', kind: 'ramp', amount: -3.5, fromDay: 20 },
      { metricId: 'muscle-strength-change', kind: 'ramp', amount: -8, fromDay: 20 },
    ],
  },
  {
    code: 'kidney-stone-risk',
    title: 'Rising kidney-stone risk',
    description: 'Urine calcium keeps rising, a risk factor for kidney stones.',
    crewId: 'C001',
    effects: [{ metricId: 'urine-calcium', kind: 'ramp', amount: 85, fromDay: 25 }],
  },
  {
    code: 'early-sans',
    title: 'Early SANS',
    description:
      'Optic disc swelling and higher eye pressure: early signs of spaceflight neuro-ocular syndrome.',
    crewId: 'C002',
    effects: [
      { metricId: 'optic-disc-edema-grade', kind: 'ramp', amount: 2.2, fromDay: 30 },
      { metricId: 'intraocular-pressure', kind: 'ramp', amount: 8, fromDay: 30 },
    ],
  },
  {
    code: 'vitamin-d-deficiency',
    title: 'Vitamin D deficiency',
    description: 'Vitamin D falls below the deficiency limit because there is no sunlight on board.',
    crewId: 'C003',
    effects: [{ metricId: 'vitamin-d-25-oh', kind: 'ramp', amount: -22, fromDay: 1 }],
  },
  {
    code: 'sleep-deprivation',
    title: 'Sleep deprivation and slower reaction time',
    description:
      'Short, poor sleep for two weeks, with slower reactions, lower mood and more stress.',
    crewId: 'C004',
    effects: [
      { metricId: 'sleep-duration', kind: 'ramp', amount: -2, fromDay: 44 },
      { metricId: 'sleep-efficiency', kind: 'ramp', amount: -22, fromDay: 44 },
      { metricId: 'reaction-time-mean', kind: 'ramp', amount: 75, fromDay: 44 },
      { metricId: 'mood-score', kind: 'ramp', amount: -1.2, fromDay: 44 },
      { metricId: 'stress-level', kind: 'ramp', amount: 1.5, fromDay: 44 },
    ],
  },
  {
    code: 'solar-storm',
    title: 'Radiation spike from a solar storm',
    description:
      'Replays the proton events of the May 2024 solar storm (NASA DONKI): the dose rate of the whole crew jumps and fades over hours.',
    crewId: null,
    // Planted so the last proton onset of the storm falls just before the demo day.
    effects: solarStormEffects(56.3),
  },
];

/** Scenarios that can also be launched live from the simulator, starting at the current time. */
export const LIVE_SCENARIOS: Record<string, (nowDay: number) => ScenarioEffect[]> = {
  'solar-storm': solarStormEffects,
};
