import type { InventoryCategory, SourceReference } from '@chief/shared';

/**
 * The ship's inventory of medication, food and water, and how fast the crew uses it.
 *
 * Use rates come from NASA documents (cited per item). What is SIMULATED, and documented as such
 * in docs/data-sources.md: the stock at launch, the resupply cargo, the day-to-day noise and, for
 * medication, the per-day chance that a crew member takes a dose. Those chances are set so that
 * the categories NASA reports as most used on the ISS (sleep, pain, congestion, allergy) are also
 * the most used here; they are not measured rates.
 *
 * Medication not in the onboard formulary (formulary.ts) is listed because the ship carries it,
 * but CHIEF still only suggests formulary items.
 */

/** How an item is used up, per crew member and day. */
export type UseModel =
  /** A mass used every day by everyone, e.g. food. `noise` is the relative day-to-day spread. */
  | { kind: 'mass'; perCrewPerDay: number; noise: number; recoveryRate?: number }
  /**
   * Doses: each crew member takes `unitsPerUse` with probability `chance` on a given day.
   * `boosts` multiply the chance in a window (e.g. motion sickness in the first days, or one
   * crew member's sleep-deprivation scenario).
   */
  | {
      kind: 'doses';
      chance: number;
      unitsPerUse: number;
      boosts?: { fromDay: number; toDay: number; factor: number; crewId?: string }[];
    };

export interface InventorySeed {
  id: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  purpose: string;
  /** SIMULATED: stock at mission start. */
  initialQuantity: number;
  use: UseModel;
  /** SIMULATED logistics assumption (CHIEF's own, not a NASA rule): days of supply to warn at. */
  cautionDays: number;
  criticalDays: number;
  source: SourceReference;
}

const CREW_SIZE = 4;

const BVAD: SourceReference = {
  document: 'NASA Life Support Baseline Values and Assumptions Document, NASA/TP-2015-218570/REV1 (2018)',
  url: 'https://ntrs.nasa.gov/citations/20180001338',
};

const WATER_RECOVERY: SourceReference = {
  document: 'NASA, "NASA Achieves Water Recovery Milestone on International Space Station" (June 2023)',
  section: '98% total water recovery with the Brine Processor Assembly',
  url: 'https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/',
};

const MEDICATION_USE: SourceReference = {
  document:
    'Wotring VE, "Medication use by U.S. crewmembers on the International Space Station", FASEB J 2015;29:4417-4423',
  section: 'Records of 24 crew members on 20 missions: sleep aids used about 10 times more than on Earth; sleep, pain, congestion and allergy medication most used',
  url: 'https://doi.org/10.1096/fj.14-264838',
};

const SLEEP_MEDICATION: SourceReference = {
  document:
    'Barger LK et al., "Prevalence of sleep deficiency and use of hypnotic drugs in astronauts before, during, and after spaceflight", Lancet Neurol 2014;13:904-912',
  section: 'Sleep deficiency was common and hypnotic use (zolpidem, zaleplon) pervasive during ISS missions',
  url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4188436/',
};

const MOTION_SICKNESS: SourceReference = {
  document:
    'Putcha L, Younker D, Daniels V, "Space Motion Sickness: Analysis of Medical Debriefs Data for Incidence and Treatment", NASA NTRS 20110020471',
  section: 'About 40% of Shuttle crew members had space motion sickness in the first flight days; promethazine was the most used treatment',
  url: 'https://ntrs.nasa.gov/citations/20110020471',
};

/** Sleep-deprivation demo scenario (scenarios.ts): C004 sleeps worse from day 44. */
const SLEEP_SCENARIO_BOOST = { fromDay: 44, toDay: 180, factor: 3, crewId: 'C004' };

export const INVENTORY: InventorySeed[] = [
  {
    id: 'food-packaged',
    name: 'Packaged food (ISS menu)',
    category: 'food',
    unit: 'kg',
    purpose: 'Thermostabilized, rehydratable and natural-form meals, as shipped with packaging',
    initialQuantity: 420,
    use: { kind: 'mass', perCrewPerDay: 1.83, noise: 0.06 },
    cautionDays: 21,
    criticalDays: 10,
    source: {
      ...BVAD,
      section: 'Table 4-53, ISS food system: 1.83 kg per crew member per day, as shipped, packaged',
    },
  },
  {
    id: 'water-potable',
    name: 'Potable water',
    category: 'water',
    unit: 'kg',
    purpose: 'Drinking water and water to rehydrate food; 98% of it is reclaimed and reused',
    initialQuantity: 900,
    use: { kind: 'mass', perCrewPerDay: 2.5, noise: 0.05, recoveryRate: 0.98 },
    cautionDays: 30,
    criticalDays: 10,
    source: {
      ...BVAD,
      section: `Table 3-33: 2.5 kg of potable water per crew member per day; recovery: ${WATER_RECOVERY.document}`,
      url: WATER_RECOVERY.url,
    },
  },
  {
    id: 'acetaminophen-325',
    name: 'Acetaminophen 325 mg',
    category: 'medication',
    unit: 'tablets',
    purpose: 'Headache and mild pain (onboard formulary)',
    initialQuantity: 120,
    use: { kind: 'doses', chance: 0.06, unitsPerUse: 2 },
    cautionDays: 40,
    criticalDays: 14,
    source: MEDICATION_USE,
  },
  {
    id: 'ibuprofen-400',
    name: 'Ibuprofen 400 mg',
    category: 'medication',
    unit: 'tablets',
    purpose: 'Back and muscle pain, more common in the first weeks as the spine lengthens (onboard formulary)',
    initialQuantity: 80,
    use: {
      kind: 'doses',
      chance: 0.06,
      unitsPerUse: 1,
      boosts: [{ fromDay: 1, toDay: 14, factor: 3 }],
    },
    cautionDays: 40,
    criticalDays: 14,
    source: MEDICATION_USE,
  },
  {
    id: 'aspirin',
    name: 'Aspirin',
    category: 'medication',
    unit: 'tablets',
    purpose: 'Pain and fever (onboard formulary)',
    initialQuantity: 20,
    use: { kind: 'doses', chance: 0.01, unitsPerUse: 1 },
    cautionDays: 40,
    criticalDays: 14,
    source: MEDICATION_USE,
  },
  {
    id: 'melatonin',
    name: 'Melatonin',
    category: 'medication',
    unit: 'tablets',
    purpose: 'Sleep onset and circadian shifts (onboard formulary)',
    initialQuantity: 40,
    use: { kind: 'doses', chance: 0.08, unitsPerUse: 1, boosts: [SLEEP_SCENARIO_BOOST] },
    cautionDays: 40,
    criticalDays: 14,
    source: SLEEP_MEDICATION,
  },
  {
    id: 'zolpidem-5',
    name: 'Zolpidem 5 mg',
    category: 'medication',
    unit: 'tablets',
    purpose: 'Short-term insomnia; prescribed by the flight surgeon',
    initialQuantity: 40,
    use: { kind: 'doses', chance: 0.07, unitsPerUse: 1, boosts: [SLEEP_SCENARIO_BOOST] },
    cautionDays: 40,
    criticalDays: 14,
    source: SLEEP_MEDICATION,
  },
  {
    id: 'pseudoephedrine-60',
    name: 'Pseudoephedrine 60 mg',
    category: 'medication',
    unit: 'tablets',
    purpose: 'Nasal congestion from the headward fluid shift',
    initialQuantity: 50,
    use: { kind: 'doses', chance: 0.04, unitsPerUse: 1 },
    cautionDays: 40,
    criticalDays: 14,
    source: MEDICATION_USE,
  },
  {
    id: 'loratadine-10',
    name: 'Loratadine 10 mg',
    category: 'medication',
    unit: 'tablets',
    purpose: 'Allergy symptoms',
    initialQuantity: 40,
    use: { kind: 'doses', chance: 0.03, unitsPerUse: 1 },
    cautionDays: 40,
    criticalDays: 14,
    source: MEDICATION_USE,
  },
  {
    id: 'promethazine-25',
    name: 'Promethazine 25 mg',
    category: 'medication',
    unit: 'doses',
    purpose: 'Space motion sickness, mostly in the first three days',
    initialQuantity: 30,
    use: {
      kind: 'doses',
      chance: 0.003,
      unitsPerUse: 1,
      boosts: [{ fromDay: 1, toDay: 3, factor: 130 }],
    },
    cautionDays: 40,
    criticalDays: 14,
    source: MOTION_SICKNESS,
  },
  {
    id: 'hydrocortisone-cream',
    name: 'Hydrocortisone 1% cream',
    category: 'medication',
    unit: 'applications',
    purpose: 'Skin rash and irritation',
    initialQuantity: 30,
    use: { kind: 'doses', chance: 0.02, unitsPerUse: 1 },
    cautionDays: 40,
    criticalDays: 14,
    source: MEDICATION_USE,
  },
];

/** Gross daily use for the whole crew, without day-to-day noise or boosts. */
export function expectedDailyUse(use: UseModel, crewSize = CREW_SIZE): number {
  return use.kind === 'mass'
    ? use.perCrewPerDay * crewSize
    : use.chance * use.unitsPerUse * crewSize;
}

export function recoveryRate(use: UseModel): number {
  return use.kind === 'mass' ? (use.recoveryRate ?? 0) : 0;
}
