<script setup lang="ts">
import type { Trend } from '@chief/shared';
import { STATUS_COLOR, type UiStatus } from '../lib/status';
import Icon from './Icon.vue';
import StatusChip from './StatusChip.vue';

defineProps<{
  label: string;
  value: string;
  unit: string;
  status: UiStatus;
  trend?: Trend | null;
  /** Text next to the trend arrow, e.g. "+13 / 7 d" or "Rising". */
  note?: string;
  /** "Simulated" or "Measured". */
  source?: string;
  big?: boolean;
  clickable?: boolean;
}>();
defineEmits<{ open: [] }>();

const TREND_ICON = { rising: 'up', falling: 'down', stable: 'flat' } as const;
</script>

<template>
  <div class="card metric" :class="{ clickable }" @click="$emit('open')">
    <div class="bar" :style="{ background: STATUS_COLOR[status] }" />
    <div class="row">
      <span class="label ellipsis">{{ label }}</span>
      <span v-if="source" class="src">{{ source }}</span>
    </div>
    <div class="value mono">
      <span :key="value" class="num" :class="{ big, empty: value === '—' }">{{ value }}</span>
      <span class="unit">{{ unit }}</span>
    </div>
    <div class="row">
      <StatusChip :status="status" plain />
      <span v-if="trend || note" class="trend mono">
        <Icon v-if="trend" :name="TREND_ICON[trend]" :size="13" />{{ note }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.metric {
  padding: 10px 12px 10px 15px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.clickable {
  cursor: pointer;
}
.clickable:hover {
  border-color: var(--border-2);
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.src {
  font-size: 10px;
  font-weight: 500;
  padding: 1px 6px;
  border: 1px solid var(--border-2);
  border-radius: 3px;
  color: var(--text-2);
  white-space: nowrap;
}
.value {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.num {
  font-size: 24px;
  font-weight: 500;
  line-height: 1.1;
  animation: chFade 0.6s ease;
}
.num.big {
  font-size: 26px;
}
.num.empty {
  color: var(--text-2);
}
.unit {
  font-size: 12px;
  color: var(--text-3);
}
.trend {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--text-2);
  white-space: nowrap;
}
</style>
