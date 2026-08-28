import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as nodeModule from "node:module";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { discoverOutcomes } from "./discovery.ts";
import { DraftSession, WizardError, chooseOutcome, datePlan, designError, errorMessage, interventionChoices, outcomeChoices, readinessKey, readinessPresentation, restoreDraft, startDestination, steps, targetKind, targetSelected, wizardRequest, type LoadedDraft } from "./wizard-client.ts";
import type { ReadinessResult } from "../measurements/readiness-policies.ts";
import type { DraftV2Input } from "./v2.ts";
const id="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const discovery=discoverOutcomes(), energy=discovery.outcomes.find(o=>o.registryKey==="energy_score")!;
const input:DraftV2Input={name:"Example experiment",outcomes:[chooseOutcome(energy)]};
const saved=(revision=1)=>({id,config_revision:revision,status:"draft",current_phase:"planning",question:null});
const read=(file:string)=>readFileSync(new URL(file,import.meta.url),"utf8");

test("wizard progression uses discovery groups and target-required versus targetless choices",()=>{
  assert.deepEqual(steps,["Goal","Outcome","Change","Design","Review"]);
  assert.ok(outcomeChoices(discovery,"Energy / Mood").some(o=>o.registryKey===energy.registryKey));
  assert.equal(targetSelected(energy,chooseOutcome(energy)),true);assert.equal(targetKind(energy),null);
  const exercise=discovery.outcomes.find(o=>o.primaryPerformancePreference)!;
  assert.equal(outcomeChoices(discovery,"Workout Performance")[0].registryKey,exercise.registryKey);
  assert.equal(targetSelected(exercise,chooseOutcome(exercise)),false);
  assert.equal(targetSelected(exercise,{...chooseOutcome(exercise),exercise_id:id}),true);
  assert.equal(discovery.outcomes.find(o=>o.registryKey==="body_weight")?.enabled,false);
});
test("symptom identities stay distinct and intervention selection maps only supported references",()=>{
  const symptom=discovery.outcomes.find(o=>o.targetSelector==="symptom")!;
  assert.equal(targetKind(symptom),"symptoms");assert.equal(targetKind(symptom,true),"catalog_symptoms");
  assert.deepEqual(interventionChoices.map(i=>i.type),["habit","protocol","nutrition_target","nutrition_pattern","workout"]);
  assert.equal(new Set(interventionChoices.map(i=>i.field)).size,5);
});
test("date design follows selected metadata, local days and backend inclusive duration limits",()=>{
  const episode=discovery.outcomes.find(o=>o.targetSelector==="condition")!;
  const plan=datePlan("America/New_York",episode.recommendedWindowDays!,14,new Date("2026-03-09T02:00:00Z"));
  assert.equal(plan.intervention_start_date,"2026-03-08");assert.equal(plan.baseline_start_date,"2026-02-08");
  const today=datePlan("UTC",14,366);assert.equal(designError({...input,...today,analysis_timezone:"UTC",baseline_mode:"historical"}),null);
  assert.match(designError({...input,...today,analysis_timezone:"UTC",baseline_mode:"prospective"})!,/future baseline/);
  assert.match(designError({...input,...today,analysis_timezone:"not-a-zone"})!,/timezone/);
});
test("draft restore strips response-only fields but preserves secondary outcomes, criteria and explicit identity",()=>{
  const criterion={version:1,kind:"target_value",operator:"gte",value:8,unit:"score_10"};
  const data={experiment:{...saved(4),name:"Existing",question_is_custom:false,private_field:"not input"},interventions:[{intervention_type:"protocol",linked_user_protocol_id:id,name:"Name"}],outcomes:[{...chooseOutcome(energy),name:"Energy",success_criterion:criterion},{...chooseOutcome(energy),outcome_role:"secondary",name:"Secondary"}],targets:[]} as unknown as LoadedDraft;
  const restored=restoreDraft(data);assert.equal(restored.outcomes?.length,2);assert.deepEqual(restored.outcomes?.[0].success_criterion,criterion);
  assert.equal("private_field" in restored,false);assert.equal("name" in restored.intervention!,false);assert.equal("name" in restored.outcomes![0],false);
});
test("readiness identity changes for outcome, target, aggregation, timezone and window only",()=>{
  const base={...input,analysis_timezone:"UTC",baseline_mode:"historical" as const,baseline_start_date:"2020-01-01",baseline_end_date:"2020-01-14"};const key=readinessKey(base);
  for(const patch of [{analysis_timezone:"America/New_York"},{baseline_start_date:"2020-01-02"},{baseline_end_date:"2020-01-13"},{outcomes:[{...chooseOutcome(energy),aggregation_method:"median"}]},{outcomes:[{...chooseOutcome(energy),user_condition_id:id}]},{outcomes:[{...chooseOutcome(energy),registry_key:"mood_score"}]}])assert.notEqual(readinessKey({...base,...patch}),key);
  assert.equal(readinessKey({...base,name:"Renamed",question:"Custom question"}),key);
  const component=read("../../components/experiments/ExperimentWizard.tsx");assert.match(component,/readyKey===previewKey\?readiness:null/);assert.match(component,/generation===readinessGeneration.current/);assert.match(component,/setReadiness\(null\)/);
});
function readiness(patch:Partial<ReadinessResult>={}):ReadinessResult{return{queryCompleteness:"complete",classification:"good",observationCount:9,distinctDays:9,evaluatedAt:"2020-01-01T12:00:00Z",unit:"lb",target:{kind:"none"},workout:null,missingness:{censored:0},warnings:[],coverage:{percentage:64},...patch} as unknown as ReadinessResult;}
test("readiness good, limited, insufficient and unavailable retain backend distinctions",()=>{
  for(const [classification,title]of[["good","Good baseline data"],["limited","Limited baseline data"],["insufficient","Not enough baseline data yet"]]as const)assert.equal(readinessPresentation(readiness({classification})).title,title);
  const incomplete=readinessPresentation(readiness({queryCompleteness:"truncated",classification:null}));assert.equal(incomplete.title,"Baseline check unavailable");assert.match(incomplete.facts[0],/technical issue/);
});
test("Estimated 1RM and nutrition cards preserve latest/best, unknown intake and coverage wording",()=>{
  const workout=readinessPresentation(readiness({workout:{eligibleSetCount:6,distinctSessionCount:2,distinctDateCount:2,latestValue:120,bestValue:130} as ReadinessResult["workout"]}));
  assert.ok(workout.facts.includes("Latest Estimated 1RM: 120 lb"));assert.ok(workout.facts.includes("Best Estimated 1RM: 130 lb"));
  const nutrition=readinessPresentation(readiness({nutrition:{qualifyingCompleteDays:7,requestedDays:14,fieldIncompleteDays:4,partialDays:2,unknownCoverageDays:5}}));assert.match(nutrition.warnings.join(" "),/not zero intake/);assert.match(nutrition.facts.join(" "),/7 complete/);
});
test("event zero wording never claims absence or symptom-free surveillance",()=>{
  for(const kind of ["condition","symptom"]as const){const result=readinessPresentation(readiness({target:{kind} as ReadinessResult["target"],recordedTotal:0,warnings:["NO_CONDITION_SURVEILLANCE_DENOMINATOR"]}));assert.match(result.facts[0],/^0 recorded/);assert.match(result.warnings.join(" "),/do not prove/);}
});
test("null-ID creation is issued once under duplicate clicks and immediately advances revision",async()=>{
  const calls:unknown[]=[];let resolve!:(value:unknown)=>void;
  const send=((path:unknown,body:unknown)=>{calls.push({path,body});return new Promise<unknown>(r=>{resolve=r;});}) as typeof wizardRequest;
  const session=new DraftSession(send), first=session.save(input);await assert.rejects(session.save(input));assert.equal(calls.length,1);
  resolve({experiment:saved()});await first;assert.equal(session.id,id);assert.equal(session.revision,1);assert.equal(session.isSaved(input),true);
  const update=session.save({...input,name:"Updated"});assert.deepEqual(calls[1],{path:"draft",body:{id,revision:1,input:{...input,name:"Updated"}}});resolve({experiment:saved(2)});await update;assert.equal(session.revision,2);
});
test("uncertain new draft or malformed success cannot be blindly retried",async()=>{
  for(const outcome of [new WizardError("TEMPORARILY_UNAVAILABLE",true),null,{experiment:{id}}]){let calls=0;const session=new DraftSession((async()=>{calls++;if(outcome instanceof Error)throw outcome;return outcome;}) as typeof wizardRequest);await assert.rejects(session.save(input));assert.equal(session.blocked,true);await assert.rejects(session.save(input));assert.equal(calls,1);}
});
test("conflict freezes edits until explicit restore; Premium failure keeps an upgrade/retry path",async()=>{
  const conflict=new DraftSession((async()=>{throw new WizardError("REVISION_CONFLICT");}) as typeof wizardRequest);await assert.rejects(conflict.save(input));assert.equal(conflict.blocked,true);
  conflict.restore({experiment:saved(7)} as LoadedDraft,input);assert.equal(conflict.blocked,false);assert.equal(conflict.revision,7);
  const premium=new DraftSession((async()=>{throw new WizardError("PREMIUM_REQUIRED");}) as typeof wizardRequest);await assert.rejects(premium.save(input),/Premium/);assert.equal(premium.blocked,false);
});
test("start uses current revision once, rejects dirty input and returns the correct status destination",async()=>{
  const calls:unknown[]=[];let resolve!:(value:unknown)=>void;const session=new DraftSession(((path:unknown,body:unknown)=>{calls.push({path,body});return new Promise<unknown>(r=>{resolve=r;});}) as typeof wizardRequest);
  session.restore({experiment:saved(3)} as LoadedDraft,input);await assert.rejects(session.start({...input,name:"Unsaved"}));assert.equal(calls.length,0);
  const starting=session.start(input);await assert.rejects(session.start(input));assert.equal(calls.length,1);assert.deepEqual(calls[0],{path:"start",body:{id,revision:3}});
  resolve({experiment:{...saved(3),status:"active",current_phase:"intervention"}});const result=await starting;assert.equal(startDestination(result),`/experiments/${id}?started=1`);await assert.rejects(session.start(input));assert.equal(calls.length,1);
});
test("HTTP client preserves failed readiness, sanitizes errors and marks uncertain mutation transport",async()=>{
  const unavailable=await wizardRequest("baseline-readiness",{},undefined,(async()=>Response.json({contractVersion:1,queryCompleteness:"failed"},{status:503}))as typeof fetch);assert.deepEqual(unavailable,{contractVersion:1,queryCompleteness:"failed"});
  await assert.rejects(wizardRequest("draft",{},undefined,(async()=>{throw new Error("network private message");})as typeof fetch),(e:unknown)=>e instanceof WizardError&&e.uncertain&&!e.message.includes("private"));
  await assert.rejects(wizardRequest("draft",{},undefined,(async()=>Response.json(null))as typeof fetch),(e:unknown)=>e instanceof WizardError&&e.uncertain);
  assert.doesNotMatch(errorMessage("private SQL error"),/SQL/);
});
test("target selector searches and paginates through the API, with keyboard labels and stale-request protection",()=>{
  const code=read("../../components/experiments/TargetPicker.tsx");assert.match(code,/search:term/);assert.match(code,/cursor:page.nextCursor/);assert.match(code,/generation.current === current/);assert.match(code,/type="radio"/);assert.match(code,/Search \{label\}/);
});
test("legacy detail remains available while V2 skips all legacy mutation controls",()=>{
  const detail=read("../../components/experiments/ExperimentDetail.tsx").replace(/\s+/g,"");assert.ok(detail.indexOf("model_version===2")>=0&&detail.indexOf("model_version===2")<detail.indexOf("constactions="));assert.match(detail,/transitionExperiment/);
  assert.doesNotMatch(read("../../components/experiments/ExperimentV2Status.tsx"),/transitionExperiment|\.rpc\(/);
  const home=read("../../components/experiments/ExperimentsHome.tsx");assert.match(home,/Legacy experiment/);assert.match(home,/\/edit/);assert.doesNotMatch(home,/createDraft/);
});
test("wizard mutations are HTTP-only and no analytical or entitlement engine is imported into React",()=>{
  for(const name of ["ExperimentWizard","ReadinessCard","TargetPicker"]){const source=read(`../../components/experiments/${name}.tsx`);assert.doesNotMatch(source,/\.rpc\(|saveV2Draft|startV2Experiment|evaluateReadiness|readinessPolicies|hasEntitlement|estimated1rmEpley/);}
  const source=read("../../components/experiments/ExperimentWizard.tsx");assert.match(source,/UpgradeCard/);assert.match(source,/router.push\(startDestination/);assert.match(source,/aria-describedby/);
});

// Render actual TSX with the installed TypeScript compiler and React server
// renderer. No new component or E2E framework is installed.
type Hooks={registerHooks(hooks:{resolve:(s:string,c:{parentURL?:string},next:(s:string,c:unknown)=>unknown)=>unknown;load:(u:string,c:unknown,next:(u:string,c:unknown)=>unknown)=>unknown}):{deregister():void}};
const hooks=(nodeModule as unknown as Hooks).registerHooks({
  resolve(s,c,next){if(s==="next/link")return next("next/link.js",c);let candidate:string|undefined;if(s.startsWith("@/"))candidate=fileURLToPath(new URL(`../../${s.slice(2)}`,import.meta.url));else if(s.startsWith(".")&&c.parentURL)candidate=fileURLToPath(new URL(s,c.parentURL));
    if(candidate){for(const suffix of ["",".ts",".tsx"]){if(existsSync(candidate+suffix)&&/\.tsx?$/.test(candidate+suffix))return{url:pathToFileURL(candidate+suffix).href,shortCircuit:true};}}return next(s,c);},
  load(url,c,next){if(url.endsWith(".tsx"))return{format:"module",source:ts.transpileModule(readFileSync(new URL(url),"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};return next(url,c);}
});
const {ReadinessCard}=await import("../../components/experiments/ReadinessCard.tsx");
const {StudyStatusView}=await import("../../components/experiments/ActiveStudyStatus.tsx");hooks.deregister();
test("actual readiness component renders textual status, retry and stale preview explanation",()=>{
  const html=renderToStaticMarkup(createElement(ReadinessCard,{result:readiness({classification:"limited"}),busy:false,onRetry(){}}));assert.match(html,/Limited baseline data/);assert.match(html,/Refresh baseline/);assert.match(html,/aria-live="polite"/);
  const stale=renderToStaticMarkup(createElement(ReadinessCard,{result:null,stale:true,busy:false,onRetry(){}}));assert.match(stale,/previous preview no longer applies/);
});

test("actual active study component renders exposure/completeness states without efficacy or legacy controls",()=>{
  for(const state of ["adherent","non-adherent","unknown"] as const){const html=renderToStaticMarkup(createElement(StudyStatusView,{data:{id,revision:2,status:"active",phase:"intervention",question:"Does walking appear associated with energy?",timezone:"UTC",checkedAt:"2026-08-28T12:00:00Z",period:{start:"2026-08-24",end:"2026-09-06",today:"2026-08-28",total:14,day:5,elapsed:4,percent:29,ended:false,closedEnd:"2026-08-28"},intervention:{name:"Walking",type:"habit",href:"/habits",criteria:["Schedule: M/W/F"]},outcome:{name:"Energy",href:"/checkin"},exposure:{state,eligible:2,completed:state==="adherent"?2:0,skipped:state==="non-adherent"?2:0,unknown:state==="unknown"?2:0,today:"No opportunity today",reason:"Frozen schedule"},completeness:{state:state==="adherent"?"complete":state==="non-adherent"?"missing":"unknown",captured:1,expected:2,missing:1,unit:"days",reason:"Current data"},health:"Unable to determine",snapshotMessage:"Frozen criteria"}}));assert.match(html,/Study day 5 of 14/);assert.match(html,/does not indicate whether the intervention is working/);assert.match(html,/Open outcome tracker/);assert.doesNotMatch(html,/Lifecycle actions<|<form|<input|View results/);assert.match(html,state==="adherent"?/Adherent/:state==="non-adherent"?/Non-adherent/:/Unknown \/ insufficient evidence/);}
});
