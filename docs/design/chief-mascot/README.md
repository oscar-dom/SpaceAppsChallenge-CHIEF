# CHIEF mascot: Capsule

The visual identity of CHIEF, the AI assistant: a medicine capsule dressed as an
astronaut. Half helmet, half pill, so it reads as "health" and "space" at once and stays
recognisable at icon size.

Chosen by the team on 2026-11-14 from four concepts (Pulse, Capsule, Orbit, Bit).
Design canvas with all concepts: https://claude.ai/artifact/XvQQ58YK83SK9F6BgcTUgZ
(private to its owner; ask Óscar for access).

| File | What it is |
|---|---|
| `chief-capsule.svg` | The mascot, vector, with every state and animation in CSS. Source of truth. |
| `preview.html` | Shows the four states side by side. Serve the folder (`npx serve docs/design/chief-mascot`) and open it. |

## States

Set one state class next to `chief` on the root `<svg>`:

| Class | When | What it does |
|---|---|---|
| `idle` | Default, nothing happening | Floats with a gentle tilt and blinks |
| `listening` | The crew member is talking (push-to-talk held, STT running) | A halo pulses and the right arm waves |
| `thinking` | Waiting for the agent's answer | Eyes narrow, three dots orbit |
| `alert` | An unacknowledged `caution`/`critical` alert exists | Pill half turns amber, shakes, warning badge |

`prefers-reduced-motion` turns every animation off.

## Colors

| Token | Value | Use |
|---|---|---|
| `--chief-accent` | `#38BDF8` | Capsule half, eyes, smile, halo, dots |
| `--chief-accent` in `alert` | `#F59E0B` | Same parts, in the alert state |
| Helmet | `#E2E8F0` | Top half, arms |
| Feet | `#CBD5E1` | |
| Visor | `#0F172A` | |
| App background | `#0B1220` (cards `#111A2E`) | Designed against this dark navy |

The mascot deliberately avoids green and red: those mean `nominal` and `critical` in the
health UI, and the mascot must never be mistaken for a status. Blue and amber also stay
distinguishable for colour-blind users.

## Integrating it in the frontend (Vue)

Inline the SVG (an `<img>` cannot change state). Suggested component,
`frontend/src/components/ChiefMascot.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import svg from '../../../docs/design/chief-mascot/chief-capsule.svg?raw';

type ChiefState = 'idle' | 'listening' | 'thinking' | 'alert';
const props = withDefaults(defineProps<{ state?: ChiefState; size?: number }>(), {
  state: 'idle',
  size: 96,
});

// Swap the state class written in the file for the current one.
const markup = computed(() =>
  svg.replace('class="chief idle"', `class="chief ${props.state}" width="${props.size}" height="${props.size}"`),
);
</script>

<template>
  <span class="chief-mascot" v-html="markup" />
</template>
```

(`?raw` is Vite's raw import; copy the SVG into `frontend/src/assets/` instead if you
prefer not to import from `docs/`.)

Where it appears:

- **Talk to CHIEF** button at the bottom of the left menu: small (40-48 px), `idle`, or
  `alert` when there are unacknowledged alerts.
- **CHIEF chat panel** header: larger (96-120 px), driven by the conversation:
  `listening` while recording, `thinking` while waiting for `/api/chief/chat`, back to
  `idle` when the answer arrives (`alert` if alerts are pending).
- **Alert actions**: `thinking` while CHIEF prepares the recommended actions.

The `fallback: true` answers (Gemini down) can keep the mascot in `idle`; the UI shows
the "rules engine only" note next to the answer, not on the mascot.
