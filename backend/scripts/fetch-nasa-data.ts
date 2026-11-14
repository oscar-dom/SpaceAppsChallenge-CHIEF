/**
 * `npm run data:fetch -w backend`: downloads the NASA datasets CHIEF uses and writes the processed,
 * trimmed versions to `backend/data/datasets/`. The processed files are committed, so the demo works
 * offline; run this again only to refresh them.
 *
 *  - NASA OSDR, Inspiration4 crew (OSD-569 complete blood count, OSD-575 metabolic panel): white
 *    blood cell count and glucose of C001-C004 at every timepoint.
 *  - NASA DONKI (space weather): solar energetic particle events and geomagnetic storms of the
 *    May 2024 solar storm, replayed by the solar-storm demo scenario.
 *
 * DONKI needs an API key from https://api.nasa.gov (NASA_API_KEY); without one it uses DEMO_KEY,
 * which is rate limited.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'datasets',
);
const OSDR_DOWNLOAD = 'https://osdr.nasa.gov/geode-py/ws/studies';
const DONKI = 'https://api.nasa.gov/DONKI';
const STORM_WINDOW = { startDate: '2024-05-01', endDate: '2024-06-29' }; // DONKI allows 60 days max

async function getText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`GET ${url.replace(/api_key=[^&]+/, 'api_key=***')}: ${response.status}`);
  return response.text();
}

/** Minimal CSV parser (quoted fields, BOM). Enough for the OSDR exports. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // drop the BOM
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((values) => Object.fromEntries(header.map((key, i) => [key, values[i] ?? ''])));
}

/** "C001_serum_L-92" -> { crewId: "C001", timepoint: "L-92", daysFromLaunch: -92 }. */
function parseSample(name: string): { crewId: string; timepoint: string; daysFromLaunch: number } {
  const match = /^(C\d{3})_[^_]+_([LR])([+-]\d+)/.exec(name);
  if (!match) throw new Error(`Unexpected OSDR sample name: ${name}`);
  const [, crewId = '', phase = '', offset = '0'] = match;
  // Launch is day 0. Return days (R+n) count from landing, after a 3-day flight.
  const days = Number(offset);
  return {
    crewId,
    timepoint: `${phase}${offset}`,
    daysFromLaunch: phase === 'L' ? days : 3 + days,
  };
}

function numberOrNull(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchOsdr(): Promise<void> {
  const [cbc, cmp] = await Promise.all([
    getText(
      `${OSDR_DOWNLOAD}/OSD-569/download?source=datamanager&file=LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv`,
    ),
    getText(
      `${OSDR_DOWNLOAD}/OSD-575/download?source=datamanager&file=LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv`,
    ),
  ]);
  const samples = new Map<string, Record<string, unknown>>();
  const key = (s: ReturnType<typeof parseSample>) => `${s.crewId}|${s.timepoint}`;
  for (const row of parseCsv(cbc)) {
    const sample = parseSample(row['Sample Name'] ?? '');
    samples.set(key(sample), {
      ...sample,
      ...samples.get(key(sample)),
      whiteBloodCellCount: numberOrNull(
        row['white_blood_cell_count_value_thousand_per_microliter'],
      ),
    });
  }
  for (const row of parseCsv(cmp)) {
    const sample = parseSample(row['Sample Name'] ?? '');
    samples.set(key(sample), {
      ...sample,
      ...samples.get(key(sample)),
      glucose: numberOrNull(row['glucose_value_milligram_per_deciliter']),
    });
  }
  const dataset = {
    source: {
      document:
        'NASA OSDR, Inspiration4 crew: OSD-569 (complete blood count) and OSD-575 (comprehensive metabolic panel)',
      url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575',
    },
    retrievedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    note: 'Real measurements of the 4 anonymous Inspiration4 crew members (C001-C004), 3-day flight. daysFromLaunch: launch = 0, return timepoints (R+n) are 3 + n.',
    units: { whiteBloodCellCount: '10^3/uL', glucose: 'mg/dL' },
    samples: [...samples.values()].sort(
      (a, b) =>
        String(a.crewId).localeCompare(String(b.crewId)) ||
        Number(a.daysFromLaunch) - Number(b.daysFromLaunch),
    ),
  };
  write('osdr-inspiration4-blood.json', dataset);
}

interface DonkiSep {
  sepID: string;
  eventTime: string;
  instruments?: { displayName: string }[];
}
interface DonkiGst {
  gstID: string;
  startTime: string;
  allKpIndex?: { observedTime: string; kpIndex: number }[];
}

async function fetchDonki(): Promise<void> {
  const apiKey = process.env.NASA_API_KEY || 'DEMO_KEY';
  const query = `startDate=${STORM_WINDOW.startDate}&endDate=${STORM_WINDOW.endDate}&api_key=${apiKey}`;
  const sep = JSON.parse(await getText(`${DONKI}/SEP?${query}`)) as DonkiSep[];
  const gst = JSON.parse(await getText(`${DONKI}/GST?${query}`)) as DonkiGst[];
  const toIso = (time: string) => (/T\d{2}:\d{2}Z$/.test(time) ? time.replace(/Z$/, ':00Z') : time);
  const dataset = {
    source: {
      document: 'NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information)',
      url: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/',
    },
    retrievedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    note: 'May 2024 solar storm. Only GOES proton detections (>10 MeV and >100 MeV) are kept as particle event onsets.',
    window: STORM_WINDOW,
    particleEvents: sep
      .flatMap((event) =>
        (event.instruments ?? [])
          .filter((instrument) => /GOES.*>\s*(10|100) MeV/.test(instrument.displayName))
          .map((instrument) => ({
            id: event.sepID,
            onset: toIso(event.eventTime),
            instrument: instrument.displayName,
            energyMeV: /> ?100 MeV/.test(instrument.displayName) ? 100 : 10,
          })),
      )
      .sort((a, b) => a.onset.localeCompare(b.onset)),
    geomagneticStorms: gst.map((storm) => ({
      id: storm.gstID,
      start: toIso(storm.startTime),
      kp: (storm.allKpIndex ?? []).map((k) => ({ time: toIso(k.observedTime), kp: k.kpIndex })),
    })),
  };
  write('donki-may-2024-storm.json', dataset);
}

function write(file: string, data: unknown): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, file), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Wrote data/datasets/${file}`);
}

try {
  await fetchOsdr();
  await fetchDonki();
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
