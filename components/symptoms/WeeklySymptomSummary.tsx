"use client";
import { useEffect, useState } from "react";
import { getRecentSymptomEvents, symptomName } from "@/lib/symptoms/symptoms";
import { createClient } from "@/lib/supabase/browser";
type Row = { name: string; count: number; average: number | null };
export function WeeklySymptomSummary() {
  const [rows, setRows] = useState<Row[]>([]),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getRecentSymptomEvents(createClient(), 100)
      .then((events) => {
        const cutoff = Date.now() - 7 * 86400000,
          map = new Map<string, { count: number; values: number[] }>();
        for (const event of events.filter((e) => new Date(e.started_at).valueOf() >= cutoff)) {
          const name = symptomName(event),
            entry = map.get(name) ?? { count: 0, values: [] };
          entry.count++;
          if (event.severity != null) entry.values.push(event.severity);
          map.set(name, entry);
        }
        setRows(
          [...map]
            .map(([name, x]) => ({
              name,
              count: x.count,
              average: x.values.length
                ? Number((x.values.reduce((a, b) => a + b, 0) / x.values.length).toFixed(1))
                : null,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5),
        );
      })
      .catch(() => setRows([]))
      .finally(() => setLoaded(true));
  }, []);
  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-sm md:p-8">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">
        Symptoms this week
      </p>
      {!loaded ? (
        <p className="mt-3 text-sm text-fg-3">Loading symptom summary…</p>
      ) : rows.length ? (
        <div className="mt-4 divide-y divide-line">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="font-semibold text-fg">{r.name}</p>
                <p className="text-sm text-fg-3">
                  {r.count} occurrence{r.count === 1 ? "" : "s"}
                </p>
              </div>
              <p className="text-sm font-semibold text-fg-2">
                {r.average == null ? "No severity recorded" : `Average severity ${r.average}`}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-fg-3">
          No structured symptom occurrences logged this week.
        </p>
      )}
    </section>
  );
}
