"use client";
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { subscribeToScheduleChanges } from './schedule-events';

// Next preserves client state on some navigations. Re-read on route changes,
// returning to a tab, and committed schedule edits; router.refresh alone does
// not re-run these browser-side Supabase queries.
export function useScheduleRefresh(load: () => Promise<void>) {
  const pathname = usePathname();
  useEffect(() => {
    const refresh = () => { void load(); };
    const timer = window.setTimeout(refresh, 0);
    const unsubscribe = subscribeToScheduleChanges(refresh);
    return () => { window.clearTimeout(timer); unsubscribe(); };
  }, [load, pathname]);
}
