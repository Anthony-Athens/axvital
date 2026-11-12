"use client";
import { useScheduleRefresh } from "@/lib/planner/use-schedule-refresh";
import { SheetDialog } from "@/components/ui/SheetDialog";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { archiveExercise, searchExercises } from "@/lib/workouts/exercises";
import {
  archiveWorkoutTemplate,
  deleteWorkoutTemplate,
  duplicateWorkoutTemplate,
  getWorkoutTemplateDependencies,
  getWorkoutTemplates,
} from "@/lib/workouts/templates";
import { getPlannedWorkouts, scheduleWorkout } from "@/lib/workouts/planning";
import { getWorkoutSessions, startWorkoutSession } from "@/lib/workouts/sessions";
import { calculateWorkoutSessionMetrics } from "@/lib/workouts/analytics";
import {
  formatVolume,
  lastSession,
  nextWorkout,
  weeklyVolume,
  workoutWeek,
} from "@/lib/workouts/overview";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { metadataLabel } from "@/lib/workouts/exercise-metadata";
import { endOfMonth } from "@/lib/workouts/dates";
import type {
  Exercise,
  PlannedWorkout,
  WorkoutSession,
  WorkoutTemplate,
} from "@/lib/workouts/types";
import { supabase } from "@/lib/supabase/client";
import { CustomExerciseForm } from "./CustomExerciseForm";
import { ExerciseSelector } from "./ExerciseSelector";

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function clock(value: string) {
  const [h, m] = value.split(":");
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}
function relativeDay(value: string, todayValue: string) {
  const diff = Math.round(
    (new Date(`${value}T12:00:00`).getTime() - new Date(`${todayValue}T12:00:00`).getTime()) /
      86400000,
  );
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}
function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <path d="M7 4l13 8-13 8z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function WorkoutsHome() {
  const actionLock = useRef(false);
  const router = useRouter();
  const [tab, setTab] = useState<"planned" | "templates" | "exercises" | "history">("planned");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [archivedTemplates, setArchivedTemplates] = useState<WorkoutTemplate[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [planned, setPlanned] = useState<PlannedWorkout[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showExercise, setShowExercise] = useState(false);
  const [showSchedule, setShowSchedule] = useState<WorkoutTemplate | null>(null);
  const [confirm, setConfirm] = useState<{
    template: WorkoutTemplate;
    action: "archive" | "delete";
  } | null>(null);
  const load = useCallback(async () => {
    try {
      const date = today();
      const [exerciseRows, templateRows, archivedRows, plannedRows, sessionRows] =
        await Promise.all([
          searchExercises(supabase),
          getWorkoutTemplates(supabase),
          getWorkoutTemplates(supabase, true),
          getPlannedWorkouts(supabase, date, endOfMonth(date)),
          getWorkoutSessions(supabase, "2025-01-01", date),
        ]);
      setExercises(exerciseRows);
      setTemplates(templateRows);
      setArchivedTemplates(archivedRows);
      setPlanned(plannedRows);
      setSessions(sessionRows);
      setError("");
    } catch {
      setError("We couldn’t load your workouts.");
    }
  }, []);
  useScheduleRefresh(load);
  useEffect(() => {
    const showLibrary = () => {
      if (window.location.hash === "#exercise-library") setTab("exercises");
    };
    showLibrary();
    window.addEventListener("hashchange", showLibrary);
    return () => window.removeEventListener("hashchange", showLibrary);
  }, []);
  async function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!showSchedule) return;
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await scheduleWorkout(
        supabase,
        showSchedule.id,
        String(data.get("date")),
        String(data.get("time")) || null,
      );
      setShowSchedule(null);
      setTab("planned");
      await load();
    } catch {
      throw new Error("We couldn’t schedule this workout.");
    } finally {
      setBusy(false);
    }
  }
  async function start(workout: PlannedWorkout) {
    setBusy(true);
    try {
      const session = await startWorkoutSession(supabase, workout.id, today());
      router.push(`/workouts/sessions/${session.id}`);
    } catch {
      setError("We couldn’t start the workout.");
      setBusy(false);
    }
  }
  async function manage(
    template: WorkoutTemplate,
    action: "archive" | "restore" | "delete" | "duplicate",
  ) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      if (action === "archive") await archiveWorkoutTemplate(supabase, template.id);
      if (action === "restore") await archiveWorkoutTemplate(supabase, template.id, false);
      if (action === "duplicate") await duplicateWorkoutTemplate(supabase, template.id);
      if (action === "delete") {
        const deps = await getWorkoutTemplateDependencies(supabase, template.id);
        if (deps.planned_workouts + deps.protocols + deps.experiments > 0) {
          setError(
            "This template is used by existing workouts, protocols, or experiments and cannot be permanently deleted. You can keep it archived instead.",
          );
          return;
        }
        await deleteWorkoutTemplate(supabase, template.id);
      }
      setConfirm(null);
      await load();
    } catch {
      setError(`We couldn’t ${action} this template.`);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  const date = today();
  const upNext = nextWorkout(planned, date);
  const upNextTemplate = upNext
    ? [...templates, ...archivedTemplates].find((t) => t.id === upNext.workout_template_id)
    : undefined;
  const upNextCounts = upNextTemplate
    ? {
        exercises: upNextTemplate.groups?.reduce((n, g) => n + (g.exercises?.length ?? 0), 0) ?? 0,
        sets:
          upNextTemplate.groups?.reduce(
            (n, g) => n + (g.exercises?.reduce((m, e) => m + (e.sets?.length ?? 0), 0) ?? 0),
            0,
          ) ?? 0,
      }
    : null;
  const previous = upNext ? lastSession(upNext.name, sessions) : null;
  const resumeId = upNext
    ? sessions.find((s) => s.planned_workout_id === upNext.id && s.status === "in_progress")?.id
    : undefined;
  const week = workoutWeek(planned, sessions, date);
  const weekDone = week.flatMap((d) => d.items).filter((i) => i.state === "done").length;
  const weekPlanned = week.flatMap((d) => d.items).filter((i) => i.state === "planned").length;
  const volume = weeklyVolume(sessions, date);
  const maxVolume = Math.max(...volume.map((v) => v.volume), 1);
  const history = sessions.filter((session) => session.status !== "in_progress");
  // The up-next workout is featured above; list the rest so nothing appears twice.
  const laterPlanned = planned.filter((workout) => workout.id !== upNext?.id);
  const tabs = [
    ["planned", "Upcoming"],
    ["templates", "Templates"],
    ["exercises", "Exercise library"],
    ["history", "History"],
  ] as const;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="text-sm text-fg-3">
            <Link href="/track" className="hover:text-fg">
              Track
            </Link>{" "}
            / <span className="text-fg-2">Workouts</span>
          </nav>
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-fg sm:text-[32px]">
            Workouts
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/workouts/progress"
            className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-raised px-4 text-[15px] font-semibold text-fg hover:bg-line"
          >
            View Progress
          </Link>
          <Link
            href="/workouts/templates/new"
            className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-raised px-4 text-[15px] font-semibold text-fg hover:bg-line"
          >
            Create Workout Template
          </Link>
        </div>
      </header>

      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-rose-500/10 p-4 font-semibold text-rose-200">
          {error}
        </p>
      ) : null}

      {upNext ? (
        <section
          aria-labelledby="up-next-heading"
          className="mt-6 flex flex-wrap items-stretch gap-6 rounded-3xl border border-cat-workout/20 bg-gradient-to-br from-cat-workout/12 via-surface to-surface p-5 sm:p-7"
        >
          <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-cat-workout" />
              {upNext.status === "in_progress"
                ? "In progress"
                : `Up next · ${relativeDay(upNext.scheduled_date, date)}${upNext.scheduled_time ? ` ${clock(upNext.scheduled_time)}` : ""}`}
            </p>
            <h2 id="up-next-heading" className="text-[28px] font-bold leading-tight tracking-tight">
              {upNext.name}
            </h2>
            {upNextCounts ? (
              <p className="text-[15px] tabular-nums text-fg-2">
                {upNextCounts.exercises} exercises · {upNextCounts.sets} sets
              </p>
            ) : null}
            <div className="mt-1 flex flex-wrap gap-2">
              {upNext.status === "in_progress" && resumeId ? (
                <Link
                  href={`/workouts/sessions/${resumeId}`}
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-base font-semibold text-white hover:bg-accent-hover"
                >
                  <PlayIcon />
                  Resume
                </Link>
              ) : (
                <button
                  disabled={busy}
                  onClick={() => void start(upNext)}
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-base font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                >
                  <PlayIcon />
                  Start Workout
                </button>
              )}
              <Link
                href={`/workouts/planned/${upNext.id}`}
                className="inline-flex min-h-12 items-center rounded-xl border border-line-strong bg-ground/40 px-4 text-[15px] font-semibold text-fg hover:bg-raised"
              >
                View Plan
              </Link>
            </div>
          </div>
          <dl className="grid min-w-0 flex-[1_1_360px] grid-cols-3 content-center gap-2.5">
            {[
              [
                "Est. time",
                upNext.estimated_duration_minutes ?? upNextTemplate?.estimated_duration_minutes,
                "min",
              ],
              ["Last time", previous?.minutes, "min"],
              ["Last volume", previous ? formatVolume(previous.volume) : null, "lb"],
            ].map(([label, value, unit]) => (
              <div key={label as string} className="rounded-2xl bg-ground/45 p-3.5">
                <dt className="text-[13px] text-fg-3">{label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {value ?? "—"}
                  {value != null ? <span className="ml-0.5 text-sm text-fg-3">{unit}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section aria-labelledby="week-heading" className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="week-heading" className="text-lg font-semibold">
            This week
          </h2>
          <span className="text-sm tabular-nums text-fg-2">
            {weekDone} done · {weekPlanned} planned
          </span>
        </div>
        <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {week.map((day) => {
            const isToday = day.date === date;
            return (
              <li
                key={day.date}
                className={`flex min-h-[92px] flex-col gap-1.5 rounded-2xl p-3 ${
                  isToday
                    ? "border-[1.5px] border-accent-fg bg-surface"
                    : day.items.length
                      ? "border border-line bg-surface"
                      : "border border-dashed border-line"
                }`}
              >
                <span
                  className={`text-[13px] ${isToday ? "font-semibold text-blue-300" : "text-fg-3"}`}
                >
                  {new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" }).format(
                    new Date(`${day.date}T12:00:00`),
                  )}
                  {isToday ? " · today" : ""}
                </span>
                {day.items.length ? (
                  day.items.map((item, index) => (
                    <span key={index} className="flex min-w-0 flex-col">
                      <span
                        className={`flex items-center gap-1.5 truncate text-sm font-semibold ${
                          item.state === "done"
                            ? "text-emerald-300"
                            : item.state === "missed"
                              ? "text-fg-3 line-through"
                              : "text-fg"
                        }`}
                      >
                        {item.state === "done" ? <CheckIcon /> : null}
                        {item.name}
                      </span>
                      {item.minutes ? (
                        <span className="text-xs tabular-nums text-fg-3">{item.minutes} min</span>
                      ) : null}
                    </span>
                  ))
                ) : (
                  <span className="text-[13px] text-fg-3">Rest</span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="mt-8 flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[999_1_560px]">
          <div
            role="tablist"
            aria-label="Workout sections"
            className="flex gap-1 overflow-x-auto border-b border-line"
          >
            {tabs.map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-[15px] font-semibold ${
                  tab === value
                    ? "border-accent-fg text-fg"
                    : "border-transparent text-fg-3 hover:text-fg"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "planned" ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
              {laterPlanned.length ? (
                <ul className="divide-y divide-line">
                  {laterPlanned.map((workout) => (
                    <li
                      key={workout.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5"
                    >
                      <CategoryIcon category="workout" size="sm" />
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="truncate text-[15px] font-semibold">{workout.name}</p>
                        <p className="text-[13px] capitalize text-fg-3">
                          {relativeDay(workout.scheduled_date, date)}
                          {workout.scheduled_time
                            ? ` · ${clock(workout.scheduled_time)}`
                            : ""} · {workout.status.replace("_", " ")}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Link
                          href={`/workouts/planned/${workout.id}`}
                          className="inline-flex min-h-10 items-center rounded-[10px] border border-line-strong bg-raised px-3.5 text-[13px] font-semibold hover:bg-line"
                        >
                          View Plan
                        </Link>
                        {workout.status === "in_progress" ? (
                          <Link
                            href={`/workouts/sessions/${sessions.find((session) => session.planned_workout_id === workout.id && session.status === "in_progress")?.id}`}
                            className="inline-flex min-h-10 items-center rounded-[10px] bg-amber-400 px-3.5 text-[13px] font-semibold text-amber-950"
                          >
                            Resume
                          </Link>
                        ) : workout.status === "planned" ? (
                          <button
                            disabled={busy}
                            onClick={() => void start(workout)}
                            className="min-h-10 rounded-[10px] bg-accent px-3.5 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                          >
                            Start Workout
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-8 text-center">
                  <h2 className="text-lg font-semibold">
                    {upNext ? "Nothing else planned" : "No workouts planned"}
                  </h2>
                  <p className="mt-1 text-sm text-fg-2">
                    Schedule a reusable workout template when you are ready to train.
                  </p>
                  <button
                    onClick={() => setTab("templates")}
                    className="mt-4 min-h-11 rounded-xl bg-accent px-5 font-semibold text-white hover:bg-accent-hover"
                  >
                    View Templates
                  </button>
                </div>
              )}
            </div>
          ) : null}
          {tab === "templates" ? (
            <section className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">
                  {showArchived ? "Archived templates" : "Active templates"}
                </h2>
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  className="min-h-11 rounded-xl border border-line-strong bg-raised px-4 text-sm font-semibold hover:bg-line"
                >
                  {showArchived ? "Show active" : `Archived (${archivedTemplates.length})`}
                </button>
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {(showArchived ? archivedTemplates : templates).map((template) => {
                  const exerciseCount =
                    template.groups?.reduce((n, g) => n + (g.exercises?.length ?? 0), 0) ?? 0;
                  const setCount =
                    template.groups?.reduce(
                      (n, g) =>
                        n + (g.exercises?.reduce((m, e) => m + (e.sets?.length ?? 0), 0) ?? 0),
                      0,
                    ) ?? 0;
                  return (
                    <article
                      key={template.id}
                      className="flex flex-col rounded-2xl border border-line bg-surface p-5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <CategoryIcon category="workout" />
                          <h3 className="truncate text-lg font-semibold">{template.name}</h3>
                        </div>
                        <span className="shrink-0 rounded-full bg-raised px-2.5 py-1 text-xs font-semibold text-fg-2">
                          {template.is_archived ? "Archived" : "Active"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm tabular-nums text-fg-3">
                        {exerciseCount} exercises · {setCount} sets ·{" "}
                        {template.estimated_duration_minutes ?? "—"} minutes
                      </p>
                      <div className="mt-auto flex flex-wrap gap-2 pt-4">
                        <Link
                          href={`/workouts/templates/${template.id}`}
                          className="inline-flex min-h-10 items-center rounded-[10px] bg-accent px-3.5 text-[13px] font-semibold text-white hover:bg-accent-hover"
                        >
                          View
                        </Link>
                        {template.is_archived ? (
                          <>
                            <button
                              onClick={() => void manage(template, "restore")}
                              className="min-h-10 rounded-[10px] border border-line-strong bg-raised px-3.5 text-[13px] font-semibold text-fg hover:bg-line"
                            >
                              Restore
                            </button>
                            <button
                              onClick={() => {
                                setError("");
                                setConfirm({ template, action: "delete" });
                              }}
                              className="min-h-10 rounded-[10px] px-3 text-[13px] font-semibold text-rose-300 hover:bg-rose-500/10"
                            >
                              Delete permanently
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setShowSchedule(template)}
                              className="min-h-10 rounded-[10px] border border-line-strong bg-raised px-3.5 text-[13px] font-semibold text-fg hover:bg-line"
                            >
                              Schedule
                            </button>
                            <details className="relative">
                              <summary
                                aria-label={`More actions for ${template.name}`}
                                className="flex min-h-10 cursor-pointer list-none items-center rounded-[10px] px-3 text-[13px] font-semibold text-fg-2 hover:bg-raised"
                              >
                                More
                              </summary>
                              <div className="absolute right-0 z-10 mt-1 grid min-w-48 rounded-xl border border-line-strong bg-raised p-1.5 shadow-xl shadow-black/40">
                                <Link
                                  href={`/workouts/templates/${template.id}/edit`}
                                  className="min-h-11 rounded-lg px-3 py-3 text-sm font-semibold hover:bg-line"
                                >
                                  Edit template
                                </Link>
                                <button
                                  onClick={() => void manage(template, "duplicate")}
                                  className="min-h-11 rounded-lg px-3 text-left text-sm font-semibold hover:bg-line"
                                >
                                  Duplicate
                                </button>
                                <button
                                  onClick={() => {
                                    setError("");
                                    setConfirm({ template, action: "archive" });
                                  }}
                                  className="min-h-11 rounded-lg px-3 text-left text-sm font-semibold text-amber-200 hover:bg-line"
                                >
                                  Archive
                                </button>
                              </div>
                            </details>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
                {!(showArchived ? archivedTemplates : templates).length ? (
                  <div className="rounded-2xl border border-dashed border-line-strong p-8 text-center md:col-span-2">
                    <h3 className="text-xl font-semibold">
                      {showArchived ? "No archived templates" : "No workout templates yet"}
                    </h3>
                    <p className="mt-2 text-fg-3">
                      {showArchived
                        ? "Templates you archive will appear here."
                        : "Create a reusable plan of exercises and sets, then schedule it for a training day."}
                    </p>
                    {!showArchived ? (
                      <Link
                        href="/workouts/templates/new"
                        className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-accent hover:bg-accent-hover px-5 font-semibold text-white"
                      >
                        Create Workout Template
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
          {tab === "exercises" ? (
            <>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  onClick={() => setShowExercise(true)}
                  className="min-h-12 rounded-xl bg-accent hover:bg-accent-hover px-5 font-semibold text-white"
                >
                  Create Custom Exercise
                </button>
                <ExerciseSelector onSelect={() => undefined} />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {exercises.map((exercise) => (
                  <article
                    key={exercise.id}
                    className="rounded-2xl border border-line bg-surface p-4"
                  >
                    <h2 className="font-semibold">{exercise.name}</h2>
                    <p className="mt-1 text-sm text-fg-3">
                      {[
                        metadataLabel(exercise.category),
                        exercise.primary_muscle_group &&
                          metadataLabel(exercise.primary_muscle_group),
                        exercise.equipment && metadataLabel(exercise.equipment),
                        metadataLabel(exercise.default_tracking_type),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {exercise.user_id ? (
                      <button
                        onClick={() =>
                          void archiveExercise(supabase, exercise.id)
                            .then(load)
                            .catch(() =>
                              setError("We couldn’t archive this exercise. Please try again."),
                            )
                        }
                        className="mt-3 text-sm font-semibold text-amber-300"
                      >
                        Archive
                      </button>
                    ) : (
                      <p className="mt-2 text-xs font-bold text-fg-3">Shared library</p>
                    )}
                  </article>
                ))}
              </div>
            </>
          ) : null}
          {tab === "history" ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
              {!history.length ? (
                <p className="p-6 text-sm text-fg-3">Finished workouts will appear here.</p>
              ) : null}
              <ul className="divide-y divide-line">
                {history.map((session) => {
                  const metrics = calculateWorkoutSessionMetrics(session);
                  return (
                    <li key={session.id}>
                      <Link
                        href={`/workouts/sessions/${session.id}/summary`}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-raised sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] sm:px-5"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-semibold">
                            {session.name}
                          </span>
                          <span className="block text-[13px] capitalize text-fg-3">
                            {relativeDay(session.session_date, date)}
                            {session.status !== "completed" ? ` · ${session.status}` : ""}
                          </span>
                        </span>
                        <span className="text-sm tabular-nums text-fg-2">
                          {metrics.durationSeconds
                            ? `${Math.round(metrics.durationSeconds / 60)} min`
                            : "—"}
                        </span>
                        <span className="hidden text-sm tabular-nums text-fg-2 sm:block">
                          {metrics.completedSetCount} sets · {metrics.totalRepetitions} reps
                        </span>
                        <span className="hidden text-sm tabular-nums text-fg-2 sm:block">
                          {formatVolume(metrics.totalExternalLoadVolume)} lb
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
        <aside
          aria-labelledby="volume-heading"
          className="min-w-0 flex-[1_1_300px] rounded-2xl border border-line bg-surface p-5"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="volume-heading" className="text-[15px] font-semibold">
              Weekly volume
            </h2>
            <Link href="/workouts/progress" className="text-sm font-semibold text-accent-fg">
              All progress
            </Link>
          </div>
          <p className="mt-0.5 text-[13px] text-fg-3">Completed load, last 8 weeks (lb)</p>
          <ol className="mt-4 flex h-32 items-end gap-2" aria-label="Weekly volume by week">
            {volume.map((week, index) => (
              <li key={week.start} className="flex h-full flex-1 flex-col justify-end">
                <span
                  className={`block rounded-t-md rounded-b-sm ${index === volume.length - 1 ? "bg-cat-workout" : "bg-cat-workout/35"}`}
                  style={{ height: `${Math.max(3, (week.volume / maxVolume) * 100)}%` }}
                  title={`${week.start}: ${formatVolume(week.volume)} lb`}
                />
                <span className="sr-only">
                  Week of {week.start}: {formatVolume(week.volume)} pounds
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-2 flex justify-between text-xs text-fg-3">
            <span>8 weeks ago</span>
            <span>This week</span>
          </div>
        </aside>
      </div>
      {showExercise ? (
        <CustomExerciseForm
          onCancel={() => setShowExercise(false)}
          onCreated={(exercise) => {
            setExercises((items) =>
              [...items, exercise].sort((a, b) => a.name.localeCompare(b.name)),
            );
            setShowExercise(false);
            setError("");
          }}
        />
      ) : null}
      {showSchedule ? (
        <SheetDialog
          title={`Schedule ${showSchedule.name}`}
          onClose={() => setShowSchedule(null)}
          saving={busy}
          onSubmit={schedule}
          failureMessage="We couldn’t schedule this workout. Please try again."
          footer={
            <button
              disabled={busy}
              className="min-h-12 w-full rounded-xl bg-accent hover:bg-accent-hover font-semibold text-white"
            >
              {busy ? "Scheduling…" : "Schedule Workout"}
            </button>
          }
        >
          <label className="mt-5 block font-bold">
            Date
            <input
              name="date"
              type="date"
              required
              defaultValue={today()}
              className="mt-2 min-h-12 w-full rounded-xl border border-line-strong bg-raised px-4"
            />
          </label>
          <label className="mt-4 block font-bold">
            Time
            <input
              name="time"
              type="time"
              className="mt-2 min-h-12 w-full rounded-xl border border-line-strong bg-raised px-4"
            />
          </label>
        </SheetDialog>
      ) : null}
      {confirm ? (
        <SheetDialog
          title={
            confirm.action === "archive"
              ? `Archive ${confirm.template.name}?`
              : `Delete ${confirm.template.name} permanently?`
          }
          onClose={() => setConfirm(null)}
          saving={busy}
          error={error}
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setConfirm(null)}
                className="min-h-11 rounded-xl border border-line-strong px-4 font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={() => void manage(confirm.template, confirm.action)}
                className={`min-h-11 rounded-xl px-4 font-bold ${confirm.action === "delete" ? "bg-red-700 text-white" : "bg-amber-500/15 text-amber-100"}`}
              >
                {busy
                  ? "Working…"
                  : confirm.action === "delete"
                    ? "Delete permanently"
                    : "Archive template"}
              </button>
            </div>
          }
        >
          <p className="mt-3 text-fg-2">
            {confirm.action === "archive"
              ? "You won’t see this template when planning new workouts, but existing workout history will remain available."
              : "This action cannot be undone. Deletion will be blocked if the template has workout, protocol, or experiment history."}
          </p>
        </SheetDialog>
      ) : null}
    </div>
  );
}
