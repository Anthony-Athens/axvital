"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { HealthEventType } from "@/lib/types";

type DailyCheckinRow = {
  id: string;
  user_id: string;
  checkin_date: string;
  energy_score: number | null;
  mood_score: number | null;
  sleep_quality: string | null;
  exercise_level: string | null;
  stress_level: string | null;
  alcohol: boolean | null;
};

type HealthEventRow = {
  id: string;
  user_id: string;
  event_date: string;
  event_type: HealthEventType;
};

type ComparisonInsight = {
  signal: string;
  text: string;
  firstLabel: string;
  firstValue: number | null;
  firstCount: number;
  secondLabel: string;
  secondValue: number | null;
  secondCount: number;
  difference: number | null;
};

const eventTypes: HealthEventType[] = [
  "food",
  "supplement",
  "exercise",
  "symptom",
  "medication",
  "note",
];

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDateString(date);
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

function normalized(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatValue(value: number | null) {
  return value === null ? "--" : value.toFixed(1);
}

function confidenceLabel(firstCount: number, secondCount: number) {
  return firstCount < 4 || secondCount < 4 ? "Early signal" : "Moderate signal";
}

function compareGroups({
  signal,
  firstLabel,
  first,
  secondLabel,
  second,
  metric,
  betterPhrase,
  fallback,
}: {
  signal: string;
  firstLabel: string;
  first: DailyCheckinRow[];
  secondLabel: string;
  second: DailyCheckinRow[];
  metric: "energy_score" | "mood_score";
  betterPhrase: string;
  fallback: string;
}) {
  const firstValue = average(first.map((checkin) => checkin[metric]));
  const secondValue = average(second.map((checkin) => checkin[metric]));
  const difference =
    firstValue === null || secondValue === null ? null : firstValue - secondValue;
  const text =
    difference === null
      ? fallback
      : `${betterPhrase} appears ${Math.abs(difference).toFixed(
          1,
        )} points ${difference >= 0 ? "higher" : "lower"} for ${firstLabel.toLowerCase()} compared with ${secondLabel.toLowerCase()}.`;

  return {
    signal,
    text,
    firstLabel,
    firstValue,
    firstCount: first.length,
    secondLabel,
    secondValue,
    secondCount: second.length,
    difference,
  };
}

function buildAlcoholInsight(checkins: DailyCheckinRow[]) {
  const byDate = new Map(checkins.map((checkin) => [checkin.checkin_date, checkin]));
  const afterAlcohol: DailyCheckinRow[] = [];
  const afterNoAlcohol: DailyCheckinRow[] = [];

  checkins.forEach((checkin) => {
    const previous = new Date(`${checkin.checkin_date}T12:00:00`);
    previous.setDate(previous.getDate() - 1);
    const previousCheckin = byDate.get(localDateString(previous));

    if (!previousCheckin) {
      return;
    }

    if (previousCheckin.alcohol) {
      afterAlcohol.push(checkin);
    } else {
      afterNoAlcohol.push(checkin);
    }
  });

  return compareGroups({
    signal: "Alcohol",
    firstLabel: "Days after alcohol",
    first: afterAlcohol,
    secondLabel: "Days after no alcohol",
    second: afterNoAlcohol,
    metric: "energy_score",
    betterPhrase: "Next-day energy",
    fallback: "Log a few more consecutive days to compare energy after alcohol and non-alcohol days.",
  });
}

function InsightCard({ insight }: { insight: ComparisonInsight }) {
  const confidence = confidenceLabel(insight.firstCount, insight.secondCount);

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
          {insight.signal}
        </span>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
          {confidence}
        </span>
      </div>
      <p className="mt-4 text-xl font-black leading-8 text-slate-950">
        {insight.text}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
            {insight.firstLabel}
          </p>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {formatValue(insight.firstValue)}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {insight.firstCount} samples
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
            {insight.secondLabel}
          </p>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {formatValue(insight.secondValue)}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {insight.secondCount} samples
          </p>
        </div>
      </div>
    </article>
  );
}

export default function InsightsPage() {
  const [checkins, setCheckins] = useState<DailyCheckinRow[]>([]);
  const [events, setEvents] = useState<HealthEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadInsights() {
      setLoading(true);
      setError("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("Failed to load insights user", userError);
        if (!ignore) {
          setError(userError.message);
          setLoading(false);
        }
        return;
      }

      if (!user) {
        if (!ignore) {
          setError("Please log in to view your insights.");
          setLoading(false);
        }
        return;
      }

      const startDate = daysAgo(29);
      const [checkinResult, eventResult] = await Promise.all([
        supabase
          .from("daily_checkins")
          .select(
            "id,user_id,checkin_date,energy_score,mood_score,sleep_quality,exercise_level,stress_level,alcohol",
          )
          .eq("user_id", user.id)
          .gte("checkin_date", startDate)
          .order("checkin_date", { ascending: true }),
        supabase
          .from("health_events")
          .select("id,user_id,event_date,event_type")
          .eq("user_id", user.id)
          .gte("event_date", startDate)
          .order("event_date", { ascending: false }),
      ]);

      if (ignore) {
        return;
      }

      if (checkinResult.error) {
        console.error("Failed to load insight check-ins", checkinResult.error);
        setError(checkinResult.error.message);
      } else {
        setCheckins((checkinResult.data ?? []) as DailyCheckinRow[]);
      }

      if (eventResult.error) {
        console.error("Failed to load insight health events", eventResult.error);
        setError(eventResult.error.message);
      } else {
        setEvents((eventResult.data ?? []) as HealthEventRow[]);
      }

      setLoading(false);
    }

    loadInsights();

    return () => {
      ignore = true;
    };
  }, []);

  const analytics = useMemo(() => {
    const goodSleep = checkins.filter((checkin) =>
      ["good", "great"].includes(normalized(checkin.sleep_quality)),
    );
    const poorSleep = checkins.filter((checkin) =>
      ["poor", "average"].includes(normalized(checkin.sleep_quality)),
    );
    const lowStress = checkins.filter(
      (checkin) => normalized(checkin.stress_level) === "low",
    );
    const highStress = checkins.filter(
      (checkin) => normalized(checkin.stress_level) === "high",
    );
    const exerciseDays = checkins.filter(
      (checkin) =>
        !["", "none", "no workout"].includes(normalized(checkin.exercise_level)),
    );
    const nonExerciseDays = checkins.filter((checkin) =>
      ["none", "no workout"].includes(normalized(checkin.exercise_level)),
    );

    const insights = [
      compareGroups({
        signal: "Sleep",
        firstLabel: "Good sleep days",
        first: goodSleep,
        secondLabel: "Poor sleep days",
        second: poorSleep,
        metric: "energy_score",
        betterPhrase: "Energy",
        fallback: "Log more sleep variety to compare energy on good and poor sleep days.",
      }),
      compareGroups({
        signal: "Stress",
        firstLabel: "Low stress days",
        first: lowStress,
        secondLabel: "High stress days",
        second: highStress,
        metric: "mood_score",
        betterPhrase: "Mood",
        fallback: "Log more low and high stress days to compare mood patterns.",
      }),
      compareGroups({
        signal: "Exercise",
        firstLabel: "Exercise days",
        first: exerciseDays,
        secondLabel: "Non-exercise days",
        second: nonExerciseDays,
        metric: "energy_score",
        betterPhrase: "Energy",
        fallback: "Log more exercise and non-exercise days to compare energy patterns.",
      }),
      buildAlcoholInsight(checkins),
    ];

    const eventCounts = eventTypes.map((type) => ({
      type,
      count: events.filter((event) => event.event_type === type).length,
    }));

    const strongest = insights
      .filter((insight) => insight.difference !== null)
      .sort(
        (a, b) => Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0),
      )[0];

    return { insights, eventCounts, strongest };
  }, [checkins, events]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-10">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
          Insights
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">
          Early personal patterns
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">
          Transparent, non-medical observations from your recent AXVital logs.
        </p>
      </header>

      {error ? (
        <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-black text-amber-900">
          {error}
        </section>
      ) : null}

      {loading ? (
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-lg font-black text-slate-950">
            Loading your insights...
          </p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            Reviewing your last 30 days of check-ins and events.
          </p>
        </section>
      ) : null}

      {!loading && checkins.length < 7 ? (
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
            Not Enough Data Yet
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight">
            Log at least 7 daily check-ins to unlock your first insights.
          </h2>
          <p className="mt-3 leading-7 text-slate-600">
            The more consistently you log, the more useful these comparisons
            become.
          </p>
        </section>
      ) : null}

      {!loading && checkins.length >= 7 ? (
        <>
          <section className="mt-6 rounded-3xl bg-slate-950 p-6 text-white shadow-xl shadow-slate-200">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
              Insights Summary
            </p>
            <p className="mt-4 text-2xl font-black leading-9">
              {analytics.strongest
                ? `${analytics.strongest.signal} appears most related to your recent ${analytics.strongest.signal === "Stress" ? "mood" : "energy"} patterns.`
                : "Your first patterns will appear as more varied data comes in."}
            </p>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
              These are associations in your logs, not medical claims or
              diagnoses.
            </p>
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-2">
            {analytics.insights.map((insight) => (
              <InsightCard key={insight.signal} insight={insight} />
            ))}
          </section>

          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
                  Event Mix
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">
                  Logged events, last 30 days
                </h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                {events.length} total
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {analytics.eventCounts.map((event) => (
                <article
                  key={event.type}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                >
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                    {titleCase(event.type)}
                  </p>
                  <p className="mt-2 text-3xl font-black text-slate-950">
                    {event.count}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
