<script setup lang="ts">
import type { RecommendedAction } from '@chief/shared';
import { ACTION_CATEGORY } from '../lib/status';
import EscalationChip from './EscalationChip.vue';
import Icon from './Icon.vue';

/** CHIEF's recommended actions, each with its category and escalation level. */
defineProps<{ actions: RecommendedAction[] }>();
</script>

<template>
  <div class="actions">
    <div v-for="(a, i) in actions" :key="i" class="action">
      <Icon :name="ACTION_CATEGORY[a.category].icon" :size="16" class="faint-icon" />
      <div class="body">
        <span class="cat">{{ ACTION_CATEGORY[a.category].label }}</span>
        <span class="title">{{ a.title }}</span>
        <span v-if="a.description" class="desc">{{ a.description }}</span>
        <EscalationChip :level="a.escalation" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
}
.action {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid var(--border);
}
.faint-icon {
  color: var(--text-2);
  margin-top: 1px;
}
.body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.cat {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-3);
}
.title {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}
.desc {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-2);
}
</style>
