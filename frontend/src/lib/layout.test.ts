import { describe, expect, it } from 'vitest';
import {
  accept,
  allPanes,
  applyDrop,
  fitLayout,
  fits,
  flatten,
  type LayoutNode,
  type Pane,
  MAX_PANES,
  MIN_PANE_H,
  MIN_PANE_W,
  mkPane,
  minSize,
  mkSplit,
  removePane,
  splitPane,
  zoneAt,
} from './layout';

describe('workspace layout', () => {
  it('splits a lone pane into a row or a column', () => {
    const a = mkPane(['overview']);
    const b = mkPane(['vision']);
    const row = splitPane(a, a.id, 'right', b);
    expect(row).toMatchObject({ type: 'split', dir: 'row', sizes: [0.5, 0.5] });
    expect(allPanes(row).map((p) => p.id)).toEqual([a.id, b.id]);

    const col = splitPane(a, a.id, 'top', b);
    expect(col).toMatchObject({ type: 'split', dir: 'col' });
    expect(allPanes(col).map((p) => p.id)).toEqual([b.id, a.id]);
  });

  it('inserts beside a pane in a split of the same direction and shares its space', () => {
    const a = mkPane(['overview']);
    const b = mkPane(['vision']);
    const c = mkPane(['immune']);
    const tree = splitPane(splitPane(a, a.id, 'right', b), b.id, 'right', c);
    expect(tree).toMatchObject({ type: 'split', dir: 'row', sizes: [0.5, 0.25, 0.25] });
    expect(allPanes(tree)).toHaveLength(3);
  });

  it('collapses a split left with one child and renormalises the sizes', () => {
    const a = mkPane(['overview']);
    const b = mkPane(['vision']);
    const c = mkPane(['immune']);
    const tree = mkSplit('row', [a, mkSplit('col', [b, c])]);
    const once = removePane(tree, c.id) as LayoutNode;
    expect(once).toMatchObject({ type: 'split', dir: 'row' });
    expect(allPanes(once).map((p) => p.id)).toEqual([a.id, b.id]);
    expect(removePane(removePane(once, b.id) as LayoutNode, a.id)).toBeNull();
  });

  it('places panes and dividers as fractions of the workspace', () => {
    const grid = mkSplit('col', [
      mkSplit('row', [mkPane(['overview']), mkPane(['vision'])]),
      mkSplit('row', [mkPane(['radiation']), mkPane(['immune'])]),
    ]);
    const { panes, dividers } = flatten(grid);
    expect(panes.map((p) => [p.x, p.y, p.w, p.h])).toEqual([
      [0, 0, 0.5, 0.5],
      [0.5, 0, 0.5, 0.5],
      [0, 0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5, 0.5],
    ]);
    expect(dividers).toHaveLength(3);
  });

  it('picks the drop zone from the pointer position', () => {
    expect(zoneAt(0.5, 0.5)).toBe('center');
    expect(zoneAt(0.05, 0.5)).toBe('left');
    expect(zoneAt(0.95, 0.5)).toBe('right');
    expect(zoneAt(0.5, 0.1)).toBe('top');
    expect(zoneAt(0.5, 0.9)).toBe('bottom');
  });

  it('sizes the workspace so the smallest pane keeps the minimum', () => {
    expect(minSize(flatten(mkPane(['overview'])).panes)).toEqual({ w: MIN_PANE_W, h: MIN_PANE_H });
    const grid = mkSplit('col', [
      mkSplit('row', [mkPane(['overview']), mkPane(['vision'])]),
      mkPane(['immune']),
    ]);
    expect(minSize(flatten(grid).panes)).toEqual({ w: 2 * MIN_PANE_W, h: 2 * MIN_PANE_H });
    const uneven = mkSplit('row', [mkPane(['overview']), mkPane(['vision'])]);
    uneven.sizes = [0.25, 0.75];
    expect(minSize(flatten(uneven).panes).w).toBe(4 * MIN_PANE_W);
  });

  it('lifts a row left inside a row when a pane is removed', () => {
    const [a, b, c, d] = (['overview', 'vision', 'immune', 'radiation'] as const).map((x) =>
      mkPane([x]),
    ) as [Pane, Pane, Pane, Pane];
    const tree = mkSplit('row', [a, mkSplit('col', [b, mkSplit('row', [c, d])])]);
    const next = removePane(tree, b.id) as LayoutNode;
    expect(next.type === 'split' && next.dir).toBe('row');
    expect(next.type === 'split' && next.children.map((n) => n.type)).toEqual([
      'pane',
      'pane',
      'pane',
    ]);
  });

  it('fits a layout only within the pane limit and the minimum pane size', () => {
    const big = { w: 4000, h: 4000 };
    const row = (n: number) =>
      mkSplit(
        'row',
        Array.from({ length: n }, () => mkPane(['vision'])),
      );
    expect(fits(row(MAX_PANES), big)).toBe(true);
    expect(fits(row(MAX_PANES + 1), big)).toBe(false);
    expect(fits(row(2), { w: 2 * MIN_PANE_W, h: MIN_PANE_H })).toBe(true);
    expect(fits(row(2), { w: 2 * MIN_PANE_W - 2, h: MIN_PANE_H })).toBe(false);
  });

  it('accepts a split by balancing the splits, or refuses it', () => {
    const a = mkPane(['overview']);
    const b = mkPane(['vision']);
    const c = mkPane(['immune']);
    // Splitting the right half again gives 50/25/25 (4 × 380 px wide); 3 equal columns fit.
    const three = splitPane(splitPane(a, a.id, 'right', b), b.id, 'right', c);
    const area = { w: 3 * MIN_PANE_W, h: MIN_PANE_H };
    expect(fits(three, area)).toBe(false);
    expect(accept(three, area)).toMatchObject({ sizes: [1 / 3, 1 / 3, 1 / 3] });
    expect(accept(three, { w: 3 * MIN_PANE_W - 10, h: MIN_PANE_H })).toBeNull();
  });

  it('merges the last panes into the previous ones until the layout fits, keeping tabs', () => {
    const a = mkPane(['overview', 'vision']);
    const b = mkPane(['vision', 'immune']);
    const c = mkPane(['radiation']);
    const tree = mkSplit('row', [a, b, c]);
    expect(fitLayout(tree, { w: 4000, h: 4000 })).toBe(tree);
    const two = fitLayout(tree, { w: 2 * MIN_PANE_W, h: MIN_PANE_H });
    expect(allPanes(two).map((p) => p.tabs.map((t) => t.sec))).toEqual([
      ['overview', 'vision'],
      ['vision', 'immune', 'radiation'],
    ]);
    const one = fitLayout(tree, { w: MIN_PANE_W, h: MIN_PANE_H });
    expect(allPanes(one)).toHaveLength(1);
    // A section is never duplicated inside one pane.
    expect(allPanes(one)[0]?.tabs.map((t) => t.sec)).toEqual([
      'overview',
      'vision',
      'immune',
      'radiation',
    ]);
  });

  it('drops a section on an edge as a new pane and on the centre as a tab', () => {
    const a = mkPane(['overview']);
    const side = applyDrop(a, { kind: 'section', sec: 'vision' }, a.id, 'right');
    expect(allPanes(side!.tree).map((p) => p.tabs[0]?.sec)).toEqual(['overview', 'vision']);
    expect(side!.focus).toBe(allPanes(side!.tree)[1]?.id);
    const centre = applyDrop(a, { kind: 'section', sec: 'vision' }, a.id, 'center');
    expect(allPanes(centre!.tree)).toHaveLength(1);
    expect(allPanes(centre!.tree)[0]?.tabs.map((t) => t.sec)).toEqual(['overview', 'vision']);
  });

  it('moves the only tab of a pane without adding a pane, and ignores a no-op split', () => {
    const a = mkPane(['overview']);
    const b = mkPane(['vision']);
    const tree = mkSplit('row', [a, b]);
    const tab = b.tabs[0]!;
    const drag = { kind: 'tab', sec: 'vision', paneId: b.id, tabId: tab.id } as const;
    const moved = applyDrop(tree, drag, a.id, 'bottom');
    expect(allPanes(moved!.tree)).toHaveLength(2);
    expect(moved!.tree).toMatchObject({ type: 'split', dir: 'col' });
    expect(applyDrop(tree, drag, b.id, 'left')).toBeNull();
  });

  it('reorders tabs dropped on the tab bar of their own pane', () => {
    const a = mkPane(['overview', 'vision', 'immune']);
    const first = a.tabs[0]!;
    const drag = { kind: 'tab', sec: 'overview', paneId: a.id, tabId: first.id } as const;
    const next = applyDrop(a, drag, a.id, 'center', 3);
    expect(allPanes(next!.tree)[0]?.tabs.map((t) => t.sec)).toEqual([
      'vision',
      'immune',
      'overview',
    ]);
  });
});
