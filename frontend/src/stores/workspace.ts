import type { Period } from '@chief/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  allPanes,
  clone,
  findPane,
  type LayoutNode,
  mkPane,
  mkSplit,
  mkTab,
  nodeAt,
  type Pane,
  removePane,
  splitPane,
  type Zone,
} from '../lib/layout';
import type { SectionId } from '../lib/sections';

/** What is being dragged: a section from the left panel or a tab from a pane. */
export type DragInfo =
  | { kind: 'section'; sec: SectionId }
  | { kind: 'tab'; sec: SectionId; paneId: string; tabId: string };

export const useWorkspaceStore = defineStore('workspace', () => {
  const layout = ref<LayoutNode>(mkPane(['crew', 'overview'], 0));
  const focus = ref<string>(allPanes(layout.value)[0]?.id ?? '');
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

  function set(tree: LayoutNode, nextFocus?: string) {
    layout.value = tree;
    const ids = allPanes(tree).map((p) => p.id);
    focus.value = nextFocus && ids.includes(nextFocus) ? nextFocus : (ids[0] ?? '');
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
    set(tree, paneId);
  }

  function setPeriod(paneId: string, tabId: string, period: Period) {
    const tree = clone(layout.value);
    const t = findPane(tree, paneId)?.tabs.find((x) => x.id === tabId);
    if (t) t.period = period;
    layout.value = tree;
  }

  function takeTab(p: Pane, tabId: string) {
    const i = p.tabs.findIndex((t) => t.id === tabId);
    const [tab] = p.tabs.splice(i, 1);
    if (p.active === tabId) p.active = p.tabs[Math.max(0, i - 1)]?.id ?? null;
    return tab;
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

  /** Opens the active tab of a pane again in a new pane to its right. */
  function splitRight(paneId: string) {
    const p = findPane(layout.value, paneId);
    const active = p?.tabs.find((t) => t.id === p.active);
    if (!active) return;
    const t = mkTab(active.sec, active.period);
    const np: Pane = { type: 'pane', id: `${paneId}-r${Date.now()}`, tabs: [t], active: t.id };
    set(splitPane(clone(layout.value), paneId, 'right', np), np.id);
  }

  /** Drops what is being dragged on a pane: into it (center) or as a new split beside it. */
  function drop(paneId: string, zone: Zone, index?: number) {
    const d = drag.value;
    endDrag();
    if (!d) return;
    let tree: LayoutNode = clone(layout.value);
    let tab;
    if (d.kind === 'tab') {
      const src = findPane(tree, d.paneId);
      if (!src) return;
      if (zone !== 'center' && d.paneId === paneId && src.tabs.length === 1) return;
      let at = index;
      if (at !== undefined && d.paneId === paneId) {
        const from = src.tabs.findIndex((t) => t.id === d.tabId);
        if (from < at) at--;
      }
      index = at;
      tab = takeTab(src, d.tabId);
    } else tab = mkTab(d.sec);
    if (!tab) return;
    let nextFocus = paneId;
    if (zone === 'center') {
      const target = findPane(tree, paneId);
      if (!target) return;
      const existing = target.tabs.find((t) => t.sec === tab.sec);
      if (existing && d.kind === 'section') target.active = existing.id;
      else {
        if (existing) target.tabs.splice(target.tabs.indexOf(existing), 1);
        const at = index === undefined ? target.tabs.length : Math.min(index, target.tabs.length);
        target.tabs.splice(at, 0, tab);
        target.active = tab.id;
      }
    } else {
      const np: Pane = { type: 'pane', id: `p-${tab.id}`, tabs: [tab], active: tab.id };
      tree = splitPane(tree, paneId, zone, np);
      nextFocus = np.id;
    }
    if (d.kind === 'tab') {
      const src = findPane(tree, d.paneId);
      if (src && !src.tabs.length) tree = removePane(tree, d.paneId) ?? mkPane(['crew']);
    }
    set(tree, nextFocus);
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
    layout.value = tree;
  }

  /** Demo layouts from the Scenarios menu. */
  function preset(name: 'single' | 'two' | 'grid' | 'reset') {
    if (name === 'single') set(mkPane(['crew', 'overview', 'cardiovascular'], 1));
    else if (name === 'two')
      set(mkSplit('row', [mkPane(['overview', 'cardiovascular'], 1), mkPane(['sleep-cognition'])]));
    else if (name === 'grid')
      set(
        mkSplit('col', [
          mkSplit('row', [mkPane(['overview']), mkPane(['vision'])]),
          mkSplit('row', [mkPane(['radiation']), mkPane(['immune'])]),
        ]),
      );
    else set(mkPane(['crew', 'overview'], 0));
  }

  return {
    layout,
    focus,
    drag,
    dropZone,
    dropTab,
    panes,
    focusedSection,
    open,
    activate,
    setPeriod,
    closeTab,
    closePane,
    splitRight,
    drop,
    startDrag,
    endDrag,
    resize,
    preset,
  };
});
