import { describe, expect, it } from 'vitest';
import {
  allowedZones,
  allPanes,
  flatten,
  type LayoutNode,
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

  it('offers a split only when both halves keep the minimum pane size', () => {
    const all = ['bottom', 'center', 'left', 'right', 'top'];
    expect([...allowedZones(2 * MIN_PANE_W, 2 * MIN_PANE_H, 1)].sort()).toEqual(all);
    expect([...allowedZones(2 * MIN_PANE_W - 1, 2 * MIN_PANE_H, 1)].sort()).toEqual([
      'bottom',
      'center',
      'top',
    ]);
    expect([...allowedZones(2 * MIN_PANE_W, 2 * MIN_PANE_H - 1, 1)].sort()).toEqual([
      'center',
      'left',
      'right',
    ]);
    expect([...allowedZones(4000, 4000, MAX_PANES)]).toEqual(['center']);
  });
});
