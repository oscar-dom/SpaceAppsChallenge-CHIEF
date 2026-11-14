<script setup lang="ts">
import type { EscalationLevel } from '@chief/shared';
import { ESCALATION } from '../lib/status';
import Icon from './Icon.vue';

defineProps<{ level: EscalationLevel }>();
</script>

<template>
  <span class="esc" :class="ESCALATION[level].variant">
    <Icon :name="ESCALATION[level].icon" :size="12" :stroke="1.8" />{{ ESCALATION[level].label }}
  </span>
</template>

<style scoped>
.esc {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--border-2);
  white-space: nowrap;
}
.outline {
  color: var(--text-2);
}
.filled {
  background: var(--panel-3);
  color: var(--text-1);
}
/* The flight-surgeon chip is the only inverse element in the UI. */
.inverse {
  border-color: var(--text-1);
  background: var(--text-1);
  color: var(--bg);
  font-weight: 600;
}
</style>
