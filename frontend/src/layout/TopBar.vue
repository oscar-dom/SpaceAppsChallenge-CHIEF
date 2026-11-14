<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '../components/Icon.vue';
import StatusChip from '../components/StatusChip.vue';
import { clockText, initials, roleLine } from '../lib/format';
import { STATUS_COLOR, type UiStatus } from '../lib/status';
import { useMissionStore } from '../stores/mission';
import { useUiStore } from '../stores/ui';
import { useWorkspaceStore } from '../stores/workspace';

/**
 * Context header: who the workspace is showing (named big, with the health score) on the
 * left, mission telemetry on the right.
 */
const mission = useMissionStore();
const ws = useWorkspaceStore();
const ui = useUiStore();
const menuOpen = ref(false);

const context = computed(() => {
  if (ws.focusedSection === 'crew' || !mission.member) return null;
  const m = mission.member;
  const h = mission.health[m.id];
  const status: UiStatus = h?.status ?? 'nodata';
  return {
    name: m.name,
    ini: initials(m.name),
    role: roleLine(m),
    score: h ? String(h.score) : '—',
    status,
    ring: STATUS_COLOR[status],
  };
});

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
      <template v-if="context">
        <span class="avatar" :style="{ '--ring': context.ring }">{{ context.ini }}</span>
        <div class="who">
          <span class="who-name">{{ context.name }}</span>
          <span class="muted who-role">{{ context.role }}</span>
        </div>
        <div class="who-score" title="Health score: weighted average of the body systems">
          <span class="mono who-num">{{ context.score }}<span class="faint">/100</span></span>
          <StatusChip :status="context.status" />
        </div>
      </template>
      <div v-else class="who">
        <span class="who-name">Crew overview</span>
        <span class="muted who-role">{{ mission.crew.length }} crew members · ISS expedition</span>
      </div>
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
        <span class="mono val">{{ doseRate }} <span class="faint unit">µSv/h</span></span>
      </div>
    </div>
    <div class="right">
      <span class="pill" title="Every reading is simulated from NASA data and standards"
        >Simulated data</span
      >
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
  height: 68px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 20px 0 24px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  position: relative;
  z-index: 50;
}
.side {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  flex: 1 1 0;
}
.avatar {
  width: 42px;
  height: 42px;
  flex: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  background: var(--chrome);
  color: var(--chrome-text);
  box-shadow:
    0 0 0 2px var(--panel),
    0 0 0 4px var(--ring);
}
.who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.2;
}
.who-name {
  font-size: 20px;
  font-weight: 600;
  white-space: nowrap;
}
.who-role {
  font-size: 13px;
  white-space: nowrap;
}
.who-score {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 16px;
  margin-left: 4px;
  border-left: 1px solid var(--border);
}
.who-num {
  font-size: 24px;
  font-weight: 600;
}
.who-num .faint {
  font-size: 13px;
  font-weight: 400;
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
  padding: 0 18px;
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
  min-width: 166px;
}
.unit {
  font-size: 11px;
}
.progress {
  width: 56px;
  height: 4px;
  border-radius: 2px;
  background: var(--panel-3);
  overflow: hidden;
  display: block;
}
.progress span {
  display: block;
  height: 100%;
  background: var(--accent);
}
.right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.pill {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-2);
  background: var(--panel-3);
  border-radius: 999px;
  padding: 4px 10px;
  white-space: nowrap;
}
.menu-wrap {
  position: relative;
}
.menu-btn {
  height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 14px;
  border: 1px solid var(--border-2);
  border-radius: 8px;
  background: var(--panel);
  font-weight: 500;
}
.menu-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.scrim {
  position: fixed;
  inset: 0;
  z-index: 55;
}
.menu {
  position: absolute;
  right: 0;
  top: 42px;
  z-index: 60;
  width: 300px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
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
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  text-align: left;
}
.menu-item:hover {
  background: var(--accent-tint);
}
.small-text {
  font-size: 12px;
}
</style>
