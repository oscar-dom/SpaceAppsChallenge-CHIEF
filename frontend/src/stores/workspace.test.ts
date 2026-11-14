import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_PANES, MIN_PANE_H, MIN_PANE_W } from '../lib/layout';
import { useWorkspaceStore } from './workspace';

const roomy = { w: 4000, h: 2000 };

describe('workspace store: pane limits', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('splits right only while there is room and never past the pane limit', () => {
    const ws = useWorkspaceStore();
    ws.setArea(roomy);
    for (let i = 0; i < MAX_PANES + 3; i++) ws.splitRight(ws.panes[ws.panes.length - 1]!.id);
    expect(ws.panes).toHaveLength(MAX_PANES);
    expect(ws.canSplitRight(ws.panes[0]!.id)).toBe(false);
  });

  it('refuses a split that would leave a pane below the minimum width', () => {
    const ws = useWorkspaceStore();
    ws.setArea({ w: 2 * MIN_PANE_W - 1, h: 2 * MIN_PANE_H });
    const id = ws.panes[0]!.id;
    expect(ws.canSplitRight(id)).toBe(false);
    ws.startDrag({ kind: 'section', sec: 'vision' });
    expect(ws.canDrop(id, 'right')).toBe(false);
    expect(ws.canDrop(id, 'bottom')).toBe(true);
    expect(ws.canDrop(id, 'center')).toBe(true);
    ws.drop(id, 'right');
    expect(ws.panes).toHaveLength(1);
  });

  it('merges panes when the workspace shrinks and keeps every section', () => {
    const ws = useWorkspaceStore();
    ws.setArea(roomy);
    ws.splitRight(ws.panes[0]!.id);
    ws.splitRight(ws.panes[1]!.id);
    expect(ws.panes).toHaveLength(3);
    ws.setArea({ w: 2 * MIN_PANE_W + 10, h: MIN_PANE_H });
    expect(ws.panes).toHaveLength(2);
    expect(ws.panes.some((p) => p.id === ws.focus)).toBe(true);
    expect(new Set(ws.panes.flatMap((p) => p.tabs.map((t) => t.sec)))).toEqual(
      new Set(['crew', 'overview']),
    );
  });

  it('brings the merged panes back when the room returns, unless the layout changed', () => {
    const ws = useWorkspaceStore();
    ws.setArea(roomy);
    ws.splitRight(ws.panes[0]!.id);
    const before = ws.panes.map((p) => p.id);
    ws.setArea({ w: MIN_PANE_W, h: MIN_PANE_H });
    expect(ws.panes).toHaveLength(1);
    ws.setArea(roomy);
    expect(ws.panes.map((p) => p.id)).toEqual(before);

    ws.setArea({ w: MIN_PANE_W, h: MIN_PANE_H });
    ws.open('vision');
    ws.setArea(roomy);
    expect(ws.panes).toHaveLength(1);
  });

  it('offers a demo layout only when it fits', () => {
    const ws = useWorkspaceStore();
    ws.setArea({ w: 2 * MIN_PANE_W, h: MIN_PANE_H * 1.5 });
    expect(ws.presetFits('two')).toBe(true);
    expect(ws.presetFits('grid')).toBe(false);
    ws.setArea(roomy);
    expect(ws.presetFits('grid')).toBe(true);
    ws.preset('grid');
    expect(ws.panes).toHaveLength(4);
  });
});
