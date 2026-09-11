import { MessageChannel } from "node:worker_threads";
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

type Harness = { act: (fn: () => unknown) => Promise<void>; mount: (kind: string) => void; unmount: () => void };

const bundle = await build({ stdin: { contents: `import {act,StrictMode} from 'react'; import {createRoot} from 'react-dom/client'; import Signup from './app/signup/page'; import {CampaignSignup} from './components/campaigns/CampaignSignup'; import {ProductAnalytics} from './components/ProductAnalytics'; export {act}; let root; export function mount(kind){root=createRoot(document.getElementById('root'));root.render(<StrictMode><ProductAnalytics/>{kind==='signup'?<Signup/>:<CampaignSignup condition={kind}/>}</StrictMode>)} export function unmount(){root.unmount()}`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, jsx: "automatic", platform: "browser", format: "iife", globalName: "Harness", define: { "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_CAMPAIGN_UTM_ALLOWLIST": '"{}"' }, plugins: [{ name: "boundaries", setup(b) {
  const mocks: Record<string, string> = {
    "next/navigation": "export const useRouter=()=>({push:p=>window.redirects.push(p),refresh:()=>{}}); export const usePathname=()=>window.location.pathname;",
    "next/link": "export default function Link(){return null}",
    "@vercel/analytics/next": "export const Analytics=()=>null;",
    "@vercel/analytics": "export const track=(...args)=>{if(window.analyticsFail)throw Error('blocked');window.events.push(args)};",
    "@/lib/supabase/browser": `export const createClient=()=>({auth:{signUp:async input=>{window.authCalls.push(input);await new Promise(r=>setTimeout(r,5));if(window.variant==='throw')throw Error('provider');if(window.variant==='error')return {error:{message:'rejected'},data:{}};return {error:null,data:{user:{created_at:new Date(window.variant==='old'?0:Date.now()).toISOString(),identities:window.variant==='fake'?[]:[{}]},session:window.variant==='confirmation'?null:{}}}}}});`,
  };
  b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:"mock"}:undefined);
  b.onLoad({filter:/.*/,namespace:"mock"},a=>({contents:mocks[a.path]}));
} }] });

test("CTA preserves approved attribution and navigation despite analytics failure; views deduplicate", async () => {
  for (const condition of ["ms", "psoriasis", "hsv"]) {
    const dom = new JSDOM('<div id="root"></div>', { url: `https://axvital.com/conditions/${condition}?utm_source=google&utm_medium=cpc&utm_campaign=${condition}_launch&utm_content=ad_a&utm_term=private_text&email=private`, runScripts: "outside-only" });
    const w = dom.window;
    const channels: MessageChannel[] = [];
    class TestChannel extends MessageChannel { constructor() { super(); channels.push(this); } }
    Object.assign(w, { MessageChannel: TestChannel });
    Object.assign(w, { IS_REACT_ACT_ENVIRONMENT: true, events: [], analyticsFail: false });
    const h = w.eval(bundle.outputFiles[0].text + ";Harness;") as Harness;
    try {
      await h.act(async () => h.mount(condition));
      const events = () => (w as unknown as {events: [string, Record<string,string>][]}).events;
      assert.equal(events().filter(e => e[0] === "Condition Marketing Viewed").length, 1);
      const link = w.document.querySelector("a")!;
      assert.equal(link.getAttribute("href"), `/signup?source_page=conditions_${condition}&utm_source=google&utm_medium=cpc&utm_campaign=${condition}_launch&utm_content=ad_a`);
      // Observe default navigation before cancelling it in the harness only.
      let navigationAllowed = false;
      w.document.addEventListener("click", event => { navigationAllowed = !event.defaultPrevented; event.preventDefault(); });
      await h.act(async () => link.click());
      assert.equal(navigationAllowed, true);
      assert.deepEqual(JSON.parse(JSON.stringify(events().at(-1))), ["Condition Marketing CTA Clicked", {source_page:`conditions_${condition}`,utm_source:"google",utm_medium:"cpc",utm_campaign:`${condition}_launch`,utm_content:"ad_a"}]);
      Object.assign(w, {analyticsFail:true});
      await h.act(async () => link.click());
      assert.equal(navigationAllowed, true);
    } finally { await h.act(async () => h.unmount()); w.close(); channels.forEach(c => { c.port1.close(); c.port2.close(); }); }
  }
});

test("real signup UI gates conversion, handles failures and keeps attribution out of Auth", async () => {
  for (const variant of ["success", "confirmation", "error", "throw", "fake", "old", "analyticsFailure"]) {
    const dom = new JSDOM('<div id="root"></div>', {url:"https://axvital.com/signup?source_page=conditions_ms&utm_source=google&utm_medium=cpc&utm_campaign=ms_launch&utm_content=ad_b&utm_term=private_text&email=private",runScripts:"outside-only"});
    const w = dom.window;
    const channels: MessageChannel[] = [];
    class TestChannel extends MessageChannel { constructor() { super(); channels.push(this); } }
    Object.assign(w, { MessageChannel: TestChannel });
    Object.assign(w, {IS_REACT_ACT_ENVIRONMENT:true,events:[],redirects:[],authCalls:[],variant,analyticsFail:variant==="analyticsFailure"});
    const h = w.eval(bundle.outputFiles[0].text+";Harness;") as Harness;
    try {
      await h.act(async()=>h.mount("signup"));
      const fields = w.document.querySelectorAll("input");
      const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,"value")!.set!;
      for (const [i,value] of ["private@example.test","LongPassword123!","Private Name"].entries()) await h.act(async()=>{setter.call(fields[i],value);fields[i].dispatchEvent(new w.Event("input",{bubbles:true}));});
      const submit=()=>w.document.querySelector("form")!.dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));
      await h.act(async()=>{submit();submit();await new Promise(r=>setTimeout(r,20));});
      const state=w as unknown as {events:[string,Record<string,string>][],authCalls:unknown[],redirects:string[]};
      assert.equal(state.authCalls.length,1);
      assert.doesNotMatch(JSON.stringify(state.authCalls),/source_page|conditions_ms|utm_/);
      assert.doesNotMatch(JSON.stringify(state.events),/private@example|Private Name|LongPassword/);
      const completed=state.events.filter(e=>e[0]==="Signup Completed");
      assert.equal(completed.length,variant==="success"||variant==="confirmation"?1:0);
      for (const [name, payload] of state.events) {
        if (["Signup Viewed", "Signup Started", "Signup Completed"].includes(name)) assert.deepEqual(JSON.parse(JSON.stringify(payload)), {source_page:"conditions_ms",utm_source:"google",utm_medium:"cpc",utm_campaign:"ms_launch",utm_content:"ad_b"});
      }
      assert.equal(state.events.filter(e=>e[0]==="Signup Viewed").length,variant==="analyticsFailure"?0:1);
      if(variant==="error"||variant==="throw") {assert.equal(state.redirects.length,0);assert.equal(w.document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled,false);}
      else if(variant==="confirmation") {assert.equal(state.redirects.length,0);assert.match(w.document.body.textContent!,/Check your email/);}
      else assert.equal(state.redirects[0],"/onboarding");
      if(variant==="success") {await h.act(async()=>submit());assert.equal(state.authCalls.length,1);}
    } finally {await h.act(async()=>h.unmount());w.close(); channels.forEach(c => { c.port1.close(); c.port2.close(); });}
  }
});
