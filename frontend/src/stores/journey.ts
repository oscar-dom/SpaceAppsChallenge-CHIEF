import type {
  InventoryHistory,
  InventoryStock,
  Journey,
  JourneyStage,
  StageInventory,
} from '@chief/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../api/client';
import { DAY_MS } from '../lib/format';
import { routeHazards, routeResupplies, stageAt, stageState } from '../lib/journey';
import { useMissionStore } from './mission';

/**
 * JOURNEY data: the mission route, the ship's stock with each item's history, and the stage
 * inventories already opened. The route itself is fixed; CHIEF's position and each stage's
 * state follow the live mission clock. Stock changes arrive over Socket.IO.
 */
export const useJourneyStore = defineStore('journey', () => {
  const mission = useMissionStore();
  const journey = ref<Journey | null>(null);
  const stocks = ref<InventoryStock[]>([]);
  const histories = ref<Record<string, InventoryHistory>>({});
  const stageCache = ref<Record<number, StageInventory>>({});
  const loading = ref(false);
  const error = ref<string | null>(null);
  let historyTimer: ReturnType<typeof setTimeout> | undefined;

  /** Mission day with its fraction, from the live clock. */
  const day = computed(() => {
    const t = mission.clock ? Date.parse(mission.clock.missionTime) : NaN;
    if (!mission.start || Number.isNaN(t)) return journey.value?.missionDay ?? 1;
    return (t - mission.start) / DAY_MS + 1;
  });
  /** Whole mission day (1-based), as the rest of the app shows it. */
  const today = computed(() => Math.floor(day.value));

  const stages = computed<JourneyStage[]>(() =>
    (journey.value?.stages ?? []).map((s) => {
      const len = s.endDay - s.startDay + 1;
      const progress = Math.min(1, Math.max(0, (day.value - s.startDay) / len));
      return { ...s, state: stageState(s, day.value), progress };
    }),
  );
  const current = computed(() => stageAt(stages.value, day.value));
  const lengthDays = computed(() => journey.value?.missionLengthDays ?? 180);
  const hazards = computed(() => routeHazards(stages.value));
  const resupplies = computed(() => routeResupplies(stages.value));
  const flagged = computed(() => stocks.value.filter((s) => s.status !== 'nominal'));
  const stockById = computed(() => new Map(stocks.value.map((s) => [s.item.id, s])));

  async function loadHistories() {
    const list = await Promise.all(stocks.value.map((s) => api.inventoryHistory(s.item.id)));
    histories.value = Object.fromEntries(list.map((h) => [h.item.id, h]));
  }

  async function load() {
    if (loading.value) return;
    loading.value = true;
    try {
      const [j, s] = await Promise.all([api.journey(), api.inventory()]);
      journey.value = j;
      stocks.value = s;
      await loadHistories();
      error.value = null;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function stageInventory(index: number, refresh = false): Promise<StageInventory | null> {
    if (!refresh && stageCache.value[index]) return stageCache.value[index];
    try {
      const inv = await api.stageInventory(index);
      stageCache.value = { ...stageCache.value, [index]: inv };
      return inv;
    } catch {
      return stageCache.value[index] ?? null;
    }
  }

  /** New stock from the backend (end of a mission day, a cargo ship, a crew adjustment). */
  function stockUpdated(next: InventoryStock[]) {
    stocks.value = next;
    // Stage figures and histories changed too: re-read them, once, after a burst of events.
    stageCache.value = {};
    clearTimeout(historyTimer);
    historyTimer = setTimeout(() => void loadHistories().catch(() => undefined), 500);
  }

  async function adjust(itemId: string, delta: number, note: string, crewMemberId: string) {
    const stock = await api.adjustInventory(itemId, {
      delta,
      note: note.trim() || undefined,
      crewMemberId,
    });
    stocks.value = stocks.value.map((s) => (s.item.id === itemId ? stock : s));
    histories.value = { ...histories.value, [itemId]: await api.inventoryHistory(itemId) };
    stageCache.value = {};
    return stock;
  }

  return {
    journey,
    stocks,
    histories,
    stageCache,
    loading,
    error,
    day,
    today,
    stages,
    current,
    lengthDays,
    hazards,
    resupplies,
    flagged,
    stockById,
    load,
    stageInventory,
    stockUpdated,
    adjust,
  };
});
