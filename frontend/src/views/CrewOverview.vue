<script setup lang="ts">
import type { Trend } from '@chief/shared';
import { computed } from 'vue';
import BodyMap from '../components/BodyMap.vue';
import Icon from '../components/Icon.vue';
import StatusChip from '../components/StatusChip.vue';
import { useBody } from '../composables/useBody';
import { fmt, hhmm, initials, missionDayOf, roleLine } from '../lib/format';
import type { SectionId } from '../lib/sections';
import { STATUS_COLOR, worst, type UiStatus } from '../lib/status';
import { useMissionStore } from '../stores/mission';
import { useUiStore } from '../stores/ui';
import { useWorkspaceStore } from '../stores/workspace';

/** Screen A, the home screen: every crew member's body, score and key vitals. */
const mission = useMissionStore();
const ws = useWorkspaceStore();
const ui = useUiStore();
const body = useBody();

const TREND_ICON: Record<Trend, 'up' | 'down' | 'flat'> = {
  rising: 'up',
  falling: 'down',
  stable: 'flat',
};

function go(crewId: string, sec: SectionId) {
  mission.selected = crewId;
  ws.open(sec);
}

const columns = computed(() =>
  mission.crew.map((c) => {
    const h = mission.health[c.id];
    const vital = (label: string, id: string, sec: SectionId, unit?: string) => {
      const m = mission.metricStatus(c.id, id);
      return {
        label,
        value: m ? fmt(m.metric, m.latest?.value) : '—',
        unit: unit ?? m?.metric.unit ?? '',
        color: STATUS_COLOR[m?.ui ?? 'nodata'],
        trend: TREND_ICON[m?.trend ?? 'stable'],
        open: () => go(c.id, sec),
      };
    };
    const sys = mission.metricStatus(c.id, 'systolic-blood-pressure');
    const dia = mission.metricStatus(c.id, 'diastolic-blood-pressure');
    const bpStatus: UiStatus = worst([sys?.ui ?? 'nodata', dia?.ui ?? 'nodata']);
    const open = (mission.alerts[c.id] ?? []).filter(
      (a) => a.kind === 'anomaly' && !a.acknowledged,
    );
    const alertStatus: UiStatus = open.some((a) => a.severity === 'critical')
      ? 'critical'
      : open.some((a) => a.severity === 'caution')
        ? 'caution'
        : 'nominal';
    return {
      id: c.id,
      sex: c.sex,
      name: c.name,
      ini: initials(c.name),
      role: roleLine(c),
      score: h ? String(h.score) : '—',
      status: (h?.status ?? 'nodata') as UiStatus,
      st: body.statuses(c.id),
      info: body.info(c.id),
      vitals: [
        vital('Resting HR', 'resting-heart-rate', 'cardiovascular'),
        vital('SpO2', 'blood-oxygen-saturation', 'cardiovascular'),
        {
          label: 'Blood pressure',
          value: `${sys ? fmt(sys.metric, sys.latest?.value) : '—'}/${dia ? fmt(dia.metric, dia.latest?.value) : '—'}`,
          unit: 'mmHg',
          color: STATUS_COLOR[bpStatus],
          trend: TREND_ICON[sys?.trend ?? 'stable'],
          open: () => go(c.id, 'cardiovascular'),
        },
        vital('Sleep last night', 'sleep-duration', 'sleep-cognition'),
        vital('Radiation dose', 'cumulative-radiation-dose', 'radiation', '/ 600 mSv'),
        {
          label: 'Active alerts',
          value: String(open.length),
          unit: open.length === 1 ? 'alert' : 'alerts',
          color: STATUS_COLOR[alertStatus],
          trend: 'flat' as const,
          open: () => {
            mission.selected = c.id;
            ui.showAlerts('member');
          },
        },
      ],
    };
  }),
);

const day = computed(() => mission.clock?.missionDay ?? 0);
const length = computed(() => mission.clock?.missionLengthDays ?? 180);
const active = computed(() => mission.anomalies.filter((a) => !a.acknowledged));
const sevRows = computed(() =>
  (['critical', 'caution', 'info'] as const).map((k) => ({
    k,
    label: k[0]?.toUpperCase() + k.slice(1),
    color: STATUS_COLOR[k],
    n: active.value.filter((a) => a.severity === k).length,
  })),
);
const doses = computed(() =>
  mission.crew
    .map((c) => ({ c, m: mission.metricStatus(c.id, 'cumulative-radiation-dose') }))
    .filter((x) => x.m?.latest)
    .sort((a, b) => (b.m?.latest?.value ?? 0) - (a.m?.latest?.value ?? 0)),
);
const upcoming = computed(() => mission.tasks.filter((t) => !t.acknowledged).slice(0, 3));
</script>

<template>
  <div class="crew">
    <div class="cols">
      <div v-for="c in columns" :key="c.id" class="col">
        <div class="who" @click="go(c.id, 'overview')">
          <div class="avatar" :style="{ '--ring': STATUS_COLOR[c.status] }">{{ c.ini }}</div>
          <div class="names">
            <span class="name">{{ c.name }}</span>
            <span class="muted ellipsis small">{{ c.role }}</span>
          </div>
        </div>
        <div class="map">
          <BodyMap
            :sex="c.sex"
            :st="c.st"
            :info="c.info"
            class="fill"
            @pick="(r) => body.pick(c.id, r)"
          />
        </div>
        <div class="score">
          <div class="inline-b">
            <span class="mono big">{{ c.score }}</span><span class="mono faint">/100</span>
          </div>
          <div class="score-side">
            <span class="label tiny">Health score</span>
            <StatusChip :status="c.status" />
          </div>
        </div>
        <div class="vitals">
          <div v-for="v in c.vitals" :key="v.label" class="vital" @click="v.open">
            <span class="muted ellipsis small">{{ v.label }}</span>
            <span class="vval mono">
              <span class="dot" :style="{ background: v.color }" />
              <span :key="v.value" class="num">{{ v.value }}</span>
              <span class="faint unit">{{ v.unit }}</span>
            </span>
            <Icon :name="v.trend" :size="14" class="faint" />
          </div>
        </div>
      </div>
    </div>

    <div class="strip">
      <div class="cell">
        <span class="label tiny">Mission day</span>
        <span class="mono mid"
          >{{ String(day).padStart(3, '0') }} <span class="faint">/ {{ length }}</span></span
        >
        <span class="progress"><span :style="{ width: `${(day / length) * 100}%` }" /></span>
        <span class="muted small">{{ Math.max(0, length - day) }} days to return</span>
      </div>
      <div class="cell">
        <span class="label tiny">Active alerts</span>
        <div v-for="s in sevRows" :key="s.k" class="row link" @click="ui.showAlerts('all')">
          <span class="dot" :style="{ background: s.color }" />
          <span class="grow muted small">{{ s.label }}</span>
          <span class="mono">{{ s.n }}</span>
        </div>
      </div>
      <div class="cell">
        <span class="label tiny">Career radiation dose</span>
        <div
          v-for="d in doses.slice(0, 3)"
          :key="d.c.id"
          class="row link"
          @click="go(d.c.id, 'radiation')"
        >
          <span class="dot" :style="{ background: STATUS_COLOR[d.m?.ui ?? 'nodata'] }" />
          <span class="grow small">{{ d.c.name }}</span>
          <span class="mono small"
            >{{ fmt(d.m!.metric, d.m!.latest!.value) }} <span class="faint">/ 600 mSv</span></span
          >
        </div>
        <span class="faint small">NASA-STD-3001 career limit 600 mSv</span>
      </div>
      <div class="cell">
        <span class="label tiny">Upcoming measurements</span>
        <div v-for="t in upcoming" :key="t.id" class="task link" @click="ui.showTasks()">
          <span class="mono">{{ t.dueAt ? hhmm(t.dueAt) : '—' }}</span>
          <span class="ellipsis small">{{ t.title }}</span>
          <span class="faint small">{{ initials(mission.memberName(t.crewMemberId)) }}</span>
        </div>
        <span v-if="!upcoming.length" class="faint small">Nothing due in the next hours</span>
        <span v-else-if="upcoming[0]?.dueAt" class="faint small"
          >Next on MD {{ missionDayOf(upcoming[0].dueAt, mission.start) }}</span
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.crew {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.cols {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 14px;
  padding: 4px 20px 14px;
}
/* One card per person: the crew are the subject of the screen, not a grid of cells. */
.col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 16px 16px 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.who {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  min-width: 0;
}
.who:hover .name {
  color: var(--accent);
}
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--chrome);
  color: var(--chrome-text);
  box-shadow:
    0 0 0 2px var(--panel),
    0 0 0 4px var(--ring);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  flex: none;
}
.names {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  min-width: 0;
}
.name {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}
.small {
  font-size: 12px;
}
.tiny {
  font-size: 10px;
}
.map {
  position: relative;
  flex: 1;
  min-height: 200px;
  margin: 10px 0 6px;
}
.fill {
  position: absolute;
  inset: 0;
}
.score {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 10px;
}
.inline-b {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.big {
  font-size: 40px;
  font-weight: 500;
  line-height: 1;
}
.score-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.vitals {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
}
.vital {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 14px;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 4px;
  border-radius: 4px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.vital:hover {
  background: var(--panel-2);
}
.vval {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.num {
  font-size: 13px;
  font-weight: 500;
  animation: chFade 0.6s ease;
}
.unit {
  font-size: 11px;
}
.strip {
  flex: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
  padding: 0 20px 20px;
}
.cell {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.mid {
  font-size: 20px;
  font-weight: 500;
}
.progress {
  display: block;
  height: 4px;
  border-radius: 2px;
  background: var(--border-2);
  overflow: hidden;
}
.progress span {
  display: block;
  height: 100%;
  background: var(--accent);
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.grow {
  flex: 1;
  min-width: 0;
}
.link {
  cursor: pointer;
}
.link:hover {
  color: var(--text-1);
}
.task {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
</style>
