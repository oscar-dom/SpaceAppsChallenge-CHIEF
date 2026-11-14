import type {
  ActionCategory,
  AlertSeverity,
  EscalationLevel,
  Range,
  Status,
  Threshold,
} from '@chief/shared';
import type { IconName } from './icons';

/** Status shown in the UI: the contract's three plus "no data" and "charted only". */
export type UiStatus = Status | 'nodata' | 'none';

export const STATUS_LABEL: Record<UiStatus | 'info', string> = {
  nominal: 'Nominal',
  caution: 'Caution',
  critical: 'Critical',
  nodata: 'No data',
  none: 'Charted only',
  info: 'Info',
};

export const STATUS_COLOR: Record<UiStatus | 'info', string> = {
  nominal: 'var(--nominal)',
  caution: 'var(--caution)',
  critical: 'var(--critical)',
  nodata: 'var(--nodata)',
  none: 'var(--border-2)',
  info: 'var(--info)',
};

/** Text colour of a status label: neutral statuses use secondary text. */
export function statusText(s: UiStatus | 'info'): string {
  return s === 'nodata' || s === 'none' || s === 'info' ? 'var(--text-2)' : STATUS_COLOR[s];
}

export function statusTint(s: UiStatus | 'info'): string {
  return `color-mix(in srgb, ${STATUS_COLOR[s]} 15%, transparent)`;
}

const RANK: Record<UiStatus, number> = { none: -1, nodata: 0, nominal: 1, caution: 2, critical: 3 };

/** The most severe status of a list ("no data" when the list is empty). */
export function worst(list: UiStatus[]): UiStatus {
  return list.reduce<UiStatus>((a, b) => (RANK[b] > RANK[a] ? b : a), 'nodata');
}

export const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, caution: 1, info: 2 };

function inRange(v: number, r: Range): boolean {
  return (r.min === undefined || v >= r.min) && (r.max === undefined || v < r.max);
}

/** Same rule as the rules engine: inclusive min, exclusive max, outside every range is critical. */
export function classify(value: number | null | undefined, threshold?: Threshold): UiStatus {
  if (!threshold) return 'none';
  if (value === null || value === undefined) return 'nodata';
  return threshold.ranges.find((r) => inRange(value, r.range))?.status ?? 'critical';
}

/** Caution and critical cut-offs on each side of the nominal range, for chart lines. */
export interface Cutoffs {
  lo?: { caution: number; critical?: number };
  hi?: { caution: number; critical?: number };
  nominal: Range;
}

export function cutoffs(t: Threshold): Cutoffs | null {
  const nominal = t.ranges.find((r) => r.status === 'nominal')?.range;
  if (!nominal) return null;
  const caution = t.ranges.filter((r) => r.status === 'caution').map((r) => r.range);
  const out: Cutoffs = { nominal };
  if (nominal.min !== undefined) {
    const below = caution.find((r) => r.max === nominal.min);
    out.lo = { caution: nominal.min, critical: below ? below.min : nominal.min };
  }
  if (nominal.max !== undefined) {
    const above = caution.find((r) => r.min === nominal.max);
    out.hi = { caution: nominal.max, critical: above ? above.max : nominal.max };
  }
  return out;
}

export interface EscalationStyle {
  label: string;
  icon: IconName;
  variant: 'outline' | 'filled' | 'inverse';
}

/** Escalation rises in emphasis, not hue: outline, filled, inverse. */
export const ESCALATION: Record<EscalationLevel, EscalationStyle> = {
  'self-care': { label: 'Self-care', icon: 'user', variant: 'outline' },
  'crew-medical-officer': { label: 'Crew Medical Officer', icon: 'steth', variant: 'filled' },
  'flight-surgeon': { label: 'Contact flight surgeon', icon: 'phone', variant: 'inverse' },
};

export const ACTION_CATEGORY: Record<ActionCategory, { label: string; icon: IconName }> = {
  task: { label: 'Task', icon: 'task' },
  avoid: { label: 'Avoid', icon: 'ban' },
  nutrition: { label: 'Nutrition', icon: 'food' },
  exercise: { label: 'Exercise', icon: 'gym' },
  sleep: { label: 'Sleep', icon: 'sleep-cognition' },
  medication: { label: 'Medication · onboard kit', icon: 'pill' },
  'follow-up': { label: 'Follow-up measurement', icon: 'calendar' },
};

/** Health score bands used by the rules engine (backend/src/config/constants.ts). */
export const SCORE_CAPTION: Record<Status, string> = {
  nominal: 'All systems within thresholds.',
  caution: 'Any Caution system keeps the score between 70 and 89.',
  critical: 'Any Critical system caps the score at 69.',
};
