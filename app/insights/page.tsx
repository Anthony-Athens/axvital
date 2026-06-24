"use client";

import { useEffect, useMemo, useState } from "react";
import {
  logSupabaseError,
  refreshUserInsights,
} from "@/lib/insights/generate";
import { supabase } from "@/lib/supabase/client";
import type { UserInsight } from "@/lib/types";

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

function InsightCard({ insight }: { insight: UserInsight }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
          {titleCase(insight.insight_type)}
        </span>
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
        await loadPersistedInsights(user.id);
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

  const strongestInsight = useMemo(() => {
    const rankedConfidence = {
      "Strong Signal": 3,
      "Moderate Confidence": 2,
      "Early Signal": 1,
    };

    return [...insights].sort((a, b) => {
      const confidenceDelta =
        rankedConfidence[b.confidence_level] - rankedConfidence[a.confidence_level];

      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }

      return b.sample_size - a.sample_size;
    })[0];
  }, [insights]);

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
            {insights.map((insight) => (
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
