import type { Period } from '@chief/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  accept,
  allPanes,
  applyDrop,
  type Area,
  balance,
  clone,
  type DragInfo,
  findPane,
  fitLayout,
  fits,
  type LayoutNode,
  mkPane,
  mkSplit,
  mkTab,
  nodeAt,
  paneOf,
  removePane,
  splitPane,
  takeTab,
  type Zone,
} from '../lib/layout';
import type { SectionId } from '../lib/sections';

export type { DragInfo };

export type PresetId = 'single' | 'two' | 'grid' | 'reset';

/** The demo layouts of the Layouts menu. */
function presetTree(name: PresetId): LayoutNode {
  if (name === 'single') return mkPane(['crew', 'overview', 'cardiovascular'], 1);
  if (name === 'two')
    return mkSplit('row', [mkPane(['overview', 'cardiovascular'], 1), mkPane(['sleep-cognition'])]);
  if (name === 'grid')
    return mkSplit('col', [
      mkSplit('row', [mkPane(['overview']), mkPane(['vision'])]),
      mkSplit('row', [mkPane(['radiation']), mkPane(['immune'])]),
    ]);
  return mkPane(['crew', 'overview'], 0);
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const layout = ref<LayoutNode>(presetTree('reset'));
  const focus = ref<string>(allPanes(layout.value)[0]?.id ?? '');
  /**
   * Room for panes, measured by the workspace (null until it is mounted). Every layout
   * change is checked against it, so panes never shrink below the minimum size and never
   * spill out of the workspace.
   */
  const area = ref<Area | null>(null);
  /**
   * The layout as the user left it before a smaller workspace forced panes to merge (the chat
   * opened, the window shrank). It comes back when there is room again, unless the user
   * changed the layout in between.
   */
  let stash: { tree: LayoutNode; focus: string } | null = null;
  const drag = ref<DragInfo | null>(null);
  /** Drop zone under the pointer while dragging over a pane's content. */
  const dropZone = ref<{ paneId: string; zone: Zone } | null>(null);
  /** Insertion point while dragging over a pane's tab bar. */
  const dropTab = ref<{ paneId: string; index: number } | null>(null);

  const panes = computed(() => allPanes(layout.value));
  const focusedPane = computed(
    () => panes.value.find((p) => p.id === focus.value) ?? panes.value[0],
  );
  const focusedSection = computed<SectionId | null>(() => {
    const p = focusedPane.value;
    return p?.tabs.find((t) => t.id === p.active)?.sec ?? null;
  });

  /** The layout a split or a drop would produce, or null when it does not fit. */
  function candidate(tree: LayoutNode): LayoutNode | null {
    return area.value ? accept(tree, area.value) : tree;
  }

  function show(tree: LayoutNode, nextFocus?: string) {
    layout.value = area.value ? fitLayout(tree, area.value) : tree;
    const ids = allPanes(layout.value).map((p) => p.id);
    focus.value = nextFocus && ids.includes(nextFocus) ? nextFocus : (ids[0] ?? '');
  }

  /** A layout change made by the user. */
  function set(tree: LayoutNode, nextFocus?: string) {
    stash = null;
    show(tree, nextFocus);
  }

  /**
   * New room for panes: a layout that no longer fits is balanced, then merged, and the
   * user's layout comes back once it fits again.
   */
  function setArea(next: Area) {
    const cur = area.value;
    if (cur && Math.abs(cur.w - next.w) < 1 && Math.abs(cur.h - next.h) < 1) return;
    area.value = next;
    if (stash && fits(stash.tree, next)) {
      show(stash.tree, stash.focus);
      stash = null;
    } else if (!fits(layout.value, next)) {
      stash ??= { tree: layout.value, focus: focus.value };
      show(layout.value, focus.value);
    }
  }

  /** Opens a section in the focused pane, or activates it if it is already there. */
  function open(sec: SectionId) {
    const tree = clone(layout.value);
    const p = findPane(tree, focus.value) ?? allPanes(tree)[0];
    if (!p) return;
    const existing = p.tabs.find((t) => t.sec === sec);
    if (existing) p.active = existing.id;
    else {
      const t = mkTab(sec);
      p.tabs.splice(p.tabs.findIndex((x) => x.id === p.active) + 1, 0, t);
      p.active = t.id;
    }
    set(tree, p.id);
  }

  function activate(paneId: string, tabId: string) {
    const tree = clone(layout.value);
    const p = findPane(tree, paneId);
    if (p) p.active = tabId;
    // Switching tabs does not change the layout, so a stashed layout can still come back.
    show(tree, paneId);
  }

  function setPeriod(paneId: string, tabId: string, period: Period) {
    const tree = clone(layout.value);
    const t = findPane(tree, paneId)?.tabs.find((x) => x.id === tabId);
    if (t) t.period = period;
    stash = null;
    layout.value = tree;
  }

  function closeTab(paneId: string, tabId: string) {
    let tree: LayoutNode = clone(layout.value);
    const p = findPane(tree, paneId);
    if (!p) return;
    takeTab(p, tabId);
    if (!p.tabs.length && allPanes(tree).length > 1) tree = removePane(tree, paneId) ?? tree;
    set(tree, focus.value);
  }

  function closePane(paneId: string) {
    set(removePane(clone(layout.value), paneId) ?? mkPane(['crew']));
  }

  /** Layout after opening the active tab of a pane again in a new pane to its right. */
  function splitRightTree(paneId: string): { tree: LayoutNode; focus: string } | null {
    const p = findPane(layout.value, paneId);
    const active = p?.tabs.find((t) => t.id === p.active);
    if (!active) return null;
    const np = paneOf(mkTab(active.sec, active.period));
    const tree = candidate(splitPane(clone(layout.value), paneId, 'right', np));
    return tree ? { tree, focus: np.id } : null;
  }

  function canSplitRight(paneId: string): boolean {
    return splitRightTree(paneId) !== null;
  }

  function splitRight(paneId: string) {
    const next = splitRightTree(paneId);
    if (next) set(next.tree, next.focus);
  }

  /** Layout after dropping what is being dragged, or null when it changes nothing or does not fit. */
  function dropTree(paneId: string, zone: Zone, index?: number) {
    if (!drag.value) return null;
    const next = applyDrop(layout.value, drag.value, paneId, zone, index);
    const tree = next && candidate(next.tree);
    return next && tree ? { tree, focus: next.focus } : null;
  }

  /** Whether dropping what is being dragged on this zone of a pane is allowed. */
  function canDrop(paneId: string, zone: Zone): boolean {
    return zone === 'center' || dropTree(paneId, zone) !== null;
  }

  /** Drops what is being dragged on a pane: into it (center) or as a new split beside it. */
  function drop(paneId: string, zone: Zone, index?: number) {
    const next = dropTree(paneId, zone, index);
    endDrag();
    if (next) set(next.tree, next.focus);
  }

  function startDrag(info: DragInfo) {
    drag.value = info;
  }

  function endDrag() {
    drag.value = null;
    dropZone.value = null;
    dropTab.value = null;
  }

  /**
   * Resizes the two children of a split around a divider; `delta` is a fraction of it.
   * `minFrac` is the minimum pane size as a fraction of the split, so neither side shrinks
   * below it (when the two cannot both fit, the space is shared equally).
   */
  function resize(path: number[], i: number, sizes0: number[], delta: number, minFrac = 0.15) {
    const tree = clone(layout.value);
    const n = nodeAt(tree, path);
    if (n.type !== 'split') return;
    const total = (sizes0[i] ?? 0) + (sizes0[i + 1] ?? 0);
    const min = Math.min(minFrac, total / 2);
    const a = Math.max(min, Math.min(total - min, (sizes0[i] ?? 0) + delta));
    n.sizes[i] = a;
    n.sizes[i + 1] = total - a;
    stash = null;
    layout.value = tree;
  }

  /** A demo layout fits when its panes keep the minimum size in the current workspace. */
  function presetFits(name: PresetId): boolean {
    return !area.value || fits(balance(presetTree(name)), area.value);
  }

  function preset(name: PresetId) {
    set(presetTree(name));
  }

  return {
    layout,
    focus,
    area,
    drag,
    dropZone,
    dropTab,
    panes,
    focusedSection,
    setArea,
    open,
    activate,
    setPeriod,
    closeTab,
    closePane,
    canSplitRight,
    splitRight,
    canDrop,
    drop,
    startDrag,
    endDrag,
    resize,
    presetFits,
    preset,
  };
});
