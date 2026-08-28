"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, ButtonLink, EmptyState, InlineNotice, LoadingSkeleton, PageContainer, PageHeader } from "@/components/ui/design-system";
import { listExperiments, type Experiment } from "@/lib/experiments/experiments";
import { createClient } from "@/lib/supabase/browser";
export function ExperimentsHome() {
  const [rows,setRows]=useState<(Experiment&{model_version?:number})[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false);
  const load=useCallback(async()=>{setLoading(true);setError(false);try{setRows(await listExperiments(createClient()));}catch{setError(true);}finally{setLoading(false);}},[]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
  return <PageContainer><PageHeader eyebrow="Personal evidence" title="Experiments" description="Choose a goal, a measurement and one change. Compare your own tracked observations." actions={<ButtonLink href="/experiments/new">Create experiment</ButtonLink>}/>
    <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">Explore Experiments 2.0 for free. Premium unlocks baseline checks, saving and starting. Your existing experiments remain accessible. Comparisons do not establish causation or provide medical advice.</p>
    <section className="mt-8" aria-labelledby="experiments-title"><h2 id="experiments-title" className="text-xl font-semibold">Your experiments</h2>{error?<div className="mt-3"><InlineNotice>We couldn’t load your experiments.</InlineNotice><Button onClick={()=>void load()} variant="secondary">Retry</Button></div>:null}
      {loading?<div className="mt-3 grid gap-3 sm:grid-cols-2"><LoadingSkeleton/><LoadingSkeleton/></div>:rows.length?<div className="mt-3 grid gap-3 sm:grid-cols-2">{rows.map(x=><Link key={x.id} href={x.model_version===2&&x.status==="draft"?`/experiments/${x.id}/edit`:`/experiments/${x.id}`} className="rounded-xl border border-slate-200 bg-white p-4 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><div className="flex justify-between gap-3"><h3 className="font-semibold">{x.name}</h3><span className="text-sm capitalize text-blue-700">{x.status.replaceAll("_"," ")}</span></div><p className="mt-2 line-clamp-2 text-sm text-slate-600">{x.hypothesis}</p><p className="mt-3 text-xs font-semibold uppercase text-slate-500">{x.model_version===2?"Experiments 2.0":"Legacy experiment"} · Phase: {x.current_phase}</p></Link>)}</div>:!error?<div className="mt-3"><EmptyState title="Start with one question" description="See what measurements are available, then choose one saved change to explore." action={<ButtonLink href="/experiments/new">Explore an experiment</ButtonLink>}/></div>:null}
    </section></PageContainer>;
}
