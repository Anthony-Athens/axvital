"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { addLocalDays, localDateString, localDayRange } from "@/lib/timeline/dates";
import { loadRecentActivity, type RecentActivityResult } from "@/lib/dashboard/recent-activity";

export function RecentActivity() {
  const [result, setResult] = useState<RecentActivityResult>({ items: [], failedSources: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const requestId = useRef(0);
  useEffect(() => {
    let active = true;
    async function load() {
      const id = ++requestId.current;
      setLoading(true);
      setError(false);
      try {
        const today = localDateString(),
          first = localDayRange(addLocalDays(today, -13)),
          last = localDayRange(today);
        const value = await loadRecentActivity(supabase, {
          start: first.start,
          end: last.end,
          startDate: first.startDate,
          endDate: today,
        });
        if (active && id === requestId.current) setResult(value);
      } catch {
        if (active && id === requestId.current) setError(true);
      } finally {
        if (active && id === requestId.current) setLoading(false);
      }
    }
    const timer = setTimeout(() => void load(), 0);
    const refresh = () => void load();
    window.addEventListener("axvital:timeline-refresh", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener("axvital:timeline-refresh", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [revision]);
  const retry = (
    <button
      onClick={() => setRevision((value) => value + 1)}
      className="min-h-11 shrink-0 rounded-lg px-3 font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent-fg"
    >
      Retry
    </button>
  );
  return (
    <section
      aria-labelledby="recent-activity-title"
      className="mt-8 rounded-2xl border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="recent-activity-title" className="text-xl font-semibold">
            Recent Activity
          </h2>
          <p className="mt-1 text-sm text-fg-3">
            What you logged · Latest 12 from the past 14 days
          </p>
        </div>
        <Link
          href="/health/timeline"
          className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-blue-300 focus-visible:outline-2 focus-visible:outline-accent-fg"
        >
          View timeline →
        </Link>
      </div>
      {error || result.failedSources.length ? (
        <div
          role="status"
          className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-amber-500/10 px-3 text-sm text-amber-100"
        >
          <span>
            {error
              ? "Recent activity could not be refreshed. Previously loaded items may be out of date."
              : "Some activity sources are unavailable. This list may be incomplete."}
          </span>
          {retry}
        </div>
      ) : null}
      {loading ? (
        <div aria-busy="true" aria-label="Loading recent activity" className="mt-4 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-raised" />
          ))}
        </div>
      ) : (
        <>
          {!result.items.length && !error && !result.failedSources.length ? (
            <div className="py-6">
              <h3 className="font-semibold">No recent activity yet</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-fg-2">
                Log a meal, supplement, workout, symptom, or other health event to start building
                your health timeline.
              </p>
              <Link
                href="/today"
                className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-fg"
              >
                Go to Today
              </Link>
            </div>
          ) : null}
          <ol className="mt-3 divide-y divide-line">
            {result.items.map((item) => (
              <li key={item.id} className="py-4">
                <Link
                  href={item.href}
                  className="flex min-h-11 min-w-0 flex-col gap-1 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-fg sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-fg-3">
                      {item.category}
                    </p>
                    <p className="mt-1 break-words font-medium text-fg [overflow-wrap:anywhere]">
                      {item.title}
                    </p>
                    {item.detail ? (
                      <p className="mt-1 break-words text-sm text-fg-2">{item.detail}</p>
                    ) : null}
                  </div>
                  <time
                    dateTime={item.occurredAt ?? item.logicalDate}
                    className="shrink-0 text-sm leading-6 text-fg-3"
                  >
                    {item.occurredAt
                      ? new Intl.DateTimeFormat(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(new Date(item.occurredAt))
                      : `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${item.logicalDate}T12:00:00`))} · Time not recorded`}
                  </time>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
