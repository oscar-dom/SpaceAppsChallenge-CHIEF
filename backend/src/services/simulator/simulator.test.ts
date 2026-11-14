import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Measurement } from '@chief/shared';
import { MISSION } from '../../../data/crew.js';
import { METRICS } from '../../../data/metrics.js';
import { OSDR_BASELINES } from '../../../data/datasets.js';
import { createDatabase, type DatabaseHandle } from '../../db/client.js';
import { runMigrations } from '../../db/migrations.js';
import { populateDatabase } from '../../db/populate.js';
import { getMeasurements, getMissionClock, setMissionTime } from '../../db/queries.js';
import { MissionSimulator } from './live.js';
import { DAY_MS, HOUR_MS, effectAt } from './model.js';
import { readingTimes } from './schedule.js';

const SENSOR_METRICS_HOURLY = METRICS.filter((m) => m.cadenceMinutes === 60).length;

let handle: DatabaseHandle;
let realNow: number;

function freshDatabase(): DatabaseHandle {
  const h = createDatabase(':memory:');
  runMigrations(h.db);
  populateDatabase(h.db);
  return h;
}

/** A simulator driven by a fake real clock: `advance(simHours)` moves it by that much mission time. */
function simulator(h: DatabaseHandle) {
  const sim = new MissionSimulator(h.db, { now: () => realNow });
  const advance = (simHours: number) => {
    realNow += (simHours * HOUR_MS) / MISSION.timeScale;
    return sim.tick();
  };
  return { sim, advance };
}

beforeEach(() => {
  realNow = 1_000_000;
  handle = freshDatabase();
});

afterEach(() => {
  handle.close();
});

describe('schedule', () => {
  it('reads hourly sensors on the hour and daily metrics at their hour', () => {
    const start = Date.parse(MISSION.startAt);
    const hourly = { id: 'resting-heart-rate', cadenceMinutes: 60 };
    expect(readingTimes(hourly, 0, start, start + 30 * 60_000, start + 3 * HOUR_MS)).toEqual([
      start + HOUR_MS,
      start + 2 * HOUR_MS,
      start + 3 * HOUR_MS,
    ]);
    const daily = { id: 'systolic-blood-pressure', cadenceMinutes: 1440 };
    expect(readingTimes(daily, 0, start, start, start + 2 * DAY_MS)).toEqual([
      start + 8 * HOUR_MS,
      start + DAY_MS + 8 * HOUR_MS,
    ]);
  });

  it('staggers weekly metrics by crew member', () => {
    const start = Date.parse(MISSION.startAt);
    const weekly = { id: 'urine-calcium', cadenceMinutes: 10080 };
    const first = (crewIndex: number) =>
      readingTimes(weekly, crewIndex, start, start - 1, start + 14 * DAY_MS)[0];
    expect(new Set([0, 1, 2, 3].map(first)).size).toBe(4);
  });
});

describe('scenario effects', () => {
  it('ramps, windows and decays', () => {
    expect(effectAt([{ metricId: 'x', kind: 'ramp', amount: 10, fromDay: 0 }], 5, 10)).toBe(5);
    expect(effectAt([{ metricId: 'x', kind: 'ramp', amount: 10, fromDay: 0 }], 20, 10)).toBe(10);
    expect(
      effectAt([{ metricId: 'x', kind: 'window', amount: 7, fromDay: 1, toDay: 2 }], 1.5, 10),
    ).toBe(7);
    const decay = { metricId: 'x', kind: 'decay', amount: 80, fromDay: 1, tauHours: 10 } as const;
    expect(effectAt([decay], 1, 10)).toBe(80);
    expect(effectAt([decay], 1 + 10 / 24, 10)).toBeCloseTo(80 / Math.E);
    expect(effectAt([decay], 0.5, 10)).toBe(0);
  });
});

describe('live simulator', () => {
  it('advances the clock and writes the hourly readings of every crew member', () => {
    const { sim, advance } = simulator(handle);
    const events: Measurement[] = [];
    sim.on('measurement', (m) => events.push(m));
    const before = getMissionClock(handle.db).missionTime;
    const result = advance(3); // 12:00 -> 15:00, no daily reading in between
    expect(result.inserted).toBe(SENSOR_METRICS_HOURLY * 4 * 3);
    expect(events).toHaveLength(result.inserted);
    expect(events.every((m) => m.simulated)).toBe(true);
    expect(getMissionClock(handle.db).missionTime).toBe('2026-10-30T15:00:00Z');
    expect(before).toBe('2026-10-30T12:00:00Z');
  });

  it('gives the same values however the time is split into ticks', () => {
    const other = freshDatabase();
    const first = simulator(handle);
    first.advance(6);
    const second = simulator(other);
    for (let i = 0; i < 6; i++) second.advance(1);
    const values = (h: DatabaseHandle) =>
      getMeasurements(h.db, {
        crewId: 'C002',
        metricId: 'resting-heart-rate',
        from: '2026-10-30T12:00:01Z',
      }).map((m) => [m.takenAt, m.value]);
    expect(values(other)).toEqual(values(handle));
    other.close();
  });

  it('writes daily readings and adds the dose rate to the cumulative dose', () => {
    const { advance } = simulator(handle);
    const cumulative = () =>
      getMeasurements(handle.db, { crewId: 'C001', metricId: 'cumulative-radiation-dose' });
    const before = cumulative();
    advance(12); // 12:00 -> 24:00 crosses 20:00, 21:00 and 23:00
    const after = cumulative();
    expect(after).toHaveLength(before.length + 1);
    const added = (after.at(-1)?.value ?? 0) - (before.at(-1)?.value ?? 0);
    expect(added).toBeGreaterThan(0.2); // ~24 h at ~18 uSv/h is ~0.43 mSv
    expect(added).toBeLessThan(1);
  });

  it('replays the solar storm live from the current time', () => {
    const { sim, advance } = simulator(handle);
    advance(1);
    sim.triggerScenario('solar-storm');
    advance(2);
    const recent = getMeasurements(handle.db, {
      crewId: 'C003',
      metricId: 'radiation-dose-rate',
      from: '2026-10-30T13:30:00Z',
    });
    expect(Math.max(...recent.map((m) => m.value))).toBeGreaterThan(45);
    expect(() => sim.triggerScenario('unknown')).toThrow(/Unknown live scenario/);
  });

  it('starts the blood values from the real OSDR baselines', () => {
    const { advance } = simulator(handle);
    advance(24 * 14); // two weeks: every weekly lab metric is read at least once
    const latest = getMeasurements(handle.db, {
      crewId: 'C003',
      metricId: 'white-blood-cell-count',
    }).at(-1);
    const baseline = OSDR_BASELINES['white-blood-cell-count']?.['C003'] ?? 0;
    expect(latest?.simulated).toBe(true);
    expect(Math.abs((latest?.value ?? 0) - baseline)).toBeLessThan(3);
  });

  it('stops at the end of the mission', () => {
    const endMs = Date.parse(MISSION.startAt) + MISSION.lengthDays * DAY_MS;
    setMissionTime(
      handle.db,
      new Date(endMs - 2 * HOUR_MS).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    );
    const { sim, advance } = simulator(handle);
    let ended = false;
    sim.on('end', () => (ended = true));
    advance(10);
    expect(ended).toBe(true);
    expect(getMissionClock(handle.db).missionDay).toBe(MISSION.lengthDays + 1);
  });
});
