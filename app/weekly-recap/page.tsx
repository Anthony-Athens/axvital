"use client";

import { useEffect, useState } from "react";
import { friendlyErrorMessage, logDevError } from "@/lib/app-errors";
import {
  generateWeeklyRecap,
  loadLatestWeeklyRecap,
  logWeeklyRecapError,
} from "@/lib/recaps/weekly";
import { supabase } from "@/lib/supabase/client";
import type { WeeklyRecap } from "@/lib/types";

function formatMetric(value: number | null, suffix = "") {
  return value === null ? "--" : `${value.toFixed(1)}${suffix}`;
}

function RecapCard({ recap }: { recap: WeeklyRecap }) {
  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
        {recap.week_start} to {recap.week_end}
      </p>
      <h2 className="mt-3 text-3xl font-black tracking-tight">
        {recap.title}
      </h2>
      <p className="mt-3 leading-7 text-slate-600">{recap.summary}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
            Energy
          </p>
          <p className="mt-2 text-2xl font-black">
            {formatMetric(recap.avg_energy)}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
            Mood
          </p>
          <p className="mt-2 text-2xl font-black">
            {formatMetric(recap.avg_mood)}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
            Sleep
          </p>
          <p className="mt-2 text-2xl font-black">
            {formatMetric(recap.avg_sleep, "/4")}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
            Weight
          </p>
          <p className="mt-2 text-2xl font-black">
            {recap.weight_change === null
              ? "--"
              : `${recap.weight_change > 0 ? "+" : ""}${recap.weight_change}`}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl bg-emerald-50 p-5">
          <h3 className="text-lg font-black">What Went Well</h3>
          <ul className="mt-3 space-y-2 text-sm font-semibold leading-6 text-slate-700">
            {recap.what_went_well.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl bg-amber-50 p-5">
          <h3 className="text-lg font-black">Watch For</h3>
          <ul className="mt-3 space-y-2 text-sm font-semibold leading-6 text-slate-700">
            {recap.watch_for.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default function WeeklyRecapPage() {
  const [userId, setUserId] = useState("");
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadRecap() {
      setLoading(true);
      setMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        logDevError("Failed to load weekly recap user", userError);
        if (active) {
          setMessage(friendlyErrorMessage("load your weekly recap"));
          setLoading(false);
        }
        return;
      }

      if (!user) {
        if (active) {
          setMessage("Please log in to view your weekly recap.");
          setLoading(false);
        }
        return;
      }

      try {
        const latestRecap = await loadLatestWeeklyRecap(supabase, user.id);

        if (active) {
          setUserId(user.id);
          setRecap(latestRecap);
        }
      } catch (error) {
        if (error && typeof error === "object") {
          logWeeklyRecapError("Failed to load weekly recap page data", error);
        }

        if (active) {
          setMessage(friendlyErrorMessage("load your weekly recap"));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadRecap();

    return () => {
      active = false;
    };
  }, []);

  async function handleGenerateRecap() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      logDevError("Failed to load user before weekly recap generation", userError);
      setMessage(friendlyErrorMessage("generate your weekly recap"));
      return;
    }

    if (!user) {
      setMessage("Please log in to generate your weekly recap.");
      return;
    }

    setGenerating(true);
    setMessage("");

    try {
      setUserId(user.id);
      const generatedRecap = await generateWeeklyRecap(supabase, user.id);

      if (!generatedRecap) {
        setMessage("Log 7 days of data to unlock your first weekly recap.");
        return;
      }

      setRecap(generatedRecap);
      setMessage("Weekly recap generated.");
    } catch (error) {
      if (error && typeof error === "object") {
        logWeeklyRecapError("Failed to generate weekly recap", error);
      }
      setMessage(friendlyErrorMessage("generate your weekly recap"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-10">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
          Weekly Recap
        </p>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">
              Your week in signals
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-slate-600">
              A non-medical summary of recent check-ins and logged activity.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateRecap}
            disabled={loading || generating || !userId}
            className="flex min-h-14 items-center justify-center rounded-2xl bg-slate-950 px-6 text-base font-black text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {generating ? "Generating..." : "Generate Weekly Recap"}
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
            Loading weekly recap...
          </p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            Checking for your latest saved summary.
          </p>
        </section>
      ) : null}

      {!loading && !recap ? (
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
            Not Enough Data Yet
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight">
            Log 7 days of data to unlock your first weekly recap.
          </h2>
          <p className="mt-3 leading-7 text-slate-600">
            Once you have a full week of check-ins, AXVital can summarize your
            behaviors and outcomes for the week.
          </p>
        </section>
      ) : null}

      {recap ? <RecapCard recap={recap} /> : null}
    </div>
  );
}
