<script setup lang="ts">
import type { Alert } from '@chief/shared';
import { computed } from 'vue';
import { mdTime } from '../lib/format';
import { SECTIONS } from '../lib/sections';
import { STATUS_COLOR } from '../lib/status';
import { useChiefStore } from '../stores/chief';
import { useMissionStore } from '../stores/mission';
import ActionList from './ActionList.vue';
import Capsule from './Capsule.vue';
import EscalationChip from './EscalationChip.vue';
import Icon from './Icon.vue';
import StatusChip from './StatusChip.vue';

/** An alert in the notifications panel. Clicking it asks CHIEF for recommended actions. */
const props = defineProps<{ alert: Alert; highlighted: boolean; expanded: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const mission = useMissionStore();
const chief = useChiefStore();

const state = computed(() => chief.actions[props.alert.id]);
const color = computed(() => STATUS_COLOR[props.alert.severity]);

function toggle() {
  if (!props.expanded) void chief.loadActions(props.alert);
  emit('toggle');
}
</script>

<template>
  <div class="card alert" :class="{ hl: highlighted, acked: alert.acknowledged }" @click="toggle">
    <div class="bar" :style="{ background: color }" />
    <div class="row">
      <StatusChip :status="alert.severity" plain />
      <span v-if="highlighted" class="new">NEW</span>
      <span class="spacer" />
      <EscalationChip :level="alert.escalation" />
    </div>
    <div class="title">{{ alert.title }}</div>
    <div class="detail">{{ alert.message }}</div>
    <div class="meta">
      <span class="muted">{{ mission.memberName(alert.crewMemberId) }}</span><span>·</span
      ><span>{{ SECTIONS[alert.system].name }}</span
      ><span>·</span><span class="mono">{{ mdTime(alert.createdAt, mission.start) }}</span>
    </div>
    <div class="row">
      <span class="state" :class="{ active: !alert.acknowledged }">
        <Icon v-if="alert.acknowledged" name="check" :size="12" :stroke="2" />
        <span v-else class="ring" />{{ alert.acknowledged ? 'Acknowledged' : 'Active' }}
      </span>
      <span class="spacer" />
      <button v-if="!alert.acknowledged" class="btn" @click.stop="mission.acknowledge(alert.id)">
        Acknowledge
      </button>
      <button class="link-btn" @click.stop="chief.askAboutAlert(alert)">Ask CHIEF</button>
    </div>
    <div v-if="expanded" class="recs" @click.stop>
      <div v-if="!state || state.state === 'loading'" class="loading">
        <Capsule state="thinking" :size="20" />CHIEF is preparing recommended actions…
      </div>
      <div v-else-if="state.state === 'error'" class="loading">
        Could not reach CHIEF: {{ state.message }}
        <button class="link-btn" @click="chief.loadActions(alert, true)">Retry</button>
      </div>
      <template v-else>
        <div class="rec-title label">
          <Capsule :state="state.data.fallback ? 'offline' : 'idle'" :size="20" />{{
            state.data.fallback
              ? 'Standard recommendations · CHIEF offline'
              : 'CHIEF · recommended actions'
          }}
        </div>
        <p class="summary">{{ state.data.summary }}</p>
        <ActionList :actions="state.data.actions" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.alert {
  flex: none;
  background: var(--panel-2);
  padding: 10px 12px 10px 15px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition:
    background 400ms ease,
    border-color 400ms ease;
}
.alert:hover {
  border-color: var(--border-2);
}
.alert.hl {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, var(--panel-2));
  animation: chSlide 260ms ease-out;
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.spacer {
  flex: 1;
}
.new {
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.06em;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--accent);
  color: var(--on-accent);
}
.title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}
.acked .title {
  color: var(--text-2);
}
.detail {
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.45;
}
.meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--text-3);
}
.state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-3);
}
.state.active {
  color: var(--text-1);
}
.ring {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1.5px solid var(--text-1);
}
.recs {
  border-top: 1px solid var(--border);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: default;
  animation: chOpen 180ms ease;
}
.loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
}
.rec-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
}
.summary {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}
</style>
