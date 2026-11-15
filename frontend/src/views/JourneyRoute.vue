<script setup lang="ts">
import type { Hazard, InventoryItem, Resupply, StageInventory } from '@chief/shared';
import { computed, ref, watch } from 'vue';
import Capsule from '../components/Capsule.vue';
import Icon from '../components/Icon.vue';
import type { IconName } from '../lib/icons';
import {
  at,
  dayText,
  forecast,
  hazardStatus,
  hazardWhen,
  MAP_H,
  MAP_W,
  pct,
  qty,
  routePath,
  stageAt,
  vehicleName,
} from '../lib/journey';
import { useJourneyStore } from '../stores/journey';

/**
 * JOURNEY · Mission route. The 180-day mission drawn as a path in 10 stages with CHIEF as the
 * ship, the hazards to prepare for and the cargo ships. Clicking a stage opens what the
 * inventory did in it (a forecast for stages not reached yet).
 */
const journey = useJourneyStore();

const sel = ref<number | null>(null);
const pin = ref<string | null>(null);
const hover = ref<string | null>(null);
const active = computed(() => pin.value ?? hover.value);

const day = computed(() => journey.day);
const stages = computed(() => journey.stages);
const cur = computed(() => journey.current);
const saa = computed(() => journey.hazards.saa);
const hazards = computed(() => journey.hazards.hazards);
const resupplies = computed(() => journey.resupplies);

/** Colours of hazards on the navy map (status hues tuned for the dark background). */
const MAP_SEV = { caution: '#ffb020', critical: '#ff4a3d' } as const;
const sevVar = (s: Hazard['severity']) => (s === 'critical' ? 'var(--critical)' : 'var(--caution)');
const tint = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const hazardIcon = (h: Hazard): IconName =>
  h.kind === 'radiation' ? 'hazardRadiation' : 'thermal';

/** Labels sit above odd stages and below even ones; markers go on the other side. */
const side = (index: number) => (index % 2 ? 1 : -1);
const stageOf = (d: number) => stageAt(stages.value, d)?.index ?? 1;
const segEnd = (endDay: number) => Math.min(journey.lengthDays, endDay + 1);
const xy = (p: [number, number]) => ({ x: p[0].toFixed(1), y: p[1].toFixed(1) });

const STARS = (() => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 70 }, () => {
    const big = rnd() > 0.85;
    return {
      x: (rnd() * MAP_W).toFixed(1),
      y: (rnd() * MAP_H).toFixed(1),
      r: (big ? 1.3 + rnd() * 0.6 : 0.6 + rnd() * 0.6).toFixed(2),
      o: (big ? 0.35 + rnd() * 0.15 : 0.18 + rnd() * 0.2).toFixed(2),
    };
  });
})();

const map = computed(() => {
  const c = cur.value;
  const s = sel.value ? stages.value.find((x) => x.index === sel.value) : null;
  const end = at(journey.lengthDays);
  return {
    toGo: routePath(1, journey.lengthDays),
    done: routePath(1, Math.min(day.value, journey.lengthDays)),
    cur: c ? routePath(c.startDay, segEnd(c.endDay)) : '',
    sel: s ? routePath(s.startDay, segEnd(s.endDay)) : '',
    saa: routePath(1, journey.lengthDays, -11),
    ticks: stages.value.slice(1).map((st) => {
      const a = xy(at(st.startDay, 9));
      const b = xy(at(st.startDay, -9));
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }),
    bands: hazards.value.map((h) => {
      let a = h.startDay;
      let b = h.endDay;
      if (b - a < 2) {
        const mid = (a + b) / 2;
        a = mid - 1;
        b = mid + 1;
      }
      const passed = h.endDay < day.value;
      const rad = h.kind === 'radiation';
      return {
        id: h.id,
        d: routePath(a, b),
        color: MAP_SEV[h.severity],
        width: rad ? 14 : 12,
        dash: rad ? '1.6 2.6' : 'none',
        cap: (rad ? 'butt' : 'round') as 'butt' | 'round',
        opacity: rad ? (passed ? 0.55 : 1) : passed ? 0.32 : 0.62,
      };
    }),
    end: xy(end),
  };
});

interface Marker {
  id: string;
  title: string;
  p: [number, number];
  pos: { left: string; top: string };
  leader: { x1: string; y1: string; x2: string; y2: string } | null;
  size: number;
  round: boolean;
  color: string;
  bg: string;
  opacity: number;
  pulse: boolean;
  icon: IconName;
  note: string;
  hazard?: Hazard;
  resupply?: Resupply;
}

function placed(d: number, saaMarker = false) {
  const off = -side(stageOf(d)) * 34;
  const p = at(d, off);
  const a = xy(at(d, 0));
  const b = xy(at(d, off > 0 ? off - 12 : off + 12));
  return { p, pos: pct(p), leader: saaMarker ? null : { x1: a.x, y1: a.y, x2: b.x, y2: b.y } };
}

const markers = computed<Marker[]>(() => {
  const list: Marker[] = [];
  const all = [...(saa.value ? [saa.value] : []), ...hazards.value];
  for (const h of all) {
    const isSaa = h.id === 'south-atlantic-anomaly';
    const passed = !isSaa && h.endDay < day.value;
    const color = MAP_SEV[h.severity];
    list.push({
      id: h.id,
      title: h.title,
      ...placed(isSaa ? 5 : (h.startDay + h.endDay) / 2, isSaa),
      size: isSaa ? 20 : 26,
      round: true,
      color,
      bg: `color-mix(in srgb, ${color} 26%, var(--chrome))`,
      opacity: isSaa ? 0.9 : passed ? 0.7 : 1,
      pulse: !isSaa && !passed && h.severity === 'critical',
      icon: hazardIcon(h),
      note: isSaa ? 'SAA · daily' : '',
      hazard: h,
    });
  }
  for (const r of resupplies.value) {
    list.push({
      id: r.id,
      title: vehicleName(r.vehicle),
      ...placed(r.day),
      size: 26,
      round: false,
      color: 'var(--chrome-text)',
      bg: 'var(--chrome-2)',
      opacity: r.day < day.value ? 0.6 : 1,
      pulse: false,
      icon: 'inventory',
      note: '',
      resupply: r,
    });
  }
  return list;
});

const nodes = computed(() =>
  stages.value.map((s) => {
    const isCur = s.index === cur.value?.index;
    const lit = s.state === 'done' || isCur;
    return {
      index: s.index,
      pos: pct(at(s.startDay)),
      tip: `${s.index} · ${s.title} · Days ${s.startDay}–${s.endDay}`,
      cur: isCur,
      lit,
      sel: sel.value === s.index,
    };
  }),
);

const labels = computed(() =>
  stages.value.map((s) => {
    const sd = side(s.index);
    const mid = (s.startDay + segEnd(s.endDay)) / 2;
    return {
      index: s.index,
      pos: pct(at(mid, sd * 54)),
      above: sd > 0,
      title: `${s.index} · ${s.title}`,
      days: `MD ${s.startDay}–${s.endDay}`,
      cur: s.index === cur.value?.index,
      upcoming: s.state === 'upcoming',
      sel: sel.value === s.index,
    };
  }),
);

const chiefPos = computed(() => pct(at(Math.min(day.value, journey.lengthDays))));
const curDay = computed(() => {
  const c = cur.value;
  if (!c) return { dayOf: 0, len: 0, pct: '0%' };
  const len = c.endDay - c.startDay + 1;
  const dayOf = Math.min(len, Math.floor(day.value) - c.startDay + 1);
  return { dayOf, len, pct: `${Math.round((dayOf / len) * 100)}%` };
});

const itemOf = (id: string): InventoryItem | undefined => journey.stockById.get(id)?.item;

const popover = computed(() => {
  const m = markers.value.find((x) => x.id === active.value);
  if (!m) return null;
  const xr = m.p[0] / MAP_W;
  const yr = m.p[1] / MAP_H;
  const pos = {
    left: xr < 0.62 ? `calc(${(xr * 100).toFixed(2)}% - 22px)` : 'auto',
    right: xr < 0.62 ? 'auto' : `calc(${(100 - xr * 100).toFixed(2)}% - 22px)`,
    top: `calc(${(yr * 100).toFixed(2)}% + 20px)`,
  };
  if (m.hazard) {
    const h = m.hazard;
    const c = sevVar(h.severity);
    const status = hazardStatus(h, day.value);
    return {
      pos,
      pinned: pin.value === h.id,
      bar: c,
      icon: hazardIcon(h),
      iconColor: c,
      kind: h.kind === 'radiation' ? 'Radiation' : 'Thermal',
      sev: h.severity,
      chipBg: tint(c, 14),
      title: h.title,
      when: hazardWhen(h),
      status,
      statusColor: status === 'Active now' ? c : 'var(--text-2)',
      effect: h.effect,
      prep: h.preparation,
      cargo: null,
      simLabel: h.simulated ? 'Simulated timing' : 'Real event data',
      source: h.source,
    };
  }
  const r = m.resupply!;
  return {
    pos,
    pinned: pin.value === r.id,
    bar: 'var(--text-3)',
    icon: 'inventory' as IconName,
    iconColor: 'var(--text-2)',
    kind: 'Cargo ship',
    sev: null,
    chipBg: '',
    title: vehicleName(r.vehicle),
    when: `Docks MD ${r.day}`,
    status: r.day < day.value ? 'Delivered' : `In ${Math.ceil(r.day - day.value)} days`,
    statusColor: 'var(--text-2)',
    effect: null,
    prep: null,
    cargo: r.cargo.map((c) => {
      const it = itemOf(c.itemId);
      return { name: it?.name ?? c.itemId, qty: c.quantity, unit: it?.unit ?? '' };
    }),
    simLabel: r.simulated ? 'Simulated flight' : 'Scheduled flight',
    source: r.source,
  };
});

function togglePin(id: string) {
  pin.value = pin.value === id ? null : id;
}
function selectStage(index: number) {
  sel.value = index;
  pin.value = null;
}

const stats = computed(() => {
  const c = cur.value;
  const nh = hazards.value.find((h) => h.startDay > day.value);
  const nr = resupplies.value.find((r) => r.day > day.value);
  return {
    progress: `${Math.min(100, (day.value / journey.lengthDays) * 100).toFixed(1)}%`,
    toReturn: Math.max(0, journey.lengthDays - journey.today),
    cur: c,
    hazard: nh
      ? {
          id: nh.id,
          title: nh.title,
          icon: hazardIcon(nh),
          color: sevVar(nh.severity),
          bg: tint(sevVar(nh.severity), 14),
          sev: nh.severity,
          when: `MD ${dayText(nh.startDay)}–${dayText(nh.endDay)} · in ${Math.ceil(nh.startDay - day.value)} d`,
        }
      : null,
    resupply: nr
      ? {
          id: nr.id,
          name: vehicleName(nr.vehicle),
          when: `MD ${nr.day} · in ${Math.ceil(nr.day - day.value)} d · ${nr.cargo.length} items`,
        }
      : null,
  };
});

const curHazards = computed(() => {
  const c = cur.value;
  if (!c) return [];
  const list = [...c.hazards.filter((h) => h.id !== 'south-atlantic-anomaly')];
  if (saa.value) list.push(saa.value);
  return list.map((h) => ({
    id: h.id,
    title: h.title,
    icon: hazardIcon(h),
    color: sevVar(h.severity),
    bg: tint(sevVar(h.severity), 14),
    sev: h.severity,
    when: hazardWhen(h),
    status: hazardStatus(h, day.value),
  }));
});

const upcoming = computed(() => {
  const events = [
    ...hazards.value.filter((h) => h.startDay > day.value).map((h) => ({ d: h.startDay, h })),
    ...resupplies.value.filter((r) => r.day > day.value).map((r) => ({ d: r.day, r })),
  ]
    .sort((a, b) => a.d - b.d)
    .slice(0, 5);
  return events.map((e) => {
    const inDays = `in ${Math.ceil(e.d - day.value)} d`;
    if ('h' in e) {
      const h = e.h;
      return {
        id: h.id,
        title: h.title,
        sub: `${h.kind === 'radiation' ? 'Radiation' : 'Thermal'} · stage ${stageOf(h.startDay)}`,
        icon: hazardIcon(h),
        color: sevVar(h.severity),
        bg: tint(sevVar(h.severity), 14),
        tag: h.severity,
        when: `MD ${dayText(h.startDay)}–${dayText(h.endDay)}`,
        inDays,
      };
    }
    const r = e.r;
    return {
      id: r.id,
      title: vehicleName(r.vehicle),
      sub: `Cargo · ${r.cargo.length} items`,
      icon: 'inventory' as IconName,
      color: 'var(--text-2)',
      bg: 'var(--panel-3)',
      tag: 'resupply',
      when: `MD ${r.day}`,
      inDays,
    };
  });
});

// --- stage drawer ---------------------------------------------------------------------------------

const stageInv = ref<StageInventory | null>(null);
watch(
  [sel, () => journey.stageCache],
  async ([index]) => {
    stageInv.value = index ? await journey.stageInventory(index) : null;
  },
  { immediate: true },
);

const CATEGORIES = [
  ['food', 'Food'],
  ['water', 'Water'],
  ['medication', 'Medication'],
] as const;

const drawer = computed(() => {
  const s = sel.value ? stages.value.find((x) => x.index === sel.value) : null;
  if (!s) return null;
  const up = s.state === 'upcoming';
  const isCur = s.state === 'current';
  const inv = stageInv.value?.stage.index === s.index ? stageInv.value : null;
  const rows = (inv?.items ?? []).map((u) => {
    const stock = journey.stockById.get(u.item.id);
    const fc = stock ? forecast(stock, resupplies.value, journey.today) : null;
    const it = u.item;
    const start = up ? (fc?.get(s.startDay - 1) ?? null) : u.startQuantity;
    const end = up || isCur ? (fc?.get(s.endDay) ?? u.endQuantity) : u.endQuantity;
    const cell = (
      v: number | null,
      projected: boolean,
      kind: 'plain' | 'zero' | 'plus' | 'signed' = 'plain',
    ) => {
      let text = qty(it, v, projected);
      if ((kind === 'zero' || kind === 'plus' || kind === 'signed') && (!v || Math.abs(v) < 1e-9))
        text = '—';
      else if (kind === 'plus' && v && v > 0) text = `+${text}`;
      else if (kind === 'signed' && v)
        text = `${v > 0 ? '+' : '−'}${qty(it, Math.abs(v), projected)}`;
      if (projected && text !== '—') text = `≈${text}`;
      return { text, projected };
    };
    return {
      id: it.id,
      category: it.category,
      name: it.name,
      unit: it.unit,
      cells: [
        cell(start, up),
        cell(u.consumed, up),
        cell(u.recovered, up, 'zero'),
        cell(u.resupplied, up, 'plus'),
        cell(u.adjusted, up, 'signed'),
        cell(end, up || isCur),
      ],
    };
  });
  return {
    stage: s,
    len: s.endDay - s.startDay + 1,
    tag: up ? 'Forecast' : isCur ? 'In progress' : 'Completed',
    kind: up ? 'forecast' : isCur ? 'current' : 'done',
    note: up
      ? 'Figures are a forecast from the recent burn rate and the planned cargo.'
      : isCur
        ? `Real figures to MD ${journey.today}; the end of the stage is a forecast.`
        : 'Recorded figures.',
    endLabel: up || isCur ? 'End (forecast)' : 'End',
    events: [
      ...s.hazards
        .filter((h) => h.id !== 'south-atlantic-anomaly')
        .map((h) => ({
          id: h.id,
          label: h.title.replace(': constant sunlight', ''),
          icon: hazardIcon(h),
          color: sevVar(h.severity),
        })),
      ...s.resupplies.map((r) => ({
        id: r.id,
        label: `${vehicleName(r.vehicle)} · MD ${r.day}`,
        icon: 'inventory' as IconName,
        color: 'var(--text-2)',
      })),
    ],
    loading: !inv,
    groups: CATEGORIES.map(([k, label]) => ({
      label,
      rows: rows.filter((r) => r.category === k),
    })).filter((g) => g.rows.length),
    foot: up
      ? '≈ Forecast: start of stage projected from today’s count, use at the recent daily rate, deliveries from the cargo manifest.'
      : 'Reclaimed applies to water only (98% recovered). Adjusted are crew recounts.',
  };
});

const sevLabel = (s: string) => s.toUpperCase();
</script>

<template>
  <div class="route">
    <p v-if="!journey.journey" class="muted loading">
      {{
        journey.error ? `Cannot load the mission route: ${journey.error}` : 'Loading mission data…'
      }}
    </p>

    <template v-else>
      <section class="card map-card">
        <div class="stats">
          <div class="stat">
            <span class="label">Mission day</span>
            <span class="stat-line">
              <span class="mono big">{{ String(journey.today).padStart(3, '0') }}</span>
              <span class="mono faint">/ {{ journey.lengthDays }}</span>
              <span class="mono muted push">{{ stats.progress }}</span>
            </span>
            <span class="bar"><span :style="{ width: stats.progress }" /></span>
            <span class="small faint">{{ stats.toReturn }} days to return</span>
          </div>
          <button v-if="stats.cur" class="stat" @click="selectStage(stats.cur.index)">
            <span class="label">Current stage</span>
            <span class="stat-title">{{ stats.cur.index }} · {{ stats.cur.title }}</span>
            <span class="bar"><span :style="{ width: curDay.pct }" /></span>
            <span class="small faint mono"
              >Day {{ curDay.dayOf }} of {{ curDay.len }} · MD {{ stats.cur.startDay }}–{{
                stats.cur.endDay
              }}</span
            >
          </button>
          <button v-if="stats.hazard" class="stat" @click="togglePin(stats.hazard.id)">
            <span class="label">Next hazard</span>
            <span class="stat-title with-icon">
              <span :style="{ color: stats.hazard.color }"
                ><Icon :name="stats.hazard.icon" :size="15" :stroke="1.9"
              /></span>
              <span class="ellipsis">{{ stats.hazard.title }}</span>
            </span>
            <span class="stat-line">
              <span class="chip" :style="{ background: stats.hazard.bg, color: stats.hazard.color }"
                ><i :style="{ background: stats.hazard.color }" />{{
                  sevLabel(stats.hazard.sev)
                }}</span
              >
              <span class="small faint mono">{{ stats.hazard.when }}</span>
            </span>
          </button>
          <div v-else class="stat">
            <span class="label">Next hazard</span>
            <span class="stat-title">None ahead</span>
          </div>
          <button v-if="stats.resupply" class="stat" @click="togglePin(stats.resupply.id)">
            <span class="label">Next resupply</span>
            <span class="stat-title with-icon"
              ><Icon name="inventory" :size="15" />{{ stats.resupply.name }}</span
            >
            <span class="small faint mono">{{ stats.resupply.when }}</span>
          </button>
          <div v-else class="stat">
            <span class="label">Next resupply</span>
            <span class="stat-title">None planned</span>
          </div>
        </div>

        <div class="map">
          <svg :viewBox="`0 0 ${MAP_W} ${MAP_H}`" class="map-svg" aria-hidden="true">
            <circle
              v-for="(s, i) in STARS"
              :key="i"
              :cx="s.x"
              :cy="s.y"
              :r="s.r"
              :style="{ opacity: s.o }"
              class="star"
            />
            <path :d="map.saa" class="saa" />
            <path :d="map.cur" class="cur-glow" />
            <path v-if="map.sel" :d="map.sel" class="sel-glow" />
            <line v-for="(t, i) in map.ticks" :key="`t${i}`" v-bind="t" class="tick" />
            <path :d="map.toGo" class="to-go" />
            <path
              v-for="b in map.bands"
              :key="b.id"
              :d="b.d"
              class="band"
              :style="{
                stroke: b.color,
                strokeWidth: b.width,
                strokeDasharray: b.dash,
                strokeLinecap: b.cap,
                opacity: b.opacity,
              }"
            />
            <path :d="map.done" class="done-glow" />
            <path :d="map.done" class="done" />
            <template v-for="m in markers" :key="`l${m.id}`">
              <line v-if="m.leader" v-bind="m.leader" class="leader" />
            </template>
            <circle :cx="map.end.x" :cy="map.end.y" r="6" class="end" />
          </svg>

          <button
            v-for="l in labels"
            :key="`lb${l.index}`"
            class="stage-label"
            :class="{ above: l.above, upcoming: l.upcoming, sel: l.sel }"
            :style="l.pos"
            @click="selectStage(l.index)"
          >
            <span class="stage-title">{{ l.title }}</span>
            <span class="mono stage-days">{{ l.days }}</span>
            <span v-if="l.cur" class="mono stage-now"
              >Now · day {{ curDay.dayOf }}/{{ curDay.len }}</span
            >
          </button>

          <button
            v-for="n in nodes"
            :key="`n${n.index}`"
            class="node mono"
            :class="{ lit: n.lit, cur: n.cur, sel: n.sel }"
            :style="n.pos"
            :title="n.tip"
            @click="selectStage(n.index)"
          >
            {{ n.index }}
          </button>

          <button
            v-for="m in markers"
            :key="m.id"
            class="marker"
            :class="{ square: !m.round, pulse: m.pulse, on: active === m.id }"
            :style="{
              ...m.pos,
              width: `${m.size}px`,
              height: `${m.size}px`,
              color: m.color,
              borderColor: m.color,
              background: m.bg,
              opacity: m.opacity,
            }"
            :aria-label="m.title"
            @mouseenter="hover = m.id"
            @mouseleave="hover = null"
            @focus="hover = m.id"
            @blur="hover = null"
            @click="togglePin(m.id)"
          >
            <Icon :name="m.icon" :size="m.size > 22 ? 14 : 11" :stroke="2" />
            <span v-if="m.note" class="marker-note">{{ m.note }}</span>
          </button>

          <button
            v-if="cur"
            class="ship"
            :style="chiefPos"
            :title="`CHIEF · MD ${day.toFixed(2)}`"
            @click="selectStage(cur.index)"
          >
            <Capsule state="idle" :size="60" />
          </button>

          <div v-if="popover" class="pop" :style="popover.pos">
            <span class="pop-bar" :style="{ background: popover.bar }" />
            <div class="pop-body">
              <div class="pop-head">
                <span :style="{ color: popover.iconColor }"
                  ><Icon :name="popover.icon" :size="15" :stroke="1.9"
                /></span>
                <span class="label">{{ popover.kind }}</span>
                <span
                  v-if="popover.sev"
                  class="chip"
                  :style="{ background: popover.chipBg, color: popover.iconColor }"
                  ><i :style="{ background: popover.iconColor }" />{{ sevLabel(popover.sev) }}</span
                >
                <span class="grow" />
                <button
                  v-if="popover.pinned"
                  class="icon-btn"
                  aria-label="Close"
                  @click="pin = null"
                >
                  <Icon name="close" :size="14" :stroke="2" />
                </button>
              </div>
              <div>
                <div class="pop-title">{{ popover.title }}</div>
                <div class="mono pop-when">
                  {{ popover.when }} ·
                  <span :style="{ color: popover.statusColor }">{{ popover.status }}</span>
                </div>
              </div>
              <template v-if="popover.effect">
                <div>
                  <div class="label">Effect</div>
                  <div class="pop-text">{{ popover.effect }}</div>
                </div>
                <div class="todo">
                  <div class="label">What to do</div>
                  <div class="pop-text">{{ popover.prep }}</div>
                </div>
              </template>
              <div v-if="popover.cargo" class="cargo">
                <div class="label">Brings</div>
                <div v-for="c in popover.cargo" :key="c.name" class="cargo-row">
                  <span>{{ c.name }}</span><span class="mono muted">+{{ c.qty }} {{ c.unit }}</span>
                </div>
              </div>
              <div class="pop-source">
                <strong>{{ popover.simLabel }}</strong> · Source:
                <a
                  v-if="popover.source.url"
                  :href="popover.source.url"
                  target="_blank"
                  rel="noopener"
                  >{{ popover.source.document }}</a><span v-else>{{
                  popover.source.document
                }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="legend">
          <span><i class="lg-done" />Done</span>
          <span><i class="lg-togo" />To go</span>
          <span><i class="lg-cur" />Current stage</span>
          <span
            ><Icon name="hazardRadiation" :size="14" :stroke="2" />Radiation zone<i class="lg-rad"
          /></span>
          <span
            ><Icon name="thermal" :size="14" :stroke="2" />Thermal zone<i class="lg-thermal"
          /></span>
          <span><i class="lg-dot" style="background: var(--caution)" />Caution</span>
          <span
            ><i class="lg-dot pulse" style="background: var(--critical)" />Critical (pulses while
            ahead or active)</span
          >
          <span><i class="lg-cargo" />Cargo ship</span>
          <span><i class="lg-saa" />SAA passes, daily</span>
          <span class="grow" />
          <span class="faint">Click a stage for its inventory · hover a marker for details</span>
        </div>
      </section>

      <div v-if="!drawer" class="bottom">
        <section v-if="cur" class="card panel">
          <div class="panel-head">
            <span class="label">Current stage</span>
            <span class="grow" />
            <button class="link-btn" @click="selectStage(cur.index)">Stage inventory →</button>
          </div>
          <div class="cur-title">
            <span class="badge mono">{{ cur.index }}</span>
            <div>
              <div class="cur-name">{{ cur.title }}</div>
              <div class="muted small-text">{{ cur.summary }}</div>
            </div>
          </div>
          <div class="cur-progress">
            <span class="bar thick"><span :style="{ width: curDay.pct }" /></span>
            <span class="mono muted small-text"
              >Day {{ curDay.dayOf }} / {{ curDay.len }} · {{ curDay.pct }}</span
            >
          </div>
          <div class="list">
            <button v-for="h in curHazards" :key="h.id" class="list-row" @click="togglePin(h.id)">
              <span :style="{ color: h.color }"
                ><Icon :name="h.icon" :size="15" :stroke="1.9"
              /></span>
              <span class="list-text">
                <span class="list-title">{{ h.title }}</span>
                <span class="mono faint list-sub">{{ h.when }}</span>
              </span>
              <span class="muted small-text">{{ h.status }}</span>
              <span class="chip" :style="{ background: h.bg, color: h.color }"
                ><i :style="{ background: h.color }" />{{ sevLabel(h.sev) }}</span
              >
            </button>
          </div>
        </section>
        <section class="card panel">
          <div class="label panel-label">Coming up</div>
          <div class="list">
            <button
              v-for="u in upcoming"
              :key="u.id"
              class="list-row up-row"
              @click="togglePin(u.id)"
            >
              <span :style="{ color: u.color }"
                ><Icon :name="u.icon" :size="15" :stroke="1.9"
              /></span>
              <span class="list-text">
                <span class="list-title ellipsis">{{ u.title }}</span>
                <span class="faint list-sub">{{ u.sub }}</span>
              </span>
              <span class="mono muted when"
                >{{ u.when }}<br /><span class="faint">{{ u.inDays }}</span></span
              >
              <span class="chip" :style="{ background: u.bg, color: u.color }"
                ><i :style="{ background: u.color }" />{{ sevLabel(u.tag) }}</span
              >
            </button>
            <p v-if="!upcoming.length" class="faint small-text">Nothing else before the return.</p>
          </div>
        </section>
      </div>

      <section v-else class="card drawer" :class="drawer.kind">
        <div class="drawer-head">
          <span class="badge mono" :class="{ hollow: drawer.kind === 'forecast' }">{{
            drawer.stage.index
          }}</span>
          <div class="drawer-title">
            <div class="drawer-line">
              <span class="drawer-name"
                >Stage {{ drawer.stage.index }} · {{ drawer.stage.title }}</span
              >
              <span class="mono muted small-text"
                >MD {{ drawer.stage.startDay }}–{{ drawer.stage.endDay }} ·
                {{ drawer.len }} days</span
              >
              <span class="tag" :class="drawer.kind">{{ drawer.tag }}</span>
            </div>
            <div class="muted small-text">
              {{ drawer.stage.summary }} <span class="faint">{{ drawer.note }}</span>
            </div>
          </div>
          <div class="events">
            <button v-for="e in drawer.events" :key="e.id" class="event" @click="togglePin(e.id)">
              <span :style="{ color: e.color }"><Icon :name="e.icon" :size="12" :stroke="2" /></span
              >{{ e.label }}
            </button>
          </div>
          <div class="stepper">
            <button
              aria-label="Previous stage"
              @click="selectStage(Math.max(1, drawer.stage.index - 1))"
            >
              <Icon name="chevLeft" :size="14" :stroke="2" />
            </button>
            <button
              aria-label="Next stage"
              @click="selectStage(Math.min(stages.length, drawer.stage.index + 1))"
            >
              <Icon name="chevRight" :size="14" :stroke="2" />
            </button>
          </div>
          <button class="icon-btn" aria-label="Close" @click="sel = null">
            <Icon name="close" :size="15" :stroke="2" />
          </button>
        </div>
        <div class="table-wrap">
          <div class="trow thead">
            <span>Item</span>
            <span :class="{ hatch: drawer.kind === 'forecast' }">Start</span>
            <span :class="{ hatch: drawer.kind !== 'done' }">Used</span>
            <span :class="{ hatch: drawer.kind !== 'done' }">Reclaimed</span>
            <span :class="{ hatch: drawer.kind === 'forecast' }">Delivered</span>
            <span :class="{ hatch: drawer.kind === 'forecast' }">Adjusted</span>
            <span :class="{ hatch: drawer.kind !== 'done' }">{{ drawer.endLabel }}</span>
          </div>
          <p v-if="drawer.loading" class="faint small-text pad">Loading the stage inventory…</p>
          <template v-for="g in drawer.groups" :key="g.label">
            <div class="group-label">{{ g.label }}</div>
            <div v-for="r in g.rows" :key="r.id" class="trow">
              <span class="item-cell"
                ><span class="ellipsis item-name">{{ r.name }}</span
                ><span class="faint unit">{{ r.unit }}</span></span
              >
              <span
                v-for="(c, i) in r.cells"
                :key="i"
                class="mono num"
                :class="{ projected: c.projected, empty: c.text === '—' }"
                >{{ c.text }}</span
              >
            </div>
          </template>
          <div class="faint small-text pad">{{ drawer.foot }}</div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.route {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 20px 20px;
  min-height: 100%;
}
.loading {
  padding: 40px 0;
  text-align: center;
}
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.map-card {
  position: relative;
  z-index: 5;
  flex: none;
}
.label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}
.small {
  font-size: 11.5px;
}
.small-text {
  font-size: 12.5px;
}
.faint {
  color: var(--text-3);
}
.muted {
  color: var(--text-2);
}
.grow,
.push {
  flex: 1;
}
.push {
  text-align: right;
}
.ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* stats row */
.stats {
  display: grid;
  grid-template-columns: 1fr 1.1fr 1.3fr 1.2fr;
  border-bottom: 1px solid var(--border);
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 14px;
  border: 0;
  background: transparent;
  text-align: left;
  min-width: 0;
}
.stat + .stat {
  border-left: 1px solid var(--border);
}
button.stat:hover {
  background: var(--panel-2);
}
.stat-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.big {
  font-size: 20px;
  font-weight: 500;
  line-height: 1.1;
}
.stat-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}
.with-icon {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 14px;
}
.bar {
  display: block;
  height: 4px;
  border-radius: 2px;
  background: var(--panel-3);
  overflow: hidden;
}
.bar > span {
  display: block;
  height: 100%;
  background: var(--accent);
}
.bar.thick {
  flex: 1;
  height: 6px;
  border-radius: 3px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 17px;
  padding: 0 5px;
  border-radius: 3px;
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  flex: none;
}
.chip i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

/* map */
.map {
  position: relative;
  width: 100%;
  aspect-ratio: 1000 / 270;
  max-height: 44vh;
  background:
    radial-gradient(ellipse 60% 90% at 18% 0%, rgba(124, 182, 255, 0.12), transparent 70%),
    radial-gradient(ellipse 55% 80% at 88% 100%, rgba(124, 182, 255, 0.09), transparent 70%),
    linear-gradient(180deg, var(--chrome) 0%, var(--chrome-2) 100%);
}
.map-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.star {
  fill: #e8f0ff;
}
.saa {
  fill: none;
  stroke: var(--chrome-muted);
  stroke-width: 1.4;
  stroke-dasharray: 0.1 5;
  stroke-linecap: round;
  opacity: 0.6;
}
.cur-glow {
  fill: none;
  stroke: rgba(124, 182, 255, 0.2);
  stroke-width: 18;
  stroke-linecap: round;
}
.sel-glow {
  fill: none;
  stroke: var(--chrome-accent);
  stroke-width: 22;
  stroke-linecap: round;
  opacity: 0.16;
}
.tick {
  stroke: rgba(255, 255, 255, 0.22);
  stroke-width: 1.2;
}
.to-go {
  fill: none;
  stroke: rgba(190, 206, 230, 0.6);
  stroke-width: 2.5;
  stroke-dasharray: 6 6;
  stroke-linecap: round;
}
.band {
  fill: none;
}
.done-glow {
  fill: none;
  stroke: var(--chrome-accent);
  stroke-width: 9;
  stroke-linecap: round;
  opacity: 0.22;
}
.done {
  fill: none;
  stroke: var(--chrome-accent);
  stroke-width: 3.5;
  stroke-linecap: round;
}
.leader {
  stroke: rgba(255, 255, 255, 0.3);
  stroke-width: 1;
  stroke-dasharray: 2 2;
}
.end {
  fill: var(--chrome-2);
  stroke: var(--chrome-muted);
  stroke-width: 2;
}
.stage-label {
  position: absolute;
  transform: translate(-50%, 0);
  border: 0;
  background: transparent;
  padding: 2px 4px;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.25;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
.stage-label.above {
  transform: translate(-50%, -100%);
}
.stage-label:hover {
  background: rgba(255, 255, 255, 0.08);
}
.stage-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--chrome-text);
}
.stage-label.upcoming .stage-title {
  color: #c9d4e5;
}
.stage-label.sel .stage-title {
  color: var(--chrome-accent);
}
.stage-days {
  font-size: 10.5px;
  color: var(--chrome-muted);
}
.stage-now {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--chrome-accent);
}
.node {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid rgba(190, 206, 230, 0.55);
  background: var(--chrome-2);
  color: var(--chrome-text);
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  z-index: 2;
}
.node.lit {
  background: var(--chrome-accent);
  color: var(--chrome);
  border: 2px solid var(--chrome);
}
.node.cur {
  width: 26px;
  height: 26px;
  box-shadow: 0 0 0 5px rgba(124, 182, 255, 0.28);
}
.node.sel {
  box-shadow:
    0 0 0 2px var(--chrome),
    0 0 0 4px #ffffff;
}
.marker {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 1.5px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  z-index: 3;
}
.marker.square {
  border-radius: 6px;
}
.marker.on {
  outline: 2px solid var(--chrome-accent);
  outline-offset: 2px;
}
.marker.pulse {
  animation: chPulse 1.8s infinite;
}
.marker-note {
  position: absolute;
  left: calc(100% + 6px);
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
  font-size: 10.5px;
  color: var(--chrome-muted);
}
.ship {
  position: absolute;
  transform: translate(-50%, -50%);
  border: 0;
  background: transparent;
  padding: 0;
  z-index: 4;
  animation: shipBob 3.2s ease-in-out infinite;
  filter: drop-shadow(0 0 6px rgba(124, 182, 255, 0.55)) drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4));
}
@keyframes shipBob {
  0%,
  100% {
    transform: translate(-50%, -50%) rotate(-3deg);
  }
  50% {
    transform: translate(-50%, calc(-50% - 3px)) rotate(3deg);
  }
}
@keyframes chPulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--critical) 55%, transparent);
  }
  70% {
    box-shadow: 0 0 0 9px color-mix(in srgb, var(--critical) 0%, transparent);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

/* popover */
.pop {
  position: absolute;
  width: 330px;
  z-index: 30;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: chOpen 0.14s ease-out;
}
.pop-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}
.pop-body {
  padding: 12px 14px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pop-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pop-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}
.pop-when {
  font-size: 11.5px;
  color: var(--text-2);
  margin-top: 2px;
}
.pop-text {
  font-size: 12.5px;
  text-wrap: pretty;
}
.todo {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
}
.cargo-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12.5px;
  padding: 3px 0;
  border-top: 1px solid var(--border);
}
.pop-source {
  font-size: 11px;
  color: var(--text-3);
  border-top: 1px solid var(--border);
  padding-top: 7px;
  text-wrap: pretty;
}
.pop-source strong {
  font-weight: 600;
  color: var(--text-2);
}
.icon-btn {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-2);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  flex: none;
}
.icon-btn:hover {
  background: var(--panel-3);
}

/* legend */
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--text-2);
}
.legend > span {
  display: flex;
  align-items: center;
  gap: 6px;
}
.legend i {
  display: inline-block;
}
.lg-done {
  width: 22px;
  height: 3px;
  border-radius: 2px;
  background: var(--chrome-accent);
  box-shadow: 0 0 0 1px var(--chrome);
}
.lg-togo {
  width: 22px;
  border-top: 2.5px dashed var(--border-2);
}
.lg-cur {
  width: 22px;
  height: 10px;
  border-radius: 5px;
  background: var(--accent-tint);
}
.lg-rad {
  width: 20px;
  height: 9px;
  background: repeating-linear-gradient(90deg, var(--text-3) 0 1.5px, transparent 1.5px 4px);
  opacity: 0.8;
}
.lg-thermal {
  width: 20px;
  height: 9px;
  border-radius: 5px;
  background: var(--text-3);
  opacity: 0.35;
}
.lg-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.lg-dot.pulse {
  animation: chPulse 1.8s infinite;
}
.lg-cargo {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1.5px solid var(--text-2);
}
.lg-saa {
  width: 22px;
  border-top: 2px dotted var(--text-3);
  opacity: 0.7;
}

/* bottom panels */
.bottom {
  flex: 1;
  min-height: 200px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}
.panel {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.panel-label {
  margin-bottom: -4px;
}
.link-btn {
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  font-weight: 500;
}
.link-btn:hover {
  background: var(--accent-tint);
}
.cur-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cur-name {
  font-size: 15px;
  font-weight: 600;
}
.badge {
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 600;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.badge.hollow {
  background: var(--panel);
  color: var(--text-2);
  border: 1.5px solid var(--border-2);
}
.cur-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}
.list {
  display: flex;
  flex-direction: column;
}
.list-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
  border: 0;
  border-top: 1px solid var(--border);
  background: transparent;
  text-align: left;
}
.list-row:hover {
  background: var(--panel-2);
}
.up-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto auto;
}
.list-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.list-title {
  font-size: 12.5px;
  font-weight: 500;
}
.list-sub {
  font-size: 11px;
}
.when {
  font-size: 11.5px;
  text-align: right;
}

/* stage drawer */
.drawer {
  flex: 1;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: chOpen 0.16s ease-out;
}
.drawer-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 14px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.drawer.forecast .drawer-head {
  background: var(--panel-2);
}
.drawer-title {
  flex: 1;
  min-width: 0;
}
.drawer-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.drawer-name {
  font-size: 15px;
  font-weight: 600;
}
.tag {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--panel-3);
  color: var(--text-2);
  border: 1px solid transparent;
}
.tag.current {
  background: var(--accent-tint);
  color: var(--accent);
}
.tag.forecast,
.hatch,
.num.projected {
  background: repeating-linear-gradient(135deg, var(--panel-3) 0 2px, transparent 2px 7px);
}
.tag.forecast {
  border-color: var(--border-2);
}
.events {
  display: flex;
  gap: 6px;
  flex: none;
}
.event {
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--border-2);
  border-radius: 12px;
  background: var(--panel);
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--text-2);
}
.event:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.stepper {
  display: flex;
  border: 1px solid var(--border-2);
  border-radius: 6px;
  overflow: hidden;
  flex: none;
}
.stepper button {
  height: 26px;
  width: 28px;
  border: 0;
  background: var(--panel);
  color: var(--text-2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.stepper button + button {
  border-left: 1px solid var(--border-2);
}
.stepper button:hover {
  color: var(--accent);
}
.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.trow {
  display: grid;
  grid-template-columns: minmax(200px, 1.6fr) repeat(6, minmax(78px, 1fr));
  border-bottom: 1px solid var(--border);
  font-size: 12.5px;
}
.thead {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--panel-2);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-3);
}
.thead span {
  padding: 7px 10px;
  text-align: right;
}
.thead span:first-child {
  padding-left: 14px;
  text-align: left;
}
.group-label {
  padding: 8px 14px 3px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
  border-bottom: 1px solid var(--border);
}
.item-cell {
  padding: 6px 14px;
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.item-name {
  font-weight: 500;
}
.unit {
  font-size: 11px;
}
.num {
  padding: 6px 10px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.num.projected {
  color: var(--text-3);
  font-style: italic;
}
.num.empty {
  color: var(--text-3);
}
.pad {
  padding: 8px 14px;
}
</style>
