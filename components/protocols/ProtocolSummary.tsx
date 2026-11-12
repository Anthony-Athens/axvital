"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { calculateProtocolSummary } from "@/lib/protocols/analytics";
import { getProtocolOccurrencesForRange, getUserProtocols } from "@/lib/protocols/protocols";
import { supabase } from "@/lib/supabase/client";
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function ProtocolSummary() {
  const [data, setData] = useState<{
    count: number;
    name: string;
    rate: number;
    done: number;
    total: number;
  } | null>(null);
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const active = await getUserProtocols(supabase, "active");
        if (!active.length)
          return setData({ count: 0, name: "No active protocol", rate: 0, done: 0, total: 0 });
        const date = today();
        let best = { name: active[0].name, rate: 0, done: 0, total: 0 };
        for (const p of active) {
          const rows = await getProtocolOccurrencesForRange(supabase, p.id, p.start_date, date);
          const rate = calculateProtocolSummary(
            rows,
            p.pause_periods ?? [],
            date,
            p.activities ?? [],
          ).overall.percentage;
          const current = rows.filter((r) => r.scheduled_date === date);
          if (rate >= best.rate)
            best = {
              name: p.name,
              rate,
              done: current.filter((r) => r.status === "completed").length,
              total: current.length,
            };
        }
        setData({ count: active.length, ...best });
      } catch {
        setData({ count: 0, name: "Unavailable", rate: 0, done: 0, total: 0 });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <section className="mt-5 rounded-2xl border border-violet-400/25 bg-violet-500/10 p-5 shadow-sm md:p-6">
      <div className="flex justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-violet-300">
            Protocols · {data?.count ?? 0} active
          </p>
          <h2 className="mt-2 text-2xl font-semibold">{data?.name ?? "Loading protocols…"}</h2>
        </div>
        <Link
          href="/protocols"
          className="h-fit rounded-xl bg-accent hover:bg-accent-hover px-4 py-3 text-xs font-semibold text-white"
        >
          View Protocols
        </Link>
      </div>
      {data && data.count ? (
        <p className="mt-3 font-bold text-violet-200">
          {data.done} of {data.total} activities completed today · {data.rate}% adherence
        </p>
      ) : null}
    </section>
  );
}
