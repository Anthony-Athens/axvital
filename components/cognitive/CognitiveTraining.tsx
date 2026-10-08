"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink, controlClass, EmptyState, InlineNotice, LoadingSkeleton, PageContainer, PageHeader, Surface } from "@/components/ui/design-system";
import { supabase } from "@/lib/supabase/client";
import { comparisonGroups, configurationLabel, difficulties, expected, operations, options, TestRun, validateCompletion, type Config, type Session } from "@/lib/cognitive/model";
import { getSession, listSessions, saveSession, type Filters } from "@/lib/cognitive/persistence";

const defaultConfig: Config = { mode: "time", value: 2, operation: "mixed", difficulty: "standard" };
const noFilters: Filters = { mode: "", difficulty: "", operation: "" };
const number = (n: number) => n.toFixed(2);
export function sessionHref(c: Config) { return `/cognitive-training/session?${new URLSearchParams({ mode: c.mode, value: String(c.value), operation: c.operation, difficulty: c.difficulty })}`; }

export function CognitiveHome() {
  const router = useRouter();
  const [config, setConfig] = useState(defaultConfig);
  return <PageContainer className="pb-28">
    <PageHeader eyebrow="Track · Mental Mathletics" title="Cognitive Training" description="Practice mental arithmetic and track your personal accuracy, pace, and performance over time." actions={<ButtonLink href="/cognitive-training/history" variant="secondary">Performance history</ButtonLink>}/>
    <Surface className="mt-6">
      <h2 className="text-xl font-semibold">Configure your test</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Test mode<select className={`${controlClass} mt-1`} value={config.mode} onChange={e => { const mode = e.target.value as Config["mode"]; setConfig({ ...config, mode, value: options[mode][0] }); }}><option value="time">Timed test</option><option value="count">Question-count test</option></select></label>
        <label className="text-sm font-medium">{config.mode === "time" ? "Duration" : "Question goal"}<select className={`${controlClass} mt-1`} value={config.value} onChange={e => setConfig({ ...config, value: Number(e.target.value) })}>{options[config.mode].map(n => <option key={n} value={n}>{n} {config.mode === "time" ? "minutes" : "questions"}</option>)}</select></label>
        <label className="text-sm font-medium">Operation<select className={`${controlClass} mt-1`} value={config.operation} onChange={e => setConfig({ ...config, operation: e.target.value as Config["operation"] })}>{Object.entries(operations).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-sm font-medium">Difficulty<select className={`${controlClass} mt-1`} value={config.difficulty} onChange={e => setConfig({ ...config, difficulty: e.target.value as Config["difficulty"] })}>{Object.entries(difficulties).map(([value, range]) => <option key={value} value={value}>{value === "standard" ? "Standard (original)" : value === "easy" ? "Easy" : "Hard"} · up to {range.cap}</option>)}</select></label>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">Answers are nonnegative whole numbers, up to {difficulties[config.difficulty].cap}. Multiplication’s first factor and division’s divisor are up to {difficulties[config.difficulty].factor}; other operands can be larger. Standard preserves the original question rules.</p>
      <p className="mt-2 text-sm text-slate-600">The clock starts with the first question and continues if you switch tabs. Exiting discards an unfinished test.</p>
      <Button className="mt-5 w-full sm:w-auto" onClick={() => router.push(sessionHref(config))}>Start test</Button>
    </Surface>
    <div className="mt-6"><HistoryList recent/></div>
  </PageContainer>;
}

export function ResultSummary({ result, onRepeat, repeatDisabled = false }: { result: Session; onRepeat?: () => void; repeatDisabled?: boolean }) {
  return <>
    <Surface className="mt-5">
      <p className="text-sm text-slate-600">{configurationLabel(result.config)}</p>
      <h2 className="mt-2 text-xl font-semibold">Performance score: {number(result.score)}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[ ["Correct / answered", `${result.correct} / ${result.answered}`], ["Accuracy", `${number(result.accuracy)}%`], ["Elapsed time", `${number(result.elapsedMs / 1000)} s`], ["Questions per minute", number(result.qpm)] ].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-1 text-lg font-semibold">{value}</dd></div>)}
      </dl>
      <p className="mt-4 text-xs leading-5 text-slate-500">Score = accuracy percentage × questions per minute, preserving Mental Mathletics scoring. Version: {result.scoringVersion}. This is personal arithmetic performance tracking.</p>
    </Surface>
    <Surface className="mt-4">
      <h2 className="text-lg font-semibold">Answer review</h2>
      {result.answers.length ? <ol className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto" aria-label="Answered questions">{result.answers.map((a, i) => <li key={i} className="rounded-lg bg-slate-50 p-3 text-sm"><span className="font-semibold">{i + 1}. {a.a} {a.operator === "*" ? "×" : a.operator === "/" ? "÷" : a.operator} {a.b} = {expected(a)}</span><p className="mt-1 text-slate-600">Your answer: {a.answer} · {a.answer === expected(a) ? "Correct" : "Incorrect"} · {number((a.atMs - (result.answers[i - 1]?.atMs ?? 0)) / 1000)} s</p></li>)}</ol> : <p className="mt-2 text-sm text-slate-600">No answers were submitted.</p>}
    </Surface>
    <div className="mt-5 flex flex-wrap gap-2">{onRepeat ? <Button disabled={repeatDisabled} onClick={onRepeat}>Repeat configuration</Button> : <ButtonLink href={sessionHref(result.config)}>Repeat configuration</ButtonLink>}<ButtonLink href="/cognitive-training" variant="secondary">Cognitive Training</ButtonLink><ButtonLink href="/cognitive-training/history" variant="tertiary">History</ButtonLink></div>
  </>;
}

export function CognitiveSession({ config }: { config: Config | null }) {
  const [attempt, setAttempt] = useState(0);
  return <CognitiveAttempt key={`${JSON.stringify(config)}:${attempt}`} config={config} onRepeat={() => setAttempt(n => n + 1)}/>;
}

function CognitiveAttempt({ config, onRepeat }: { config: Config | null; onRepeat: () => void }) {
  const router = useRouter();
  const run = useRef<TestRun | null>(null);
  const clockOrigin = useRef({ wall: 0, monotonic: 0 });
  const input = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const finished = useRef(false);
  const [view, setView] = useState<{ question: TestRun["question"]; token: number; answered: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Session | null>(null);
  const [saveState, setSaveState] = useState<"unsaved" | "saving" | "saved">("unsaved");
  const [error, setError] = useState("");
  const [exit, setExit] = useState(false);
  const save = useCallback(async (r: Session) => {
    if (saving.current) return;
    saving.current = true; setSaveState("saving"); setError("");
    try { await saveSession(supabase, r); setSaveState("saved"); window.dispatchEvent(new Event("axvital:timeline-refresh")); }
    catch (e) { setSaveState("unsaved"); setError(e instanceof Error ? e.message : "Unable to save. Please retry."); }
    finally { saving.current = false; }
  }, []);
  const finalize = useCallback(() => {
    if (!run.current?.finished || finished.current) return;
    finished.current = true;
    const r = validateCompletion(run.current.finished);
    setResult(r); setExit(false); void save(r);
  }, [save]);
  useLayoutEffect(() => {
    if (!config) return;
    // Publish the generated question in the same layout pass that starts the clock.
    clockOrigin.current = { wall: Date.now(), monotonic: performance.now() };
    const r = new TestRun(config, crypto.randomUUID(), clockOrigin.current.wall); run.current = r;
    setView({ question: r.question, token: r.token, answered: 0 });
    return () => { r.abandon(); };
  }, [config]);
  useEffect(() => {
    if (!view || result || exit) return;
    input.current?.focus();
  }, [view, result, exit]);
  useEffect(() => {
    if (!config) return;
    const update = () => { const r = run.current; if (!r || r.abandoned || r.finished) return; const now = clockNow(); setElapsed(r.elapsed(now)); r.tick(now); finalize(); };
    const timer = window.setInterval(update, 100);
    document.addEventListener("visibilitychange", update); window.addEventListener("focus", update);
    const unload = (e: BeforeUnloadEvent) => { if (run.current && !run.current.abandoned && !finished.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", unload);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", update); window.removeEventListener("focus", update); window.removeEventListener("beforeunload", unload); };
  }, [config, finalize]);
  function clockNow() { return Math.max(Date.now(), clockOrigin.current.wall + performance.now() - clockOrigin.current.monotonic); }
  function submit(e: FormEvent) {
    e.preventDefault();
    const r = run.current; if (!r || !view) return;
    const accepted = r.submit(answer, view.token, clockNow());
    finalize();
    if (!accepted && !r.finished) { setError("Enter a whole-number answer."); input.current?.focus(); }
    if (accepted) { setAnswer(""); setError(""); if (!r.finished) setView({ question: r.question, token: r.token, answered: r.answers.length }); }
  }
  if (!config) return <PageContainer narrow><InlineNotice>Invalid test configuration.</InlineNotice><ButtonLink href="/cognitive-training">Return to Cognitive Training</ButtonLink></PageContainer>;
  if (result) return <PageContainer narrow className="pb-28"><PageHeader title="Test results" eyebrow="Cognitive Training"/>
    <div className="mt-4" aria-live="polite">{saveState === "saved" ? <InlineNotice tone="success">Result saved. <Link className="underline" href={`/cognitive-training/results/${result.id}`}>Open saved result</Link></InlineNotice> : saveState === "saving" ? <InlineNotice tone="info">Saving result…</InlineNotice> : <InlineNotice tone="info">Result has not been saved. Keep this page open until saving succeeds.</InlineNotice>}</div>
    {error ? <div className="mt-3"><InlineNotice>{error}</InlineNotice></div> : null}
    {saveState === "unsaved" ? <Button className="mt-3" onClick={() => void save(result)}>Retry saving</Button> : null}
    <ResultSummary result={result} onRepeat={onRepeat} repeatDisabled={saveState !== "saved"}/>
  </PageContainer>;
  return <PageContainer narrow className="pb-28"><PageHeader title="Arithmetic test" eyebrow="Cognitive Training" description={configurationLabel(config)}/>
    {!view ? <LoadingSkeleton className="mt-5 h-60"/> : <Surface className="mt-5">
      <p className="text-sm font-semibold text-blue-700" role="timer">{config.mode === "time" ? `Time remaining: ${Math.max(0, Math.ceil((config.value * 60000 - elapsed) / 1000))} s` : `Answered ${view.answered} of ${config.value}`}</p>
      <p className="mt-1 text-sm text-slate-600">Elapsed: {(elapsed / 1000).toFixed(1)} s</p>
      <p className="mt-6 text-center text-sm text-slate-500">Question {view.answered + 1}</p>
      <p className="mt-2 break-words text-center text-4xl font-semibold" aria-live="polite">{view.question.a} {view.question.operator === "*" ? "×" : view.question.operator === "/" ? "÷" : view.question.operator} {view.question.b}</p>
      <form onSubmit={submit} className="mt-6">
        <label htmlFor="cognitive-answer" className="text-sm font-semibold">Your answer</label>
        <input ref={input} id="cognitive-answer" className={`${controlClass} mt-2 text-lg`} type="text" inputMode="numeric" autoComplete="off" value={answer} onChange={e => setAnswer(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && e.repeat) e.preventDefault(); }} disabled={exit}/>
        <p className="mt-2 text-sm text-slate-500">Press Enter or use Submit answer.</p>
        <Button type="submit" className="mt-4 w-full" disabled={exit}>Submit answer</Button>
      </form>
      {error ? <div className="mt-3"><InlineNotice>{error}</InlineNotice></div> : null}
      {exit ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="font-semibold">Discard this unfinished test?</p><p className="mt-1 text-sm">It won’t appear in completed results. The clock is still running.</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setExit(false); input.current?.focus(); }}>Continue test</Button><Button variant="destructive" onClick={() => { run.current?.abandon(); router.push("/cognitive-training"); }}>Discard and exit</Button></div></div> : <Button variant="tertiary" className="mt-4" onClick={() => setExit(true)}>Exit test</Button>}
    </Surface>}
  </PageContainer>;
}

export function HistoryList({ recent = false }: { recent?: boolean }) {
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [rows, setRows] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    const current = ++generation.current; let active = true; busy.current = true;
    queueMicrotask(() => { if (active) { setLoading(true); setError(""); setRows([]); setMore(false); } });
    listSessions(supabase, filters, 0, recent ? 5 : 100).then(data => { if (active && generation.current === current) { setRows(data.sessions); setMore(data.more); } }).catch(e => { if (active && generation.current === current) setError(e instanceof Error ? e.message : "Unable to load results."); }).finally(() => { if (active && generation.current === current) { busy.current = false; setLoading(false); } });
    return () => { active = false; };
  }, [filters, recent, reload]);
  async function loadMore() {
    if (busy.current) return;
    const current = generation.current; busy.current = true; setLoading(true); setError("");
    try { const data = await listSessions(supabase, filters, rows.length); if (generation.current === current) { setRows(previous => [...new Map([...previous, ...data.sessions].map(s => [s.id, s])).values()]); setMore(data.more); } }
    catch (e) { if (generation.current === current) setError(e instanceof Error ? e.message : "Unable to load results."); }
    finally { if (generation.current === current) { busy.current = false; setLoading(false); } }
  }
  return <>
    <h2 className="text-xl font-semibold">{recent ? "Recent results" : "Completed results"}</h2>
    {!recent ? <div className="mt-4 grid gap-3 sm:grid-cols-3">{([ ["mode", { time: "Timed", count: "Question count" }], ["difficulty", { easy: "Easy", standard: "Standard", hard: "Hard" }], ["operation", operations] ] as const).map(([key, values]) => <label key={key} className="text-sm font-medium capitalize">{key}<select className={`${controlClass} mt-1`} value={filters[key]} onChange={e => setFilters({ ...filters, [key]: e.target.value })}><option value="">All</option>{Object.entries(values).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}</div> : null}
    {loading ? <LoadingSkeleton className="mt-4 h-24"/> : null}
    {error ? <div className="mt-4"><InlineNotice>{error}</InlineNotice><Button variant="secondary" className="mt-2" onClick={() => rows.length && more ? void loadMore() : setReload(n => n + 1)}>Retry loading</Button></div> : null}
    {!loading && !error && !rows.length ? <div className="mt-4"><EmptyState title="No completed results" description="Complete an arithmetic test, or adjust your filters, to see results here."/></div> : null}
    {!recent && rows.length ? <div className="mt-5"><h3 className="font-semibold">Personal bests and trends</h3><p className="mt-1 text-sm text-slate-600">{more ? "Based on loaded results; load older results to include more history." : "Based on the results matching these filters."} Each comparison uses the same mode, duration or count, operation, difficulty, question rules, and scoring version. Trend compares the latest five scores with the preceding five.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{comparisonGroups(rows).map(g => <Surface key={g.key} compact><h4 className="font-semibold">{configurationLabel(g.rows[0].config)}</h4><p className="mt-1 text-xs text-slate-500">{g.rows[0].scoringVersion} · {g.rows[0].generatorVersion}</p><p className="mt-2 text-sm">Best score: {number(g.best)} · {g.rows.length} tests</p><p className="mt-1 text-sm">{g.trend === null ? "Complete 10 equivalent tests for a trend." : `Trend: ${g.trend > 0 ? "+" : ""}${number(g.trend)} score points`}</p><ol className="mt-3 flex h-16 items-end gap-1" aria-label="Recent score trend, oldest first">{g.rows.slice(0, 10).reverse().map(s => <li key={s.id} className="min-w-0 flex-1 bg-blue-500" style={{ height: `${Math.max(3, s.score / Math.max(1, g.best) * 100)}%` }} title={`${new Date(s.endedAt).toLocaleString()}: ${number(s.score)}`}><span className="sr-only">{new Date(s.endedAt).toLocaleString()}: {number(s.score)}</span></li>)}</ol></Surface>)}</div></div> : null}
    <ol className="mt-4 space-y-3">{rows.map(s => <li key={s.id}><Link href={`/cognitive-training/results/${s.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 outline-none hover:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-600"><p className="font-semibold text-blue-700">{new Date(s.endedAt).toLocaleString()}</p><p className="mt-1 text-sm text-slate-600">{configurationLabel(s.config)}</p><p className="mt-2 text-sm">Score {number(s.score)} · {number(s.accuracy)}% accuracy · {number(s.qpm)} QPM · {s.correct}/{s.answered} correct</p></Link></li>)}</ol>
    {!recent && more ? <Button variant="secondary" className="mt-4" disabled={loading} onClick={() => void loadMore()}>Load older results</Button> : null}
    {!recent ? <p className="mt-5 text-sm leading-6 text-slate-500">Population percentiles require a valid, comparable benchmark dataset. Only your own results are shown here.</p> : null}
  </>;
}

export function CognitiveHistory() { return <PageContainer className="pb-28"><PageHeader title="Cognitive Training history" eyebrow="Learn · Mental Mathletics" description="Review your arithmetic practice and compare equivalent tests." actions={<ButtonLink href="/cognitive-training">Start a test</ButtonLink>}/><div className="mt-6"><HistoryList/></div></PageContainer>; }
export function CognitiveResult({ id }: { id: string }) {
  const [result, setResult] = useState<Session | null>(null), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; getSession(supabase, id).then(r => { if (active) setResult(r); }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Unable to load result."); }); return () => { active = false; }; }, [id, retry]);
  return <PageContainer narrow className="pb-28"><PageHeader title="Test results" eyebrow="Cognitive Training"/>{error ? <div className="mt-4"><InlineNotice>{error}</InlineNotice><Button className="mt-3" onClick={() => { setError(""); setRetry(n => n + 1); }}>Retry</Button><ButtonLink variant="tertiary" href="/cognitive-training/history">History</ButtonLink></div> : result ? <ResultSummary result={result}/> : <LoadingSkeleton className="mt-5 h-60"/>}</PageContainer>;
}

