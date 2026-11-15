import type { Hazard, Resupply, SourceReference } from '@chief/shared';
import { MISSION } from './crew.js';
import { SOLAR_STORM_ONSET_DAY, SOLAR_STORM_SPAN_DAYS } from './scenarios.js';

/**
 * The mission route: 10 stages of the 180-day ISS increment, the hazards along it and the cargo
 * ships that resupply the station. The phenomena and their health effects are real (sources
 * below); their timing on this mission is SIMULATED, except the solar storm, which replays the
 * real May 2024 event from NASA DONKI on the demo's mission day.
 */

export const STAGE_COUNT = 10;

export interface StageSeed {
  title: string;
  summary: string;
}

/** One entry per stage, in order. Each stage covers MISSION.lengthDays / 10 days. */
export const STAGES: StageSeed[] = [
  {
    title: 'Launch and adaptation',
    summary: 'Docking, first days in weightlessness: motion sickness, fluid shift and back pain.',
  },
  { title: 'Settling in', summary: 'Routines, exercise plan and the first science runs.' },
  { title: 'First resupply', summary: 'A Progress cargo ship docks with food, water and propellant.' },
  { title: 'Solar storm', summary: 'Space weather: proton events from an active Sun.' },
  { title: 'First spacewalk', summary: 'An EVA for station maintenance.' },
  { title: 'Mid-mission resupply', summary: 'A Dragon cargo ship brings food, water and medication.' },
  { title: 'Long-duration phase', summary: 'Bone, muscle and vision changes build up; routine checks.' },
  { title: 'Second spacewalk', summary: 'An EVA to install new hardware.' },
  { title: 'Final resupply', summary: 'A Cygnus cargo ship brings the last supplies of the increment.' },
  { title: 'Return preparation', summary: 'Handover, reconditioning exercise and undocking for the return.' },
];

const DONKI: SourceReference = {
  document: 'NASA DONKI (CCMC, NASA Goddard): SEP and GST events of the May 2024 solar storm',
  url: 'https://api.nasa.gov/',
};

const SAA: SourceReference = {
  document:
    'Anderson BM et al., "Simulation of Spatial and Temporal Radiation Exposures for ISS in the South Atlantic Anomaly", AIAA 2004-6087 (NASA NTRS 20040152077)',
  section: 'Practically all trapped proton exposure occurs when the ISS passes through the SAA',
  url: 'https://ntrs.nasa.gov/citations/20040152077',
};

const BETA_ANGLE: SourceReference = {
  document: 'AMS-02 collaboration (ISS payload), "Thermal Operation"',
  section:
    'The solar beta angle follows the ~60-day precession of the ISS orbit; above ~70 degrees there is no orbital night',
  url: 'https://ams02.space/de/node/489',
};

const EVA: SourceReference = {
  document:
    'Henson R, Iovine J, "Determining Thermal Capabilities for External Transfer Operations on the International Space Station", ICES 2018 (NASA NTRS 20180004474)',
  section: 'External thermal environment of ISS operations outside the station',
  url: 'https://ntrs.nasa.gov/citations/20180004474',
};

const CARGO: SourceReference = {
  document: 'NASA, International Space Station cargo resupply (Commercial Resupply Services and Progress)',
  url: 'https://www.nasa.gov/international-space-station/space-station-visiting-vehicles/',
};

/** High beta periods follow the ~60-day precession of the orbit (timing simulated). */
const HIGH_BETA_WINDOWS: [number, number][] = [
  [48, 54],
  [108, 114],
  [168, 174],
];

export const HAZARDS: Hazard[] = [
  {
    id: 'south-atlantic-anomaly',
    kind: 'radiation',
    title: 'South Atlantic Anomaly passes',
    startDay: 1,
    endDay: MISSION.lengthDays,
    severity: 'caution',
    effect:
      'Several orbits a day cross the South Atlantic Anomaly, where trapped protons give most of the station dose.',
    preparation:
      'Wear the personal dosimeter at all times and plan EVAs and sleep stations away from SAA passes when possible.',
    simulated: false,
    source: SAA,
  },
  {
    id: 'solar-particle-event',
    kind: 'radiation',
    title: 'Solar particle event (May 2024 storm replay)',
    startDay: SOLAR_STORM_ONSET_DAY,
    endDay: Math.round((SOLAR_STORM_ONSET_DAY + SOLAR_STORM_SPAN_DAYS + 1.5) * 10) / 10,
    severity: 'critical',
    effect:
      'Proton showers raise the dose rate on board for hours after each onset; the dose adds to the career limit.',
    preparation:
      'Shelter in the most shielded modules during proton alerts, postpone EVAs and keep checking the dosimeter.',
    simulated: false,
    source: DONKI,
  },
  ...HIGH_BETA_WINDOWS.map(
    ([startDay, endDay], i): Hazard => ({
      id: `high-beta-${i + 1}`,
      kind: 'thermal',
      title: 'High beta angle: constant sunlight',
      startDay,
      endDay,
      severity: 'caution',
      effect:
        'The station stays in sunlight for days with no orbital night: outer surfaces heat up and the thermal control system works harder.',
      preparation:
        'Keep window shades closed in sleep periods, hydrate, and report warm or humid modules to the ground.',
      simulated: true,
      source: BETA_ANGLE,
    }),
  ),
  ...[
    { day: 80, n: 1 },
    { day: 135, n: 2 },
  ].map(
    ({ day, n }): Hazard => ({
      id: `eva-${n}`,
      kind: 'thermal',
      title: `Spacewalk ${n} (EVA)`,
      startDay: day,
      endDay: day + 1,
      severity: 'caution',
      effect:
        'Outside the station the suit swings between deep cold in shadow and strong heat in sunlight, with more radiation than inside and a decompression sickness risk.',
      preparation:
        'Follow the pre-breathe protocol, check suit cooling, hydrate, and avoid EVAs during solar particle events.',
      simulated: true,
      source: EVA,
    }),
  ),
];

/** Cargo ships (timing and cargo simulated; the vehicles and the cadence are real). */
export const RESUPPLIES: Resupply[] = [
  {
    id: 'progress-1',
    vehicle: 'Progress MS cargo ship (simulated flight)',
    day: 40,
    cargo: [
      { itemId: 'food-packaged', quantity: 400 },
      { itemId: 'water-potable', quantity: 400 },
    ],
    simulated: true,
    source: CARGO,
  },
  {
    id: 'dragon-1',
    vehicle: 'Cargo Dragon, Commercial Resupply Services (simulated flight)',
    day: 95,
    cargo: [
      { itemId: 'food-packaged', quantity: 420 },
      { itemId: 'water-potable', quantity: 200 },
      { itemId: 'acetaminophen-325', quantity: 60 },
      { itemId: 'ibuprofen-400', quantity: 40 },
      { itemId: 'melatonin', quantity: 40 },
      { itemId: 'zolpidem-5', quantity: 30 },
      { itemId: 'pseudoephedrine-60', quantity: 25 },
      { itemId: 'hydrocortisone-cream', quantity: 15 },
    ],
    simulated: true,
    source: CARGO,
  },
  {
    id: 'cygnus-1',
    vehicle: 'Cygnus cargo ship, Commercial Resupply Services (simulated flight)',
    day: 145,
    cargo: [
      { itemId: 'food-packaged', quantity: 300 },
      { itemId: 'water-potable', quantity: 200 },
      { itemId: 'loratadine-10', quantity: 20 },
    ],
    simulated: true,
    source: CARGO,
  },
];
