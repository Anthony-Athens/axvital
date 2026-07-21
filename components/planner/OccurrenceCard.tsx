"use client";

import Link from "next/link";
import type { OccurrenceStatus, PlannedActivityOccurrence } from "@/lib/planner/types";

function formatTime(value: string | null) { if (!value) return "Anytime"; const [h, m] = value.split(":"); const hour = Number(h); return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`; }

export function OccurrenceCard({ occurrence, busy, showManagement = false, onStatus, onEdit, onDelete, onProgress }: { occurrence: PlannedActivityOccurrence; busy: boolean; showManagement?: boolean; onStatus: (status: OccurrenceStatus) => void; onEdit?: () => void; onDelete?: () => void; onProgress?: () => void }) {
  const activity = occurrence.planned_activity;
  return <article className={`rounded-2xl border p-4 ${occurrence.status === "completed" ? "border-emerald-200 bg-emerald-50" : occurrence.status === "skipped" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0">{activity?.user_protocol ? <p className="mb-1 text-xs font-black uppercase tracking-wider text-violet-700">{activity.user_protocol.name} · {activity.protocol_links?.[0]?.is_required ? "Required" : "Optional"}</p> : null}<h3 className="font-black text-slate-950">{activity?.title ?? "Activity unavailable"}</h3><p className="mt-1 text-sm font-bold capitalize text-slate-500">{formatTime(occurrence.scheduled_time)} · {activity?.activity_type ?? "activity"}</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black capitalize text-slate-700 ring-1 ring-slate-200">{occurrence.status}</span></div>
    {activity?.tracking_type !== "binary" && activity?.target_value ? <div className="mt-3"><div className="flex justify-between text-sm font-bold text-slate-600"><span>{occurrence.actual_value ?? 0} / {activity.target_value} {activity.target_unit}</span><span>{Math.round(occurrence.completion_percentage ?? 0)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={Math.min(100, occurrence.completion_percentage ?? 0)} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, occurrence.completion_percentage ?? 0)}%` }} /></div>{activity.minimum_value && occurrence.actual_value && occurrence.actual_value >= activity.minimum_value && occurrence.actual_value < activity.target_value ? <p className="mt-1 text-xs font-black text-emerald-700">Minimum reached</p> : null}</div> : null}
    {occurrence.completion_note ? <p className="mt-3 text-sm font-semibold italic text-slate-600">{occurrence.completion_note}</p> : null}
    <div className="mt-4 flex flex-wrap gap-2" aria-label={`Actions for ${activity?.title ?? "activity"}`}>
      {activity?.activity_type === "workout" ? <Link href="/workouts" className="min-h-11 rounded-full bg-violet-600 px-4 py-3 text-sm font-black text-white">Open Workout</Link> : null}
      {onProgress && (activity?.activity_type === "habit" || activity?.user_protocol_id) ? <button disabled={busy} onClick={onProgress} className="min-h-11 rounded-full bg-sky-100 px-4 text-sm font-black text-sky-900 disabled:opacity-50">{activity.tracking_type === "duration" ? "Add Minutes" : activity.tracking_type === "quantity" ? "Update Progress" : "Add Note"}</button> : null}
      {occurrence.status !== "completed" ? <button disabled={busy} onClick={() => onStatus("completed")} className="min-h-11 rounded-full bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-50">Complete</button> : null}
      {occurrence.status !== "skipped" ? <button disabled={busy} onClick={() => onStatus("skipped")} className="min-h-11 rounded-full bg-amber-100 px-4 text-sm font-black text-amber-900 disabled:opacity-50">Skip</button> : null}
      {occurrence.status !== "planned" ? <button disabled={busy} onClick={() => onStatus("planned")} className="min-h-11 rounded-full bg-white px-4 text-sm font-black text-slate-700 ring-1 ring-slate-200 disabled:opacity-50">Return to planned</button> : null}
      {showManagement && activity ? <><button disabled={busy} onClick={onEdit} className="min-h-11 rounded-full px-3 text-sm font-black text-slate-600">Edit</button><button disabled={busy} onClick={onDelete} className="min-h-11 rounded-full px-3 text-sm font-black text-rose-600">Delete</button></> : null}
    </div>
  </article>;
}
