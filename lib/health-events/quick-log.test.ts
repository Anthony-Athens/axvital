import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { MessageChannel } from "node:worker_threads";

const code = (await build({
  stdin: { contents: `import {act} from 'react'; import {createRoot} from 'react-dom/client';
    import Page from './app/checkin/page'; export {act}; let root;
    export function mount(){root=createRoot(document.getElementById('root'));root.render(<Page/>)}
    export function unmount(){root.unmount()}`, resolveDir: process.cwd(), loader: "tsx" },
  jsx: "automatic", bundle: true, write: false, format: "iife", globalName: "Harness", platform: "browser",
  define: { "process.env.NODE_ENV": '"test"', "process.env": "{}" },
  plugins: [{ name: "quick-log-dependencies", setup(b) {
    const mocks: Record<string, string> = {
      "next/navigation": "export const useRouter=()=>({push:path=>window.routes.push(path)});export const useSearchParams=()=>new URLSearchParams();",
      "@/lib/supabase/client": `export const supabase={auth:{getUser:async()=>({data:{user:window.signedIn?{id:'owner'}:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:table=>({insert:async rows=>{window.writes.push({table,rows});return {error:window.fail?{message:'test failure'}:null}}})};`,
      "@/lib/checkins/persistence": "export const draftFromRecord=()=>({answers:{},weight:''});export const loadCheckin=async()=>({row:null,userId:'owner'});export const saveCheckin=async()=>({});",
      "@/lib/telemetry/activation": "export const reportActivation=event=>window.activations.push(event);",
    };
    for (const [path, name] of [["planner/TodayPlan", "TodayPlan"], ["episodes/ActiveEpisodes", "ActiveEpisodes"], ["checkin/GettingStarted", "GettingStarted"], ["timeline/Timeline", "Timeline"]]) mocks[`@/components/${path}`] = `export const ${name}=()=>null;`;
    b.onResolve({ filter: /^(next\/navigation|@\/)/ }, args => mocks[args.path] ? { path: args.path, namespace: "mock" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path] }));
  } }],
})).outputFiles[0].text;

test("Quick Log preserves payload, failed draft, success/reset, tags, timeline refresh and domain routes", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true, runScripts: "outside-only" });
  const channels: MessageChannel[] = [];
  class TestChannel extends MessageChannel { constructor() { super(); channels.push(this); } }
  const writes: { table: string; rows: Record<string, unknown>[] }[] = [], activations: string[] = [], routes: string[] = [];
  const w = dom.window, doc = w.document;
  Object.assign(w, { MessageChannel: TestChannel, IS_REACT_ACT_ENVIRONMENT: true, signedIn: true, fail: true, writes, activations, routes, scrollTo: () => {} });
  w.localStorage.setItem("axvital.today.optionalEvents.expanded", "true");
  let refreshes = 0;
  w.addEventListener("axvital:timeline-refresh", () => refreshes++);
  const h = w.eval(code + ";Harness;") as { act: (fn: () => unknown) => Promise<void>; mount: () => void; unmount: () => void };
  const settle = () => h.act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); });
  const click = async (text: string) => {
    const button = [...doc.querySelectorAll("button")].find(button => button.textContent === text);
    assert.ok(button, text); await h.act(async () => button.click()); await settle();
  };
  const field = (name: string, value: string) => {
    const input = doc.querySelector(`[name="${name}"]`) as HTMLInputElement;
    assert.ok(input, name); input.value = value;
  };
  const submit = () => h.act(async () => doc.querySelector('[role="dialog"] form')!.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })));
  try {
    await h.act(async () => h.mount()); await settle();
    await click("Supplement"); field("supplement_name", "Creatine"); field("dose_amount", "5"); field("dose_unit", "g"); field("time", "21:37");
    await click("+ Add tag");
    const tagButton = doc.querySelector('[aria-label="Available tags"] button') as HTMLButtonElement;
    assert.ok(tagButton); const tag = tagButton.textContent;
    await h.act(async () => tagButton.click());
    await submit();
    assert.ok(doc.querySelector('[role="dialog"]'));
    assert.equal((doc.querySelector('[name="supplement_name"]') as HTMLInputElement).value, "Creatine");
    assert.equal(refreshes, 0); assert.deepEqual(activations, []);
    assert.equal(writes.length, 1); assert.equal(writes[0].table, "health_events");
    assert.equal(writes[0].rows[0].input_method, "manual");
    assert.equal(writes[0].rows[0].event_time, "21:37");
    assert.equal(writes[0].rows[0].dose, "5 g");
    assert.equal(writes[0].rows[0].dose_amount, 5);
    assert.equal(JSON.stringify(writes[0].rows[0].tags), JSON.stringify([tag]));
    Object.assign(w, { fail: false }); await submit(); await settle();
    assert.equal(doc.querySelector('[role="dialog"]'), null);
    assert.equal(refreshes, 1); assert.deepEqual(activations, ["first_health_event"]);
    assert.match(doc.body.textContent!, /Event saved. Timeline refreshed./);
    await click("Supplement");
    assert.equal((doc.querySelector('[name="supplement_name"]') as HTMLInputElement).value, "");
    assert.equal(doc.querySelector('[aria-label^="Remove "]'), null);
    Object.assign(w, { signedIn: false }); await submit();
    assert.match(doc.body.textContent!, /Please sign in/); assert.equal(writes.length, 2);
    await click("Cancel");
    Object.assign(w, { signedIn: true });
    for (const [type, name, value] of [["Fluid", "description", "Water"], ["Exercise", "exercise_type", "Walk"], ["Medication", "name", "Daily medication"], ["Note", "note_text", "Feeling rested"]]) {
      await click(type); field(name, value); field("time", "08:15");
      await submit(); await settle();
      const row = writes.at(-1)!.rows[0];
      assert.equal(row.event_type, type.toLowerCase()); assert.equal(row.title, value);
      assert.equal(row.event_time, "08:15"); assert.equal(row.input_method, "manual");
      assert.equal(JSON.stringify(row.tags), "[]");
      assert.equal(doc.querySelector('[role="dialog"]'), null);
    }
    assert.equal(refreshes, 5);
    await click("Food"); await click("Symptom");
    assert.deepEqual(routes, ["/health/nutrition", "/health/symptoms"]);
  } finally {
    await h.act(async () => h.unmount()); dom.window.close();
    for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
  }
});
