import Link from "next/link";
import { Footer } from "@/components/Footer";

const features = [
  {
    title: "Daily signals",
    body: "Capture energy, sleep, stress, nutrition, exercise, alcohol, and weight in seconds.",
  },
  {
    title: "Pattern discovery",
    body: "Turn lightweight check-ins into clear relationships between habits and outcomes.",
  },
  {
    title: "Personal experiments",
    body: "See what actually changes your health instead of relying on generic advice.",
  },
];

const steps = [
  "Check in once per day",
  "AXVital learns your patterns",
  "Act on simple weekly insights",
];

export default function Home() {
  return (
    <>
      <section className="overflow-hidden bg-white">
        <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl content-center gap-10 px-4 py-10 md:min-h-[680px] md:grid-cols-[1fr_0.88fr] md:items-center md:px-6">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">
              Health intelligence, built around your day
            </div>
            <h1 className="text-5xl font-black leading-[0.98] tracking-tight text-slate-950 sm:text-6xl md:text-7xl">
              Discover Your Health Operating System
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              Track what matters. Discover what works. Improve your health with
              personalized insights.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/today"
                className="flex min-h-14 items-center justify-center rounded-2xl bg-emerald-500 px-6 text-base font-black text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-600"
              >
                Start Daily Check-In
              </Link>
              <Link
                href="/dashboard"
                className="flex min-h-14 items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 text-base font-black text-slate-900 transition hover:bg-slate-50"
              >
                View Dashboard
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-4 shadow-2xl shadow-slate-200 md:p-5">
            <div className="rounded-[1.5rem] bg-slate-100 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                    Today
                  </p>
                  <p className="text-2xl font-black text-slate-950">
                    Check-in ready
                  </p>
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500 text-lg font-black text-white">
                  87
                </div>
              </div>
              <div className="space-y-3">
                {["Energy", "Sleep", "Stress"].map((label, index) => (
                  <div
                    key={label}
                    className="rounded-2xl bg-white p-4 shadow-sm shadow-slate-200"
                  >
                    <div className="mb-3 flex items-center justify-between text-sm font-bold">
                      <span>{label}</span>
                      <span className="text-emerald-600">
                        {[8, "Great", "Low"][index]}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${[80, 92, 68][index]}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="px-4 py-14 md:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">
            Features
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h3 className="text-xl font-black">{feature.title}</h3>
                <p className="mt-3 leading-7 text-slate-600">{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-14 md:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">
            How It Works
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <div
                key={step}
                className="rounded-3xl border border-slate-200 bg-slate-50 p-6"
              >
                <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-lg font-black text-white">
                  {index + 1}
                </div>
                <p className="text-xl font-black">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 md:px-6">
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">
              Pricing
            </p>
            <h2 className="mt-3 text-3xl font-black">Free MVP access</h2>
            <p className="mt-3 leading-7 text-slate-600">
              Track daily health inputs and view sample intelligence while the
              platform grows into connected wearable and lab integrations.
            </p>
          </div>
          <div className="rounded-3xl bg-slate-950 p-6 text-white">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
              Call To Action
            </p>
            <h2 className="mt-3 text-3xl font-black">
              Build your baseline today.
            </h2>
            <Link
              href="/today"
              className="mt-6 flex min-h-14 items-center justify-center rounded-2xl bg-emerald-500 px-6 text-base font-black text-white"
            >
              Complete Check-In
            </Link>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
