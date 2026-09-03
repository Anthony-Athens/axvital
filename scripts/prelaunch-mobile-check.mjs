// Run after npm run build. PLAYWRIGHT_MODULE may point to an existing runtime package.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { build } from "esbuild";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fixture = `import {useState} from "react";import {createRoot} from "react-dom/client";
import {ActivityForm} from "./components/planner/ActivityForm";
import {ProgressModal} from "./components/habits/ProgressModal";
import {StartProtocolModal} from "./components/protocols/StartProtocolModal";
import {SymptomLogDialog} from "./components/symptoms/SymptomLogDialog";
import {CustomExerciseForm} from "./components/workouts/CustomExerciseForm";
import {ExerciseSelector} from "./components/workouts/ExerciseSelector";
import {WorkoutsHome} from "./components/workouts/WorkoutsHome";
function App(){const [flow,setFlow]=useState("");const close=()=>setFlow("");
async function save(){window.calls++;await new Promise(r=>setTimeout(r,150));if(window.fail)throw Error("private provider payload");close();}
return <><nav>{["Activity","Progress","Protocol","Symptom","Exercise","Picker","Workouts"].map(x=><button key={x} onClick={()=>setFlow(x)}>{x}</button>)}</nav><div style={{height:1200}}>Background page</div>
{flow==="Activity"?<ActivityForm initialDate="2026-09-03" saving={false} onCancel={close} onSubmit={save}/>:null}
{flow==="Progress"?<ProgressModal occurrence={{status:"pending",planned_activity:{title:"Daily movement",tracking_type:"quantity",target_unit:"steps"}}} saving={false} onClose={close} onSave={save}/>:null}
{flow==="Protocol"?<StartProtocolModal template={{name:"Daily routine",duration_days:30}} busy={false} onClose={close} onStart={save}/>:null}
{flow==="Symptom"?<SymptomLogDialog open symptom={{id:"symptom",name:"Headache",supports_body_location:true,supports_duration:true,supports_severity:true,default_tracking_type:"count"}} conditions={Array.from({length:12},(_,i)=>({id:String(i),custom_condition_name:"Condition "+i}))} onClose={close} onSaved={close}/>:null}
{flow==="Exercise"?<CustomExerciseForm onCancel={close} onCreated={close}/>:null}
{flow==="Picker"?<ExerciseSelector onSelect={()=>{}}/>:null}
{flow==="Workouts"?<WorkoutsHome/>:null}</>}
window.calls=0;window.fail=false;createRoot(document.getElementById("root")).render(<App/>);`;
const exercise = {id:"exercise",name:"Example exercise",category:"strength",default_tracking_type:"reps_weight",aliases:[]};
const template = {id:"template",name:"Example workout",groups:[]};
const mocks = {
  "next/navigation": "export const useRouter=()=>({push:()=>{},refresh:()=>{}})",
  "@/lib/supabase/client": "export const supabase={}",
  "@/lib/supabase/browser": "export const createClient=()=>({})",
  "@/lib/workouts/exercises": `export class ExerciseDuplicateError extends Error{};export const searchExercises=async()=>Array.from({length:35},(_,i)=>({...${JSON.stringify(exercise)},id:String(i),name:"Exercise "+i}));export const findSimilarExercises=async(c,name)=>name==="similar"?[${JSON.stringify(exercise)}]:[];export const createExercise=async()=>{window.calls++;if(window.fail)throw Error("We couldn’t save this exercise.");return ${JSON.stringify(exercise)}};export const archiveExercise=async()=>{};`,
  "@/lib/workouts/templates": `export const getWorkoutTemplates=async(c,archived)=>archived?[]:[${JSON.stringify(template)}];export const getWorkoutTemplateDependencies=async()=>({planned_workouts:0,protocols:0,experiments:0});export const archiveWorkoutTemplate=async()=>{};export const deleteWorkoutTemplate=async()=>{};export const duplicateWorkoutTemplate=async()=>{};`,
  "@/lib/workouts/planning": "export const getPlannedWorkouts=async()=>[];export const scheduleWorkout=async()=>{window.calls++;if(window.fail)throw Error('provider detail')};",
  "@/lib/workouts/sessions": "export const getWorkoutSessions=async()=>[];export const startWorkoutSession=async()=>({id:'session'});",
  "@/lib/symptoms/symptoms": "export const createSymptomEvent=async()=>{window.calls++;if(window.fail)throw Error('We couldn’t log this symptom.');return {id:'event'}};",
};
const js=(await build({stdin:{contents:fixture,loader:"tsx",resolveDir:process.cwd()},jsx:"automatic",bundle:true,write:false,format:"iife",platform:"browser",define:{"process.env.NODE_ENV":'"production"',"process.env":"{}"},plugins:[{name:"fixtures",setup(b){b.onResolve({filter:/.*/},args=>mocks[args.path]?{path:args.path,namespace:"fixture"}:undefined);b.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:mocks[args.path]}));}}]})).outputFiles[0].text;
const cssNames=(await readdir(".next/static/chunks")).filter(x=>x.endsWith(".css"));
assert.ok(cssNames.length,"Run npm run build first");
const css=(await Promise.all(cssNames.map(x=>readFile(".next/static/chunks/"+x,"utf8")))).join("\n");
const server=createServer((req,res)=>{res.setHeader("Content-Type",req.url==="/app.js"?"text/javascript":"text/html");res.end(req.url==="/app.js"?js:`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script>`);});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const url=`http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || undefined});
  const errors=[];
  for(const width of [320,390,1024]){
    const page=await browser.newPage({viewport:{width,height:844}});
    page.on("pageerror",e=>errors.push(e.message));
    await page.addInitScript(()=>{const viewport=new EventTarget();Object.assign(viewport,{height:844,offsetTop:0});Object.defineProperty(window,"visualViewport",{value:viewport,configurable:true});window.setKeyboard=(height,offsetTop=0)=>{Object.assign(viewport,{height,offsetTop});viewport.dispatchEvent(new Event("resize"));};});
    async function geometry(label){
      const result=await page.locator('[role="dialog"]').evaluate(el=>{
        const body=el.querySelector("[data-sheet-body]"),footer=el.querySelector("form > fieldset, div[aria-busy] > fieldset"),close=el.querySelector('button[aria-label^="Close"]');
        const box=x=>{const r=x.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}};
        return {sheet:box(el),footer:box(footer),close:box(close),body:box(body),overflow:body.scrollWidth>body.clientWidth+1,locked:document.body.style.position,viewport:{height:window.visualViewport.height,top:window.visualViewport.offsetTop},pageWidth:document.documentElement.scrollWidth};
      });
      assert.ok(result.sheet.left>=-1&&result.sheet.right<=width+1,label+" sheet horizontal bounds");
      assert.ok(result.footer.bottom<=result.viewport.height+result.viewport.top+1,label+" footer visible");
      assert.ok(result.close.top>=result.viewport.top&&result.close.height>=44,label+" close target visible");
      assert.ok(result.body.height>0&&!result.overflow,label+" body usable without horizontal overflow");
      assert.equal(result.locked,"fixed",label+" page lock");
      return result;
    }
    for(const flow of ["Activity","Progress","Protocol","Symptom","Exercise","Picker","Schedule","Confirmation"]){
      await page.goto(url);
      await page.getByRole("button",{name:["Schedule","Confirmation"].includes(flow)?"Workouts":flow,exact:true}).click();
      if(flow==="Picker")await page.getByRole("button",{name:"Search exercise library…",exact:true}).click();
      if(["Schedule","Confirmation"].includes(flow)){
        await page.getByRole("button",{name:"templates",exact:true}).click();
        if(flow==="Schedule")await page.getByRole("button",{name:"Schedule",exact:true}).click();
        else{await page.getByLabel("More actions for Example workout").click();await page.getByRole("button",{name:"Archive",exact:true}).click();}
      }
      await page.locator('[role="dialog"]').waitFor();
      await page.waitForFunction(()=>document.activeElement?.getAttribute("aria-label")?.startsWith("Close"));
      const initial=await geometry(flow);
      if(flow==="Activity"){
        await page.getByLabel("Title",{exact:true}).fill("Daily activity");
        await page.getByLabel("Tracking method").selectOption("quantity");
        await page.getByLabel("Target value").fill("100");
        await page.getByLabel("Recurrence").selectOption("specific_days");
        await page.getByRole("button",{name:"Mon",exact:true}).click();
      }
      if(flow==="Exercise"){
        await page.getByLabel("Exercise name").fill("similar");await page.getByRole("button",{name:"Save Exercise",exact:true}).click();await page.getByText("A similar exercise already exists.").waitFor();
      }
      if(width<640){const expanded=await geometry(flow);assert.equal(expanded.sheet.top,initial.sheet.top,flow+" stable top");assert.equal(expanded.footer.top,initial.footer.top,flow+" stable footer");}
      const field=page.locator('[role="dialog"] textarea, [role="dialog"] input:not([type="checkbox"]):not([type="range"])').last();
      if(await field.count())await field.focus();
      await page.evaluate(()=>window.setKeyboard(430,20));await page.waitForTimeout(40);const keyboard=await geometry(flow+" keyboard");
      if(await field.count()){const box=await field.boundingBox();if(box&&box.height<=keyboard.body.height)assert.ok(box.y>=keyboard.body.top-1&&box.y+box.height<=keyboard.body.bottom+1,flow+" focused field visible above keyboard");}
      await page.evaluate(()=>window.setKeyboard(844));await page.waitForTimeout(40);await geometry(flow+" restored");
      const closeButton=page.locator('[role="dialog"] button[aria-label^="Close"]');
      const lastButton=page.locator('[role="dialog"] button:enabled').last();
      await lastButton.focus();await page.keyboard.press("Tab");assert.ok(await closeButton.evaluate(el=>el===document.activeElement),flow+" Tab containment");
      await page.keyboard.press("Shift+Tab");assert.ok(await lastButton.evaluate(el=>el===document.activeElement),flow+" reverse Tab containment");
      await closeButton.click();
      assert.equal(await page.locator('[role="dialog"]').count(),0,flow+" dismiss");
      assert.equal(await page.evaluate(()=>document.body.style.position),"",flow+" unlock");
    }
    for(const flow of ["Progress","Protocol","Symptom","Exercise","Schedule"]){
      await page.goto(url);await page.getByRole("button",{name:flow==="Schedule"?"Workouts":flow,exact:true}).click();
      if(flow==="Schedule"){await page.getByRole("button",{name:"templates",exact:true}).click();await page.getByRole("button",{name:"Schedule",exact:true}).click();}
      const labels={Progress:"Completion note",Protocol:"Custom name",Symptom:"Notes",Exercise:"Exercise name",Schedule:"Date"};
      const value=flow==="Schedule"?"2026-09-04":"Keep my entry";
      const field=page.getByLabel(labels[flow]);await field.fill(value);
      await page.evaluate(()=>{window.fail=true;document.querySelector("form").requestSubmit();});
      await page.getByRole("alert").waitFor();assert.equal(await field.inputValue(),value,flow+" failed save preserves input");
      await page.evaluate(()=>{window.fail=false;document.querySelector("form").requestSubmit();});
      await page.locator('[role="dialog"]').waitFor({state:"detached"});assert.equal(await page.evaluate(()=>document.body.style.position),"",flow+" success unlocks");
    }
    // Actual activity submission: failed save preserves input, duplicate submit is ignored, success resets.
    await page.goto(url);await page.getByRole("button",{name:"Activity",exact:true}).click();
    await page.getByLabel("Title",{exact:true}).fill("Keep this title");await page.evaluate(()=>{window.fail=true;const form=document.querySelector("form");form.requestSubmit();form.requestSubmit();});
    await page.getByRole("alert").waitFor();assert.equal(await page.evaluate(()=>window.calls),1);assert.equal(await page.getByLabel("Title",{exact:true}).inputValue(),"Keep this title");
    assert.ok(!(await page.locator("body").innerText()).includes("private provider payload"));
    await page.evaluate(()=>{window.fail=false;});await page.getByRole("button",{name:"Add activity",exact:true}).click();await page.locator('[role="dialog"]').waitFor({state:"detached"});
    await page.getByRole("button",{name:"Activity",exact:true}).click();assert.equal(await page.getByLabel("Title",{exact:true}).inputValue(),"");
    await mkdir("coverage",{recursive:true});await page.screenshot({path:`coverage/prelaunch-${width}.png`});
    await page.close();console.log(`PASS ${width}px: 8 modal workflows, keyboard geometry, focus containment, failed/successful saves and duplicate-click guard`);
  }
  assert.deepEqual(errors,[],"No browser exceptions");
}finally{await browser?.close();await new Promise(r=>server.close(r));}
