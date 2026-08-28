import {exactKeys,isObject} from "../rules/validation.ts";
import {validateRule} from "../rules/validation.ts";
import {supportedFrozenTarget} from "./frozen-target.ts";
export const goalNutrients={calories:{label:"Calories",unit:"kcal"},protein_grams:{label:"Protein",unit:"g"},carbohydrate_grams:{label:"Carbohydrates",unit:"g"},fat_grams:{label:"Fat",unit:"g"},fiber_grams:{label:"Fiber",unit:"g"}} as const;
export const goalOperators={gte:"At least",lte:"At most",eq:"Exactly"} as const;
export type GoalInput={name:string;metric:keyof typeof goalNutrients;operator:keyof typeof goalOperators;amount:number};
export type NutritionGoal={id:string;name:string;revision:number;archived:boolean;metric:GoalInput["metric"]|null;operator:GoalInput["operator"]|null;amount:number|null;unit:string|null;summary:string;compatible:boolean};
export function goalDefinition(input:unknown){
 if(!isObject(input)||!exactKeys(input,["name","metric","operator","amount"])||typeof input.name!=="string"||(input.name.trim().length!==0&&input.name.trim().length<2)||input.name.trim().length>120||typeof input.metric!=="string"||typeof input.operator!=="string"||!Object.hasOwn(goalNutrients,input.metric)||!Object.hasOwn(goalOperators,String(input.operator))||typeof input.amount!=="number"||!Number.isFinite(input.amount)||input.amount<=0)throw new Error("INVALID_GOAL");
 const fields=input as GoalInput;
 const definition={version:1,domain:"nutrition",kind:"numeric",period:"day",metric:fields.metric,operator:fields.operator,value:fields.amount,unit:goalNutrients[fields.metric].unit};
 validateRule(definition);return definition;
}
export function goalSummary(metric:GoalInput["metric"],operator:GoalInput["operator"],amount:number){return `${goalNutrients[metric].label} ${{gte:"≥",lte:"≤",eq:"="}[operator]} ${amount.toLocaleString("en-US")} ${goalNutrients[metric].unit}/day`;}
export function projectGoal(row:{id:string;name:string;revision:number;archived_at:string|null;definition:unknown}):NutritionGoal{
 const supported=supportedFrozenTarget(row.definition),rule=supported?.rule;
 const metric=rule?.metric as GoalInput["metric"]|undefined,operator=rule?.operator as GoalInput["operator"]|undefined;
 return {id:row.id,name:row.name,revision:row.revision,archived:!!row.archived_at,metric:metric??null,operator:operator??null,amount:rule?.value??null,unit:rule?.unit??null,summary:metric&&operator?goalSummary(metric,operator,rule!.value):"This nutrition goal is not yet supported for experiment analysis.",compatible:!!supported};
}
export type GoalPage={items:NutritionGoal[];next:string|null};
export type PatternPage={items:{id:string;name:string;archived:boolean}[];next:string|null};
export class GoalRequestError extends Error{uncertain:boolean;constructor(code:string,uncertain=false){super(({AUTH_REQUIRED:"Sign in to manage nutrition goals.",INVALID_GOAL:"Check the name and enter a positive supported daily amount.",REVISION_CONFLICT:"This goal changed. Reload the list before editing again.",GOAL_NOT_FOUND:"This goal is no longer available.",RATE_LIMITED:"Please wait a minute and try again."} as Record<string,string>)[code]??(uncertain?"The save may have succeeded. Close this form and check your goals before creating another.":"Nutrition goals could not be loaded. Please try again."));this.uncertain=uncertain;}}
export async function goalsRequest<T>(query="",body?:unknown):Promise<T>{
 let response:Response;
 try{response=await fetch("/api/nutrition/goals"+query,{method:body?"POST":"GET",credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(15000),...(body?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});}
 catch{throw new GoalRequestError("UNAVAILABLE",!!body);}
 let data;try{data=await response.json();}catch{throw new GoalRequestError("UNAVAILABLE",!!body);}
 if(!response.ok)throw new GoalRequestError(data.error,!!body&&response.status>=500);
 return data as T;
}
