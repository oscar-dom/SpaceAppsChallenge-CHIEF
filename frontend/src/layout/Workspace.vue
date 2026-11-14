<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { type Divider, flatten, MIN_PANE_H, MIN_PANE_W, minSize, nodeAt } from '../lib/layout';
import { NOTIF_RAIL_W, NOTIF_W } from '../lib/shell';
import { useUiStore } from '../stores/ui';
import { useWorkspaceStore } from '../stores/workspace';
import PaneView from './PaneView.vue';

/** Centre workspace: panes of tabs placed by the layout tree, with draggable dividers. */
const ws = useWorkspaceStore();
const ui = useUiStore();
const main = ref<HTMLElement | null>(null);
const root = ref<HTMLDivElement | null>(null);

/**
 * Tells the store how much room the panes have. A new alert can open the notifications
 * panel at any moment, so its full width is always kept free: the panes never have to
 * shrink or merge because an alert arrived.
 */
function measure() {
  const el = main.value;
  if (!el) return;
  const reserve = ui.notifOpen ? 0 : NOTIF_W - NOTIF_RAIL_W;
  ws.setArea({ w: el.clientWidth - reserve, h: el.clientHeight });
}

let observer: ResizeObserver | undefined;
onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  if (main.value) observer.observe(main.value);
});
onBeforeUnmount(() => observer?.disconnect());

const placed = computed(() => flatten(ws.layout));
const multi = computed(() => placed.value.panes.length > 1);
const least = computed(() => minSize(placed.value.panes));
const pct = (v: number) => `${(v * 100).toFixed(4)}%`;

function dividerStyle(d: Divider) {
  return d.dir === 'row'
    ? {
        left: pct(d.x),
        top: pct(d.y),
        width: '6px',
        height: pct(d.len),
        transform: 'translateX(-3px)',
        cursor: 'col-resize',
      }
    : {
        left: pct(d.x),
        top: pct(d.y),
        width: pct(d.len),
        height: '6px',
        transform: 'translateY(-3px)',
        cursor: 'row-resize',
      };
}

function startResize(e: MouseEvent, d: Divider) {
  e.preventDefault();
  const rect = root.value?.getBoundingClientRect();
  const node = nodeAt(ws.layout, d.path);
  if (!rect || node.type !== 'split') return;
  const px = (d.dir === 'row' ? rect.width : rect.height) * d.span;
  const start = d.dir === 'row' ? e.clientX : e.clientY;
  const sizes0 = [...node.sizes];
  const minFrac = (d.dir === 'row' ? MIN_PANE_W : MIN_PANE_H) / px;
  const move = (ev: MouseEvent) =>
    ws.resize(
      d.path,
      d.i,
      sizes0,
      ((d.dir === 'row' ? ev.clientX : ev.clientY) - start) / px,
      minFrac,
    );
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}
</script>

<template>
  <main ref="main" class="workspace">
    <!-- The store keeps the layout inside the measured room; the minimum size is only a last
         guard for a window too small for even one pane. -->
    <div ref="root" class="canvas" :style="{ minWidth: `${least.w}px`, minHeight: `${least.h}px` }">
      <PaneView
        v-for="p in placed.panes"
        :key="p.pane.id"
        :pane="p.pane"
        :can-close="multi"
        :style="{
          left: pct(p.x),
          top: pct(p.y),
          width: pct(p.w),
          height: pct(p.h),
          borderLeft: p.x > 0.001 ? '1px solid var(--border)' : '0',
          borderTop: p.y > 0.001 ? '1px solid var(--border)' : '0',
        }"
      />
      <div
        v-for="(d, i) in placed.dividers"
        :key="'div' + i"
        class="divider"
        :style="dividerStyle(d)"
        @mousedown="startResize($event, d)"
      />
    </div>
  </main>
</template>

<style scoped>
.workspace {
  flex: 1;
  min-width: 0;
  overflow: auto;
  background: var(--bg);
}
.canvas {
  position: relative;
  width: 100%;
  height: 100%;
}
.divider {
  position: absolute;
  z-index: 20;
}
.divider:hover {
  background: color-mix(in srgb, var(--accent) 55%, transparent);
}
</style>
