"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { friendlyErrorMessage, logDevError } from "@/lib/app-errors";
import { createClient } from "@/lib/supabase/browser";
import type { Profile } from "@/lib/types";

const goals = [
  "Energy",
  "Weight loss",
  "Muscle gain",
  "Sleep",
  "Mood",
  "Stress",
  "Symptoms",
  "Athletic performance",
  "General wellness",
];

const months = [
  ["", "Month"],
  ["1", "January"],
  ["2", "February"],
  ["3", "March"],
  ["4", "April"],
  ["5", "May"],
  ["6", "June"],
  ["7", "July"],
  ["8", "August"],
  ["9", "September"],
  ["10", "October"],
  ["11", "November"],
  ["12", "December"],
];

function optionalNumber(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profileId, setProfileId] = useState("");
  const [primaryGoal, setPrimaryGoal] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [currentWeight, setCurrentWeight] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [typicalSleepHours, setTypicalSleepHours] = useState("");
  const [healthFocusNote, setHealthFocusNote] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        logDevError("Failed to load onboarding user", userError);
        setMessage(friendlyErrorMessage("start onboarding"));
        setLoading(false);
        return;
      }

      if (!user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id,primary_goal,birth_month,birth_year,current_weight,goal_weight,typical_sleep_hours,health_focus_note,onboarding_completed",
        )
        .eq("id", user.id)
        .maybeSingle();

      if (!active) {
        return;
      }

      if (error) {
        logDevError("Failed to load onboarding profile", error);
        setMessage(friendlyErrorMessage("load your onboarding profile"));
        setLoading(false);
        return;
      }

      const loadedProfile = data as Pick<
        Profile,
        | "id"
        | "primary_goal"
        | "birth_month"
        | "birth_year"
        | "current_weight"
        | "goal_weight"
        | "typical_sleep_hours"
        | "health_focus_note"
        | "onboarding_completed"
      > | null;

      if (!loadedProfile) {
        setMessage("Your profile is still being prepared. Please try again in a moment.");
        setLoading(false);
        return;
      }

      if (loadedProfile.onboarding_completed && loadedProfile.primary_goal?.trim()) {
        router.push("/today");
        return;
      }

      setProfileId(loadedProfile.id);
      setPrimaryGoal(loadedProfile.primary_goal ?? "");
      setBirthMonth(loadedProfile.birth_month ? String(loadedProfile.birth_month) : "");
      setBirthYear(loadedProfile.birth_year ? String(loadedProfile.birth_year) : "");
      setCurrentWeight(loadedProfile.current_weight ? String(loadedProfile.current_weight) : "");
      setGoalWeight(loadedProfile.goal_weight ? String(loadedProfile.goal_weight) : "");
      setTypicalSleepHours(
        loadedProfile.typical_sleep_hours ? String(loadedProfile.typical_sleep_hours) : "",
      );
      setHealthFocusNote(loadedProfile.health_focus_note ?? "");
      setLoading(false);
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!primaryGoal) {
      setMessage("Choose a primary focus to continue.");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("profiles")
      .update({
        primary_goal: primaryGoal,
        birth_month: optionalNumber(birthMonth),
        birth_year: optionalNumber(birthYear),
        current_weight: optionalNumber(currentWeight),
        goal_weight: optionalNumber(goalWeight),
        typical_sleep_hours: optionalNumber(typicalSleepHours),
        health_focus_note: healthFocusNote.trim() || null,
        onboarding_completed: true,
      })
      .eq("id", profileId);

    setSaving(false);

    if (error) {
      logDevError("Failed to save onboarding", error);
      setMessage(friendlyErrorMessage("save your onboarding"));
      return;
    }

    router.push("/today");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-10">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-accent-fg">Onboarding</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
          Tune AXVital to your goal
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-fg-2">
          Pick the outcome you care about most. The rest is optional context for future
          personalization.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-sm md:p-8"
      >
        <fieldset>
          <legend className="text-xl font-semibold tracking-tight">
            What are you focused on improving?
          </legend>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {goals.map((goal) => {
              const selected = primaryGoal === goal;
              return (
                <button
                  key={goal}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPrimaryGoal(goal)}
                  className={`min-h-14 rounded-xl border px-4 text-left text-base font-semibold transition active:scale-[0.98] ${
                    selected
                      ? "border-accent bg-accent hover:bg-accent-hover text-white shadow-md shadow-black/30"
                      : "border-line bg-raised text-fg"
                  }`}
                >
                  {goal}
                </button>
              );
            })}
          </div>
        </fieldset>

        <section className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-fg-2">Birth month</span>
              <select
                value={birthMonth}
                onChange={(event) => setBirthMonth(event.target.value)}
                className="mt-2 min-h-14 w-full rounded-lg border border-line bg-raised px-4 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/30"
              >
                {months.map(([value, label]) => (
                  <option key={label} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-fg-2">Birth year</span>
              <input
                value={birthYear}
                onChange={(event) => setBirthYear(event.target.value)}
                inputMode="numeric"
                placeholder="1988"
                className="mt-2 min-h-14 w-full rounded-lg border border-line bg-raised px-4 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/30"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-semibold text-fg-2">Current weight</span>
              <input
                value={currentWeight}
                onChange={(event) => setCurrentWeight(event.target.value)}
                inputMode="decimal"
                placeholder="182"
                className="mt-2 min-h-14 w-full rounded-lg border border-line bg-raised px-4 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/30"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-fg-2">Goal weight</span>
              <input
                value={goalWeight}
                onChange={(event) => setGoalWeight(event.target.value)}
                inputMode="decimal"
                placeholder="175"
                className="mt-2 min-h-14 w-full rounded-lg border border-line bg-raised px-4 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/30"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-fg-2">Typical sleep hours</span>
              <input
                value={typicalSleepHours}
                onChange={(event) => setTypicalSleepHours(event.target.value)}
                inputMode="decimal"
                placeholder="7.5"
                className="mt-2 min-h-14 w-full rounded-lg border border-line bg-raised px-4 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/30"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-fg-2">Main health focus note</span>
            <textarea
              value={healthFocusNote}
              onChange={(event) => setHealthFocusNote(event.target.value)}
              rows={4}
              placeholder="What would make the biggest difference for you?"
              className="mt-2 w-full rounded-lg border border-line bg-raised px-4 py-3 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/30"
            />
          </label>
        </section>

        {message ? (
          <p className="mt-5 rounded-2xl bg-amber-500/10 p-4 text-sm font-semibold text-amber-100">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading || saving || !profileId}
          className="mt-5 flex min-h-14 w-full items-center justify-center rounded-xl bg-accent hover:bg-accent-hover px-6 text-base font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-600"
        >
          {saving ? "Saving..." : loading ? "Loading..." : "Finish Onboarding"}
        </button>
      </form>
    </div>
  );
}
