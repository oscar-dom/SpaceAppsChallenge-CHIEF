<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { BODY_FIGURES, type BoxTuple, ORGAN_ICONS } from '../lib/bodyFigure';
import type { Region } from '../lib/sections';
import { STATUS_COLOR, STATUS_LABEL, type UiStatus, statusText } from '../lib/status';

/**
 * Front-view body figure with the organs of each body system.
 *
 * The body is an illustrated male or female figure (see `lib/bodyFigure.ts`) melted into one
 * smooth silhouette by an SVG filter: blurring the shape and thresholding it again removes the
 * muscle seams and rounds the outline, so it reads as an ordinary person. Organs are simple
 * icons placed on the measured head, chest and abdomen. Following high-performance HMI
 * practice (ISA-101), healthy organs stay neutral and only caution and critical ones take a
 * status colour, so a problem stands out at a glance. Critical organs pulse. The radiation
 * system is the outline around the whole body plus a dosimeter badge; musculoskeletal tints
 * the arms and legs.
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

/** Unique per instance: several body maps share the page. */
const uid = Math.random().toString(36).slice(2, 9);
const bodyFilter = `body-${uid}`;
const tintFilter = `tint-${uid}`;

const fig = computed(() => BODY_FIGURES[props.sex]);
const vb = computed(() => fig.value.viewBox);
/** Blur radius of the melting filter, in figure units: the athletic male needs more. */
const blur = computed(() => (props.sex === 'male' ? 15 : 11));
const filterBox = computed(() => {
  const [x, y, w, h] = vb.value;
  return { x: x - 60, y: y - 60, width: w + 120, height: h + 120 };
});

const center = (b: BoxTuple): Pt => [b[0] + b[2] / 2, b[1] + b[3] / 2];

/** Organ geometry, placed on the measured parts of the figure. */
const geo = computed(() => {
  const { head, neck, chest, abs, adductors: add } = fig.value.anchors;
  const [hx] = center(head);
  const [cx] = center(chest);
  const [, , hw, hh] = head;
  const icon = (x: number, y: number, size: number) => ({
    x: x - size / 2,
    y: y - size / 2,
    width: size,
    height: size,
  });
  const ey = head[1] + 0.56 * hh;
  const ea = 0.13 * hw;
  const eb = 0.065 * hw;
  const eye = (x: number) =>
    `M${x - ea} ${ey}Q${x} ${ey - 2 * eb} ${x + ea} ${ey}Q${x} ${ey + 2 * eb} ${x - ea} ${ey}Z`;
  const heart: Pt = [cx + chest[2] * 0.07, chest[1] + chest[3] * 0.62];
  const stomach: Pt = [cx + abs[2] * 0.2, abs[1] + abs[3] * 0.2];
  const kidneys: Pt = [cx, abs[1] + abs[3] * 0.55];
  const brain: Pt = [hx, head[1] + 0.25 * hh];
  const nodes: Pt[] = [
    [neck[0] + neck[2] * 0.15, neck[1] + neck[3] * 0.6],
    [neck[0] + neck[2] * 0.85, neck[1] + neck[3] * 0.6],
    [chest[0] + chest[2] * 0.02, chest[1] + chest[3] * 0.16],
    [chest[0] + chest[2] * 0.98, chest[1] + chest[3] * 0.16],
    [add[0] + add[2] * 0.18, add[1] + add[3] * 0.07],
    [add[0] + add[2] * 0.82, add[1] + add[3] * 0.07],
  ];
  const [vx, vy, vw, vh] = vb.value;
  const badge: Pt = [vx + vw - 70, vy + 80];
  return {
    brain: icon(brain[0], brain[1], hw * 0.74),
    eyes: [hx - 0.2 * hw, hx + 0.2 * hw].map((x) => ({ d: eye(x), x, y: ey, rx: ea * 1.8 })),
    lungs: icon(cx, chest[1] + chest[3] * 0.55, chest[2] * 0.9),
    heart: icon(heart[0], heart[1], chest[2] * 0.38),
    stomach: icon(stomach[0], stomach[1], abs[2] * 0.85),
    kidneys: icon(kidneys[0], kidneys[1], abs[2] * 1.15),
    nodes,
    nodeR: chest[2] * 0.055,
    badge,
    ground: { cx: vx + vw / 2, cy: vy + vh - 16, rx: vw * 0.22, ry: 14 },
    /** Where a pinned tooltip points for each region. */
    anchor: {
      head: brain,
      eyes: [hx + 0.2 * hw, ey],
      immune: nodes[3]!,
      cardio: heart,
      nutr: stomach,
      blood: kidneys,
      msk: [add[0] + add[2] * 0.8, add[1] + add[3] * 0.45],
      rad: badge,
    } as Record<Region, Pt>,
  };
});

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

const alarm = (s: UiStatus) => s === 'caution' || s === 'critical';
const isOn = (k: Region) => props.highlight === k || hover.value === k;

/** Colour of a region's organs: neutral unless caution or critical. */
function look(k: Region) {
  const s = props.st[k] ?? 'nodata';
  return {
    color: alarm(s) ? STATUS_COLOR[s] : 'var(--organ)',
    opacity: s === 'nodata' ? 0.55 : 1,
    pulse: s === 'critical',
    on: isOn(k),
  };
}
const organClass = (k: Region) => ({ hit: true, organ: true, pulse: look(k).pulse, on: isOn(k) });
const organStyle = (k: Region) => ({ color: look(k).color, opacity: look(k).opacity });

/** The body outline doubles as the radiation indicator. */
const outline = computed(() => {
  const s = props.st.rad ?? 'nodata';
  const on = isOn('rad');
  if (alarm(s)) return { color: STATUS_COLOR[s], radius: on ? 9 : 7 };
  return { color: on ? 'var(--accent)' : 'var(--body-line)', radius: on ? 6 : 2.5 };
});
const badge = computed(() => {
  const s = props.st.rad ?? 'nodata';
  return alarm(s)
    ? { bg: STATUS_COLOR[s], fg: '#ffffff', ring: STATUS_COLOR[s] }
    : { bg: 'var(--panel)', fg: 'var(--text-2)', ring: 'var(--body-line)' };
});
/** Arms and legs take the musculoskeletal colour when it is in alarm or selected. */
const tint = computed(() => {
  const s = props.st.msk ?? 'nodata';
  if (alarm(s)) return { color: STATUS_COLOR[s], opacity: isOn('msk') ? 0.45 : 0.3 };
  return isOn('msk') ? { color: 'var(--accent)', opacity: 0.22 } : null;
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

/** Pixel position of a region's anchor, given the `meet` scaling of the viewBox. */
function pinPos(k: Region) {
  const { w, h } = size.value;
  const [vx, vy, vw, vh] = vb.value;
  const s = Math.min(w / vw, h / vh);
  const [ax, ay] = geo.value.anchor[k];
  return { x: (w - vw * s) / 2 + (ax - vx) * s, y: (h - vh * s) / 2 + (ay - vy) * s };
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
    <svg :viewBox="vb.join(' ')" preserveAspectRatio="xMidYMid meet" role="img">
      <title>Body map: organs coloured by the status of their body system</title>
      <defs>
        <!-- Melt the figure into one smooth shape, then draw the outline around it. -->
        <filter :id="bodyFilter" filterUnits="userSpaceOnUse" v-bind="filterBox">
          <feGaussianBlur in="SourceAlpha" :stdDeviation="blur" result="b" />
          <feComponentTransfer in="b" result="s">
            <feFuncA type="linear" slope="14" intercept="-6.5" />
          </feComponentTransfer>
          <feFlood :style="{ floodColor: 'var(--body)' }" result="fc" />
          <feComposite in="fc" in2="s" operator="in" result="fill" />
          <feMorphology in="s" operator="dilate" :radius="outline.radius" result="d" />
          <feFlood :style="{ floodColor: outline.color }" result="oc" />
          <feComposite in="oc" in2="d" operator="in" result="o" />
          <feMerge>
            <feMergeNode in="o" />
            <feMergeNode in="fill" />
          </feMerge>
        </filter>
        <filter v-if="tint" :id="tintFilter" filterUnits="userSpaceOnUse" v-bind="filterBox">
          <feGaussianBlur in="SourceAlpha" :stdDeviation="blur" result="b" />
          <feComponentTransfer in="b" result="s">
            <feFuncA type="linear" slope="14" intercept="-6.5" />
          </feComponentTransfer>
          <feFlood :style="{ floodColor: tint.color }" result="fc" />
          <feComposite in="fc" in2="s" operator="in" />
        </filter>
      </defs>

      <ellipse v-bind="geo.ground" class="ground" />

      <!-- Silhouette, hair included: one shape, so the outline is a single clean contour. -->
      <g
        class="hit silhouette"
        :class="{ pulse: look('rad').pulse }"
        :filter="`url(#${bodyFilter})`"
        @click="emit('pick', 'body')"
      >
        <path v-for="(p, i) in fig.silhouette" :key="i" :d="p.d" :transform="p.transform" />
      </g>

      <!-- Musculoskeletal: the arms and legs. -->
      <g
        v-if="tint"
        class="tint"
        :class="{ pulse: look('msk').pulse }"
        :filter="`url(#${tintFilter})`"
        :opacity="tint.opacity"
      >
        <path v-for="(p, i) in fig.limbs" :key="i" :d="p.d" :transform="p.transform" />
      </g>
      <g class="hit limbs" v-bind="hoverOn('msk')">
        <path v-for="(p, i) in fig.limbs" :key="i" :d="p.d" :transform="p.transform" />
      </g>

      <!-- Cardiovascular: lungs, and the heart in front with a halo that separates them. -->
      <g :class="organClass('cardio')" :style="organStyle('cardio')" v-bind="hoverOn('cardio')">
        <svg v-bind="geo.lungs" viewBox="0 0 48 48" overflow="visible">
          <rect x="8" y="8" width="32" height="32" class="hit-area" />
          <path v-for="(p, i) in ORGAN_ICONS.lungs" :key="i" :d="p.d" :fill-rule="p.fillRule" />
        </svg>
        <svg v-bind="geo.heart" viewBox="0 0 48 48" overflow="visible" class="halo">
          <path v-for="(p, i) in ORGAN_ICONS.heart" :key="i" :d="p.d" :fill-rule="p.fillRule" />
        </svg>
        <svg v-bind="geo.heart" viewBox="0 0 48 48">
          <path v-for="(p, i) in ORGAN_ICONS.heart" :key="i" :d="p.d" :fill-rule="p.fillRule" />
        </svg>
      </g>

      <!-- Nutrition: stomach. -->
      <g :class="organClass('nutr')" :style="organStyle('nutr')" v-bind="hoverOn('nutr')">
        <svg v-bind="geo.stomach" viewBox="0 0 48 48" overflow="visible">
          <rect x="8" y="8" width="32" height="32" class="hit-area" />
          <path v-for="(p, i) in ORGAN_ICONS.stomach" :key="i" :d="p.d" :fill-rule="p.fillRule" />
        </svg>
      </g>

      <!-- Blood and biochemistry: kidneys. -->
      <g :class="organClass('blood')" :style="organStyle('blood')" v-bind="hoverOn('blood')">
        <svg v-bind="geo.kidneys" viewBox="0 0 48 48" overflow="visible">
          <rect x="8" y="8" width="32" height="32" class="hit-area" />
          <path v-for="(p, i) in ORGAN_ICONS.kidneys" :key="i" :d="p.d" :fill-rule="p.fillRule" />
        </svg>
      </g>

      <!-- Immune: lymph nodes, each with a wide invisible hit area. -->
      <g :class="organClass('immune')" :style="organStyle('immune')" v-bind="hoverOn('immune')">
        <template v-for="(n, i) in geo.nodes" :key="i">
          <circle :cx="n[0]" :cy="n[1]" :r="geo.nodeR * 2.2" class="hit-area" />
          <circle :cx="n[0]" :cy="n[1]" :r="geo.nodeR" class="mark" />
        </template>
      </g>

      <!-- Sleep, cognition and behavioural health: the brain. -->
      <g :class="organClass('head')" :style="organStyle('head')" v-bind="hoverOn('head')">
        <svg v-bind="geo.brain" viewBox="0 0 48 48">
          <rect x="8" y="8" width="32" height="32" class="hit-area" />
          <path
            d="M24 10C18 7 9 9 7 17C4 21 5 29 10 32C13 37 20 37 24 34C28 37 35 37 38 32C43 29 44 21 41 17C39 9 30 7 24 10Z"
          />
          <path class="sulcus" d="M24 12V32M15 17c4 2 5 5 3 9M33 17c-4 2-5 5-3 9" />
        </svg>
      </g>

      <!-- Vision: the eyes, almond shaped. -->
      <g :class="organClass('eyes')" :style="organStyle('eyes')" v-bind="hoverOn('eyes')">
        <template v-for="(e, i) in geo.eyes" :key="i">
          <ellipse :cx="e.x" :cy="e.y" :rx="e.rx" :ry="e.rx * 0.8" class="hit-area" />
          <path :d="e.d" class="mark" />
        </template>
      </g>

      <!-- Radiation: dosimeter badge (the body outline shows the same status). -->
      <g
        class="hit"
        :class="{ pulse: look('rad').pulse }"
        :transform="`translate(${geo.badge[0]} ${geo.badge[1]}) scale(2.8)`"
        v-bind="hoverOn('rad')"
      >
        <circle r="15" :style="{ fill: badge.bg, stroke: badge.ring, strokeWidth: 1.5 }" />
        <g :style="{ fill: badge.fg }">
          <circle r="2.2" />
          <path
            v-for="a in [-90, 30, 150]"
            :key="a"
            :transform="`rotate(${a})`"
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
  display: block;
}
.bodymap > svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.hit {
  cursor: pointer;
}
.ground {
  fill: var(--text-1);
  opacity: 0.06;
}
/* Only the alpha matters: the filter paints the body colour. */
.silhouette path,
.tint path {
  fill: #000;
  stroke: #000;
  stroke-width: 18;
  stroke-linejoin: round;
}
.tint {
  pointer-events: none;
}
.limbs path {
  fill: transparent;
}
.organ {
  fill: currentColor;
  transition:
    color 300ms ease,
    opacity 150ms ease;
}
.organ.on {
  filter: drop-shadow(0 0 6px var(--accent));
}
.halo path {
  fill: var(--body);
  stroke: var(--body);
  stroke-width: 4;
  stroke-linejoin: round;
}
.mark {
  stroke: var(--body);
  stroke-width: 4;
  stroke-linejoin: round;
}
.hit-area {
  fill: transparent;
}
.sulcus {
  fill: none;
  stroke: var(--body);
  stroke-width: 2.4;
  stroke-linecap: round;
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
