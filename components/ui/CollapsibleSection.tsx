"use client";
import { ReactNode, useEffect, useState } from "react";

export function usePersistentDisclosure(key: string, defaultExpanded: boolean) {
  const [expanded, setExpanded] = useState(defaultExpanded); const [ready, setReady] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => { const stored = window.localStorage.getItem(key); if (stored !== null) setExpanded(stored === "true"); setReady(true); }, 0); return () => window.clearTimeout(timer); }, [key]);
  useEffect(() => { if (!ready) return; window.localStorage.setItem(key, String(expanded)); }, [expanded, key, ready]);
  return [expanded, setExpanded] as const;
}

export function CollapsibleSection({ id, title, description, status, expanded, onToggle, children }: { id: string; title: string; description?: string; status?: ReactNode; expanded: boolean; onToggle: () => void; children: ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white">
    <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={`${id}-content`} className="flex min-h-16 w-full items-center justify-between gap-4 rounded-xl px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:px-5">
      <span className="min-w-0"><span className="block text-base font-semibold text-slate-900">{title}</span>{description ? <span className="mt-0.5 block text-sm font-normal text-slate-600">{description}</span> : null}</span>
      <span className="flex shrink-0 items-center gap-3">{status}<svg aria-hidden="true" viewBox="0 0 20 20" className={`h-5 w-5 text-slate-500 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 7.5 5 5 5-5"/></svg></span>
    </button>
    <div id={`${id}-content`} hidden={!expanded} className="border-t border-slate-200 p-4 sm:p-5">{children}</div>
  </section>;
}
