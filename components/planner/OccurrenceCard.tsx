"use client";

import type { OccurrenceStatus, PlannedActivityOccurrence } from "@/lib/planner/types";

function formatTime(value: string | null) { if (!value) return "Anytime"; const [h, m] = value.split(":"); const hour = Number(h); return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`; }

export function OccurrenceCard({ occurrence, busy, showManagement = false, onStatus, onEdit, onDelete }: { occurrence: PlannedActivityOccurrence; busy: boolean; showManagement?: boolean; onStatus: (status: OccurrenceStatus) => void; onEdit?: () => void; onDelete?: () => void }) {
  const activity = occurrence.planned_activity;
  return <article className={`rounded-2xl border p-4 ${occurrence.status === "completed" ? "border-emerald-200 bg-emerald-50" : occurrence.status === "skipped" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-black text-slate-950">{activity?.title ?? "Activity unavailable"}</h3><p className="mt-1 text-sm font-bold capitalize text-slate-500">{formatTime(occurrence.scheduled_time)} · {activity?.activity_type ?? "activity"}</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black capitalize text-slate-700 ring-1 ring-slate-200">{occurrence.status}</span></div>
    <div className="mt-4 flex flex-wrap gap-2" aria-label={`Actions for ${activity?.title ?? "activity"}`}>
      {occurrence.status !== "completed" ? <button disabled={busy} onClick={() => onStatus("completed")} className="min-h-11 rounded-full bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-50">Complete</button> : null}
      {occurrence.status !== "skipped" ? <button disabled={busy} onClick={() => onStatus("skipped")} className="min-h-11 rounded-full bg-amber-100 px-4 text-sm font-black text-amber-900 disabled:opacity-50">Skip</button> : null}
      {occurrence.status !== "planned" ? <button disabled={busy} onClick={() => onStatus("planned")} className="min-h-11 rounded-full bg-white px-4 text-sm font-black text-slate-700 ring-1 ring-slate-200 disabled:opacity-50">Return to planned</button> : null}
      {showManagement && activity ? <><button disabled={busy} onClick={onEdit} className="min-h-11 rounded-full px-3 text-sm font-black text-slate-600">Edit</button><button disabled={busy} onClick={onDelete} className="min-h-11 rounded-full px-3 text-sm font-black text-rose-600">Delete</button></> : null}
    </div>
  </article>;
}
