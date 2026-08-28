"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {Button,controlClass} from "@/components/ui/design-system";
import {goalDefinition,goalNutrients,goalOperators,goalsRequest,GoalRequestError,type GoalInput,type NutritionGoal} from "@/lib/nutrition/goals";
export function NutritionGoalForm({goal,onSaved,onCancel}:{goal?:NutritionGoal;onSaved:(goal:NutritionGoal)=>void;onCancel:()=>void}){
 const [input,setInput]=useState<GoalInput>({name:goal?.name??"",metric:goal?.metric??"protein_grams",operator:goal?.operator??"gte",amount:goal?.amount??NaN});
 const [amount,setAmount]=useState(goal?.amount?.toString()??""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);
 const lock=useRef(false),name=useRef<HTMLInputElement>(null);
 useEffect(()=>{name.current?.focus();},[]);
 async function save(e:FormEvent){
  e.preventDefault();if(lock.current||uncertain)return;
  const next={...input,amount:amount.trim()?Number(amount):NaN};
  try{goalDefinition(next);}catch{setError("Enter a name of 2–120 characters or leave it blank, and a daily amount greater than 0 and no more than 1,000,000.");return;}
  lock.current=true;setBusy(true);setError("");
  try{onSaved(await goalsRequest<NutritionGoal>("",goal?{action:"update",id:goal.id,revision:goal.revision,input:next}:{action:"create",input:next}));}
  catch(e){setError(e instanceof Error?e.message:"The goal could not be saved.");if(e instanceof GoalRequestError&&e.uncertain)setUncertain(true);}
  finally{lock.current=false;setBusy(false);}
 }
 return <form onSubmit={save} className="grid min-w-0 gap-4 rounded-xl border p-4" aria-label={goal?"Edit nutrition goal":"Create nutrition goal"}>
  <h3 className="text-lg font-semibold">{goal?"Edit Nutrition Goal":"Create Nutrition Goal"}</h3>
  <p className="text-sm">Choose your own daily target. Example: Protein ≥180 g/day is an illustration, not a recommendation.</p>
  {error?<p id="nutrition-goal-error" role="alert" className="text-sm text-red-700">{error}</p>:null}
  <fieldset disabled={busy||uncertain} className="grid min-w-0 gap-4">
   <label className="grid gap-1">Name (optional)<input ref={name} className={controlClass} maxLength={120} value={input.name} aria-describedby={error?"nutrition-goal-error":undefined} onChange={e=>setInput({...input,name:e.target.value})}/></label>
   <label className="grid gap-1">Nutrient<select className={controlClass} value={input.metric} onChange={e=>setInput({...input,metric:e.target.value as GoalInput["metric"]})}>{Object.entries(goalNutrients).map(([key,n])=><option key={key} value={key}>{n.label}</option>)}</select></label>
   <label className="grid gap-1">Goal<select className={controlClass} value={input.operator} onChange={e=>setInput({...input,operator:e.target.value as GoalInput["operator"]})}>{Object.entries(goalOperators).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label className="grid gap-1">Daily amount ({goalNutrients[input.metric].unit})<input className={controlClass} type="number" inputMode="decimal" step="any" value={amount} aria-invalid={!!error} aria-describedby={error?"nutrition-goal-error":undefined} onChange={e=>setAmount(e.target.value)}/></label>
   <p className="text-sm">{goalOperators[input.operator]} {amount||"…"} {goalNutrients[input.metric].unit} of {goalNutrients[input.metric].label.toLowerCase()} per day.</p>
   {goal?<p className="text-sm">Changes apply to future experiments. Started experiments keep their original target.</p>:null}
   <Button type="submit">{busy?"Saving…":"Save nutrition goal"}</Button>
  </fieldset>
  <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>{uncertain?"Close and check goals":"Cancel"}</Button>
 </form>;
}
