<script setup lang="ts">
import type { BodySystemId, Period, Trend } from '@chief/shared';
import { computed } from 'vue';
import MetricCard from '../components/MetricCard.vue';
import MetricChart from '../components/MetricChart.vue';
import { fmt } from '../lib/format';
import { useMissionStore } from '../stores/mission';

/** Screen C: metric cards and one chart per metric of a body system. */
const props = defineProps<{ system: BodySystemId; period: Period; paneId: string }>();
const mission = useMissionStore();

const TREND_LABEL: Record<Trend, string> = {
  rising: 'Rising',
  falling: 'Falling',
  stable: 'Stable',
};

const sys = computed(() => mission.system(mission.selected, props.system));
const now = computed(() => (mission.clock ? Date.parse(mission.clock.missionTime) : Date.now()));
const refreshKey = computed(() => mission.health[mission.selected]?.computedAt ?? '');
</script>

<template>
  <div class="dash">
    <div class="cards">
      <MetricCard
        v-for="m in sys.metrics"
        :key="m.metric.id"
        :label="m.metric.name"
        :value="fmt(m.metric, m.latest?.value)"
        :unit="m.metric.unit"
        :status="m.ui"
        :trend="m.latest ? m.trend : null"
        :note="m.latest ? TREND_LABEL[m.trend] : 'No reading'"
        :source="m.latest ? (m.latest.simulated ? 'Simulated' : 'Measured') : undefined"
      />
    </div>
    <MetricChart
      v-for="m in sys.metrics"
      :key="`${paneId}-${m.metric.id}`"
      :crew-id="mission.selected"
      :metric="m.metric"
      :threshold="m.threshold"
      :period="period"
      :status="m.ui"
      :now="now"
      :start="mission.start"
      :refresh-key="refreshKey"
    />
    <p v-if="!sys.metrics.length" class="faint empty">No metrics for this system yet.</p>
  </div>
</template>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 8px;
}
.empty {
  text-align: center;
  padding: 24px;
}
</style>
