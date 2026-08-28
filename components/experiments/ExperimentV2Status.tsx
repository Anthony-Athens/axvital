"use client";
import { ButtonLink, PageContainer, PageHeader, Surface } from "@/components/ui/design-system";
import type { Experiment } from "@/lib/experiments/experiments";
import { ActiveStudyStatus } from "./ActiveStudyStatus";
import { ExperimentResults } from "./ExperimentResults";
export function ExperimentV2Status({ experiment:x }: { experiment: Experiment & { question?: string|null; baseline_mode?: string|null; config_revision?:number } }) {
  if(["completed","ended_early","abandoned","archived"].includes(x.status))return <ExperimentResults key={x.id} id={x.id}/>;
  if(x.status!=="draft")return <ActiveStudyStatus id={x.id} revision={x.config_revision}/>;
  return <PageContainer narrow><ButtonLink href="/experiments" variant="tertiary">← Your experiments</ButtonLink><PageHeader eyebrow={`Experiments 2.0 · ${x.status.replaceAll("_"," ")}`} title={x.name} description={x.question??x.hypothesis}/>
    <Surface className="mt-5"><h2 className="text-lg font-semibold">Your experiment plan</h2><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">{[["Status",x.status],["Current phase",x.current_phase],["Changing",x.interventions?.[0]?.name??"Not configured"],["Measuring",x.outcomes?.find(o=>o.outcome_role==="primary")?.name??"Not configured"],["Baseline",x.baseline_mode??"Not configured"],["Baseline dates",`${x.baseline_start_date??"—"} – ${x.baseline_end_date??"—"}`],["Experiment dates",`${x.intervention_start_date??"—"} – ${x.intervention_end_date??"—"}`]].map(([label,value])=><div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>)}</dl></Surface>
    {x.status==="draft"?<ButtonLink className="mt-4" href={`/experiments/${x.id}/edit`}>Review draft</ButtonLink>:<p className="mt-4 text-sm text-slate-600">The configuration captured at start is authoritative. Your earlier readiness check was a preview, not a frozen record. Lifecycle controls and new results analysis are not available in this flow yet.</p>}
  </PageContainer>;
}
