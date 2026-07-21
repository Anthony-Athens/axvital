"use client";

import { FormEvent, useState } from "react";
import { EQUIPMENT_OPTIONS, EXERCISE_CATEGORIES, MOVEMENT_PATTERNS, TRACKING_TYPES, metadataLabel } from "@/lib/workouts/exercise-metadata";
import { ExerciseDuplicateError, createExercise, findSimilarExercises } from "@/lib/workouts/exercises";
import type { Exercise } from "@/lib/workouts/types";
import { supabase } from "@/lib/supabase/client";

export function CustomExerciseForm({ initialName = "", onCreated, onCancel }: { initialName?: string; onCreated: (exercise: Exercise) => void; onCancel: () => void }) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [similar, setSimilar] = useState<Exercise[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const input = "mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      if (!confirmed) {
        const matches = await findSimilarExercises(supabase, name);
        if (matches.length) { setSimilar(matches); setSaving(false); return; }
      }
      const exercise = await createExercise(supabase, {
        name, description: String(form.get("description") || ""), category: String(form.get("category")),
        movement_pattern: String(form.get("movement_pattern") || ""), primary_muscle_group: String(form.get("primary_muscle_group") || ""),
        secondary_muscle_groups: String(form.get("secondary_muscle_groups") || "").split(","), equipment: String(form.get("equipment") || ""),
        default_tracking_type: String(form.get("default_tracking_type")),
      });
      onCreated(exercise);
    } catch (caught) {
      if (caught instanceof ExerciseDuplicateError) setSimilar([caught.existing]);
      else setError(caught instanceof Error ? caught.message : "We couldn’t save this exercise.");
    } finally { setSaving(false); }
  }

  return <form onSubmit={submit} className="max-h-[90vh] overflow-y-auto p-5" aria-label="Create custom exercise">
    <h2 className="text-2xl font-black">Create Custom Exercise</h2>
    {error ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 font-bold text-rose-700">{error}</p> : null}
    <label className="mt-4 block font-bold">Exercise name<input autoFocus required value={name} onChange={(event) => { setName(event.target.value); setConfirmed(false); setSimilar([]); }} className={input}/></label>
    {similar.length ? <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4"><p className="font-black">A similar exercise already exists.</p><p className="mt-1 text-sm">Select it to avoid a duplicate, or continue if yours is meaningfully different.</p><div className="mt-3 flex flex-wrap gap-2">{similar.map((exercise) => <button type="button" key={exercise.id} onClick={() => onCreated(exercise)} className="min-h-11 rounded-full bg-white px-4 font-bold">Use {exercise.name}</button>)}<button type="button" onClick={() => { setConfirmed(true); setSimilar([]); }} className="min-h-11 rounded-full bg-amber-200 px-4 font-bold">Continue creating</button></div></div> : null}
    <label className="mt-4 block font-bold">Description (optional)<textarea name="description" className={`${input} min-h-24 py-3`}/></label>
    <div className="grid gap-4 sm:grid-cols-2">
      <Select name="category" label="Category" values={EXERCISE_CATEGORIES} required input={input}/>
      <Select name="movement_pattern" label="Movement pattern" values={MOVEMENT_PATTERNS} input={input}/>
      <label className="mt-4 block font-bold">Primary muscle group<input name="primary_muscle_group" placeholder="e.g. quadriceps" className={input}/></label>
      <label className="mt-4 block font-bold">Secondary muscle groups<input name="secondary_muscle_groups" placeholder="glutes, hamstrings" className={input}/></label>
      <Select name="equipment" label="Equipment" values={EQUIPMENT_OPTIONS} input={input}/>
      <Select name="default_tracking_type" label="Default tracking" values={TRACKING_TYPES} required input={input}/>
    </div>
    <div className="mt-5 flex gap-2"><button type="button" onClick={onCancel} disabled={saving} className="min-h-12 flex-1 rounded-full bg-slate-100 font-black">Cancel</button><button disabled={saving} className="min-h-12 flex-1 rounded-full bg-emerald-500 font-black text-white">{saving ? "Saving…" : "Save Exercise"}</button></div>
  </form>;
}

function Select({ name, label, values, required, input }: { name: string; label: string; values: readonly string[]; required?: boolean; input: string }) {
  return <label className="mt-4 block font-bold">{label}<select name={name} required={required} defaultValue={required ? values[0] : ""} className={input}>{!required ? <option value="">Not specified</option> : null}{values.map((value) => <option value={value} key={value}>{metadataLabel(value)}</option>)}</select></label>;
}
