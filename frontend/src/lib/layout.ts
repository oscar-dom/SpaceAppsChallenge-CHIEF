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
  return { ...tree, children, sizes: sizes.map((s) => s / total) };
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

/** Which drop zone the pointer is in: the outer quarter of each edge, else the centre. */
export function zoneAt(fx: number, fy: number): Zone {
  const m = Math.min(fx, 1 - fx, fy, 1 - fy);
  if (m >= 0.25) return 'center';
  if (m === fx) return 'left';
  if (m === 1 - fx) return 'right';
  if (m === fy) return 'top';
  return 'bottom';
}
