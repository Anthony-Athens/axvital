"use client";

import { FormEvent, useState } from "react";
import type { PlannedActivityOccurrence } from "@/lib/planner/types";

export function ProgressModal({ occurrence, saving, onClose, onSave }: { occurrence: PlannedActivityOccurrence; saving: boolean; onClose: () => void; onSave: (value: number | null, note: string, complete: boolean) => Promise<void> }) {
  const activity = occurrence.planned_activity!; const [value, setValue] = useState(occurrence.actual_value?.toString() ?? ""); const [note, setNote] = useState(occurrence.completion_note ?? ""); const [complete, setComplete] = useState(occurrence.status === "completed");
  async function submit(event: FormEvent) { event.preventDefault(); await onSave(value === "" ? null : Number(value), note.trim(), complete); }
  return <div className="fixed inset-0 z-[60] flex items-end bg-slate-950/50 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="progress-title"><form onSubmit={submit} className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6"><div className="flex items-center justify-between"><h2 id="progress-title" className="text-2xl font-black">Update {activity.title}</h2><button type="button" onClick={onClose} aria-label="Close progress editor" className="min-h-11 min-w-11 rounded-full bg-slate-100 font-black">×</button></div>
    {activity.tracking_type !== "binary" ? <label className="mt-5 block font-bold">{activity.tracking_type === "duration" ? "Minutes completed" : `Actual ${activity.target_unit ?? "value"}`}<input autoFocus type="number" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 text-lg font-bold focus:border-emerald-500 focus:outline-none" /></label> : null}
    <label className="mt-5 block font-bold">Completion note <span className="text-slate-400">(optional)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 p-4 focus:border-emerald-500 focus:outline-none" /></label>
    {activity.tracking_type !== "binary" ? <label className="mt-4 flex min-h-11 items-center gap-3 font-bold"><input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} className="h-5 w-5 accent-emerald-500" /> Mark complete even if below target</label> : null}
    <button disabled={saving} className="mt-5 min-h-12 w-full rounded-full bg-emerald-500 font-black text-white disabled:opacity-50">{saving ? "Saving…" : "Save progress"}</button></form></div>;
}
