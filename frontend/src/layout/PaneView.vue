<script setup lang="ts">
import { type BodySystemId, PERIODS, type Period } from '@chief/shared';
import { computed, ref } from 'vue';
import Icon from '../components/Icon.vue';
import StatusChip from '../components/StatusChip.vue';
import { hhmm, roleLine } from '../lib/format';
import { allowedZones, type Pane, zoneAt, type Zone } from '../lib/layout';
import { SECTIONS, SYSTEM_IDS, type SectionId } from '../lib/sections';
import { STATUS_COLOR, STATUS_LABEL, type UiStatus } from '../lib/status';
import { useMissionStore } from '../stores/mission';
import { useWorkspaceStore } from '../stores/workspace';
import CrewOverview from '../views/CrewOverview.vue';
import MemberOverview from '../views/MemberOverview.vue';
import SystemDashboard from '../views/SystemDashboard.vue';

/** One pane: tab bar, section header and the active section. Accepts drops. */
const props = defineProps<{ pane: Pane; canClose: boolean }>();
const ws = useWorkspaceStore();
const mission = useMissionStore();

const PERIOD_LABEL: Record<Period, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  mission: 'Mission',
};
const ZONE_TEXT: Record<Zone, string> = {
  left: 'Split left',
  right: 'Split right',
  top: 'Split up',
  bottom: 'Split down',
  center: 'Open in this pane',
};
const ZONE_RECT: Record<Zone, [string, string, string, string]> = {
  left: ['0%', '0%', '50%', '100%'],
  right: ['50%', '0%', '50%', '100%'],
  top: ['0%', '0%', '100%', '50%'],
  bottom: ['0%', '50%', '100%', '50%'],
  center: ['1%', '1%', '98%', '98%'],
};
const CELLS: [Zone, number, number, [string, string, string, string]][] = [
  ['top', 1, 2, ['0', '0', '100%', '50%']],
  ['left', 2, 1, ['0', '0', '50%', '100%']],
  ['center', 2, 2, ['15%', '15%', '70%', '70%']],
  ['right', 2, 3, ['50%', '0', '50%', '100%']],
  ['bottom', 3, 2, ['0', '50%', '100%', '50%']],
];

const focused = computed(() => ws.focus === props.pane.id);
const activeTab = computed(() => props.pane.tabs.find((t) => t.id === props.pane.active));
const sec = computed<SectionId | null>(() => activeTab.value?.sec ?? null);

function statusOf(s: SectionId): UiStatus | null {
  if (s === 'crew') return null;
  if (s === 'overview') return mission.health[mission.selected]?.status ?? 'nodata';
  return mission.system(mission.selected, s).status;
}

const tabs = computed(() =>
  props.pane.tabs.map((t, i) => {
    const st = statusOf(t.sec);
    return {
      ...t,
      i,
      def: SECTIONS[t.sec],
      dot: st ? STATUS_COLOR[st] : null,
      on: t.id === props.pane.active,
      title: SECTIONS[t.sec].name + (t.sec === 'crew' ? '' : ` · ${mission.member?.name ?? ''}`),
    };
  }),
);

function summarize(list: UiStatus[]) {
  const order: UiStatus[] = ['critical', 'caution', 'nodata', 'nominal'];
  return order
    .map((s) => ({ s, n: list.filter((x) => x === s).length }))
    .filter((x) => x.n)
    .map((x) => ({ status: x.s, text: `${x.n} ${STATUS_LABEL[x.s]}` }));
}

const header = computed(() => {
  const s = sec.value;
  const m = mission.member;
  const updated = mission.health[mission.selected]?.computedAt;
  const upd = updated ? `Updated ${hhmm(updated)} UTC` : '';
  if (!s || !m) return null;
  if (s === 'crew')
    return {
      title: 'Crew overview',
      sub: `ISS Expedition · ${mission.crew.length} crew`,
      summary: summarize(mission.crew.map((c) => mission.health[c.id]?.status ?? 'nodata')),
      periods: false,
      updated: upd,
    };
  if (s === 'overview')
    return {
      title: 'Overview',
      sub: `${m.name} · ${roleLine(m)}`,
      summary: summarize(
        SYSTEM_IDS.map((id) => mission.system(m.id, id).status).filter((x) => x !== 'none'),
      ),
      periods: false,
      updated: upd,
    };
  const sys = mission.system(m.id, s);
  return {
    title: SECTIONS[s].name,
    sub: m.name,
    summary: [
      { status: sys.status, text: `${STATUS_LABEL[sys.status]} · ${sys.metrics.length} metrics` },
    ],
    periods: true,
    updated: upd,
  };
});

const allowed = ref<Set<Zone>>(new Set(['center']));

const dz = computed(() => {
  const d = ws.dropZone;
  if (!d || d.paneId !== props.pane.id) return null;
  const [l, t, w, h] = ZONE_RECT[d.zone];
  return { zone: d.zone, style: { left: l, top: t, width: w, height: h }, text: ZONE_TEXT[d.zone] };
});

function tabDragStart(e: DragEvent, tabId: string, s: SectionId) {
  e.stopPropagation();
  e.dataTransfer?.setData('text/plain', s);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  ws.startDrag({ kind: 'tab', sec: s, paneId: props.pane.id, tabId });
}

function tabOver(e: DragEvent, i: number) {
  if (!ws.drag) return;
  e.preventDefault();
  e.stopPropagation();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const index = i + (e.clientX > r.left + r.width / 2 ? 1 : 0);
  const cur = ws.dropTab;
  if (!cur || cur.paneId !== props.pane.id || cur.index !== index) {
    ws.dropTab = { paneId: props.pane.id, index };
    ws.dropZone = null;
  }
}

function barOver(e: DragEvent) {
  if (!ws.drag) return;
  e.preventDefault();
  const index = props.pane.tabs.length;
  if (!ws.dropTab || ws.dropTab.paneId !== props.pane.id || ws.dropTab.index !== index) {
    ws.dropTab = { paneId: props.pane.id, index };
    ws.dropZone = null;
  }
}

function tabDrop(e: DragEvent) {
  e.preventDefault();
  e.stopPropagation();
  const t = ws.dropTab;
  if (!t || t.paneId !== props.pane.id) return ws.endDrag();
  ws.drop(props.pane.id, 'center', t.index);
}

function contentOver(e: DragEvent) {
  if (!ws.drag) return;
  e.preventDefault();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  // A split that would leave a pane below the minimum size falls back to opening in this pane.
  allowed.value = allowedZones(r.width, r.height, ws.panes.length);
  const hit = zoneAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  const zone = allowed.value.has(hit) ? hit : 'center';
  const cur = ws.dropZone;
  if (!cur || cur.paneId !== props.pane.id || cur.zone !== zone) {
    ws.dropZone = { paneId: props.pane.id, zone };
    ws.dropTab = null;
  }
}

function contentLeave(e: DragEvent) {
  const to = e.relatedTarget as Node | null;
  if (to && (e.currentTarget as HTMLElement).contains(to)) return;
  if (ws.dropZone?.paneId === props.pane.id) ws.dropZone = null;
}

function contentDrop(e: DragEvent) {
  e.preventDefault();
  const z = ws.dropZone;
  if (!z || z.paneId !== props.pane.id) return ws.endDrag();
  ws.drop(props.pane.id, z.zone);
}
</script>

<template>
  <section class="pane" @mousedown="ws.focus = pane.id">
    <div class="tabbar" @dragover="barOver" @drop="tabDrop">
      <div
        v-for="t in tabs"
        :key="t.id"
        class="tab"
        :class="{ on: t.on, focused: focused && t.on }"
        :title="t.title"
        draggable="true"
        @dragstart="tabDragStart($event, t.id, t.sec)"
        @dragend="ws.endDrag()"
        @dragover="tabOver($event, t.i)"
        @drop="tabDrop"
        @click="ws.activate(pane.id, t.id)"
      >
        <span
          v-if="ws.dropTab?.paneId === pane.id && ws.dropTab.index === t.i"
          class="ins before"
        />
        <span
          v-if="
            ws.dropTab?.paneId === pane.id &&
            t.i === pane.tabs.length - 1 &&
            ws.dropTab.index === pane.tabs.length
          "
          class="ins after"
        />
        <Icon :name="t.def.icon" :size="15" />
        <span class="ellipsis">{{ t.def.name }}</span>
        <span v-if="t.dot" class="dot small-dot" :style="{ background: t.dot }" />
        <button class="close" title="Close tab" @click.stop="ws.closeTab(pane.id, t.id)">
          <Icon name="close" :size="13" />
        </button>
      </div>
      <span class="grow" />
      <div class="tools">
        <button class="icon-btn small" title="Split right" @click.stop="ws.splitRight(pane.id)">
          <Icon name="split" :size="15" />
        </button>
        <button
          v-if="canClose"
          class="icon-btn small"
          title="Close pane"
          @click.stop="ws.closePane(pane.id)"
        >
          <Icon name="close" :size="15" />
        </button>
      </div>
    </div>

    <div class="body" @dragover="contentOver" @dragleave="contentLeave" @drop="contentDrop">
      <div v-if="header" class="header">
        <div class="titles">
          <span class="title">{{ header.title }}</span>
          <span class="muted nowrap">{{ header.sub }}</span>
        </div>
        <div class="summary">
          <StatusChip v-for="s in header.summary" :key="s.text" :status="s.status" :text="s.text" />
        </div>
        <span class="grow" />
        <div v-if="header.periods && activeTab" class="segmented">
          <button
            v-for="p in PERIODS"
            :key="p"
            :class="{ on: activeTab.period === p }"
            @click="ws.setPeriod(pane.id, activeTab.id, p)"
          >
            {{ PERIOD_LABEL[p] }}
          </button>
        </div>
        <span class="mono faint upd">{{ header.updated }}</span>
      </div>
      <div class="content">
        <CrewOverview v-if="sec === 'crew'" />
        <MemberOverview v-else-if="sec === 'overview'" />
        <SystemDashboard
          v-else-if="sec && activeTab"
          :system="sec as BodySystemId"
          :period="activeTab.period"
          :pane-id="pane.id"
        />
        <div v-else class="empty">
          <span>No section open in this pane</span>
          <span class="small">Pick a section on the left, or drag one here</span>
        </div>
      </div>
      <div v-if="dz" class="dropzone">
        <div class="zone" :style="dz.style" />
        <div class="cells">
          <div
            v-for="[z, r, c, g] in CELLS"
            :key="z"
            class="cell"
            :style="{
              gridRow: r,
              gridColumn: c,
              borderColor: z === dz.zone ? 'var(--accent)' : 'var(--border-2)',
              opacity: allowed.has(z) ? 1 : 0.25,
            }"
          >
            <div
              :style="{
                position: 'absolute',
                left: g[0],
                top: g[1],
                width: g[2],
                height: g[3],
                background:
                  z === dz.zone
                    ? 'var(--accent)'
                    : 'color-mix(in srgb, var(--accent) 30%, transparent)',
              }"
            />
          </div>
        </div>
        <div class="zone-text">{{ dz.text }}</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pane {
  position: absolute;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.tabbar {
  height: 40px;
  flex: none;
  display: flex;
  align-items: stretch;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  overflow: hidden;
}
.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px 0 12px;
  min-width: 0;
  max-width: 230px;
  cursor: pointer;
  user-select: none;
  border-right: 1px solid var(--border);
  color: var(--text-2);
}
.tab:hover {
  color: var(--text-1);
}
.tab.on {
  background: var(--bg);
  color: var(--text-1);
}
.tab.on::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  background: var(--border-2);
}
.tab.focused::before {
  background: var(--accent);
}
.ins {
  position: absolute;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: var(--accent);
  z-index: 2;
}
.ins.before {
  left: -1px;
}
.ins.after {
  right: -1px;
}
.small-dot {
  width: 6px;
  height: 6px;
}
.close {
  width: 20px;
  height: 20px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--text-3);
}
.close:hover {
  background: var(--panel-3);
  color: var(--text-1);
}
.grow {
  flex: 1;
}
.tools {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
}
.icon-btn.small {
  width: 26px;
  height: 26px;
}
.body {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}
.header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px 12px;
  flex-wrap: wrap;
  row-gap: 8px;
}
.titles {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.title {
  font-size: 20px;
  font-weight: 600;
  white-space: nowrap;
}
.nowrap {
  white-space: nowrap;
}
.summary {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.upd {
  font-size: 11px;
  white-space: nowrap;
}
.content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-3);
}
.small {
  font-size: 12px;
}
.dropzone {
  position: absolute;
  inset: 0;
  z-index: 30;
  pointer-events: none;
}
.zone {
  position: absolute;
  background: rgba(77, 163, 255, 0.16);
  border: 1px solid var(--accent);
  border-radius: 4px;
  transition: all 120ms ease;
}
.cells {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: grid;
  grid-template-columns: repeat(3, 34px);
  grid-template-rows: repeat(3, 34px);
  gap: 4px;
}
.cell {
  border: 1px solid;
  border-radius: 3px;
  background: var(--panel-2);
  position: relative;
  overflow: hidden;
}
.zone-text {
  position: absolute;
  left: 50%;
  top: calc(50% + 70px);
  transform: translateX(-50%);
  background: var(--panel-2);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  white-space: nowrap;
}
</style>
