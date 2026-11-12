"use client";
import Link from "next/link";
import { reportActivation } from "@/lib/telemetry/activation";
import { ingestHealthEvent } from "@/lib/health-events/ingestion";
import { VoiceLogDialog } from "@/components/checkin/VoiceLogDialog";

import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { User } from "@supabase/supabase-js";
import { friendlyErrorMessage, logDevError } from "@/lib/app-errors";
import { supabase } from "@/lib/supabase/client";
import type { HealthEventType } from "@/lib/types";
import { TodayPlan } from "@/components/planner/TodayPlan";
import { ActiveEpisodes } from "@/components/episodes/ActiveEpisodes";
import { usePersistentDisclosure } from "@/components/ui/CollapsibleSection";
import { CategoryIcon, type Category } from "@/components/ui/CategoryIcon";
import { controlClass } from "@/components/ui/design-system";
import { TodaySummary } from "@/components/today/TodaySummary";
import { CheckInFieldGroup } from "@/components/checkin/CheckInFieldGroup";
import { QuickLogDialog } from "@/components/checkin/QuickLogDialog";
import { QuickLogTagPicker } from "@/components/checkin/QuickLogTagPicker";
import { GettingStarted } from "@/components/checkin/GettingStarted";
import { Timeline } from "@/components/timeline/Timeline";
import { useSearchParams, useRouter } from "next/navigation";
import {
  draftFromRecord,
  loadCheckin,
  saveCheckin,
  type CheckinRecord,
} from "@/lib/checkins/persistence";
import { localDateString, selectedCalendarDate } from "@/lib/timeline/dates";

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
  detail?: boolean;
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
    columns: "grid-cols-4",
  },
  {
    id: "exercise",
    label: "Exercise",
    helper: "What was today's activity level?",
    options: ["None", "Light", "Moderate", "Intense"],
    columns: "grid-cols-4",
  },
  {
    id: "nutrition",
    label: "Nutrition",
    helper: "How well did you eat today?",
    options: ["Poor", "Average", "Good", "Excellent"],
    columns: "grid-cols-4",
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

const quickLogTypes: [QuickAddType, Category][] = [
  ["Food", "food"],
  ["Fluid", "fluid"],
  ["Supplement", "supplement"],
  ["Exercise", "workout"],
  ["Symptom", "symptom"],
  ["Medication", "medication"],
  ["Note", "note"],
];

function greetingFor(hour: number) {
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}
const subscribeGreeting = () => () => {};
const currentGreeting = () => greetingFor(new Date().getHours());

function MicIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function ProgressRing({ value, total }: { value: number; total: number }) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.round((value / total) * 100);
  return (
    <div
      className="flex items-center gap-2.5"
      role="progressbar"
      aria-label="Daily check-in progress"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className="whitespace-nowrap text-sm tabular-nums text-fg-2">
        {value} of {total}
      </span>
      <svg aria-hidden="true" width="38" height="38" viewBox="0 0 38 38">
        <circle cx="19" cy="19" r={radius} fill="none" className="stroke-line" strokeWidth="4" />
        <circle
          cx="19"
          cy="19"
          r={radius}
          fill="none"
          className="stroke-accent-fg transition-[stroke-dasharray] motion-reduce:transition-none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(circumference * value) / total} ${circumference}`}
          transform="rotate(-90 19 19)"
        />
      </svg>
    </div>
  );
}

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
    { label: "Time", name: "time", placeholder: "10:30", kind: "time", detail: true },
    {
      label: "Notes",
      name: "notes",
      placeholder: "Optional context",
      kind: "textarea",
      detail: true,
    },
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
    { label: "Time", name: "time", placeholder: "08:00", kind: "time", detail: true },
    {
      label: "Notes",
      name: "notes",
      placeholder: "Optional context",
      kind: "textarea",
      detail: true,
    },
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
      detail: true,
    },
    { label: "Distance", name: "distance", placeholder: "4", kind: "number", detail: true },
    {
      label: "Distance unit",
      name: "distance_unit",
      placeholder: "Select unit",
      kind: "select",
      options: distanceUnitOptions,
      detail: true,
    },
    { label: "Time", name: "time", placeholder: "17:00", kind: "time", detail: true },
    {
      label: "Notes",
      name: "notes",
      placeholder: "Optional context",
      kind: "textarea",
      detail: true,
    },
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
    { label: "Time", name: "time", placeholder: "09:00", kind: "time", detail: true },
    {
      label: "Notes",
      name: "notes",
      placeholder: "Optional context",
      kind: "textarea",
      detail: true,
    },
  ],
  Note: [
    { label: "Note text", name: "note_text", placeholder: "What happened?", kind: "textarea" },
    { label: "Time", name: "time", placeholder: "14:00", kind: "time", detail: true },
  ],
};

function currentTimeValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function todayDateString() {
  return localDateString();
}

function eventTimeValue(time: string | null) {
  return time || currentTimeValue();
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

function QuickLogFieldControl({ field }: { field: QuickAddField }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-fg-2">{field.label}</span>
      {field.kind === "select" ? (
        <select
          name={field.name}
          defaultValue=""
          className="mt-2 min-h-12 w-full rounded-lg border border-line-strong bg-raised px-4 text-base font-medium outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30"
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
          rows={3}
          className="mt-2 w-full rounded-lg border border-line-strong bg-raised px-4 py-3 text-base font-medium outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30"
        />
      ) : (
        <input
          name={field.name}
          type={
            field.kind === "number" || field.kind === "integer" ? "number" : (field.kind ?? "text")
          }
          inputMode={field.kind === "number" || field.kind === "integer" ? "decimal" : undefined}
          step={field.kind === "integer" ? "1" : field.kind === "number" ? "any" : undefined}
          placeholder={field.placeholder}
          className="mt-2 min-h-12 w-full rounded-lg border border-line-strong bg-raised px-4 text-base font-medium outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30"
        />
      )}
    </label>
  );
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
    description: type === "Food" || type === "Fluid" ? formValue(formData, "description") : null,
    amount: type === "Fluid" ? formValue(formData, "amount") : null,
    dose:
      (type === "Supplement" || type === "Medication") && doseAmount && doseUnit
        ? `${doseAmount} ${doseUnit}`
        : null,
    duration: type === "Exercise" && durationMinutes ? `${durationMinutes} min` : null,
    intensity:
      type === "Exercise" ? (formValue(formData, "intensity")?.toLowerCase() ?? null) : null,
    severity: type === "Symptom" ? integerValue(formData, "severity") : null,
    notes: formValue(formData, "notes") ?? formValue(formData, "note_text"),
    tags,
    calories: type === "Food" ? integerValue(formData, "calories") : null,
    protein_g: type === "Food" ? integerValue(formData, "protein_g") : null,
    carbs_g: type === "Food" ? integerValue(formData, "carbs_g") : null,
    fat_g: type === "Food" ? integerValue(formData, "fat_g") : null,
    supplement_name: type === "Supplement" ? formValue(formData, "supplement_name") : null,
    dose_amount: type === "Supplement" || type === "Medication" ? doseAmount : null,
    dose_unit: type === "Supplement" || type === "Medication" ? doseUnit : null,
    exercise_type: type === "Exercise" ? formValue(formData, "exercise_type") : null,
    duration_minutes: type === "Exercise" ? durationMinutes : null,
    distance: type === "Exercise" ? numberValue(formData, "distance") : null,
    distance_unit: type === "Exercise" ? formValue(formData, "distance_unit") : null,
  };
}

const subscribeDate = () => () => {};
function DateRoute() {
  const params = useSearchParams();
  const today = useSyncExternalStore(subscribeDate, localDateString, () => "");
  if (!today)
    return (
      <p role="status" className="p-6">
        Loading check-in…
      </p>
    );
  const date =
    params.getAll("date").length > 1 ? null : selectedCalendarDate(params.get("date"), today);
  if (!date)
    return (
      <div role="alert" className="p-6">
        Choose a valid date that is not in the future.{" "}
        <a href="/today" className="underline">
          Return to Today
        </a>
      </div>
    );
  return <CheckInForm key={date} date={date} historical={date !== today} />;
}
export default function CheckInPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6">
          Loading check-in…
        </p>
      }
    >
      <DateRoute />
    </Suspense>
  );
}
function CheckInForm({ date, historical }: { date: string; historical: boolean }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [baseline, setBaseline] = useState<CheckinRecord | null>(null);
  const [ownerId, setOwnerId] = useState("");
  const [loadingCheckin, setLoadingCheckin] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [weight, setWeight] = useState("");
  const [saved, setSaved] = useState(false);
  const [checkinMessage, setCheckinMessage] = useState("");
  const [savingCheckin, setSavingCheckin] = useState(false);
  const [activeQuickAdd, setActiveQuickAdd] = useState<QuickAddType | null>(null);
  const [eventMessage, setEventMessage] = useState("");
  const [savingEvent, setSavingEvent] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const quickAddTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showEventDetails, setShowEventDetails] = useState(false);
  // After a check-in is saved it collapses to a summary; this tracks "editing again".
  const [checkinExpanded, setCheckinExpanded] = usePersistentDisclosure(
    "axvital.today.checkin.editing",
    false,
  );
  const greeting = useSyncExternalStore(subscribeGreeting, currentGreeting, () => "Today");

  useEffect(() => {
    let active = true;
    loadCheckin(supabase, date)
      .then(({ row, userId }) => {
        if (!active) return;
        const draft = draftFromRecord(row);
        setBaseline(row);
        setOwnerId(userId);
        setAnswers(draft.answers);
        setWeight(draft.weight);
        setSaved(Boolean(row));
        setCheckinMessage(row ? `Check-in saved for ${date}.` : "");
      })
      .catch(() => {
        if (!active) return;
        setLoadFailed(true);
        setCheckinMessage("Your check-in could not be loaded. Reload before editing.");
        setCheckinExpanded(true);
      })
      .finally(() => {
        if (active) setLoadingCheckin(false);
      });
    return () => {
      active = false;
    };
  }, [date, setCheckinExpanded]);

  useEffect(() => {
    if (!ownerId) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id === ownerId) return;
      setAnswers({});
      setWeight("");
      setBaseline(null);
      setSaved(false);
      setLoadFailed(true);
      setCheckinMessage("Your sign-in changed. Reload before editing.");
      setCheckinExpanded(true);
    });
    return () => data.subscription.unsubscribe();
  }, [ownerId, setCheckinExpanded]);

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

  function refreshTimeline() {
    window.dispatchEvent(new Event("axvital:timeline-refresh"));
  }

  async function saveDailyCheckin() {
    if (loadingCheckin || loadFailed || savingCheckin) return;
    setSavingCheckin(true);
    setCheckinMessage("");
    try {
      const row = await saveCheckin(supabase, date, ownerId, baseline, { answers, weight });
      const draft = draftFromRecord(row);
      setBaseline(row);
      setAnswers(draft.answers);
      setWeight(draft.weight);
      setSaved(true);
      setCheckinMessage(`Check-in saved for ${date}.`);
      if (!historical) setCheckinExpanded(false);
      refreshTimeline();
    } catch (error) {
      setSaved(false);
      setCheckinMessage(
        error instanceof Error && error.message === "INVALID_WEIGHT"
          ? "Enter a valid weight greater than zero and no more than 2000."
          : "Check-in was not saved. Your answers are still here. Check your connection and sign-in; if this record changed elsewhere, reload before retrying.",
      );
      setCheckinExpanded(true);
    } finally {
      setSavingCheckin(false);
    }
  }

  function openQuickAdd(type: QuickAddType, trigger: HTMLButtonElement) {
    if (type === "Food") {
      router.push("/health/nutrition");
      return;
    }
    if (type === "Symptom") {
      router.push("/health/symptoms");
      return;
    }
    quickAddTriggerRef.current = trigger;
    setEventMessage("");
    setSelectedTags([]);
    setShowEventDetails(false);
    setActiveQuickAdd(type);
  }

  const closeQuickAdd = useCallback(() => {
    setActiveQuickAdd(null);
    setEventMessage("");
    setSelectedTags([]);
    setShowEventDetails(false);
    requestAnimationFrame(() => quickAddTriggerRef.current?.focus());
  }, []);

  function finishQuickAdd() {
    setActiveQuickAdd(null);
    setSelectedTags([]);
    setShowEventDetails(false);
    requestAnimationFrame(() => quickAddTriggerRef.current?.focus());
  }

  async function saveHealthEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeQuickAdd || savingEvent) {
      return;
    }

    setSavingEvent(true);
    setEventMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const user = await getAuthenticatedUser();
      if (user) {
        const payload = buildHealthEventPayload(activeQuickAdd, formData, user.id, selectedTags);
        await ingestHealthEvent(supabase, payload);

        reportActivation("first_health_event");
        refreshTimeline();
        setEventMessage("Event saved. Timeline refreshed.");
      } else {
        setEventMessage("Your event wasn’t saved. Please sign in before trying again.");
        return;
      }

      form.reset();
      setSelectedTags([]);
      finishQuickAdd();
    } catch (error) {
      logDevError("Failed to save health event", error);
      setEventMessage(friendlyErrorMessage("save this event"));
    } finally {
      setSavingEvent(false);
    }
  }

  const answeredCount = questions.filter((question) => answers[question.id]).length;
  const showCheckinForm = historical || loadFailed || loadingCheckin || !saved || checkinExpanded;
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00`));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg-3">{dateLabel}</p>
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-fg sm:text-[32px]">
            {historical ? "Historical check-in" : greeting}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {historical ? (
            <a
              href="/today"
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-accent-fg hover:bg-raised"
            >
              Return to Today
            </a>
          ) : (
            <>
              <Link
                href="/experiments"
                className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-accent-fg hover:bg-raised"
              >
                Record an experiment observation
              </Link>
              <button
                type="button"
                onClick={() => setVoiceOpen(true)}
                className="hidden min-h-11 items-center gap-2 rounded-xl border border-accent-fg/35 bg-accent/15 px-4 text-[15px] font-semibold text-blue-200 hover:bg-accent/25 focus-visible:ring-2 focus-visible:ring-accent-fg lg:inline-flex"
              >
                <MicIcon />
                Voice log
              </button>
            </>
          )}
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-6">
        {!historical ? <GettingStarted checkinComplete={saved} /> : null}
        {!historical ? <TodaySummary today={date} /> : null}

        <div
          className={`flex flex-col gap-6 ${historical ? "" : "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] lg:items-start"}`}
        >
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
            {showCheckinForm ? (
              <section
                aria-labelledby="daily-checkin-heading"
                className="order-1 min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 id="daily-checkin-heading" className="text-lg font-semibold text-fg">
                      Daily check-in
                    </h2>
                    <p className="mt-0.5 text-[13px] text-fg-3">
                      {loadingCheckin
                        ? "Loading…"
                        : historical
                          ? "Review or update this day’s answers."
                          : saved
                            ? "Saved. Change anything that’s different."
                            : "About 30 seconds. Answer what you can."}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <ProgressRing value={answeredCount} total={questions.length} />
                    {saved && !historical && checkinExpanded ? (
                      <button
                        type="button"
                        onClick={() => setCheckinExpanded(false)}
                        className="min-h-11 rounded-xl px-3 text-sm font-semibold text-fg-2 hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent-fg"
                      >
                        Close
                      </button>
                    ) : null}
                  </div>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveDailyCheckin();
                  }}
                >
                  <fieldset
                    disabled={loadingCheckin || loadFailed || savingCheckin}
                    className="mt-5 grid gap-x-8 gap-y-6 md:grid-cols-2"
                  >
                    {questions.map((question) => (
                      <CheckInFieldGroup
                        key={question.id}
                        id={question.id}
                        label={question.label}
                        helper={question.helper}
                        value={
                          answers[question.id]
                            ? question.options.length === 10
                              ? `${answers[question.id]} / 10`
                              : answers[question.id]
                            : undefined
                        }
                      >
                        <div className={`mt-3 grid ${question.columns} gap-1.5`}>
                          {(answers[question.id] && !question.options.includes(answers[question.id])
                            ? [...question.options, answers[question.id]]
                            : question.options
                          ).map((option) => {
                            const selected = answers[question.id] === option;
                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => choose(question.id, option)}
                                className={`min-h-11 rounded-[10px] border px-1.5 text-sm font-semibold tabular-nums transition outline-none focus-visible:ring-2 focus-visible:ring-accent-fg ${
                                  selected
                                    ? "border-accent-fg bg-accent text-white"
                                    : "border-line bg-raised text-fg-2 hover:border-line-strong hover:text-fg"
                                }`}
                                aria-pressed={selected}
                              >
                                {option}
                              </button>
                            );
                          })}
                        </div>
                      </CheckInFieldGroup>
                    ))}

                    <label className="block min-w-0">
                      <span className="block text-[15px] font-semibold text-fg">
                        Weight <span className="font-normal text-fg-3">(lb, optional)</span>
                      </span>
                      <span className="mt-0.5 block text-[13px] text-fg-3">
                        {baseline?.weight != null && baseline.weight_provenance_version !== 1
                          ? "This historical value has unknown units and has not been converted. Leave it unchanged, or replace it with a newly measured value in pounds."
                          : "New entries keep verified units for experiments."}
                      </span>
                      <input
                        value={weight}
                        onChange={(event) => {
                          setSaved(false);
                          setCheckinMessage("");
                          setWeight(event.target.value);
                        }}
                        inputMode="decimal"
                        placeholder="e.g. 172.4"
                        className={`mt-3 ${controlClass}`}
                      />
                    </label>
                  </fieldset>
                </form>

                <div className="mt-6 flex flex-col gap-3">
                  {saved && checkinMessage ? (
                    <p
                      role="status"
                      className="rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-300"
                    >
                      {checkinMessage}
                    </p>
                  ) : checkinMessage ? (
                    <p
                      role="alert"
                      className="rounded-xl bg-amber-500/10 p-3 text-sm font-semibold text-amber-100"
                    >
                      {checkinMessage}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={saveDailyCheckin}
                    disabled={
                      savingCheckin ||
                      loadingCheckin ||
                      loadFailed ||
                      (!baseline && !answeredCount && !weight.trim())
                    }
                    className="flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-6 text-base font-semibold text-white transition hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent-fg focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-fg-3"
                  >
                    {savingCheckin
                      ? "Saving..."
                      : saved
                        ? "Daily Check-In Saved"
                        : "Save Daily Check-In"}
                  </button>
                </div>
              </section>
            ) : null}

            {!historical ? (
              <div className="order-3 min-w-0">
                <TodayPlan />
              </div>
            ) : null}
            {!historical ? (
              <div className="order-4 min-w-0 empty:hidden">
                <ActiveEpisodes />
              </div>
            ) : null}
            <div className="order-5 min-w-0">
              <Timeline
                key={date}
                startDate={date}
                history={historical}
                title={historical ? "Activity for this day" : "Logged today"}
              />
            </div>
          </div>

          {!historical ? (
            <aside className="order-2 flex min-w-0 flex-col gap-4">
              {!showCheckinForm ? (
                <section
                  aria-labelledby="checkin-done-heading"
                  className="rounded-2xl border border-line bg-surface p-4 sm:p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 id="checkin-done-heading" className="text-[17px] font-semibold text-fg">
                      {answeredCount === questions.length ? "Check-in complete" : "Check-in saved"}
                    </h2>
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
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
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-2">
                    {questions
                      .filter((question) =>
                        ["energy", "mood", "sleep", "stress"].includes(question.id),
                      )
                      .map((question) => (
                        <div key={question.id} className="rounded-xl bg-raised px-3 py-2.5">
                          <dt className="text-[13px] text-fg-3">
                            {question.id === "sleep" ? "Sleep" : question.label}
                          </dt>
                          <dd className="text-xl font-semibold tabular-nums text-fg">
                            {answers[question.id] ?? "—"}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  {answeredCount < questions.length ? (
                    <p className="mt-3 text-[13px] text-fg-3">
                      {answeredCount} of {questions.length} answered
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setCheckinExpanded(true)}
                    className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl border border-line-strong bg-raised text-sm font-semibold text-fg hover:bg-line focus-visible:ring-2 focus-visible:ring-accent-fg"
                  >
                    Edit check-in
                  </button>
                </section>
              ) : null}

              <section
                aria-labelledby="quick-log-heading"
                className="rounded-2xl border border-line bg-surface p-4 sm:p-5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="quick-log-heading" className="text-[17px] font-semibold text-fg">
                    Quick log
                  </h2>
                  <span className="text-[13px] text-fg-3">Tap or speak</span>
                </div>
                {eventMessage && !activeQuickAdd ? (
                  <p
                    role="status"
                    className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-300"
                  >
                    {eventMessage}
                  </p>
                ) : null}
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {quickLogTypes.map(([type, category]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={(event) => openQuickAdd(type, event.currentTarget)}
                      className="flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-raised px-0.5 text-xs font-semibold text-fg transition hover:border-line-strong hover:bg-line focus-visible:ring-2 focus-visible:ring-accent-fg"
                    >
                      <CategoryIcon category={category} size="sm" />
                      <span className="max-w-full truncate">{type}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  aria-label="Open Voice Log"
                  onClick={() => setVoiceOpen(true)}
                  className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-accent-fg/35 bg-accent/15 px-4 text-[15px] font-semibold text-blue-200 hover:bg-accent/25 focus-visible:ring-2 focus-visible:ring-accent-fg"
                >
                  <MicIcon />
                  Voice log
                </button>
              </section>
            </aside>
          ) : null}
        </div>
      </div>
      {voiceOpen && (
        <VoiceLogDialog
          onClose={() => setVoiceOpen(false)}
          onSaved={() => {
            setVoiceOpen(false);
            refreshTimeline();
            setEventMessage("Events saved. Timeline refreshed.");
          }}
        />
      )}
      {activeQuickAdd ? (
        <QuickLogDialog
          title={activeQuickAdd}
          saving={savingEvent}
          message={eventMessage}
          onClose={closeQuickAdd}
          onSubmit={saveHealthEvent}
        >
          <div className="space-y-4">
            {quickAddFields[activeQuickAdd]
              .filter((field) => !field.detail)
              .map((field) => (
                <QuickLogFieldControl key={field.name} field={field} />
              ))}
          </div>

          {quickAddFields[activeQuickAdd].some((field) => field.detail) ? (
            <section className="mt-5 border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setShowEventDetails((value) => !value)}
                className="min-h-11 rounded-lg px-2 text-sm font-semibold text-blue-300 hover:bg-blue-500/10 focus-visible:ring-2 focus-visible:ring-accent-fg"
                aria-expanded={showEventDetails}
                aria-controls="quick-log-details"
              >
                {showEventDetails ? "− Hide details" : "+ Add details"}
              </button>
              <div id="quick-log-details" hidden={!showEventDetails} className="mt-3 space-y-4">
                {quickAddFields[activeQuickAdd]
                  .filter((field) => field.detail)
                  .map((field) => (
                    <QuickLogFieldControl key={field.name} field={field} />
                  ))}
              </div>
            </section>
          ) : null}

          <QuickLogTagPicker
            options={tagOptions}
            selected={selectedTags}
            onChange={setSelectedTags}
          />
        </QuickLogDialog>
      ) : null}
    </div>
  );
}
