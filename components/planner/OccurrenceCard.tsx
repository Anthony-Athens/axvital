"use client";
import Link from "next/link";
import type { OccurrenceStatus, PlannedActivityOccurrence } from "@/lib/planner/types";
import { CategoryIcon, activityCategory } from "@/components/ui/CategoryIcon";

function formatTime(value: string | null) {
  if (!value) return "Anytime";
  const [hours, minutes] = value.split(":");
  const hour = Number(hours);
  return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? "PM" : "AM"}`;
}

const secondary =
  "min-h-10 rounded-[10px] border border-line-strong bg-raised px-3 text-[13px] font-semibold text-fg-2 hover:bg-line hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-fg disabled:opacity-50";
const primary =
  "inline-flex min-h-10 items-center rounded-[10px] bg-accent px-3.5 text-[13px] font-semibold text-white hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent-fg disabled:opacity-50";

export function OccurrenceCard({
  occurrence,
  busy,
  showManagement = false,
  highlight = false,
  onStatus,
  onEdit,
  onDelete,
  onProgress,
}: {
  occurrence: PlannedActivityOccurrence;
  busy: boolean;
  showManagement?: boolean;
  /** Marks the next thing to do. */
  highlight?: boolean;
  onStatus: (status: OccurrenceStatus) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onProgress?: () => void;
}) {
  const activity = occurrence.planned_activity;
  const completed = occurrence.status === "completed";
  const skipped = occurrence.status === "skipped";
  const category = activityCategory(activity?.activity_type, Boolean(activity?.user_protocol));
  const isWorkout = activity?.activity_type === "workout";
  return (
    <article
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:flex-nowrap sm:px-5 ${highlight ? "bg-accent/10 shadow-[inset_3px_0_0_var(--accent-fg)]" : ""}`}
    >
      <span
        className={`w-[62px] shrink-0 text-[13px] tabular-nums ${highlight ? "font-semibold text-accent-fg" : "text-fg-3"}`}
      >
        {formatTime(occurrence.scheduled_time)}
      </span>
      <CategoryIcon category={category} size="sm" />
      <div className="min-w-0 flex-1 basis-40">
        {activity?.user_protocol ? (
          <p className="text-xs font-medium text-cat-habit">
            {activity.user_protocol.name} ·{" "}
            {activity.protocol_links?.[0]?.is_required ? "Required" : "Optional"}
          </p>
        ) : null}
        <h3
          className={`truncate text-[15px] font-semibold ${completed || skipped ? "text-fg-3 line-through" : "text-fg"}`}
        >
          {activity?.title ?? "Activity unavailable"}
        </h3>
        <p className="mt-0.5 text-[13px] capitalize text-fg-3">
          {highlight ? "Up next · " : ""}
          {activity?.activity_type ?? "activity"}
          {completed ? " · done" : skipped ? " · skipped" : ""}
        </p>
        {activity?.tracking_type !== "binary" && activity?.target_value ? (
          <div className="mt-2 max-w-xs">
            <div className="flex justify-between text-xs tabular-nums text-fg-3">
              <span>
                {occurrence.actual_value ?? 0} / {activity.target_value} {activity.target_unit}
              </span>
              <span>{Math.round(occurrence.completion_percentage ?? 0)}%</span>
            </div>
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-label={`${activity.title} progress`}
              aria-valuenow={Math.min(100, occurrence.completion_percentage ?? 0)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full rounded-full ${completed ? "bg-emerald-400" : "bg-accent-fg"}`}
                style={{ width: `${Math.min(100, occurrence.completion_percentage ?? 0)}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>
      <div
        className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:flex-nowrap sm:justify-end"
        aria-label={`Actions for ${activity?.title ?? "activity"}`}
      >
        {completed ? (
          <span className="inline-flex min-h-10 items-center gap-1.5 px-2 text-[13px] font-semibold text-emerald-300">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Done
          </span>
        ) : null}
        {isWorkout && !completed ? (
          <Link
            href={
              occurrence.planned_workouts?.length === 1
                ? `/workouts/planned/${occurrence.planned_workouts[0].id}`
                : "/workouts"
            }
            className={primary}
          >
            Open Workout
          </Link>
        ) : null}
        {onProgress && (activity?.activity_type === "habit" || activity?.user_protocol_id) ? (
          <button disabled={busy} onClick={onProgress} className={secondary}>
            {activity.tracking_type === "duration"
              ? "Add Minutes"
              : activity.tracking_type === "quantity"
                ? "Update Progress"
                : "Add Note"}
          </button>
        ) : null}
        {!completed ? (
          <button
            disabled={busy}
            onClick={() => onStatus("completed")}
            className={isWorkout ? secondary : primary}
          >
            Complete
          </button>
        ) : null}
        {occurrence.status !== "skipped" && !completed ? (
          <button disabled={busy} onClick={() => onStatus("skipped")} className={secondary}>
            Skip
          </button>
        ) : null}
        {occurrence.status !== "planned" ? (
          <button disabled={busy} onClick={() => onStatus("planned")} className={secondary}>
            Reopen
          </button>
        ) : null}
        {showManagement && activity ? (
          <>
            <button
              disabled={busy}
              onClick={onEdit}
              className="min-h-10 rounded-[10px] px-2.5 text-[13px] font-semibold text-fg-2 hover:bg-raised"
            >
              Edit
            </button>
            <button
              disabled={busy}
              onClick={onDelete}
              className="min-h-10 rounded-[10px] px-2.5 text-[13px] font-semibold text-rose-300 hover:bg-rose-500/10"
            >
              Delete
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}
