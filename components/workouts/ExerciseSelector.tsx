"use client";

import { SheetDialog } from "@/components/ui/SheetDialog";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  EQUIPMENT_OPTIONS,
  EXERCISE_CATEGORIES,
  MOVEMENT_PATTERNS,
  metadataLabel,
} from "@/lib/workouts/exercise-metadata";
import { searchExercises } from "@/lib/workouts/exercises";
import type {
  Exercise,
  ExerciseCategory,
  ExerciseEquipment,
  MovementPattern,
} from "@/lib/workouts/types";
import { supabase } from "@/lib/supabase/client";
import { CustomExerciseForm } from "./CustomExerciseForm";

export function ExerciseSelector({ onSelect }: { onSelect: (exercise: Exercise) => void }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");
  const [equipment, setEquipment] = useState("");
  const [movement, setMovement] = useState("");
  const [muscle, setMuscle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResults(
        await searchExercises(supabase, search, {
          category: (category as ExerciseCategory) || undefined,
          equipment: (equipment as ExerciseEquipment) || undefined,
          movement_pattern: (movement as MovementPattern) || undefined,
          primary_muscle_group: muscle || undefined,
        }),
      );
    } catch {
      setError("We couldn’t load the exercise library.");
    } finally {
      setLoading(false);
    }
  }, [search, category, equipment, movement, muscle]);
  useEffect(() => {
    if (!open || creating) return;
    const timer = setTimeout(() => void load(), 150);
    return () => clearTimeout(timer);
  }, [open, creating, load]);
  function close() {
    setOpen(false);
    setCreating(false);
    setSearch("");
    setCategory("");
    setEquipment("");
    setMovement("");
    setMuscle("");
    setError("");
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }
  function choose(exercise: Exercise) {
    onSelect(exercise);
    close();
  }
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 min-h-12 w-full rounded-xl border border-dashed border-accent px-4 text-left font-semibold text-accent-fg"
      >
        Search exercise library…
      </button>
      {open ? (
        creating ? (
          <CustomExerciseForm
            initialName={search}
            onCreated={choose}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <SheetDialog
            wide
            title="Select Exercise"
            onClose={close}
            backdropClose
            footer={
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full min-h-12 rounded-xl bg-accent hover:bg-accent-hover px-5 font-semibold text-white"
              >
                Create Custom Exercise{search ? ` “${search}”` : ""}
              </button>
            }
          >
            <label className="mt-4 font-bold">
              Search by name or alias
              <input
                ref={inputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-lg border px-4"
                placeholder="Try RDL or bench press"
              />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Filter
                value={category}
                set={setCategory}
                label="Category"
                values={EXERCISE_CATEGORIES}
              />
              <Filter
                value={equipment}
                set={setEquipment}
                label="Equipment"
                values={EQUIPMENT_OPTIONS}
              />
              <Filter
                value={muscle}
                set={setMuscle}
                label="Muscle"
                values={[
                  "chest",
                  "back",
                  "shoulders",
                  "biceps",
                  "triceps",
                  "quadriceps",
                  "hamstrings",
                  "glutes",
                  "core",
                  "full_body",
                ]}
              />
              <Filter
                value={movement}
                set={setMovement}
                label="Movement"
                values={MOVEMENT_PATTERNS}
              />
            </div>
            <div className="mt-4">
              {loading ? (
                <p className="p-5 text-center">Loading exercises…</p>
              ) : error ? (
                <div role="alert" className="p-5 text-center text-rose-300">
                  {error}
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="block min-h-11 w-full font-semibold underline"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                results.map((exercise) => (
                  <button
                    type="button"
                    key={exercise.id}
                    onClick={() => choose(exercise)}
                    className="mb-2 min-h-16 w-full rounded-xl bg-raised p-4 text-left hover:bg-emerald-500/10 focus:bg-emerald-500/10"
                  >
                    <span className="block font-semibold">{exercise.name}</span>
                    <span className="mt-1 block text-sm text-fg-2">
                      {[
                        metadataLabel(exercise.category),
                        exercise.primary_muscle_group &&
                          metadataLabel(exercise.primary_muscle_group),
                        exercise.equipment && metadataLabel(exercise.equipment),
                        metadataLabel(exercise.default_tracking_type),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                ))
              )}
              {!loading && !error && !results.length ? (
                <p className="p-5 text-center text-fg-3">No matching exercises.</p>
              ) : null}
            </div>
          </SheetDialog>
        )
      ) : null}
    </>
  );
}

function Filter({
  value,
  set,
  label,
  values,
}: {
  value: string;
  set: (value: string) => void;
  label: string;
  values: readonly string[];
}) {
  return (
    <label className="text-xs font-bold">
      {label}
      <select
        value={value}
        onChange={(event) => set(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-xl border px-2"
      >
        <option value="">All</option>
        {values.map((item) => (
          <option key={item} value={item}>
            {metadataLabel(item)}
          </option>
        ))}
      </select>
    </label>
  );
}
