<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '../components/Icon.vue';
import { clockText, initials } from '../lib/format';
import { useMissionStore } from '../stores/mission';
import { useUiStore } from '../stores/ui';
import { useWorkspaceStore } from '../stores/workspace';

const mission = useMissionStore();
const ws = useWorkspaceStore();
const ui = useUiStore();
const menuOpen = ref(false);

const day = computed(() => mission.clock?.missionDay ?? 0);
const length = computed(() => mission.clock?.missionLengthDays ?? 180);
const progress = computed(() => `${Math.min(100, (day.value / length.value) * 100).toFixed(1)}%`);

/** Crew average of the latest radiation dose rate: charted only, NASA limits the dose, not the rate. */
const doseRate = computed(() => {
  const values = mission.crew
    .map((c) => mission.metricStatus(c.id, 'radiation-dose-rate')?.latest?.value)
    .filter((v): v is number => v !== undefined);
  return values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : '—';
});

const LAYOUTS = [
  { id: 'single', label: 'Single pane', sub: 'Overview and Cardiovascular tabs' },
  { id: 'two', label: 'Two panes', sub: 'Cardiovascular | Sleep & Cognition' },
  { id: 'grid', label: '2 × 2 grid', sub: 'Overview, Vision, Radiation, Immune' },
  { id: 'reset', label: 'Reset layout', sub: 'Crew overview and Overview tabs' },
] as const;

function pick(id: (typeof LAYOUTS)[number]['id']) {
  ws.preset(id);
  menuOpen.value = false;
}
</script>

<template>
  <header class="topbar">
    <div class="side">
      <span class="brand">CHIEF</span>
      <span class="sep" />
      <span class="muted nowrap">ISS Expedition · simulated</span>
    </div>
    <div class="telemetry">
      <div class="cell">
        <span class="label small">Mission day</span>
        <div class="inline">
          <span class="mono val"
            >{{ String(day).padStart(3, '0') }} <span class="faint">/ {{ length }}</span></span
          >
          <span class="progress"><span :style="{ width: progress }" /></span>
        </div>
      </div>
      <div class="cell">
        <span class="label small">Mission clock · UTC</span>
        <span class="mono val clock">{{
          mission.clock ? clockText(mission.clock.missionTime) : '—'
        }}</span>
      </div>
      <div class="cell">
        <span class="label small">Crew dose rate</span>
        <span class="mono val inline"
          ><span class="dot" style="background: var(--border-2)" />{{ doseRate }}
          <span class="faint unit">µSv/h</span></span
        >
      </div>
      <div class="cell">
        <span class="pill">SIMULATED DATA</span>
      </div>
    </div>
    <div class="side right">
      <div class="menu-wrap">
        <button class="menu-btn" @click="menuOpen = !menuOpen">
          Layouts<Icon name="chevronDown" :size="14" />
        </button>
        <template v-if="menuOpen">
          <div class="scrim" @click="menuOpen = false" />
          <div class="menu">
            <div class="label menu-label">Demo layouts</div>
            <button v-for="l in LAYOUTS" :key="l.id" class="menu-item" @click="pick(l.id)">
              <span>{{ l.label }}</span>
              <span class="muted small-text">{{ l.sub }}</span>
            </button>
          </div>
        </template>
      </div>
      <div v-if="mission.member" class="avatar" :title="`${mission.member.name} (selected)`">
        {{ initials(mission.member.name) }}
      </div>
      <button
        class="icon-btn"
        :title="ui.theme === 'dark' ? 'Light theme' : 'Dark theme'"
        @click="ui.toggleTheme()"
      >
        <Icon name="sun" :size="18" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  height: 56px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  position: relative;
  z-index: 50;
}
.side {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1 1 0;
}
.side.right {
  justify-content: flex-end;
  gap: 8px;
}
.brand {
  font-weight: 600;
  font-size: 17px;
  letter-spacing: 0.16em;
}
.sep {
  width: 1px;
  height: 20px;
  background: var(--border-2);
}
.nowrap {
  white-space: nowrap;
}
.telemetry {
  display: flex;
  align-items: center;
  flex: none;
}
.cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 20px;
}
.cell + .cell {
  border-left: 1px solid var(--border);
}
.small {
  font-size: 10px;
}
.inline {
  display: flex;
  align-items: center;
  gap: 8px;
}
.val {
  font-size: 14px;
  font-weight: 500;
}
.clock {
  min-width: 170px;
}
.unit {
  font-size: 11px;
}
.progress {
  width: 56px;
  height: 4px;
  border-radius: 2px;
  background: var(--border-2);
  overflow: hidden;
  display: block;
}
.progress span {
  display: block;
  height: 100%;
  background: var(--text-2);
}
.pill {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--text-2);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  padding: 3px 8px;
  white-space: nowrap;
}
.menu-wrap {
  position: relative;
}
.menu-btn {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 12px;
  border: 1px solid var(--border-2);
  border-radius: 4px;
  background: var(--panel-2);
  font-weight: 500;
}
.menu-btn:hover {
  border-color: var(--accent);
}
.scrim {
  position: fixed;
  inset: 0;
  z-index: 55;
}
.menu {
  position: absolute;
  right: 0;
  top: 40px;
  z-index: 60;
  width: 300px;
  background: var(--panel-2);
  border: 1px solid var(--border-2);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  padding: 6px;
  animation: chOpen 150ms ease;
}
.menu-label {
  font-size: 10px;
  padding: 8px 10px 4px;
}
.menu-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 7px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  text-align: left;
}
.menu-item:hover {
  background: var(--panel-3);
}
.small-text {
  font-size: 12px;
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
  margin-left: 4px;
}
</style>
