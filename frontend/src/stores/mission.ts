import type {
  Alert,
  BodySystemId,
  ClientToServerEvents,
  CrewMember,
  HealthScore,
  Metric,
  MetricStatus,
  MissionClock,
  ServerToClientEvents,
  Threshold,
} from '@chief/shared';
import { defineStore } from 'pinia';
import { io, type Socket } from 'socket.io-client';
import { computed, ref, shallowRef } from 'vue';
import { api } from '../api/client';
import { fmt, missionStart } from '../lib/format';
import { SEVERITY_RANK, type UiStatus, worst } from '../lib/status';

type LiveSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Evaluated state of one metric with the UI's view of "no threshold". */
export interface UiMetric extends MetricStatus {
  ui: UiStatus;
  threshold?: Threshold;
}

export interface UiSystem {
  system: BodySystemId;
  status: UiStatus;
  score: number | null;
  metrics: UiMetric[];
  /** Short description of the metric driving the system status. */
  driver: string;
}

/** How many health score samples to keep per crew member for the overview sparkline. */
const HISTORY_LIMIT = 240;

/**
 * Data that comes from the backend: crew, catalog, thresholds, health scores, alerts and the
 * mission clock, kept live over Socket.IO. One socket per crew member, because the backend
 * sends each crew member's readings, health and alerts only to the room of that member.
 */
export const useMissionStore = defineStore('mission', () => {
  const crew = ref<CrewMember[]>([]);
  const metrics = ref<Metric[]>([]);
  const thresholds = ref<Map<string, Threshold>>(new Map());
  const health = ref<Record<string, HealthScore>>({});
  const alerts = ref<Record<string, Alert[]>>({});
  const clock = ref<MissionClock | null>(null);
  const selected = ref<string>('');
  const scoreHistory = ref<Record<string, { t: string; score: number }[]>>({});
  const connected = ref(false);
  const loadError = ref<string | null>(null);
  const loaded = ref(false);
  const sockets = shallowRef<LiveSocket[]>([]);

  /** Called with every alert the backend raises while the app is open. */
  let onNewAlert: (alert: Alert) => void = () => {};
  const refetchTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const member = computed(() => crew.value.find((c) => c.id === selected.value) ?? crew.value[0]);
  const start = computed(() => (clock.value ? missionStart(clock.value) : 0));
  const metricById = computed(() => new Map(metrics.value.map((m) => [m.id, m])));

  const allAlerts = computed(() => Object.values(alerts.value).flat());
  const anomalies = computed(() =>
    allAlerts.value
      .filter((a) => a.kind === 'anomaly')
      .sort(
        (a, b) =>
          SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
          b.createdAt.localeCompare(a.createdAt),
      ),
  );
  const tasks = computed(() =>
    allAlerts.value
      .filter((a) => a.kind === 'scheduled')
      .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? '')),
  );

  function memberName(id: string): string {
    return crew.value.find((c) => c.id === id)?.name ?? id;
  }

  function uiMetric(m: MetricStatus): UiMetric {
    const threshold = thresholds.value.get(m.metric.id);
    const ui: UiStatus = !threshold ? 'none' : m.latest ? m.status : 'nodata';
    return { ...m, ui, threshold };
  }

  /** A body system of a crew member, with "no data" and "charted only" applied. */
  function system(crewId: string, id: BodySystemId): UiSystem {
    const s = health.value[crewId]?.systems.find((x) => x.system === id);
    if (!s) return { system: id, status: 'nodata', score: null, metrics: [], driver: 'No data' };
    const list = s.metrics.map(uiMetric);
    const scored = list.filter((m) => m.ui !== 'none');
    const status = scored.length ? worst(scored.map((m) => m.ui)) : 'none';
    const driverMetric =
      scored.find((m) => m.ui === status && status !== 'nominal') ?? scored[0] ?? list[0];
    const driver = driverMetric
      ? driverMetric.latest
        ? `${driverMetric.metric.name} ${formatValue(driverMetric)}`
        : `${driverMetric.metric.name}: no reading`
      : 'No metrics';
    return { system: id, status, score: scored.length ? s.score : null, metrics: list, driver };
  }

  function metricStatus(crewId: string, metricId: string): UiMetric | undefined {
    for (const s of health.value[crewId]?.systems ?? []) {
      const m = s.metrics.find((x) => x.metric.id === metricId);
      if (m) return uiMetric(m);
    }
    return undefined;
  }

  function formatValue(m: UiMetric): string {
    return `${fmt(m.metric, m.latest?.value)} ${m.metric.unit}`.trim();
  }

  function setHealth(h: HealthScore) {
    health.value = { ...health.value, [h.crewMemberId]: h };
    const list = scoreHistory.value[h.crewMemberId] ?? [];
    const last = list[list.length - 1];
    if (!last || last.t !== h.computedAt) {
      scoreHistory.value = {
        ...scoreHistory.value,
        [h.crewMemberId]: [...list, { t: h.computedAt, score: h.score }].slice(-HISTORY_LIMIT),
      };
    }
  }

  function upsertAlert(a: Alert) {
    const list = alerts.value[a.crewMemberId] ?? [];
    const i = list.findIndex((x) => x.id === a.id);
    const next = i >= 0 ? list.map((x) => (x.id === a.id ? a : x)) : [a, ...list];
    alerts.value = { ...alerts.value, [a.crewMemberId]: next };
  }

  /** Resolved alerts arrive once as acknowledged and then leave the list: re-read it. */
  function refetchAlerts(crewId: string) {
    clearTimeout(refetchTimers.get(crewId));
    refetchTimers.set(
      crewId,
      setTimeout(async () => {
        try {
          alerts.value = { ...alerts.value, [crewId]: await api.alerts(crewId) };
        } catch {
          // Keep the last list; the next event retries.
        }
      }, 400),
    );
  }

  function connect() {
    sockets.value.forEach((s) => s.close());
    sockets.value = crew.value.map((c, i) => {
      const socket: LiveSocket = io({ forceNew: true, transports: ['websocket'] });
      socket.on('connect', () => {
        socket.emit('crew:select', c.id);
        if (i === 0) connected.value = true;
      });
      socket.on('disconnect', () => {
        if (i === 0) connected.value = false;
      });
      if (i === 0) socket.on('mission:clock', (value) => (clock.value = value));
      socket.on('health:updated', setHealth);
      socket.on('alert:new', (a) => {
        upsertAlert(a);
        onNewAlert(a);
        refetchAlerts(a.crewMemberId);
      });
      socket.on('alert:updated', (a) => {
        upsertAlert(a);
        refetchAlerts(a.crewMemberId);
      });
      return socket;
    });
  }

  async function init(handlers: { onNewAlert: (a: Alert) => void }) {
    onNewAlert = handlers.onNewAlert;
    try {
      const [c, m, t, k] = await Promise.all([
        api.crew(),
        api.metrics(),
        api.thresholds(),
        api.clock(),
      ]);
      crew.value = c;
      metrics.value = m;
      thresholds.value = new Map(t.map((x) => [x.metricId, x]));
      clock.value = k;
      selected.value = selected.value || c[0]?.id || '';
      const [healths, lists] = await Promise.all([
        Promise.all(c.map((x) => api.health(x.id))),
        Promise.all(c.map((x) => api.alerts(x.id))),
      ]);
      healths.forEach(setHealth);
      alerts.value = Object.fromEntries(c.map((x, i) => [x.id, lists[i] ?? []]));
      loaded.value = true;
      loadError.value = null;
      connect();
    } catch (error) {
      loadError.value = (error as Error).message;
    }
  }

  async function acknowledge(alertId: string) {
    upsertAlert(await api.acknowledge(alertId));
  }

  return {
    crew,
    metrics,
    thresholds,
    health,
    alerts,
    clock,
    selected,
    scoreHistory,
    connected,
    loadError,
    loaded,
    member,
    start,
    metricById,
    allAlerts,
    anomalies,
    tasks,
    memberName,
    system,
    metricStatus,
    init,
    acknowledge,
  };
});
