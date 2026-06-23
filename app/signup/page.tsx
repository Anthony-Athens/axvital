import Link from "next/link";

export default function SignupPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-md items-center px-4 py-8">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
          Signup
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">
          Create your baseline
        </h1>
        <p className="mt-3 leading-7 text-slate-600">
          Account creation is a future backend feature. For now, jump straight
          into the MVP interface.
        </p>
        <Link
          href="/checkin"
          className="mt-6 flex min-h-14 items-center justify-center rounded-2xl bg-slate-950 px-6 text-base font-black text-white"
        >
          Try the Check-In
        </Link>
      </section>
    </div>
  );
}
