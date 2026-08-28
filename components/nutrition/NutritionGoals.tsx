"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {Button,ButtonLink,PageContainer,PageHeader,Surface,controlClass} from "@/components/ui/design-system";
import {NutritionGoalForm} from "./NutritionGoalForm";
import {goalsRequest,type GoalPage,type NutritionGoal,type PatternPage} from "@/lib/nutrition/goals";
export function NutritionGoals(){
 const [status,setStatus]=useState("active"),[page,setPage]=useState<GoalPage>({items:[],next:null}),[patterns,setPatterns]=useState<PatternPage>({items:[],next:null});
 const [editor,setEditor]=useState<NutritionGoal|"new"|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const generation=useRef(0),mutation=useRef(false),heading=useRef<HTMLHeadingElement>(null);
 const load=useCallback(async()=>{
  const g=++generation.current;setBusy(true);setError("");setPage({items:[],next:null});setPatterns({items:[],next:null});
  try{const [goals,p]=await Promise.all([goalsRequest<GoalPage>("?status="+status),goalsRequest<PatternPage>("?kind=patterns&status="+status)]);if(g===generation.current){setPage(goals);setPatterns(p);}}
  catch(e){if(g===generation.current)setError(e instanceof Error?e.message:"Unable to load goals.");}
  finally{if(g===generation.current)setBusy(false);}
 },[status]);
 useEffect(()=>{const state=generation,timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);state.current++;};},[load]);
 async function more(kind:"targets"|"patterns"){
  if(busy)return;const g=generation.current,after=kind==="targets"?page.next:patterns.next;if(!after)return;setBusy(true);
  try{if(kind==="targets"){const next=await goalsRequest<GoalPage>(`?status=${status}&after=${after}`);if(g===generation.current)setPage(p=>({items:[...p.items,...next.items.filter(n=>!p.items.some(i=>i.id===n.id))],next:next.next}));}
   else{const next=await goalsRequest<PatternPage>(`?kind=patterns&status=${status}&after=${after}`);if(g===generation.current)setPatterns(p=>({items:[...p.items,...next.items.filter(n=>!p.items.some(i=>i.id===n.id))],next:next.next}));}}
  catch(e){if(g===generation.current)setError(e instanceof Error?e.message:"Unable to load goals.");}finally{if(g===generation.current)setBusy(false);}
 }
 async function archive(goal:NutritionGoal){
  if(mutation.current)return;mutation.current=true;setBusy(true);setError("");
  try{await goalsRequest("",{action:goal.archived?"restore":"archive",id:goal.id,revision:goal.revision});setNotice(goal.archived?"Goal restored.":"Goal archived. Started experiments and results are unchanged.");await load();heading.current?.focus();}
  catch(e){setError(e instanceof Error?e.message:"Unable to update goal.");}finally{mutation.current=false;setBusy(false);}
 }
 function close(message=""){setEditor(null);setNotice(message);void load();requestAnimationFrame(()=>heading.current?.focus());}
 return <PageContainer narrow><ButtonLink href="/health/nutrition" variant="tertiary">← Nutrition tracking</ButtonLink><PageHeader title="Nutrition Goals" description="Manage measurable daily targets to reuse in experiments."/>
 <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold">Targets</h2>
 {notice?<p role="status" className="my-3">{notice}</p>:null}
 {error?<div className="my-3"><p role="alert">{error}</p><Button onClick={()=>void load()}>Reload goals</Button></div>:null}
 {editor?<NutritionGoalForm goal={editor==="new"?undefined:editor} onSaved={()=>close("Nutrition goal saved.")} onCancel={()=>close()}/>:<>
 <div className="my-4 flex flex-wrap items-end gap-3"><label className="grid gap-1">Status<select className={controlClass} value={status} disabled={busy} onChange={e=>setStatus(e.target.value)}><option value="active">Active</option><option value="archived">Archived</option></select></label><Button onClick={()=>setEditor("new")} disabled={busy}>Create Nutrition Goal</Button></div>
 {busy?<p role="status">Loading goals…</p>:!error&&!page.items.length?<p>{status==="active"?"Create a nutrition goal to track a measurable daily target and use it in experiments.":"No archived nutrition goals."}</p>:null}
 <div className="grid gap-3">{page.items.map(goal=><Surface key={goal.id}><h3 className="break-words text-lg font-semibold">{goal.name}</h3><p className="break-words">{goal.summary}</p><p className="text-sm">{goal.archived?"Archived":"Active"} · {goal.compatible?"Supported in Experiments":"Not yet supported for experiment analysis"}</p><div className="mt-3 flex flex-wrap gap-3">{goal.compatible&&!goal.archived?<Button disabled={busy} variant="secondary" onClick={()=>setEditor(goal)}>Edit {goal.name}</Button>:null}<Button disabled={busy} variant="secondary" onClick={()=>void archive(goal)}>{goal.archived?"Restore":"Archive"} {goal.name}</Button></div></Surface>)}</div>
 {page.next?<Button disabled={busy} onClick={()=>void more("targets")}>Load more targets</Button>:null}
 <Surface className="mt-6"><h2 className="text-xl font-semibold">Eating Patterns</h2><p className="my-2">Eating Patterns are coming next. For experiments today, use measurable nutrition targets.</p><p className="text-sm">Existing patterns are read-only here and are not yet supported for experiment analysis.</p>{patterns.items.map(p=><p key={p.id} className="mt-3 break-words">{p.name} · {p.archived?"Archived":"Active"} · Not yet supported for experiment analysis</p>)}{patterns.next?<Button disabled={busy} onClick={()=>void more("patterns")}>Load more patterns</Button>:null}</Surface></>}
 </PageContainer>;
}
