/**
 * Demo scenarios: synthetic cases planted on specific crew members so alerts fire and CHIEF has
 * something to explain. They change simulated measurements only (see simulation.ts); statuses are
 * decided by the rules engine from the thresholds, never here.
 *
 * Days are days since the start of the mission (0 = start, may be fractional). A `ramp` grows
 * linearly from 0 at `fromDay` to `amount` at `toDay` (default: the current simulated time) and
 * stays there. A `window` adds `amount` between `fromDay` and `toDay`.
 */
export interface ScenarioEffect {
  metricId: string;
  kind: 'ramp' | 'window';
  amount: number;
  fromDay: number;
  toDay?: number;
}

export interface ScenarioDefinition {
  code: string;
  title: string;
  description: string;
  /** Crew member the case is planted on; null means the whole crew. */
  crewId: string | null;
  effects: ScenarioEffect[];
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
    effects: [{ metricId: 'urine-calcium', kind: 'ramp', amount: 110, fromDay: 25 }],
  },
  {
    code: 'early-sans',
    title: 'Early SANS',
    description: 'Optic disc swelling and higher eye pressure: early signs of spaceflight neuro-ocular syndrome.',
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
    description: 'Short, poor sleep for two weeks, with slower reactions, lower mood and more stress.',
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
    description: 'A solar particle event raises the dose rate for the whole crew for about a day.',
    crewId: null,
    effects: [{ metricId: 'radiation-dose-rate', kind: 'window', amount: 70, fromDay: 58.3, toDay: 59.3 }],
  },
];
