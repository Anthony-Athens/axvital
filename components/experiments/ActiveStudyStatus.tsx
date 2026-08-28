"use client";
import { useEffect, useState } from "react";
import { Button, ButtonLink, InlineNotice, LoadingSkeleton, PageContainer, PageHeader, Surface } from "@/components/ui/design-system";
import { studyHealthExplanation, type StudyStatus } from "@/lib/experiments/study-health";
import { wizardRequest } from "@/lib/experiments/wizard-client";

export function StudyStatusView({data:d}:{data:StudyStatus}) {
  const p=d.period;
  return <><PageHeader eyebrow={`Experiments 2.0 · ${d.status.replaceAll("_"," ")} · ${d.phase}`} title={d.name??"Your experiment"} description={d.question}/>
    <Surface className="mt-4 min-w-0 break-words"><h2 className="text-lg font-semibold">Study timeline</h2>
      {p?<><p className="mt-2">{p.day===0?"Study period has not begun":`Study day ${p.day} of ${p.total}`} · {p.elapsed} completed calendar days ({p.percent}%)</p><progress className="mt-3 w-full" max={p.total} value={p.elapsed} aria-label={`${p.elapsed} of ${p.total} calendar days elapsed`}/><p className="mt-2 text-sm">Start: {p.start} · Expected end: {p.end} · Timezone: {d.timezone}</p>{p.ended?<p className="mt-2 text-sm">The planned period has ended. Backend status remains {d.status.replaceAll("_"," ")}; no completion or results transition is inferred.</p>:null}</>:<p>Study dates or timezone are unavailable.</p>}
      <p className="mt-2 text-sm">Calendar progress is not adherence, outcome completeness or a result. Paused time is not subtracted.</p>
    </Surface>
    <Surface className="mt-4"><h2 className="text-lg font-semibold">Study Health: {d.health}</h2><p className="mt-2 text-sm">{studyHealthExplanation}</p><p className="mt-2 text-xs text-slate-500">Checked {d.checkedAt}. Current-record preview, not a frozen analytical result.</p></Surface>
    <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
      <Surface className="min-w-0 break-words"><h2 className="text-lg font-semibold">Intervention exposure</h2><p className="mt-2 font-semibold">{d.intervention.name}</p><p className="mt-2">{d.exposure.state==="unknown"?"Unknown / insufficient evidence":d.exposure.state==="adherent"?"Adherent":"Non-adherent"}</p>
        {d.exposure.eligible!==null?<p className="mt-2 text-sm">{d.exposure.eligible} eligible opportunities · {d.exposure.completed} adherent · {d.exposureEvidence?.nonAdherentCount??d.exposure.skipped} non-adherent · {d.exposure.unknown} unknown</p>:null}<p className="mt-2 text-sm">{d.exposure.reason}</p><ul className="mt-3 space-y-1 text-sm">{d.intervention.criteria.map(c=><li key={c}>{c}</li>)}</ul>
        {d.exposureEvidence?<details className="mt-3 text-sm"><summary className="min-h-11 cursor-pointer py-3">Exposure evidence details</summary><p>Evidence: {d.exposureEvidence.evidenceCompleteness.replaceAll("_"," ")} · Source integrity: {d.exposureEvidence.sourceIntegrity.replaceAll("_"," ")}</p><p className="mt-2">Phase: {d.exposureEvidence.phase} · Denominator: {d.exposureEvidence.denominator.replaceAll("_"," ")}</p><ol className="mt-3 space-y-2">{d.exposureEvidence.opportunities.map((o,i)=><li key={`${o.date}:${i}`}><span className="font-semibold">{o.date}: {o.state}</span><p>{o.reason}</p></li>)}</ol></details>:null}
      </Surface>
      <Surface className="min-w-0 break-words"><h2 className="text-lg font-semibold">Outcome completeness</h2><p className="mt-2 font-semibold">{d.outcome.name}</p><p className="mt-2">{d.completeness.state==="complete"?"Complete data for evaluated days":d.completeness.state==="missing"?"Missing confirmed data":"Unknown / unsupported cadence"}</p><p className="mt-2 text-sm">Captured: {d.completeness.captured??"unknown"} {d.completeness.unit} · Expected: {d.completeness.expected??"unknown"} · Missing: {d.completeness.missing??"unknown"}</p><p className="mt-2 text-sm">{d.completeness.reason}</p><p className="mt-2 text-sm">Completed study days only. Today&apos;s unfinished collection is not counted as missing.</p></Surface>
    </div>
    {d.status==="active"?<Surface className="mt-4"><h2 className="text-lg font-semibold">Today / current requirements</h2><p className="mt-2 text-sm">{d.exposure.today}</p><p className="mt-2 text-sm">Review today&apos;s outcome capture in the existing tracker; no daily requirement is assumed for event or workout outcomes.</p><div className="mt-3 flex flex-wrap gap-3"><ButtonLink href={d.intervention.href} variant="secondary">Open intervention tracker</ButtonLink><ButtonLink href={d.outcome.href} variant="secondary">Open outcome tracker</ButtonLink></div></Surface>:null}
    <div className="mt-4"><InlineNotice tone="info">{d.snapshotMessage}</InlineNotice></div><p className="mt-4 text-sm">Lifecycle actions and final experiment results are not available here.</p>
  </>;
}
export function ActiveStudyStatus({id,revision}:{id:string;revision?:number}) {
  const [attempt,setAttempt]=useState(0),[state,setState]=useState<{key:string;data?:StudyStatus;error?:string}|null>(null);
  const key=`${id}:${revision??""}:${attempt}`;
  useEffect(()=>{
    let current=true;const abort=new AbortController();
    void wizardRequest<StudyStatus>(`status?id=${encodeURIComponent(id)}`,undefined,abort.signal).then(data=>{if(current){if(data.id!==id)throw new Error("MISMATCH");setState({key,data});}}).catch(()=>{if(current)setState({key,error:"We couldn’t refresh this experiment. No previous study-health preview is shown as current."});});
    const refresh=()=>setAttempt(n=>n+1),timer=setTimeout(refresh,60000);window.addEventListener("focus",refresh);
    return()=>{current=false;abort.abort();clearTimeout(timer);window.removeEventListener("focus",refresh);};
  },[id,key]);
  const current=state?.key===key?state:null;
  return <PageContainer narrow><ButtonLink href="/experiments" variant="tertiary">← Your experiments</ButtonLink><div aria-live="polite">{current?.data?<StudyStatusView data={current.data}/>:current?.error?<InlineNotice>{current.error}</InlineNotice>:<><p role="status">Loading current study status…</p><LoadingSkeleton className="h-72"/></>}</div><Button className="mt-4" variant="secondary" onClick={()=>setAttempt(n=>n+1)}>Refresh status / retry</Button></PageContainer>;
}
