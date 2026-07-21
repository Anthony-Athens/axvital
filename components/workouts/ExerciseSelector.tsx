"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EQUIPMENT_OPTIONS, EXERCISE_CATEGORIES, MOVEMENT_PATTERNS, metadataLabel } from "@/lib/workouts/exercise-metadata";
import { searchExercises } from "@/lib/workouts/exercises";
import type { Exercise, ExerciseCategory, ExerciseEquipment, MovementPattern } from "@/lib/workouts/types";
import { supabase } from "@/lib/supabase/client";
import { CustomExerciseForm } from "./CustomExerciseForm";

export function ExerciseSelector({ onSelect }: { onSelect: (exercise: Exercise) => void }) {
  const [open, setOpen] = useState(false); const [creating, setCreating] = useState(false); const [search, setSearch] = useState("");
  const [results, setResults] = useState<Exercise[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [category, setCategory] = useState(""); const [equipment, setEquipment] = useState(""); const [movement, setMovement] = useState(""); const [muscle, setMuscle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => { setLoading(true); setError(""); try { setResults(await searchExercises(supabase, search, { category: category as ExerciseCategory || undefined, equipment: equipment as ExerciseEquipment || undefined, movement_pattern: movement as MovementPattern || undefined, primary_muscle_group: muscle || undefined })); } catch { setError("We couldn’t load the exercise library."); } finally { setLoading(false); } }, [search, category, equipment, movement, muscle]);
  useEffect(() => { if (!open || creating) return; const timer = setTimeout(() => void load(), 150); return () => clearTimeout(timer); }, [open, creating, load]);
  useEffect(() => { if (open && !creating) inputRef.current?.focus(); }, [open, creating]);
  function choose(exercise: Exercise) { onSelect(exercise); setOpen(false); setCreating(false); }
  return <><button type="button" onClick={() => setOpen(true)} className="mt-2 min-h-12 w-full rounded-2xl border border-dashed border-emerald-500 px-4 text-left font-black text-emerald-700">Search exercise library…</button>
    {open ? <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/55 sm:items-center sm:justify-center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label="Select exercise" className="max-h-[92vh] w-full overflow-hidden rounded-t-3xl bg-white sm:max-w-2xl sm:rounded-3xl">
        {creating ? <CustomExerciseForm initialName={search} onCreated={choose} onCancel={() => setCreating(false)}/> : <div className="flex max-h-[92vh] flex-col p-5">
          <div className="flex items-center justify-between"><h2 className="text-2xl font-black">Select Exercise</h2><button type="button" aria-label="Close exercise selector" onClick={() => setOpen(false)} className="min-h-11 min-w-11 rounded-full bg-slate-100 font-black">×</button></div>
          <label className="mt-4 font-bold">Search by name or alias<input ref={inputRef} value={search} onChange={(event) => setSearch(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border px-4" placeholder="Try RDL or bench press"/></label>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><Filter value={category} set={setCategory} label="Category" values={EXERCISE_CATEGORIES}/><Filter value={equipment} set={setEquipment} label="Equipment" values={EQUIPMENT_OPTIONS}/><Filter value={muscle} set={setMuscle} label="Muscle" values={["chest","back","shoulders","biceps","triceps","quadriceps","hamstrings","glutes","core","full_body"]}/><Filter value={movement} set={setMovement} label="Movement" values={MOVEMENT_PATTERNS}/></div>
          <div className="mt-4 overflow-y-auto" role="listbox">{loading ? <p className="p-5 text-center">Loading exercises…</p> : error ? <p role="alert" className="p-5 text-center text-rose-700">{error}</p> : results.map((exercise) => <button type="button" role="option" aria-selected="false" key={exercise.id} onClick={() => choose(exercise)} className="mb-2 min-h-16 w-full rounded-2xl bg-slate-50 p-4 text-left hover:bg-emerald-50 focus:bg-emerald-50"><span className="block font-black">{exercise.name}</span><span className="mt-1 block text-sm text-slate-600">{[metadataLabel(exercise.category), exercise.primary_muscle_group && metadataLabel(exercise.primary_muscle_group), exercise.equipment && metadataLabel(exercise.equipment), metadataLabel(exercise.default_tracking_type)].filter(Boolean).join(" · ")}</span></button>)}{!loading && !results.length ? <p className="p-5 text-center text-slate-500">No matching exercises.</p> : null}</div>
          <button type="button" onClick={() => setCreating(true)} className="mt-3 min-h-12 rounded-full bg-emerald-500 px-5 font-black text-white">Create Custom Exercise{search ? ` “${search}”` : ""}</button>
        </div>}
      </section>
    </div> : null}</>;
}

function Filter({ value, set, label, values }: { value: string; set: (value: string) => void; label: string; values: readonly string[] }) { return <label className="text-xs font-bold">{label}<select value={value} onChange={(event) => set(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border px-2"><option value="">All</option>{values.map((item) => <option key={item} value={item}>{metadataLabel(item)}</option>)}</select></label>; }
