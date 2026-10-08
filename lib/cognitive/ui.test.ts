import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { MessageChannel } from "node:worker_threads";

const code = (await build({ stdin: { contents: `import {act} from 'react';import {createRoot} from 'react-dom/client';import {CognitiveSession,CognitiveHome,CognitiveHistory} from './components/cognitive/CognitiveTraining';export {act};let root;export function mount(view,config){root=createRoot(document.getElementById('root'));root.render(view==='session'?<CognitiveSession config={config}/>:view==='home'?<CognitiveHome/>:<CognitiveHistory/>)}export function unmount(){root.unmount()}`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, jsx: "automatic", platform: "browser", format: "iife", globalName: "Harness", define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "boundaries", setup(b) {
  b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "mock" }));
  b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "mock" }));
  b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: "client", namespace: "mock" }));
  b.onLoad({ filter: /.*/, namespace: "mock" }, a => ({ loader: "tsx", resolveDir: process.cwd(), contents: a.path === "router" ? `const router={push:url=>window.destination=url};export const useRouter=()=>router;` : a.path === "link" ? `export default function Link({children,...props}){return <a {...props}>{children}</a>}` : `export const supabase=window.client;` }));
} }] })).outputFiles[0].text;

function harness() {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/cognitive-training", pretendToBeVisual: true, runScripts: "outside-only" });
  const w = dom.window, d = w.document;
  const channels: MessageChannel[] = []; class Channel extends MessageChannel { constructor() { super(); channels.push(this); } }
  let now = Date.parse("2026-10-01T12:00:00.000Z"), fail = true, writes = 0;
  const payloads: Record<string, unknown>[] = [], filters: [string, unknown][] = [];
  let timer: (() => void) | undefined;
  w.setInterval = ((callback: () => void) => { timer = callback; return 1; }) as typeof w.setInterval;
  w.clearInterval = () => {};
  w.Date.now = () => now;
  Object.assign(w, { MessageChannel: Channel, IS_REACT_ACT_ENVIRONMENT: true, client: {
    auth: { getUser: async () => ({ data: { user: { id: "owner" } }, error: null }) },
    rpc: (_name: string, { p_session }: { p_session: Record<string, unknown> }) => ({ abortSignal: async () => { writes++; payloads.push(p_session); return fail ? { error: { message: "failure" }, data: null } : { error: null, data: p_session.id }; } }),
    from: () => { const q = { select: () => q, eq: (key: string, value: unknown) => { filters.push([key, value]); return q; }, order: () => q, range: () => q, abortSignal: () => q, then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }) }; return q; },
  } });
  const h = w.eval(code + ";Harness;") as { act: (fn: () => unknown) => Promise<void>; mount: (view: string, config?: unknown) => void; unmount: () => void };
  const change = async (element: Element, value: string) => h.act(() => { const prototype = element.tagName === "SELECT" ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value); element.dispatchEvent(new w.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  const click = async (text: string) => { const button = [...d.querySelectorAll("button")].find(b => b.textContent === text); assert.ok(button, text); await h.act(() => button.click()); };
  return { w, d, h, change, click, filters, payloads, advance: (ms: number) => { now += ms; }, tick: () => timer?.(), succeed: () => { fail = false; }, writes: () => writes, close: async () => { await h.act(() => h.unmount()); dom.window.close(); for (const c of channels) { c.port1.close(); c.port2.close(); } } };
}

test("native count UI focuses the numeric answer, rejects blanks, prevents duplicate submits, saves with retry and reviews answers", async () => {
  const x = harness();
  try {
    await x.h.act(() => x.h.mount("session", { mode: "count", value: 20, difficulty: "standard", operation: "+" }));
    assert.equal(x.d.activeElement?.id, "cognitive-answer");
    assert.equal(x.d.querySelector("input")!.getAttribute("inputmode"), "numeric");
    const submit = () => x.d.querySelector("form")!.dispatchEvent(new x.w.Event("submit", { bubbles: true, cancelable: true }));
    await x.h.act(submit); assert.match(x.d.body.textContent!, /Answered 0 of 20/);
    await x.change(x.d.querySelector("input")!, "2.5"); await x.h.act(submit); assert.match(x.d.body.textContent!, /Answered 0 of 20/);
    for (let i = 0; i < 20; i++) {
      const question = [...x.d.querySelectorAll("p")].find(p => /^\d+ \+ \d+$/.test(p.textContent!))!.textContent!;
      const [a, b] = question.split(" + ").map(Number);
      await x.change(x.d.querySelector("input")!, String(a + b)); x.advance(1000);
      await x.h.act(() => { submit(); submit(); });
      if (i < 19) assert.match(x.d.body.textContent!, new RegExp(`Answered ${i + 1} of 20`));
    }
    assert.match(x.d.body.textContent!, /Test results/);
    assert.match(x.d.body.textContent!, /20 \/ 20/);
    assert.equal(x.d.querySelectorAll('ol[aria-label="Answered questions"] li').length, 20);
    assert.equal(x.writes(), 1);
    assert.match(x.d.body.textContent!, /has not been saved/);
    x.succeed(); await x.click("Retry saving");
    assert.equal(x.writes(), 2); assert.equal(x.payloads[0].id, x.payloads[1].id);
    assert.match(x.d.body.textContent!, /Result saved/);
    assert.equal(x.d.querySelectorAll("input").length, 0);
    await x.click("Repeat configuration");
    assert.match(x.d.body.textContent!, /Answered 0 of 20/);
    assert.equal(x.d.activeElement?.id, "cognitive-answer");
    assert.equal(x.writes(), 2);
  } finally { await x.close(); }
});
test("timed UI expires on tab return without a timer tick, and explicit exit never saves an abandoned test", async () => {
  for (const abandon of [false, true]) {
    const x = harness();
    try {
      await x.h.act(() => x.h.mount("session", { mode: "time", value: 2, difficulty: "easy", operation: "/" }));
      if (abandon) { await x.click("Exit test"); assert.match(x.d.body.textContent!, /clock is still running/); await x.click("Discard and exit"); x.advance(180000); await x.h.act(x.tick); assert.equal(x.writes(), 0); }
      else { x.advance(180000); await x.h.act(() => x.d.dispatchEvent(new x.w.Event("visibilitychange"))); assert.match(x.d.body.textContent!, /0 \/ 0/); assert.match(x.d.body.textContent!, /120.00 s/); assert.equal(x.writes(), 1); await x.h.act(x.tick); assert.equal(x.writes(), 1); }
    } finally { await x.close(); }
  }
});
test("home launches verified settings; history filters every query by current owner and selected configuration", async () => {
  const home = harness();
  try { await home.h.act(() => home.h.mount("home")); await home.click("Start test"); assert.equal((home.w as unknown as { destination: string }).destination, "/cognitive-training/session?mode=time&value=2&operation=mixed&difficulty=standard"); assert.match(home.d.body.textContent!, /No completed results/); } finally { await home.close(); }
  const x = harness();
  try {
    await x.h.act(() => x.h.mount("history"));
    const selects = x.d.querySelectorAll("select");
    await x.change(selects[0], "count"); await x.change(selects[1], "hard"); await x.change(selects[2], "*");
    assert.ok(x.filters.some(([key, value]) => key === "user_id" && value === "owner"));
    for (const [key, value] of [["mode", "count"], ["difficulty", "hard"], ["operation", "*"]]) assert.ok(x.filters.some(([k, v]) => k === `config->>${key}` && v === value));
    assert.match(x.d.body.textContent!, /Population percentiles require/);
  } finally { await x.close(); }
});
