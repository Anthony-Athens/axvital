import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "AXVital | Track, learn, and test what works",
  description: "Track the health information that matters to you, learn from patterns in your history, and test deliberate changes with personal experiments.",
};

const steps = [
  ["Track", "Record the health information relevant to your goals."],
  ["Learn", "See trends, changes, and relationships across your history."],
  ["Experiment", "Test a deliberate change against your own data."],
  ["Apply", "Decide what appears worth continuing or changing."],
];
const experimentProcess = ["Choose what you want to improve", "Select one deliberate change", "Track the outcome that matters", "Compare what happened", "Use the result to inform your next decision"];
const questions = ["Does an earlier bedtime improve my morning energy?", "Does hitting my protein target improve my recovery?", "Does creatine improve my strength performance?", "Does avoiding afternoon caffeine improve my sleep?", "Does a new routine change the frequency of a symptom I track?"];
const experience = [
  ["Today", "Complete your daily check-in, follow planned routines or workouts, and quickly log what happens.", "Check in · Follow your plan · Log as you go"],
  ["Track", "Choose the health domains that matter to you, from nutrition and workouts to symptoms, habits, and routines.", "Nutrition · Workouts · Symptoms · Habits"],
  ["Learn", "See what is changing, identify useful patterns, review your week, and understand your progress.", "Trends · Patterns · Weekly review · Progress"],
];
const useCases = [
  ["Lose weight", "weight, nutrition, activity, and sleep", "which routines appear alongside steady progress", "one sustainable change at a time"],
  ["Build strength", "training, protein, sleep, and recovery", "what accompanies your better sessions", "a change to training or recovery"],
  ["Sleep better", "sleep, caffeine, exercise, and energy", "which patterns appear alongside better nights", "a deliberate change, such as an earlier caffeine cutoff"],
  ["Manage symptoms", "symptoms alongside routines and health context", "when frequency or intensity appears to change", "a routine change while monitoring the outcome"],
  ["Understand my health", "relevant health information in one history", "how different parts of your health move together", "the questions that matter to you"],
];

export default function Home() {
  return <>
    <section className="relative isolate overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_20%,rgba(37,99,235,0.28),transparent_34%),linear-gradient(to_bottom,transparent,rgba(15,23,42,0.7))]" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:min-h-[720px] lg:grid-cols-[1.08fr_0.92fr] lg:px-8">
        <div className="max-w-3xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-blue-300">Personal health intelligence</p>
          <h1 className="text-5xl font-semibold leading-[0.96] tracking-[-0.055em] sm:text-6xl lg:text-8xl">Your health.<br />Your data.<br /><span className="text-blue-400">Your answers.</span></h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">Bring your daily health information together, understand patterns in your history, and deliberately test the changes that matter to you.</p>
          <p className="mt-7 max-w-2xl text-base font-semibold leading-7 sm:text-lg"><span className="text-blue-300">Track what matters</span><span className="mx-2 text-slate-600">→</span><span className="text-blue-300">Learn what affects you</span><span className="mx-2 text-slate-600">→</span><span className="text-blue-300">Test what works</span></p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link href="/signup" className="flex min-h-14 items-center justify-center rounded-xl bg-blue-600 px-7 font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">Get Started</Link><a href="#how-it-works" className="flex min-h-14 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 px-7 font-semibold transition hover:border-slate-500 hover:bg-slate-900">See How It Works</a></div>
        </div>
        <div className="relative mx-auto w-full max-w-xl lg:mx-0">
          <div className="absolute -inset-8 -z-10 rounded-full bg-blue-600/10 blur-3xl" />
          <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-black/40"><div className="rounded-[1.25rem] bg-slate-50 p-5 text-slate-950 sm:p-6">
            <div className="border-b border-slate-200 pb-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Today</p><p className="mt-1 text-2xl font-semibold tracking-tight">Your day at a glance</p></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">{[["Sleep", "7h 42m"], ["Energy", "8 / 10"], ["Protein", "142g"]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}</div>
            <div className="mt-4 rounded-xl bg-slate-950 p-4 text-white"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">Pattern worth testing</p><p className="mt-2 text-sm leading-6 text-slate-200">Your higher-energy mornings have recently followed more consistent sleep. Would an earlier bedtime make a difference?</p></div>
          </div></div>
        </div>
      </div>
    </section>

    <section id="how-it-works" className="bg-white px-4 py-16 sm:px-6 lg:py-24"><div className="mx-auto max-w-7xl">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">How AXVital works</p><h2 className="mt-4 max-w-xl text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl">Turn daily tracking into useful personal questions.</h2></div><p className="max-w-2xl text-lg leading-8 text-slate-600 lg:justify-self-end">Tracking creates the history. Learning surfaces patterns. Experiments help you test a deliberate change and decide what appears worth keeping.</p></div>
      <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">{steps.map(([title, body], index) => <li key={title} className="bg-white p-6"><p className="text-sm font-semibold text-blue-700">0{index + 1}</p><h3 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{body}</p></li>)}</ol>
    </div></section>

    <section id="experiments" className="relative overflow-hidden bg-slate-950 px-4 py-16 text-white sm:px-6 lg:py-24"><div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-blue-600/15 blur-3xl" /><div className="relative mx-auto max-w-7xl">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">Experiments</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Health advice tells you what might work. Test what appears to work for you.</h2><p className="mt-6 text-lg leading-8 text-slate-300">You bring the question. AXVital helps structure the test—without requiring you to be a statistician.</p><p className="mt-7 text-2xl font-semibold text-blue-300">Does this appear to work for me?</p><ol className="mt-7 space-y-3">{experimentProcess.map((step, index) => <li key={step} className="flex gap-3 text-sm leading-6 text-slate-300"><span className="font-semibold text-blue-300">{index + 1}.</span>{step}</li>)}</ol><p className="mt-7 text-sm leading-6 text-slate-400">Results can inform your personal decisions without proving universal cause and effect.</p></div>
      <div className="space-y-3 lg:pt-2">{questions.map((question, index) => <div key={question} className="flex gap-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-5"><span className="text-sm font-semibold text-blue-300">0{index + 1}</span><p className="font-medium leading-7 text-slate-100">{question}</p></div>)}</div></div>
      <div className="mt-12 flex flex-col items-center justify-between gap-5 rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center sm:flex-row sm:text-left"><div><p className="text-xl font-semibold">Ready to test a question of your own?</p><p className="mt-1 text-sm text-slate-400">Start with the health information that matters to you.</p></div><div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row"><Link href="/signup" className="flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-6 font-semibold transition hover:bg-blue-500">Get Started</Link><a href="#product-experience" className="flex min-h-12 items-center justify-center rounded-xl border border-slate-600 px-6 font-semibold transition hover:bg-slate-800">See the Product</a></div></div>
    </div></section>

    <section id="product-experience" className="bg-slate-50 px-4 py-16 sm:px-6 lg:py-24"><div className="mx-auto max-w-7xl"><div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">How you use AXVital</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Build the context behind better questions.</h2><p className="mt-5 text-lg leading-8 text-slate-600">Your goals and health context help AXVital organize what you track, what you learn from, and what you may want to test.</p></div><div className="mt-10 grid gap-4 lg:grid-cols-3">{experience.map(([title, body, detail], index) => <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-sm font-semibold text-blue-700">0{index + 1}</p><h3 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h3><p className="mt-3 leading-7 text-slate-600">{body}</p><p className="mt-6 border-t border-slate-100 pt-4 text-sm font-medium text-slate-500">{detail}</p></article>)}</div></div></section>

    <section className="bg-white px-4 py-16 sm:px-6 lg:py-24"><div className="mx-auto max-w-7xl"><div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">Built around your goal</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">See the whole path, not another isolated metric.</h2></div><div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{useCases.map(([title, track, learn, test], index) => <article key={title} className={`rounded-2xl border p-6 ${index === useCases.length - 1 ? "border-blue-200 bg-blue-50 lg:col-span-2" : "border-slate-200 bg-white"}`}><h3 className="text-xl font-semibold">{title}</h3><div className="mt-5 space-y-3 text-sm leading-6 text-slate-600"><p><strong className="text-slate-900">Track:</strong> Track {track}.</p><p><strong className="text-slate-900">Learn:</strong> Learn {learn}.</p><p><strong className="text-slate-900">Test:</strong> Test {test}.</p></div></article>)}</div><div className="mt-8 rounded-2xl bg-blue-700 px-6 py-7 text-white sm:px-8"><p className="text-xl font-semibold">A spreadsheet can store your data. AXVital helps connect it, interpret it, and test what you learn.</p></div></div></section>

    <section className="bg-slate-50 px-4 py-16 sm:px-6 lg:py-20"><div className="mx-auto grid max-w-7xl gap-8 rounded-3xl border border-slate-200 bg-white p-7 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center lg:p-12"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">Privacy & trust</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Clear controls for personal health information.</h2><p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">AXVital provides account-level access controls, data export, account deletion, and public information about how personal data is handled.</p></div><div className="flex flex-col gap-3 sm:flex-row lg:flex-col"><Link href="/privacy" className="flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-6 font-semibold text-white">Privacy</Link><Link href="/terms" className="flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 font-semibold text-slate-900">Terms</Link></div></div></section>

    <section className="bg-slate-950 px-4 py-16 text-center text-white sm:px-6 lg:py-24"><div className="mx-auto max-w-4xl"><h2 className="text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">Start learning from your health.</h2><p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-300">Track what matters. Learn what affects you. Test what works.</p><Link href="/signup" className="mt-8 inline-flex min-h-14 items-center justify-center rounded-xl bg-blue-600 px-8 font-semibold transition hover:bg-blue-500">Get Started</Link></div></section>
    <Footer />
  </>;
}
