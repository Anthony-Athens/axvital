"use client";

import Link from "next/link";
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
  actualInputValue,
  getAddressedSessionSets,
  getCurrentSessionSet,
  getWorkoutReadiness,
  orderedSessionSets,
  secondsSinceLastSet,
  validateActualSetInput,
  visibleSetFields,
  type SetField,
} from "@/lib/workouts/execution";
import type { ExerciseTrackingType } from "@/lib/workouts/exercise-metadata";
import type { SessionExercise, SessionSet, WorkoutSession } from "@/lib/workouts/types";
import { supabase } from "@/lib/supabase/client";

type SetValues = {
  actual_reps: number | null;
  actual_weight: number | null;
  actual_duration_seconds: number | null;
  actual_distance: number | null;
};

function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function plannedSetSummary(set: SessionSet, trackingType: ExerciseTrackingType) {
  const parts: string[] = [];
  if (trackingType === "bodyweight_reps") parts.push("Bodyweight");
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

const FIELD_LABELS: Record<
  SetField,
  { label: string; placeholder: string; mode: "decimal" | "numeric" }
> = {
  weight: { label: "Weight (lb)", placeholder: "Weight", mode: "decimal" },
  reps: { label: "Reps", placeholder: "Reps", mode: "numeric" },
  duration: { label: "Seconds", placeholder: "Seconds", mode: "numeric" },
  distance: { label: "Distance", placeholder: "Distance", mode: "decimal" },
};

const FIELD_GRID: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

function targetValue(set: SessionSet, field: SetField) {
  const value =
    field === "weight"
      ? set.planned_weight
      : field === "reps"
        ? (set.planned_reps ?? set.planned_reps_min)
        : field === "duration"
          ? set.planned_duration_seconds
          : set.planned_distance;
  return value === null || value === undefined || (field === "weight" && value === 0)
    ? null
    : String(value);
}

function SetEditor({
  set,
  exerciseName,
  trackingType,
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
  trackingType: ExerciseTrackingType;
  totalSets: number;
  busy: boolean;
  editing?: boolean;
  onComplete: (values: SetValues) => Promise<void>;
  onSkip?: () => Promise<void>;
  onCancelEdit?: () => void;
  onRemove?: () => void;
}) {
  const [values, setValues] = useState<Record<SetField, string>>({
    weight: actualInputValue(set.actual_weight),
    reps: actualInputValue(set.actual_reps),
    duration: actualInputValue(set.actual_duration_seconds),
    distance: actualInputValue(set.actual_distance),
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SetField, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const fields = visibleSetFields(trackingType, {
    weight: set.actual_weight,
    reps: set.actual_reps,
    duration: set.actual_duration_seconds,
    distance: set.actual_distance,
  });

  // Explicit one-tap fill; actual values never default to the plan silently.
  const canUseTarget =
    !editing &&
    fields.length > 0 &&
    fields.every((field) => !values[field].trim()) &&
    fields.some((field) => targetValue(set, field) !== null);

  async function complete() {
    if (submitting || busy) return;
    const result = validateActualSetInput(trackingType, values);
    setFieldErrors(result.errors);
    if (Object.keys(result.errors).length) return;
    setSubmitting(true);
    try {
      await onComplete(result.values);
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
    <div className="rounded-2xl border border-accent-fg/40 bg-accent/[0.07] p-3.5 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-fg">
          {editing ? "Edit set" : "Set"} {set.set_number}{" "}
          <span className="font-normal text-fg-3">of {totalSets}</span>
        </h3>
        <p className="text-[13px] tabular-nums text-fg-2">
          Target: {plannedSetSummary(set, trackingType)}
        </p>
      </div>

      {fields.length ? (
        <div className={`mt-3 grid gap-2.5 ${FIELD_GRID[fields.length] ?? FIELD_GRID[4]}`}>
          {fields.map((field, index) => (
            <label key={field} className="min-w-0 text-[13px] font-medium text-fg-2">
              {FIELD_LABELS[field].label}
              <input
                autoFocus={!editing && index === 0}
                inputMode={FIELD_LABELS[field].mode}
                value={values[field]}
                onChange={(event) => {
                  const next = event.target.value;
                  setValues((current) => ({ ...current, [field]: next }));
                  setFieldErrors((current) => ({ ...current, [field]: undefined }));
                }}
                placeholder={FIELD_LABELS[field].placeholder}
                aria-invalid={Boolean(fieldErrors[field])}
                aria-describedby={fieldErrors[field] ? `${set.id}-${field}-error` : undefined}
                className="mt-1.5 min-h-14 w-full rounded-xl border border-line-strong bg-raised px-3 text-center text-xl font-semibold tabular-nums text-fg outline-none focus:border-accent-fg focus:ring-2 focus:ring-accent-fg/30"
              />
              {fieldErrors[field] ? (
                <span
                  id={`${set.id}-${field}-error`}
                  className="mt-1 block text-xs font-medium text-rose-300"
                >
                  {fieldErrors[field]}
                </span>
              ) : null}
            </label>
          ))}
        </div>
      ) : null}

      {canUseTarget ? (
        <button
          type="button"
          onClick={() =>
            setValues((current) => ({
              ...current,
              ...Object.fromEntries(fields.map((field) => [field, targetValue(set, field) ?? ""])),
            }))
          }
          className="mt-2.5 min-h-11 w-full rounded-xl border border-dashed border-line-strong text-sm font-semibold text-fg-2 hover:bg-raised"
        >
          Use target · {plannedSetSummary(set, trackingType)}
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy || submitting}
        onClick={() => void complete()}
        aria-label={`${editing ? "Save changes to" : "Complete"} Set ${set.set_number} for ${exerciseName}`}
        className="mt-3.5 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[17px] font-bold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-fg-3"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
        {submitting ? "Saving…" : editing ? "Save changes" : "Complete Set"}
      </button>
      <div className="mt-2 flex flex-wrap justify-center gap-1">
        {!editing && onSkip ? (
          <button
            type="button"
            disabled={busy || submitting}
            onClick={() => void skip()}
            aria-label={`Skip Set ${set.set_number} for ${exerciseName}`}
            className="min-h-11 rounded-xl px-4 text-sm font-semibold text-fg-2 hover:bg-raised"
          >
            Skip Set
          </button>
        ) : null}
        {editing && onCancelEdit ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="min-h-11 rounded-xl px-4 text-sm font-semibold text-fg-2 hover:bg-raised"
          >
            Cancel
          </button>
        ) : null}
        {!editing && onRemove ? (
          <button
            type="button"
            disabled={busy || submitting}
            onClick={onRemove}
            className="min-h-11 rounded-xl px-4 text-sm font-semibold text-rose-300 hover:bg-rose-500/10"
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
    <div
      className={`flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-1.5 text-sm ${completed ? "bg-emerald-500/[0.07]" : "bg-amber-500/[0.06]"}`}
    >
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[13px] font-bold tabular-nums ${completed ? "bg-emerald-400 text-emerald-950" : "bg-amber-400/20 text-amber-200"}`}
      >
        {set.set_number}
      </span>
      <span className="min-w-0 flex-1 font-semibold tabular-nums text-fg">
        {actualSetSummary(set)}
      </span>
      <span
        className={`text-[13px] font-semibold ${completed ? "text-emerald-300" : "text-amber-300"}`}
      >
        {completed ? "Completed" : "Skipped"}
      </span>
      {completed ? (
        <button
          type="button"
          disabled={busy}
          onClick={onEdit}
          aria-label={`Edit Set ${set.set_number} for ${exerciseName}`}
          className="min-h-10 rounded-lg px-2 text-[13px] font-semibold text-accent-fg hover:bg-raised"
        >
          Edit
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void onReopen()}
        aria-label={`Return Set ${set.set_number} for ${exerciseName} to planned`}
        className="min-h-10 rounded-lg px-2 text-[13px] font-semibold text-fg-2 hover:bg-raised"
      >
        Reopen
      </button>
    </div>
  );
}

function SetDots({ sets }: { sets: SessionSet[] }) {
  return (
    <span aria-hidden="true" className="flex gap-1">
      {sets.map((set) => (
        <span
          key={set.id}
          className={`h-1.5 w-4 rounded-full ${set.status === "completed" ? "bg-cat-workout" : set.status === "skipped" ? "bg-amber-400/60" : "bg-line-strong"}`}
        />
      ))}
    </span>
  );
}

function ExercisePanel({
  exercise,
  busy,
  active,
  onReload,
  onAdd,
  onRemove,
  onError,
}: {
  exercise: SessionExercise;
  busy: boolean;
  /** The exercise holding the workout's next pending set. */
  active: boolean;
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

  async function updateSet(set: SessionSet, values: SetValues, collapseAfter: boolean) {
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
    <section
      className={`overflow-hidden rounded-2xl border bg-surface ${active ? "border-accent-fg/50" : "border-line"}`}
    >
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="min-h-11 min-w-0 flex-1 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-accent-fg"
        >
          <span className="flex items-center gap-2 text-[13px] text-fg-3">
            {allAddressed ? (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4 text-emerald-300"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : null}
            {exercise.display_label} · <span className="capitalize">{exercise.group_type}</span>
          </span>
          <span
            className={`mt-0.5 block font-bold tracking-tight ${active ? "text-[22px] text-fg" : allAddressed ? "text-lg text-fg-2" : "text-lg text-fg"}`}
          >
            {exercise.exercise_name}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[13px] tabular-nums text-fg-3">
            <SetDots sets={sets} />
            {allAddressed
              ? `${completedCount} completed, ${sets.length - completedCount} skipped`
              : `${completedCount} of ${sets.length} sets`}
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAdd()}
          className="min-h-11 shrink-0 rounded-xl border border-line-strong bg-raised px-3 text-sm font-semibold text-fg-2 hover:bg-line"
        >
          Add Set
        </button>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-2 border-t border-line p-3 sm:p-4">
          {addressed.length ? (
            <div
              aria-label={`Completed and skipped sets for ${exercise.exercise_name}`}
              className="flex flex-col gap-1.5"
            >
              {addressed.map((set) =>
                editingSet?.id === set.id ? (
                  <SetEditor
                    key={set.id}
                    set={set}
                    exerciseName={exercise.exercise_name}
                    trackingType={exercise.tracking_type}
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
            <SetEditor
              key={current.id}
              set={current}
              exerciseName={exercise.exercise_name}
              trackingType={exercise.tracking_type}
              totalSets={sets.length}
              busy={busy}
              onComplete={(values) =>
                updateSet(
                  current,
                  values,
                  sets.filter((set) => set.status === "pending").length === 1,
                )
              }
              onSkip={() =>
                skipSet(current, sets.filter((set) => set.status === "pending").length === 1)
              }
              onRemove={
                !current.planned_workout_set_id ? () => void onRemove(current.id) : undefined
              }
            />
          ) : null}

          {!current && !editingSet ? (
            <p className="rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-300">
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
      <div className="mx-auto max-w-3xl p-6 font-semibold text-fg-2">
        {error || "Loading workout…"}
      </div>
    );
  }

  const exercises = [...(session.exercises ?? [])].sort(
    (a, b) => a.group_order - b.group_order || a.exercise_order - b.exercise_order,
  );
  const allSets = exercises.flatMap((exercise) => exercise.sets ?? []);
  // Round order decides what comes next across supersets and circuits.
  const activeExerciseId = ordered.find(
    (set) => set.status === "pending",
  )?.workout_session_exercise_id;
  const sinceLast = readiness.remaining ? secondsSinceLastSet(allSets, now) : null;

  return (
    <div className="mx-auto -mt-16 max-w-3xl px-4 py-4 pb-8 lg:mt-0">
      <header className={WORKOUT_STATUS_HEADER_CLASS}>
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/workouts"
            aria-label="Back to Workouts"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line text-fg-2 hover:bg-raised"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </Link>
          <div className="min-w-0 text-center">
            <h1 className="truncate text-[15px] font-semibold text-fg">{session.name}</h1>
            <p className="text-[28px] font-bold leading-tight tracking-tight tabular-nums text-emerald-300">
              {clock(elapsed)}
              <span className="sr-only"> elapsed · Workout in Progress</span>
            </p>
          </div>
          <span aria-hidden="true" className="w-11 shrink-0" />
        </div>
        <div
          className="mt-3 grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${Math.max(exercises.length, 1)}, minmax(0, 1fr))`,
          }}
          aria-hidden="true"
        >
          {exercises.map((exercise) => {
            const sets = exercise.sets ?? [];
            const done = sets.filter((set) => set.status !== "pending").length;
            const percent = sets.length ? Math.round((done / sets.length) * 100) : 0;
            return (
              <span key={exercise.id} className="h-1.5 overflow-hidden rounded-full bg-line">
                <span
                  className="block h-full rounded-full bg-cat-workout"
                  style={{ width: `${percent}%` }}
                />
              </span>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px] tabular-nums text-fg-3">
          <span>
            {readiness.completed} of {readiness.total} sets completed
          </span>
          {sinceLast !== null ? (
            <span
              role="timer"
              aria-live="off"
              className="inline-flex items-center gap-1.5 rounded-full bg-cat-fluid/10 px-2.5 py-1 font-semibold text-cat-fluid"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              >
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2.5 2.5M9 2h6" />
              </svg>
              Rest {clock(sinceLast)}
            </span>
          ) : null}
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-rose-500/10 p-4 text-sm font-semibold text-rose-200"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        {exercises.map((exercise) => (
          <ExercisePanel
            key={exercise.id}
            exercise={exercise}
            busy={busy}
            active={exercise.id === activeExerciseId}
            onReload={load}
            onAdd={() => add(exercise.id, exercise.sets?.length ?? 0)}
            onRemove={remove}
            onError={setError}
          />
        ))}
      </div>

      <section className={WORKOUT_FINAL_ACTIONS_CLASS}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-fg">Workout Progress</h2>
          <p className="text-sm tabular-nums text-fg-2">
            {readiness.completed} of {readiness.total} sets completed
            {readiness.skipped ? ` · ${readiness.skipped} skipped` : ""}
          </p>
        </div>
        <p className="mt-1 text-sm text-fg-3">
          {readiness.remaining
            ? `${readiness.remaining} ${readiness.remaining === 1 ? "set remains" : "sets remain"}`
            : "All planned sets have been addressed."}
        </p>

        <button
          type="button"
          disabled={busy}
          onClick={() => void finish()}
          className={`mt-4 min-h-12 w-full rounded-xl px-5 text-base font-semibold disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-fg-3 ${readiness.remaining ? "border border-line-strong bg-raised text-fg hover:bg-line" : "bg-cat-workout text-emerald-950 hover:bg-emerald-300"}`}
        >
          {busy ? "Working…" : "Finish Workout"}
        </button>
        <div className="mt-2 text-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => void abandon()}
            className="min-h-11 rounded-xl px-4 text-sm font-semibold text-rose-300 hover:bg-rose-500/10 disabled:text-fg-3"
          >
            Abandon Workout
          </button>
        </div>
      </section>
    </div>
  );
}
