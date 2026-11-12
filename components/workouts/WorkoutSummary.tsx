"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  calculatePlannedVersusActual,
  calculateWorkoutSessionMetrics,
} from "@/lib/workouts/analytics";
import { getWorkoutSessionById } from "@/lib/workouts/sessions";
import type { WorkoutSession } from "@/lib/workouts/types";
import { supabase } from "@/lib/supabase/client";
export function WorkoutSummary() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<WorkoutSession | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => void getWorkoutSessionById(supabase, id).then(setS), 0);
    return () => clearTimeout(timer);
  }, [id]);
  const m = useMemo(() => (s ? calculateWorkoutSessionMetrics(s) : null), [s]);
  const comparison = useMemo(
    () =>
      s ? calculatePlannedVersusActual(s.exercises?.flatMap((e) => e.sets ?? []) ?? []) : null,
    [s],
  );
  if (!s || !m || !comparison)
    return <div className="p-6 font-semibold">Loading workout summary…</div>;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/workouts" className="font-semibold text-accent-fg">
        ← Workouts
      </Link>
      <section className="mt-4 rounded-2xl bg-slate-950 p-6 text-white">
        <p className="text-sm font-semibold uppercase text-emerald-300">
          Workout summary · {s.status}
        </p>
        <h1 className="mt-2 text-4xl font-semibold">{s.name}</h1>
        <p className="mt-3 text-fg-2">
          Scheduled {s.planned_workout?.scheduled_date ?? "—"} · Performed {s.session_date}
        </p>
      </section>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Duration", m.durationSeconds ? `${Math.round(m.durationSeconds / 60)} min` : "—"],
          ["Completed sets", m.completedSetCount],
          ["Total reps", m.totalRepetitions],
          ["Logged volume", m.totalExternalLoadVolume.toLocaleString()],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-surface p-4">
            <p className="text-xs font-semibold uppercase text-fg-3">{l}</p>
            <p className="mt-2 text-2xl font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <section className="mt-5 rounded-2xl bg-surface p-5">
        <h2 className="text-2xl font-semibold">Planned versus actual</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <p className="rounded-2xl bg-raised p-4 font-bold">
            Sets
            <br />
            {comparison.plannedSets} planned / {comparison.completedSets} completed
          </p>
          <p className="rounded-2xl bg-raised p-4 font-bold">
            Reps
            <br />
            {comparison.plannedReps} planned / {comparison.actualReps} actual
          </p>
          <p className="rounded-2xl bg-raised p-4 font-bold">
            Volume
            <br />
            {comparison.plannedVolume} planned / {comparison.actualVolume} actual
          </p>
        </div>
        <p className="mt-4 text-sm font-semibold text-fg-3">
          Variance is descriptive and does not imply that higher or lower volume is better.
        </p>
      </section>
    </div>
  );
}
