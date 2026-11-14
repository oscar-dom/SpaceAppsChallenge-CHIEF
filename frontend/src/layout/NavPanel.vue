<script setup lang="ts">
import { computed } from 'vue';
import Capsule, { type CapsuleState } from '../components/Capsule.vue';
import Icon from '../components/Icon.vue';
import { NAV_SECTIONS, SECTIONS, type SectionId } from '../lib/sections';
import { STATUS_COLOR, STATUS_LABEL, type UiStatus } from '../lib/status';
import { useChiefStore } from '../stores/chief';
import { useMissionStore } from '../stores/mission';
import { useUiStore } from '../stores/ui';
import { useWorkspaceStore } from '../stores/workspace';

/** Left panel: every section (click to open, drag into the workspace) and Talk to CHIEF. */
const mission = useMissionStore();
const ws = useWorkspaceStore();
const ui = useUiStore();
const chief = useChiefStore();

const expanded = computed(() => !ui.navCollapsed);

const items = computed(() =>
  NAV_SECTIONS.map((id) => {
    const status: UiStatus =
      id === 'overview'
        ? (mission.health[mission.selected]?.status ?? 'nodata')
        : mission.system(mission.selected, id as Exclude<SectionId, 'crew' | 'overview'>).status;
    const def = SECTIONS[id];
    return {
      ...def,
      status,
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

const bubbleState = computed<CapsuleState>(() => {
  if (chief.recording) return 'listening';
  if (chief.thinking) return 'thinking';
  if (!chief.online) return 'offline';
  return memberAlerts.value ? 'alert' : 'idle';
});

const bubbleText = computed(() => {
  if (!chief.online) return 'Offline · standard advice only';
  const n = memberAlerts.value;
  return n
    ? `${n} active alert${n > 1 ? 's' : ''} · ask what to do`
    : 'Ask CHIEF about your health';
});

function dragStart(e: DragEvent, sec: SectionId) {
  e.dataTransfer?.setData('text/plain', sec);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove';
  ws.startDrag({ kind: 'section', sec });
}

function toggleChat() {
  if (ui.chatOpen) ui.chatOpen = false;
  else chief.openChat();
}
</script>

<template>
  <aside class="nav" :style="{ width: expanded ? '240px' : '60px' }">
    <div class="head">
      <span v-if="expanded" class="label ellipsis">Sections · {{ mission.member?.name }}</span>
      <button
        class="icon-btn"
        :title="expanded ? 'Collapse to icon rail' : 'Expand panel'"
        @click="ui.navCollapsed = !ui.navCollapsed"
      >
        <Icon :name="expanded ? 'chevsLeft' : 'chevsRight'" />
      </button>
    </div>
    <div class="items">
      <div
        v-for="n in items"
        :key="n.id"
        class="item"
        :class="{ on: n.on, dragging: n.dragging }"
        draggable="true"
        :title="n.title"
        @dragstart="dragStart($event, n.id)"
        @dragend="ws.endDrag()"
        @click="ws.open(n.id)"
      >
        <Icon :name="n.icon" :size="17" class="item-icon" />
        <span v-if="expanded" class="ellipsis name">{{ n.name }}</span>
        <span
          class="dot status"
          :class="{ rail: !expanded }"
          :style="{ background: STATUS_COLOR[n.status] }"
        />
      </div>
    </div>
    <div class="grow" />
    <div class="bubble-wrap">
      <div
        class="bubble"
        :class="{ open: ui.chatOpen }"
        :style="{ padding: expanded ? '10px 14px 10px 10px' : '6px' }"
        title="Talk to CHIEF"
        role="button"
        tabindex="0"
        @click="toggleChat"
        @keydown.enter="toggleChat"
      >
        <Capsule :state="bubbleState" :size="expanded ? 40 : 30" />
        <div v-if="expanded" class="bubble-text">
          <span class="bubble-title">Talk to CHIEF</span>
          <span class="muted small">{{ bubbleText }}</span>
        </div>
        <div class="tail" />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.nav {
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-right: 1px solid var(--border);
  transition: width 180ms ease;
  overflow: hidden;
}
.head {
  height: 40px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 0 8px 0 18px;
}
.items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
}
.item {
  position: relative;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 10px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  color: var(--text-2);
}
.item:hover {
  background: var(--panel-3);
  color: var(--text-1);
}
.item.on {
  background: var(--panel-3);
  color: var(--text-1);
}
.item.on .item-icon {
  color: var(--accent);
}
.item.dragging {
  opacity: 0.5;
  outline: 1px dashed var(--accent);
}
.name {
  flex: 1;
  font-size: 13px;
}
.status {
  width: 8px;
  height: 8px;
}
.status.rail {
  position: absolute;
  top: 7px;
  left: 22px;
  width: 7px;
  height: 7px;
  box-shadow: 0 0 0 2px var(--panel);
}
.grow {
  flex: 1;
}
.bubble-wrap {
  padding: 12px 10px 22px;
}
.bubble {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--panel-2);
  border: 1px solid var(--border-2);
  border-radius: 16px;
  cursor: pointer;
  transition: border-color 150ms ease;
}
.bubble:hover,
.bubble.open {
  border-color: var(--accent);
}
.bubble-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}
.bubble-title {
  font-size: 13px;
  font-weight: 600;
}
.small {
  font-size: 12px;
}
.tail {
  position: absolute;
  left: 22px;
  bottom: -7px;
  width: 12px;
  height: 12px;
  background: var(--panel-2);
  border-right: 1px solid;
  border-bottom: 1px solid;
  border-color: inherit;
  transform: rotate(45deg);
  border-bottom-right-radius: 3px;
}
</style>
