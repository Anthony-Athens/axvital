import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { MessageChannel } from "node:worker_threads";
import { JSDOM } from "jsdom";

const code = (await build({
  stdin: { contents: `import {act,useState} from "react"; import {createRoot} from "react-dom/client";
    import {AddConditionDialog} from "./components/health/AddConditionDialog";
    export {act}; let root; export let added=0;
    function App(){const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Open</button><AddConditionDialog open={open} categories={[]} catalog={[]} onClose={()=>setOpen(false)} onAdded={()=>added++}/></>}
    export function mount(){root=createRoot(document.getElementById("root"));root.render(<App/>)}
    export function unmount(){root.unmount()}`,
    resolveDir: process.cwd(), loader: "tsx" },
  jsx: "automatic", bundle: true, write: false, format: "iife", globalName: "Harness", platform: "browser",
  define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
  plugins: [{ name: "persistence", setup(b) {
    b.onResolve({filter: /^@\/lib\/supabase\/browser$/},()=>({path:"client",namespace:"mock"}));
    b.onResolve({filter: /^@\/lib\/conditions\/conditions$/},()=>({path:"conditions",namespace:"mock"}));
    b.onLoad({filter: /.*/,namespace:"mock"},args=>({contents: args.path === "client" ? "export const createClient=()=>({});" : `export const filterCatalog=()=>[]; export async function addUserCondition(c,input){window.calls++;window.payload=input;if(!input.customName?.trim())throw Error("Enter a condition");if(window.fail)throw Error("Request failed");return {id:"saved"}}` }));
  }}],
})).outputFiles[0].text;

test("Add Condition preserves failures, resets on close/success, traps focus and cleans viewport/scroll lock", async()=>{
  const dom = new JSDOM('<div id="root"></div>', {url:"http://localhost",pretendToBeVisual:true,runScripts:"outside-only"});
  const channels: MessageChannel[] = [];
  class TestChannel extends MessageChannel { constructor() { super(); channels.push(this); } }
  const w=dom.window;
  Object.assign(w,{MessageChannel:TestChannel,IS_REACT_ACT_ENVIRONMENT:true, calls:0, fail:true,scrollTo:()=>{}});
  const viewport=new w.EventTarget(); Object.assign(viewport,{height:780,offsetTop:0});
  Object.defineProperty(w,"visualViewport",{value:viewport});
  const h=w.eval(code+";Harness;") as {act: (callback: () => unknown) => Promise<void>; mount: () => void; unmount: () => void; added: number}; const d=w.document;
  const settle=()=>h.act(async()=>{await new Promise(r=>setTimeout(r,35));});
  const click=async(text:string)=>{const button=[...d.querySelectorAll("button")].find(b=>b.textContent===text)!;assert.ok(button,text);await h.act(async()=>button.click());await settle();};
  try {
    await h.act(async()=>h.mount());const trigger=d.querySelector("button")!;trigger.focus();await click("Open");
    assert.equal(d.activeElement?.getAttribute("aria-label"),"Close add condition");
    assert.equal(d.body.style.position,"fixed");
    await click("Condition not listed? Add a custom condition");
    const submit=()=>h.act(async()=>d.querySelector("form")!.dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true})));
    await submit();assert.match(d.querySelector('[role="alert"]')!.textContent!,/Enter a condition/);
    const input=d.querySelector("input")!;
    await h.act(async()=>{Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,"value")!.set!.call(input,"My condition");input.dispatchEvent(new w.Event("input",{bubbles:true}));});
    await submit();assert.match(d.querySelector('[role="alert"]')!.textContent!,/Request failed/);assert.equal(input.value,"My condition");
    Object.assign(viewport,{height:420,offsetTop:30});viewport.dispatchEvent(new w.Event("resize"));await settle();
    const overlay=d.querySelector('[role="dialog"]')!.parentElement!;
    assert.equal(overlay.style.getPropertyValue("--sheet-vh"),"420px");assert.equal(overlay.style.getPropertyValue("--sheet-top"),"30px");
    const buttons=d.querySelector('[role="dialog"]')!.querySelectorAll("button");buttons[buttons.length-1].focus();
    d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Tab",bubbles:true,cancelable:true}));assert.equal(d.activeElement,buttons[0]);
    await click("Cancel");assert.equal(d.activeElement,trigger);assert.equal(d.body.style.position,"");
    viewport.dispatchEvent(new w.Event("resize"));await click("Open");assert.ok(d.querySelector('input[type="search"]'));
    await click("Condition not listed? Add a custom condition");assert.equal(d.querySelector("input")!.value,"");
    await h.act(async()=>{const field=d.querySelector("input")!;Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,"value")!.set!.call(field,"Saved condition");field.dispatchEvent(new w.Event("input",{bubbles:true}));});
    Object.assign(w,{fail:false});await submit();assert.equal(h.added,1);assert.equal(d.querySelector('[role="dialog"]'),null);
    await click("Open");assert.ok(d.querySelector('input[type="search"]'));
    await h.act(async()=>d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));assert.equal(d.querySelector('[role="dialog"]'),null);
  } finally {await h.act(async()=>h.unmount());dom.window.close();for(const channel of channels){channel.port1.close();channel.port2.close();}}
});

