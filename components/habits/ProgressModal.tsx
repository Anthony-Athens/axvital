"use client";

import { SheetDialog } from "@/components/ui/SheetDialog";
import { FormEvent, useState } from "react";
import type { PlannedActivityOccurrence } from "@/lib/planner/types";

export function ProgressModal({ occurrence, saving, onClose, onSave }: { occurrence: PlannedActivityOccurrence; saving: boolean; onClose: () => void; onSave: (value: number | null, note: string, complete: boolean) => Promise<void> }) {
  const activity = occurrence.planned_activity!; const [value, setValue] = useState(occurrence.actual_value?.toString() ?? ""); const [note, setNote] = useState(occurrence.completion_note ?? ""); const [complete, setComplete] = useState(occurrence.status === "completed");
  async function submit(event: FormEvent) { event.preventDefault(); await onSave(value === "" ? null : Number(value), note.trim(), complete); }
  return <SheetDialog title={`Update ${activity.title}`} onClose={onClose} saving={saving} onSubmit={submit} failureMessage="We couldn’t update your progress. Please try again." footer={<button disabled={saving} className="min-h-12 w-full rounded-full bg-emerald-500 font-black text-white disabled:opacity-50">{saving ? "Saving…" : "Save progress"}</button>}>
    {activity.tracking_type !== "binary" ? <label className="mt-5 block font-bold">{activity.tracking_type === "duration" ? "Minutes completed" : `Actual ${activity.target_unit ?? "value"}`}<input type="number" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 text-lg font-bold focus:border-emerald-500 focus:outline-none" /></label> : null}
    <label className="mt-5 block font-bold">Completion note <span className="text-slate-400">(optional)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 p-4 focus:border-emerald-500 focus:outline-none" /></label>
    {activity.tracking_type !== "binary" ? <label className="mt-4 flex min-h-11 items-center gap-3 font-bold"><input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} className="h-5 w-5 accent-emerald-500" /> Mark complete even if below target</label> : null}
  </SheetDialog>;
}
