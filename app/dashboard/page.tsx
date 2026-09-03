"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { friendlyErrorMessage, logDevError } from "@/lib/app-errors";
import {
  loadLatestWeeklyRecap,
} from "@/lib/recaps/weekly";
import { supabase } from "@/lib/supabase/client";
import type { WeeklyRecap } from "@/lib/types";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { HealthDisclaimerNote } from "@/components/HealthDisclaimerNote";

type DailyCheckinRow = {
  id: string;
  user_id: string;
  checkin_date: string;
  energy_score: number | null;
  mood_score: number | null;
  sleep_quality: string | null;
  weight: number | null;
};

type TrendPoint = {
  date: string;
  label: string;
  value: number | null;
};

const sleepScores: Record<string, number> = {
  poor: 1,
  average: 2,
  good: 3,
  great: 4,
};

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysAgoFrom(anchorDate: string, days: number) {
  const date = new Date(`${anchorDate}T12:00:00`);
  date.setDate(date.getDate() - days);
  return localDateString(date);
}

function shortDateLabel(value: string) {
  const [, month = "1", day = "1"] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function average(values: Array<number | null | undefined>) {
  const validValues = values.filter(
    (value): value is number => typeof value === "number" && !Number.isNaN(value),
  );

  if (!validValues.length) {
    return null;
  }

  return validValues.reduce((total, value) => total + value, 0) / validValues.length;
}

function sleepScore(value: string | null) {
  if (!value) {
    return null;
  }

  return sleepScores[value.trim().toLowerCase()] ?? null;
}

function sleepLabel(score: number | null) {
  if (score === null) {
    return "Not enough data";
  }

  if (score >= 3.5) {
    return "Great";
  }

  if (score >= 2.5) {
    return "Good";
  }

  if (score >= 1.5) {
    return "Average";
  }

  return "Poor";
}

function formatNumber(value: number | null, digits = 1) {
  return value === null ? "--" : value.toFixed(digits);
}

function buildLast30Trend(
  checkins: DailyCheckinRow[],
  field: "energy_score" | "mood_score" | "weight",
  anchorDate: string,
) {
  const byDate = new Map(checkins.map((checkin) => [checkin.checkin_date, checkin]));

  return Array.from({ length: 30 }, (_, index) => {
    const date = daysAgoFrom(anchorDate, 29 - index);
    const checkin = byDate.get(date);

    return {
      date,
      label: shortDateLabel(date),
      value: checkin?.[field] ?? null,
    };
  });
}

function calculateStreak(checkins: DailyCheckinRow[]) {
  if (!checkins.length) {
    return 0;
  }

  const dates = new Set(checkins.map((checkin) => checkin.checkin_date));
  const sortedDates = [...dates].sort((a, b) => b.localeCompare(a));
  const cursor = new Date(`${sortedDates[0]}T12:00:00`);
  let streak = 0;

  while (dates.has(localDateString(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function TrendBars({
  title,
  subtitle,
  points,
  color,
  maxValue,
}: {
  title: string;
  subtitle: string;
  points: TrendPoint[];
  color: string;
  maxValue?: number;
}) {
  const values = points
    .map((point) => point.value)
    .filter((value): value is number => value !== null);
  const computedMax = maxValue ?? Math.max(...values, 1);

  return (
    <section className="rounded-xl bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
            {subtitle}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
          30 days
        </span>
      </div>

      <div className="mt-5 flex h-36 items-end gap-1.5">
        {points.map((point) => {
          const height =
            point.value === null ? 0 : Math.max((point.value / computedMax) * 100, 10);

          return (
            <div
              key={point.date}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
              title={`${point.label}: ${point.value ?? "No data"}`}
              role="img"
              aria-label={`${point.date}: ${point.value ?? "No data"}`}
            >
              <div className="flex h-28 w-full items-end rounded-full bg-slate-100">
                <div
                  className={`w-full rounded-full ${point.value === null ? "bg-slate-200" : color}`}
                  style={{ height: `${height}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between text-xs font-bold text-slate-400">
        <span>{points[0]?.label}</span>
        <span>{points[Math.floor(points.length / 2)]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <article className="grid grid-cols-[1fr_auto] items-center gap-x-4 rounded-xl bg-white p-4 sm:block sm:p-5">
      <p className="text-sm font-medium text-slate-500">
        {label}
      </p>
      <p className="col-start-2 row-span-2 row-start-1 text-2xl font-semibold tracking-tight text-slate-950 sm:mt-2 sm:text-3xl">
        {value}
      </p>
      <p className="col-start-1 row-start-2 text-sm leading-6 text-slate-500 sm:mt-2">
        {helper}
      </p>
    </article>
  );
}

export default function DashboardPage() {
  const [checkins, setCheckins] = useState<DailyCheckinRow[]>([]);
  const [weeklyRecap, setWeeklyRecap] = useState<WeeklyRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Hydration fix: resolve the moving "today" value after mount so server HTML
  // and the first client render both start from the same non-date-dependent UI.
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        logDevError("Failed to load dashboard user", userError);
        if (!ignore) {
          setError(friendlyErrorMessage("load your dashboard"));
          setLoading(false);
        }
        return;
      }

      if (!user) {
        if (!ignore) {
          setError("Please log in to view your dashboard.");
          setLoading(false);
        }
        return;
      }

      const currentDate = localDateString(new Date());
      setToday(currentDate);
      const startDate = daysAgoFrom(currentDate, 29);

      const [checkinResult, recapResult] = await Promise.all([
        supabase
          .from("daily_checkins")
          .select("id,user_id,checkin_date,energy_score,mood_score,sleep_quality,weight")
          .eq("user_id", user.id)
          .gte("checkin_date", startDate)
          .lte("checkin_date", currentDate)
          .order("checkin_date", { ascending: true }),
        loadLatestWeeklyRecap(supabase, user.id).catch(() => null),
      ]);

      if (ignore) {
        return;
      }

      if (checkinResult.error) {
        logDevError("Failed to load dashboard check-ins", checkinResult.error);
        setError(friendlyErrorMessage("load your check-ins"));
      } else {
        setCheckins((checkinResult.data ?? []) as DailyCheckinRow[]);
      }

      setWeeklyRecap(recapResult);

      setLoading(false);
    }

    void loadDashboard().catch(() => {
      if (!ignore) {
        setError(friendlyErrorMessage("load your dashboard"));
        setLoading(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, []);

  const metrics = useMemo(() => {
    if (!today) {
      return {
        streak: 0,
        averageEnergy: null,
        averageMood: null,
        averageSleep: null,
        latestWeight: null,
        energyTrend: [],
        moodTrend: [],
        weightTrend: [],
      };
    }

    const last7Start = daysAgoFrom(today, 6);
    const last7Checkins = checkins.filter(
      (checkin) => checkin.checkin_date >= last7Start,
    );
    const averageEnergy = average(last7Checkins.map((checkin) => checkin.energy_score));
    const averageMood = average(last7Checkins.map((checkin) => checkin.mood_score));
    const averageSleep = average(
      last7Checkins.map((checkin) => sleepScore(checkin.sleep_quality)),
    );
    const latestWeight =
      [...checkins].reverse().find((checkin) => checkin.weight !== null)?.weight ?? null;

    return {
      streak: calculateStreak(checkins),
      averageEnergy,
      averageMood,
      averageSleep,
      latestWeight,
      energyTrend: buildLast30Trend(checkins, "energy_score", today),
      moodTrend: buildLast30Trend(checkins, "mood_score", today),
      weightTrend: buildLast30Trend(checkins, "weight", today),
    };
  }, [checkins, today]);

  const hasEnoughData = checkins.length >= 3;
  const snapshot = [
    metrics.averageEnergy !== null ? { label: "Energy", value: formatNumber(metrics.averageEnergy), helper: "Average · past 7 days" } : null,
    metrics.averageMood !== null ? { label: "Mood", value: formatNumber(metrics.averageMood), helper: "Average · past 7 days" } : null,
    metrics.averageSleep !== null ? { label: "Sleep quality", value: sleepLabel(metrics.averageSleep), helper: "Average · past 7 days" } : null,
  ].filter(item => item !== null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Health Overview</h1>
        <p className="mt-2 text-slate-600">Your recent signals, personal trends, and the activity behind them.</p>
        {today ? <p className="mt-3 text-sm text-slate-500">Overview: {shortDateLabel(daysAgoFrom(today, 29))}–{shortDateLabel(today)} · Local dates</p> : null}
      </header>

      {error ? <p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{error}</p> : null}
      {loading ? <section aria-label="Loading health snapshot" aria-busy="true" className="mt-6 grid gap-4 sm:grid-cols-3">{[1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100"/>)}</section> : snapshot.length ? <section aria-label="Current snapshot" className="mt-6 grid gap-4 sm:grid-cols-3">{snapshot.map(item => <MetricCard key={item.label} {...item}/>)}</section> : !error ? <section className="mt-6"><h2 className="text-xl font-semibold">Your snapshot starts with a check-in.</h2><p className="mt-2 text-sm leading-6 text-slate-600">Not enough recent check-in data yet. Activity you log elsewhere still appears below.</p><Link href="/today#daily-checkin" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">Complete a check-in →</Link></section> : null}

      <RecentActivity />

      <section aria-labelledby="trends-heading" className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="trends-heading" className="text-xl font-semibold">What changed?</h2><p className="mt-1 text-sm text-slate-500">Daily observations over the past 30 days—not an interpretation of cause.</p></div><Link href="/insights" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">View Insights →</Link></div>
        {!loading && !hasEnoughData ? <p className="mt-3 text-sm leading-6 text-slate-600">A few more check-ins will make trends more useful. Missing days are not zero scores.</p> : null}
        {!loading ? <div className="mt-5 grid gap-5 lg:grid-cols-3">
          {metrics.energyTrend.some(p => p.value !== null) ? <TrendBars title="Energy" subtitle="Daily energy score" points={metrics.energyTrend} color="bg-blue-500" maxValue={10}/> : null}
          {metrics.moodTrend.some(p => p.value !== null) ? <TrendBars title="Mood" subtitle="Daily mood score" points={metrics.moodTrend} color="bg-blue-500" maxValue={10}/> : null}
          {metrics.weightTrend.some(p => p.value !== null) ? <TrendBars title="Weight" subtitle="Recorded weight values" points={metrics.weightTrend} color="bg-slate-500"/> : null}
        </div> : null}
      </section>

      <section aria-labelledby="next-heading" className="mt-10 border-t border-slate-200 pt-6">
        <h2 id="next-heading" className="text-xl font-semibold">Look a little closer</h2>
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <article><p className="text-sm font-semibold text-blue-700">Weekly Recap</p><h3 className="mt-2 text-lg font-semibold">{weeklyRecap?.title ?? "Your week in context"}</h3><p className="mt-2 text-sm leading-7 text-slate-600">{weeklyRecap?.summary ?? "Review a summary of what you tracked, or generate your first recap."}</p><Link href="/weekly-recap" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">Open Weekly Recap →</Link></article>
          <article><h3 className="text-lg font-semibold">Your tracking routines</h3>{!loading && checkins.length ? <p className="mt-2 text-sm leading-7 text-slate-600">{checkins.length} check-ins in this window · Latest recorded streak: {metrics.streak} days{metrics.latestWeight !== null ? ` · Latest weight: ${metrics.latestWeight}` : ""}</p> : null}<p className="mt-2 text-sm leading-7 text-slate-600">Review scheduled actions and routine progress in their dedicated views.</p><div className="mt-2 flex flex-wrap gap-x-6"><Link href="/habits" className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">View Habits →</Link><Link href="/protocols" className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">View Protocols →</Link></div></article>
        </div>
      </section>
      <div className="[&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center"><HealthDisclaimerNote /></div>
    </div>
  );
}
