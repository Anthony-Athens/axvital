"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { logDevError } from "@/lib/app-errors";
import { createClient } from "@/lib/supabase/browser";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [primaryGoal, setPrimaryGoal] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          preferred_name: preferredName || null,
          primary_goal: primaryGoal || null,
        },
      },
    });

    if (error) {
      logDevError("Failed to sign up", error);
      setLoading(false);
      setMessage("We couldn't create your account right now. Please try again.");
      return;
    }

    setLoading(false);
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-md items-center px-4 py-8">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
          Sign Up
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">
          Create your baseline
        </h1>
        <p className="mt-3 leading-7 text-slate-600">
          Start with simple tracking and add more detail when it helps.
        </p>

        <form onSubmit={handleSignup} className="mt-6 space-y-4">
          {[
            ["Email", email, setEmail, "email", "email", true],
            ["Password", password, setPassword, "password", "new-password", true],
            ["Full name", fullName, setFullName, "text", "name", true],
            [
              "Preferred name",
              preferredName,
              setPreferredName,
              "text",
              "given-name",
              false,
            ],
            ["Primary goal", primaryGoal, setPrimaryGoal, "text", "off", false],
          ].map(([label, value, setter, type, autocomplete, required]) => (
            <label key={label as string} className="block">
              <span className="text-sm font-black text-slate-700">
                {label as string}
              </span>
              <input
                value={value as string}
                onChange={(event) =>
                  (setter as (next: string) => void)(event.target.value)
                }
                type={type as string}
                autoComplete={autocomplete as string}
                required={required as boolean}
                className="mt-2 min-h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </label>
          ))}

          {message ? (
            <p className="rounded-2xl bg-amber-50 p-4 text-sm font-black text-amber-900">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-slate-950 px-6 text-base font-black text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <Link
          href="/login"
          className="mt-3 flex min-h-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-6 text-base font-black text-slate-900"
        >
          Already have an account?
        </Link>
      </section>
    </div>
  );
}
