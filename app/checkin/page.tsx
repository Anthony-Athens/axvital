"use client";

import { useMemo, useState } from "react";

type AnswerMap = Record<string, string>;
type QuickAddType =
  | "Food"
  | "Fluid"
  | "Supplement"
  | "Exercise"
  | "Symptom"
  | "Medication"
  | "Note";

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

const quickAddFields: Record<
  QuickAddType,
  Array<{ label: string; placeholder: string; kind?: "text" | "time" | "number" }>
> = {
  Food: [
    { label: "Description", placeholder: "Coffee + creatine" },
    { label: "Time", placeholder: "08:00", kind: "time" },
    { label: "Optional notes", placeholder: "Anything worth remembering" },
  ],
  Fluid: [
    { label: "Description", placeholder: "Water, electrolytes, coffee" },
    { label: "Amount", placeholder: "16 oz" },
    { label: "Time", placeholder: "10:30", kind: "time" },
  ],
  Supplement: [
    { label: "Name", placeholder: "Creatine" },
    { label: "Dose", placeholder: "5 g" },
    { label: "Time", placeholder: "08:00", kind: "time" },
  ],
  Exercise: [
    { label: "Type", placeholder: "Run, lift, walk" },
    { label: "Duration", placeholder: "35 min" },
    { label: "Intensity", placeholder: "Light, moderate, intense" },
    { label: "Time", placeholder: "17:00", kind: "time" },
  ],
  Symptom: [
    { label: "Symptom", placeholder: "Headache" },
    { label: "Severity 1-10", placeholder: "4", kind: "number" },
    { label: "Time", placeholder: "21:30", kind: "time" },
    { label: "Notes", placeholder: "Possible trigger or context" },
  ],
  Medication: [
    { label: "Name", placeholder: "Medication name" },
    { label: "Dose", placeholder: "Dose" },
    { label: "Time", placeholder: "09:00", kind: "time" },
  ],
  Note: [
    { label: "Note text", placeholder: "What happened?" },
    { label: "Time", placeholder: "14:00", kind: "time" },
  ],
};

const timeline = [
  { time: "8:00 AM", event: "Coffee + creatine", type: "Supplement" },
  { time: "12:00 PM", event: "4 eggs + multivitamin", type: "Food" },
  { time: "5:00 PM", event: "4-mile run", type: "Exercise" },
  { time: "9:30 PM", event: "Mild headache", type: "Symptom" },
];

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
  const [activeQuickAdd, setActiveQuickAdd] = useState<QuickAddType | null>(
    null,
  );
  const [eventSaved, setEventSaved] = useState(false);

  const progress = useMemo(() => {
    const complete = questions.filter((question) => answers[question.id]).length;
    return Math.round((complete / questions.length) * 100);
  }, [answers]);

  function choose(questionId: string, option: string) {
    setSaved(false);
    setAnswers((current) => ({ ...current, [questionId]: option }));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-10">
      <header className="sticky top-16 z-20 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur-xl md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
              AXVital
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">
              Today
            </h1>
            <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-500">
              Complete the essentials, then add extra context only when it
              matters.
            </p>
          </div>
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-white text-lg font-black text-emerald-700 shadow-sm">
            {progress}%
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] lg:items-start">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
                Daily Check-In
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight">
                Fast essentials
              </h2>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
              Under 30 sec
            </span>
          </div>

          <form className="mt-5 space-y-4">
            {questions.map((question) => (
              <fieldset
                key={question.id}
                className="rounded-3xl border border-slate-100 bg-slate-50 p-4"
              >
                <legend className="w-full">
                  <span className="block text-lg font-black text-slate-950">
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
                        className={`min-h-14 rounded-2xl border px-2 text-base font-black transition active:scale-[0.98] ${
                          selected
                            ? "border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-100"
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

            <label className="block rounded-3xl border border-slate-100 bg-slate-50 p-4">
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
                  setWeight(event.target.value);
                }}
                inputMode="decimal"
                placeholder="Optional weight"
                className="mt-4 min-h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-lg font-bold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </label>
          </form>

          <div className="safe-bottom sticky bottom-[4.75rem] z-30 -mx-5 mt-5 border-t border-slate-200 bg-white/95 px-5 pt-3 backdrop-blur-xl md:bottom-4 md:mx-0 md:rounded-3xl md:border md:shadow-xl md:shadow-slate-200 lg:static lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:shadow-none">
            <button
              type="button"
              onClick={() => setSaved(true)}
              className="flex min-h-16 w-full items-center justify-center rounded-2xl bg-slate-950 px-6 text-lg font-black text-white transition active:scale-[0.99]"
            >
              {saved ? "Daily Check-In Saved" : "Save Daily Check-In"}
            </button>
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
                  Quick Add
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">
                  Optional events
                </h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                Anytime
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              Add context when it is useful. Skip it when it is not.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
              {quickAddTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setEventSaved(false);
                    setActiveQuickAdd(type);
                  }}
                  className="min-h-16 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-left text-base font-black text-slate-900 transition active:scale-[0.98]"
                >
                  {type}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <h2 className="text-2xl font-black tracking-tight">
              Today&apos;s Timeline
            </h2>
            <div className="mt-5 space-y-3">
              {timeline.map((item) => (
                <article
                  key={`${item.time}-${item.event}`}
                  className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-emerald-500" />
                  <div>
                    <p className="text-sm font-black text-slate-500">
                      {item.time} — {item.type}
                    </p>
                    <p className="mt-1 text-base font-black text-slate-950">
                      {item.event}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-200 md:p-6">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
              Insight Preview
            </p>
            <p className="mt-3 text-xl font-black leading-8">
              Log consistently for 14 days to unlock your first personal
              patterns.
            </p>
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
          <div className="safe-bottom fixed inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl md:static md:w-full md:max-w-lg md:rounded-3xl md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
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
                ×
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {quickAddFields[activeQuickAdd].map((field) => (
                <label key={field.label} className="block">
                  <span className="text-sm font-black text-slate-700">
                    {field.label}
                  </span>
                  {activeQuickAdd === "Note" &&
                  field.label === "Note text" ? (
                    <textarea
                      placeholder={field.placeholder}
                      rows={4}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    />
                  ) : (
                    <input
                      type={field.kind ?? "text"}
                      inputMode={field.kind === "number" ? "numeric" : undefined}
                      placeholder={field.placeholder}
                      className="mt-2 min-h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    />
                  )}
                </label>
              ))}
            </div>

            {eventSaved ? (
              <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-black text-emerald-700">
                Placeholder event saved locally for this session.
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
                type="button"
                onClick={() => setEventSaved(true)}
                className="min-h-14 rounded-2xl bg-emerald-500 px-4 text-base font-black text-white"
              >
                Save Event
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
