import type { Alert } from '@chief/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';

const THEME_KEY = 'chief.theme';

function readTheme(): 'dark' | 'light' {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Panels and other view state that is not data. */
export const useUiStore = defineStore('ui', () => {
  const navCollapsed = ref(false);
  const notifOpen = ref(true);
  const notifTab = ref<'alerts' | 'tasks'>('alerts');
  const alertFilter = ref<'all' | 'member'>('all');
  /** Alert briefly highlighted after it arrived. */
  const highlight = ref<string | null>(null);
  /** Set when the panel opened by itself for a new alert. */
  const autoNotice = ref(false);
  const unread = ref(0);
  const chatOpen = ref(false);
  const theme = ref<'dark' | 'light'>(readTheme());
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;

  function applyTheme() {
    document.documentElement.dataset.theme = theme.value;
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(THEME_KEY, theme.value);
    } catch {
      // Private mode: the theme just is not remembered.
    }
    applyTheme();
  }

  /**
   * A new alert always opens the notifications panel, even if the user collapsed it. An
   * anomaly brings the Alerts tab to the front; a scheduled reminder only switches to Tasks
   * when the panel was closed, so it never pulls the list away from under the cursor.
   */
  function alertArrived(alert: Alert) {
    const wasOpen = notifOpen.value;
    notifOpen.value = true;
    if (alert.kind === 'anomaly') {
      notifTab.value = 'alerts';
      alertFilter.value = 'all';
    } else if (!wasOpen) {
      notifTab.value = 'tasks';
    }
    // The notice explains why a collapsed panel opened; it would only shift an open one.
    if (!wasOpen) autoNotice.value = alert.kind === 'anomaly';
    unread.value++;
    highlight.value = alert.id;
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => (highlight.value = null), 5000);
  }

  function toggleNotif() {
    notifOpen.value = !notifOpen.value;
    unread.value = 0;
    autoNotice.value = false;
  }

  function showAlerts(filter: 'all' | 'member' = 'all') {
    notifOpen.value = true;
    notifTab.value = 'alerts';
    alertFilter.value = filter;
  }

  function showTasks() {
    notifOpen.value = true;
    notifTab.value = 'tasks';
  }

  return {
    navCollapsed,
    notifOpen,
    notifTab,
    alertFilter,
    highlight,
    autoNotice,
    unread,
    chatOpen,
    theme,
    applyTheme,
    toggleTheme,
    alertArrived,
    toggleNotif,
    showAlerts,
    showTasks,
  };
});
