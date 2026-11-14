import type { MetricStatus, Status, SystemStatus, Threshold } from '@chief/shared';
import { describe, expect, it } from 'vitest';
import { SYSTEM_WEIGHTS } from '../../config/constants.js';
import { SIMULATION } from '../../../data/simulation.js';
import { THRESHOLDS } from '../../../data/thresholds.js';
import {
  computeHealthScore,
  computeTrend,
  diffAlerts,
  evaluateSystem,
  evaluateValue,
  findAnomalies,
  scoreInBand,
  worstStatus,
} from './engine.js';

const heartRate: Threshold = {
  metricId: 'heart-rate',
  ranges: [
    { status: 'nominal', range: { min: 50, max: 100 } },
    { status: 'caution', range: { min: 40, max: 50 } },
    { status: 'caution', range: { min: 100, max: 120 } },
  ],
  escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' },
  fallbackRecommendation: 'Rest and repeat the reading.',
  source: { document: 'Test source' },
};

const minimumOnly: Threshold = {
  ...heartRate,
  metricId: 'sleep-duration',
  ranges: [
    { status: 'nominal', range: { min: 7 } },
    { status: 'caution', range: { max: 7 } },
  ],
};

function metricStatus(status: Status, withData = true): MetricStatus {
  return {
    metric: {
      id: `m-${status}`,
      system: 'cardiovascular',
      name: 'Metric',
      unit: 'u',
      description: '',
      origin: 'sensor',
      cadenceMinutes: 10,
    },
    latest: withData
      ? {
          id: 'x',
          crewMemberId: 'C001',
          metricId: 'm',
          value: 1,
          takenAt: '2026-11-14T10:00:00Z',
          simulated: true,
        }
      : null,
    status,
    trend: 'stable',
  };
}

describe('evaluateValue', () => {
  it('returns the status of the range that contains the value', () => {
    expect(evaluateValue(72, heartRate)).toBe('nominal');
    expect(evaluateValue(45, heartRate)).toBe('caution');
    expect(evaluateValue(110, heartRate)).toBe('caution');
  });

  it('treats min as inclusive and max as exclusive', () => {
    expect(evaluateValue(50, heartRate)).toBe('nominal');
    expect(evaluateValue(100, heartRate)).toBe('caution');
    expect(evaluateValue(120, heartRate)).toBe('critical');
  });

  it('counts a value outside every range as critical', () => {
    expect(evaluateValue(30, heartRate)).toBe('critical');
    expect(evaluateValue(180, heartRate)).toBe('critical');
  });

  it('supports open-ended ranges, so a single cut-off never yields critical', () => {
    expect(evaluateValue(8, minimumOnly)).toBe('nominal');
    expect(evaluateValue(2, minimumOnly)).toBe('caution');
  });
});

describe('computeTrend', () => {
  it('compares the last third of the series with the first third', () => {
    expect(computeTrend([60, 60, 61, 64, 66, 68])).toBe('rising');
    expect(computeTrend([68, 66, 64, 61, 60, 60])).toBe('falling');
    expect(computeTrend([60, 61, 60, 61, 60, 61])).toBe('stable');
  });

  it('is stable when there are too few points', () => {
    expect(computeTrend([60, 90])).toBe('stable');
  });
});

describe('worstStatus', () => {
  it('picks the most severe status', () => {
    expect(worstStatus(['nominal', 'critical', 'caution'])).toBe('critical');
    expect(worstStatus([])).toBe('nominal');
  });
});

describe('evaluateSystem', () => {
  it('takes the worst metric status and the mean metric score', () => {
    const system = evaluateSystem('cardiovascular', [
      metricStatus('nominal'),
      metricStatus('caution'),
    ]);
    expect(system.status).toBe('caution');
    // Mean 80, scaled into the caution band: 70 + 0.8 * 19.
    expect(system.score).toBe(85);
  });

  it('keeps the system score inside the band of its status', () => {
    const metrics = [
      metricStatus('critical'),
      metricStatus('nominal'),
      metricStatus('nominal'),
      metricStatus('nominal'),
    ];
    // Mean 80, but one critical metric puts it in the critical band: 0.8 * 69.
    expect(evaluateSystem('cardiovascular', metrics)).toMatchObject({
      status: 'critical',
      score: 55,
    });
    // An all-caution system (mean 60) stays in the caution band.
    expect(evaluateSystem('cardiovascular', [metricStatus('caution')]).score).toBe(81);
  });

  it('ignores metrics without data', () => {
    const system = evaluateSystem('cardiovascular', [
      metricStatus('nominal'),
      metricStatus('critical', false),
    ]);
    expect(system.status).toBe('nominal');
    expect(system.score).toBe(100);
  });
});

describe('computeHealthScore', () => {
  const system = (id: SystemStatus['system'], status: Status, score: number): SystemStatus => ({
    system: id,
    status,
    score,
    metrics: [metricStatus(status)],
  });

  it('weights the systems that have data and normalizes the weights', () => {
    const weights = { ...SYSTEM_WEIGHTS, cardiovascular: 3, nutrition: 1 };
    const health = computeHealthScore(
      'C001',
      [
        system('cardiovascular', 'nominal', 100),
        system('nutrition', 'caution', 60),
        { system: 'vision', status: 'nominal', score: 100, metrics: [] },
      ],
      weights,
      '2026-11-14T10:00:00Z',
    );
    // Weighted mean 90, scaled into the caution band (70-89): 70 + 0.9 * 19.
    expect(health.score).toBe(87);
    expect(health.status).toBe('caution');
  });

  it('never shows a healthy-looking score next to a critical status', () => {
    const health = computeHealthScore(
      'C003',
      [
        system('cardiovascular', 'nominal', 100),
        system('sleep-cognition', 'nominal', 100),
        system('blood-biochemistry', 'critical', 60),
      ],
      SYSTEM_WEIGHTS,
      '2026-11-14T10:00:00Z',
    );
    // Weighted mean about 91, but the status is critical: 0.91 * 69.
    expect(health.status).toBe('critical');
    expect(health.score).toBe(63);
  });
});

describe('scoreInBand', () => {
  it('scales a score into the band of its status', () => {
    expect(scoreInBand(97, 'critical')).toBe(67);
    expect(scoreInBand(97, 'caution')).toBe(88);
    expect(scoreInBand(60, 'caution')).toBe(81);
    expect(scoreInBand(0, 'caution')).toBe(70);
    expect(scoreInBand(100, 'critical')).toBe(69);
    expect(scoreInBand(100, 'nominal')).toBe(100);
  });

  it('keeps the order of two scores with the same status', () => {
    expect(scoreInBand(93, 'critical')).toBeLessThan(scoreInBand(97, 'critical'));
  });
});

describe('findAnomalies', () => {
  const input = (value: number) => ({
    metricId: 'heart-rate',
    name: 'Heart rate',
    unit: 'bpm',
    value,
    status: evaluateValue(value, heartRate),
    threshold: heartRate,
  });

  it('reports only metrics out of the nominal range', () => {
    expect(findAnomalies([input(72)])).toEqual([]);
  });

  it('says whether the value is low or high and shows the nominal range', () => {
    const [high] = findAnomalies([input(130)]);
    expect(high).toMatchObject({ status: 'critical', title: 'High heart rate' });
    expect(high?.message).toBe('Heart rate is 130 bpm (nominal 50 to under 100 bpm).');
    expect(findAnomalies([input(45)])[0]?.title).toBe('Low heart rate');
  });
});

describe('diffAlerts', () => {
  const finding = (metricId: string, status: 'caution' | 'critical') => ({
    metricId,
    status,
    title: `High ${metricId}`,
    message: 'msg',
  });
  const open = (id: string, metricId: string, status: 'caution' | 'critical') => ({
    id,
    ...finding(metricId, status),
  });

  it('creates alerts for new anomalies', () => {
    expect(diffAlerts([finding('a', 'caution')], []).create).toHaveLength(1);
  });

  it('keeps one alert per metric while nothing changes', () => {
    const changes = diffAlerts([finding('a', 'caution')], [open('1', 'a', 'caution')]);
    expect(changes).toEqual({ create: [], update: [], resolve: [] });
  });

  it('updates an alert whose severity changed', () => {
    const changes = diffAlerts([finding('a', 'critical')], [open('1', 'a', 'caution')]);
    expect(changes.update).toEqual([{ id: '1', finding: finding('a', 'critical') }]);
  });

  it('resolves alerts of metrics back to nominal', () => {
    expect(diffAlerts([], [open('1', 'a', 'caution')]).resolve).toEqual(['1']);
  });
});

describe('thresholds data (backend/data/thresholds.ts)', () => {
  it('gives every threshold a source and a nominal range', () => {
    for (const threshold of THRESHOLDS) {
      expect(threshold.source.document.trim().length, threshold.metricId).toBeGreaterThan(0);
      expect(
        threshold.ranges.some((r) => r.status === 'nominal'),
        threshold.metricId,
      ).toBe(true);
    }
  });

  it('classifies the healthy simulation baseline as nominal', () => {
    for (const threshold of THRESHOLDS) {
      const params = SIMULATION[threshold.metricId];
      if (!params || threshold.metricId === 'cumulative-radiation-dose') continue;
      expect(evaluateValue(params.base, threshold), threshold.metricId).toBe('nominal');
    }
  });
});
