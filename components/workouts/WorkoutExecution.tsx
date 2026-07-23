"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  abandonWorkoutSession,
  addSessionSet,
  completeSessionSet,
  finishWorkoutSession,
  getWorkoutSessionById,
  removeSessionSet,
  reopenSessionSet,
  skipSessionSet,
} from "@/lib/workouts/sessions";
import { roundBasedSetOrder } from "@/lib/workouts/grouping";
import {
  WORKOUT_FINAL_ACTIONS_CLASS,
  WORKOUT_STATUS_HEADER_CLASS,
  actualSetSummary,
  getAddressedSessionSets,
  getCurrentSessionSet,
  getWorkoutReadiness,
  orderedSessionSets,
} from "@/lib/workouts/execution";
import type {
  SessionExercise,
  SessionSet,
  WorkoutSession,
} from "@/lib/workouts/types";
import { supabase } from "@/lib/supabase/client";

type SetValues = {
  actual_reps: number | null;
  actual_weight: number | null;
  actual_duration_seconds: number | null;
  actual_distance: number | null;
};

function numericValue(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function plannedSetSummary(set: SessionSet) {
  const parts: string[] = [];
  if (set.planned_weight !== null) parts.push(`${set.planned_weight} lb`);
  if (set.planned_reps !== null) parts.push(`${set.planned_reps} reps`);
  else if (set.planned_reps_min !== null) {
    parts.push(
      set.planned_reps_max !== null
        ? `${set.planned_reps_min}–${set.planned_reps_max} reps`
        : `${set.planned_reps_min}+ reps`,
    );
  }
  if (set.planned_duration_seconds !== null) {
    parts.push(`${set.planned_duration_seconds} sec`);
  }
  if (set.planned_distance !== null) {
    parts.push(`${set.planned_distance} ${set.distance_unit ?? "distance"}`);
  }
  return parts.join(" · ") || "No prescription";
}

function SetEditor({
  set,
  exerciseName,
  totalSets,
  busy,
  editing,
  onComplete,
  onSkip,
  onCancelEdit,
  onRemove,
}: {
  set: SessionSet;
  exerciseName: string;
  totalSets: number;
  busy: boolean;
  editing?: boolean;
  onComplete: (values: SetValues) => Promise<void>;
  onSkip?: () => Promise<void>;
  onCancelEdit?: () => void;
  onRemove?: () => void;
}) {
  const [reps, setReps] = useState(
    String(set.actual_reps ?? set.planned_reps ?? set.planned_reps_min ?? ""),
  );
  const [weight, setWeight] = useState(
    String(set.actual_weight ?? set.planned_weight ?? ""),
  );
  const [duration, setDuration] = useState(
    String(set.actual_duration_seconds ?? set.planned_duration_seconds ?? ""),
  );
  const [distance, setDistance] = useState(
    String(set.actual_distance ?? set.planned_distance ?? ""),
  );
  const [submitting, setSubmitting] = useState(false);

  async function complete() {
    if (submitting || busy) return;
    setSubmitting(true);
    try {
      await onComplete({
        actual_reps: numericValue(reps),
        actual_weight: numericValue(weight),
        actual_duration_seconds: numericValue(duration),
        actual_distance: numericValue(distance),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function skip() {
    if (!onSkip || submitting || busy) return;
    setSubmitting(true);
    try {
      await onSkip();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">
            {editing ? "Edit completed set" : "Current set"} · Set {set.set_number} of{" "}
            {totalSets}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Plan: {plannedSetSummary(set)}
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
          {editing ? "Editing" : "In progress"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">
          Weight
          <input
            autoFocus={!editing}
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            className="mt-1.5 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-semibold outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Reps
          <input
            inputMode="numeric"
            value={reps}
            onChange={(event) => setReps(event.target.value)}
            className="mt-1.5 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-semibold outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Seconds
          <input
            inputMode="numeric"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            className="mt-1.5 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-semibold outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Distance
          <input
            inputMode="decimal"
            value={distance}
            onChange={(event) => setDistance(event.target.value)}
            className="mt-1.5 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-semibold outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || submitting}
          onClick={() => void complete()}
          aria-label={`${editing ? "Save changes to" : "Complete"} Set ${set.set_number} for ${exerciseName}`}
          className="min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {submitting ? "Saving…" : editing ? "Save changes" : "Complete Set"}
        </button>
        {!editing && onSkip ? (
          <button
            type="button"
            disabled={busy || submitting}
            onClick={() => void skip()}
            aria-label={`Skip Set ${set.set_number} for ${exerciseName}`}
            className="min-h-11 rounded-lg px-4 font-semibold text-slate-600 hover:bg-slate-100"
          >
            Skip Set
          </button>
        ) : null}
        {editing && onCancelEdit ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="min-h-11 rounded-lg px-4 font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        ) : null}
        {!editing && onRemove ? (
          <button
            type="button"
            disabled={busy || submitting}
            onClick={onRemove}
            className="min-h-11 rounded-lg px-3 font-semibold text-rose-600 hover:bg-rose-50"
          >
            Remove set
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CompletedSetRow({
  set,
  exerciseName,
  busy,
  onEdit,
  onReopen,
}: {
  set: SessionSet;
  exerciseName: string;
  busy: boolean;
  onEdit: () => void;
  onReopen: () => Promise<void>;
}) {
  const completed = set.status === "completed";
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 py-2.5 text-sm last:border-b-0">
      <span className="font-semibold text-slate-900">Set {set.set_number}</span>
      <span className="min-w-0 flex-1 text-slate-600">{actualSetSummary(set)}</span>
      <span
        className={`font-semibold ${completed ? "text-emerald-700" : "text-amber-700"}`}
      >
        {completed ? "Completed" : "Skipped"}
      </span>
      {completed ? (
        <button
          type="button"
          disabled={busy}
          onClick={onEdit}
          aria-label={`Edit Set ${set.set_number} for ${exerciseName}`}
          className="min-h-11 px-2 font-semibold text-blue-700"
        >
          Edit
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void onReopen()}
        aria-label={`Return Set ${set.set_number} for ${exerciseName} to planned`}
        className="min-h-11 px-2 font-semibold text-slate-600"
      >
        Reopen
      </button>
    </div>
  );
}

function ExercisePanel({
  exercise,
  busy,
  onReload,
  onAdd,
  onRemove,
  onError,
}: {
  exercise: SessionExercise;
  busy: boolean;
  onReload: () => Promise<void>;
  onAdd: () => Promise<void>;
  onRemove: (setId: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const sets = orderedSessionSets(exercise.sets);
  const current = getCurrentSessionSet(sets);
  const addressed = getAddressedSessionSets(sets);
  const completedCount = sets.filter((set) => set.status === "completed").length;
  const [expanded, setExpanded] = useState(Boolean(current));
  const [editingSetId, setEditingSetId] = useState<string | null>(null);

  async function updateSet(
    set: SessionSet,
    values: SetValues,
    collapseAfter: boolean,
  ) {
    try {
      onError("");
      await completeSessionSet(supabase, set.id, values);
      await onReload();
      setEditingSetId(null);
      if (collapseAfter) setExpanded(false);
    } catch {
      onError("We couldn’t save this set. Your entered values are still here.");
      throw new Error("SET_SAVE_FAILED");
    }
  }

  async function skipSet(set: SessionSet, collapseAfter: boolean) {
    try {
      onError("");
      await skipSessionSet(supabase, set.id);
      await onReload();
      if (collapseAfter) setExpanded(false);
    } catch {
      onError("We couldn’t skip this set. Please try again.");
      throw new Error("SET_SKIP_FAILED");
    }
  }

  async function reopenSet(set: SessionSet) {
    try {
      onError("");
      await reopenSessionSet(supabase, set.id);
      setEditingSetId(null);
      setExpanded(true);
      await onReload();
    } catch {
      onError("We couldn’t reopen this set. Please try again.");
    }
  }

  const editingSet = sets.find((set) => set.id === editingSetId) ?? null;
  const allAddressed = current === null;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="min-h-11 min-w-0 flex-1 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <span className="block text-xs font-semibold uppercase tracking-wide text-blue-700">
            {exercise.display_label} · {exercise.group_type}
          </span>
          <span className="mt-1 block text-lg font-semibold text-slate-900">
            {exercise.exercise_name}
          </span>
          <span className="mt-0.5 block text-sm text-slate-600">
            {allAddressed
              ? `Addressed · ${completedCount} completed, ${sets.length - completedCount} skipped`
              : `${completedCount} of ${sets.length} sets complete`}
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAdd()}
          className="min-h-11 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
        >
          Add Set
        </button>
      </div>

      {expanded ? (
        <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
          {addressed.length ? (
            <div aria-label={`Completed and skipped sets for ${exercise.exercise_name}`}>
              {addressed.map((set) =>
                editingSet?.id === set.id ? (
                  <SetEditor
                    key={set.id}
                    set={set}
                    exerciseName={exercise.exercise_name}
                    totalSets={sets.length}
                    busy={busy}
                    editing
                    onComplete={(values) => updateSet(set, values, false)}
                    onCancelEdit={() => setEditingSetId(null)}
                  />
                ) : (
                  <CompletedSetRow
                    key={set.id}
                    set={set}
                    exerciseName={exercise.exercise_name}
                    busy={busy}
                    onEdit={() => setEditingSetId(set.id)}
                    onReopen={() => reopenSet(set)}
                  />
                ),
              )}
            </div>
          ) : null}

          {!editingSet && current ? (
            <div className={addressed.length ? "mt-3" : ""}>
              <SetEditor
                key={current.id}
                set={current}
                exerciseName={exercise.exercise_name}
                totalSets={sets.length}
                busy={busy}
                onComplete={(values) =>
                  updateSet(current, values, sets.filter((set) => set.status === "pending").length === 1)
                }
                onSkip={() =>
                  skipSet(current, sets.filter((set) => set.status === "pending").length === 1)
                }
                onRemove={
                  !current.planned_workout_set_id
                    ? () => void onRemove(current.id)
                    : undefined
                }
              />
            </div>
          ) : null}

          {!current && !editingSet ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              All sets for this exercise have been addressed.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function WorkoutExecution() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setSession(await getWorkoutSessionById(supabase, id));
    } catch {
      setError("We couldn’t load this workout.");
    }
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const ordered = useMemo(
    () => (session ? roundBasedSetOrder(session.exercises ?? []) : []),
    [session],
  );
  const readiness = getWorkoutReadiness(ordered);
  const elapsed = session
    ? Math.max(0, Math.floor((now - new Date(session.started_at).getTime()) / 1000))
    : 0;

  async function add(exerciseId: string, count: number) {
    setBusy(true);
    setError("");
    try {
      await addSessionSet(supabase, id, exerciseId, count + 1);
      await load();
    } catch {
      setError("We couldn’t add this set.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(setId: string) {
    if (!confirm("Remove this accidentally added set?")) return;
    setBusy(true);
    setError("");
    try {
      await removeSessionSet(supabase, setId);
      await load();
    } catch {
      setError("We couldn’t remove this set.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!confirm("Finish this workout? Pending sets will remain unperformed.")) return;
    setBusy(true);
    try {
      await finishWorkoutSession(supabase, id, {
        perceived_difficulty: null,
        energy_after: null,
        notes: null,
      });
      router.push(`/workouts/sessions/${id}/summary`);
    } catch {
      setError("We couldn’t finish the workout.");
      setBusy(false);
    }
  }

  async function abandon() {
    if (!confirm("Abandon this workout? Completed set data will be preserved.")) {
      return;
    }
    setBusy(true);
    try {
      await abandonWorkoutSession(supabase, id);
      router.push("/workouts");
    } catch {
      setError("We couldn’t abandon the workout.");
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-4xl p-6 font-semibold">
        {error || "Loading workout…"}
      </div>
    );
  }

  const exercises = [...(session.exercises ?? [])].sort(
    (a, b) =>
      a.group_order - b.group_order || a.exercise_order - b.exercise_order,
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-4 pb-8">
      <header className={WORKOUT_STATUS_HEADER_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-blue-700">
            <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden="true" />
            Workout in Progress
          </p>
          <p className="text-sm font-medium tabular-nums text-slate-600">
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} elapsed
          </p>
        </div>
        <h1 className="mt-1 text-xl font-semibold text-slate-950">{session.name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {readiness.completed} of {readiness.total} sets completed
        </p>
      </header>

      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="mt-5 space-y-4">
        {exercises.map((exercise) => (
          <ExercisePanel
            key={exercise.id}
            exercise={exercise}
            busy={busy}
            onReload={load}
            onAdd={() => add(exercise.id, exercise.sets?.length ?? 0)}
            onRemove={remove}
            onError={setError}
          />
        ))}
      </div>

      <section className={WORKOUT_FINAL_ACTIONS_CLASS}>
        <div>
          <h2 className="font-semibold text-slate-900">Workout Progress</h2>
          <p className="mt-1 text-sm text-slate-600">
            {readiness.completed} of {readiness.total} sets completed
            {readiness.skipped ? ` · ${readiness.skipped} skipped` : ""}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-700">
            {readiness.remaining
              ? `${readiness.remaining} ${readiness.remaining === 1 ? "set remains" : "sets remain"}`
              : "All planned sets have been addressed."}
          </p>
        </div>

        <div className="mt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void finish()}
            className="min-h-12 w-full rounded-lg bg-blue-600 px-5 text-base font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {busy ? "Working…" : "Finish Workout"}
          </button>
          <div className="mt-3 border-t border-slate-200 pt-3 text-center">
            <button
              type="button"
              disabled={busy}
              onClick={() => void abandon()}
              className="min-h-11 rounded-lg px-4 font-semibold text-rose-600 hover:bg-rose-50 disabled:text-slate-400"
            >
              Abandon Workout
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
