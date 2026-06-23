import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-md items-center px-4 py-8">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
          Login
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">
          Welcome back
        </h1>
        <p className="mt-3 leading-7 text-slate-600">
          Authentication is not implemented in this MVP. Continue into the
          prototype experience.
        </p>
        <div className="mt-6 space-y-3">
          <Link
            href="/dashboard"
            className="flex min-h-14 items-center justify-center rounded-2xl bg-emerald-500 px-6 text-base font-black text-white"
          >
            Continue to Dashboard
          </Link>
          <Link
            href="/checkin"
            className="flex min-h-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-6 text-base font-black text-slate-900"
          >
            Start Check-In
          </Link>
        </div>
      </section>
    </div>
  );
}
