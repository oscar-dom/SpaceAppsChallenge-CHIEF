<script setup lang="ts">
import type { InventoryCategory, InventoryLogEntry, InventoryStock } from '@chief/shared';
import { computed, ref, watch } from 'vue';
import Icon from '../components/Icon.vue';
import { hhmm, initials } from '../lib/format';
import type { IconName } from '../lib/icons';
import {
  daysLeftText,
  forecast,
  isDiscrete,
  num,
  qty,
  stockStatus,
  vehicleName,
} from '../lib/journey';
import { useJourneyStore } from '../stores/journey';
import { useMissionStore } from '../stores/mission';

/**
 * JOURNEY · Inventory. The ship's food, water and medication: what is on board, how long it
 * lasts at the recent burn rate, how it has been used over the mission, and the crew's
 * corrections to the count (never below zero).
 */
const journey = useJourneyStore();
const mission = useMissionStore();

const selId = ref<string | null>(null);
const mode = ref<'remove' | 'add'>('remove');
const amount = ref('');
const note = ref('');
const by = ref(mission.selected || mission.crew[0]?.id || '');
const saving = ref(false);
const serverError = ref<string | null>(null);
const saved = ref<string | null>(null);
const flashId = ref<string | null>(null);
const flashN = ref(0);

const today = computed(() => journey.today);
const daysToReturn = computed(() => journey.lengthDays - today.value);
const crewName = (id: string | null) => (id ? mission.memberName(id) : 'Crew');
const statusColor = (s: string) => (s === 'critical' ? 'var(--critical)' : 'var(--caution)');
const tint = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const flash = (id: string) =>
  flashId.value === id ? `${flashN.value % 2 ? 'invFlashA' : 'invFlashB'} 1.4s ease-out` : 'none';

const nextCargo = (s: InventoryStock) => {
  const r = journey.resupplies.find(
    (x) => x.day > journey.day && x.cargo.some((c) => c.itemId === s.item.id),
  );
  if (!r) return null;
  return {
    day: r.day,
    qty: r.cargo.find((c) => c.itemId === s.item.id)?.quantity ?? 0,
    vehicle: vehicleName(r.vehicle),
  };
};

function card(s: InventoryStock) {
  const it = s.item;
  const days = journey.histories[it.id]?.days ?? [];
  const pts = [...days.map((d) => d.quantity), s.quantity];
  const max = Math.max(...pts, 1);
  const y = (q: number) => (24 - (q / max) * 22).toFixed(1);
  const spark = pts
    .map((q, i) => `${((i / Math.max(1, pts.length - 1)) * 200).toFixed(1)},${y(q)}`)
    .join(' ');
  const flagged = s.status !== 'nominal';
  const c = statusColor(s.status);
  const left = s.daysLeft ?? Infinity;
  const next = nextCargo(s);
  return {
    id: it.id,
    name: it.name,
    purpose: it.purpose,
    unit: it.unit,
    qty: qty(it, s.quantity),
    days: daysLeftText(left),
    daysSub:
      left > daysToReturn.value
        ? 'Lasts past return'
        : `Empty MD ${Math.floor(today.value + left)}`,
    spark,
    sy: y(s.quantity),
    flagged,
    status: s.status,
    color: c,
    chipBg: tint(c, 15),
    next: next ? `MD ${next.day} · +${num(next.qty)}` : 'No resupply',
    water:
      it.recoveryRate > 0
        ? `Uses ${num(it.expectedDailyUse, 1)} · reclaims ${Math.round(it.recoveryRate * 100)}% · net ${num(s.dailyUse, 2)} kg/d`
        : '',
    on: selId.value === it.id,
  };
}

const rank = { critical: 0, caution: 1, nominal: 2 } as const;
const sorted = (xs: InventoryStock[]) =>
  [...xs].sort((a, b) => rank[a.status] - rank[b.status] || a.item.name.localeCompare(b.item.name));

const MED_GROUPS: [string, string[]][] = [
  ['Sleep', ['melatonin', 'zolpidem-5']],
  ['Pain & fever', ['acetaminophen-325', 'aspirin', 'ibuprofen-400']],
  ['Allergy & congestion', ['loratadine-10', 'pseudoephedrine-60']],
  ['Motion sickness & skin', ['promethazine-25', 'hydrocortisone-cream']],
];
const GROUPS: { id: InventoryCategory; label: string; sub: string; icon: IconName }[] = [
  { id: 'food', label: 'Food', sub: 'Packaged ISS menu, as shipped', icon: 'food' },
  { id: 'water', label: 'Water', sub: 'Potable · recycled on board', icon: 'water' },
  { id: 'medication', label: 'Medication', sub: 'Onboard medical kit', icon: 'pill' },
];

const groups = computed(() =>
  GROUPS.map((g) => {
    const xs = journey.stocks.filter((s) => s.item.category === g.id);
    const flagged = xs.filter((s) => s.status !== 'nominal').length;
    let subs: { label: string; rows: ReturnType<typeof card>[] }[];
    if (g.id === 'medication') {
      const known = MED_GROUPS.flatMap(([, ids]) => ids);
      subs = MED_GROUPS.map(([label, ids]) => ({
        label,
        rows: sorted(xs.filter((s) => ids.includes(s.item.id))).map(card),
      }));
      const rest = xs.filter((s) => !known.includes(s.item.id));
      if (rest.length) subs.push({ label: 'Other', rows: sorted(rest).map(card) });
      subs = subs.filter((s) => s.rows.length);
    } else subs = [{ label: '', rows: sorted(xs).map(card) }];
    return {
      ...g,
      sub: `${g.sub} · ${xs.length} item${xs.length === 1 ? '' : 's'}`,
      wide: g.id === 'medication',
      flagged,
      subs,
    };
  }),
);

const notice = computed(() => {
  const s = sorted(journey.flagged)[0];
  if (!s) return null;
  const next = nextCargo(s);
  return {
    id: s.item.id,
    name: s.item.name,
    status: s.status,
    text:
      `${daysLeftText(s.daysLeft ?? Infinity)} days left at ${num(s.dailyUse, 2)} ${s.item.unit}/day ` +
      `(${s.status} under ${s.status === 'critical' ? s.item.criticalDays : s.item.cautionDays}).` +
      (next ? ` ${next.vehicle} brings +${num(next.qty)} on MD ${next.day}.` : ''),
  };
});

// --- adjustment logs ---------------------------------------------------------------------------------

function logRow(e: InventoryLogEntry) {
  const s = journey.stockById.get(e.itemId);
  const it = s?.item;
  return {
    id: e.id,
    day: e.day,
    time: hhmm(e.at),
    item: it?.name ?? e.itemId,
    delta: `${e.delta > 0 ? '+' : '−'}${it ? qty(it, Math.abs(e.delta)) : Math.abs(e.delta)} ${it?.unit ?? ''}`,
    from: it ? qty(it, e.quantityAfter - e.delta) : '',
    to: it ? qty(it, e.quantityAfter) : '',
    note: e.note || '—',
    by: crewName(e.crewMemberId),
  };
}

const allLog = computed(() =>
  Object.values(journey.histories)
    .flatMap((h) => h.events)
    .filter((e) => e.reason === 'adjustment')
    .sort((a, b) => b.at.localeCompare(a.at) || Number(b.id) - Number(a.id))
    .slice(0, 6)
    .map(logRow),
);

// --- selected item ------------------------------------------------------------------------------------

const sel = computed(() => (selId.value ? journey.stockById.get(selId.value) : undefined));

function select(id: string) {
  selId.value = selId.value === id ? null : id;
  amount.value = '';
  note.value = '';
  saved.value = null;
  serverError.value = null;
}
watch(selId, () => (mode.value = 'remove'));

const detail = computed(() => {
  const s = sel.value;
  if (!s) return null;
  const it = s.item;
  const flagged = s.status !== 'nominal';
  const c = statusColor(s.status);
  const next = nextCargo(s);
  const log = (journey.histories[it.id]?.events ?? [])
    .filter((e) => e.reason === 'adjustment')
    .slice()
    .reverse()
    .map(logRow);
  return {
    id: it.id,
    name: it.name,
    purpose: it.purpose,
    unit: it.unit,
    qty: qty(it, s.quantity),
    flagged,
    status: s.status,
    color: c,
    chipBg: tint(c, 15),
    days: daysLeftText(s.daysLeft ?? Infinity),
    rate: `at ${num(s.dailyUse, s.dailyUse < 1 ? 3 : 2)} ${it.unit}/day`,
    next: next ? `MD ${next.day}` : '—',
    nextSub: next ? `${next.vehicle} · +${num(next.qty)} ${it.unit}` : 'None planned',
    water:
      it.recoveryRate > 0
        ? {
            used: num(it.expectedDailyUse, 1),
            back: num(it.expectedDailyUse * it.recoveryRate, 1),
            net: num(s.dailyUse, 2),
            pct: `${Math.round(it.recoveryRate * 100)}%`,
          }
        : null,
    log,
  };
});

// --- chart: stock over the mission ------------------------------------------------------------------

const L = 30;
const R = 354;
const T = 14;
const B = 170;

const chart = computed(() => {
  const s = sel.value;
  if (!s) return null;
  const it = s.item;
  const len = journey.lengthDays;
  const cx = (d: number) => L + ((d - 1) / (len - 1)) * (R - L);
  const days = journey.histories[it.id]?.days ?? [];
  const fc = forecast(s, journey.resupplies, today.value, len);
  const values = [...days.map((d) => d.quantity), ...fc.values(), s.quantity];
  const threshold = it.cautionDays * s.dailyUse;
  const rawMax = Math.max(...values, threshold, 1) * 1.12;
  const mag = 10 ** Math.floor(Math.log10(rawMax));
  const max = (Math.ceil((rawMax / mag) * 2) / 2) * mag;
  const cy = (q: number) => B - (q / max) * (B - T);
  const discrete = isDiscrete(it);

  const act: string[] = [];
  days.forEach((d, i) => {
    if (i > 0 && discrete)
      act.push(`${cx(d.day).toFixed(1)},${cy(days[i - 1]!.quantity).toFixed(1)}`);
    act.push(`${cx(d.day).toFixed(1)},${cy(d.quantity).toFixed(1)}`);
  });
  const nowX = cx(Math.min(journey.day, len));
  act.push(`${nowX.toFixed(1)},${cy(s.quantity).toFixed(1)}`);

  const fcp = [`${nowX.toFixed(1)},${cy(s.quantity).toFixed(1)}`];
  for (let d = today.value + 1; d <= len; d++) {
    const q = fc.get(d) ?? 0;
    const prev = fc.get(d - 1) ?? q;
    if (q > prev) fcp.push(`${cx(d).toFixed(1)},${cy(prev).toFixed(1)}`);
    fcp.push(`${cx(d).toFixed(1)},${cy(q).toFixed(1)}`);
  }

  const adj = (journey.histories[it.id]?.events ?? [])
    .filter((e) => e.reason === 'adjustment')
    .map((e) => {
      const x = cx(Math.min(e.day + 0.5, len));
      const y = cy(e.quantityAfter);
      return {
        id: e.id,
        x: (x - 3.5).toFixed(1),
        y: (y - 3.5).toFixed(1),
        tf: `rotate(45 ${x.toFixed(1)} ${y.toFixed(1)})`,
      };
    });

  const tick = (v: number) =>
    v >= 1000 ? `${num(v / 1000, 1)}k` : num(v, v < 10 && v % 1 ? 1 : 0);
  return {
    bands: journey.stages.map((sg, i) => {
      const x0 = cx(sg.startDay);
      const x1 = cx(Math.min(len + 1, sg.endDay + 1));
      const isCur = sg.index === journey.current?.index;
      return {
        index: sg.index,
        x: x0.toFixed(1),
        w: Math.max(0, Math.min(R, x1) - x0).toFixed(1),
        cx: ((x0 + Math.min(R, x1)) / 2).toFixed(1),
        fill: isCur ? 'var(--accent-tint)' : i % 2 ? 'var(--panel-2)' : 'transparent',
        tc: isCur ? 'var(--accent)' : 'var(--text-3)',
      };
    }),
    yt: [0, max / 2, max].map((v) => ({
      y: cy(v).toFixed(1),
      ty: (cy(v) + 3).toFixed(1),
      v: tick(v),
    })),
    act: act.join(' '),
    fc: fcp.join(' '),
    adj,
    nowX: nowX.toFixed(1),
    nowLabel: `MD ${today.value}`,
    thY: cy(threshold).toFixed(1),
    thTy: (cy(threshold) - 3).toFixed(1),
    thLabel: `CAUTION < ${it.cautionDays} D`,
    showTh: threshold > 0,
    res: journey.resupplies
      .filter((r) => r.cargo.some((c) => c.itemId === it.id))
      .map((r) => ({
        id: r.id,
        x: cx(r.day).toFixed(1),
        tx: (cx(r.day) + 3).toFixed(1),
        label: `+${num(r.cargo.find((c) => c.itemId === it.id)?.quantity ?? 0)}`,
      })),
  };
});

// --- adjust form ---------------------------------------------------------------------------------------

const form = computed(() => {
  const s = sel.value;
  if (!s) return null;
  const it = s.item;
  const value = parseFloat(amount.value);
  const has = amount.value !== '' && !Number.isNaN(value);
  const delta = mode.value === 'add' ? value : -value;
  const after = s.quantity + delta;
  let error: string | null = null;
  if (has && value <= 0) error = 'Enter an amount greater than zero.';
  else if (has && isDiscrete(it) && !Number.isInteger(value)) error = `Count whole ${it.unit}.`;
  else if (has && after < -1e-9)
    error = `Only ${qty(it, s.quantity)} ${it.unit} on board: you can remove at most ${qty(it, s.quantity)}. The count can’t go below zero.`;
  const ok = has && !error;
  const next = ok ? stockStatus(it, after, s.dailyUse) : null;
  return {
    step: isDiscrete(it) ? 1 : 0.1,
    ok,
    delta,
    error: error ?? serverError.value,
    preview: next
      ? {
          from: qty(it, s.quantity),
          to: qty(it, after),
          days: daysLeftText(next.daysLeft),
          status: next.status,
          color: statusColor(next.status),
        }
      : null,
  };
});

const crewButtons = computed(() =>
  mission.crew.map((c) => ({ id: c.id, ini: initials(c.name), name: c.name, role: c.role })),
);
const byLabel = computed(() => {
  const c = mission.crew.find((x) => x.id === by.value);
  return c ? `${c.name} · ${c.role}` : '';
});

function clear() {
  amount.value = '';
  note.value = '';
  saved.value = null;
  serverError.value = null;
}

async function apply() {
  const s = sel.value;
  const f = form.value;
  if (!s || !f?.ok || saving.value) return;
  saving.value = true;
  serverError.value = null;
  const from = qty(s.item, s.quantity);
  try {
    const next = await journey.adjust(s.item.id, f.delta, note.value, by.value);
    saved.value = `Saved · ${s.item.name} ${from} → ${qty(s.item, next.quantity)} ${s.item.unit} by ${crewName(by.value)}`;
    amount.value = '';
    note.value = '';
    flashId.value = s.item.id;
    flashN.value++;
  } catch (e) {
    serverError.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="inv">
    <p v-if="!journey.stocks.length" class="muted loading">
      {{
        journey.error ? `Cannot load the inventory: ${journey.error}` : 'Loading the ship’s stock…'
      }}
    </p>

    <template v-else>
      <div class="left">
        <button v-if="notice" class="notice" :class="notice.status" @click="select(notice.id)">
          <span
            class="chip"
            :style="{
              background: tint(statusColor(notice.status), 16),
              color: statusColor(notice.status),
            }"
            ><i :style="{ background: statusColor(notice.status) }" />{{
              notice.status.toUpperCase()
            }}</span
          >
          <span class="notice-text"
            ><strong>{{ notice.name }}</strong> · {{ notice.text }}</span
          >
          <span class="view">View →</span>
        </button>

        <div class="groups">
          <section v-for="g in groups" :key="g.id" class="group card" :class="{ wide: g.wide }">
            <div class="group-head">
              <span class="group-icon"><Icon :name="g.icon" :size="17" :stroke="1.8" /></span>
              <span class="group-text">
                <span class="group-title">{{ g.label }}</span>
                <span class="faint small">{{ g.sub }}</span>
              </span>
              <span v-if="g.flagged" class="chip caution"><i />{{ g.flagged }} TO WATCH</span>
              <span v-else class="faint small">All nominal</span>
            </div>
            <div class="group-body">
              <div v-for="sg in g.subs" :key="sg.label" class="sub">
                <div v-if="sg.label" class="sub-label">{{ sg.label }}<span /></div>
                <div class="cards">
                  <button
                    v-for="r in sg.rows"
                    :key="r.id"
                    class="item"
                    :class="{ on: r.on }"
                    @click="select(r.id)"
                  >
                    <span
                      class="item-bar"
                      :style="{ background: r.flagged ? r.color : 'transparent' }"
                    />
                    <span class="item-top">
                      <span class="item-name">{{ r.name }}</span>
                      <span
                        v-if="r.flagged"
                        class="chip"
                        :style="{ background: r.chipBg, color: r.color }"
                        ><i :style="{ background: r.color }" />{{ r.status.toUpperCase() }}</span
                      >
                    </span>
                    <span class="item-purpose faint">{{ r.purpose }}</span>
                    <span class="item-qty" :style="{ animation: flash(r.id) }">
                      <span class="mono qty">{{ r.qty }}</span>
                      <span class="faint unit">{{ r.unit }}</span>
                      <span class="grow" />
                      <span
                        class="mono dl"
                        :style="{
                          color: r.flagged ? r.color : 'var(--text-1)',
                          fontWeight: r.flagged ? 600 : 400,
                        }"
                        >{{ r.days }}</span
                      >
                      <span class="faint unit">d left</span>
                    </span>
                    <svg viewBox="0 0 200 26" class="spark" aria-hidden="true">
                      <polyline :points="r.spark" />
                      <circle
                        cx="200"
                        :cy="r.sy"
                        r="2.6"
                        :style="{ fill: r.flagged ? r.color : 'var(--text-2)' }"
                      />
                    </svg>
                    <span v-if="r.water" class="mono water-line">{{ r.water }}</span>
                    <span class="item-foot faint">
                      <span>{{ r.daysSub }}</span>
                      <span class="mono ellipsis">{{ r.next }}</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
        <p class="faint small foot">
          Days left use the recent burn rate (last 14 days). Counts are kept by the crew; the stock
          can’t go below zero. Select an item for its history and to adjust the count.
        </p>
      </div>

      <div class="right">
        <template v-if="!detail">
          <section class="card side">
            <div class="side-head">
              <span class="label">Recent adjustments</span><span class="grow" /><span
                class="faint small"
                >All items</span
              >
            </div>
            <div v-for="a in allLog" :key="a.id" class="log-row">
              <span class="mono faint tiny">MD {{ a.day }} {{ a.time }}</span>
              <span class="ellipsis log-item">{{ a.item }}</span>
              <span class="mono log-delta">{{ a.delta }}</span>
              <span />
              <span class="muted small">{{ a.note }}</span>
              <span class="faint tiny right-text">{{ a.by }}</span>
            </div>
            <p v-if="!allLog.length" class="faint small">No adjustments yet this mission.</p>
          </section>
          <div class="hint">
            Select an item to see how it has been used over the mission and to correct the count.
          </div>
        </template>

        <section v-else class="card detail">
          <span
            class="item-bar"
            :style="{ background: detail.flagged ? detail.color : 'transparent' }"
          />
          <div class="detail-head">
            <div class="detail-title">
              <div class="title-line">
                <span class="detail-name">{{ detail.name }}</span>
                <span
                  v-if="detail.flagged"
                  class="chip"
                  :style="{ background: detail.chipBg, color: detail.color }"
                  ><i :style="{ background: detail.color }" />{{
                    detail.status.toUpperCase()
                  }}</span
                >
              </div>
              <div class="muted small">{{ detail.purpose }}</div>
            </div>
            <button class="icon-btn" aria-label="Close" @click="selId = null">
              <Icon name="close" :size="15" :stroke="2" />
            </button>
          </div>
          <div class="detail-body">
            <div class="kpis">
              <div :style="{ animation: flash(detail.id) }">
                <div class="label">On board</div>
                <div>
                  <span class="mono kpi">{{ detail.qty }}</span>
                  <span class="faint small">{{ detail.unit }}</span>
                </div>
              </div>
              <div>
                <div class="label">Days left</div>
                <div
                  class="mono kpi"
                  :style="{ color: detail.flagged ? detail.color : 'var(--text-1)' }"
                >
                  {{ detail.days }}
                </div>
                <div class="faint tiny mono">{{ detail.rate }}</div>
              </div>
              <div>
                <div class="label">Next resupply</div>
                <div class="mono kpi">{{ detail.next }}</div>
                <div class="faint tiny">{{ detail.nextSub }}</div>
              </div>
            </div>

            <div v-if="detail.water" class="water">
              <div class="label">Water balance · per day</div>
              <div class="water-bar"><span :style="{ width: detail.water.pct }" /><span /></div>
              <div class="water-grid">
                <span
                  ><span class="faint">Used</span
                  ><span class="mono strong">{{ detail.water.used }}</span> kg</span
                >
                <span
                  ><span class="faint">Reclaimed ({{ detail.water.pct }})</span
                  ><span class="mono strong">{{ detail.water.back }}</span> kg</span
                >
                <span
                  ><span class="faint">Net use ■</span
                  ><span class="mono strong">{{ detail.water.net }}</span> kg</span
                >
              </div>
              <div class="faint tiny">
                The crew drinks and rehydrates food with about {{ detail.water.used }} kg a day;
                life support gives {{ detail.water.pct }} of it back, so the tanks only drop by the
                net amount.
              </div>
            </div>

            <div v-if="chart" class="chart">
              <div class="chart-legend">
                <span class="label">Stock over the mission</span>
                <span class="grow" />
                <span><i class="lg-act" />Actual</span>
                <span><i class="lg-fc" />Forecast</span>
                <span><i class="lg-adj" />Adjustment</span>
              </div>
              <svg viewBox="0 0 360 190" class="chart-svg" aria-label="Stock over the mission">
                <g v-for="b in chart.bands" :key="b.index">
                  <rect :x="b.x" y="14" :width="b.w" height="156" :style="{ fill: b.fill }" />
                  <text :x="b.cx" y="10" class="t-band" :style="{ fill: b.tc }">{{ b.index }}</text>
                </g>
                <g v-for="t in chart.yt" :key="t.v">
                  <line x1="30" :y1="t.y" x2="354" :y2="t.y" class="grid" />
                  <text x="26" :y="t.ty" class="t-axis end">{{ t.v }}</text>
                </g>
                <template v-if="chart.showTh">
                  <line x1="30" :y1="chart.thY" x2="354" :y2="chart.thY" class="th" />
                  <text x="33" :y="chart.thTy" class="t-th">{{ chart.thLabel }}</text>
                </template>
                <g v-for="r in chart.res" :key="r.id">
                  <line :x1="r.x" y1="14" :x2="r.x" y2="170" class="res" />
                  <text :x="r.tx" y="24" class="t-res">{{ r.label }}</text>
                </g>
                <polyline :points="chart.fc" class="fc" />
                <polyline :points="chart.act" class="act" />
                <line :x1="chart.nowX" y1="14" :x2="chart.nowX" y2="170" class="now" />
                <text :x="chart.nowX" y="183" class="t-now">{{ chart.nowLabel }}</text>
                <rect
                  v-for="a in chart.adj"
                  :key="a.id"
                  :x="a.x"
                  :y="a.y"
                  width="7"
                  height="7"
                  :transform="a.tf"
                  class="adj"
                />
                <text x="30" y="183" class="t-axis">MD 1</text>
                <text x="354" y="183" class="t-axis end">{{ journey.lengthDays }}</text>
              </svg>
              <div class="faint tiny">
                Bands are the 10 route stages. Dotted lines are cargo ships; step-ups are
                deliveries.
              </div>
            </div>

            <div v-if="form" class="adjust">
              <div class="label">Adjust count</div>
              <div class="adjust-line">
                <div class="seg">
                  <button
                    :class="{ on: mode === 'remove' }"
                    @click="((mode = 'remove'), (saved = null))"
                  >
                    − Remove
                  </button>
                  <button :class="{ on: mode === 'add' }" @click="((mode = 'add'), (saved = null))">
                    + Add
                  </button>
                </div>
                <label class="amount" :class="{ bad: !!form.error }">
                  <input
                    v-model="amount"
                    type="number"
                    min="0"
                    :step="form.step"
                    placeholder="0"
                    aria-label="Amount"
                    class="mono"
                    @input="((saved = null), (serverError = null))"
                    @keydown.enter="apply"
                  />
                  <span class="faint small">{{ detail?.unit }}</span>
                </label>
              </div>
              <input
                v-model="note"
                type="text"
                maxlength="200"
                class="note"
                placeholder="Note (optional), e.g. Recount after stowage"
              />
              <div class="by">
                <span class="faint small">By</span>
                <div class="seg">
                  <button
                    v-for="c in crewButtons"
                    :key="c.id"
                    :title="c.name"
                    class="mono"
                    :class="{ on: by === c.id }"
                    @click="by = c.id"
                  >
                    {{ c.ini }}
                  </button>
                </div>
                <span class="muted small ellipsis">{{ byLabel }}</span>
              </div>
              <div v-if="form.preview" class="preview">
                <span class="mono"
                  >{{ form.preview.from }} → <strong>{{ form.preview.to }}</strong>
                  {{ detail?.unit }}</span
                >
                <span class="faint mono tiny">· {{ form.preview.days }} d left</span>
                <span class="grow" />
                <span
                  v-if="form.preview.status !== 'nominal'"
                  class="chip"
                  :style="{ background: tint(form.preview.color, 15), color: form.preview.color }"
                  ><i :style="{ background: form.preview.color }" />{{
                    form.preview.status.toUpperCase()
                  }}</span
                >
              </div>
              <div v-if="form.error" role="alert" class="error">
                <Icon name="alertCircle" :size="15" :stroke="2" /><span>{{ form.error }}</span>
              </div>
              <div v-if="saved && !amount" class="saved">
                <Icon name="check" :size="14" :stroke="2.2" />{{ saved }}
              </div>
              <div class="actions">
                <button class="btn" @click="clear">Clear</button>
                <button class="btn primary" :disabled="!form.ok || saving" @click="apply">
                  {{ saving ? 'Saving…' : 'Apply adjustment' }}
                </button>
              </div>
            </div>

            <div class="item-log">
              <div class="label">Recent adjustments · this item</div>
              <p v-if="!detail.log.length" class="faint small">No adjustments yet this mission.</p>
              <div v-for="a in detail.log" :key="a.id" class="log-row">
                <span class="mono faint tiny">MD {{ a.day }} {{ a.time }}</span>
                <span class="mono"
                  ><strong>{{ a.delta }}</strong>
                  <span class="faint">· {{ a.from }} → {{ a.to }}</span></span
                >
                <span class="faint tiny">{{ a.by }}</span>
                <span />
                <span class="muted small">{{ a.note }}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.inv {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 370px;
  gap: 12px;
  padding: 4px 20px 16px;
}
.loading {
  grid-column: 1 / -1;
  padding: 40px 0;
  text-align: center;
}
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.label {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}
.faint {
  color: var(--text-3);
}
.muted {
  color: var(--text-2);
}
.small {
  font-size: 11.5px;
}
.tiny {
  font-size: 11px;
}
.grow {
  flex: 1;
}
.ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 17px;
  padding: 0 5px;
  border-radius: 3px;
  font-family: var(--mono);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  flex: none;
}
.chip i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}
.chip.caution {
  background: color-mix(in srgb, var(--caution) 15%, transparent);
  color: var(--caution);
}
.chip.caution i {
  background: var(--caution);
}

/* left column */
.left {
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 2px;
}
.notice {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 10px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--caution) 7%, var(--panel));
  box-shadow: var(--shadow);
  text-align: left;
  flex: none;
  overflow: hidden;
}
.notice.critical {
  background: color-mix(in srgb, var(--critical) 7%, var(--panel));
}
.notice::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--caution);
}
.notice.critical::before {
  background: var(--critical);
}
.notice-text {
  flex: 1;
  font-size: 12.5px;
}
.notice-text strong {
  font-weight: 600;
}
.view {
  font-size: 12px;
  color: var(--accent);
  font-weight: 500;
}
.groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.group {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.group.wide {
  grid-column: span 2;
}
.group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--accent) 9%, var(--panel));
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border));
}
.group-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--panel);
  border: 1px solid var(--border-2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.group-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.group-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
}
.group-body {
  flex: 1;
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sub {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sub-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}
.sub-label span {
  flex: 1;
  height: 1px;
  background: var(--border);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  grid-auto-rows: 1fr;
  gap: 8px;
}
.item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px 8px 13px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  text-align: left;
  overflow: hidden;
}
.item:hover {
  border-color: var(--accent);
}
.item.on {
  background: var(--accent-tint);
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.item-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}
.item-top {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.item-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
}
.item-purpose {
  font-size: 11.5px;
  line-height: 1.3;
  height: 30px;
  overflow: hidden;
}
.item-qty {
  display: flex;
  align-items: baseline;
  gap: 5px;
  border-radius: 4px;
}
.qty {
  font-size: 19px;
  font-weight: 500;
  line-height: 1.1;
}
.unit {
  font-size: 11px;
}
.dl {
  font-size: 13px;
}
.spark {
  width: 100%;
  height: auto;
  display: block;
  overflow: visible;
}
.spark polyline {
  fill: none;
  stroke: var(--text-2);
  stroke-width: 1.4;
  stroke-linejoin: round;
}
.water-line {
  font-size: 11px;
  color: var(--text-2);
}
.item-foot {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  border-top: 1px solid var(--border);
  padding-top: 6px;
  white-space: nowrap;
}
.foot {
  padding: 0 2px 4px;
}

/* right column */
.right {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.side {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}
.side-head {
  display: flex;
  align-items: center;
}
.log-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 3px 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 12.5px;
}
.log-item {
  font-weight: 500;
}
.log-delta {
  font-weight: 600;
}
.right-text {
  text-align: right;
}
.hint {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-2);
  padding: 12px 14px;
  font-size: 12.5px;
  color: var(--text-2);
}
.detail {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: chPanel 0.16s ease-out;
}
.detail-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 10px 10px 16px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.detail-title {
  flex: 1;
  min-width: 0;
}
.title-line {
  display: flex;
  align-items: center;
  gap: 8px;
}
.detail-name {
  font-size: 15px;
  font-weight: 600;
}
.icon-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.icon-btn:hover {
  background: var(--panel-3);
}
.detail-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.kpis {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  border-bottom: 1px solid var(--border);
}
.kpis > div {
  padding: 10px 12px;
}
.kpis > div:first-child {
  padding-left: 16px;
}
.kpis > div + div {
  border-left: 1px solid var(--border);
}
.kpi + .small {
  margin-left: 4px;
}
.kpi {
  font-size: 20px;
  font-weight: 500;
}
.water {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.water-bar {
  display: flex;
  height: 10px;
  border-radius: 3px;
  overflow: hidden;
  border: 1px solid var(--border-2);
}
.water-bar span:first-child {
  background: var(--panel-3);
}
.water-bar span:last-child {
  flex: 1;
  background: var(--text-1);
}
.water-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  font-size: 11.5px;
}
.water-grid > span > span {
  display: block;
}
.strong {
  font-size: 13px;
  font-weight: 500;
  display: inline !important;
}
.chart {
  padding: 10px 16px 4px;
}
.chart-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 10.5px;
  color: var(--text-3);
}
.chart-legend span {
  display: flex;
  align-items: center;
  gap: 4px;
}
.lg-act {
  width: 14px;
  height: 2px;
  background: var(--text-1);
}
.lg-fc {
  width: 14px;
  border-top: 1.5px dashed var(--text-3);
}
.lg-adj {
  width: 7px;
  height: 7px;
  transform: rotate(45deg);
  background: var(--accent);
}
.chart-svg {
  width: 100%;
  height: auto;
  display: block;
  margin-top: 4px;
  overflow: visible;
}
.chart-svg text {
  font-family: var(--mono);
  font-size: 9px;
  fill: var(--text-3);
}
.chart-svg .end {
  text-anchor: end;
}
.t-band {
  text-anchor: middle;
}
.grid {
  stroke: var(--border);
  stroke-width: 1;
}
.th {
  stroke: var(--caution);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
.chart-svg .t-th {
  font-size: 8.5px;
  font-weight: 600;
  fill: var(--caution);
}
.res {
  stroke: var(--text-3);
  stroke-width: 1;
  stroke-dasharray: 1 2;
}
.chart-svg .t-res {
  font-size: 8.5px;
  fill: var(--text-2);
}
.fc {
  fill: none;
  stroke: var(--text-3);
  stroke-width: 1.4;
  stroke-dasharray: 4 3;
}
.act {
  fill: none;
  stroke: var(--text-1);
  stroke-width: 1.6;
  stroke-linejoin: round;
}
.now {
  stroke: var(--accent);
  stroke-width: 1.2;
}
.chart-svg .t-now {
  font-weight: 600;
  fill: var(--accent);
  text-anchor: middle;
}
.adj {
  fill: var(--accent);
  stroke: var(--panel);
  stroke-width: 1.5;
}
.adjust {
  margin: 10px 16px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-2);
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.adjust-line {
  display: flex;
  align-items: center;
  gap: 8px;
}
.seg {
  display: flex;
  border: 1px solid var(--border-2);
  border-radius: 6px;
  background: var(--panel);
  overflow: hidden;
  flex: none;
}
.seg button {
  height: 28px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 500;
}
.seg button + button {
  border-left: 1px solid var(--border-2);
}
.seg button.on {
  background: var(--accent);
  color: var(--on-accent);
}
.by .seg button {
  height: 26px;
  padding: 0 9px;
  font-size: 11.5px;
  font-weight: 600;
}
.amount {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 30px;
  border: 1px solid var(--border-2);
  border-radius: 6px;
  background: var(--panel);
  padding: 0 8px;
}
.amount.bad {
  border-color: var(--critical);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--critical) 14%, transparent);
}
.amount input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--text-1);
}
.note {
  height: 30px;
  border: 1px solid var(--border-2);
  border-radius: 6px;
  background: var(--panel);
  padding: 0 8px;
  font-size: 12.5px;
  color: var(--text-1);
  outline-color: var(--accent);
}
.by {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.preview {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--panel);
}
.preview strong {
  font-weight: 600;
}
.error {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12.5px;
  color: var(--critical);
  padding: 6px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--critical) 8%, var(--panel));
}
.saved {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-2);
}
.saved :deep(svg) {
  color: var(--accent);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.actions .btn[disabled] {
  opacity: 0.45;
  cursor: default;
}
.item-log {
  padding: 2px 16px 14px;
}
.item-log .label {
  padding: 4px 0;
}
.item-log .log-row {
  border-bottom: 0;
  border-top: 1px solid var(--border);
}
@keyframes invFlashA {
  from {
    background: var(--accent-tint);
  }
  to {
    background: transparent;
  }
}
@keyframes invFlashB {
  from {
    background: var(--accent-tint);
  }
  to {
    background: transparent;
  }
}
</style>
