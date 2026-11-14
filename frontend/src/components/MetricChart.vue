<script setup lang="ts">
import type { Measurement, Metric, Period, Threshold } from '@chief/shared';
import { computed, ref, watch } from 'vue';
import { api } from '../api/client';
import { DAY_MS, fmt, hhmm, mdTime, missionDayOf } from '../lib/format';
import {
  classify,
  cutoffs,
  STATUS_COLOR,
  STATUS_LABEL,
  statusText,
  type UiStatus,
} from '../lib/status';
import StatusChip from './StatusChip.vue';

/** Time series of one metric with its threshold bands, cut-off lines and a hover crosshair. */
const props = defineProps<{
  crewId: string;
  metric: Metric;
  threshold?: Threshold;
  period: Period;
  status: UiStatus;
  /** Simulated "now" and the mission start, in ms. */
  now: number;
  start: number;
  /** Changes when the backend re-evaluates the crew member: the series is re-read. */
  refreshKey: string;
}>();

const H = 132;
const PERIOD_MS: Record<Exclude<Period, 'mission'>, number> = {
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
};

const points = ref<Measurement[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const hover = ref<number | null>(null);
let lastLoad = 0;

async function load() {
  lastLoad = Date.now();
  try {
    points.value = await api.measurements(props.crewId, props.metric.id, props.period);
    error.value = null;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

watch(() => [props.crewId, props.metric.id, props.period], load, { immediate: true });
// Live data: re-read at most every 5 s while the backend keeps evaluating.
watch(
  () => props.refreshKey,
  () => {
    if (Date.now() - lastLoad > 5000) void load();
  },
);

const t1 = computed(() => props.now);
const t0 = computed(() =>
  props.period === 'mission' ? props.start : props.now - PERIOD_MS[props.period],
);
const X = (t: number) => (t - t0.value) / (t1.value - t0.value || 1);
const pct = (v: number) => `${(Math.max(-0.05, Math.min(1.05, v)) * 100).toFixed(3)}%`;

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

const series = computed(() =>
  points.value.map((m) => ({ t: Date.parse(m.takenAt), v: m.value, iso: m.takenAt })),
);
const cut = computed(() => (props.threshold ? cutoffs(props.threshold) : null));

const scale = computed(() => {
  const vals = series.value.map((p) => p.v);
  let lo = vals.length ? Math.min(...vals) : 0;
  let hi = vals.length ? Math.max(...vals) : 1;
  const c = cut.value;
  if (c?.lo) lo = Math.min(lo, c.lo.caution);
  if (c?.hi) hi = Math.max(hi, c.hi.caution);
  let span = hi - lo || Math.max(Math.abs(hi) * 0.2, 1);
  const showCritical = props.status === 'caution' || props.status === 'critical';
  if (c?.lo?.critical !== undefined && (showCritical || c.lo.critical >= lo - span * 0.35))
    lo = Math.min(lo, c.lo.critical);
  if (c?.hi?.critical !== undefined && (showCritical || c.hi.critical <= hi + span * 0.35))
    hi = Math.max(hi, c.hi.critical);
  span = hi - lo || 1;
  return { lo: lo - span * 0.14, hi: hi + span * 0.14 };
});
const Y = (v: number) => 1 - (v - scale.value.lo) / (scale.value.hi - scale.value.lo);

const path = computed(() =>
  series.value
    .map((p, i) => `${i ? 'L' : 'M'}${(X(p.t) * 1000).toFixed(1)} ${(Y(p.v) * H).toFixed(1)}`)
    .join(''),
);

const band = computed(() => {
  const c = cut.value;
  if (!c) return null;
  const top = Math.max(0, Math.min(1, Y(c.nominal.max ?? scale.value.hi)));
  const bottom = Math.max(0, Math.min(1, Y(c.nominal.min ?? scale.value.lo)));
  return { top: pct(top), height: pct(bottom - top) };
});

const lines = computed(() => {
  const c = cut.value;
  if (!c) return [];
  const { lo, hi } = scale.value;
  const out: { top: string; label: string; color: string; above: boolean }[] = [];
  const add = (v: number | undefined, label: string, color: string, above: boolean) => {
    if (v === undefined || v <= lo || v >= hi) return;
    if (out.some((l) => l.top === pct(Y(v)))) return;
    out.push({ top: pct(Y(v)), label: `${label} ${fmt(props.metric, v)}`, color, above });
  };
  add(c.lo?.caution, 'CAUTION <', 'var(--caution)', false);
  if (c.lo?.critical !== c.lo?.caution) add(c.lo?.critical, 'CRITICAL <', 'var(--critical)', false);
  add(c.hi?.caution, 'CAUTION ≥', 'var(--caution)', true);
  if (c.hi?.critical !== c.hi?.caution) add(c.hi?.critical, 'CRITICAL ≥', 'var(--critical)', true);
  return out;
});

const yTicks = computed(() => {
  const { lo, hi } = scale.value;
  const step = niceStep((hi - lo) / 4);
  const dec = step < 1 ? Math.min(2, Math.ceil(-Math.log10(step))) : 0;
  const out: { top: string; label: string }[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step)
    out.push({ top: pct(Y(v)), label: `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(dec)}` });
  return out;
});

const xTicks = computed(() => {
  const out: { left: string; label: string }[] = [];
  if (props.period === 'day') {
    const first = Math.ceil(t0.value / (6 * 3600_000)) * 6 * 3600_000;
    for (let t = first; t <= t1.value; t += 6 * 3600_000)
      out.push({ left: pct(X(t)), label: hhmm(new Date(t).toISOString()) });
    return out;
  }
  const stepDays = props.period === 'week' ? 1 : props.period === 'month' ? 5 : 15;
  const firstDay = Math.ceil((t0.value - props.start) / DAY_MS);
  for (let d = firstDay; props.start + d * DAY_MS <= t1.value; d++) {
    if ((d + 1) % stepDays !== 0 && stepDays > 1) continue;
    out.push({ left: pct(X(props.start + d * DAY_MS)), label: `MD ${d + 1}` });
  }
  return out;
});

const sparse = computed(() => series.value.length <= 16);
const dots = computed(() =>
  series.value
    .map((p) => ({ p, s: classify(p.v, props.threshold) }))
    .filter((o) => sparse.value || o.s === 'caution' || o.s === 'critical')
    .map((o) => ({
      left: pct(X(o.p.t)),
      top: pct(Y(o.p.v)),
      color: o.s === 'nominal' || o.s === 'none' ? 'var(--text-1)' : STATUS_COLOR[o.s],
      size: sparse.value ? '7px' : '5px',
    })),
);

const hv = computed(() => {
  if (hover.value === null) return null;
  const p = series.value[hover.value];
  if (!p) return null;
  const s = classify(p.v, props.threshold);
  const x = X(p.t);
  return {
    left: pct(x),
    top: pct(Y(p.v)),
    value: `${fmt(props.metric, p.v)} ${props.metric.unit}`,
    when: mdTime(p.iso, props.start),
    status: props.threshold ? STATUS_LABEL[s] : '',
    color: s === 'nominal' || s === 'none' ? 'var(--text-2)' : statusText(s),
    transform:
      x < 0.15
        ? 'translate(0,-100%)'
        : x > 0.85
          ? 'translate(-100%,-100%)'
          : 'translate(-50%,-100%)',
  };
});

function move(e: MouseEvent) {
  if (!series.value.length) return;
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const t = t0.value + ((e.clientX - r.left) / r.width) * (t1.value - t0.value);
  let best = 0;
  let bestD = Infinity;
  series.value.forEach((p, i) => {
    const d = Math.abs(p.t - t);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  hover.value = best;
}

const latest = computed(() => series.value[series.value.length - 1]);
const valueText = computed(() =>
  latest.value
    ? `${fmt(props.metric, latest.value.v)} ${props.metric.unit}`
    : loading.value
      ? 'Loading…'
      : 'No reading in this period',
);
const rangeText = computed(() => {
  const c = cut.value;
  const n = series.value.length;
  const samples = n === 1 ? '1 sample in period' : `${n} samples`;
  if (!c) return samples;
  const { min, max } = c.nominal;
  const range =
    min !== undefined && max !== undefined
      ? `${fmt(props.metric, min)}–${fmt(props.metric, max)}`
      : min !== undefined
        ? `≥ ${fmt(props.metric, min)}`
        : `< ${fmt(props.metric, max)}`;
  return `Nominal ${range} ${props.metric.unit} · ${samples}`;
});
const sourceText = computed(() => {
  const s = props.threshold?.source;
  if (!s) return 'No clinical threshold, charted only';
  return `Source: ${s.document}${s.section ? `, ${s.section}` : ''}`;
});
const dayLabel = computed(() =>
  latest.value ? `MD ${missionDayOf(latest.value.iso, props.start)}` : '',
);
</script>

<template>
  <div class="card chart">
    <div class="head">
      <span class="title">{{ metric.name }}</span>
      <span class="mono value">{{ valueText }}</span>
      <StatusChip :status="status" />
      <span class="spacer" />
      <span class="mono faint small">{{ rangeText }}</span>
    </div>
    <div class="plot" @mousemove="move" @mouseleave="hover = null">
      <template v-for="(y, i) in yTicks" :key="'y' + i">
        <div class="grid" :style="{ top: y.top }" />
        <div class="ytick mono" :style="{ top: y.top }">{{ y.label }}</div>
      </template>
      <div v-if="band" class="band" :style="{ top: band.top, height: band.height }" />
      <template v-for="(l, i) in lines" :key="'l' + i">
        <div class="cutline" :style="{ top: l.top, borderColor: l.color }" />
        <div
          class="cutlabel mono"
          :style="{
            top: l.top,
            color: l.color,
            transform: l.above ? 'translateY(calc(-100% - 2px))' : 'translateY(2px)',
          }"
        >
          {{ l.label }}
        </div>
      </template>
      <svg viewBox="0 0 1000 132" preserveAspectRatio="none">
        <path
          :d="path"
          :style="{ stroke: threshold ? 'var(--text-1)' : 'var(--text-3)' }"
          class="line"
        />
      </svg>
      <div
        v-for="(d, i) in dots"
        :key="'d' + i"
        class="pt"
        :style="{ left: d.left, top: d.top, width: d.size, height: d.size, background: d.color }"
      />
      <template v-if="hv">
        <div class="cross" :style="{ left: hv.left }" />
        <div class="hvdot" :style="{ left: hv.left, top: hv.top }" />
        <div class="hvtip mono" :style="{ left: hv.left, transform: hv.transform }">
          <b>{{ hv.value }}</b><span class="faint">{{ hv.when }}</span
          ><span :style="{ color: hv.color }">{{ hv.status }}</span>
        </div>
      </template>
      <div v-for="(x, i) in xTicks" :key="'x' + i" class="xtick mono" :style="{ left: x.left }">
        {{ x.label }}
      </div>
      <div v-if="!loading && !series.length" class="empty">
        {{ error ?? 'No readings in this period' }}
      </div>
    </div>
    <div class="foot">
      <span v-if="metric.spaceflightEffect" class="muted">
        <span class="label effect">Spaceflight effect</span>{{ metric.spaceflightEffect }}
      </span>
      <span class="faint"
        >{{ sourceText }}<template v-if="dayLabel"> · last reading {{ dayLabel }}</template></span
      >
    </div>
  </div>
</template>

<style scoped>
.chart {
  padding: 12px 16px 10px;
  overflow: visible;
}
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  row-gap: 4px;
}
.title {
  font-size: 13px;
  font-weight: 600;
}
.value {
  font-size: 13px;
  font-weight: 500;
}
.spacer {
  flex: 1;
}
.small {
  font-size: 11px;
}
.plot {
  position: relative;
  height: 132px;
  margin: 20px 6px 26px 44px;
  cursor: crosshair;
}
.grid {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px solid var(--border);
}
.ytick {
  position: absolute;
  left: -46px;
  width: 38px;
  transform: translateY(-50%);
  text-align: right;
  font-size: 10px;
  color: var(--text-3);
}
.band {
  position: absolute;
  left: 0;
  right: 0;
  background: color-mix(in srgb, var(--nominal) 9%, transparent);
}
.cutline {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed;
}
.cutlabel {
  position: absolute;
  left: 4px;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
}
svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.line {
  fill: none;
  stroke-width: 1.5;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}
.pt {
  position: absolute;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 2px var(--panel);
}
.cross {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px solid var(--text-2);
  pointer-events: none;
}
.hvdot {
  position: absolute;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--panel);
  border: 2px solid var(--text-1);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.hvtip {
  position: absolute;
  top: -8px;
  display: flex;
  gap: 8px;
  align-items: center;
  background: var(--panel-2);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 11px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 3;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
.xtick {
  position: absolute;
  bottom: -20px;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--text-3);
  white-space: nowrap;
}
.empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  font-size: 12px;
}
.foot {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}
.effect {
  font-size: 10px;
  margin-right: 8px;
}
</style>
