import type { Alert } from '@chief/shared';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from './ui';

const alert = (kind: Alert['kind']): Alert => ({
  id: `a-${kind}`,
  crewMemberId: 'C001',
  kind,
  system: 'nutrition',
  severity: kind === 'anomaly' ? 'critical' : 'info',
  title: 'Alert',
  message: '',
  escalation: 'self-care',
  createdAt: '2026-11-14T10:00:00Z',
  acknowledged: false,
});

describe('ui store: a new alert', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('opens a collapsed panel and explains why', () => {
    const ui = useUiStore();
    ui.toggleNotif();
    ui.alertArrived(alert('anomaly'));
    expect(ui.notifOpen).toBe(true);
    expect(ui.notifTab).toBe('alerts');
    expect(ui.autoNotice).toBe(true);
  });

  it('brings an anomaly to the front without shifting an open panel', () => {
    const ui = useUiStore();
    ui.notifTab = 'tasks';
    ui.alertArrived(alert('anomaly'));
    expect(ui.notifTab).toBe('alerts');
    expect(ui.autoNotice).toBe(false);
  });

  it('never switches an open panel to Tasks for a reminder', () => {
    const ui = useUiStore();
    ui.alertArrived(alert('scheduled'));
    expect(ui.notifTab).toBe('alerts');
  });

  it('only raises the badge for a reminder when the panel is collapsed', () => {
    const ui = useUiStore();
    ui.toggleNotif();
    ui.alertArrived(alert('scheduled'));
    expect(ui.notifOpen).toBe(false);
    expect(ui.autoNotice).toBe(false);
    expect(ui.unread).toBe(1);
  });
});
