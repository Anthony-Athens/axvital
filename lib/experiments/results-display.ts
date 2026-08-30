import type {AnalysisInput} from "./analysis-contract.ts";
import {measurement} from "../measurements/registry.ts";
import {isObject} from "../rules/validation.ts";
import {calendarDays,isLogicalDate,shiftDate} from "../measurements/time-window.ts";
import {reconcileLifecycle} from "./lifecycle.ts";

/** Presentation-only contract, independently versioned from immutable analysis policy/digest versions.
 * Values come from the retained definition, never question text or current labels.
 */
export type ResultsDisplayV1={version:1;outcomeLabel:string;unit:string|null;scaleLabel:string|null};
export type ResultsDisplayV2={version:2;outcomeLabel:string;unit:string|null;scaleLabel:string|null;experimentName:string|null;question:string|null;interventionLabel:string|null;design:{baselineDays:number|null;plannedDays:number|null;activeDays:number|null;excludedDays:number|null;baselineStart:string|null;baselineEnd:string|null;experimentStart:string|null;experimentEnd:string|null}};
export type ResultsDisplay=ResultsDisplayV1|ResultsDisplayV2;
const safeText=(value:unknown,max=160)=>typeof value==="string"&&value.trim().length>0&&value.length<=max&&!/[\x00-\x1f]/.test(value)?value.trim():null;
const days=(start:unknown,end:unknown)=>isLogicalDate(start)&&isLogicalDate(end)?calendarDays(start,shiftDate(end,1)):null;
const nutrient:Record<string,string>={calories:"Calories",protein_grams:"Protein",carbs_grams:"Carbohydrates",fat_grams:"Fat",fiber_grams:"Fiber",caffeine_mg:"Caffeine",alcohol_grams:"Alcohol"};
function interventionLabel(intervention:Record<string,unknown>){
 const source=isObject(intervention.configuration)?intervention.configuration:{},definition=isObject(source.definition)?source.definition:{};
 if(intervention.type==="nutrition_target"&&definition.kind==="numeric"){
  const metric=nutrient[String(definition.metric)]??"Nutrition target",operator=definition.operator==="gte"?"≥":definition.operator==="lte"?"≤":definition.operator==="eq"?"=":null;
  if(operator&&typeof definition.value==="number"&&Number.isFinite(definition.value)&&safeText(definition.unit,24))return `${metric} ${operator} ${definition.value} ${definition.unit}/day`;
  return "Nutrition goal";
 }
 return intervention.type==="habit"?"Habit":intervention.type==="protocol"?"Protocol":intervention.type==="workout"?"Workout plan":intervention.type==="nutrition_pattern"?"Eating pattern":null;
}
export function retainedResultsDisplay(input:AnalysisInput):ResultsDisplay {
 const fallback:ResultsDisplayV1={version:1,outcomeLabel:"Outcome",unit:null,scaleLabel:null};
 const outcomes=input.startSnapshot?.configuration.outcomes;
 if(!Array.isArray(outcomes))return fallback;
 const primary=outcomes.filter(o=>isObject(o)&&o.outcome_role==="primary");
 if(primary.length!==1||!isObject(primary[0].definition))return fallback;
 const definition=primary[0].definition,known=measurement(String(primary[0].registry_key),Number(primary[0].registry_version));
 if(!known?.enabled||definition.key!==known.key||definition.version!==known.version||definition.unit!==known.unit||definition.scale!==known.scale)return fallback;
 const label=safeText(definition.label)??"Outcome",frozen=input.startSnapshot!.configuration,intervention=isObject(frozen.intervention)?frozen.intervention:{};
 let activeDays:number|null=null,excludedDays:number|null=null;
 if(input.lifecycle){const lifecycle=reconcileLifecycle(frozen,input.experiment.status,input.experiment.phase,input.lifecycle,input.cutoff);if(!lifecycle.issues.length){activeDays=lifecycle.activeDates.length;excludedDays=lifecycle.excludedDates.length;}}
 return {version:2,outcomeLabel:label,unit:known.scale==="ratio"?String(definition.unit):null,scaleLabel:definition.unit==="score_10"?"1–10 rating":definition.unit==="ordinal_4"?"Four ordered ranks":known.scale==="ordinal"?"Ordered ranks":null,
  experimentName:safeText(frozen.name,120),question:safeText(frozen.question,500),interventionLabel:interventionLabel(intervention),design:{baselineDays:days(frozen.baseline_start_date,frozen.baseline_end_date),plannedDays:days(frozen.intervention_start_date,frozen.intervention_end_date),activeDays,excludedDays,baselineStart:isLogicalDate(frozen.baseline_start_date)?frozen.baseline_start_date:null,baselineEnd:isLogicalDate(frozen.baseline_end_date)?frozen.baseline_end_date:null,experimentStart:isLogicalDate(frozen.intervention_start_date)?frozen.intervention_start_date:null,experimentEnd:isLogicalDate(frozen.intervention_end_date)?frozen.intervention_end_date:null}};
}
/** Formatting only: no arithmetic, unit conversion, or minimum decimal padding. */
export function formatResultValue(value:number|null|undefined,unit:string|null=null){
 if(value===null||value===undefined||!Number.isFinite(value))return "Unknown";
 const rounded=value.toLocaleString(undefined,{maximumFractionDigits:3});
 // Avoid displaying a small nonzero observation as an exact zero.
 const text=value!==0&&Math.abs(value)<0.0005?value.toExponential(2):rounded;
 return unit?`${text} ${unit}`:text;
}
