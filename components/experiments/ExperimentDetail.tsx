"use client";
import { ExperimentV2Status } from "./ExperimentV2Status";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ButtonLink, InlineNotice, LoadingSkeleton, PageContainer, PageHeader, Surface } from "@/components/ui/design-system";
import { getExperiment, transitionExperiment, type Experiment } from "@/lib/experiments/experiments";
import { createClient } from "@/lib/supabase/browser";
export function ExperimentDetail({ id }: {
    id: string;
}) { const generation=useRef(0);const [x, setX] = useState<Experiment | null>(null), [error, setError] = useState(""), [working, setWorking] = useState(false); const load = useCallback(async () => { const request=++generation.current;setError("");try {
    const next=await getExperiment(createClient(), id);if(request===generation.current)setX(next);
}
catch (e) {
    if(request===generation.current)setError(e instanceof Error ? e.message : "Unable to load experiment.");
} }, [id]); useEffect(() => {const requests=generation;const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);requests.current++;}; }, [load]); async function act(action: string) { if (["end_early", "abandon"].includes(action) && !confirm(`${action === "abandon" ? "Abandon" : "End early"} ${x?.name}? Your data will be preserved.`))
    return; setWorking(true); setError(""); try {
    await transitionExperiment(createClient(), id, action);
    await load();
}
catch (e) {
    setError(e instanceof Error ? e.message : "Transition failed.");
}
finally {
    setWorking(false);
} } if (!x||x.id!==id)
    return <PageContainer narrow>{error ? <><InlineNotice>{error}</InlineNotice><Button onClick={()=>void load()}>Retry</Button></> : <LoadingSkeleton className="h-72"/>}</PageContainer>; if ((x as Experiment & {
    model_version?: number;
}).model_version===2)
    return <ExperimentV2Status experiment={x}/>; const actions = x.status === "draft" ? ["activate", "abandon"] : x.status === "active" ? [...(x.current_phase === "baseline" ? ["start_intervention"] : []), "pause", "complete", "end_early", "abandon"] : x.status === "paused" ? ["resume", "end_early", "abandon"] : []; return <PageContainer narrow><ButtonLink href="/experiments" variant="tertiary" className="mb-3 -ml-4">← Experiments</ButtonLink><PageHeader eyebrow={`Phase: ${x.current_phase}`} title={x.name} description={x.hypothesis}/>{error ? <div className="mt-4"><InlineNotice>{error}</InlineNotice></div> : null}<Surface className="mt-6"><h2 className="font-semibold">Study plan</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2"><div><dt className="text-sm text-slate-500">Status</dt><dd className="font-semibold capitalize">{x.status.replaceAll("_", " ")}</dd></div><div><dt className="text-sm text-slate-500">Design</dt><dd className="font-semibold">{x.study_design === "baseline_intervention" ? "Baseline then intervention" : "Intervention only"}</dd></div><div><dt className="text-sm text-slate-500">Intervention</dt><dd className="font-semibold">{x.interventions?.[0]?.name ?? "Not configured"}</dd></div><div><dt className="text-sm text-slate-500">Primary outcome</dt><dd className="font-semibold">{x.outcomes?.find(o => o.outcome_role === "primary")?.name ?? "Not configured"}</dd></div></dl></Surface><Surface className="mt-4"><h2 className="font-semibold">Lifecycle actions</h2><div className="mt-3 flex flex-wrap gap-2">{actions.map(a => <Button key={a} disabled={working} variant={["abandon", "end_early"].includes(a) ? "destructive" : "secondary"} onClick={() => void act(a)} aria-label={`${a.replaceAll("_", " ")} ${x.name} experiment`}>{a.replaceAll("_", " ")}</Button>)}{["completed", "ended_early"].includes(x.status) ? <ButtonLink href={`/experiments/${x.id}/results`}>View results</ButtonLink> : null}</div></Surface><Surface className="mt-4"><h2 className="font-semibold">Experiment timeline</h2><ol className="mt-3 space-y-3">{x.phase_events?.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).map(e => <li key={e.id} className="border-l-2 border-blue-200 pl-3"><p className="text-sm font-semibold capitalize">{e.event_type.replaceAll("_", " ")}</p><p className="text-xs text-slate-500">{new Date(e.occurred_at).toLocaleString()}</p></li>)}</ol></Surface></PageContainer>; }
