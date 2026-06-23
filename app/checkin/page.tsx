"use client";

import { useMemo, useState } from "react";

type AnswerMap = Record<string, string>;

const questions = [
  {
    id: "energy",
    label: "Energy",
    helper: "How much energy do you have right now?",
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

export default function CheckInPage() {
  const [answers, setAnswers] = useState<AnswerMap>({
    energy: "8",
    sleep: "Good",
    exercise: "Moderate",
    nutrition: "Good",
    stress: "Low",
    alcohol: "No",
  });
  const [saved, setSaved] = useState(false);

  const progress = useMemo(() => {
    const complete = questions.filter((question) => answers[question.id]).length;
    return Math.round((complete / questions.length) * 100);
  }, [answers]);

  function choose(questionId: string, option: string) {
    setSaved(false);
    setAnswers((current) => ({ ...current, [questionId]: option }));
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-6 md:py-10">
      <header className="sticky top-16 z-20 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur-xl md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
              Daily Check-In
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">
              15-second health log
            </h1>
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

      <form className="mt-5 space-y-4 md:mt-8">
        {questions.map((question) => (
          <fieldset
            key={question.id}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <legend className="w-full">
              <span className="block text-xl font-black text-slate-950">
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
                    className={`min-h-14 rounded-2xl border px-3 text-base font-black transition active:scale-[0.98] ${
                      selected
                        ? "border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-100"
                        : "border-slate-200 bg-slate-50 text-slate-700"
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
      </form>

      <div className="safe-bottom sticky bottom-[4.75rem] z-30 -mx-4 mt-5 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur-xl md:bottom-0 md:mx-0 md:rounded-3xl md:border md:shadow-xl md:shadow-slate-200">
        <button
          type="button"
          onClick={() => setSaved(true)}
          className="flex min-h-16 w-full items-center justify-center rounded-2xl bg-slate-950 px-6 text-lg font-black text-white transition active:scale-[0.99]"
        >
          {saved ? "Check-In Saved" : "Save Today's Check-In"}
        </button>
      </div>
    </div>
  );
}
