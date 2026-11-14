<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Region } from '../lib/sections';
import { STATUS_COLOR, STATUS_LABEL, type UiStatus, statusText } from '../lib/status';

/**
 * Front-view body silhouette (anatomical position) with regions tinted by the status of
 * their body system. The outline shows whole-body radiation dose.
 */
const props = defineProps<{
  sex: 'female' | 'male';
  st: Record<Region, UiStatus>;
  info: Record<Region, { title: string; line: string }>;
  highlight?: Region | null;
  pinned?: Region | null;
}>();
const emit = defineEmits<{ pick: [region: Region | 'body']; hover: [region: Region | null] }>();

const FILL_OPACITY: Record<UiStatus, number> = {
  nominal: 0.1,
  caution: 0.42,
  critical: 0.48,
  nodata: 0.1,
  none: 0.1,
};
const ANCHOR: Record<Region, [number, number]> = {
  head: [130, 22],
  eyes: [137, 44],
  immune: [158, 125],
  cardio: [146, 118],
  nutr: [148, 176],
  blood: [146, 207],
  msk: [146, 300],
  rad: [178, 112],
};
const REGIONS: Region[] = ['head', 'eyes', 'immune', 'cardio', 'nutr', 'blood', 'msk', 'rad'];

// Left half outlines (x ≤ 130), mirrored in the template. Arms abducted, palms forward.
const BODY = {
  male: {
    line: 'M130 8C119 8 112 16 112 30C112 37 112 41 113 45C112 46 111 49 112 51C113 53 115 53 116 53C117 57 119 60 121 62L121 76C116 80 105 82 95 85C86 88 79 95 78 106C76 128 67 150 61 172C55 188 49 212 44 234C38 238 32 242 30 247C29 250 32 252 35 250C38 248 40 247 41 249C38 256 37 263 37 269C37 275 42 277 45 272C48 264 52 254 56 244C61 226 68 202 74 182C80 162 88 140 94 122C96 142 98 168 100 194C101 210 98 226 97 240C93 266 95 300 101 330C98 346 95 364 98 382C101 396 107 404 110 412C108 420 102 428 104 432C108 435 120 435 125 432C126 426 124 418 123 412C123 396 123 372 122 358C121 348 123 340 123 332C123 300 127 272 130 256',
    leg: 'M97 240C93 266 95 300 101 330C98 346 95 364 98 382C101 396 107 404 110 412C108 420 102 428 104 432C108 435 120 435 125 432C126 426 124 418 123 412C123 396 123 372 122 358C121 348 123 340 123 332C123 300 127 272 130 256L130 250C118 249 106 246 97 240Z',
    crotch: 256,
    top: 8,
  },
  female: {
    line: 'M130 9C117 9 110 19 110 34C110 50 109 62 106 71C105 75 109 77 115 77L121 78C119 83 106 88 96 91C89 93 84 99 84 108C82 128 75 150 70 170C65 190 58 212 53 230C48 234 43 238 41 242C40 245 43 247 46 245C48 243 49 243 50 245C48 252 47 260 47 265C47 270 51 272 53 268C56 260 59 250 63 241C69 222 75 200 80 180C85 160 91 138 96 122C95 132 95 142 97 150C99 162 104 172 104 186C104 204 94 220 93 240C92 264 96 300 103 330C102 346 99 366 102 384C104 398 110 406 113 412C112 420 107 428 109 432C112 435 121 435 125 432C126 426 124 418 123 412C123 394 122 372 122 358C121 348 123 340 123 332C123 302 127 274 130 258',
    leg: 'M93 240C92 264 96 300 103 330C102 346 99 366 102 384C104 398 110 406 113 412C112 420 107 428 109 432C112 435 121 435 125 432C126 426 124 418 123 412C123 394 122 372 122 358C121 348 123 340 123 332C123 302 127 274 130 258L130 252C117 251 103 248 93 240Z',
    crotch: 258,
    top: 9,
  },
};

const MIRROR = 'translate(260 0) scale(-1 1)';
const root = ref<HTMLDivElement | null>(null);
const hover = ref<Region | null>(null);
const mouse = ref({ x: 0, y: 0 });
const size = ref({ w: 260, h: 440 });
let observer: ResizeObserver | undefined;

onMounted(() => {
  observer = new ResizeObserver(() => {
    if (root.value) size.value = { w: root.value.offsetWidth, h: root.value.offsetHeight };
  });
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());

const body = computed(() => {
  const b = BODY[props.sex];
  return { ...b, fill: `${b.line}L131 ${b.crotch}L131 ${b.top}Z` };
});

interface RegionStyle {
  fill: string;
  stroke: string;
  fo: number;
  fo2: number;
  fo3: number;
  so: number;
  sw: number;
  dash: string;
}

const r = computed(
  () =>
    Object.fromEntries(
      REGIONS.map((k) => {
        const s = props.st[k] ?? 'nodata';
        const on = props.highlight === k || hover.value === k;
        const base = FILL_OPACITY[s] * (on ? 1.8 : 1);
        return [
          k,
          {
            fill: STATUS_COLOR[s],
            stroke: k === 'rad' && s === 'nominal' ? 'var(--body-line)' : STATUS_COLOR[s],
            fo: base,
            fo2: base * 0.55,
            fo3: Math.min(1, base * 2.2),
            so: s === 'nominal' ? (on ? 1 : 0.42) : 1,
            sw: on ? 2.25 : k === 'rad' && s !== 'nominal' ? 1.6 : 1.1,
            dash: s === 'nodata' ? '3 2' : 'none',
          },
        ];
      }),
    ) as Record<Region, RegionStyle>,
);

function enter(k: Region) {
  hover.value = k;
  emit('hover', k);
}
function leave() {
  hover.value = null;
  emit('hover', null);
}
function move(e: MouseEvent) {
  if (!hover.value || !root.value) return;
  const rect = root.value.getBoundingClientRect();
  mouse.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function pinPos(k: Region) {
  const { w, h } = size.value;
  const s = Math.min(w / 260, h / 440);
  return { x: (w - 260 * s) / 2 + ANCHOR[k][0] * s, y: (h - 440 * s) / 2 + ANCHOR[k][1] * s };
}

const tip = computed(() => {
  const k = hover.value ?? props.pinned ?? null;
  if (!k || !props.info[k]) return null;
  const s = props.st[k] ?? 'nodata';
  const p = hover.value ? mouse.value : pinPos(k);
  const TW = 224;
  const W = size.value.w;
  let x: number;
  let y = p.y;
  let tf = 'translateY(-50%)';
  if (p.x + 14 + TW <= W) x = p.x + 14;
  else if (p.x - 14 - TW >= 0) x = p.x - 14 - TW;
  else {
    x = Math.max(0, Math.min(W - TW, p.x - TW / 2));
    y = p.y + 16;
    tf = 'none';
  }
  return {
    ...props.info[k],
    status: STATUS_LABEL[s],
    color: STATUS_COLOR[s],
    labelColor: statusText(s),
    style: { left: `${x}px`, top: `${y}px`, transform: tf },
  };
});

function style(k: Region, extra: { fill?: string; fillOpacity?: number } = {}) {
  const v = r.value[k];
  return {
    fill: v.fill,
    fillOpacity: v.fo,
    stroke: v.stroke,
    strokeOpacity: v.so,
    strokeWidth: v.sw,
    strokeDasharray: v.dash,
    ...extra,
  };
}
</script>

<template>
  <div ref="root" class="bodymap" @mousemove="move">
    <svg viewBox="0 0 260 440" preserveAspectRatio="xMidYMid meet">
      <g class="hit" @click="emit('pick', 'body')">
        <path :d="body.fill" class="silhouette" />
        <path :transform="MIRROR" :d="body.fill" class="silhouette" />
      </g>
      <g
        class="hit"
        @mouseenter="enter('rad')"
        @mouseleave="leave"
        @click.stop="emit('pick', 'rad')"
      >
        <path :d="body.line" class="outline-hit" />
        <path :transform="MIRROR" :d="body.line" class="outline-hit" />
        <path :d="body.line" class="ns" :style="style('rad', { fill: 'none', fillOpacity: 0 })" />
        <path
          :transform="MIRROR"
          :d="body.line"
          class="ns"
          :style="style('rad', { fill: 'none', fillOpacity: 0 })"
        />
      </g>
      <g
        class="hit"
        :style="style('msk')"
        @mouseenter="enter('msk')"
        @mouseleave="leave"
        @click.stop="emit('pick', 'msk')"
      >
        <path :d="body.leg" class="ns" />
        <path :transform="MIRROR" :d="body.leg" class="ns" />
        <path
          d="M113 258L115 322M116 338L117 404M147 258L145 322M144 338L143 404"
          class="ns"
          style="fill: none; stroke-width: 1.5; stroke-linecap: round"
        />
        <path
          d="M111 330a4 4 0 1 0 8 0a4 4 0 1 0-8 0M141 330a4 4 0 1 0 8 0a4 4 0 1 0-8 0"
          class="ns"
        />
      </g>
      <g
        class="hit"
        :style="style('cardio', { fillOpacity: 1 })"
        @mouseenter="enter('cardio')"
        @mouseleave="leave"
        @click.stop="emit('pick', 'cardio')"
      >
        <path
          d="M126 96C117 94 107 100 104 114C102 129 103 146 107 159C114 161 121 157 125 151C126 132 127 111 126 96Z"
          class="ns"
          :style="{ fillOpacity: r.cardio.fo2 }"
        />
        <path
          :transform="MIRROR"
          d="M126 96C117 94 107 100 104 114C102 129 103 146 107 159C114 161 121 157 125 151C126 132 127 111 126 96Z"
          class="ns"
          :style="{ fillOpacity: r.cardio.fo2 }"
        />
        <path
          d="M132 108C138 102 151 104 155 113C158 122 153 131 144 136C139 138 134 134 132 128C129 121 128 112 132 108Z"
          class="ns"
          :style="{ fillOpacity: r.cardio.fo }"
        />
        <path d="M136 106C136 100 142 97 147 101" class="ns" style="fill: none" />
      </g>
      <g
        class="hit"
        @mouseenter="enter('nutr')"
        @mouseleave="leave"
        @click.stop="emit('pick', 'nutr')"
      >
        <path
          d="M137 164C145 160 154 163 154 173C154 184 147 191 138 192C132 193 129 189 131 185C134 183 140 184 143 179C145 175 139 173 137 169Z"
          class="ns"
          :style="style('nutr')"
        />
      </g>
      <g
        class="hit"
        :style="style('blood')"
        @mouseenter="enter('blood')"
        @mouseleave="leave"
        @click.stop="emit('pick', 'blood')"
      >
        <path
          d="M117 197C112 197 109 201 109 207C109 213 112 217 117 217C119 217 120 215 119 213C118 211 118 208 119 206C120 203 120 197 117 197Z"
          class="ns"
        />
        <path
          :transform="MIRROR"
          d="M117 197C112 197 109 201 109 207C109 213 112 217 117 217C119 217 120 215 119 213C118 211 118 208 119 206C120 203 120 197 117 197Z"
          class="ns"
        />
      </g>
      <g
        class="hit"
        :style="style('immune', { fillOpacity: r.immune.fo3 })"
        @mouseenter="enter('immune')"
        @mouseleave="leave"
        @click.stop="emit('pick', 'immune')"
      >
        <path
          d="M120.5 69a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0M133.1 69a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0M98.8 125a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0M154.8 125a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0M110.8 250a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0M142.8 250a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0"
          class="ns"
        />
      </g>
      <g
        class="hit"
        :style="style('head')"
        @mouseenter="enter('head')"
        @mouseleave="leave"
        @click.stop="emit('pick', 'head')"
      >
        <path d="M115 27a15 12 0 1 0 30 0a15 12 0 1 0-30 0Z" class="ns" />
        <path d="M130 16V38" class="ns" style="fill: none" />
      </g>
      <g
        class="hit"
        :style="style('eyes', { fillOpacity: r.eyes.fo3 })"
        @mouseenter="enter('eyes')"
        @mouseleave="leave"
        @click.stop="emit('pick', 'eyes')"
      >
        <path
          d="M119 44a4.2 2.4 0 1 0 8.4 0a4.2 2.4 0 1 0-8.4 0ZM132.6 44a4.2 2.4 0 1 0 8.4 0a4.2 2.4 0 1 0-8.4 0Z"
          class="ns"
        />
      </g>
    </svg>
    <div v-if="tip" class="tip" :style="tip.style">
      <div class="bar" :style="{ background: tip.color }" />
      <div class="tip-head">
        <span class="tip-title">{{ tip.title }}</span>
        <span class="tip-status" :style="{ color: tip.labelColor }">
          <span class="dot" :style="{ background: tip.color }" />{{ tip.status }}
        </span>
      </div>
      <div class="tip-line mono">{{ tip.line }}</div>
      <div class="tip-hint">Click to open {{ tip.title }}</div>
    </div>
  </div>
</template>

<style scoped>
.bodymap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 120px;
}
svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.hit {
  cursor: pointer;
}
.silhouette {
  fill: var(--body);
}
.outline-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 10;
  vector-effect: non-scaling-stroke;
}
.ns {
  vector-effect: non-scaling-stroke;
  stroke-linejoin: round;
}
.tip {
  position: absolute;
  z-index: 5;
  pointer-events: none;
  width: 224px;
  background: var(--panel-2);
  border: 1px solid var(--border-2);
  border-radius: 6px;
  padding: 8px 12px 8px 14px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}
.tip .bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}
.tip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.tip-title {
  font-size: 13px;
  font-weight: 600;
}
.tip-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.tip-line {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 4px;
}
.tip-hint {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 4px;
}
</style>
