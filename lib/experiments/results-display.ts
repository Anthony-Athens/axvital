import type {AnalysisInput} from "./analysis-contract.ts";
import {measurement} from "../measurements/registry.ts";
import {isObject} from "../rules/validation.ts";

/** Presentation-only v1, independent of immutable analysis policy/digest versions.
 * Values come from the retained definition, never question text or current labels.
 */
export type ResultsDisplay={version:1;outcomeLabel:string;unit:string|null;scaleLabel:string|null};
export function retainedResultsDisplay(input:AnalysisInput):ResultsDisplay {
 const fallback:ResultsDisplay={version:1,outcomeLabel:"Outcome",unit:null,scaleLabel:null};
 const outcomes=input.startSnapshot?.configuration.outcomes;
 if(!Array.isArray(outcomes))return fallback;
 const primary=outcomes.filter(o=>isObject(o)&&o.outcome_role==="primary");
 if(primary.length!==1||!isObject(primary[0].definition))return fallback;
 const definition=primary[0].definition,known=measurement(String(primary[0].registry_key),Number(primary[0].registry_version));
 if(!known?.enabled||definition.key!==known.key||definition.version!==known.version||definition.unit!==known.unit||definition.scale!==known.scale)return fallback;
 const label=typeof definition.label==="string"&&definition.label.length<=160&&!/[\x00-\x1f]/.test(definition.label)?definition.label:"Outcome";
 return {version:1,outcomeLabel:label,unit:known.scale==="ratio"?String(definition.unit):null,scaleLabel:definition.unit==="score_10"?"1–10 rating":definition.unit==="ordinal_4"?"Four ordered ranks":known.scale==="ordinal"?"Ordered ranks":null};
}
/** Formatting only: no arithmetic, unit conversion, or minimum decimal padding. */
export function formatResultValue(value:number|null|undefined,unit:string|null=null){
 if(value===null||value===undefined||!Number.isFinite(value))return "Unknown";
 const rounded=value.toLocaleString(undefined,{maximumFractionDigits:3});
 // Avoid displaying a small nonzero observation as an exact zero.
 const text=value!==0&&Math.abs(value)<0.0005?value.toExponential(2):rounded;
 return unit?`${text} ${unit}`:text;
}
