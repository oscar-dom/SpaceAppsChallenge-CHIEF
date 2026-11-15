<script setup lang="ts">
import type { BodySystemId } from '@chief/shared';
import { computed } from 'vue';
import Capsule from '../components/Capsule.vue';
import Icon from '../components/Icon.vue';
import { firstName, initials } from '../lib/format';
import { isMissionSection, NAV_SECTIONS, SECTIONS, type SectionId } from '../lib/sections';
import { NAV_RAIL_W, NAV_W } from '../lib/shell';
import { STATUS_COLOR, STATUS_LABEL, type UiStatus } from '../lib/status';
import { useChiefStore } from '../stores/chief';
import { useJourneyStore } from '../stores/journey';
import { useMissionStore } from '../stores/mission';
import { useUiStore } from '../stores/ui';
import { useWorkspaceStore } from '../stores/workspace';

/**
 * Left navigation on the dark chrome layer, in the order a crew member thinks: where the
 * mission is (JOURNEY: route and ship stock), who (crew), what (that person's body systems),
 * then ask CHIEF. Sections can be clicked
 * to open or dragged into the workspace to split it.
 */
const mission = useMissionStore();
const ws = useWorkspaceStore();
const ui = useUiStore();
const chief = useChiefStore();
const journey = useJourneyStore();

const route = computed(() => ({
  day: journey.today,
  length: journey.lengthDays,
  stage: journey.current?.index ?? '—',
  pct: `${Math.min(100, (journey.day / journey.lengthDays) * 100).toFixed(1)}%`,
  on: ws.focusedSection === 'route',
}));
const stock = computed(() => {
  const flagged = journey.flagged;
  const critical = flagged.some((s) => s.status === 'critical');
  return {
    items: journey.stocks.length,
    n: flagged.length,
    status: (critical ? 'critical' : 'caution') as UiStatus,
    on: ws.focusedSection === 'inventory',
  };
});

const expanded = computed(() => !ui.navCollapsed);
const crewActive = computed(() => ws.focusedSection === 'crew');
const criticalCount = computed(
  () => mission.anomalies.filter((a) => a.severity === 'critical' && !a.acknowledged).length,
);

const people = computed(() =>
  mission.crew.map((c) => {
    const h = mission.health[c.id];
    const status: UiStatus = h?.status ?? 'nodata';
    return {
      id: c.id,
      name: c.name,
      ini: initials(c.name),
      role: c.role,
      score: h ? String(h.score) : '—',
      status,
      color: STATUS_COLOR[status],
      label: STATUS_LABEL[status],
      on: !crewActive.value && c.id === mission.selected,
    };
  }),
);

const items = computed(() =>
  NAV_SECTIONS.map((id) => {
    const status: UiStatus =
      id === 'overview'
        ? (mission.health[mission.selected]?.status ?? 'nodata')
        : mission.system(mission.selected, id as BodySystemId).status;
    const def = SECTIONS[id];
    return {
      ...def,
      status,
      flagged: status === 'caution' || status === 'critical',
      on: ws.focusedSection === id,
      dragging: ws.drag?.kind === 'section' && ws.drag.sec === id,
      title: `${def.name}: ${STATUS_LABEL[status]}`,
    };
  }),
);

const memberAlerts = computed(
  () =>
    (mission.alerts[mission.selected] ?? []).filter((a) => a.kind === 'anomaly' && !a.acknowledged)
      .length,
);

const bubbleText = computed(() => {
  if (!chief.online) return 'Offline · standard advice';
  const n = memberAlerts.value;
  return n ? `${n} active alert${n > 1 ? 's' : ''} to review` : 'Ask about your health';
});

function selectPerson(id: string) {
  mission.selected = id;
  if (isMissionSection(ws.focusedSection) || ws.focusedSection === null) ws.open('overview');
}

function dragStart(e: DragEvent, sec: SectionId) {
  e.dataTransfer?.setData('text/plain', sec);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove';
  ws.startDrag({ kind: 'section', sec });
}

function toggleChat() {
  if (ui.chatOpen) ui.chatOpen = false;
  else chief.openChat();
}
const navW = `${NAV_W}px`;
const railW = `${NAV_RAIL_W}px`;
</script>

<template>
  <aside class="nav" :class="{ rail: !expanded }">
    <div class="brand">
      <Capsule state="idle" :size="28" />
      <div v-if="expanded" class="brand-text">
        <span class="brand-name">CHIEF</span>
        <span class="brand-sub">Crew health · ISS</span>
      </div>
      <span class="grow" />
      <button
        class="chrome-btn"
        :title="expanded ? 'Collapse to icon rail' : 'Expand panel'"
        @click="ui.navCollapsed = !ui.navCollapsed"
      >
        <Icon :name="expanded ? 'chevsLeft' : 'chevsRight'" />
      </button>
    </div>

    <div class="scroll">
      <div v-if="expanded" class="heading">Journey</div>
      <div v-else class="rail-heading">Journey</div>
      <div
        class="row journey-row"
        :class="{ on: route.on }"
        draggable="true"
        role="button"
        tabindex="0"
        :title="`Mission route · Day ${route.day} / ${route.length} · Stage ${route.stage}`"
        @dragstart="dragStart($event, 'route')"
        @dragend="ws.endDrag()"
        @click="ws.open('route')"
        @keydown.enter="ws.open('route')"
      >
        <span class="journey-icon accent"><Icon name="route" :size="18" /></span>
        <span v-if="expanded" class="row-text">
          <span class="row-title">Mission route</span>
          <span class="row-sub mono"
            >Day {{ route.day }}/{{ route.length }} · Stage {{ route.stage }}</span
          >
          <span class="route-bar"><span :style="{ width: route.pct }" /></span>
        </span>
        <template v-else>
          <span class="rail-route mono">D{{ route.day }}·S{{ route.stage }}</span>
          <span class="route-bar rail-bar"><span :style="{ width: route.pct }" /></span>
        </template>
      </div>
      <div
        class="row journey-row"
        :class="{ on: stock.on }"
        draggable="true"
        role="button"
        tabindex="0"
        :title="`Inventory · food, water, medication${stock.n ? ` · ${stock.n} ${STATUS_LABEL[stock.status].toLowerCase()}` : ''}`"
        @dragstart="dragStart($event, 'inventory')"
        @dragend="ws.endDrag()"
        @click="ws.open('inventory')"
        @keydown.enter="ws.open('inventory')"
      >
        <span class="journey-icon"><Icon name="inventory" :size="18" /></span>
        <span v-if="expanded" class="row-text">
          <span class="row-title">Inventory</span>
          <span class="row-sub">{{ stock.items }} items · food, water, meds</span>
        </span>
        <span
          v-if="expanded && stock.n"
          class="flag"
          :style="{ background: STATUS_COLOR[stock.status] }"
          >{{ stock.n }} {{ STATUS_LABEL[stock.status] }}</span
        >
        <span
          v-else-if="stock.n"
          class="rail-count mono"
          :style="{ background: STATUS_COLOR[stock.status] }"
          >{{ stock.n }}</span
        >
      </div>

      <div v-if="expanded" class="heading">Crew</div>
      <div v-else class="divider" />
      <button
        class="row crew-row"
        :class="{ on: crewActive }"
        title="Whole crew at a glance"
        @click="ws.open('crew')"
      >
        <span class="crew-icon"><Icon name="crew" :size="18" /></span>
        <span v-if="expanded" class="row-text">
          <span class="row-title">Crew overview</span>
          <span class="row-sub"
            >{{ mission.crew.length }} members<template v-if="criticalCount">
              · {{ criticalCount }} critical</template
            ></span
          >
        </span>
      </button>

      <button
        v-for="p in people"
        :key="p.id"
        class="row person"
        :class="{ on: p.on }"
        :title="`${p.name}: ${p.score} · ${p.label}`"
        @click="selectPerson(p.id)"
      >
        <span class="avatar" :style="{ '--ring': p.color }">{{ p.ini }}</span>
        <span v-if="expanded" class="row-text">
          <span class="row-title">{{ p.name }}</span>
          <span class="row-sub">{{ p.role }}</span>
        </span>
        <span v-if="expanded" class="score">
          <span class="mono score-num">{{ p.score }}</span>
          <span class="score-label" :style="{ color: p.color }">{{ p.label }}</span>
        </span>
      </button>

      <div v-if="expanded" class="heading">
        Health systems · {{ firstName(mission.member?.name ?? '') }}
      </div>
      <div v-else class="divider" />
      <div
        v-for="n in items"
        :key="n.id"
        class="row section"
        :class="{ on: n.on, dragging: n.dragging, flagged: n.flagged }"
        draggable="true"
        role="button"
        tabindex="0"
        :title="n.title"
        @dragstart="dragStart($event, n.id)"
        @dragend="ws.endDrag()"
        @click="ws.open(n.id)"
        @keydown.enter="ws.open(n.id)"
      >
        <Icon :name="n.icon" :size="18" class="section-icon" />
        <span v-if="expanded" class="ellipsis section-name">{{ n.name }}</span>
        <span
          v-if="expanded && n.flagged"
          class="flag"
          :style="{ background: STATUS_COLOR[n.status] }"
          >{{ STATUS_LABEL[n.status] }}</span
        >
        <span
          v-else
          class="dot"
          :class="{ 'rail-dot': !expanded }"
          :style="{ background: STATUS_COLOR[n.status], opacity: n.flagged ? 1 : 0.55 }"
        />
      </div>
    </div>

    <div class="chief">
      <button
        class="chief-btn"
        :class="{ open: ui.chatOpen }"
        title="Talk to CHIEF"
        @click="toggleChat"
      >
        <span class="chief-capsule"><Capsule :state="chief.mascot" :size="34" /></span>
        <span v-if="expanded" class="row-text">
          <span class="chief-title">Talk to CHIEF</span>
          <span class="chief-sub">{{ bubbleText }}</span>
        </span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.nav {
  width: v-bind(navW);
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--chrome);
  color: var(--chrome-text);
  transition: width 180ms ease;
  overflow: hidden;
  /* Status colours read on the navy chrome in both themes. */
  --nominal: var(--chrome-nominal);
  --caution: var(--chrome-caution);
  --critical: var(--chrome-critical);
  --nodata: var(--chrome-nodata);
}
.nav.rail {
  width: v-bind(railW);
}
.brand {
  height: 60px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px 0 20px;
  border-bottom: 1px solid var(--chrome-line);
}
.rail .brand {
  flex-direction: column;
  justify-content: center;
  height: 84px;
  gap: 6px;
  padding: 0;
}
.rail .brand .grow {
  display: none;
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.brand-name {
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 0.18em;
}
.brand-sub {
  font-size: 11px;
  color: var(--chrome-muted);
}
.grow {
  flex: 1;
}
.chrome-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--chrome-muted);
}
.chrome-btn:hover {
  background: var(--chrome-3);
  color: var(--chrome-text);
}
.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.scroll::-webkit-scrollbar-thumb {
  background: var(--chrome-3);
  border-color: var(--chrome);
}
.heading {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--chrome-muted);
  padding: 16px 10px 8px;
}
.divider {
  height: 1px;
  background: var(--chrome-line);
  margin: 10px 6px;
}
.row {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--chrome-text);
  text-align: left;
  cursor: pointer;
  user-select: none;
}
.rail .row {
  justify-content: center;
  padding: 8px 0;
}
.row:hover {
  background: var(--chrome-2);
}
.row.on {
  background: var(--chrome-3);
}
.row.on::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--chrome-accent);
}
.row-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  line-height: 1.25;
}
.row-title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-sub {
  font-size: 12px;
  color: var(--chrome-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rail-heading {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--chrome-muted);
  text-align: center;
  padding: 8px 0 4px;
}
.journey-row {
  color: var(--chrome-text);
}
.rail .journey-row {
  flex-direction: column;
  gap: 4px;
  padding: 8px 0 7px;
}
.journey-icon {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--chrome-2);
  border: 1px solid var(--chrome-line);
  color: var(--chrome-muted);
}
.journey-icon.accent {
  color: var(--chrome-accent);
}
.rail .journey-icon {
  width: 32px;
  height: 32px;
}
.journey-row .row-sub.mono {
  font-family: var(--mono);
  font-size: 11px;
}
.route-bar {
  display: block;
  height: 3px;
  margin-top: 5px;
  border-radius: 2px;
  background: var(--chrome-line);
  overflow: hidden;
}
.route-bar span {
  display: block;
  height: 100%;
  background: var(--chrome-accent);
}
.rail-route {
  font-size: 10px;
  line-height: 1;
}
.rail-bar {
  width: 36px;
  margin-top: 0;
}
.rail-count {
  position: absolute;
  top: 4px;
  left: calc(50% + 8px);
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  color: #10192b;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.crew-icon {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--chrome-2);
  border: 1px solid var(--chrome-line);
}
.person {
  padding-top: 7px;
  padding-bottom: 7px;
}
/* Avatar with a status ring: the person first, their status around them. */
.avatar {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  background: var(--chrome-3);
  color: var(--chrome-text);
  box-shadow:
    0 0 0 2px var(--chrome),
    0 0 0 4px var(--ring);
}
.row.on .avatar {
  background: #ffffff;
  color: var(--chrome);
}
.score {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.1;
}
.score-num {
  font-size: 18px;
  font-weight: 600;
}
.score-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.section {
  height: 40px;
  padding-top: 0;
  padding-bottom: 0;
  color: var(--chrome-muted);
}
.section:hover,
.section.on {
  color: var(--chrome-text);
}
.section.flagged {
  color: var(--chrome-text);
}
.section.on .section-icon {
  color: var(--chrome-accent);
}
.section.dragging {
  opacity: 0.5;
  outline: 1px dashed var(--chrome-accent);
}
.section-name {
  flex: 1;
  font-size: 14px;
}
.flag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #10192b;
  padding: 2px 7px;
  border-radius: 999px;
}
.dot {
  width: 8px;
  height: 8px;
}
.rail-dot {
  position: absolute;
  top: 8px;
  left: calc(50% + 6px);
  box-shadow: 0 0 0 2px var(--chrome);
}
.chief {
  flex: none;
  padding: 12px 10px 14px;
  border-top: 1px solid var(--chrome-line);
}
.chief-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 0;
  border-radius: 12px;
  background: var(--accent);
  color: #ffffff;
  text-align: left;
  box-shadow: 0 4px 14px rgba(36, 87, 214, 0.35);
  transition:
    background 150ms ease,
    transform 150ms ease;
}
.rail .chief-btn {
  justify-content: center;
  padding: 8px 0;
}
.chief-btn:hover {
  background: var(--accent-strong);
  transform: translateY(-1px);
}
.chief-btn.open {
  background: var(--accent-strong);
}
.chief-capsule {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
}
.chief-title {
  font-size: 14px;
  font-weight: 600;
}
.chief-sub {
  font-size: 12px;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
