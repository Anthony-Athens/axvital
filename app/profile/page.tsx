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

const integrations = ["Garmin", "WHOOP", "Strava", "Apple Health"];

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
