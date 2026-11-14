<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../components/Icon.vue';
import { initials, roleLine } from '../lib/format';
import { STATUS_COLOR, STATUS_LABEL, statusText } from '../lib/status';
import { useMissionStore } from '../stores/mission';
import { useWorkspaceStore } from '../stores/workspace';

/** "Crew" tab (whole-crew overview) plus one tab per crew member. */
const mission = useMissionStore();
const ws = useWorkspaceStore();

const crewActive = computed(() => ws.focusedSection === 'crew');
const criticalCount = computed(
  () => mission.anomalies.filter((a) => a.severity === 'critical').length,
);

const tabs = computed(() =>
  mission.crew.map((c) => {
    const h = mission.health[c.id];
    const status = h?.status ?? 'nominal';
    return {
      id: c.id,
      name: c.name,
      ini: initials(c.name),
      role: roleLine(c),
      score: h ? String(h.score) : '—',
      color: STATUS_COLOR[status],
      fg: statusText(status),
      label: h ? STATUS_LABEL[status] : 'No data',
      on: !crewActive.value && c.id === mission.selected,
    };
  }),
);

function select(id: string) {
  mission.selected = id;
  if (ws.focusedSection === 'crew' || ws.focusedSection === null) ws.open('overview');
}
</script>

<template>
  <nav class="crewtabs">
    <div class="tab crew" :class="{ on: crewActive }" @click="ws.open('crew')">
      <Icon name="crew" :size="18" />
      <div class="names">
        <span class="name">Crew</span>
        <span class="sub">{{ mission.crew.length }} members · {{ criticalCount }} critical</span>
      </div>
    </div>
    <div
      v-for="t in tabs"
      :key="t.id"
      class="tab member"
      :class="{ on: t.on }"
      @click="select(t.id)"
    >
      <div class="avatar">{{ t.ini }}</div>
      <div class="names grow">
        <span class="name">{{ t.name }}</span>
        <span class="sub">{{ t.role }}</span>
      </div>
      <div class="score">
        <span class="inline"
          ><span class="dot" :style="{ background: t.color }" /><span class="mono num">{{
            t.score
          }}</span></span
        >
        <span class="status" :style="{ color: t.fg }">{{ t.label }}</span>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.crewtabs {
  height: 52px;
  flex: none;
  display: flex;
  align-items: stretch;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 0 8px;
  overflow-x: auto;
}
.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  border-right: 1px solid var(--border);
  color: var(--text-2);
}
.tab:hover {
  background: var(--panel);
}
.tab.on {
  background: var(--panel);
  color: var(--text-1);
}
.tab.on::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--accent);
}
.crew {
  padding: 0 20px;
  gap: 10px;
}
.member {
  padding: 0 16px 0 14px;
  min-width: 212px;
  color: var(--text-1);
}
.names {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}
.grow {
  flex: 1;
}
.name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--text-1);
}
.sub {
  font-size: 11px;
  color: var(--text-2);
  white-space: nowrap;
}
.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--panel-3);
  border: 1px solid var(--border-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  flex: none;
}
.score {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.15;
}
.inline {
  display: flex;
  align-items: center;
  gap: 6px;
}
.num {
  font-size: 16px;
  font-weight: 500;
}
.status {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
</style>
