<script setup lang="ts">
import { computed, ref } from 'vue';
import AlertCard from '../components/AlertCard.vue';
import Icon from '../components/Icon.vue';
import { firstName, hhmm, missionDayOf } from '../lib/format';
import { SECTIONS } from '../lib/sections';
import { NOTIF_RAIL_W, NOTIF_W } from '../lib/shell';
import { STATUS_COLOR } from '../lib/status';
import { useMissionStore } from '../stores/mission';
import { useUiStore } from '../stores/ui';

/**
 * Right panel: alerts (anomalies) and tasks (scheduled measurements). It can be collapsed to a
 * rail, but a new alert always opens it again.
 */
const mission = useMissionStore();
const ui = useUiStore();
const expanded = ref<string | null>(null);

const visible = computed(() =>
  mission.anomalies.filter((a) => ui.alertFilter === 'all' || a.crewMemberId === mission.selected),
);
const active = computed(() => mission.anomalies.filter((a) => !a.acknowledged));
const memberCount = computed(
  () => mission.anomalies.filter((a) => a.crewMemberId === mission.selected).length,
);
const sevCounts = computed(() =>
  (['critical', 'caution', 'info'] as const).map((k) => ({
    k,
    color: STATUS_COLOR[k],
    n: active.value.filter((a) => a.severity === k).length,
  })),
);

const openTasks = computed(() => mission.tasks.filter((t) => !t.acknowledged));
const taskGroups = computed(() => {
  const groups: { label: string; items: typeof mission.tasks }[] = [];
  for (const t of mission.tasks) {
    const label = t.dueAt ? `Mission day ${missionDayOf(t.dueAt, mission.start)}` : 'Unscheduled';
    let g = groups.find((x) => x.label === label);
    if (!g) groups.push((g = { label, items: [] }));
    g.items.push(t);
  }
  return groups;
});

function relative(iso?: string) {
  if (!iso || !mission.clock) return '';
  const min = Math.round((Date.parse(iso) - Date.parse(mission.clock.missionTime)) / 60000);
  if (min <= 0) return 'due now';
  return min < 60 ? `in ${min} min` : `in ${Math.round(min / 60)} h`;
}

function toggle(id: string) {
  expanded.value = expanded.value === id ? null : id;
}
const notifW = `${NOTIF_W}px`;
const railW = `${NOTIF_RAIL_W}px`;
</script>

<template>
  <aside v-if="ui.notifOpen" class="notif chrome-surface">
    <div class="tabs">
      <button
        v-for="t in [
          { k: 'alerts', label: 'Alerts', n: active.length },
          { k: 'tasks', label: 'Tasks', n: openTasks.length },
        ] as const"
        :key="t.k"
        class="tab"
        :class="{ on: ui.notifTab === t.k }"
        @click="ui.notifTab = t.k"
      >
        {{ t.label }}<span class="count mono">{{ t.n }}</span>
      </button>
      <span class="grow" />
      <button class="icon-btn" title="Collapse panel" @click="ui.toggleNotif()">
        <Icon name="chevsRight" />
      </button>
    </div>

    <template v-if="ui.notifTab === 'alerts'">
      <div v-if="ui.autoNotice" class="notice">
        <Icon name="bell" class="accent" />
        <span class="grow">Panel opened automatically for a new alert.</span>
        <button class="text-btn" @click="ui.toggleNotif()">Collapse</button>
      </div>
      <div class="filters">
        <div class="segmented">
          <button :class="{ on: ui.alertFilter === 'all' }" @click="ui.alertFilter = 'all'">
            All crew ({{ mission.anomalies.length }})
          </button>
          <button :class="{ on: ui.alertFilter === 'member' }" @click="ui.alertFilter = 'member'">
            {{ firstName(mission.member?.name ?? '') }} ({{ memberCount }})
          </button>
        </div>
        <span class="grow" />
        <span v-for="s in sevCounts" :key="s.k" class="sev mono" :title="`${s.k} alerts`">
          <span class="dot" :style="{ background: s.color }" />{{ s.n }}
        </span>
      </div>
      <div class="list">
        <AlertCard
          v-for="a in visible"
          :key="a.id"
          :alert="a"
          :highlighted="ui.highlight === a.id"
          :expanded="expanded === a.id"
          @toggle="toggle(a.id)"
        />
        <div v-if="!visible.length" class="empty">
          No alerts. All monitored metrics are in range.
        </div>
      </div>
    </template>

    <div v-else class="list tasks">
      <template v-for="g in taskGroups" :key="g.label">
        <div class="label group">{{ g.label }}</div>
        <div
          v-for="t in g.items"
          :key="t.id"
          class="task"
          :class="{ done: t.acknowledged, hl: ui.highlight === t.id }"
          @click="!t.acknowledged && mission.acknowledge(t.id)"
        >
          <span class="check" :class="{ on: t.acknowledged }">
            <Icon v-if="t.acknowledged" name="check" :size="12" :stroke="2.4" />
          </span>
          <div class="task-body">
            <span class="task-title">{{ t.title }}</span>
            <span class="faint small"
              >{{ mission.memberName(t.crewMemberId) }} · {{ SECTIONS[t.system].name }}</span
            >
          </div>
          <div class="due mono">
            <span>{{ t.dueAt ? hhmm(t.dueAt) : '—' }}</span>
            <span class="faint small">{{ relative(t.dueAt) }}</span>
          </div>
        </div>
      </template>
      <div v-if="!mission.tasks.length" class="empty">No scheduled measurements due soon.</div>
    </div>
  </aside>

  <aside v-else class="rail chrome-surface">
    <button class="icon-btn" title="Expand notifications" @click="ui.toggleNotif()">
      <Icon name="chevsLeft" />
    </button>
    <button class="bell" title="Alerts" @click="ui.toggleNotif()">
      <Icon name="bell" :size="17" />
      <span v-if="ui.unread" class="badge mono">{{ ui.unread }}</span>
    </button>
    <span class="vertical">ALERTS · TASKS</span>
    <div class="rail-counts">
      <span v-for="s in sevCounts" :key="s.k" class="rail-sev mono" :title="`${s.k} alerts`">
        <span class="dot" :style="{ background: s.color }" />{{ s.n }}
      </span>
    </div>
  </aside>
</template>

<style scoped>
.notif {
  width: v-bind(notifW);
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-left: 1px solid var(--border);
  animation: chPanel 180ms ease;
  min-height: 0;
}
.tabs {
  height: 44px;
  flex: none;
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--border);
  padding: 0 6px 0 8px;
}
.tabs .icon-btn {
  align-self: center;
}
.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 0;
  background: none;
  color: var(--text-2);
  font-weight: 600;
}
.tab:hover,
.tab.on {
  color: var(--text-1);
}
.tab.on::after {
  content: '';
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: -1px;
  height: 2px;
  background: var(--accent);
}
.count {
  font-size: 11px;
  font-weight: 500;
  min-width: 20px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--panel-3);
  color: var(--text-1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.grow {
  flex: 1;
}
.notice {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--accent-tint);
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  font-size: 12px;
  animation: chOpen 180ms ease;
}
.accent {
  color: var(--accent);
}
.text-btn {
  border: 0;
  background: none;
  color: var(--accent);
  font-size: 12px;
  font-weight: 500;
  padding: 0;
}
.filters {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 6px;
}
.filters .segmented button {
  height: 24px;
  padding: 0 9px;
}
.sev {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.list.tasks {
  gap: 0;
  padding-top: 4px;
}
.empty {
  padding: 24px 8px;
  text-align: center;
  color: var(--text-3);
  font-size: 12px;
}
.group {
  font-size: 10px;
  padding: 12px 4px 6px;
}
.task {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 8px 4px;
  border-top: 1px solid var(--border);
  cursor: pointer;
}
.task:hover {
  background: var(--panel-2);
}
.task.hl {
  background: var(--accent-tint);
}
.check {
  width: 16px;
  height: 16px;
  margin-top: 1px;
  border: 1px solid var(--border-2);
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--on-accent);
}
.check.on {
  border-color: var(--accent);
  background: var(--accent);
}
.task-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.task-title {
  font-size: 13px;
}
.done .task-title {
  color: var(--text-3);
  text-decoration: line-through;
}
.small {
  font-size: 11px;
}
.due {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  white-space: nowrap;
}
.rail {
  width: v-bind(railW);
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  background: var(--panel);
  border-left: 1px solid var(--border);
}
.bell {
  position: relative;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-2);
  border-radius: 4px;
  background: var(--panel-2);
}
.bell:hover {
  border-color: var(--accent);
}
.badge {
  position: absolute;
  top: -7px;
  right: -8px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--panel);
}
.vertical {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--text-3);
  margin-top: 6px;
}
.rail-counts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}
.rail-sev {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  font-size: 12px;
}
</style>
