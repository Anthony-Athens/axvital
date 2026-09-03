// Local-only visual QA of the real Dashboard using synthetic read-only data.
// Run after npm run build. No auth bypass or fixture route is added to the app.
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const mock = `
const scenario = new URLSearchParams(location.search).get("state") || "populated";
const day = new Date(); const date = day.getFullYear()+"-"+String(day.getMonth()+1).padStart(2,"0")+"-"+String(day.getDate()).padStart(2,"0");
const at = hour => new Date(date+"T"+hour+":00:00").toISOString();
const rows = {
 daily_checkins: Array.from({length:7},(_,i)=>{const d=new Date(day);d.setDate(d.getDate()-i);return {id:"c"+i,checkin_date:d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"),energy_score:7+i%2,mood_score:6+i%3,sleep_quality:"Good",weight:180-i/2}}).reverse(),
 health_events:[{id:"water",event_date:date,event_time:"11:00:00",event_type:"fluid",title:"Water",amount:"24 oz"},{id:"supplement",event_date:date,event_time:"10:00:00",event_type:"supplement",supplement_name:"Creatine",dose_amount:5,dose_unit:"g"},{id:"note",event_date:date,event_time:"09:00:00",event_type:"note",title:"A long synthetic note about a morning walk and everyday context to verify wrapping on narrow screens without hiding useful information"}],
 nutrition_entries:[{id:"meal",meal_type:"breakfast",title:"Oats and berries",consumed_at:at("08"),items:[{source_name:"Oats"},{source_name:"Berries"}]}],
 user_symptom_events:[{id:"symptom",custom_symptom_name:"Fatigue",started_at:at("07"),severity:3}],
 workout_sessions:[{id:"workout",name:"CB1 - L1",status:"completed",started_at:at("05"),ended_at:at("06"),duration_seconds:3600,planned_activity_occurrence_id:"workout-occ"}],
 planned_activity_occurrences:[{id:"habit",status:"completed",completed_at:at("04"),planned_activity:{id:"h",title:"Morning Walk",activity_type:"habit"}},{id:"workout-occ",status:"completed",completed_at:at("06"),planned_activity:{id:"w",title:"CB1 - L1",activity_type:"workout"}},{id:"protocol",status:"completed",completed_at:at("03"),planned_activity:{id:"p",title:"Evening wind-down",activity_type:"habit",user_protocol_id:"p",user_protocol:{name:"Sleep routine"}}}],
 condition_episodes:[], experiment_phase_events:[], weekly_recaps:[]
};
export const supabase = {auth:{getUser:async()=>({data:{user:{id:"synthetic"}},error:null})},from(table){let filters=[];const q={select(){return q},order(){return q},limit(){return q},eq(k,v){if(k!=="user_id")filters.push(r=>r[k]===v);return q},neq(k,v){if(!k.includes("."))filters.push(r=>r[k]!==v);return q},gte(){return q},lte(){return q},lt(){return q},is(k,v){filters.push(r=>(r[k]??null)===v);return q},in(k,vs){filters.push(r=>vs.includes(r[k]));return q},maybeSingle(){return Promise.resolve({data:null,error:null})},then(resolve){if(scenario==="loading")return new Promise(()=>{});return Promise.resolve({data:scenario==="empty"?[]:(rows[table]??[]).filter(r=>filters.every(f=>f(r))),error:scenario==="error"||(scenario==="partial"&&table==="nutrition_entries")?{message:"Synthetic unavailable source"}:null}).then(resolve)}};return q}};
`;
const result = await build({
  stdin: { contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import Dashboard from "./app/dashboard/page"; createRoot(document.getElementById("root")).render(<Dashboard/>);', resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, format: "iife", platform: "browser",
  define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
  plugins: [{ name: "synthetic-dashboard", setup(b) {
    b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: "client", namespace: "fixture" }));
    b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "client" ? mock : 'import React from "react"; export default function Link(props){return React.createElement("a",props)}', resolveDir: process.cwd() }));
  } }],
});
const css = readdirSync(resolve(".next/static/chunks")).filter(name => name.endsWith(".css")).map(name => readFileSync(resolve(".next/static/chunks", name), "utf8")).join("\n");
const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.url === "/bundle.js") { response.setHeader("Content-Type", "text/javascript"); response.end(result.outputFiles[0].text); return; }
  if (request.url === "/style.css") { response.setHeader("Content-Type", "text/css"); response.end(css); return; }
  response.setHeader("Content-Type", "text/html");
  response.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Dashboard synthetic QA</title><link rel="stylesheet" href="/style.css"></head><body><p style="padding:8px;text-align:center;font-size:12px">Local synthetic data · not a user account</p><main id="root"></main><script src="/bundle.js"></script></body></html>');
});
server.listen(3101, "127.0.0.1", () => console.log("Dashboard synthetic preview: http://127.0.0.1:3101"));
