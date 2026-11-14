<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import Capsule from './components/Capsule.vue';
import { mdTime } from './lib/format';
import ChatPanel from './layout/ChatPanel.vue';
import CrewTabs from './layout/CrewTabs.vue';
import NavPanel from './layout/NavPanel.vue';
import NotificationsPanel from './layout/NotificationsPanel.vue';
import TopBar from './layout/TopBar.vue';
import Workspace from './layout/Workspace.vue';
import { useChiefStore } from './stores/chief';
import { useMissionStore } from './stores/mission';
import { useUiStore } from './stores/ui';
import { useWorkspaceStore } from './stores/workspace';

const mission = useMissionStore();
const ui = useUiStore();
const ws = useWorkspaceStore();
const chief = useChiefStore();

ui.applyTheme();
onMounted(() => mission.init({ onNewAlert: ui.alertArrived }));

const evaluated = computed(() => {
  const h = mission.health[mission.selected];
  return h
    ? `Readings evaluated ${mdTime(h.computedAt, mission.start)} UTC`
    : 'Waiting for readings';
});
const paneCount = computed(() => ws.panes.length);

// A drag that ends outside any pane must not leave drop zones behind.
watch(
  () => ws.drag,
  (d) => {
    if (!d) return;
    const end = () => {
      setTimeout(() => ws.endDrag(), 0);
      window.removeEventListener('dragend', end, true);
      window.removeEventListener('drop', end, true);
    };
    window.addEventListener('dragend', end, true);
    window.addEventListener('drop', end, true);
  },
);
</script>

<template>
  <div v-if="!mission.loaded" class="boot">
    <Capsule :state="mission.loadError ? 'offline' : 'thinking'" :size="56" />
    <template v-if="mission.loadError">
      <span class="boot-title">Cannot reach the ship's health system</span>
      <span class="muted"
        >{{ mission.loadError }}. Start the backend with <code>npm run dev</code>; retrying every
        few seconds.</span
      >
      <button class="btn" @click="mission.init({ onNewAlert: ui.alertArrived })">Retry</button>
    </template>
    <span v-else class="muted">Connecting to the ship's health system…</span>
  </div>

  <div v-else class="app">
    <TopBar />
    <CrewTabs />
    <div class="main">
      <NavPanel />
      <Workspace />
      <ChatPanel v-if="ui.chatOpen" />
      <NotificationsPanel />
    </div>
    <footer class="status">
      <span class="mono">{{ evaluated }}</span><span>·</span>
      <span>{{
        chief.online ? 'CHIEF online' : 'CHIEF offline · standard recommendations'
      }}</span><span>·</span>
      <span
        >{{ paneCount }} {{ paneCount === 1 ? 'pane' : 'panes' }} · {{ mission.member?.name }}</span
      >
      <template v-if="!mission.connected"
        ><span>·</span><span class="warn">Live link lost, reconnecting…</span></template
      >
      <span class="grow" />
      <span>Simulated data. CHIEF is a prototype, not a medical device.</span>
    </footer>
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  min-width: 1280px;
  min-height: 720px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.main {
  flex: 1;
  min-height: 0;
  display: flex;
}
.status {
  height: 26px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  background: var(--panel);
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
}
.grow {
  flex: 1;
}
.warn {
  color: var(--text-1);
}
.boot {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.boot-title {
  font-size: 15px;
  font-weight: 600;
}
code {
  font-family: var(--mono);
}
</style>
