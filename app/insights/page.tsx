"use client";

import { useEffect, useMemo, useState } from "react";
import {
  logSupabaseError,
  refreshUserInsights,
} from "@/lib/insights/generate";
import { supabase } from "@/lib/supabase/client";
import type { InsightType, UserInsight } from "@/lib/types";

type RankedInsight = UserInsight & {
  relevanceLabel: "Most relevant to your goal" | "Supporting pattern" | "Early signal";
  relevanceScore: number;
};

const goalPriorities: Record<string, InsightType[]> = {
  energy: ["sleep_energy", "exercise_energy", "alcohol_sleep"],
  "weight loss": ["exercise_energy", "alcohol_sleep", "sleep_energy"],
  "muscle gain": ["exercise_energy", "sleep_energy"],
  sleep: ["alcohol_sleep", "sleep_energy", "stress_mood", "exercise_energy"],
  mood: ["stress_mood", "sleep_energy", "exercise_energy"],
  stress: ["stress_mood", "sleep_energy", "exercise_energy"],
  symptoms: ["stress_mood", "sleep_energy", "alcohol_sleep"],
  "athletic performance": ["exercise_energy", "sleep_energy", "alcohol_sleep"],
  "general wellness": ["sleep_energy", "stress_mood", "exercise_energy", "alcohol_sleep"],
};

const focusDescriptions: Record<string, string> = {
  energy: "Prioritizing sleep, exercise, and alcohol-related patterns that may be related to your energy.",
  "weight loss": "Prioritizing exercise, alcohol, and recovery patterns while future nutrition and weight-trend insights mature.",
  "muscle gain": "Prioritizing exercise and recovery patterns while future protein and weight-trend insights mature.",
  sleep: "Prioritizing alcohol, sleep quality, stress, and exercise patterns that may be related to sleep.",
  mood: "Prioritizing stress, sleep, and exercise patterns that may be related to mood.",
  stress: "Prioritizing stress, sleep, and exercise patterns while future tag-based stress signals mature.",
  symptoms: "Prioritizing stress and sleep patterns while future symptom and tag-based insights mature.",
  "athletic performance": "Prioritizing exercise and sleep patterns while future recovery-tag insights mature.",
  "general wellness": "Prioritizing the strongest overall patterns across your recent logs.",
};

function confidenceColor(value: string) {
  if (value === "Strong Signal") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (value === "Moderate Confidence") {
    return "bg-sky-50 text-sky-700";
  }

  return "bg-amber-50 text-amber-800";
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizedGoal(value: string) {
  return value.trim().toLowerCase();
}

function confidenceRank(value: string) {
  if (value === "Strong Signal") {
    return 3;
  }

  if (value === "Moderate Confidence") {
    return 2;
  }

  return 1;
}

function rankInsightsByGoal(insights: UserInsight[], primaryGoal: string) {
  const normalized = normalizedGoal(primaryGoal);
  const priorities = goalPriorities[normalized] ?? goalPriorities["general wellness"];

  return insights
    .map((insight): RankedInsight => {
      const priorityIndex = priorities.indexOf(insight.insight_type);
      const goalScore = priorityIndex === -1 ? 0 : priorities.length - priorityIndex;
      const relevanceScore =
        goalScore * 100 + confidenceRank(insight.confidence_level) * 10 + insight.sample_size;

      return {
        ...insight,
        relevanceScore,
        relevanceLabel:
          insight.confidence_level === "Early Signal"
            ? "Early signal"
            : priorityIndex === 0
              ? "Most relevant to your goal"
              : "Supporting pattern",
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function InsightCard({ insight }: { insight: RankedInsight }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
            {titleCase(insight.insight_type)}
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 ring-1 ring-slate-200">
            {insight.relevanceLabel}
          </span>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${confidenceColor(
            insight.confidence_level,
          )}`}
        >
          {insight.confidence_level}
        </span>
      </div>
      <h2 className="mt-4 text-xl font-black leading-8 text-slate-950">
        {insight.title}
      </h2>
      <p className="mt-2 text-base font-semibold leading-7 text-slate-600">
        {insight.description}
      </p>
      <div className="mt-5 rounded-2xl bg-slate-50 p-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
          Sample Size
        </p>
        <p className="mt-2 text-2xl font-black text-slate-950">
          {insight.sample_size}
        </p>
      </div>
    </article>
  );
}

export default function InsightsPage() {
  const [userId, setUserId] = useState("");
  const [primaryGoal, setPrimaryGoal] = useState("");
  const [insights, setInsights] = useState<UserInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  async function loadPersistedInsights(currentUserId: string) {
    const { data, error } = await supabase
      .from("user_insights")
      .select(
        "id,user_id,insight_type,title,description,confidence_level,sample_size,generated_at,is_active",
      )
      .eq("user_id", currentUserId)
      .eq("is_active", true)
      .order("generated_at", { ascending: false });

    if (error) {
      logSupabaseError("Failed to load persisted insights", error);
      throw error;
    }

    setInsights((data ?? []) as UserInsight[]);
  }

  async function loadProfileFocus(currentUserId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("primary_goal")
      .eq("id", currentUserId)
      .maybeSingle();

    if (error) {
      logSupabaseError("Failed to load insight profile focus", error);
      throw error;
    }

    setPrimaryGoal(data?.primary_goal ?? "");
  }

  useEffect(() => {
    let ignore = false;

    async function loadInsights() {
      setLoading(true);
      setMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("Failed to load insights user", userError);
        if (!ignore) {
          setMessage(userError.message);
          setLoading(false);
        }
        return;
      }

      if (!user) {
        if (!ignore) {
          setMessage("Please log in to view your insights.");
          setLoading(false);
        }
        return;
      }

      try {
        if (!ignore) {
          setUserId(user.id);
        }
        await Promise.all([
          loadPersistedInsights(user.id),
          loadProfileFocus(user.id),
        ]);
      } catch (error) {
        if (!ignore) {
          setMessage(error instanceof Error ? error.message : "Unable to load insights.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadInsights();

    return () => {
      ignore = true;
    };
  }, []);

  async function handleRefreshInsights() {
    if (!userId) {
      setMessage("Please log in to refresh your insights.");
      return;
    }

    setRefreshing(true);
    setMessage("");

    try {
      const refreshedInsights = await refreshUserInsights(supabase, userId);
      setInsights(refreshedInsights);
      setMessage("Insights refreshed from your latest data.");
    } catch (error) {
      if (error && typeof error === "object") {
        logSupabaseError("Failed to refresh insights", error);
      } else {
        console.error("Failed to refresh insights", error);
      }
      setMessage(error instanceof Error ? error.message : "Unable to refresh insights.");
    } finally {
      setRefreshing(false);
    }
  }

  const rankedInsights = useMemo(
    () => rankInsightsByGoal(insights, primaryGoal || "General wellness"),
    [insights, primaryGoal],
  );
  const strongestInsight = rankedInsights[0];
  const focusKey = normalizedGoal(primaryGoal || "General wellness");
  const focusDescription =
    focusDescriptions[focusKey] ?? focusDescriptions["general wellness"];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-10">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
          Insights
        </p>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">
              Early personal patterns
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-slate-600">
              Transparent, non-medical observations from your recent AXVital
              logs.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefreshInsights}
            disabled={loading || refreshing || !userId}
            className="flex min-h-14 items-center justify-center rounded-2xl bg-slate-950 px-6 text-base font-black text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {refreshing ? "Refreshing..." : "Refresh Insights"}
          </button>
        </div>
      </header>

      {message ? (
        <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-black text-amber-900">
          {message}
        </section>
      ) : null}

      {!loading ? (
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
            Your Focus
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight">
            {primaryGoal || "General wellness"}
          </h2>
          <p className="mt-2 leading-7 text-slate-600">
            {focusDescription}
          </p>
        </section>
      ) : null}

      {loading ? (
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-lg font-black text-slate-950">
            Loading your insights...
          </p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            Reading your saved insight history.
          </p>
        </section>
      ) : null}

      {!loading && !insights.length ? (
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
            No Saved Insights Yet
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight">
            Refresh insights to analyze your latest logs.
          </h2>
          <p className="mt-3 leading-7 text-slate-600">
            AXVital will generate early association-based insights from your
            check-ins and health events, then save them here.
          </p>
        </section>
      ) : null}

      {!loading && insights.length ? (
        <>
          <section className="mt-6 rounded-3xl bg-slate-950 p-6 text-white shadow-xl shadow-slate-200">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
              Insights Summary
            </p>
            <p className="mt-4 text-2xl font-black leading-9">
              {strongestInsight
                ? `${strongestInsight.title} may be related to one of your recent logged patterns.`
                : "Your first patterns will appear as more insight runs are saved."}
            </p>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
              These are associations in your logs, not medical claims or
              diagnoses.
            </p>
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-2">
            {rankedInsights.map((insight) => (
              <InsightCard
                key={`${insight.insight_type}-${insight.generated_at ?? insight.title}`}
                insight={insight}
              />
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
