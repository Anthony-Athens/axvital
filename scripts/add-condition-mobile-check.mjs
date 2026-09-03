// Run after npm run build. Uses synthetic data and the real condition validation/search.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { build } from "esbuild";
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright");

const fixture=`import {useState} from "react";import {createRoot} from "react-dom/client";import {AddConditionDialog} from "./components/health/AddConditionDialog";
const categories=[{id:"a",name:"Neurological conditions"},{id:"b",name:"Digestive conditions"},{id:"c",name:"Other conditions"}];
const catalog=Array.from({length:30},(_,i)=>({id:String(i),category_id:i%2?"b":"a",name:"Condition "+String(i).padStart(2,"0"),short_name:null,common_aliases:[],category:{name:i%2?"Digestive conditions":"Neurological conditions"}}));
function App(){const [open,setOpen]=useState(false);return <><button id="trigger" onClick={()=>setOpen(true)}>Add condition</button><div style={{height:1600}}>Synthetic health page</div><AddConditionDialog open={open} categories={categories} catalog={catalog} onClose={()=>setOpen(false)} onAdded={()=>window.added++}/></>}
window.calls=0;window.added=0;window.fail=false;createRoot(document.getElementById("root")).render(<App/>);`;
const realConditions=JSON.stringify(process.cwd().replaceAll("\\","/")+"/lib/conditions/conditions.ts");
const js=(await build({stdin:{contents:fixture,loader:"tsx",resolveDir:process.cwd()},jsx:"automatic",bundle:true,write:false,format:"iife",platform:"browser",define:{"process.env.NODE_ENV":'"production"',"process.env":"{}"},plugins:[{name:"persistence",setup(b){
 b.onResolve({filter:/^@\/lib\/supabase\/browser$/},()=>({path:"client",namespace:"fixture"}));
 b.onResolve({filter:/^@\/lib\/conditions\/conditions$/},()=>({path:"conditions",namespace:"fixture"}));
 b.onLoad({filter:/.*/,namespace:"fixture"},args=>({resolveDir:process.cwd(),contents:args.path==="client"?"export const createClient=()=>({})":`import {validateConditionInput} from ${realConditions};export {filterCatalog} from ${realConditions};export async function addUserCondition(c,input){const error=validateConditionInput(input);if(error)throw Error(error);window.calls++;await new Promise(r=>setTimeout(r,80));if(window.fail)throw Error("We couldn’t add this condition.");return {id:"saved"};}`}));
}}]})).outputFiles[0].text;
const css=(await Promise.all((await readdir(".next/static/chunks")).filter(x=>x.endsWith(".css")).map(x=>readFile(".next/static/chunks/"+x,"utf8")))).join("\n");
const server=createServer((req,res)=>{res.setHeader("Content-Type",req.url==="/app.js"?"text/javascript":"text/html");res.end(req.url==="/app.js"?js:`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script>`);});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
let browser;const measurements=[];
try{
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
 for(const width of [320,390]){
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.addInitScript(()=>{const v=new EventTarget();Object.assign(v,{height:844,offsetTop:0,scale:1});Object.defineProperty(window,"visualViewport",{value:v});window.viewport=(height,offsetTop=0,scale=1)=>{Object.assign(v,{height,offsetTop,scale});v.dispatchEvent(new Event("resize"));v.dispatchEvent(new Event("scroll"));};});
  await mkdir("coverage",{recursive:true});
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator("#trigger").click();
  const sheet=page.getByRole("dialog"),body=sheet.locator("[data-sheet-body]");
  async function measure(stage){await page.waitForTimeout(40);const value=await sheet.evaluate(el=>{
   const rect=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {top:r.top,height:r.height,bottom:r.bottom,width:r.width}};
   const body=el.querySelector("[data-sheet-body]"),header=el.firstElementChild,footer=el.querySelector("form").lastElementChild;
   const parts={sheet:el,header,footer,body};
   if(!window.conditionParts)window.conditionParts=parts;
   const sameParts=Object.entries(parts).every(([key,node])=>window.conditionParts[key]===node);
   return {sameParts,innerHeight:innerHeight,transitionDuration:getComputedStyle(el).transitionDuration,sheet:rect(el),header:rect(header),footer:footer===body?null:rect(footer),body:rect(body),bodyScrollTop:body.scrollTop,shellScrollTop:el.scrollTop,documentScrollTop:document.scrollingElement.scrollTop,viewport:{height:visualViewport.height,offsetTop:visualViewport.offsetTop,scale:visualViewport.scale},focused:rect(document.activeElement),focusedTag:document.activeElement.tagName,font:getComputedStyle(document.activeElement).fontSize,transition:getComputedStyle(el).transitionProperty,verticalScrollers:[...el.querySelectorAll("*")].filter(n=>["auto","scroll"].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight).map(n=>({tag:n.tagName,body:n===body,overflow:getComputedStyle(n).overflowY}))};
  });
   const expectedHeight=Math.min(value.innerHeight,value.viewport.height);
   const expectedTop=Math.max(0,Math.min(value.viewport.offsetTop,value.innerHeight-expectedHeight));
   assert.equal(value.sameParts,true,stage+": shell/header/footer/body stay mounted");
   assert.ok(value.footer,stage+": footer always mounted");
   assert.ok(Math.abs(value.sheet.top-expectedTop-16)<1,stage+": anchored top");
   assert.ok(Math.abs(value.footer.bottom-expectedTop-expectedHeight)<1,stage+": anchored footer");
   assert.ok(value.footer.height>0,stage+": footer occupies space");
   assert.equal(value.shellScrollTop,0,stage+": shell cannot scroll");
   assert.equal(value.documentScrollTop,0,stage+": document cannot scroll");
   assert.equal(value.transitionDuration,"0s",stage+": no shell geometry transition");
   assert.ok(value.verticalScrollers.every(x=>x.body),stage+": only body scrolls vertically");
   const previous=measurements.findLast(x=>x.width===width);
   if(previous){assert.equal(value.footer.height,previous.footer.height,stage+": fixed footer height");assert.equal(value.header.height,previous.header.height,stage+": fixed header height");if(value.viewport.height===previous.viewport.height&&value.viewport.offsetTop===previous.viewport.offsetTop)assert.equal(value.sheet.top,previous.sheet.top,stage+": no interaction jump");}
   measurements.push({width,stage,...value});return value;}
  await measure("open");
  await sheet.getByRole("button",{name:"Digestive conditions",exact:true}).click();await measure("category filter");
  await sheet.getByRole("button",{name:"All",exact:true}).click();
  await sheet.getByLabel("Search conditions").focus();await measure("search focus");
  await page.evaluate(()=>window.viewport(844,38));await measure("native picker transient offset");
  await page.evaluate(()=>window.viewport(500));await measure("keyboard height");
  await page.evaluate(()=>window.viewport(500,38));await measure("offset-only pan");
  await page.evaluate(()=>window.viewport(500,0));
  await sheet.getByLabel("Search conditions").fill("Condition 00");await measure("filtered search");
  await sheet.getByRole("button",{name:/Condition 00/}).click();await measure("catalog selected");assert.ok(await sheet.locator('[tabindex="-1"]').evaluateAll(nodes=>nodes.includes(document.activeElement)),"catalog panel receives focus");
  await sheet.getByLabel("Status").click();await measure("native status menu open");await page.keyboard.press("Escape");
  await sheet.getByLabel("Status").selectOption("monitoring");await measure("native status");
  await sheet.getByLabel("Diagnosis date").evaluate(el=>el.addEventListener("click",()=>el.showPicker(),{once:true}));
  await sheet.getByLabel("Diagnosis date").click();await measure("native date picker open");await page.keyboard.press("Escape");
  await sheet.getByLabel("Diagnosis date").focus();await measure("date focus");
  await sheet.getByLabel("Diagnosis date").fill("2099-01-01");await sheet.locator("form").evaluate(el=>el.requestSubmit());await measure("future date validation");
  await sheet.getByLabel("Diagnosis date").fill("1800-01-01");await sheet.getByRole("button",{name:"Add condition",exact:true}).click();await measure("early date validation");
  await sheet.getByLabel("Diagnosis date").fill("2020-01-02");await measure("date selected");
  await sheet.getByLabel("Diagnosis date").fill("");await sheet.getByLabel("Diagnosis year").fill("2020");await measure("year focus");assert.equal(await sheet.getByLabel("Diagnosis year").isDisabled(),false);
  await sheet.getByLabel("Make this my primary condition").check();
  await sheet.getByLabel("Notes").fill("Preserve notes");await measure("notes focus");await page.screenshot({path:`coverage/add-condition-keyboard-${width}.png`});
  await page.evaluate(()=>window.viewport(844));await sheet.getByRole("button",{name:"Choose a different condition"}).click();await measure("return to search");
  await sheet.getByLabel("Search conditions").fill("");
  await body.evaluate(el=>el.scrollTop=el.scrollHeight);
  await sheet.getByRole("button",{name:"Condition not listed? Add a custom condition"}).click();await measure("custom after long list");assert.ok(await sheet.getByLabel("Condition name").evaluate(el=>el===document.activeElement));assert.equal(await sheet.getByLabel("Notes").inputValue(),"Preserve notes");
  await sheet.getByRole("button",{name:"Add condition",exact:true}).click();await sheet.getByRole("alert").waitFor();await measure("empty custom validation");
  await sheet.getByLabel("Condition name").fill("x");await sheet.getByRole("button",{name:"Add condition",exact:true}).click();await measure("short name validation");await page.screenshot({path:`coverage/add-condition-validation-${width}.png`});
  await sheet.getByLabel("Condition name").fill("Custom condition");await sheet.getByLabel("Diagnosis year").fill("1899");await sheet.locator("form").evaluate(el=>el.requestSubmit());await measure("native year validation");await sheet.getByLabel("Diagnosis year").fill("2099");await sheet.locator("form").evaluate(el=>el.requestSubmit());await measure("future year validation");
  await sheet.getByLabel("Diagnosis year").fill("2020");await page.evaluate(()=>window.fail=true);await sheet.getByRole("button",{name:"Add condition",exact:true}).click();await sheet.getByRole("alert").filter({hasText:"We couldn’t add"}).waitFor();await measure("failed save");
  await page.evaluate(()=>window.fail=false);await sheet.getByRole("button",{name:"Add condition",exact:true}).click();await sheet.waitFor({state:"detached"});
  await page.evaluate(()=>window.conditionParts=null);await page.locator("#trigger").click();await measure("reopen");assert.equal(await sheet.getByLabel("Search conditions").inputValue(),"");
  await sheet.getByRole("button",{name:"Close add condition"}).click();
  assert.equal(await page.evaluate(()=>document.body.style.position),"");
  assert.equal(await page.evaluate(()=>document.documentElement.style.overflow),"");
  assert.ok(await page.locator("#trigger").evaluate(el=>el===document.activeElement));
  await page.locator("#trigger").click();
  console.log(`PASS ${width}px: anchored shell/header/footer, one body scroller, native validation, keyboard bounds, focus and state`);
  await mkdir("coverage",{recursive:true});await page.screenshot({path:`coverage/add-condition-${width}.png`});await page.close();
 }

}finally{await browser?.close();await new Promise(r=>server.close(r));}
