const SCHEDULE_EVENT = 'axvital:schedule-changed';

// No workout/user data is stored; the value only invalidates client-side readers.
export function notifyScheduleChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SCHEDULE_EVENT));
  try { window.localStorage.setItem(SCHEDULE_EVENT, `${Date.now()}:${Math.random()}`); } catch { /* Storage may be disabled. Same-tab invalidation still works. */ }
}

export function subscribeToScheduleChanges(refresh: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === SCHEDULE_EVENT) refresh(); };
  const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
  window.addEventListener(SCHEDULE_EVENT, refresh);
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener(SCHEDULE_EVENT, refresh);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('pageshow', refresh);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
