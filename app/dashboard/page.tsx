"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  loadLatestWeeklyRecap,
} from "@/lib/recaps/weekly";
import { supabase } from "@/lib/supabase/client";
import type { HealthEventType, WeeklyRecap } from "@/lib/types";

type DailyCheckinRow = {
  id: string;
  user_id: string;
  checkin_date: string;
  energy_score: number | null;
  mood_score: number | null;
  sleep_quality: string | null;
  weight: number | null;
};

type HealthEventRow = {
  id: string;
  user_id: string;
  event_date: string;
  event_time: string | null;
  event_type: HealthEventType;
  title: string | null;
  description: string | null;
  notes: string | null;
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

function formatEventTime(value: string | null) {
  if (!value) {
    return "Anytime";
  }

  const [hours = "0", minutes = "00"] = value.split(":");
  const hourNumber = Number(hours);
  const displayHour = hourNumber % 12 || 12;
  const period = hourNumber >= 12 ? "PM" : "AM";

  // Hydration fix: keep event-time text deterministic instead of relying on
  // Date/Intl output that can differ between server and mobile browsers.
  return `${displayHour}:${minutes.padStart(2, "0")} ${period}`;
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
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
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight">{title}</h2>
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
            point.value === null ? 8 : Math.max((point.value / computedMax) * 100, 10);

          return (
            <div
              key={point.date}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
              title={`${point.label}: ${point.value ?? "No data"}`}
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
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-600">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
        {helper}
      </p>
    </article>
  );
}

export default function DashboardPage() {
  const [checkins, setCheckins] = useState<DailyCheckinRow[]>([]);
  const [events, setEvents] = useState<HealthEventRow[]>([]);
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
        console.error("Failed to load dashboard user", userError);
        if (!ignore) {
          setError(userError.message);
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

      const [checkinResult, eventResult, recapResult] = await Promise.all([
        supabase
          .from("daily_checkins")
          .select("id,user_id,checkin_date,energy_score,mood_score,sleep_quality,weight")
          .eq("user_id", user.id)
          .gte("checkin_date", startDate)
          .order("checkin_date", { ascending: true }),
        supabase
          .from("health_events")
          .select("id,user_id,event_date,event_time,event_type,title,description,notes")
          .eq("user_id", user.id)
          .order("event_date", { ascending: false })
          .order("event_time", { ascending: false })
          .limit(10),
        loadLatestWeeklyRecap(supabase, user.id).catch(() => null),
      ]);

      if (ignore) {
        return;
      }

      if (checkinResult.error) {
        console.error("Failed to load dashboard check-ins", checkinResult.error);
        setError(checkinResult.error.message);
      } else {
        setCheckins((checkinResult.data ?? []) as DailyCheckinRow[]);
      }

      if (eventResult.error) {
        console.error("Failed to load dashboard health events", eventResult.error);
        setError(eventResult.error.message);
      } else {
        setEvents((eventResult.data ?? []) as HealthEventRow[]);
      }

      setWeeklyRecap(recapResult);

      setLoading(false);
    }

    loadDashboard();

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

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">
      <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl shadow-slate-200 md:p-8">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
          Dashboard
        </p>
        <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">
              Your health snapshot
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-slate-300">
              A personal view of your recent check-ins, trends, and logged
              activity.
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-sm font-semibold text-slate-300">Check-ins</p>
            <p className="text-4xl font-black text-emerald-300">
              {loading ? "--" : checkins.length}
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <section className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-black text-amber-900">
          {error}
        </section>
      ) : null}

      {loading ? (
        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-lg font-black text-slate-950">
            Loading your dashboard...
          </p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            Pulling your latest check-ins and activity.
          </p>
        </section>
      ) : null}

      {!loading && !checkins.length && !events.length ? (
        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
            Empty State
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight">
            Your dashboard will light up as you log.
          </h2>
          <p className="mt-3 leading-7 text-slate-600">
            Complete a few Daily Check-Ins and add optional events from Today to
            see your personal health snapshot take shape.
          </p>
        </section>
      ) : null}

      {!loading ? (
        <>
          <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard
              label="Streak"
              value={`${metrics.streak} day${metrics.streak === 1 ? "" : "s"}`}
              helper="Consecutive check-in days"
            />
            <MetricCard
              label="Energy"
              value={formatNumber(metrics.averageEnergy)}
              helper="Average, last 7 days"
            />
            <MetricCard
              label="Mood"
              value={formatNumber(metrics.averageMood)}
              helper="Average, last 7 days"
            />
            <MetricCard
              label="Sleep"
              value={sleepLabel(metrics.averageSleep)}
              helper={
                metrics.averageSleep === null
                  ? "Average, last 7 days"
                  : `${formatNumber(metrics.averageSleep)}/4 average`
              }
            />
            <MetricCard
              label="Weight"
              value={metrics.latestWeight === null ? "--" : `${metrics.latestWeight}`}
              helper="Latest logged weight"
            />
          </section>

          {!hasEnoughData ? (
            <section className="mt-5 rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">
                More Data Needed
              </p>
              <p className="mt-2 text-lg font-black leading-7 text-slate-950">
                Log a few more check-ins to make these trends more meaningful.
              </p>
            </section>
          ) : null}

          <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
                  Weekly Recap
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">
                  {weeklyRecap?.title ?? "Your week in signals"}
                </h2>
              </div>
              <Link
                href="/weekly-recap"
                className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
              >
                Open
              </Link>
            </div>
            <p className="mt-3 leading-7 text-slate-600">
              {weeklyRecap?.summary ??
                "Generate your first weekly recap after 7 days of check-ins."}
            </p>
            {weeklyRecap ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                    Exercise
                  </p>
                  <p className="mt-2 text-2xl font-black">
                    {weeklyRecap.exercise_event_count}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                    Supplements
                  </p>
                  <p className="mt-2 text-2xl font-black">
                    {weeklyRecap.supplement_event_count}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                    Symptoms
                  </p>
                  <p className="mt-2 text-2xl font-black">
                    {weeklyRecap.symptom_event_count}
                  </p>
                </div>
              </div>
            ) : null}
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-3">
            <TrendBars
              title="Energy over time"
              subtitle="Daily energy score from recent check-ins."
              points={metrics.energyTrend}
              color="bg-emerald-500"
              maxValue={10}
            />
            <TrendBars
              title="Mood over time"
              subtitle="Daily mood score from recent check-ins."
              points={metrics.moodTrend}
              color="bg-sky-500"
              maxValue={10}
            />
            <TrendBars
              title="Weight over time"
              subtitle="Latest logged weight values."
              points={metrics.weightTrend}
              color="bg-violet-500"
            />
          </section>

          <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
                  Recent Activity
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">
                  Latest health events
                </h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                Latest 5
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {events.slice(0, 5).map((event) => (
                <article
                  key={event.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-emerald-500" />
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-500">
                        {shortDateLabel(event.event_date)} at{" "}
                        {formatEventTime(event.event_time)} -{" "}
                        {titleCase(event.event_type)}
                      </p>
                      <p className="mt-1 text-base font-black text-slate-950">
                        {event.title || event.description || event.notes || "Health event"}
                      </p>
                    </div>
                  </div>
                </article>
              ))}

              {!events.length ? (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">
                  No health events logged yet. Quick Add entries from Today will
                  appear here.
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
