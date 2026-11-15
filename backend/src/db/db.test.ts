import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CREW, MISSION } from '../../data/crew.js';
import { FORMULARY } from '../../data/formulary.js';
import { METRICS } from '../../data/metrics.js';
import { THRESHOLDS } from '../../data/thresholds.js';
import { createDatabase, type DatabaseHandle } from './client.js';
import { runMigrations } from './migrations.js';
import { populateDatabase } from './populate.js';
import {
  acknowledgeAlert,
  getAlerts,
  getCrew,
  getFormulary,
  getLatestMeasurements,
  getMeasurements,
  getMetrics,
  getMissionClock,
  getThresholds,
  insertAlert,
  insertMeasurement,
  setMissionTime,
} from './queries.js';

let handle: DatabaseHandle;

function freshDatabase(seed?: number): DatabaseHandle {
  const h = createDatabase(':memory:');
  runMigrations(h.db);
  populateDatabase(h.db, { seed });
  return h;
}

beforeEach(() => {
  handle = freshDatabase();
});

afterEach(() => {
  handle.close();
});

function latest(crewId: string, metricId: string): number {
  const reading = getLatestMeasurements(handle.db, crewId).find((m) => m.metricId === metricId);
  if (!reading) throw new Error(`No reading of ${metricId} for ${crewId}`);
  return reading.value;
}

describe('seed', () => {
  it('loads the crew, the metric catalog, the thresholds and the formulary', () => {
    expect(getCrew(handle.db)).toHaveLength(CREW.length);
    expect(getMetrics(handle.db)).toHaveLength(METRICS.length);
    expect(getThresholds(handle.db)).toHaveLength(THRESHOLDS.length);
    expect(getFormulary(handle.db)).toHaveLength(FORMULARY.length);
  });

  it('puts the mission clock at the demo day', () => {
    const clock = getMissionClock(handle.db);
    expect(clock.missionDay).toBe(MISSION.simDay);
    expect(clock.missionLengthDays).toBe(MISSION.lengthDays);
  });

  it('marks generated readings as simulated and only the OSDR baselines as real', () => {
    const real = handle.sqlite
      .prepare('SELECT metric_id, taken_at FROM measurements WHERE simulated = 0')
      .all() as { metric_id: string; taken_at: string }[];
    expect(real.length).toBe(24); // 4 crew x 3 preflight timepoints x 2 metrics
    for (const row of real) {
      expect(['white-blood-cell-count', 'fasting-glucose']).toContain(row.metric_id);
      expect(row.taken_at < MISSION.startAt).toBe(true);
    }
  });

  it('never creates readings after the simulated clock', () => {
    const { missionTime } = getMissionClock(handle.db);
    const rows = handle.sqlite
      .prepare('SELECT COUNT(*) AS n FROM measurements WHERE taken_at > ?')
      .get(missionTime) as { n: number };
    expect(rows.n).toBe(0);
  });

  it('is deterministic for the same seed and different for another one', () => {
    const digest = (h: DatabaseHandle) =>
      createHash('sha256')
        .update(
          JSON.stringify(
            h.sqlite
              .prepare('SELECT crew_id, metric_id, value, taken_at FROM measurements ORDER BY id')
              .all(),
          ),
        )
        .digest('hex');
    const same = freshDatabase();
    const other = freshDatabase(7);
    expect(digest(same)).toBe(digest(handle));
    expect(digest(other)).not.toBe(digest(handle));
    same.close();
    other.close();
  });

  it('refuses to seed a database that already has data', () => {
    expect(() => populateDatabase(handle.db)).toThrow(/already has data/);
  });
});

describe('demo scenarios', () => {
  it('plants vitamin D deficiency on C003', () => {
    expect(latest('C003', 'vitamin-d-25-oh')).toBeLessThan(20);
    expect(latest('C001', 'vitamin-d-25-oh')).toBeGreaterThan(25);
  });

  it('plants sleep deprivation and slower reactions on C004', () => {
    expect(latest('C004', 'sleep-duration')).toBeLessThan(6.5);
    expect(latest('C004', 'reaction-time-mean')).toBeGreaterThan(300);
    expect(latest('C001', 'sleep-duration')).toBeGreaterThan(6.5);
  });

  it('plants early SANS on C002', () => {
    expect(latest('C002', 'optic-disc-edema-grade')).toBeGreaterThanOrEqual(1);
    expect(latest('C001', 'optic-disc-edema-grade')).toBe(0);
  });

  it('plants rising urine calcium and bone loss on C001', () => {
    expect(latest('C001', 'urine-calcium')).toBeGreaterThan(240);
    expect(latest('C001', 'bone-mineral-density-change')).toBeLessThan(
      latest('C003', 'bone-mineral-density-change'),
    );
  });

  it('raises the dose rate of the whole crew during the solar storm', () => {
    for (const { id } of CREW) {
      const readings = getMeasurements(handle.db, { crewId: id, metricId: 'radiation-dose-rate' });
      expect(Math.max(...readings.map((r) => r.value))).toBeGreaterThan(60);
    }
  });

  it('accumulates the radiation dose from the previous career dose', () => {
    expect(latest('C002', 'cumulative-radiation-dose')).toBeGreaterThan(280);
    const series = getMeasurements(handle.db, {
      crewId: 'C001',
      metricId: 'cumulative-radiation-dose',
    });
    expect(series.at(-1)?.value).toBeGreaterThan(series[0]?.value ?? Infinity);
  });
});

describe('queries', () => {
  it('returns measurements in the shared format, oldest first, within a range', () => {
    const all = getMeasurements(handle.db, { crewId: 'C001', metricId: 'resting-heart-rate' });
    expect(all.length).toBeGreaterThan(1000);
    expect(all[0]).toMatchObject({
      crewMemberId: 'C001',
      metricId: 'resting-heart-rate',
      simulated: true,
    });
    expect(typeof all[0]?.id).toBe('string');
    const [from, to] = [all[10]?.takenAt, all[20]?.takenAt];
    const range = getMeasurements(handle.db, {
      crewId: 'C001',
      metricId: 'resting-heart-rate',
      from,
      to,
    });
    expect(range).toHaveLength(11);
  });

  it('returns the latest reading of every metric of a crew member', () => {
    const readings = getLatestMeasurements(handle.db, 'C001');
    expect(new Set(readings.map((r) => r.metricId)).size).toBe(METRICS.length);
  });

  it('ignores a duplicated reading instead of failing', () => {
    const reading = {
      crewMemberId: 'C001',
      metricId: 'spo2-test',
      value: 1,
      takenAt: '2026-10-30T10:30:00Z',
      simulated: true,
    };
    expect(() => insertMeasurement(handle.db, reading)).toThrow(); // unknown metric: foreign key
    const ok = { ...reading, metricId: 'blood-oxygen-saturation', value: 98 };
    expect(insertMeasurement(handle.db, ok)).toMatchObject({ inserted: true });
    expect(insertMeasurement(handle.db, ok)).toEqual({ inserted: false, id: null });
  });

  it('moves the mission clock', () => {
    setMissionTime(handle.db, '2026-11-15T12:00:00Z');
    expect(getMissionClock(handle.db).missionDay).toBe(76);
  });

  it('stores, sorts and acknowledges alerts', () => {
    const base = {
      crewMemberId: 'C004',
      system: 'sleep-cognition',
      kind: 'anomaly',
      escalation: 'self-care',
      metricId: 'sleep-duration',
    } as const;
    insertAlert(handle.db, {
      ...base,
      severity: 'caution',
      title: 'Short sleep',
      message: 'Slept 6.2 h.',
      createdAt: '2026-10-30T08:00:00Z',
    });
    const critical = insertAlert(handle.db, {
      ...base,
      severity: 'critical',
      title: 'Very short sleep',
      message: 'Slept 4.8 h.',
      createdAt: '2026-10-30T07:00:00Z',
    });
    const alerts = getAlerts(handle.db, 'C004');
    expect(alerts.map((a) => a.severity)).toEqual(['critical', 'caution']);
    expect(critical.acknowledged).toBe(false);
    expect(acknowledgeAlert(handle.db, critical.id)?.acknowledged).toBe(true);
    expect(acknowledgeAlert(handle.db, '9999')).toBeNull();
  });
});

describe('constraints', () => {
  const exec = (sql: string, ...params: unknown[]) => handle.sqlite.prepare(sql).run(...params);

  it('rejects dates that are not YYYY-MM-DDTHH:mm:ssZ', () => {
    const insert = (takenAt: string) =>
      exec(
        "INSERT INTO measurements (crew_id, metric_id, value, taken_at) VALUES ('C001', 'resting-heart-rate', 60, ?)",
        takenAt,
      );
    expect(() => insert('2026-10-30T10:00:00.000Z')).toThrow(/CHECK/);
    expect(() => insert('2026-10-30 10:00:00')).toThrow(/CHECK/);
    expect(() => insert('2026-10-30T10:30:00Z')).not.toThrow();
  });

  it('rejects a threshold without a source', () => {
    const insert = (source: string) =>
      exec(
        "INSERT INTO thresholds (metric_id, ranges, escalation, fallback_recommendation, source) VALUES ('heart-rate-variability', '[]', '{}', 'x', ?)",
        source,
      );
    expect(() => insert('{}')).toThrow(/CHECK/);
    expect(() => insert('{"document":"  "}')).toThrow(/CHECK/);
    expect(() => insert('not json')).toThrow();
    expect(() => insert('{"document":"Some NASA document"}')).not.toThrow();
  });

  it('rejects a formulary item without a source', () => {
    expect(() =>
      exec("INSERT INTO formulary (id, name, indication, source) VALUES ('x', 'X', 'Pain', '{}')"),
    ).toThrow(/CHECK/);
  });

  it('rejects invalid statuses, kinds and incomplete alerts', () => {
    const insert = (
      severity: string,
      kind: string,
      metricId: string | null,
      dueAt: string | null,
    ) =>
      exec(
        "INSERT INTO alerts (crew_id, system, kind, severity, title, message, escalation, metric_id, due_at, created_at) VALUES ('C001', 'immune', ?, ?, 't', 'm', 'self-care', ?, ?, '2026-10-30T10:00:00Z')",
        kind,
        severity,
        metricId,
        dueAt,
      );
    expect(() => insert('warning', 'anomaly', 'fasting-glucose', null)).toThrow(/CHECK/);
    expect(() => insert('caution', 'other', 'fasting-glucose', null)).toThrow(/CHECK/);
    expect(() => insert('caution', 'anomaly', null, null)).toThrow(/CHECK/);
    expect(() => insert('info', 'scheduled', null, null)).toThrow(/CHECK/);
    expect(() => insert('info', 'scheduled', null, '2026-10-31T10:00:00Z')).not.toThrow();
  });

  it('allows a single mission row and a crew id in the OSDR format', () => {
    expect(() =>
      exec(
        "INSERT INTO mission (id, name, start_at, length_days, time_scale, sim_time) VALUES (2, 'x', '2026-09-01T00:00:00Z', 1, 1, '2026-09-01T00:00:00Z')",
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      exec(
        "INSERT INTO crew_members (id, name, role, agency, age, sex) VALUES ('X1', 'n', 'r', 'a', 30, 'male')",
      ),
    ).toThrow(/CHECK/);
  });

  it('keeps the database consistent: foreign keys are enforced', () => {
    expect(() =>
      exec(
        "INSERT INTO measurements (crew_id, metric_id, value, taken_at) VALUES ('C999', 'resting-heart-rate', 60, '2026-10-30T10:00:00Z')",
      ),
    ).toThrow(/FOREIGN KEY/);
  });
});

describe('data files', () => {
  it('give every threshold a source and a known metric', () => {
    const ids = new Set(METRICS.map((m) => m.id));
    for (const t of THRESHOLDS) {
      expect(ids.has(t.metricId)).toBe(true);
      expect(t.source.document.trim().length).toBeGreaterThan(0);
    }
  });

  it('never set a dosage in the formulary without a cited source', () => {
    for (const item of FORMULARY) expect(item.dosage).toBeUndefined();
  });
});

describe('thresholds against the demo scenarios', () => {
  /** Same rule as the contract: inclusive min, exclusive max, outside every range is critical. */
  function statusOf(metricId: string, value: number): string {
    const threshold = THRESHOLDS.find((t) => t.metricId === metricId);
    if (!threshold) return 'no-threshold';
    const match = threshold.ranges.find(
      ({ range }) =>
        (range.min === undefined || value >= range.min) &&
        (range.max === undefined || value < range.max),
    );
    return match?.status ?? 'critical';
  }

  it('never lets two ranges of one threshold overlap', () => {
    for (const t of THRESHOLDS) {
      const ranges = t.ranges.map(
        (r) => [r.range.min ?? -Infinity, r.range.max ?? Infinity] as const,
      );
      for (let i = 0; i < ranges.length; i++) {
        for (let j = i + 1; j < ranges.length; j++) {
          const [a, b] = [ranges[i], ranges[j]];
          if (!a || !b) continue;
          expect(a[0] < b[1] && b[0] < a[1], `${t.metricId}: ranges ${i} and ${j} overlap`).toBe(
            false,
          );
        }
      }
    }
  });

  it('makes every planted case leave the nominal range', () => {
    const cases: [string, string][] = [
      ['C001', 'bone-mineral-density-change'],
      ['C001', 'urine-calcium'],
      ['C002', 'optic-disc-edema-grade'],
      ['C002', 'intraocular-pressure'],
      ['C002', 'cumulative-radiation-dose'],
      ['C003', 'vitamin-d-25-oh'],
      ['C004', 'sleep-duration'],
      ['C004', 'sleep-efficiency'],
    ];
    for (const [crewId, metricId] of cases) {
      expect(statusOf(metricId, latest(crewId, metricId)), `${crewId} ${metricId}`).not.toBe(
        'nominal',
      );
    }
  });

  it('keeps the caution-level cases in the caution band', () => {
    expect(statusOf('urine-calcium', latest('C001', 'urine-calcium'))).toBe('caution');
    expect(statusOf('optic-disc-edema-grade', latest('C002', 'optic-disc-edema-grade'))).toBe(
      'caution',
    );
  });

  it('keeps the healthy readings of the other crew members nominal', () => {
    expect(
      statusOf('bone-mineral-density-change', latest('C003', 'bone-mineral-density-change')),
    ).toBe('nominal');
    expect(statusOf('vitamin-d-25-oh', latest('C001', 'vitamin-d-25-oh'))).toBe('nominal');
    expect(statusOf('sleep-duration', latest('C001', 'sleep-duration'))).toBe('nominal');
    expect(statusOf('cumulative-radiation-dose', latest('C003', 'cumulative-radiation-dose'))).toBe(
      'nominal',
    );
  });
});
