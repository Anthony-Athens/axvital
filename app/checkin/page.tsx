"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { friendlyErrorMessage, logDevError, logDevInfo } from "@/lib/app-errors";
import { supabase } from "@/lib/supabase/client";
import type { HealthEventType } from "@/lib/types";
import { TodayPlan } from "@/components/planner/TodayPlan";
import { CollapsibleSection, usePersistentDisclosure } from "@/components/ui/CollapsibleSection";

type AnswerMap = Record<string, string>;
type QuickAddType =
  | "Food"
  | "Fluid"
  | "Supplement"
  | "Exercise"
  | "Symptom"
  | "Medication"
  | "Note";
type FieldKind = "text" | "time" | "number" | "integer" | "select" | "textarea";
type QuickAddField = {
  label: string;
  name: string;
  placeholder: string;
  kind?: FieldKind;
  options?: string[];
};
type LocalHealthEvent = {
  id: string;
  type: HealthEventType;
  eventTime: string;
  title: string;
  notes?: string | null;
  tags: string[];
  details: Record<string, string | number | null>;
};
type HealthEventRow = {
  id: string;
  user_id: string;
  event_date: string;
  event_time: string;
  event_type: HealthEventType;
  title: string | null;
  description: string | null;
  amount: string | null;
  dose: string | null;
  duration: string | null;
  intensity: string | null;
  severity: number | null;
  notes: string | null;
  tags: string[] | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  supplement_name: string | null;
  dose_amount: number | null;
  dose_unit: string | null;
  exercise_type: string | null;
  duration_minutes: number | null;
  distance: number | null;
  distance_unit: string | null;
};

const questions = [
  {
    id: "energy",
    label: "Energy",
    helper: "How much energy do you have right now?",
    options: Array.from({ length: 10 }, (_, index) => `${index + 1}`),
    columns: "grid-cols-5",
  },
  {
    id: "mood",
    label: "Mood",
    helper: "How steady does your mood feel?",
    options: Array.from({ length: 10 }, (_, index) => `${index + 1}`),
    columns: "grid-cols-5",
  },
  {
    id: "sleep",
    label: "Sleep Quality",
    helper: "How did last night's sleep feel?",
    options: ["Poor", "Average", "Good", "Great"],
    columns: "grid-cols-2",
  },
  {
    id: "exercise",
    label: "Exercise",
    helper: "What was today's activity level?",
    options: ["None", "Light", "Moderate", "Intense"],
    columns: "grid-cols-2",
  },
  {
    id: "nutrition",
    label: "Nutrition",
    helper: "How well did you eat today?",
    options: ["Poor", "Average", "Good", "Excellent"],
    columns: "grid-cols-2",
  },
  {
    id: "stress",
    label: "Stress",
    helper: "What was your stress level?",
    options: ["Low", "Medium", "High"],
    columns: "grid-cols-3",
  },
  {
    id: "alcohol",
    label: "Alcohol",
    helper: "Any alcohol today?",
    options: ["No", "Yes"],
    columns: "grid-cols-2",
  },
];

const quickAddTypes: QuickAddType[] = [
  "Food",
  "Fluid",
  "Supplement",
  "Exercise",
  "Symptom",
  "Medication",
  "Note",
];

const tagOptions = [
  "travel",
  "sick",
  "stress",
  "vacation",
  "injury",
  "hot weather",
  "cold weather",
  "poor sleep",
  "high protein",
  "low carb",
  "social event",
  "work stress",
  "screen time",
  "late night",
];

const supplementOptions = [
  "Creatine",
  "Multivitamin",
  "Vitamin D",
  "Magnesium",
  "Fish Oil",
  "Protein Powder",
  "Electrolytes",
  "Caffeine",
  "Melatonin",
  "Zinc",
  "Other",
];

const doseUnitOptions = [
  "mg",
  "g",
  "mcg",
  "IU",
  "capsule",
  "tablet",
  "serving",
  "scoop",
  "drop",
  "mL",
  "oz",
];

const exerciseTypeOptions = [
  "Run",
  "Walk",
  "Bike",
  "Swim",
  "Strength Training",
  "HIIT",
  "Yoga",
  "Mobility",
  "Sport",
  "Other",
];

const intensityOptions = ["Light", "Moderate", "Intense"];
const distanceUnitOptions = ["miles", "km", "meters", "yards"];

const quickAddFields: Record<QuickAddType, QuickAddField[]> = {
  Food: [
    { label: "Description", name: "description", placeholder: "4 eggs + avocado" },
    { label: "Time", name: "time", placeholder: "08:00", kind: "time" },
    { label: "Calories", name: "calories", placeholder: "520", kind: "integer" },
    {
      label: "Protein grams",
      name: "protein_g",
      placeholder: "32",
      kind: "integer",
    },
    { label: "Carbs grams", name: "carbs_g", placeholder: "18", kind: "integer" },
    { label: "Fat grams", name: "fat_g", placeholder: "34", kind: "integer" },
    {
      label: "Notes",
      name: "notes",
      placeholder: "Optional context",
      kind: "textarea",
    },
  ],
  Fluid: [
    {
      label: "Description",
      name: "description",
      placeholder: "Water, electrolytes, coffee",
    },
    { label: "Amount", name: "amount", placeholder: "16 oz" },
    { label: "Time", name: "time", placeholder: "10:30", kind: "time" },
    { label: "Notes", name: "notes", placeholder: "Optional context", kind: "textarea" },
  ],
  Supplement: [
    {
      label: "Supplement name",
      name: "supplement_name",
      placeholder: "Select supplement",
      kind: "select",
      options: supplementOptions,
    },
    {
      label: "Dose amount",
      name: "dose_amount",
      placeholder: "5",
      kind: "number",
    },
    {
      label: "Dose unit",
      name: "dose_unit",
      placeholder: "Select unit",
      kind: "select",
      options: doseUnitOptions,
    },
    { label: "Time", name: "time", placeholder: "08:00", kind: "time" },
    { label: "Notes", name: "notes", placeholder: "Optional context", kind: "textarea" },
  ],
  Exercise: [
    {
      label: "Exercise type",
      name: "exercise_type",
      placeholder: "Select exercise",
      kind: "select",
      options: exerciseTypeOptions,
    },
    {
      label: "Duration minutes",
      name: "duration_minutes",
      placeholder: "35",
      kind: "integer",
    },
    {
      label: "Intensity",
      name: "intensity",
      placeholder: "Select intensity",
      kind: "select",
      options: intensityOptions,
    },
    { label: "Distance", name: "distance", placeholder: "4", kind: "number" },
    {
      label: "Distance unit",
      name: "distance_unit",
      placeholder: "Select unit",
      kind: "select",
      options: distanceUnitOptions,
    },
    { label: "Time", name: "time", placeholder: "17:00", kind: "time" },
    { label: "Notes", name: "notes", placeholder: "Optional context", kind: "textarea" },
  ],
  Symptom: [
    { label: "Symptom", name: "symptom", placeholder: "Headache" },
    {
      label: "Severity 1-10",
      name: "severity",
      placeholder: "4",
      kind: "integer",
    },
    { label: "Time", name: "time", placeholder: "21:30", kind: "time" },
    { label: "Notes", name: "notes", placeholder: "Optional context", kind: "textarea" },
  ],
  Medication: [
    { label: "Name", name: "name", placeholder: "Medication name" },
    {
      label: "Dose amount",
      name: "dose_amount",
      placeholder: "1",
      kind: "number",
    },
    {
      label: "Dose unit",
      name: "dose_unit",
      placeholder: "Select unit",
      kind: "select",
      options: doseUnitOptions,
    },
    { label: "Time", name: "time", placeholder: "09:00", kind: "time" },
    { label: "Notes", name: "notes", placeholder: "Optional context", kind: "textarea" },
  ],
  Note: [
    { label: "Note text", name: "note_text", placeholder: "What happened?", kind: "textarea" },
    { label: "Time", name: "time", placeholder: "14:00", kind: "time" },
  ],
};

const initialTimeline: LocalHealthEvent[] = [
  {
    id: "sample-1",
    type: "supplement",
    eventTime: "08:00",
    title: "Coffee + creatine",
    tags: ["caffeine", "supplement"],
    details: {},
  },
  {
    id: "sample-2",
    type: "food",
    eventTime: "12:00",
    title: "4 eggs + multivitamin",
    tags: ["high protein"],
    details: { protein_g: 28 },
  },
  {
    id: "sample-3",
    type: "exercise",
    eventTime: "17:00",
    title: "4-mile run",
    tags: [],
    details: { duration_minutes: 38, distance: 4, distance_unit: "miles" },
  },
  {
    id: "sample-4",
    type: "symptom",
    eventTime: "21:30",
    title: "Mild headache",
    tags: ["screen time", "late night"],
    details: { severity: 3 },
  },
];

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function formatEventTime(value: string) {
  const [hours = "0", minutes = "00"] = value.split(":");
  const hourNumber = Number(hours);
  const displayHour = hourNumber % 12 || 12;
  const period = hourNumber >= 12 ? "PM" : "AM";

  // Hydration fix: avoid Date/Intl formatting during render so the server HTML
  // and the first client render produce identical timeline text.
  return `${displayHour}:${minutes.padStart(2, "0")} ${period}`;
}

function currentTimeValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function eventTimeValue(time: string | null) {
  return time || currentTimeValue();
}

function trimmedValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function labelValue(value: string | null | undefined) {
  const trimmed = trimmedValue(value);

  if (!trimmed) {
    return null;
  }

  return trimmed
    .split(/\s+/)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function exerciseLevelValue(value: string) {
  const allowedExerciseLevels: Record<string, string> = {
    None: "None",
    "No Workout": "No Workout",
    Light: "Light",
    Moderate: "Moderate",
    Intense: "Intense",
  };

  return allowedExerciseLevels[value] ?? "None";
}

function nutritionQualityValue(value: string | null | undefined) {
  const normalized = trimmedValue(value)?.toLowerCase();

  if (!normalized) {
    return null;
  }

  const nutritionMap: Record<string, "Poor" | "Average" | "Good" | "Excellent"> = {
    poor: "Poor",
    bad: "Poor",
    low: "Poor",
    average: "Average",
    okay: "Average",
    ok: "Average",
    fair: "Average",
    balanced: "Good",
    "balanced meal": "Good",
    clean: "Good",
    good: "Good",
    great: "Excellent",
    healthy: "Excellent",
    excellent: "Excellent",
    "very good": "Excellent",
  };

  return nutritionMap[normalized] ?? "Good";
}

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(formData: FormData, key: string) {
  const value = formValue(formData, key);
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function integerValue(formData: FormData, key: string) {
  const value = numberValue(formData, key);
  return value === null ? null : Math.trunc(value);
}

function quickAddTypeToEventType(type: QuickAddType): HealthEventType {
  return type.toLowerCase() as HealthEventType;
}

function eventTitle(type: QuickAddType, formData: FormData) {
  if (type === "Food" || type === "Fluid") {
    return formValue(formData, "description") ?? type;
  }

  if (type === "Supplement") {
    return formValue(formData, "supplement_name") ?? type;
  }

  if (type === "Exercise") {
    return formValue(formData, "exercise_type") ?? type;
  }

  if (type === "Symptom") {
    return formValue(formData, "symptom") ?? type;
  }

  if (type === "Medication") {
    return formValue(formData, "name") ?? type;
  }

  return formValue(formData, "note_text") ?? type;
}

function buildEventDetails(type: QuickAddType, formData: FormData) {
  const details: Record<string, string | number | null> = {};

  if (type === "Food") {
    details.calories = integerValue(formData, "calories");
    details.protein_g = integerValue(formData, "protein_g");
    details.carbs_g = integerValue(formData, "carbs_g");
    details.fat_g = integerValue(formData, "fat_g");
  }

  if (type === "Fluid") {
    details.amount = formValue(formData, "amount");
  }

  if (type === "Supplement" || type === "Medication") {
    details.dose_amount = numberValue(formData, "dose_amount");
    details.dose_unit = formValue(formData, "dose_unit");
  }

  if (type === "Supplement") {
    details.supplement_name = formValue(formData, "supplement_name");
  }

  if (type === "Exercise") {
    details.exercise_type = formValue(formData, "exercise_type");
    details.duration_minutes = integerValue(formData, "duration_minutes");
    details.intensity = formValue(formData, "intensity");
    details.distance = numberValue(formData, "distance");
    details.distance_unit = formValue(formData, "distance_unit");
  }

  if (type === "Symptom") {
    details.severity = integerValue(formData, "severity");
  }

  return details;
}

function titleFromRow(event: HealthEventRow) {
  if (event.title) {
    return event.title;
  }

  if (event.event_type === "supplement" && event.supplement_name) {
    return event.supplement_name;
  }

  if (event.event_type === "exercise" && event.exercise_type) {
    return event.exercise_type;
  }

  return event.description || event.notes || titleCase(event.event_type);
}

function detailsFromRow(event: HealthEventRow) {
  return {
    amount: event.amount,
    dose: event.dose,
    duration: event.duration,
    intensity: event.intensity,
    severity: event.severity,
    calories: event.calories,
    protein_g: event.protein_g,
    carbs_g: event.carbs_g,
    fat_g: event.fat_g,
    supplement_name: event.supplement_name,
    dose_amount: event.dose_amount,
    dose_unit: event.dose_unit,
    exercise_type: event.exercise_type,
    duration_minutes: event.duration_minutes,
    distance: event.distance,
    distance_unit: event.distance_unit,
  };
}

function mapHealthEventRow(event: HealthEventRow): LocalHealthEvent {
  return {
    id: event.id,
    type: event.event_type,
    eventTime: event.event_time,
    title: titleFromRow(event),
    notes: event.notes,
    tags: event.tags ?? [],
    details: detailsFromRow(event),
  };
}

function buildHealthEventPayload(
  type: QuickAddType,
  formData: FormData,
  userId: string,
  tags: string[],
) {
  const eventType = quickAddTypeToEventType(type);
  const title = eventTitle(type, formData);
  const doseAmount = numberValue(formData, "dose_amount");
  const doseUnit = formValue(formData, "dose_unit");
  const durationMinutes = integerValue(formData, "duration_minutes");

  return {
    user_id: userId,
    event_date: todayDateString(),
    event_time: eventTimeValue(formValue(formData, "time")),
    event_type: eventType,
    title,
    description:
      type === "Food" || type === "Fluid" ? formValue(formData, "description") : null,
    amount: type === "Fluid" ? formValue(formData, "amount") : null,
    dose:
      (type === "Supplement" || type === "Medication") && doseAmount && doseUnit
        ? `${doseAmount} ${doseUnit}`
        : null,
    duration:
      type === "Exercise" && durationMinutes ? `${durationMinutes} min` : null,
    intensity:
      type === "Exercise"
        ? formValue(formData, "intensity")?.toLowerCase() ?? null
        : null,
    severity: type === "Symptom" ? integerValue(formData, "severity") : null,
    notes: formValue(formData, "notes") ?? formValue(formData, "note_text"),
    tags,
    calories: type === "Food" ? integerValue(formData, "calories") : null,
    protein_g: type === "Food" ? integerValue(formData, "protein_g") : null,
    carbs_g: type === "Food" ? integerValue(formData, "carbs_g") : null,
    fat_g: type === "Food" ? integerValue(formData, "fat_g") : null,
    supplement_name:
      type === "Supplement" ? formValue(formData, "supplement_name") : null,
    dose_amount:
      type === "Supplement" || type === "Medication" ? doseAmount : null,
    dose_unit: type === "Supplement" || type === "Medication" ? doseUnit : null,
    exercise_type:
      type === "Exercise" ? formValue(formData, "exercise_type") : null,
    duration_minutes: type === "Exercise" ? durationMinutes : null,
    distance: type === "Exercise" ? numberValue(formData, "distance") : null,
    distance_unit:
      type === "Exercise" ? formValue(formData, "distance_unit") : null,
  };
}

export default function CheckInPage() {
  const [answers, setAnswers] = useState<AnswerMap>({
    energy: "8",
    mood: "7",
    sleep: "Good",
    exercise: "Moderate",
    nutrition: "Good",
    stress: "Low",
    alcohol: "No",
  });
  const [weight, setWeight] = useState("");
  const [saved, setSaved] = useState(false);
  const [checkinMessage, setCheckinMessage] = useState("");
  const [savingCheckin, setSavingCheckin] = useState(false);
  const [activeQuickAdd, setActiveQuickAdd] = useState<QuickAddType | null>(
    null,
  );
  const [eventMessage, setEventMessage] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [healthEvents, setHealthEvents] =
    useState<LocalHealthEvent[]>(initialTimeline);
  const [checkinExpanded, setCheckinExpanded] = usePersistentDisclosure("axvital.today.dailyCheckIn.expanded", false);
  const [eventsExpanded, setEventsExpanded] = usePersistentDisclosure("axvital.today.optionalEvents.expanded", false);

  const progress = useMemo(() => {
    const complete = questions.filter((question) => answers[question.id]).length;
    return Math.round((complete / questions.length) * 100);
  }, [answers]);

  useEffect(() => {
    let ignore = false;

    async function initializeEvents() {
      const user = await getAuthenticatedUser();

      if (!user || ignore) {
        return;
      }

      await loadTodayEvents(user.id);
    }

    initializeEvents();

    return () => {
      ignore = true;
    };
  }, []);

  function choose(questionId: string, option: string) {
    setSaved(false);
    setCheckinMessage("");
    setAnswers((current) => ({ ...current, [questionId]: option }));
  }

  async function getAuthenticatedUser(): Promise<User | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  }

  async function loadTodayEvents(userId: string) {
    const { data, error } = await supabase
      .from("health_events")
      .select(
        "id,user_id,event_date,event_time,event_type,title,description,amount,dose,duration,intensity,severity,notes,tags,calories,protein_g,carbs_g,fat_g,supplement_name,dose_amount,dose_unit,exercise_type,duration_minutes,distance,distance_unit",
      )
      .eq("user_id", userId)
      .eq("event_date", todayDateString())
      .order("event_time", { ascending: true });

    if (error) {
      logDevError("Failed to load health events", error);
      setEventMessage(friendlyErrorMessage("load your timeline"));
      return;
    }

    setHealthEvents(((data ?? []) as HealthEventRow[]).map(mapHealthEventRow));
  }

  async function saveDailyCheckin() {
    setSavingCheckin(true);
    setCheckinMessage("");

    const user = await getAuthenticatedUser();

    if (!user) {
      setSavingCheckin(false);
      setCheckinMessage("Please log in before saving your daily check-in.");
      setCheckinExpanded(true);
      return;
    }

    const parsedWeight = weight.trim() ? Number(weight) : null;
    const payload = {
      user_id: user.id,
      checkin_date: todayDateString(),
      energy_score: Number(answers.energy),
      mood_score: Number(answers.mood),
      sleep_quality: labelValue(answers.sleep),
      exercise_level: exerciseLevelValue(answers.exercise.trim()),
      nutrition_quality: nutritionQualityValue(answers.nutrition),
      stress_level: labelValue(answers.stress),
      alcohol: answers.alcohol === "Yes",
      weight: parsedWeight !== null && !Number.isNaN(parsedWeight) ? parsedWeight : null,
      notes: null,
      tags: [],
    };

    logDevInfo("Saving daily check-in payload", payload);
    logDevInfo("Daily check-in normalized values", {
      nutrition_quality: payload.nutrition_quality,
      exercise_level: payload.exercise_level,
      sleep_quality: payload.sleep_quality,
      stress_level: payload.stress_level,
    });

    const { error } = await supabase
      .from("daily_checkins")
      .upsert(payload, { onConflict: "user_id,checkin_date" });

    setSavingCheckin(false);

    if (error) {
      logDevError("Failed to save daily check-in", error);
      setCheckinMessage(friendlyErrorMessage("save your daily check-in"));
      setCheckinExpanded(true);
      return;
    }

    setSaved(true);
    setCheckinMessage("Daily check-in saved.");
  }

  function openQuickAdd(type: QuickAddType) {
    setEventMessage("");
    setSelectedTags([]);
    setActiveQuickAdd(type);
  }

  function toggleTag(tag: string) {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((currentTag) => currentTag !== tag)
        : [...current, tag],
    );
  }

  async function saveHealthEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeQuickAdd) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const user = await getAuthenticatedUser();
    const newEvent: LocalHealthEvent = {
      id: crypto.randomUUID(),
      type: quickAddTypeToEventType(activeQuickAdd),
      eventTime: formValue(formData, "time") ?? currentTimeValue(),
      title: eventTitle(activeQuickAdd, formData),
      notes: formValue(formData, "notes") ?? formValue(formData, "note_text"),
      tags: selectedTags,
      details: buildEventDetails(activeQuickAdd, formData),
    };

    if (user) {
      const payload = buildHealthEventPayload(
        activeQuickAdd,
        formData,
        user.id,
        selectedTags,
      );
      const { error } = await supabase.from("health_events").insert(payload);

      if (error) {
        logDevError("Failed to save health event", error);
        setEventMessage(friendlyErrorMessage("save this event"));
        return;
      }

      await loadTodayEvents(user.id);
      setEventMessage("Event saved. Timeline refreshed.");
      form.reset();
      setSelectedTags([]);
      return;
    }

    setHealthEvents((current) =>
      [...current, newEvent].sort((a, b) =>
        a.eventTime.localeCompare(b.eventTime),
      ),
    );
    setEventMessage("Event added to today's timeline.");
    form.reset();
    setSelectedTags([]);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-10">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-sm font-medium text-slate-500">{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Today</h1>
        <p className="mt-1 text-sm text-slate-600">Here’s what’s on your plan today.</p>
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"><div className="min-w-0 flex-1"><div className="flex justify-between text-sm"><span className="font-medium text-slate-700">Daily essentials</span><span className="tabular-nums text-slate-500">{progress}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Daily check-in progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-blue-600 transition-all motion-reduce:transition-none" style={{ width: `${progress}%` }}/></div></div></div>
      </header>

      <TodayPlan />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] lg:items-start">
        <CollapsibleSection id="daily-checkin" title="Daily Check-In" description={saved ? "Your essentials are saved for today." : "Complete your daily essentials in under 30 seconds."} status={<span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${saved ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{saved ? "Completed" : "Not completed"}</span>} expanded={checkinExpanded} onToggle={() => setCheckinExpanded((value) => !value)}>

          <form className="space-y-4">
            {questions.map((question) => (
              <fieldset
                key={question.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <legend className="w-full">
                  <span className="block text-base font-semibold text-slate-900">
                    {question.label}
                  </span>
                  <span className="mt-1 block text-sm font-medium leading-6 text-slate-500">
                    {question.helper}
                  </span>
                </legend>
                <div className={`mt-4 grid ${question.columns} gap-2`}>
                  {question.options.map((option) => {
                    const selected = answers[question.id] === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => choose(question.id, option)}
                        className={`min-h-12 rounded-lg border px-2 text-sm font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                          selected
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                        aria-pressed={selected}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            <label className="block rounded-xl border border-slate-200 bg-slate-50 p-4">
              <span className="block text-lg font-black text-slate-950">
                Weight
              </span>
              <span className="mt-1 block text-sm font-medium leading-6 text-slate-500">
                Optional, only when you want to track it.
              </span>
              <input
                value={weight}
                onChange={(event) => {
                  setSaved(false);
                  setCheckinMessage("");
                  setWeight(event.target.value);
                }}
                inputMode="decimal"
                placeholder="Optional weight"
                className="mt-4 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-base font-medium outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </form>

          <div className="mt-5 border-t border-slate-200 pt-4">
            {saved ? (
              <p className="mb-3 rounded-2xl bg-emerald-50 p-4 text-sm font-black text-emerald-700">
                {checkinMessage}
              </p>
            ) : checkinMessage ? (
              <p className="mb-3 rounded-2xl bg-amber-50 p-4 text-sm font-black text-amber-900">
                {checkinMessage}
              </p>
            ) : null}
            <button
              type="button"
              onClick={saveDailyCheckin}
              disabled={savingCheckin}
              className="flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-600 px-6 text-base font-semibold text-white transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {savingCheckin
                ? "Saving..."
                : saved
                  ? "Daily Check-In Saved"
                  : "Save Daily Check-In"}
            </button>
          </div>
        </CollapsibleSection>

        <div className="space-y-5">
          <CollapsibleSection id="optional-events" title="Optional Health Events" description="Log food, fluid, supplements, symptoms, medication, exercise, or notes." expanded={eventsExpanded} onToggle={() => setEventsExpanded((value) => !value)}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
              {quickAddTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => openQuickAdd(type)}
                  className="min-h-12 rounded-lg border border-slate-200 bg-slate-50 px-4 text-left text-sm font-semibold text-slate-900 transition hover:border-blue-300 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  {type}
                </button>
              ))}
            </div>
          </CollapsibleSection>

          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Today&apos;s Timeline
            </h2>
            <div className="mt-4 divide-y divide-slate-200">
              {healthEvents.map((item) => (
                <article
                  key={item.id}
                  className="relative py-3 pl-5"
                >
                  <div className="flex gap-3">
                    <div className="absolute left-0 top-5 h-2 w-2 rounded-full bg-blue-500" />
                    <div>
                      <p className="text-xs font-medium tabular-nums text-slate-500">
                        {formatEventTime(item.eventTime)} -{" "}
                        {titleCase(item.type)}
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-900">
                        {item.title}
                      </p>
                    </div>
                  </div>
                  {item.tags.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                        Tags:
                      </span>
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}{!healthEvents.length ? <p className="py-4 text-sm text-slate-500">Your logged events will appear here.</p> : null}
            </div>
          </section>
        </div>
      </div>

      {activeQuickAdd ? (
        <div
          className="fixed inset-0 z-50 bg-slate-950/35 px-4 pt-24 backdrop-blur-sm md:grid md:place-items-center md:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-add-title"
        >
          <form
            onSubmit={saveHealthEvent}
            className="safe-bottom fixed inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl md:static md:w-full md:max-w-lg md:rounded-3xl md:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-blue-700">
                  Quick Add
                </p>
                <h2
                  id="quick-add-title"
                  className="mt-2 text-3xl font-black tracking-tight"
                >
                  {activeQuickAdd}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveQuickAdd(null)}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-2xl font-black text-slate-700"
                aria-label="Close quick add"
              >
                x
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {quickAddFields[activeQuickAdd].map((field) => (
                <label key={field.name} className="block">
                  <span className="text-sm font-black text-slate-700">
                    {field.label}
                  </span>
                  {field.kind === "select" ? (
                    <select
                      name={field.name}
                      defaultValue=""
                      className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-slate-50 px-4 text-base font-medium outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="" disabled>
                        {field.placeholder}
                      </option>
                      {field.options?.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : field.kind === "textarea" ? (
                    <textarea
                      name={field.name}
                      placeholder={field.placeholder}
                      rows={4}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-base font-medium outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                  ) : (
                    <input
                      name={field.name}
                      type={
                        field.kind === "number" || field.kind === "integer"
                          ? "number"
                          : field.kind ?? "text"
                      }
                      inputMode={
                        field.kind === "number" || field.kind === "integer"
                          ? "decimal"
                          : undefined
                      }
                      step={field.kind === "integer" ? "1" : undefined}
                      placeholder={field.placeholder}
                      className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-slate-50 px-4 text-base font-medium outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                    />
                  )}
                </label>
              ))}
            </div>

            <section className="mt-5 rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-700">
                    Tags
                  </h3>
                  <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                    Optional context for future pattern discovery.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-400">
                  Optional
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {tagOptions.map((tag) => {
                  const selected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`min-h-11 rounded-full border px-3 text-sm font-black transition active:scale-[0.98] ${
                        selected
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                      aria-pressed={selected}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </section>

            {eventMessage ? (
              <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-black text-emerald-700">
                {eventMessage}
              </p>
            ) : null}

            <div className="mt-5 grid grid-cols-[0.8fr_1.2fr] gap-3">
              <button
                type="button"
                onClick={() => setActiveQuickAdd(null)}
                className="min-h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base font-black text-slate-700"
              >
                Skip
              </button>
              <button
                type="submit"
                className="min-h-14 rounded-xl bg-blue-600 px-4 text-base font-semibold text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                Save Event
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
