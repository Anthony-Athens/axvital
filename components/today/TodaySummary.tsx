"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { logDevError } from "@/lib/app-errors";
import { Sparkline } from "@/components/ui/Sparkline";
import {
  checkinStreak,
  scoreTrend,
  sleepSummary,
  windowDates,
  type ScoreTrend,
  type SummaryRow,
} from "@/lib/checkins/summary";

function Delta({ trend }: { trend: ScoreTrend }) {
  if (trend.delta === null) return <span className="text-[13px] text-fg-3">New</span>;
  const up = trend.delta > 0;
  const flat = trend.delta === 0;
  return (
    <span
      className={`text-[13px] font-semibold tabular-nums ${flat ? "text-fg-3" : up ? "text-emerald-300" : "text-amber-300"}`}
    >
      <span aria-hidden="true">{flat ? "—" : up ? "▲" : "▼"}</span>{" "}
      <span className="sr-only">{flat ? "No change" : up ? "Up" : "Down"}</span>
      {flat ? "same" : Math.abs(trend.delta).toFixed(1)}
    </span>
  );
}

function ScoreTile({ label, trend }: { label: string; trend: ScoreTrend }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-surface px-3.5 py-3.5 sm:px-5 sm:py-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-fg-2 sm:text-sm">
          {label}
          <span className="hidden sm:inline"> · 7-day avg</span>
        </span>
        <Delta trend={trend} />
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="text-[26px] font-semibold leading-none tracking-tight tabular-nums sm:text-[32px]">
          {trend.average === null ? "—" : trend.average.toFixed(1)}
        </span>
        <span className="hidden sm:block">
          <Sparkline values={trend.series} />
        </span>
      </div>
      <span className="text-xs text-fg-3 sm:text-[13px]">
        {trend.previous !== null
          ? `vs ${trend.previous.toFixed(1)} the week before`
          : "Not enough history yet"}
      </span>
    </div>
  );
}

/** Seven-day context for the check-in scores. Hidden until there is history to show. */
export function TodaySummary({ today }: { today: string }) {
  const [rows, setRows] = useState<SummaryRow[] | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      const from = windowDates(today, 30)[0];
      supabase
        .from("daily_checkins")
        .select("checkin_date,energy_score,mood_score,sleep_quality")
        .gte("checkin_date", from)
        .lte("checkin_date", today)
        .then(({ data, error }: { data: SummaryRow[] | null; error: unknown }) => {
          if (!active) return;
          if (error) {
            logDevError("Failed to load check-in summary", error);
            setRows([]);
            return;
          }
          setRows(data ?? []);
        });
    };
    load();
    window.addEventListener("axvital:timeline-refresh", load);
    return () => {
      active = false;
      window.removeEventListener("axvital:timeline-refresh", load);
    };
  }, [today]);

  if (!rows || rows.length < 2) return null;
  const energy = scoreTrend(rows, today, "energy_score");
  const mood = scoreTrend(rows, today, "mood_score");
  const sleep = sleepSummary(rows, today);
  const streak = checkinStreak(rows, today);

  return (
    <section
      aria-label="Your last 7 days"
      className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4"
    >
      <ScoreTile label="Energy" trend={energy} />
      <ScoreTile label="Mood" trend={mood} />
      <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-surface px-3.5 py-3.5 sm:px-5 sm:py-4">
        <span className="text-[13px] text-fg-2 sm:text-sm">
          Sleep<span className="hidden sm:inline"> quality · 7 nights</span>
        </span>
        <div className="flex items-end justify-between gap-3">
          <span className="text-[22px] font-semibold leading-none tracking-tight sm:text-[28px]">
            {sleep.typical ?? "—"}
          </span>
          <div aria-hidden="true" className="hidden h-[34px] items-end gap-1 sm:flex">
            {sleep.series.map((value, index) => (
              <span
                key={index}
                className={`w-2.5 rounded-[3px] ${value ? "bg-accent-fg" : "bg-line"}`}
                style={{ height: `${value ? 8 + value * 6 : 6}px` }}
              />
            ))}
          </div>
        </div>
        <span className="text-[13px] text-fg-3">
          {Object.entries(sleep.counts)
            .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
            .map(([quality, count]) => `${count} ${quality}`)
            .join(" · ") || "No sleep ratings this week"}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-surface px-3.5 py-3.5 sm:px-5 sm:py-4">
        <span className="text-[13px] text-fg-2 sm:text-sm">Check-in streak</span>
        <span className="text-[26px] font-semibold leading-none tracking-tight tabular-nums sm:text-[32px]">
          {streak}
          <span className="ml-1 text-base font-medium text-fg-3">
            {streak === 1 ? "day" : "days"}
          </span>
        </span>
        <div aria-hidden="true" className="grid grid-cols-7 gap-1">
          {windowDates(today).map((date) => (
            <span
              key={date}
              className={`h-2 rounded ${rows.some((r) => r.checkin_date === date) ? "bg-cat-checkin" : "bg-line"}`}
            />
          ))}
        </div>
        <span className="text-[13px] text-fg-3">Check-ins in the last 7 days</span>
      </div>
    </section>
  );
}
