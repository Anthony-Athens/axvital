export const SCORING_VERSION = "mental-mathletics-percent-qpm-v1";
export const GENERATOR_VERSION = "axvital-arithmetic-v1";
export const operations = { mixed: "Mixed", "+": "Addition", "-": "Subtraction", "*": "Multiplication", "/": "Division" } as const;
export const difficulties = { easy: { cap: 20, factor: 5 }, standard: { cap: 99, factor: 12 }, hard: { cap: 999, factor: 25 } } as const;
export const options = { time: [2, 5, 10], count: [20, 50, 100] } as const;
export type Config = { mode: "time" | "count"; value: number; operation: keyof typeof operations; difficulty: keyof typeof difficulties };
export type Question = { a: number; b: number; operator: Exclude<Config["operation"], "mixed"> };
export type Answer = Question & { answer: number; atMs: number };
export type Completion = { id: string; config: Config; startedAt: string; elapsedMs: number; answers: Answer[]; scoringVersion: string; generatorVersion: string };
export type Session = Completion & { endedAt: string; answered: number; correct: number; accuracy: number; qpm: number; score: number };

export function validateConfig(value: unknown): Config {
  if (!value || typeof value !== "object") throw new Error("Invalid configuration");
  const c = value as Config;
  if (!(c.mode === "time" || c.mode === "count") || !(options[c.mode] as readonly number[]).includes(c.value) || !Object.hasOwn(operations, c.operation) || !Object.hasOwn(difficulties, c.difficulty)) throw new Error("Invalid configuration");
  return { mode: c.mode, value: c.value, operation: c.operation, difficulty: c.difficulty };
}
export function expected(q: Question): number {
  switch (q.operator) { case "+": return q.a + q.b; case "-": return q.a - q.b; case "*": return q.a * q.b; case "/": return q.a / q.b; }
}
export function generateQuestion(c: Config, random = Math.random): Question {
  const { cap, factor } = difficulties[c.difficulty];
  const int = (max: number, min = 0) => min + Math.floor(random() * (max - min + 1));
  const operator = c.operation === "mixed" ? (["+", "-", "*", "/"] as const)[int(3)] : c.operation;
  if (operator === "+") { const a = int(cap); return { a, b: int(cap - a), operator }; }
  if (operator === "-") { const result = int(cap), b = int(cap - result); return { a: result + b, b, operator }; }
  if (operator === "*") { const a = int(factor); return { a, b: int(a === 0 ? cap : Math.floor(cap / a)), operator }; }
  const b = int(factor, 1); return { a: b * int(Math.floor(cap / b)), b, operator };
}
export function validQuestion(q: Question, c: Config): boolean {
  const { cap, factor } = difficulties[c.difficulty];
  if (!Number.isSafeInteger(q.a) || !Number.isSafeInteger(q.b) || q.a < 0 || q.b < 0 || q.a > cap || q.b > cap || !["+", "-", "*", "/"].includes(q.operator) || (c.operation !== "mixed" && q.operator !== c.operation)) return false;
  const result = expected(q);
  return Number.isSafeInteger(result) && result >= 0 && result <= cap && (q.operator !== "*" || q.a <= factor) && (q.operator !== "/" || (q.b > 0 && q.b <= factor));
}
export function stats(answered: number, correct: number, elapsedMs: number) {
  if (!Number.isSafeInteger(answered) || !Number.isSafeInteger(correct) || correct < 0 || correct > answered || answered < 0 || !Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error("Invalid metrics");
  const accuracy = answered ? correct / answered * 100 : 0;
  const qpm = elapsedMs > 0 ? answered * 60000 / elapsedMs : 0;
  // Verified original formula uses the percentage, not the fraction.
  return { answered, correct, accuracy, qpm, score: accuracy * qpm };
}
export function validateCompletion(input: Completion): Session {
  const config = validateConfig(input.config);
  const start = Date.parse(input.startedAt);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id) || !Number.isFinite(start) || input.scoringVersion !== SCORING_VERSION || input.generatorVersion !== GENERATOR_VERSION || !Number.isSafeInteger(input.elapsedMs) || input.elapsedMs < 1 || input.elapsedMs > 86400000 || !Array.isArray(input.answers) || input.answers.length > 10000) throw new Error("Invalid session");
  if (config.mode === "time" ? input.elapsedMs !== config.value * 60000 : input.answers.length !== config.value) throw new Error("Incomplete session");
  let previous = 0;
  for (const a of input.answers) {
    if (!validQuestion(a, config) || !Number.isSafeInteger(a.answer) || Math.abs(a.answer) > 1000000 || !Number.isSafeInteger(a.atMs) || a.atMs < previous || a.atMs > input.elapsedMs || (config.mode === "time" && a.atMs >= input.elapsedMs)) throw new Error("Invalid answer");
    previous = a.atMs;
  }
  if (config.mode === "count" && previous !== input.elapsedMs) throw new Error("Invalid end time");
  return { ...input, config, endedAt: new Date(start + input.elapsedMs).toISOString(), ...stats(input.answers.length, input.answers.filter(a => a.answer === expected(a)).length, input.elapsedMs) };
}
export function configurationLabel(c: Config) { return `${c.mode === "time" ? `${c.value} min` : `${c.value} questions`} · ${operations[c.operation]} · ${c.difficulty}`; }
export function comparisonKey(s: Pick<Session, "config" | "scoringVersion" | "generatorVersion">) { const c = s.config; return [c.mode, c.value, c.operation, c.difficulty, s.scoringVersion, s.generatorVersion].join(":"); }
export function comparisonGroups(sessions: Session[]) {
  const groups = new Map<string, Session[]>();
  for (const s of sessions) { const key = comparisonKey(s); groups.set(key, [...(groups.get(key) ?? []), s]); }
  return [...groups.entries()].map(([key, rows]) => {
    rows.sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
    const recent = rows.slice(0, 5), previous = rows.slice(5, 10);
    const avg = (r: Session[]) => r.reduce((sum, s) => sum + s.score, 0) / r.length;
    return { key, rows, best: Math.max(...rows.map(s => s.score)), trend: rows.length < 10 ? null : avg(recent) - avg(previous) };
  });
}

/** Owns the deadline and question identity; UI callbacks cannot answer an old question twice. */
export class TestRun {
  readonly config: Config;
  readonly id: string;
  readonly startedAt: string;
  readonly start: number;
  question: Question;
  token = 0;
  answers: Answer[] = [];
  finished: Completion | null = null;
  abandoned = false;
  private lastElapsed = 0;
  private readonly random: () => number;
  constructor(config: Config, id: string, now: number, random = Math.random) {
    this.random = random; this.config = validateConfig(config); this.id = id; this.start = now; this.startedAt = new Date(now).toISOString(); this.question = generateQuestion(config, random);
  }
  elapsed(now: number) { this.lastElapsed = Math.max(this.lastElapsed, Math.round(now - this.start), 0); return this.lastElapsed; }
  tick(now: number) {
    if (!this.abandoned && !this.finished && this.config.mode === "time" && this.elapsed(now) >= this.config.value * 60000) this.finish(this.config.value * 60000);
    return this.finished;
  }
  submit(raw: string, token: number, now: number) {
    this.tick(now);
    if (this.abandoned || this.finished || token !== this.token || !/^-?\d+$/.test(raw.trim())) return false;
    const answer = Number(raw), atMs = Math.max(1, this.elapsed(now));
    if (!Number.isSafeInteger(answer) || Math.abs(answer) > 1000000) return false;
    this.answers.push({ ...this.question, answer, atMs }); this.token++;
    if (this.config.mode === "count" && this.answers.length === this.config.value) this.finish(Math.max(1, atMs));
    else this.question = generateQuestion(this.config, this.random);
    return true;
  }
  abandon() { if (!this.finished) this.abandoned = true; }
  private finish(elapsedMs: number) { this.finished = { id: this.id, config: this.config, startedAt: this.startedAt, elapsedMs, answers: this.answers.map(a => ({ ...a })), scoringVersion: SCORING_VERSION, generatorVersion: GENERATOR_VERSION }; }
}
