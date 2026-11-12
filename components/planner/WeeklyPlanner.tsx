"use client";
import { useScheduleRefresh } from "@/lib/planner/use-schedule-refresh";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ActivityForm } from "./ActivityForm";
import { OccurrenceCard } from "./OccurrenceCard";
import { activityCategory, categoryTone } from "@/components/ui/CategoryIcon";
import { addCalendarDays } from "@/lib/planner/recurrence";
import {
  createPlannedActivity,
  deletePlannedActivity,
  ensureOccurrencesForRange,
  getOccurrencesForRange,
  updateOccurrenceStatus,
  updatePlannedActivity,
} from "@/lib/planner/planner";
import type {
  CreatePlannedActivityInput,
  OccurrenceStatus,
  PlannedActivity,
  PlannedActivityOccurrence,
} from "@/lib/planner/types";
import { supabase } from "@/lib/supabase/client";
import { logDevError } from "@/lib/app-errors";
import { ProgressModal } from "@/components/habits/ProgressModal";
import {
  completeHabitOccurrence,
  reopenHabitOccurrence,
  skipHabitOccurrence,
  updateHabitProgress,
} from "@/lib/habits/habits";

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function mondayFor(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const value = new Date(y, m - 1, d, 12);
  const offset = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - offset);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function dateLabel(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export function WeeklyPlanner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("week");
  const weekStart = useMemo(
    () => mondayFor(/^\d{4}-\d{2}-\d{2}$/.test(requested ?? "") ? requested! : localDate()),
    [requested],
  );
  const weekEnd = addCalendarDays(weekStart, 6);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addCalendarDays(weekStart, i)),
    [weekStart],
  );
  const [occurrences, setOccurrences] = useState<PlannedActivityOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PlannedActivity | null>(null);
  const [progressItem, setProgressItem] = useState<PlannedActivityOccurrence | null>(null);
  const [filter, setFilter] = useState<"all" | "protocols" | "habits" | "other">("all");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setOccurrences(await getOccurrencesForRange(supabase, weekStart, weekEnd));
    } catch (value) {
      logDevError("Failed to load weekly plan", value);
      setError("We couldn’t load your weekly plan.");
    } finally {
      setLoading(false);
    }
  }, [weekEnd, weekStart]);
  useScheduleRefresh(load);
  async function save(input: CreatePlannedActivityInput) {
    if (busyId) return;
    setBusyId("save");
    setError("");
    setSuccess("");
    try {
      if (editing) await updatePlannedActivity(supabase, editing.id, input, localDate());
      else await createPlannedActivity(supabase, input);
    } catch (value) {
      logDevError("Failed to save activity", value);
      setBusyId(null);
      const message =
        value instanceof Error
          ? value.message
          : "We couldn’t save this activity. The original date is unchanged.";
      setError(message);
      throw new Error(message);
    }
    // Persistence succeeded. A later refresh failure must not invite another create.
    setSuccess(editing ? "Activity updated." : "Activity added to your plan.");
    setFormOpen(false);
    setEditing(null);
    router.refresh();
    try {
      await ensureOccurrencesForRange(supabase, weekStart, weekEnd);
      await load();
    } catch (value) {
      logDevError("Failed to refresh plan", value);
      setError(
        "Your activity was saved, but the plan could not refresh. Reload the page to see it.",
      );
    } finally {
      setBusyId(null);
    }
  }
  async function changeStatus(item: PlannedActivityOccurrence, status: OccurrenceStatus) {
    setBusyId(item.id);
    try {
      const trackable =
        item.planned_activity?.activity_type === "habit" ||
        Boolean(item.planned_activity?.user_protocol_id);
      const updated = trackable
        ? status === "completed"
          ? await completeHabitOccurrence(
              supabase,
              item.id,
              item.actual_value,
              item.completion_note,
            )
          : status === "skipped"
            ? await skipHabitOccurrence(supabase, item.id)
            : await reopenHabitOccurrence(supabase, item.id)
        : await updateOccurrenceStatus(supabase, item.id, status);
      setOccurrences((values) => values.map((value) => (value.id === item.id ? updated : value)));
      setSuccess(`Activity marked ${status}.`);
    } catch (value) {
      logDevError("Failed to change status", value);
      setError("We couldn’t change the activity status.");
    } finally {
      setBusyId(null);
    }
  }
  async function remove(activity: PlannedActivity) {
    if (!window.confirm("Delete this activity and its history? This cannot be undone.")) return;
    setBusyId(activity.id);
    try {
      await deletePlannedActivity(supabase, activity.id);
      setOccurrences((items) => items.filter((item) => item.planned_activity_id !== activity.id));
      setSuccess("Activity deleted.");
    } catch (value) {
      logDevError("Failed to delete activity", value);
      setError("We couldn’t delete this activity.");
    } finally {
      setBusyId(null);
    }
  }
  async function saveProgress(value: number | null, note: string, complete: boolean) {
    if (!progressItem) return;
    setBusyId(progressItem.id);
    try {
      const updated = await updateHabitProgress(
        supabase,
        progressItem.id,
        value,
        note || null,
        complete,
      );
      setOccurrences((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      setProgressItem(null);
      setSuccess("Habit progress updated.");
    } catch (reason) {
      logDevError("Failed to update progress", reason);
      throw new Error("We couldn’t update your progress.");
    } finally {
      setBusyId(null);
    }
  }
  function navigate(start: string) {
    router.push(`/weekly-overview?week=${start}`);
  }
  const today = localDate();
  const isCurrentWeek = weekStart === mondayFor(today);
  const visible = (item: (typeof occurrences)[number]) =>
    filter === "all" || filter === "protocols"
      ? filter === "all" || Boolean(item.planned_activity?.user_protocol_id)
      : filter === "habits"
        ? item.planned_activity?.activity_type === "habit" &&
          !item.planned_activity?.user_protocol_id
        : !item.planned_activity?.user_protocol_id &&
          item.planned_activity?.activity_type !== "habit";
  const shown = occurrences.filter(visible);
  const doneCount = shown.filter((item) => item.status === "completed").length;
  const skippedCount = shown.filter((item) => item.status === "skipped").length;
  const nextId = shown
    .filter((item) => item.status === "planned" && item.scheduled_date >= today)
    .sort((a, b) =>
      `${a.scheduled_date}${a.scheduled_time ?? "99"}`.localeCompare(
        `${b.scheduled_date}${b.scheduled_time ?? "99"}`,
      ),
    )[0]?.id;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="text-sm text-fg-3">
            <a href="/track" className="hover:text-fg">
              Track
            </a>{" "}
            / <span className="text-fg-2">Weekly Overview</span>
          </nav>
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-fg sm:text-[32px]">
            {isCurrentWeek ? "This week" : "Weekly Overview"}
          </h1>
          <p className="mt-0.5 text-sm text-fg-3">
            {dateLabel(weekStart, { month: "long", day: "numeric" })} –{" "}
            {dateLabel(weekEnd, { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
            <button
              aria-label="Previous week"
              onClick={() => navigate(addCalendarDays(weekStart, -7))}
              className="grid h-10 w-10 place-items-center rounded-lg text-fg-2 hover:bg-raised"
            >
              <Chevron direction="left" />
            </button>
            <button
              onClick={() => navigate(mondayFor(localDate()))}
              disabled={isCurrentWeek}
              className="min-h-10 rounded-lg px-3 text-sm font-semibold text-fg hover:bg-raised disabled:text-fg-3 disabled:hover:bg-transparent"
            >
              Current week
            </button>
            <button
              aria-label="Next week"
              onClick={() => navigate(addCalendarDays(weekStart, 7))}
              className="grid h-10 w-10 place-items-center rounded-lg text-fg-2 hover:bg-raised"
            >
              <Chevron direction="right" />
            </button>
          </div>
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 font-semibold text-white hover:bg-accent-hover"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-[18px] w-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Activity
          </button>
        </div>
      </header>

      <section
        aria-label="Week summary"
        className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4 rounded-2xl border border-line bg-surface p-4 sm:px-5"
      >
        <div className="min-w-[240px] flex-1">
          <div aria-hidden="true" className="flex h-2.5 overflow-hidden rounded-full bg-line">
            <span
              className="bg-accent-fg"
              style={{ width: `${shown.length ? (doneCount / shown.length) * 100 : 0}%` }}
            />
            <span
              className="bg-slate-500"
              style={{ width: `${shown.length ? (skippedCount / shown.length) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-2 text-sm tabular-nums text-fg-2">
            <b className="text-fg">{doneCount}</b> done · <b className="text-fg">{skippedCount}</b>{" "}
            skipped · <b className="text-fg">{shown.length - doneCount - skippedCount}</b> still to
            come
          </p>
        </div>
        <div role="group" aria-label="Show" className="flex gap-1.5 overflow-x-auto">
          {(
            [
              ["all", "All activities"],
              ["protocols", "Protocols"],
              ["habits", "Habits"],
              ["other", "Other"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`min-h-10 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold ${
                filter === value
                  ? "border-line-strong bg-raised text-fg"
                  : "border-line text-fg-3 hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {!loading ? (
        <nav aria-label="Jump to day" className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
          {days.map((day) => {
            const items = shown.filter((item) => item.scheduled_date === day);
            const isToday = day === today;
            return (
              <a
                key={day}
                href={`#day-${day}`}
                className={`flex min-h-[76px] min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 hover:bg-raised ${
                  isToday ? "border-[1.5px] border-accent-fg bg-surface" : "border border-line"
                }`}
              >
                <span
                  className={`text-xs ${isToday ? "font-semibold text-blue-300" : "text-fg-3"}`}
                >
                  {dateLabel(day, { weekday: "short" })}
                </span>
                <span className="text-lg font-semibold leading-none tabular-nums">
                  {dateLabel(day, { day: "numeric" })}
                </span>
                <span aria-hidden="true" className="flex max-w-full flex-wrap justify-center gap-1">
                  {items.slice(0, 6).map((item) => {
                    const tone =
                      categoryTone[
                        activityCategory(
                          item.planned_activity?.activity_type,
                          Boolean(item.planned_activity?.user_protocol),
                        )
                      ];
                    return (
                      <span
                        key={item.id}
                        className={`h-1.5 w-1.5 rounded-full ${tone.bar} ${item.status === "planned" ? "" : "opacity-40"}`}
                      />
                    );
                  })}
                </span>
                <span className="sr-only">{items.length} activities</span>
              </a>
            );
          })}
        </nav>
      ) : null}

      {error ? (
        <p role="alert" className="mt-5 rounded-xl bg-rose-500/10 p-4 font-semibold text-rose-200">
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          role="status"
          className="mt-5 rounded-xl bg-emerald-500/10 p-4 font-semibold text-emerald-200"
        >
          {success}
        </p>
      ) : null}
      {loading ? (
        <div className="mt-5 rounded-2xl border border-line bg-surface p-6 font-semibold text-fg-2">
          Loading your weekly plan…
        </div>
      ) : null}
      {!loading && !occurrences.length ? (
        <div className="mt-5 rounded-2xl border border-dashed border-line-strong p-8 text-center">
          <h2 className="text-lg font-semibold">Nothing planned this week.</h2>
          <p className="mt-1 text-sm text-fg-2">Add an activity to begin building your routine.</p>
        </div>
      ) : null}
      {!loading ? (
        <div className="mt-6 flex flex-col gap-5">
          {days.map((day) => {
            const items = occurrences.filter((item) => item.scheduled_date === day).filter(visible);
            const isToday = day === today;
            return (
              <section key={day} id={`day-${day}`} className="scroll-mt-24">
                {/* Days already behind you this week start collapsed. */}
                <details open={!(isCurrentWeek && day < today)} className="group">
                  <summary className="mb-2 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl [&::-webkit-details-marker]:hidden">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4 shrink-0 text-fg-3 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2.5">
                        <h2
                          className={`text-lg font-semibold ${isToday ? "text-blue-300" : "text-fg"}`}
                        >
                          {dateLabel(day, { weekday: "long" })}
                        </h2>
                        <span className="text-sm text-fg-3">
                          {dateLabel(day, { month: "short", day: "numeric" })}
                        </span>
                        {isToday ? (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-blue-300">
                            Today
                          </span>
                        ) : null}
                        <span className="ml-auto text-[13px] tabular-nums text-fg-3">
                          {items.length
                            ? `${items.filter((item) => item.status === "completed").length}/${items.length} done`
                            : ""}
                        </span>
                      </div>
                    </div>
                  </summary>
                  {items.length ? (
                    <div
                      className={`divide-y divide-line overflow-hidden rounded-2xl border bg-surface ${isToday ? "border-accent-fg/40" : "border-line"}`}
                    >
                      {items.map((item) => (
                        <OccurrenceCard
                          key={item.id}
                          occurrence={item}
                          busy={busyId === item.id || busyId === item.planned_activity_id}
                          showManagement
                          highlight={item.id === nextId}
                          onStatus={(status) => void changeStatus(item, status)}
                          onEdit={() => {
                            setEditing(item.planned_activity ?? null);
                            setFormOpen(true);
                          }}
                          onDelete={() =>
                            item.planned_activity && void remove(item.planned_activity)
                          }
                          onProgress={
                            item.planned_activity?.activity_type === "habit" ||
                            item.planned_activity?.user_protocol_id
                              ? () => setProgressItem(item)
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-fg-3">
                      Nothing scheduled.
                    </p>
                  )}
                </details>
              </section>
            );
          })}
        </div>
      ) : null}
      {formOpen ? (
        <ActivityForm
          activity={editing}
          initialDate={weekStart}
          saving={busyId === "save"}
          onCancel={() => {
            if (!busyId) {
              setFormOpen(false);
              setEditing(null);
            }
          }}
          onSubmit={save}
        />
      ) : null}
      {progressItem ? (
        <ProgressModal
          occurrence={progressItem}
          saving={busyId === progressItem.id}
          onClose={() => setProgressItem(null)}
          onSave={saveProgress}
        />
      ) : null}
    </div>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}
