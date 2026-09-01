import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "AXVital | Your health. Your data. Your answers.",
  description: "Track what matters, understand patterns in your health, and test the changes that may help you feel and perform better.",
};

const signalRows = [
  { label: "Sleep", value: "7h 42m", note: "steady" },
  { label: "Energy", value: "8 / 10", note: "+1.2" },
  { label: "Protein", value: "142g", note: "on target" },
];

const trackItems = ["Nutrition", "Workouts", "Sleep", "Weight", "Symptoms", "Health conditions", "Habits", "Protocols", "Supplements", "Daily health measures"];
const learnItems = [
  { title: "Health Overview", body: "See how you're doing at a glance." },
  { title: "Insights", body: "Explore patterns and relationships across your health data." },
  { title: "Weekly Recap", body: "Understand what changed this week and what may deserve your attention." },
  { title: "Progress", body: "Go deeper into areas like training and condition-specific trends." },
];
const experimentQuestions = [
  "Does an earlier bedtime improve my morning energy?",
  "Does consistently hitting my protein target improve my recovery?",
  "Does creatine improve my strength performance?",
  "Does avoiding afternoon caffeine improve my sleep?",
  "Does a new routine reduce the frequency of a symptom I track?",
];
const useCases = [
  { title: "Lose Weight", body: "Track weight, nutrition, activity, sleep, and habits—then see how your consistency and behaviors relate to your progress." },
  { title: "Build Strength", body: "Connect workouts, body weight, protein, sleep, supplements, and recovery to understand what accompanies your best performance." },
  { title: "Sleep Better", body: "Track sleep alongside caffeine, alcohol, exercise, habits, and daily energy to look for patterns worth testing." },
  { title: "Manage Symptoms", body: "Track symptoms and episodes alongside sleep, activity, nutrition, routines, and other health context to better understand when things change." },
  { title: "Understand My Health", body: "Bring multiple areas of your health together instead of keeping them scattered across notes, spreadsheets, and separate apps." },
];
const loop = [
  ["Today", "Record what happens and follow your plan."],
  ["Track", "Build a useful history around the things that matter to you."],
  ["Learn", "See what is changing and what patterns are emerging."],
  ["Experiment", "Test a deliberate change against your own data."],
  ["Improve", "Keep what appears to help. Change what doesn't."],
];

export default function Home() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_20%,rgba(37,99,235,0.28),transparent_34%),linear-gradient(to_bottom,transparent,rgba(15,23,42,0.7))]" />
        <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-7xl items-center gap-14 px-4 py-20 sm:px-6 lg:min-h-[760px] lg:grid-cols-[1.08fr_0.92fr] lg:px-8">
          <div className="max-w-3xl">
            <p className="mb-6 text-sm font-semibold uppercase tracking-[0.22em] text-blue-300">Personal health intelligence</p>
            <h1 className="text-5xl font-semibold leading-[0.96] tracking-[-0.055em] text-white sm:text-6xl lg:text-8xl">
              Your health.<br />Your data.<br /><span className="text-blue-400">Your answers.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
              Track what matters to you, understand the patterns in your health, and test the changes that may help you feel and perform better.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="flex min-h-14 items-center justify-center rounded-xl bg-blue-600 px-7 text-base font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">Get Started</Link>
              <a href="#how-it-works" className="flex min-h-14 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 px-7 text-base font-semibold text-white transition hover:border-slate-500 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">See How It Works</a>
            </div>
            <p className="mt-8 text-sm font-medium tracking-wide text-slate-400">Nutrition · Workouts · Sleep · Symptoms · Habits · Experiments</p>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:mx-0">
            <div className="absolute -inset-8 -z-10 rounded-full bg-blue-600/10 blur-3xl" />
            <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-black/40 backdrop-blur">
              <div className="rounded-[1.25rem] bg-slate-50 p-5 text-slate-950 sm:p-6">
                <div className="flex items-start justify-between gap-6 border-b border-slate-200 pb-5">
                  <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Today</p><p className="mt-1 text-2xl font-semibold tracking-tight">Your day at a glance</p></div>
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-600 text-lg font-semibold text-white">87</div>
                </div>
                <div className="mt-5 space-y-3">
                  {signalRows.map((signal) => (
                    <div key={signal.label} className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
                      <div><p className="text-sm font-medium text-slate-500">{signal.label}</p><p className="mt-1 text-lg font-semibold">{signal.value}</p></div>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{signal.note}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl bg-slate-950 p-4 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">Emerging pattern</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">Your higher-energy mornings have recently followed more consistent sleep.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-white px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">How AXVital works</p>
              <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-tight tracking-[-0.04em] text-slate-950 sm:text-5xl">Stop tracking health data without knowing what it means.</h2>
            </div>
            <div className="max-w-2xl lg:justify-self-end">
              <p className="text-lg leading-8 text-slate-600">AXVital brings your daily health information together so you can move from simply recording what happened to understanding what may be affecting you.</p>
              <p className="mt-4 font-semibold text-slate-950">Everything starts with your own data.</p>
            </div>
          </div>
          <div className="mt-12 grid overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 sm:grid-cols-2 lg:grid-cols-4">
            {["Track", "Learn", "Experiment", "Improve"].map((step, index) => (
              <div key={step} className="border-b border-slate-200 p-6 last:border-b-0 sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:border-r lg:last:border-r-0">
                <p className="text-sm font-semibold text-blue-700">0{index + 1}</p>
                <p className="mt-8 text-2xl font-semibold tracking-tight text-slate-950">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">Today</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">One place for your day.</h2>
            <p className="mt-6 text-lg leading-8 text-slate-600">See what matters today, complete your health check-in, follow your planned routines, and quickly log what happens as you go.</p>
            <div className="mt-8 border-l-2 border-blue-600 pl-5">
              <p className="text-sm font-medium text-slate-500">Today helps you answer:</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">What do I need to do or track today?</p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-center justify-between border-b border-slate-200 pb-5"><div><p className="text-sm font-medium text-slate-500">Tuesday</p><p className="mt-1 text-2xl font-semibold">Today</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">3 of 6 complete</span></div>
            <div className="mt-2 divide-y divide-slate-100">
              {["Daily health check-in", "Today's workout", "Habits and protocols", "Quick health logging", "Symptoms and episodes", "Daily activity history"].map((item, index) => (
                <div key={item} className="flex items-center gap-4 py-4"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-semibold ${index < 3 ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-500"}`}>{index < 3 ? "✓" : index + 1}</span><span className="font-medium text-slate-800">{item}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">Track</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">Track what matters to you.</h2>
              <p className="mt-6 text-xl font-medium text-slate-900">You don&apos;t need to track everything.</p>
              <p className="mt-3 max-w-xl text-lg leading-8 text-slate-600">AXVital gives you one place to manage the health data relevant to your goals.</p>
              <Link href="/track" className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-6 font-semibold text-white transition hover:bg-slate-800">Explore Tracking</Link>
            </div>
            <div className="flex flex-wrap content-start gap-3 lg:pt-10">
              {trackItems.map((item, index) => <span key={item} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${index % 3 === 0 ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>{item}</span>)}
            </div>
          </div>
          <p className="mt-12 max-w-5xl border-t border-slate-200 pt-8 text-lg leading-8 text-slate-600">Whether you&apos;re trying to lose weight, improve strength, sleep better, manage symptoms, or simply understand your health better, AXVital helps you focus on the information that matters.</p>
        </div>
      </section>

      <section className="bg-blue-50/60 px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">Learn</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">Turn your history into something useful.</h2><p className="mt-6 text-lg leading-8 text-slate-600">Logging data is only the beginning. As your history grows, AXVital helps you see changes, trends, and relationships across the things you&apos;re tracking.</p></div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {learnItems.map((item, index) => <article key={item.title} className="rounded-2xl border border-blue-100 bg-white p-6"><p className="text-sm font-semibold text-blue-700">0{index + 1}</p><h3 className="mt-8 text-2xl font-semibold tracking-tight">{item.title}</h3><p className="mt-3 leading-7 text-slate-600">{item.body}</p></article>)}
          </div>
          <p className="mt-8 max-w-4xl text-sm leading-6 text-slate-500">AXVital identifies patterns and associations in your data without pretending every relationship proves cause and effect.</p>
        </div>
      </section>

      <section className="relative overflow-hidden bg-slate-950 px-4 py-20 text-white sm:px-6 lg:py-28">
        <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-blue-600/15 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.9fr_1.1fr]">
          <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">Experiments</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Don&apos;t just follow health advice. Test it.</h2><p className="mt-6 text-lg leading-8 text-slate-300">There&apos;s no shortage of advice telling you what you should eat, take, change, or do. AXVital helps you ask a better question:</p><p className="mt-8 text-3xl font-semibold text-blue-300">Does it appear to work for me?</p><p className="mt-6 leading-7 text-slate-300">AXVital helps structure the question, track the change, compare the results, and understand how confident you should be in what happened.</p><Link href="/experiments" className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-6 font-semibold text-white transition hover:bg-blue-500">Explore Experiments</Link></div>
          <div className="space-y-3">
            {experimentQuestions.map((question, index) => <div key={question} className="flex gap-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-5"><span className="text-sm font-semibold text-blue-300">0{index + 1}</span><p className="font-medium leading-7 text-slate-100">{question}</p></div>)}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">Me</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">Your health context matters.</h2><p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">AXVital isn&apos;t analyzing anonymous numbers in isolation. Your goals, health conditions, routines, and personal context help organize the data you&apos;re collecting and the questions you&apos;re trying to answer.</p></div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8"><p className="text-sm font-semibold text-slate-500">Manage your context</p><ul className="mt-5 grid gap-3 sm:grid-cols-2">{["Health conditions", "Goals", "Profile", "Preferences", "Account controls", "Privacy controls"].map(item => <li key={item} className="rounded-xl bg-white p-4 font-medium text-slate-800">{item}</li>)}</ul><p className="mt-8 text-sm text-slate-500">Your data stays centered around one person:</p><p className="mt-1 text-4xl font-semibold tracking-tight text-blue-700">You.</p></div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-7xl"><div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">The AXVital loop</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">A health tracker should help you learn something.</h2></div><ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 lg:grid-cols-5">{loop.map(([title, body], index) => <li key={title} className="bg-white p-6"><span className="text-sm font-semibold text-blue-700">{index + 1}</span><h3 className="mt-8 text-2xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{body}</p></li>)}</ol><p className="mt-7 text-lg font-semibold text-slate-900">Then keep learning.</p></div>
      </section>

      <section className="bg-white px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-7xl"><div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">Built around your goal</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">AXVital adapts to what you&apos;re trying to improve.</h2></div><div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{useCases.map((item, index) => <article key={item.title} className={`rounded-2xl border p-6 ${index === useCases.length - 1 ? "border-blue-200 bg-blue-50 lg:col-span-2" : "border-slate-200 bg-white"}`}><h3 className="text-xl font-semibold">{item.title}</h3><p className="mt-3 leading-7 text-slate-600">{item.body}</p></article>)}</div></div>
      </section>

      <section className="bg-blue-700 px-4 py-20 text-white sm:px-6 lg:py-28">
        <div className="mx-auto max-w-5xl text-center"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-200">Beyond storage</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Spreadsheets can store your health data.<span className="mt-2 block text-blue-200">AXVital helps you learn from it.</span></h2><p className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-blue-100">Tracking is the foundation. The real value comes from bringing your information together, looking across your history, identifying potentially meaningful patterns, and helping you test changes intentionally.</p><p className="mx-auto mt-5 max-w-3xl leading-7 text-blue-100">You shouldn&apos;t need to build your own database, dashboards, analysis, and experiment methodology just to better understand yourself.</p></div>
      </section>

      <section className="bg-white px-4 py-20 sm:px-6 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 rounded-3xl border border-slate-200 bg-slate-50 p-7 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center lg:p-12"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">Privacy & trust</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">Personal health data deserves thoughtful handling.</h2><p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">AXVital is designed around user-owned health information, account-level access controls, data export, and account deletion. Your health history should help you—not become someone else&apos;s product.</p></div><div className="flex flex-col gap-3 sm:flex-row lg:flex-col"><Link href="/privacy" className="flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-6 font-semibold text-white">Privacy</Link><Link href="/settings/data" className="flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 font-semibold text-slate-900">Data & Account Controls</Link></div></div>
      </section>

      <section className="bg-slate-950 px-4 py-20 text-center text-white sm:px-6 lg:py-28">
        <div className="mx-auto max-w-4xl"><h2 className="text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">Start learning from your health.</h2><p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-300">You already generate health data every day. AXVital helps you turn it into something useful.</p><Link href="/signup" className="mt-9 inline-flex min-h-14 items-center justify-center rounded-xl bg-blue-600 px-8 text-base font-semibold text-white transition hover:bg-blue-500">Create Your Account</Link><p className="mt-7 text-sm font-medium tracking-wide text-slate-400">Track what matters. Learn what affects you. Test what works.</p></div>
      </section>
      <Footer />
    </>
  );
}
