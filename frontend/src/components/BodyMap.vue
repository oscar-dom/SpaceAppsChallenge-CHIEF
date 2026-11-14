<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Region } from '../lib/sections';
import { STATUS_COLOR, STATUS_LABEL, type UiStatus, statusText } from '../lib/status';

/**
 * Front-view body figure with the organs of each body system.
 *
 * The figure is a soft mannequin (about 8 heads tall, male and female proportions), like the
 * body views of consumer health apps: limbs are tapered round-ended shapes and the torso is one
 * mirrored path, so the outline stays smooth at any size. Following high-performance HMI
 * practice (ISA-101), healthy organs stay neutral and only caution and critical ones take a
 * status colour, so a problem stands out at a glance. Critical organs pulse. The radiation
 * system is the outline around the whole body plus a dosimeter badge.
 */
const props = defineProps<{
  sex: 'female' | 'male';
  st: Record<Region, UiStatus>;
  info: Record<Region, { title: string; line: string }>;
  highlight?: Region | null;
  pinned?: Region | null;
}>();
const emit = defineEmits<{ pick: [region: Region | 'body']; hover: [region: Region | null] }>();

type Pt = [number, number];
/** A limb segment that narrows from `w1` at `from` to `w2` at `to`, with round ends. */
interface Limb {
  from: Pt;
  to: Pt;
  w1: number;
  w2: number;
}
interface Figure {
  head: { cy: number; rx: number; ry: number };
  hair: string;
  neck: { x: number; w: number };
  torso: string;
  /** Upper arm, forearm, hand. */
  arm: Limb[];
  /** Thigh, lower leg. */
  leg: Limb[];
  foot: { cx: number; cy: number; rx: number; ry: number };
}

// Left halves (x ≤ 130); the template mirrors them around x = 130.
const FIGURES: Record<'male' | 'female', Figure> = {
  male: {
    head: { cy: 36, rx: 19, ry: 24 },
    hair: 'M112 34C111 18 120 11 130 11C140 11 149 18 148 34C145 26 138 22 130 22C122 22 115 26 112 34Z',
    neck: { x: 121, w: 18 },
    torso:
      'M131 74C116 74 102 76 94 80C86 84 82 92 82 102C82 112 86 120 90 128C92 150 96 172 100 196C99 212 96 226 96 240C96 254 104 264 116 268L131 270Z',
    arm: [
      { from: [88, 94], to: [78, 166], w1: 24, w2: 17 },
      { from: [78, 166], to: [68, 232], w1: 17, w2: 12 },
      { from: [68, 234], to: [64, 258], w1: 13, w2: 10 },
    ],
    leg: [
      { from: [112, 252], to: [110, 340], w1: 38, w2: 22 },
      { from: [110, 340], to: [110, 410], w1: 22, w2: 14 },
    ],
    foot: { cx: 106, cy: 421, rx: 12, ry: 7 },
  },
  female: {
    head: { cy: 37, rx: 17, ry: 22 },
    hair: 'M110 44C106 20 118 11 130 11C142 11 154 20 150 44C151 54 150 62 146 67C142 61 141 51 143 40C139 31 135 28 130 28C125 28 121 31 117 40C119 51 118 61 114 67C110 63 109 54 110 44Z',
    neck: { x: 122, w: 16 },
    torso:
      'M131 76C118 76 106 78 98 82C91 86 88 93 88 102C88 112 91 120 94 128C96 148 102 168 104 188C103 206 94 222 92 240C92 256 102 266 116 270L131 272Z',
    arm: [
      { from: [93, 96], to: [84, 166], w1: 21, w2: 15 },
      { from: [84, 166], to: [76, 230], w1: 15, w2: 10 },
      { from: [76, 232], to: [73, 254], w1: 11, w2: 8 },
    ],
    leg: [
      { from: [111, 254], to: [112, 340], w1: 40, w2: 21 },
      { from: [112, 340], to: [112, 410], w1: 21, w2: 13 },
    ],
    foot: { cx: 108, cy: 421, rx: 11, ry: 6 },
  },
};

/** Outline of a tapered limb segment: two sides joined by round caps. */
function taper({ from, to, w1, w2 }: Limb): string {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const r1 = w1 / 2;
  const r2 = w2 / 2;
  const f = (x: number) => x.toFixed(2);
  const a1 = [from[0] + nx * r1, from[1] + ny * r1];
  const a2 = [from[0] - nx * r1, from[1] - ny * r1];
  const b1 = [to[0] + nx * r2, to[1] + ny * r2];
  const b2 = [to[0] - nx * r2, to[1] - ny * r2];
  return (
    `M${f(a1[0]!)} ${f(a1[1]!)}L${f(b1[0]!)} ${f(b1[1]!)}` +
    `A${r2} ${r2} 0 0 0 ${f(b2[0]!)} ${f(b2[1]!)}L${f(a2[0]!)} ${f(a2[1]!)}` +
    `A${r1} ${r1} 0 0 0 ${f(a1[0]!)} ${f(a1[1]!)}Z`
  );
}

const LUNG =
  'M126 92C116 90 106 96 104 110C102 124 104 140 108 150C116 152 122 148 125 142C126 126 127 106 126 92Z';
const HEART =
  'M134 112C140 106 151 108 153 117C155 126 149 134 141 138C136 140 132 136 131 130C129 123 129 115 134 112Z';
const STOMACH =
  'M136 162C145 158 153 162 153 172C153 182 146 188 138 189C132 190 129 186 131 182C134 180 139 181 142 177C144 173 139 171 137 167Z';
const KIDNEY =
  'M116 192C111 192 108 196 108 202C108 208 111 212 116 212C118 212 119 210 118 208C117 206 117 203 118 201C119 198 119 192 116 192Z';
const NODES: Pt[] = [
  [122, 70],
  [138, 70],
  [99, 112],
  [161, 112],
  [116, 258],
  [144, 258],
];
const BADGE: Pt = [222, 30];

const ANCHOR: Record<Region, Pt> = {
  head: [130, 30],
  eyes: [137, 41],
  immune: [161, 112],
  cardio: [142, 122],
  nutr: [146, 175],
  blood: [148, 202],
  msk: [110, 300],
  rad: BADGE,
};

const MIRROR = 'translate(260 0) scale(-1 1)';
/** Unique per instance: several body maps share the page. */
const filterId = `bodyline-${Math.random().toString(36).slice(2, 9)}`;

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

const fig = computed(() => FIGURES[props.sex]);
const eyeY = computed(() => fig.value.head.cy + 5);
const brain = computed(() => {
  const { cy, rx } = fig.value.head;
  return { cx: 130, cy: cy - 7, rx: rx - 5, ry: 10 };
});

/** Bones inside each limb segment, a little shorter than the segment. */
const limbs = computed(() => [...fig.value.arm, ...fig.value.leg].map(taper));
const bones = computed(() =>
  [...fig.value.arm.slice(0, 2), ...fig.value.leg].map(({ from, to }) => {
    const k = 0.12;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    return `M${from[0] + dx * k} ${from[1] + dy * k}L${to[0] - dx * k} ${to[1] - dy * k}`;
  }),
);
const knee = computed(() => fig.value.leg[0]?.to ?? ([110, 340] as Pt));

const alarm = (s: UiStatus) => s === 'caution' || s === 'critical';

interface RegionLook {
  fill: string;
  stroke: string;
  opacity: number;
  dash?: string;
  pulse: boolean;
}

const look = computed(
  () =>
    Object.fromEntries(
      (Object.keys(ANCHOR) as Region[]).map((k) => {
        const s = props.st[k] ?? 'nodata';
        const on = props.highlight === k || hover.value === k;
        const color = alarm(s) ? STATUS_COLOR[s] : 'var(--organ)';
        return [
          k,
          {
            fill: color,
            stroke: on ? 'var(--accent)' : alarm(s) ? STATUS_COLOR[s] : 'transparent',
            opacity: alarm(s) ? 0.9 : s === 'nodata' ? 0.55 : 1,
            dash: s === 'nodata' && !on ? '3 2' : undefined,
            pulse: s === 'critical',
          },
        ];
      }),
    ) as Record<Region, RegionLook>,
);

function style(k: Region) {
  const v = look.value[k];
  return {
    fill: v.fill,
    fillOpacity: v.opacity,
    stroke: v.dash ? 'var(--nodata)' : v.stroke,
    strokeWidth: 1.5,
    strokeDasharray: v.dash,
  };
}

function boneStyle() {
  const v = look.value.msk;
  return { stroke: v.fill, strokeOpacity: v.opacity, strokeDasharray: v.dash };
}

/** The body outline doubles as the radiation indicator. */
const outline = computed(() => {
  const s = props.st.rad ?? 'nodata';
  const on = props.highlight === 'rad' || hover.value === 'rad';
  if (alarm(s)) return { color: STATUS_COLOR[s], radius: on ? 3 : 2.2 };
  return { color: on ? 'var(--accent)' : 'var(--body-line)', radius: on ? 2 : 0.9 };
});
const badge = computed(() => {
  const s = props.st.rad ?? 'nodata';
  return alarm(s)
    ? { bg: STATUS_COLOR[s], fg: '#ffffff', ring: STATUS_COLOR[s] }
    : { bg: 'var(--panel)', fg: 'var(--text-2)', ring: 'var(--body-line)' };
});

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
  const TW = 236;
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

const hoverOn = (k: Region) => ({
  onMouseenter: () => enter(k),
  onMouseleave: leave,
  onClick: (e: MouseEvent) => {
    e.stopPropagation();
    emit('pick', k);
  },
});
</script>

<template>
  <div ref="root" class="bodymap" @mousemove="move">
    <svg viewBox="0 0 260 440" preserveAspectRatio="xMidYMid meet" role="img">
      <title>Body map: organs coloured by the status of their body system</title>
      <defs>
        <filter :id="filterId" x="-15%" y="-10%" width="130%" height="120%">
          <feMorphology in="SourceAlpha" operator="dilate" :radius="outline.radius" result="d" />
          <feFlood :style="{ floodColor: outline.color }" />
          <feComposite in2="d" operator="in" result="o" />
          <feMerge>
            <feMergeNode in="o" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse cx="130" cy="433" rx="56" ry="5" class="ground" />

      <!-- Silhouette: one filled group, so the outline filter draws a single clean contour. -->
      <g class="hit silhouette" :filter="`url(#${filterId})`" @click="emit('pick', 'body')">
        <g v-for="t in ['', MIRROR]" :key="t" :transform="t || undefined">
          <path :d="fig.torso" />
          <path v-for="(d, i) in limbs" :key="i" :d="d" />
          <ellipse :cx="fig.foot.cx" :cy="fig.foot.cy" :rx="fig.foot.rx" :ry="fig.foot.ry" />
        </g>
        <rect :x="fig.neck.x" y="52" :width="fig.neck.w" height="26" rx="7" />
        <ellipse cx="130" :cy="fig.head.cy" :rx="fig.head.rx" :ry="fig.head.ry" />
      </g>
      <path :d="fig.hair" class="hair" />

      <!-- Musculoskeletal: the long bones and the knees. -->
      <g class="hit" :class="{ pulse: look.msk.pulse }" v-bind="hoverOn('msk')">
        <g v-for="t in ['', MIRROR]" :key="t" :transform="t || undefined">
          <path v-for="(d, i) in bones" :key="i" :d="d" class="bone" :style="boneStyle()" />
          <circle :cx="knee[0]" :cy="knee[1]" r="4.5" :style="style('msk')" />
        </g>
      </g>

      <!-- Cardiovascular: lungs and heart. -->
      <g class="hit" :class="{ pulse: look.cardio.pulse }" v-bind="hoverOn('cardio')">
        <path :d="LUNG" :style="style('cardio')" class="soft" />
        <path :d="LUNG" :transform="MIRROR" :style="style('cardio')" class="soft" />
        <path :d="HEART" :style="style('cardio')" />
      </g>

      <!-- Nutrition: stomach. -->
      <g class="hit" :class="{ pulse: look.nutr.pulse }" v-bind="hoverOn('nutr')">
        <path :d="STOMACH" :style="style('nutr')" />
      </g>

      <!-- Blood and biochemistry: kidneys. -->
      <g class="hit" :class="{ pulse: look.blood.pulse }" v-bind="hoverOn('blood')">
        <path :d="KIDNEY" :style="style('blood')" />
        <path :d="KIDNEY" :transform="MIRROR" :style="style('blood')" />
      </g>

      <!-- Immune: lymph nodes. -->
      <g class="hit" :class="{ pulse: look.immune.pulse }" v-bind="hoverOn('immune')">
        <circle
          v-for="(n, i) in NODES"
          :key="i"
          :cx="n[0]"
          :cy="n[1]"
          r="3.6"
          :style="style('immune')"
        />
      </g>

      <!-- Sleep, cognition and behavioural health: the brain. -->
      <g class="hit" :class="{ pulse: look.head.pulse }" v-bind="hoverOn('head')">
        <ellipse
          :cx="brain.cx"
          :cy="brain.cy"
          :rx="brain.rx"
          :ry="brain.ry"
          :style="style('head')"
        />
        <path :d="`M130 ${brain.cy - brain.ry + 2}V${brain.cy + brain.ry - 2}`" class="sulcus" />
      </g>

      <!-- Vision: the eyes. -->
      <g class="hit" :class="{ pulse: look.eyes.pulse }" v-bind="hoverOn('eyes')">
        <ellipse cx="123" :cy="eyeY" rx="4" ry="2.6" :style="style('eyes')" />
        <ellipse cx="137" :cy="eyeY" rx="4" ry="2.6" :style="style('eyes')" />
      </g>

      <!-- Radiation: dosimeter badge (the body outline shows the same status). -->
      <g class="hit" :class="{ pulse: look.rad.pulse }" v-bind="hoverOn('rad')">
        <circle
          :cx="BADGE[0]"
          :cy="BADGE[1]"
          r="15"
          :style="{ fill: badge.bg, stroke: badge.ring, strokeWidth: 1.5 }"
        />
        <g :style="{ fill: badge.fg }">
          <circle :cx="BADGE[0]" :cy="BADGE[1]" r="2.2" />
          <path
            v-for="a in [-90, 30, 150]"
            :key="a"
            :transform="`translate(${BADGE[0]} ${BADGE[1]}) rotate(${a})`"
            d="M4 -3.2A5 5 0 0 1 4 3.2L9 6.5A10 10 0 0 0 9 -6.5Z"
          />
        </g>
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
  overflow: visible;
}
.hit {
  cursor: pointer;
}
.ground {
  fill: var(--text-1);
  opacity: 0.06;
}
.silhouette {
  fill: var(--body);
  stroke: var(--body);
}
.silhouette path,
.silhouette ellipse,
.silhouette rect {
  stroke: none;
}
.hair {
  fill: var(--organ);
  pointer-events: none;
}
.bone {
  fill: none;
  stroke-width: 2.5;
  stroke-linecap: round;
}
.soft {
  fill-opacity: 0.75;
}
.sulcus {
  fill: none;
  stroke: var(--body);
  stroke-width: 1.2;
  pointer-events: none;
}
.hit path,
.hit circle,
.hit ellipse {
  transition:
    fill 300ms ease,
    stroke 150ms ease;
}
.pulse {
  animation: organPulse 1.6s ease-in-out infinite;
}
@keyframes organPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
.tip {
  position: absolute;
  z-index: 5;
  pointer-events: none;
  width: 236px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 12px 9px 15px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.tip .bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
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
