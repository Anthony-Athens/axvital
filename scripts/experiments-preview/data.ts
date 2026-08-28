import { discoverOutcomes } from "../../lib/experiments/discovery";
import { datePlan, chooseOutcome } from "../../lib/experiments/wizard-client";
import { collectionHealth, habitExposure, studyPeriod, unknownCompleteness, unknownExposure, type StudyStatus } from "../../lib/experiments/study-health";
export const id="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", legacyId="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
export const discovery=discoverOutcomes();
export const draft={id,config_revision:1,status:"draft",current_phase:"planning",model_version:2,name:"Synthetic energy experiment",question:"Does Example protocol appear associated with a change in energy?",question_is_custom:false,hypothesis:"Synthetic fixture only, not personal health data.",analysis_timezone:"UTC",baseline_mode:"historical",...datePlan("UTC",14,14)};
export const configuration={experiment:draft,interventions:[{intervention_type:"protocol",linked_user_protocol_id:id,name:"Example protocol"}],outcomes:[{...chooseOutcome(discovery.outcomes.find(o=>o.registryKey==="energy_score")!),name:"Energy"}],targets:[{id,label:"Example protocol",identity:"linked_user_protocol_id",available:true}]};
export const counters={creates:0,saves:0,starts:0,readiness:0};
export const scenario={premium:true,readiness:"good"};
function activeFixture():StudyStatus {
  const now=new Date(),period=studyPeriod(draft.intervention_start_date,draft.intervention_end_date,"UTC",now)!;
  const exposure=scenario.readiness==="good"?habitExposure({start_date:period.start,end_date:null,recurrence_type:"daily",days_of_week:null,interval_days:null},[],period.start,period.closedEnd,period.today,period.end):unknownExposure("Synthetic unsupported evidence.");
  const completeness=unknownCompleteness("Synthetic fixture has no completed-day observations yet.");
  return {id,revision:draft.config_revision,status:"active",phase:"intervention",question:draft.question,timezone:"UTC",checkedAt:now.toISOString(),period,intervention:{name:"Synthetic daily walking habit",type:"habit",href:"/habits",criteria:["Schedule: daily","Tracking: binary"]},outcome:{name:"Energy",href:"/checkin"},exposure,completeness,health:collectionHealth(exposure,completeness),snapshotMessage:"Synthetic Start snapshot. Linked settings do not replace frozen criteria."};
}
const identities:Record<string,string>={conditions:"user_condition_id",symptoms:"user_symptom_id",catalog_symptoms:"symptom_id",exercises:"exercise_id",habits:"linked_planned_activity_id",protocols:"linked_user_protocol_id",nutrition_patterns:"nutrition_pattern_id",target_rules:"rule_id",workout_templates:"linked_workout_template_id"};
export async function fixtureFetch(input:RequestInfo|URL,init?:RequestInit){
  const url=new URL(String(input),"http://127.0.0.1:3101"), path=url.pathname, body=init?.body?JSON.parse(String(init.body)):null;
  await new Promise(resolve=>setTimeout(resolve,100));
  if(path.endsWith("/status"))return scenario.readiness==="failed"?Response.json({error:"TEMPORARILY_UNAVAILABLE"},{status:503}):Response.json(activeFixture());
  if(path.endsWith("/outcomes"))return Response.json(discovery);
  if(path.endsWith("/targets")){const kind=url.searchParams.get("kind")!,search=url.searchParams.get("search")??"";return Response.json({items:search.includes("nothing")?[]:[{id,label:`Example ${kind}`,identity:identities[kind],available:true}],nextCursor:null});}
  if(path.endsWith("/draft")&&!body)return Response.json(configuration);
  if(!scenario.premium)return Response.json({error:"PREMIUM_REQUIRED"},{status:403});
  if(path.endsWith("/draft")){counters.saves++;if(body.id===null)counters.creates++;Object.assign(draft,body.input,{id,config_revision:body.revision+1});configuration.interventions=body.input.intervention?[{...body.input.intervention,name:"Example change"}]:[];configuration.outcomes=body.input.outcomes;return Response.json({experiment:draft});}
  if(path.endsWith("/start")){counters.starts++;Object.assign(draft,{status:"active",current_phase:"intervention"});return Response.json({experiment:draft});}
  if(path.endsWith("/baseline-readiness")){counters.readiness++;return Response.json({contractVersion:1,registryKey:body.outcome.registry_key,queryCompleteness:scenario.readiness==="failed"?"failed":"complete",classification:scenario.readiness==="failed"?null:scenario.readiness,observationCount:9,distinctDays:9,evaluatedAt:new Date().toISOString(),unit:"score_10",target:{kind:"none"},workout:null,coverage:{percentage:64},missingness:{censored:0},warnings:[],blockers:scenario.readiness==="failed"?["SOURCE_UNAVAILABLE"]:[]},{status:scenario.readiness==="failed"?503:200});}
  throw new Error("Fixture blocks all other network calls");
}
export function createClient(){
  const rows=[{...draft,interventions:configuration.interventions,outcomes:configuration.outcomes,phase_events:[]},{...draft,id:legacyId,model_version:1,name:"Legacy synthetic experiment",status:"draft",interventions:[],outcomes:[],phase_events:[]}];
  return{auth:{getUser:async()=>({data:{user:{id}},error:null})},from(){let selected=rows;const q={select:()=>q,eq:(field:string,value:unknown)=>{if(field==="id")selected=selected.filter(r=>r.id===value);return q;},is:()=>q,order:()=>q,single:async()=>({data:selected[0],error:null}),then:(resolve:(data:unknown)=>void)=>Promise.resolve({data:selected,error:null}).then(resolve)};return q;},rpc(){throw new Error("No direct mutations allowed in preview");}};
}
