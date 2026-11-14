import type { Metric, MissionClock } from '@chief/shared';

export const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Mission start (00:00 UTC of mission day 1), derived from the clock. */
export function missionStart(clock: MissionClock): number {
  const now = new Date(clock.missionTime);
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return midnight - (clock.missionDay - 1) * DAY_MS;
}

/** 1-based mission day of an instant. */
export function missionDayOf(iso: string, start: number): number {
  return Math.floor((Date.parse(iso) - start) / DAY_MS) + 1;
}

export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "MD 60 · 10:24" in mission time. */
export function mdTime(iso: string, start: number): string {
  return `MD ${missionDayOf(iso, start)} · ${hhmm(iso)}`;
}

/** "2026-10-30  10:24:37" for the mission clock. */
export function clockText(iso: string): string {
  const d = new Date(iso);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}  ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/** Decimals worth showing for a metric's values. */
function decimals(metric: Metric, value: number): number {
  if (Number.isInteger(value)) return 0;
  if (metric.unit === '%' && Math.abs(value) >= 20) return 0;
  return Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
}

/** Number with a real minus sign and tabular-friendly decimals. */
export function fmt(metric: Metric, value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const text = Math.abs(value).toFixed(decimals(metric, value));
  return value < 0 ? `−${text}` : text;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

/** "Commander · ESA" */
export function roleLine(member: { role: string; agency: string }): string {
  return `${member.role} · ${member.agency}`;
}
