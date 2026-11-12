"use client";
import { useScheduleRefresh } from "@/lib/planner/use-schedule-refresh";

import Link from "next/link";
import { useCallback, useState } from "react";
import { OccurrenceCard } from "./OccurrenceCard";
import { getOccurrencesForDate, updateOccurrenceStatus } from "@/lib/planner/planner";
import type { OccurrenceStatus, PlannedActivityOccurrence } from "@/lib/planner/types";
import { supabase } from "@/lib/supabase/client";
import { logDevError } from "@/lib/app-errors";
import { ProgressModal } from "@/components/habits/ProgressModal";
import {
  completeHabitOccurrence,
  reopenHabitOccurrence,
  skipHabitOccurrence,
  updateHabitProgress,
} from "@/lib/habits/habits";
import { protocolDay } from "@/lib/protocols/protocols";

function todayString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function TodayPlan() {
  const [items, setItems] = useState<PlannedActivityOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progressItem, setProgressItem] = useState<PlannedActivityOccurrence | null>(null);
  const load = useCallback(async () => {
    try {
      setItems(await getOccurrencesForDate(supabase, todayString()));
      setError("");
    } catch (value) {
      logDevError("Failed to load today's plan", value);
      setError("We couldn’t load today’s plan.");
    } finally {
      setLoading(false);
    }
  }, []);
  useScheduleRefresh(load);
  async function change(item: PlannedActivityOccurrence, status: OccurrenceStatus) {
    setBusy(item.id);
    setError("");
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
      setItems((values) => values.map((value) => (value.id === item.id ? updated : value)));
    } catch (value) {
      logDevError("Failed to change activity status", value);
      setError("We couldn’t change the activity status.");
    } finally {
      setBusy(null);
    }
  }
  async function saveProgress(value: number | null, note: string, complete: boolean) {
    if (!progressItem) return;
    setBusy(progressItem.id);
    try {
      const updated = await updateHabitProgress(
        supabase,
        progressItem.id,
        value,
        note || null,
        complete,
      );
      setItems((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      setProgressItem(null);
    } catch (reason) {
      logDevError("Failed to update progress", reason);
      setError("We couldn’t update your progress.");
      throw new Error("We couldn’t update your progress.");
    } finally {
      setBusy(null);
    }
  }
  const done = items.filter((item) => item.status === "completed").length;
  const nextId = items.find((item) => item.status === "planned")?.id;
  return (
    <section aria-labelledby="today-plan-heading" className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="today-plan-heading" className="text-lg font-semibold tracking-tight text-fg">
            Today’s Plan
          </h2>
          <p className="mt-0.5 text-[13px] tabular-nums text-fg-3">
            {items.length ? `${done} of ${items.length} completed` : "What you have planned today"}
          </p>
        </div>
        <Link
          href="/weekly-overview"
          className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-accent-fg hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent-fg"
        >
          View full week
        </Link>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-200"
        >
          {error}
        </p>
      ) : null}
      {[
        ...new Map(
          items
            .filter((item) => item.planned_activity?.user_protocol)
            .map((item) => [item.planned_activity!.user_protocol!.id, item]),
        ).values(),
      ].map((item) => {
        const protocol = item.planned_activity!.user_protocol!;
        const own = items.filter((row) => row.planned_activity?.user_protocol?.id === protocol.id);
        return (
          <div
            key={protocol.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-cat-habit/25 bg-cat-habit/10 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-fg">
                {protocol.name} · Day {protocolDay(protocol.start_date, todayString())}
              </p>
              <p className="text-[13px] tabular-nums text-fg-2">
                {own.filter((row) => row.status === "completed").length} of {own.length} completed
                today
              </p>
            </div>
            <Link
              href={`/protocols/${protocol.id}`}
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-cat-habit hover:bg-raised"
            >
              View
            </Link>
          </div>
        );
      })}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {loading ? (
          <p role="status" className="px-5 py-4 text-sm font-semibold text-fg-3">
            Loading today’s plan…
          </p>
        ) : null}
        {!loading && !items.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <p className="text-sm text-fg-2">Nothing planned yet.</p>
            <Link
              href="/weekly-overview"
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-accent-fg hover:bg-raised"
            >
              Plan your week
            </Link>
          </div>
        ) : null}
        <div className="divide-y divide-line">
          {items.map((item) => (
            <OccurrenceCard
              key={item.id}
              occurrence={item}
              busy={busy === item.id}
              highlight={item.id === nextId}
              onStatus={(status) => void change(item, status)}
              onProgress={
                item.planned_activity?.activity_type === "habit" ||
                item.planned_activity?.user_protocol_id
                  ? () => setProgressItem(item)
                  : undefined
              }
            />
          ))}
        </div>
      </div>
      {progressItem ? (
        <ProgressModal
          occurrence={progressItem}
          saving={busy === progressItem.id}
          onClose={() => setProgressItem(null)}
          onSave={saveProgress}
        />
      ) : null}
    </section>
  );
}
