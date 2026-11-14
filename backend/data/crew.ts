import type { CrewMember } from '@chief/shared';

/**
 * The 4 fictional crew members of the simulated ISS mission. Ids C001-C004 are the anonymous
 * codes used by NASA OSDR for the Inspiration4 crew; the names are made up and must never be
 * tied to real people.
 */
export interface CrewSeed extends CrewMember {
  heightCm: number;
  weightKg: number;
}

export const CREW: CrewSeed[] = [
  {
    id: 'C001',
    name: 'Ana Ruiz',
    role: 'Commander',
    agency: 'ESA',
    age: 41,
    sex: 'female',
    heightCm: 168,
    weightKg: 61,
  },
  {
    id: 'C002',
    name: 'Leo Martín',
    role: 'Pilot',
    agency: 'NASA',
    age: 44,
    sex: 'male',
    heightCm: 181,
    weightKg: 79,
  },
  {
    id: 'C003',
    name: 'Sara Okafor',
    role: 'Flight Surgeon',
    agency: 'NASA',
    age: 36,
    sex: 'female',
    heightCm: 172,
    weightKg: 64,
  },
  {
    id: 'C004',
    name: 'Iker Vidal',
    role: 'Flight Engineer',
    agency: 'ESA',
    age: 33,
    sex: 'male',
    heightCm: 176,
    weightKg: 72,
  },
];

/** The simulated mission (about 6 months). `simDay` is the mission day the demo starts at. */
export const MISSION = {
  name: 'ISS Expedition (simulated)',
  startAt: '2026-09-01T00:00:00Z',
  lengthDays: 180,
  /** Simulated seconds per real second: 1 real second = 10 simulated minutes. */
  timeScale: 600,
  /** 1-based mission day of the simulated clock when the seed finishes (at 12:00 UTC). */
  simDay: 60,
} as const;
