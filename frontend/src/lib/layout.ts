import type { Period } from '@chief/shared';
import type { SectionId } from './sections';

/**
 * Workspace layout: a tree of splits whose leaves are panes of tabs, like editor groups in
 * Visual Studio Code. Every function is pure and returns a new tree.
 */
export interface Tab {
  id: string;
  sec: SectionId;
  period: Period;
}

export interface Pane {
  type: 'pane';
  id: string;
  tabs: Tab[];
  active: string | null;
}

export interface Split {
  type: 'split';
  /** row: children side by side; col: children stacked. */
  dir: 'row' | 'col';
  children: LayoutNode[];
  /** Fractions of the split, one per child, summing to 1. */
  sizes: number[];
}

export type LayoutNode = Pane | Split;
export type Zone = 'left' | 'right' | 'top' | 'bottom' | 'center';

let counter = 0;
const nid = (prefix: string) => `${prefix}${++counter}`;

export function mkTab(sec: SectionId, period: Period = 'week'): Tab {
  return { id: nid('t'), sec, period };
}

export function mkPane(secs: SectionId[], activeIndex = 0): Pane {
  const tabs = secs.map((s) => mkTab(s));
  return { type: 'pane', id: nid('p'), tabs, active: tabs[activeIndex]?.id ?? null };
}

export function mkSplit(dir: Split['dir'], children: LayoutNode[]): Split {
  return { type: 'split', dir, children, sizes: children.map(() => 1 / children.length) };
}

/** Deep copy. The tree is plain JSON; structuredClone would reject Vue's reactive proxies. */
export function clone<T extends LayoutNode>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T;
}

export function allPanes(node: LayoutNode): Pane[] {
  return node.type === 'pane' ? [node] : node.children.flatMap(allPanes);
}

export function findPane(node: LayoutNode, id: string): Pane | undefined {
  return allPanes(node).find((p) => p.id === id);
}

/** Splits pane `paneId` and puts `newPane` on the `zone` side of it. */
export function splitPane(
  tree: LayoutNode,
  paneId: string,
  zone: Exclude<Zone, 'center'>,
  newPane: Pane,
): LayoutNode {
  const dir: Split['dir'] = zone === 'left' || zone === 'right' ? 'row' : 'col';
  const before = zone === 'left' || zone === 'top';
  const visit = (node: LayoutNode): LayoutNode => {
    if (node.type === 'pane') {
      if (node.id !== paneId) return node;
      return mkSplit(dir, before ? [newPane, node] : [node, newPane]);
    }
    const i = node.children.findIndex((c) => c.type === 'pane' && c.id === paneId);
    if (i >= 0 && node.dir === dir) {
      // Same direction: insert next to the pane and share its space.
      const half = (node.sizes[i] ?? 0) / 2;
      const children = [...node.children];
      const sizes = [...node.sizes];
      children.splice(before ? i : i + 1, 0, newPane);
      sizes.splice(i, 1, half, half);
      return { ...node, children, sizes };
    }
    return { ...node, children: node.children.map(visit) };
  };
  return visit(tree);
}

/** Removes a pane; a split left with one child collapses into it. Null if nothing is left. */
export function removePane(tree: LayoutNode, paneId: string): LayoutNode | null {
  if (tree.type === 'pane') return tree.id === paneId ? null : tree;
  const children: LayoutNode[] = [];
  const sizes: number[] = [];
  tree.children.forEach((child, i) => {
    const next = removePane(child, paneId);
    if (next) {
      children.push(next);
      sizes.push(tree.sizes[i] ?? 0);
    }
  });
  if (!children.length) return null;
  if (children.length === 1) return children[0] as LayoutNode;
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  return normalize({ ...tree, children, sizes: sizes.map((s) => s / total) });
}

/**
 * Lifts a child split of the same direction into its parent (a row inside a row is just a
 * longer row), so equal sizes really mean equal panes.
 */
function normalize(split: Split): Split {
  const children: LayoutNode[] = [];
  const sizes: number[] = [];
  split.children.forEach((child, i) => {
    const f = split.sizes[i] ?? 0;
    if (child.type === 'split' && child.dir === split.dir) {
      child.children.forEach((c, j) => {
        children.push(c);
        sizes.push(f * (child.sizes[j] ?? 0));
      });
    } else {
      children.push(child);
      sizes.push(f);
    }
  });
  return { ...split, children, sizes };
}

/** Every split shares its space equally among its children. */
export function balance(node: LayoutNode): LayoutNode {
  if (node.type === 'pane') return node;
  const n = node.children.length;
  return { ...node, children: node.children.map(balance), sizes: node.children.map(() => 1 / n) };
}

/** Node at a path of child indexes from the root. */
export function nodeAt(tree: LayoutNode, path: number[]): LayoutNode {
  return path.reduce<LayoutNode>(
    (n, i) => (n.type === 'split' ? (n.children[i] as LayoutNode) : n),
    tree,
  );
}

export interface PlacedPane {
  pane: Pane;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A draggable divider between children `i` and `i + 1` of the split at `path`. */
export interface Divider {
  dir: Split['dir'];
  path: number[];
  i: number;
  x: number;
  y: number;
  len: number;
  /** Size of the split along its direction, as a fraction of the workspace. */
  span: number;
}

/** Positions of every pane and divider as fractions (0–1) of the workspace. */
export function flatten(tree: LayoutNode): { panes: PlacedPane[]; dividers: Divider[] } {
  const panes: PlacedPane[] = [];
  const dividers: Divider[] = [];
  const walk = (n: LayoutNode, x: number, y: number, w: number, h: number, path: number[]) => {
    if (n.type === 'pane') {
      panes.push({ pane: n, x, y, w, h });
      return;
    }
    let offset = 0;
    n.children.forEach((child, i) => {
      const f = n.sizes[i] ?? 0;
      if (n.dir === 'row') walk(child, x + offset * w, y, f * w, h, [...path, i]);
      else walk(child, x, y + offset * h, w, f * h, [...path, i]);
      offset += f;
      if (i < n.children.length - 1) {
        dividers.push(
          n.dir === 'row'
            ? { dir: 'row', path, i, x: x + offset * w, y, len: h, span: w }
            : { dir: 'col', path, i, x, y: y + offset * h, len: w, span: h },
        );
      }
    });
  };
  walk(tree, 0, 0, 1, 1, []);
  return { panes, dividers };
}

/** Smallest pane, in pixels, that still fits a section header and readable charts. */
export const MIN_PANE_W = 380;
export const MIN_PANE_H = 280;
/** More panes than this on one screen makes every section too small to read. */
export const MAX_PANES = 4;

/** Room the workspace has for panes, in pixels. */
export interface Area {
  w: number;
  h: number;
}

/**
 * Smallest workspace, in pixels, that keeps every placed pane at the minimum size, whatever
 * share of the workspace each pane has after its dividers were dragged.
 */
export function minSize(panes: PlacedPane[]): Area {
  return {
    w: Math.max(MIN_PANE_W, ...panes.map((p) => MIN_PANE_W / p.w)),
    h: Math.max(MIN_PANE_H, ...panes.map((p) => MIN_PANE_H / p.h)),
  };
}

/** True when the layout has at most MAX_PANES panes and every pane keeps the minimum size. */
export function fits(tree: LayoutNode, area: Area): boolean {
  const { panes } = flatten(tree);
  if (panes.length > MAX_PANES) return false;
  const min = minSize(panes);
  // Half a pixel of slack for rounding in the measured size.
  return min.w <= area.w + 0.5 && min.h <= area.h + 0.5;
}

/**
 * A layout produced by a split or a drop, as it will be shown: kept as is when it fits,
 * with its splits balanced when only that makes it fit, or null when it cannot fit.
 */
export function accept(tree: LayoutNode, area: Area): LayoutNode | null {
  if (fits(tree, area)) return tree;
  const even = balance(tree);
  return fits(even, area) ? even : null;
}

/** Moves the tabs of pane `fromId` into pane `toId` (skipping sections it already has). */
function mergeInto(tree: LayoutNode, fromId: string, toId: string): LayoutNode {
  const next = clone(tree);
  const from = findPane(next, fromId);
  const to = findPane(next, toId);
  if (!from || !to) return tree;
  for (const t of from.tabs) if (!to.tabs.some((x) => x.sec === t.sec)) to.tabs.push(t);
  to.active ??= to.tabs[0]?.id ?? null;
  return removePane(next, fromId) ?? next;
}

/**
 * Makes an existing layout fit a workspace that got smaller (window resized, chat opened):
 * first the splits are balanced, then the last panes are merged into the ones before them
 * until it fits. No tab is lost, and a layout that already fits is returned unchanged.
 */
export function fitLayout(tree: LayoutNode, area: Area): LayoutNode {
  if (fits(tree, area)) return tree;
  let t = balance(tree);
  while (!fits(t, area)) {
    const panes = allPanes(t);
    const last = panes[panes.length - 1];
    const prev = panes[panes.length - 2];
    if (!last || !prev) break;
    t = balance(mergeInto(t, last.id, prev.id));
  }
  return t;
}

/** What is being dragged: a section from the left panel or a tab from a pane. */
export type DragInfo =
  | { kind: 'section'; sec: SectionId }
  | { kind: 'tab'; sec: SectionId; paneId: string; tabId: string };

/** A new pane holding one tab. */
export function paneOf(tab: Tab): Pane {
  return { type: 'pane', id: nid('p'), tabs: [tab], active: tab.id };
}

/** Removes a tab from a pane (in place) and activates its neighbour. */
export function takeTab(p: Pane, tabId: string): Tab | undefined {
  const i = p.tabs.findIndex((t) => t.id === tabId);
  if (i < 0) return undefined;
  const [tab] = p.tabs.splice(i, 1);
  if (p.active === tabId) p.active = p.tabs[Math.max(0, i - 1)]?.id ?? null;
  return tab;
}

/**
 * The layout after dropping `d` on pane `paneId`: into it (`center`, at tab `index` when
 * dropped on the tab bar) or as a new pane on one side of it. Null when the drop changes
 * nothing. The size limits are checked by the caller with `accept`.
 */
export function applyDrop(
  tree: LayoutNode,
  d: DragInfo,
  paneId: string,
  zone: Zone,
  index?: number,
): { tree: LayoutNode; focus: string } | null {
  let next: LayoutNode = clone(tree);
  let tab: Tab | undefined;
  if (d.kind === 'tab') {
    const src = findPane(next, d.paneId);
    if (!src) return null;
    // Splitting a pane with its only tab would leave it where it was.
    if (zone !== 'center' && d.paneId === paneId && src.tabs.length === 1) return null;
    if (index !== undefined && d.paneId === paneId) {
      const from = src.tabs.findIndex((t) => t.id === d.tabId);
      if (from < index) index--;
    }
    tab = takeTab(src, d.tabId);
  } else tab = mkTab(d.sec);
  if (!tab) return null;
  const moved: Tab = tab;
  let focus = paneId;
  if (zone === 'center') {
    const target = findPane(next, paneId);
    if (!target) return null;
    const existing = target.tabs.find((t) => t.sec === moved.sec);
    if (existing && d.kind === 'section') target.active = existing.id;
    else {
      if (existing) target.tabs.splice(target.tabs.indexOf(existing), 1);
      const at = index === undefined ? target.tabs.length : Math.min(index, target.tabs.length);
      target.tabs.splice(at, 0, moved);
      target.active = moved.id;
    }
  } else {
    const np = paneOf(moved);
    next = splitPane(next, paneId, zone, np);
    focus = np.id;
  }
  if (d.kind === 'tab') {
    const src = findPane(next, d.paneId);
    if (src && !src.tabs.length) next = removePane(next, d.paneId) ?? mkPane(['crew']);
  }
  return { tree: next, focus };
}

/** Which drop zone the pointer is in: the outer quarter of each edge, else the centre. */
export function zoneAt(fx: number, fy: number): Zone {
  const m = Math.min(fx, 1 - fx, fy, 1 - fy);
  if (m >= 0.25) return 'center';
  if (m === fx) return 'left';
  if (m === 1 - fx) return 'right';
  if (m === fy) return 'top';
  return 'bottom';
}
