<script setup lang="ts">
import { computed } from 'vue';

/** CHIEF's mascot "Capsule": sky blue, amber in alert, grey offline. */
export type CapsuleState = 'idle' | 'listening' | 'thinking' | 'alert' | 'offline';

const props = withDefaults(defineProps<{ state?: CapsuleState; size?: number }>(), {
  state: 'idle',
  size: 40,
});

const v = computed(() => {
  const s = props.state;
  const suit =
    s === 'alert' ? 'var(--caution)' : s === 'offline' ? 'var(--nodata)' : 'var(--accent)';
  const eye = s === 'offline' ? '#6E7681' : s === 'alert' ? 'var(--caution)' : 'var(--accent)';
  const look = s === 'thinking' ? 1.2 : 0;
  return {
    suit,
    eye,
    ex1: 20.5 + look,
    ex2: 27.5 + look,
    ey: s === 'thinking' ? 14.6 : 15.75,
    ery: s === 'offline' ? 0.45 : s === 'listening' ? 2.1 : 1.6,
    blink: s === 'idle' ? 'capBlink 5s infinite' : 'none',
  };
});
</script>

<template>
  <span class="capsule" :style="{ width: size + 'px', height: size + 'px' }" aria-hidden="true">
    <svg viewBox="0 0 48 48" width="100%" height="100%">
      <rect x="9" y="27" width="4" height="9" rx="2" :style="{ fill: v.suit }" />
      <rect x="35" y="27" width="4" height="9" rx="2" :style="{ fill: v.suit }" />
      <path d="M13 24V17a11 11 0 0 1 22 0v7z" style="fill: var(--capsule-shell)" />
      <path d="M13 24v8a11 11 0 0 0 22 0v-8z" :style="{ fill: v.suit }" />
      <path
        d="M13 17a11 11 0 0 1 22 0v15a11 11 0 0 1-22 0z"
        style="fill: none; stroke: rgba(11, 15, 20, 0.35); stroke-width: 1"
      />
      <path d="M13 24h22" style="stroke: #0b0f14; stroke-opacity: 0.3; stroke-width: 1" />
      <rect x="16.5" y="11" width="15" height="9.5" rx="4.75" style="fill: #0e141b" />
      <g :style="{ transformOrigin: '24px 15.75px', animation: v.blink }">
        <ellipse :cx="v.ex1" :cy="v.ey" rx="1.5" :ry="v.ery" :style="{ fill: v.eye }" />
        <ellipse :cx="v.ex2" :cy="v.ey" rx="1.5" :ry="v.ery" :style="{ fill: v.eye }" />
      </g>
      <rect x="20" y="28" width="8" height="4.5" rx="1" style="fill: #0b0f14; fill-opacity: 0.28" />
      <template v-if="state === 'listening'">
        <path class="pulse" d="M39 12.5a6 6 0 0 1 0 7" />
        <path class="pulse" style="animation-delay: 0.25s" d="M42 9.5a10 10 0 0 1 0 13" />
      </template>
      <template v-if="state === 'thinking'">
        <circle class="pulse-dot" cx="37" cy="7" r="1.8" />
        <circle class="pulse-dot" cx="41.5" cy="5" r="1.8" style="animation-delay: 0.2s" />
        <circle class="pulse-dot" cx="46" cy="3" r="1.8" style="animation-delay: 0.4s" />
      </template>
      <template v-if="state === 'alert'">
        <circle
          cx="38"
          cy="9"
          r="5.5"
          style="fill: var(--caution); stroke: var(--panel); stroke-width: 1.5"
        />
        <path
          d="M38 6.2v3.6M38 11.8v.1"
          style="stroke: #0b0f14; stroke-width: 1.8; stroke-linecap: round"
        />
      </template>
    </svg>
  </span>
</template>

<style scoped>
.capsule {
  position: relative;
  display: inline-flex;
  flex: none;
}
svg {
  display: block;
  overflow: visible;
}
.pulse {
  fill: none;
  stroke: var(--accent);
  stroke-width: 1.6;
  stroke-linecap: round;
  animation: capPulse 1s ease-in-out infinite;
}
.pulse-dot {
  fill: var(--accent);
  animation: capPulse 1.2s ease-in-out infinite;
}
</style>

<style>
@keyframes capBlink {
  0%,
  93%,
  100% {
    transform: scaleY(1);
  }
  96% {
    transform: scaleY(0.15);
  }
}
@keyframes capPulse {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 1;
  }
}
</style>
