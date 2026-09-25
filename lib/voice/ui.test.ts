import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { MessageChannel } from "node:worker_threads";

const code = (await build({ stdin: { contents: `import {act,useState} from 'react'; import {createRoot} from 'react-dom/client';
import {VoiceLogDialog} from './components/checkin/VoiceLogDialog'; export {act}; let root;
function App(){const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Open voice</button>{open&&<VoiceLogDialog onClose={()=>setOpen(false)} onSaved={()=>{window.saved++;setOpen(false)}}/>}</>}
export function mount(){root=createRoot(document.getElementById('root'));root.render(<App/>)}export function unmount(){root.unmount()}`,
  resolveDir: process.cwd(), loader: "tsx" }, jsx: "automatic", bundle: true, write: false, format: "iife", globalName: "Harness", platform: "browser",
  define: { "process.env.NODE_ENV": '"test"', "process.env": "{}" },
  plugins: [{ name: "voice-fixture", setup(b) {
    const mocks: Record<string, string> = {
      "@/lib/supabase/client": `export const supabase={auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null}),onAuthStateChange:callback=>{window.authChanged=callback;return {data:{subscription:{unsubscribe(){}}}}}},rpc:async(table,{rows})=>{window.writes.push({table,rows});return {error:window.saveFail?{message:'private database error'}:null}},from:table=>({insert:async rows=>{window.writes.push({table,rows});return {error:window.saveFail?{message:'private database error'}:null}}})};`,
      "@/lib/telemetry/client": "export const trackProduct=(...args)=>window.analytics.push(args);",
    };
    b.onResolve({ filter: /^@\// }, args => mocks[args.path] ? { path: args.path, namespace: "mock" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path] }));
  } }],
})).outputFiles[0].text;

async function fixture() {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://example.test", pretendToBeVisual: true, runScripts: "outside-only" });
  const channels: MessageChannel[] = [];
  class TestChannel extends MessageChannel { constructor() { super(); channels.push(this); } }
  const writes: { table: string; rows: Record<string, unknown>[] }[] = [], analytics: unknown[][] = [];
  const w = dom.window, doc = w.document;
  Object.assign(w, { MessageChannel: TestChannel, AbortController, IS_REACT_ACT_ENVIRONMENT: true, writes, analytics, saved: 0, saveFail: false, isSecureContext: true, denied: false, pendingPermission: false, micCalls: 0, stops: 0, scrollTo: () => {} });
  w.eval(`window.stream={getTracks:()=>[{stop(){window.stops++},onended:null}]};
    Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{window.micCalls++;if(window.denied)throw new DOMException('denied','NotAllowedError');if(window.pendingPermission)return new Promise(resolve=>window.releaseMic=()=>resolve(window.stream));return window.stream;}}});
    window.MediaRecorder=class {static isTypeSupported(type){return type==='audio/webm;codecs=opus'}
    constructor(){this.mimeType='audio/webm';this.state='inactive'}start(){this.state='recording'}
    stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['test audio'])});this.onstop?.()})}};`);
  let resolveFetch: ((response: Response) => void) | undefined;
  let uploads = 0;
  w.fetch = (async (_url: string, init: RequestInit) => {
    uploads++;
    assert.equal(init.method, "POST"); assert.ok(init.signal);
    assert.equal((init.body as FormData).get("timeZone") !== null, true);
    return new Promise<Response>(resolve => { resolveFetch = resolve; });
  }) as typeof fetch;
  const h = w.eval(code + ";Harness;") as { act: (fn: () => unknown) => Promise<void>; mount: () => void; unmount: () => void };
  const settle = () => h.act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  const click = async (text: string) => {
    const button = [...doc.querySelectorAll("button")].find(button => button.textContent === text || button.getAttribute("aria-label") === text);
    assert.ok(button, text); await h.act(async () => button.click()); await settle();
  };
  const field = async (label: string, value: string) => {
    const node = [...doc.querySelectorAll("label")].find(node => node.textContent?.startsWith(label)); assert.ok(node, label);
    const input = node.querySelector("input,textarea") as HTMLInputElement; assert.ok(input, label);
    await h.act(async () => {
      const proto = input.tagName === "TEXTAREA" ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
      input.dispatchEvent(new w.Event("input", { bubbles: true }));
    });
  };
  await h.act(async () => h.mount()); await click("Open voice");
  return { dom, w, doc, h, writes, analytics, click, field, settle, uploads: () => uploads,
    resolve: async (body: unknown, status = 200) => { await h.act(async () => resolveFetch?.(Response.json(body, { status }))); await settle(); },
    close: async () => { await h.act(async () => h.unmount()); dom.window.close(); channels.forEach(channel => { channel.port1.close(); channel.port2.close(); }); },
  };
}
const candidates = [
  { event: { event_type: "supplement", title: "creatine", dose_amount: 5, dose_unit: "grams", event_date: "2026-09-23", event_time: "08:00:00", tags: [] }, source_fragment: "5 grams of creatine", time_note: "Please check the time.", requires_review: true },
  { event: { event_type: "food", title: "eggs", event_date: "2026-09-23", event_time: "08:00:00", tags: [] }, source_fragment: "eggs", time_note: "Please check the time.", requires_review: true },
];
test("voice UI requests permission only on start, recovers from permission/parse failure, reviews/edits/removes, and saves only on confirmation", async () => {
  const t = await fixture();
  try {
    assert.equal(t.w.micCalls, 0); assert.equal(t.writes.length, 0);
    Object.assign(t.w, { denied: true }); await t.click("Start recording"); assert.match(t.doc.body.textContent!, /permission was denied/);
    Object.assign(t.w, { denied: false }); await t.click("Record again"); assert.match(t.doc.body.textContent!, /microphone is on/);
    await t.click("Stop recording"); assert.match(t.doc.body.textContent!, /Transcribing/); assert.ok(t.w.stops > 0); assert.equal(t.writes.length, 0);
    await t.resolve({ error: "NO_SPEECH" }, 422); assert.match(t.doc.body.textContent!, /No speech was detected/);
    await t.click("Record again"); await t.click("Stop recording"); await t.resolve({ candidates });
    assert.equal(t.doc.querySelectorAll("article").length, 2); assert.equal(t.writes.length, 0);
    await t.field("Name", "Reviewed creatine"); await t.field("Dose (optional)", "3"); await t.field("Time", "09:30:00");
    await t.field("Notes", "After training"); await t.field("Tags", "morning, custom");
    await t.click("Remove event 2");
    Object.assign(t.w, { saveFail: true }); await t.click("Confirm and save events");
    assert.equal(t.doc.querySelectorAll("article").length, 1); assert.match(t.doc.body.textContent!, /previous save may have succeeded/);
    const save = [...t.doc.querySelectorAll("button")].find(button => button.textContent === "Confirm and save events")!;
    assert.equal(save.disabled, true); assert.equal(t.writes.length, 1);
    assert.equal(t.writes[0].table, "health_events"); const row = t.writes[0].rows[0];
    assert.equal(row.input_method, "voice"); assert.equal(row.user_id, "owner"); assert.equal(row.title, "Reviewed creatine");
    assert.equal(row.dose, "3 grams"); assert.equal(row.event_time, "09:30:00"); assert.equal(row.event_date, "2026-09-23");
    assert.equal(row.notes, "After training"); assert.equal(JSON.stringify(row.tags), '["morning","custom"]'); assert.equal(t.writes[0].rows.length, 1);
    Object.assign(t.w, { saveFail: false });
    await t.h.act(async () => (t.doc.querySelector('[type="checkbox"]') as HTMLInputElement).click());
    await t.click("Confirm and save events"); assert.equal(t.w.saved, 1); assert.equal(t.doc.querySelector('[role="dialog"]'), null);
    assert.ok(t.analytics.some(([event]) => event === "Voice Log Confirmed"));
    assert.ok(t.analytics.every(args => args.length === 1));
  } finally { await t.close(); }
});

test("food review exclusions retain provenance through uncertain save and explicit retry", async () => {
  const t = await fixture();
  const food = { label: "Pizza", food_id: "00000000-0000-4000-8000-000000000001", canonical_name: "Pizza", method: "exact", confirmed: false, categories: [], components: [{ food_id: "00000000-0000-4000-8000-000000000002", label: "Cheese", source: "library", confidence: null, included: true, confirmed: false, categories: [{ id: "dairy", name: "Dairy", slug: "dairy" }] }] };
  try {
    await t.click("Start recording"); await t.click("Stop recording");
    await t.resolve({ candidates: [{ ...candidates[1], event: { ...candidates[1].event, title: "Pizza", food } }, candidates[0]] });
    assert.equal(t.doc.querySelectorAll("article").length, 2); assert.match(t.doc.body.textContent!, /Typical library component/);
    await t.h.act(async () => (t.doc.querySelector('article input[type="checkbox"]') as HTMLInputElement).click());
    assert.match(t.doc.body.textContent!, /Cheese \(excluded\)/);
    Object.assign(t.w, { saveFail: true }); await t.click("Confirm and save events");
    assert.equal(t.writes.length, 1); assert.equal(t.writes[0].table, "ingest_health_events_with_food");
    const savedFood = t.writes[0].rows[0].food as { components: { source: string; included: boolean; confirmed: boolean }[] };
    assert.equal(savedFood.components[0].source, "library"); assert.equal(savedFood.components[0].included, false); assert.equal(savedFood.components[0].confirmed, true);
    assert.equal((t.writes[0].rows[0].event as { input_method: string }).input_method, "voice");
    assert.equal(t.writes[0].rows.length, 2); assert.equal(t.writes[0].rows[1].food, null);
    const retry = [...t.doc.querySelectorAll("label")].find(label => label.textContent?.includes("I checked the timeline"))!.querySelector("input")!;
    await t.h.act(async () => retry.click()); Object.assign(t.w, { saveFail: false }); await t.click("Confirm and save events");
    assert.equal(t.w.saved, 1); assert.equal(t.writes.length, 2); assert.equal(JSON.stringify(t.writes[1]), JSON.stringify(t.writes[0]));
    assert.ok(t.analytics.every(args => args.length === 1)); assert.doesNotMatch(JSON.stringify(t.analytics), /Pizza|Cheese|Dairy/);
  } finally { await t.close(); }
});

test("editing a food label clears stale canonical components before saving", async () => {
  const t = await fixture();
  try {
    await t.click("Start recording"); await t.click("Stop recording");
    await t.resolve({ candidates: [candidates[1]] });
    await t.field("Name", "Family stew"); await t.click("Confirm and save events");
    assert.equal(t.w.saved, 1);
    assert.equal(t.writes[0].table, "ingest_health_events_with_food");
    const food = t.writes[0].rows[0].food as { food_id: string | null; label: string; method: string; components: unknown[] };
    assert.equal(food.label, "Family stew"); assert.equal(food.food_id, null); assert.equal(food.method, "provisional"); assert.equal(food.components.length, 0);
  } finally { await t.close(); }
});
test("cancel during permission/recording/processing cleans up and ignores late responses", async () => {
  const t = await fixture();
  try {
    Object.assign(t.w, { pendingPermission: true }); await t.click("Start recording");
    assert.match(t.doc.body.textContent!, /Waiting for microphone permission/);
    await t.click("Cancel"); await t.h.act(async () => t.w.releaseMic()); await t.settle(); assert.ok(t.w.stops > 0);
    Object.assign(t.w, { pendingPermission: false }); await t.click("Open voice"); await t.click("Start recording");
    const before = t.w.stops; await t.click("Cancel"); assert.ok(t.w.stops > before); assert.equal(t.uploads(), 0);
    await t.click("Open voice"); await t.click("Start recording"); await t.click("Stop recording"); await t.click("Cancel");
    await t.resolve({ candidates }); assert.equal(t.doc.querySelector('[role="dialog"]'), null); assert.equal(t.writes.length, 0);
    assert.equal(t.doc.body.style.position, "");
  } finally { await t.close(); }
});
test("unsupported recording, background interruption and changed sign-in fail closed", async () => {
  const t = await fixture();
  try {
    Object.assign(t.w, { isSecureContext: false }); await t.click("Start recording"); assert.match(t.doc.body.textContent!, /unavailable in this browser/);
    Object.assign(t.w, { isSecureContext: true }); await t.click("Record again");
    await t.h.act(async () => t.w.dispatchEvent(new t.w.Event("pagehide"))); assert.match(t.doc.body.textContent!, /page became unavailable/); assert.ok(t.w.stops > 0);
    await t.click("Record again"); await t.click("Stop recording"); await t.resolve({ candidates });
    await t.h.act(async () => t.w.authChanged("SIGNED_OUT", null)); assert.equal(t.doc.querySelector('[role="dialog"]'), null);
    assert.equal(t.writes.length, 0);
  } finally { await t.close(); }
});
