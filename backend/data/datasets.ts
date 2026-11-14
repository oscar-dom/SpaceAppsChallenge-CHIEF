import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourceReference } from '@chief/shared';

/**
 * Real NASA datasets, processed by `npm run data:fetch -w backend` into `data/datasets/`. They are
 * committed so the demo works offline. Each file carries its source and retrieval date.
 */
const DATASETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'datasets');

function readDataset<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATASETS_DIR, file), 'utf8')) as T;
}

// --- NASA OSDR: Inspiration4 blood panels -------------------------------------------------------

export interface OsdrSample {
  crewId: string;
  /** OSDR timepoint label, e.g. "L-92" (days before launch) or "R+45" (days after return). */
  timepoint: string;
  /** Days from launch (launch = 0). Return timepoints are 3 + n because the flight lasted 3 days. */
  daysFromLaunch: number;
  whiteBloodCellCount: number | null;
  glucose: number | null;
}

export interface OsdrDataset {
  source: SourceReference;
  retrievedAt: string;
  samples: OsdrSample[];
}

export const OSDR_BLOOD = readDataset<OsdrDataset>('osdr-inspiration4-blood.json');

/** Which OSDR field feeds which CHIEF metric. */
export const OSDR_METRICS = {
  'white-blood-cell-count': 'whiteBloodCellCount',
  'fasting-glucose': 'glucose',
} as const satisfies Record<string, keyof OsdrSample>;

/** Preflight samples (before launch): the real baseline of each crew member. */
export const OSDR_PREFLIGHT = OSDR_BLOOD.samples.filter((sample) => sample.daysFromLaunch < 0);

/**
 * Mean of the preflight values per metric and crew member. The simulator starts from these real
 * baselines instead of invented ones: `{ 'fasting-glucose': { C001: 77.3, ... } }`.
 */
export const OSDR_BASELINES: Record<string, Record<string, number>> = Object.fromEntries(
  Object.entries(OSDR_METRICS).map(([metricId, field]) => {
    const byCrew: Record<string, number[]> = {};
    for (const sample of OSDR_PREFLIGHT) {
      const value = sample[field];
      if (value !== null) (byCrew[sample.crewId] ??= []).push(value);
    }
    const means = Object.entries(byCrew).map(([crewId, values]) => [
      crewId,
      values.reduce((sum, v) => sum + v, 0) / values.length,
    ]);
    return [metricId, Object.fromEntries(means)];
  }),
);

// --- NASA DONKI: May 2024 solar storm -----------------------------------------------------------

export interface ParticleEvent {
  id: string;
  /** Onset of the proton event, ISO 8601 UTC. */
  onset: string;
  instrument: string;
  /** Energy channel that detected it: >10 MeV or >100 MeV. */
  energyMeV: 10 | 100;
}

export interface DonkiDataset {
  source: SourceReference;
  retrievedAt: string;
  particleEvents: ParticleEvent[];
  geomagneticStorms: { id: string; start: string; kp: { time: string; kp: number }[] }[];
}

export const DONKI_STORM = readDataset<DonkiDataset>('donki-may-2024-storm.json');
