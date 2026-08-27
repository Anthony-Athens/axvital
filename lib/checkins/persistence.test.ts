/* eslint-disable @typescript-eslint/no-explicit-any */
import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkinPatch, draftFromRecord, loadCheckin, saveCheckin, type CheckinRecord } from "./persistence.ts";
import { assertDevelopment, insertDemoCheckins } from "./demo.ts";
import { selectedCalendarDate, localDateString } from "../timeline/dates.ts";
import { execFileSync } from "node:child_process";

function fixture(initial: CheckinRecord[] = [], user: string | null = "A") {
  const rows = structuredClone(initial); let fail = false, writes = 0;
  const client: any = { auth: { getUser: async () => ({data:{user:user?{id:user}:null},error:null}) }, from: () => {
    let mode="read", patch:any; const conditions: ((row:any)=>boolean)[]=[];
    const run = async () => {
      if(fail) return {data:null,error:{message:"private provider payload"}};
      const match = rows.filter(row=>conditions.every(fn=>fn(row)));
      if(mode==="insert") {
        const incoming = Array.isArray(patch)?patch:[patch];
        if(incoming.some((p:any)=>rows.some(row=>row.user_id===p.user_id&&row.checkin_date===p.checkin_date)))return {data:null,error:{code:"23505"}};
        const data=incoming.map((p:any)=>({id:`row-${++writes}`,...p})); rows.push(...data);return {data:data[0],error:null};
      }
      if(mode==="update") { writes++;match.forEach(row=>Object.assign(row,patch)); }
      return {data:match[0]??null,error:null};
    };
    const q:any={select:()=>q,eq:(key:string,value:unknown)=>{conditions.push(row=>row[key]===value);return q;},is:(key:string,value:unknown)=>{conditions.push(row=>(row[key]??null)===value);return q;},in:(key:string,values:unknown[])=>{conditions.push(row=>values.includes(row[key]));return q;},limit:()=>q,update:(p:unknown)=>{mode="update";patch=p;return q;},insert:(p:unknown)=>{mode="insert";patch=p;return q;},maybeSingle:run,single:run,then:(resolve:any)=>run().then(result=>resolve({...result,data:result.data?[result.data]:[]}))};return q;
  }};
  return {client:client as SupabaseClient,rows,fail:()=>{fail=true;},writes:()=>writes};
}
const original:CheckinRecord={id:"old",user_id:"A",checkin_date:"2026-08-20",energy_score:6,mood_score:null,alcohol:false,weight:180,notes:"Keep",tags:"unchanged"};
test("empty day has no invented answers and viewing never writes",async()=>{const f=fixture();const result=await loadCheckin(f.client,"2026-08-20");assert.equal(result.row,null);assert.deepEqual(draftFromRecord(result.row),{answers:{},weight:""});assert.equal(f.writes(),0)});
test("reload and a fresh load reproduce authoritative partial values including false alcohol",async()=>{const f=fixture([original]);for(let i=0;i<2;i++){const result=await loadCheckin(f.client,"2026-08-20");assert.ok(result.row);assert.deepEqual(draftFromRecord(result.row),{answers:{energy:"6",alcohol:"No"},weight:"180"})}});
test("saving historical A patches one answer and leaves date B, notes and tags unchanged",async()=>{const today={...original,id:"today",checkin_date:"2026-08-21"},f=fixture([original,today]);const draft=draftFromRecord(original);draft.answers.energy="9";assert.deepEqual(checkinPatch(draft,original),{energy_score:9});const row=await saveCheckin(f.client,"2026-08-20","A",original,draft);assert.equal(row.energy_score,9);assert.equal(row.notes,"Keep");assert.equal(row.tags,"unchanged");assert.deepEqual(f.rows[1],today);assert.equal((await loadCheckin(f.client,"2026-08-20")).row?.energy_score,9)});
test("partial insert persists only actual answers and refresh reproduces them",async()=>{const f=fixture();const row=await saveCheckin(f.client,"2026-08-20","A",null,{answers:{mood:"4"},weight:""});assert.equal(row.energy_score,null);assert.equal(row.alcohol,null);assert.deepEqual(draftFromRecord((await loadCheckin(f.client,"2026-08-20")).row).answers,{mood:"4"})});
test("failed save preserves the caller's draft and original row",async()=>{const f=fixture([original]);f.fail();const draft={answers:{energy:"8"},weight:"181"},copy=structuredClone(draft);await assert.rejects(saveCheckin(f.client,"2026-08-20","A",original,draft));assert.deepEqual(draft,copy);assert.deepEqual(f.rows,[original])});
test("competing same-field edits fail instead of overwriting; unrelated changes survive",async()=>{const f=fixture([{...original,energy_score:3}]);await assert.rejects(saveCheckin(f.client,"2026-08-20","A",original,{...draftFromRecord(original),answers:{energy:"8",alcohol:"No"}}),/SAVE_CONFLICT/);const draft=draftFromRecord(original);draft.answers.mood="5";const row=await saveCheckin(f.client,"2026-08-20","A",original,draft);assert.equal(row.energy_score,3);assert.equal(row.mood_score,5)});
test("concurrent empty-day insert does not overwrite existing data",async()=>{const f=fixture([original]);await assert.rejects(saveCheckin(f.client,"2026-08-20","A",null,{answers:{energy:"8"},weight:""}));assert.deepEqual(f.rows,[original])});
test("anonymous and changed-owner writes fail closed",async()=>{await assert.rejects(loadCheckin(fixture([],null).client,"2026-08-20"),/AUTH_REQUIRED/);await assert.rejects(saveCheckin(fixture([],"B").client,"2026-08-20","A",original,draftFromRecord(original)),/AUTH_REQUIRED/);await assert.rejects(saveCheckin(fixture().client,"2026-08-21","A",original,draftFromRecord(original)),/WRONG_RECORD/)});
test("malformed, impossible and future selected dates never fall back to today",async()=>{for(const value of["","garbage","2026-02-30","2026-13-01","9999-01-01"]){assert.equal(selectedCalendarDate(value),null);await assert.rejects(loadCheckin(fixture().client,value),/INVALID_DATE/)}assert.equal(selectedCalendarDate(null,"2026-08-20"),"2026-08-20")});
test("local check-in date differs correctly from UTC at a timezone boundary",()=>{const path=new URL("../timeline/dates.ts",import.meta.url).href;const code=`import {localDateString} from ${JSON.stringify(path)};const date=new Date('2026-08-21T02:00:00Z');process.stdout.write(localDateString(date));`;assert.equal(execFileSync(process.execPath,["--experimental-strip-types","--input-type=module","-e",code],{env:{...process.env,TZ:"America/Los_Angeles"},encoding:"utf8",stdio:["ignore","pipe","ignore"]}),"2026-08-20");assert.match(localDateString(),/^\d{4}-\d{2}-\d{2}$/)});
test("demo tools reject production and unknown environments",async()=>{assert.throws(()=>assertDevelopment("production"));assert.throws(()=>assertDevelopment("test"));assert.doesNotThrow(()=>assertDevelopment("development"));const previous=process.env.NODE_ENV;Object.assign(process.env,{NODE_ENV:"production"});try{await assert.rejects(insertDemoCheckins(fixture().client,[{user_id:"A",checkin_date:"2026-08-20"}]),/development-only/)}finally{if(previous===undefined)Reflect.deleteProperty(process.env,"NODE_ENV");else Object.assign(process.env,{NODE_ENV:previous})}});
test("demo collisions fail without insert, delete or replacement",async()=>{const previous=process.env.NODE_ENV;Object.assign(process.env,{NODE_ENV:"development"});try{const f=fixture([original]);await assert.rejects(insertDemoCheckins(f.client,[{user_id:"A",checkin_date:"2026-08-20"}]),/already exists/);assert.deepEqual(f.rows,[original]);assert.equal(f.writes(),0)}finally{if(previous===undefined)Reflect.deleteProperty(process.env,"NODE_ENV");else Object.assign(process.env,{NODE_ENV:previous})}});
