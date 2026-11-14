<script setup lang="ts">
import type { Trend } from '@chief/shared';
import { computed, ref } from 'vue';
import BodyMap from '../components/BodyMap.vue';
import Icon from '../components/Icon.vue';
import MetricCard from '../components/MetricCard.vue';
import StatusChip from '../components/StatusChip.vue';
import { useBody } from '../composables/useBody';
import { fmt, mdTime } from '../lib/format';
import { type Region, regionOf, SECTIONS, type SectionId, SYSTEM_IDS } from '../lib/sections';
import { SCORE_CAPTION, STATUS_COLOR, worst, type UiStatus } from '../lib/status';
import { useMissionStore } from '../stores/mission';
import { useWorkspaceStore } from '../stores/workspace';

/** Screen B: one crew member's body map, health score, system status and current vitals. */
const mission = useMissionStore();
const ws = useWorkspaceStore();
const body = useBody();
const highlight = ref<Region | null>(null);

const TREND_LABEL: Record<Trend, string> = {
  rising: 'Rising',
  falling: 'Falling',
  stable: 'Stable',
};
const id = computed(() => mission.selected);
const member = computed(() => mission.member);
const health = computed(() => mission.health[id.value]);
const status = computed<UiStatus>(() => health.value?.status ?? 'nodata');

const systems = computed(() =>
  SYSTEM_IDS.map((s) => {
    const sys = mission.system(id.value, s);
    return { ...sys, def: SECTIONS[s], region: regionOf(s) };
  }),
);

/** Score samples received since the app opened (the backend keeps no score history). */
const history = computed(() => mission.scoreHistory[id.value] ?? []);
const spark = computed(() => {
  const pts = history.value;
  if (pts.length < 2) return '';
  const Y = (v: number) => (1 - (v - 40) / 60) * 56;
  return pts
    .map(
      (p, i) =>
        `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * 1000).toFixed(1)} ${Y(p.score).toFixed(1)}`,
    )
    .join('');
});
const sparkFrom = computed(() =>
  history.value[0] ? mdTime(history.value[0].t, mission.start) : '',
);
const delta = computed(() => {
  const pts = history.value;
  if (pts.length < 2) return 'Collecting trend since this session started';
  const d = (pts[pts.length - 1]?.score ?? 0) - (pts[0]?.score ?? 0);
  return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)} pts this session`;
});

function vital(label: string, metricId: string, sec: SectionId, unit?: string) {
  const m = mission.metricStatus(id.value, metricId);
  return {
    label,
    value: m ? fmt(m.metric, m.latest?.value) : '—',
    unit: unit ?? m?.metric.unit ?? '',
    status: m?.ui ?? ('nodata' as UiStatus),
    trend: m?.trend ?? null,
    note: m ? TREND_LABEL[m.trend] : '',
    source: m?.latest ? (m.latest.simulated ? 'Simulated' : 'Measured') : undefined,
    sec,
  };
}

const vitals = computed(() => {
  const sys = mission.metricStatus(id.value, 'systolic-blood-pressure');
  const dia = mission.metricStatus(id.value, 'diastolic-blood-pressure');
  return [
    vital('Resting HR', 'resting-heart-rate', 'cardiovascular'),
    vital('SpO2', 'blood-oxygen-saturation', 'cardiovascular'),
    {
      label: 'Blood pressure',
      value: `${sys ? fmt(sys.metric, sys.latest?.value) : '—'}/${dia ? fmt(dia.metric, dia.latest?.value) : '—'}`,
      unit: 'mmHg',
      status: worst([sys?.ui ?? 'nodata', dia?.ui ?? 'nodata']),
      trend: sys?.trend ?? null,
      note: sys ? TREND_LABEL[sys.trend] : '',
      source: sys?.latest?.simulated === false ? 'Measured' : 'Simulated',
      sec: 'cardiovascular' as SectionId,
    },
    vital('Sleep', 'sleep-duration', 'sleep-cognition'),
    vital('Sleep efficiency', 'sleep-efficiency', 'sleep-cognition'),
    vital('Reaction time', 'reaction-time-mean', 'sleep-cognition'),
    vital('Career dose', 'cumulative-radiation-dose', 'radiation', '/ 600 mSv'),
    vital('Vitamin D', 'vitamin-d-25-oh', 'blood-biochemistry'),
  ];
});
</script>

<template>
  <div v-if="member" class="overview">
    <div class="card map-card">
      <div class="row">
        <span class="label">Body map</span
        ><span class="faint small">Hover a region · click to open</span>
      </div>
      <div class="map">
        <BodyMap
          :sex="member.sex"
          :st="body.statuses(id)"
          :info="body.info(id)"
          :highlight="highlight"
          class="fill"
          @pick="(r) => body.pick(id, r)"
        />
      </div>
      <div class="legend">
        <span><i class="sw" style="--c: var(--organ); --a: 100%" />Nominal</span>
        <span><i class="sw" style="--c: var(--caution); --a: 90%" />Caution</span>
        <span><i class="sw" style="--c: var(--critical); --a: 90%" />Critical (pulses)</span>
        <span><i class="sw dashed" style="--c: var(--nodata); --a: 25%" />No data</span>
        <span class="note"
          >Only systems that need attention take a colour. The body outline and the badge show the
          radiation dose.</span
        >
      </div>
    </div>

    <div class="right">
      <div class="top">
        <div class="card score">
          <div class="bar" :style="{ background: STATUS_COLOR[status] }" />
          <span class="label">Health score</span>
          <div class="inline-b">
            <span class="mono big">{{ health?.score ?? '—' }}</span><span class="mono faint"
              >/100</span
            >
          </div>
          <StatusChip :status="status" class="self-start" />
          <div class="spark">
            <div
              class="ref"
              :style="{
                top: `${(1 - (90 - 40) / 60) * 100}%`,
                borderColor: 'color-mix(in srgb, var(--nominal) 60%, transparent)',
              }"
            />
            <div
              class="ref"
              :style="{
                top: `${(1 - (70 - 40) / 60) * 100}%`,
                borderColor: 'color-mix(in srgb, var(--caution) 60%, transparent)',
              }"
            />
            <svg v-if="spark" viewBox="0 0 1000 56" preserveAspectRatio="none">
              <path :d="spark" />
            </svg>
          </div>
          <div class="spark-axis mono faint">
            <span>{{ sparkFrom }}</span><span>now</span>
          </div>
          <span class="mono muted small">{{ delta }}</span>
          <span class="faint caption">{{
            health ? SCORE_CAPTION[health.status] : 'Waiting for the rules engine.'
          }}</span>
        </div>

        <div class="card systems">
          <div class="row pad">
            <span class="label">System status</span
            ><span class="faint small">9 systems · rules engine</span>
          </div>
          <div
            v-for="s in systems"
            :key="s.system"
            class="sys"
            :class="{ hl: highlight === s.region }"
            @click="ws.open(s.system)"
            @mouseenter="highlight = s.region"
            @mouseleave="highlight = null"
          >
            <span class="sys-name"
              ><Icon :name="s.def.icon" :size="15" class="muted" /><span class="ellipsis">{{
                s.def.name
              }}</span></span
            >
            <span class="score-bar">
              <span class="track"
                ><span
                  :style="{
                    width: `${s.score ?? 0}%`,
                    background:
                      s.status === 'caution' || s.status === 'critical'
                        ? STATUS_COLOR[s.status]
                        : 'var(--text-3)',
                  }"
              /></span>
              <span class="mono small num">{{ s.score ?? '—' }}</span>
            </span>
            <StatusChip :status="s.status" plain />
            <span class="mono muted small ellipsis">{{ s.driver }}</span>
          </div>
        </div>
      </div>

      <div>
        <div class="row vit-head">
          <span class="label">Current vitals</span
          ><span class="faint small">Live from the onboard sensors</span>
        </div>
        <div class="vitals">
          <MetricCard
            v-for="v in vitals"
            :key="v.label"
            :label="v.label"
            :value="v.value"
            :unit="v.unit"
            :status="v.status"
            :trend="v.trend"
            :note="v.note"
            :source="v.source"
            big
            clickable
            @open="ws.open(v.sec)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 4px 20px 20px;
  align-items: stretch;
  min-height: 100%;
}
.map-card {
  flex: 1 1 360px;
  max-width: 440px;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.pad {
  padding: 10px 12px;
}
.small {
  font-size: 12px;
}
.map {
  position: relative;
  flex: 1;
  min-height: 420px;
  margin: 8px 0;
}
.fill {
  position: absolute;
  inset: 0;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-2);
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sw {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--c) var(--a), transparent);
  border: 1px solid var(--c);
}
.sw.dashed {
  border-style: dashed;
}
.note {
  flex-basis: 100%;
  font-size: 11px;
  color: var(--text-3);
}
.right {
  flex: 999 1 460px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.top {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.score {
  flex: 1 1 220px;
  max-width: 280px;
  padding: 14px 16px 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.inline-b {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.big {
  font-size: 56px;
  font-weight: 500;
  line-height: 1;
}
.self-start {
  align-self: flex-start;
}
.spark {
  position: relative;
  height: 56px;
  margin-top: 6px;
}
.ref {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed;
}
.spark svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.spark path {
  fill: none;
  stroke: var(--text-1);
  stroke-width: 1.5;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
.spark-axis {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
}
.caption {
  font-size: 11px;
  line-height: 1.4;
}
.systems {
  flex: 1 1 380px;
  min-width: 0;
}
.sys {
  display: grid;
  grid-template-columns: minmax(150px, 1.3fr) minmax(80px, 1fr) 96px minmax(0, 1.6fr);
  align-items: center;
  gap: 12px;
  height: 33px;
  padding: 0 12px;
  border-top: 1px solid var(--border);
  cursor: pointer;
}
.sys:hover,
.sys.hl {
  background: var(--panel-2);
}
.sys-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.score-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.track {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--border-2);
  overflow: hidden;
  display: block;
}
.track span {
  display: block;
  height: 100%;
}
.num {
  width: 22px;
  text-align: right;
}
.vit-head {
  margin-bottom: 8px;
}
.vitals {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(186px, 1fr));
  gap: 8px;
}
</style>
