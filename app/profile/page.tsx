"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type TrackingMode = "simple" | "advanced";
type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  preferred_name: string | null;
  primary_goal: string | null;
  tracking_mode: TrackingMode | null;
};
type DemoHealthEvent = {
  user_id: string;
  event_date: string;
  event_time: string;
  event_type: "food" | "supplement" | "exercise" | "symptom" | "note";
  title: string;
  description: string | null;
  notes: string;
  tags: string[];
  supplement_name?: string;
  dose_amount?: number;
  dose_unit?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  exercise_type?: string;
  duration_minutes?: number;
  intensity?: string;
  severity?: number;
};

const integrations = ["Garmin", "WHOOP", "Strava", "Apple Health"];
const isDevelopment = process.env.NODE_ENV === "development";

const sleepOptions = ["Poor", "Average", "Good", "Great"];
const exerciseOptions = ["None", "Light", "Moderate", "Intense"];
const nutritionOptions = ["Poor", "Average", "Good", "Excellent"];
const stressOptions = ["Low", "Medium", "High"];

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDateString(date);
}

function boundedScore(value: number) {
  return Math.max(1, Math.min(10, Math.round(value)));
}

function pick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function demoDailyCheckins(userId: string) {
  const startingWeight = 184 + Math.random() * 6;

  return Array.from({ length: 30 }, (_, index) => {
    const date = daysAgo(29 - index);
    const sleep_quality = pick(sleepOptions);
    const exercise_level = index % 4 === 0 ? "None" : pick(exerciseOptions.slice(1));
    const stress_level = index % 7 === 1 ? "High" : pick(stressOptions);
    const nutrition_quality =
      index % 6 === 0 ? "Excellent" : pick(nutritionOptions.slice(1));
    const alcohol = index % 8 === 5;
    const goodSleepBoost = sleep_quality === "Good" || sleep_quality === "Great" ? 1 : -1;
    const exerciseBoost = exercise_level === "None" ? -0.5 : 0.8;
    const stressDrag = stress_level === "High" ? -1.3 : stress_level === "Medium" ? -0.5 : 0.4;
    const alcoholDrag = alcohol ? -1 : 0;

    return {
      user_id: userId,
      checkin_date: date,
      energy_score: boundedScore(6 + goodSleepBoost + exerciseBoost + stressDrag + alcoholDrag + Math.random() * 1.5),
      mood_score: boundedScore(6 + stressDrag + goodSleepBoost + Math.random() * 1.8),
      sleep_quality,
      exercise_level,
      nutrition_quality,
      stress_level,
      alcohol,
      weight: Number((startingWeight - index * 0.08 + Math.random() * 0.8).toFixed(1)),
      notes: "Demo daily check-in for development testing.",
      tags: ["demo"],
    };
  });
}

function demoHealthEvents(userId: string) {
  return Array.from({ length: 30 }).flatMap((_, index) => {
    const date = daysAgo(29 - index);
    const events: DemoHealthEvent[] = [
      {
        user_id: userId,
        event_date: date,
        event_time: "08:00",
        event_type: "supplement",
        title: "Creatine",
        description: null,
        supplement_name: "Creatine",
        dose_amount: 5,
        dose_unit: "g",
        notes: "Demo supplement event.",
        tags: ["demo", "supplement"],
      },
      {
        user_id: userId,
        event_date: date,
        event_time: "12:30",
        event_type: "food",
        title: index % 3 === 0 ? "Chicken bowl" : "Eggs and avocado",
        description: index % 3 === 0 ? "Chicken bowl" : "Eggs and avocado",
        calories: index % 3 === 0 ? 720 : 540,
        protein_g: index % 3 === 0 ? 48 : 30,
        carbs_g: index % 3 === 0 ? 68 : 18,
        fat_g: index % 3 === 0 ? 24 : 36,
        notes: "Demo food event.",
        tags: ["demo", "food"],
      },
    ];

    if (index % 2 === 0) {
      events.push({
        user_id: userId,
        event_date: date,
        event_time: "17:30",
        event_type: "exercise",
        title: pick(["Run", "Strength Training", "Walk"]),
        description: null,
        exercise_type: pick(["Run", "Strength Training", "Walk"]),
        duration_minutes: pick([25, 35, 45]),
        intensity: pick(["Light", "Moderate", "Intense"]),
        notes: "Demo exercise event.",
        tags: ["demo", "exercise"],
      });
    }

    if (index % 9 === 4) {
      events.push({
        user_id: userId,
        event_date: date,
        event_time: "21:15",
        event_type: "symptom",
        title: "Mild headache",
        description: "Mild headache",
        severity: 3,
        notes: "Demo symptom event.",
        tags: ["demo", "symptom"],
      });
    }

    if (index % 5 === 2) {
      events.push({
        user_id: userId,
        event_date: date,
        event_time: "20:45",
        event_type: "note",
        title: "Long workday",
        description: null,
        notes: "Demo note event.",
        tags: ["demo", "note"],
      });
    }

    return events;
  });
}

export default function ProfilePage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [primaryGoal, setPrimaryGoal] = useState("");
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("simple");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [demoWorking, setDemoWorking] = useState(false);
  const [demoMessage, setDemoMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,full_name,preferred_name,primary_goal,tracking_mode")
        .eq("id", user.id)
        .single();

      if (!active) {
        return;
      }

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const loadedProfile = data as Profile;
      setProfile(loadedProfile);
      setFullName(loadedProfile.full_name ?? "");
      setPreferredName(loadedProfile.preferred_name ?? "");
      setPrimaryGoal(loadedProfile.primary_goal ?? "");
      setTrackingMode(loadedProfile.tracking_mode ?? "simple");
      setLoading(false);
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [supabase]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profile) {
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        preferred_name: preferredName || null,
        primary_goal: primaryGoal || null,
        tracking_mode: trackingMode,
      })
      .eq("id", profile.id);

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Profile saved.");
  }

  async function getCurrentUserId() {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      console.error("Failed to load user for demo data", error);
      throw new Error(error.message);
    }

    if (!user) {
      throw new Error("Please log in before managing demo data.");
    }

    return user.id;
  }

  async function deleteDemoDataForUser(userId: string) {
    const { error: eventError } = await supabase
      .from("health_events")
      .delete()
      .eq("user_id", userId)
      .contains("tags", ["demo"]);

    if (eventError) {
      console.error("Failed to delete demo health events", eventError);
      throw new Error(eventError.message);
    }

    const { error: checkinError } = await supabase
      .from("daily_checkins")
      .delete()
      .eq("user_id", userId)
      .contains("tags", ["demo"]);

    if (checkinError) {
      console.error("Failed to delete demo daily check-ins", checkinError);
      throw new Error(checkinError.message);
    }
  }

  async function generateDemoData() {
    setDemoWorking(true);
    setDemoMessage("");

    try {
      const userId = await getCurrentUserId();
      await deleteDemoDataForUser(userId);

      const checkins = demoDailyCheckins(userId);
      const events = demoHealthEvents(userId);

      const { error: checkinError } = await supabase
        .from("daily_checkins")
        .upsert(checkins, { onConflict: "user_id,checkin_date" });

      if (checkinError) {
        console.error("Failed to generate demo daily check-ins", checkinError);
        throw new Error(checkinError.message);
      }

      const { error: eventError } = await supabase
        .from("health_events")
        .insert(events);

      if (eventError) {
        console.error("Failed to generate demo health events", eventError);
        throw new Error(eventError.message);
      }

      setDemoMessage("Demo data generated for the last 30 days.");
    } catch (error) {
      setDemoMessage(error instanceof Error ? error.message : "Demo data failed.");
    } finally {
      setDemoWorking(false);
    }
  }

  async function deleteDemoData() {
    setDemoWorking(true);
    setDemoMessage("");

    try {
      const userId = await getCurrentUserId();
      await deleteDemoDataForUser(userId);
      setDemoMessage("Demo data deleted.");
    } catch (error) {
      setDemoMessage(error instanceof Error ? error.message : "Demo delete failed.");
    } finally {
      setDemoWorking(false);
    }
  }

  const displayName = preferredName || fullName || "AXVital member";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-10">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 place-items-center rounded-3xl bg-emerald-500 text-2xl font-black text-white">
            {initials || "AX"}
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
              Profile
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">
              {loading ? "Loading..." : displayName}
            </h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {profile?.email ?? ""}
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-black text-slate-700">Full name</span>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="mt-2 min-h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />
          </label>
          <label className="block">
            <span className="text-sm font-black text-slate-700">
              Preferred name
            </span>
            <input
              value={preferredName}
              onChange={(event) => setPreferredName(event.target.value)}
              className="mt-2 min-h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />
          </label>
          <label className="block">
            <span className="text-sm font-black text-slate-700">
              Primary goal
            </span>
            <input
              value={primaryGoal}
              onChange={(event) => setPrimaryGoal(event.target.value)}
              className="mt-2 min-h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />
          </label>
          <label className="block">
            <span className="text-sm font-black text-slate-700">
              Tracking mode
            </span>
            <select
              value={trackingMode}
              onChange={(event) =>
                setTrackingMode(event.target.value as TrackingMode)
              }
              className="mt-2 min-h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            >
              <option value="simple">Simple</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>

          {message ? (
            <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-black text-emerald-700">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading || saving || !profile}
            className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-slate-950 px-6 text-base font-black text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </form>
      </section>

      {isDevelopment ? (
        <section className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm md:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-700">
            Development Only
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight">
            Demo data tools
          </h2>
          <p className="mt-2 leading-7 text-amber-900">
            Generate or remove tagged development/test data for Dashboard and
            Insights testing. This section is hidden in production.
          </p>

          {demoMessage ? (
            <p className="mt-4 rounded-2xl bg-white p-4 text-sm font-black text-amber-900">
              {demoMessage}
            </p>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={generateDemoData}
              disabled={demoWorking}
              className="flex min-h-14 items-center justify-center rounded-2xl bg-slate-950 px-6 text-base font-black text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {demoWorking ? "Working..." : "Generate Demo Data"}
            </button>
            <button
              type="button"
              onClick={deleteDemoData}
              disabled={demoWorking}
              className="flex min-h-14 items-center justify-center rounded-2xl border border-amber-300 bg-white px-6 text-base font-black text-amber-900 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Delete Demo Data
            </button>
          </div>
        </section>
      ) : null}

      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
        <h2 className="text-2xl font-black">Future integrations</h2>
        <p className="mt-2 leading-7 text-slate-600">
          Connect wearables and health platforms when backend functionality is
          added.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {integrations.map((name) => (
            <div
              key={name}
              className="flex min-h-16 items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4"
            >
              <span className="text-lg font-black">{name}</span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500">
                Coming soon
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
