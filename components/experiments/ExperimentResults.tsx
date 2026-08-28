"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {ResultsView,type RevisionData,type ResultsDTO} from "./ResultsView";
import {ResultsRequestState,reconcileCapture} from "../../lib/experiments/results-client";
import {ButtonLink,PageContainer} from "../ui/design-system";
type Failure=Error&{status?:number};
async function json<T>(url:string,init:RequestInit):Promise<T>{const response=await fetch(url,{...init,cache:"no-store"});if(!response.ok){const error=new Error(response.status===401?"Please sign in to read your results.":response.status===404?"This experiment or analysis revision was not found.":response.status===429?"Too many requests. Wait a minute before refreshing.":response.status===409?"The study or analysis revision changed, or capture is unavailable. Refresh authoritative state before continuing.":"Results are temporarily unavailable. The required durable-evidence infrastructure may be unavailable.") as Failure;error.status=response.status;throw error;}return response.json();}
export function ExperimentResults({id}:{id:string}) {
 const gate=useRef(new ResultsRequestState()),mounted=useRef(false),abort=useRef<AbortController|null>(null),attempt=useRef<{before:number;uncertain:boolean}|null>(null);
 const [data,setData]=useState<RevisionData|null>(null),[result,setResult]=useState<ResultsDTO|null>(null),[selected,setSelected]=useState<number|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[locked,setLocked]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const read=useCallback(async(revision?:number)=>{
   const token=gate.current.beginRead();abort.current?.abort();const control=new AbortController();abort.current=control;setLoading(true);setResult(null);setError("");
   try {
     const meta=await json<RevisionData>(`/api/experiments/v2/results/revisions?id=${id}`,{signal:control.signal});if(!gate.current.current(token))return;
     if(attempt.current){const outcome=reconcileCapture(attempt.current,meta.latestRevision);if(outcome==="retained"){setNotice(`Revision ${meta.latestRevision} is now retained. Select it to inspect the authoritative result.`);attempt.current=null;gate.current.releaseMutation();setLocked(false);}else if(outcome==="not_created"){attempt.current=null;gate.current.releaseMutation();setLocked(false);}else{setNotice("No new revision has been confirmed yet. Do not repeat the capture while its outcome is uncertain; refresh capture status.");}}
     const chosen=revision??meta.latestRevision;setSelected(chosen||null);
     // Fetch older metadata pages only on explicit selection or a deep link.
     let merged=meta;
     while(chosen&&!merged.revisions.some(r=>r.revision===chosen)&&merged.nextBefore!==null){const page=await json<RevisionData>(`/api/experiments/v2/results/revisions?id=${id}&before=${merged.nextBefore}`,{signal:control.signal});merged={...merged,revisions:[...merged.revisions,...page.revisions],nextBefore:page.nextBefore};}
     if(!gate.current.current(token))return;setData(merged);
     if(chosen){const value=await json<ResultsDTO>(`/api/experiments/v2/results?id=${id}&revision=${chosen}`,{signal:control.signal});if(!gate.current.current(token))return;if(value.analysisRevision!==chosen)throw new Error("The returned revision did not match the requested revision.");setResult(value);window.history.replaceState(null,"",`${window.location.pathname}?revision=${chosen}`);setTimeout(()=>document.getElementById("analysis-heading")?.focus(),0);}
   }catch(e){if(gate.current.current(token)&&!control.signal.aborted)setError(e instanceof Error?e.message:"Unable to read results.");}
   finally{if(gate.current.current(token))setLoading(false);}
 },[id]);
 useEffect(()=>{mounted.current=true;const query=new URLSearchParams(window.location.search).get("revision"),revision=query&&/^[1-9]\d?$/.test(query)&&Number(query)<=32?Number(query):undefined;const timer=setTimeout(()=>void read(revision),0);const state=gate.current;return()=>{mounted.current=false;clearTimeout(timer);state.invalidate();abort.current?.abort();};},[read]);
 async function generate(){
   if(!data?.canCapture||!gate.current.beginMutation())return;
   setBusy(true);setLocked(true);setError("");setNotice("");attempt.current={before:data.latestRevision,uncertain:true};
   try{const value=await json<ResultsDTO>("/api/experiments/v2/results",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,expectedAnalysisRevision:data.latestRevision,expectedLifecycleRevision:data.lifecycleRevision}),signal:AbortSignal.timeout(60000)});if(mounted.current)await read(value.analysisRevision);}
   catch(e){if(!mounted.current)return;if(attempt.current)attempt.current.uncertain=(e as Failure).status===undefined||((e as Failure).status??0)>=500;setNotice((e as Failure).status===409?"Capture conflict or unavailable state. Authoritative revisions are being refreshed; no mutation was retried.":"Capture was not confirmed. Checking retained revisions before any further action; no mutation was retried.");await read();}
   finally{if(mounted.current)setBusy(false);}
 }
 async function older(){if(!data?.nextBefore)return;const token=gate.current.generation;try{const page=await json<RevisionData>(`/api/experiments/v2/results/revisions?id=${id}&before=${data.nextBefore}`,{signal:abort.current?.signal});if(gate.current.current(token))setData({...data,revisions:[...data.revisions,...page.revisions.filter(r=>!data.revisions.some(old=>old.revision===r.revision))],nextBefore:page.nextBefore});}catch{if(gate.current.current(token))setError("Unable to load older revision metadata. Retry safely.");}}
 return <PageContainer narrow><ButtonLink href="/experiments" variant="tertiary">← Experiments</ButtonLink>{data?<ResultsView data={data} result={result?.analysisRevision===selected?result:null} selected={selected} onSelect={n=>{setSelected(n);setResult(null);void read(n);}} onGenerate={()=>void generate()} onOlder={()=>void older()} busy={busy} loading={loading} locked={locked} error={error} notice={notice}/>:<p role={error?"alert":"status"}>{error||"Loading results preparation…"}</p>}{!busy?<button className="mt-4 rounded-lg border px-4 py-3" onClick={()=>void read(selected??undefined)}>{locked?"Refresh capture status":"Refresh results"}</button>:null}</PageContainer>;
}
