<script setup lang="ts">
import { computed } from 'vue';
import { STATUS_COLOR, STATUS_LABEL, statusText, statusTint, type UiStatus } from '../lib/status';

/** Status shown with dot + label (never colour alone). `plain` drops the tinted background. */
const props = defineProps<{ status: UiStatus | 'info'; text?: string; plain?: boolean }>();

const style = computed(() => ({
  color: statusText(props.status),
  background: props.plain ? 'transparent' : statusTint(props.status),
  padding: props.plain ? '0' : '0 8px',
}));
</script>

<template>
  <span class="chip" :style="style">
    <span class="dot" :style="{ background: STATUS_COLOR[status] }" />{{
      text ?? STATUS_LABEL[status]
    }}
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
}
</style>
