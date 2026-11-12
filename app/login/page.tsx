"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { friendlyErrorMessage, logDevError } from "@/lib/app-errors";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      logDevError("Failed to sign in", error);
      setLoading(false);
      setMessage("We couldn't sign you in. Check your email and password, then try again.");
      return;
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      logDevError("Failed to refresh login session", sessionError);
      setLoading(false);
      setMessage(friendlyErrorMessage("finish signing you in"));
      return;
    }

    if (!session) {
      logDevError("Login succeeded but no Supabase session was returned.", null);
      setLoading(false);
      setMessage("Login succeeded, but your session did not persist. Please try again.");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("primary_goal,onboarding_completed")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profileError) {
      logDevError("Failed to load login profile", profileError);
      setLoading(false);
      setMessage(friendlyErrorMessage("load your profile"));
      return;
    }

    setLoading(false);
    router.push(
      profile?.onboarding_completed && profile.primary_goal?.trim() ? "/today" : "/onboarding",
    );
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-md items-center px-4 py-8">
      <section className="w-full rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-accent-fg">Login</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-3 leading-7 text-fg-2">
          Sign in to save check-ins, log events, and view your AXVital profile.
        </p>

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-fg-2">Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              required
              className="mt-2 min-h-14 w-full rounded-lg border border-line bg-raised px-4 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/30"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-fg-2">Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              required
              className="mt-2 min-h-14 w-full rounded-lg border border-line bg-raised px-4 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/30"
            />
          </label>

          <Link
            href="/forgot-password"
            className="inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-blue-300 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent-fg"
          >
            Forgot password?
          </Link>

          {message ? (
            <p className="rounded-2xl bg-amber-500/10 p-4 text-sm font-semibold text-amber-100">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="flex min-h-14 w-full items-center justify-center rounded-xl bg-accent hover:bg-accent-hover px-6 text-base font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-600"
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>

        <Link
          href="/signup"
          className="mt-3 flex min-h-14 items-center justify-center rounded-xl border border-line bg-raised px-6 text-base font-semibold text-fg"
        >
          Create account
        </Link>
      </section>
    </div>
  );
}
