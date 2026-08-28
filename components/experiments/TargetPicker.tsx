"use client";
import { useEffect, useRef, useState } from "react";
import { Button, InlineNotice, controlClass } from "@/components/ui/design-system";
import { wizardRequest, WizardError, type Target, type TargetPage } from "@/lib/experiments/wizard-client";
export function TargetPicker({ kind, label, value, onChange }: { kind: string; label: string; value?: Target | null; onChange: (target: Target) => void }) {
  const [search,setSearch] = useState(""), [term,setTerm] = useState(""), [page,setPage] = useState<TargetPage>({ items: [], nextCursor: null }), [busy,setBusy] = useState(false), [error,setError] = useState(""), [retry,setRetry] = useState(0);
  const generation = useRef(0), loading = useRef(false);
  useEffect(() => {
    const current = ++generation.current, controller = new AbortController();
    const timer = setTimeout(() => { loading.current = true;setBusy(true);setError("");setPage({ items: [], nextCursor: null });
      void wizardRequest<TargetPage>(`targets?${new URLSearchParams({kind,search:term,limit:"20"})}`,undefined,controller.signal).then(data => { if (generation.current === current) setPage(data); }).catch(e => { if (!controller.signal.aborted) setError(e instanceof WizardError ? e.message : "Targets could not be loaded."); }).finally(() => { if (generation.current === current) { loading.current = false;setBusy(false); } });
    },0);
    return () => { clearTimeout(timer);controller.abort();generation.current=current+1; };
  },[kind,term,retry]);
  async function more() {
    if (loading.current || !page.nextCursor) return;
    loading.current = true;setBusy(true);setError("");const current = generation.current;
    try { const next = await wizardRequest<TargetPage>(`targets?${new URLSearchParams({kind,search:term,limit:"20",cursor:page.nextCursor})}`);if (generation.current === current) setPage(p => ({items:[...p.items,...next.items.filter(n=>!p.items.some(i=>i.id===n.id))],nextCursor:next.nextCursor})); }
    catch(e) { if (generation.current === current) setError(e instanceof WizardError ? e.message : "Targets could not be loaded."); }
    finally { if (generation.current === current) { loading.current = false;setBusy(false); } }
  }
  return <fieldset className="mt-4 min-w-0"><legend className="font-semibold">{label}</legend>{value?<p className="mt-2 rounded-lg bg-blue-50 p-3 text-sm">Selected: {value.label ?? "Unavailable item"}{!value.available?" — choose an available replacement":""}</p>:null}
    <div className="mt-3 flex gap-2"><label className="min-w-0 flex-1"><span className="sr-only">Search {label}</span><input type="search" maxLength={100} className={controlClass} value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();setTerm(search.trim());}}} placeholder="Search by name"/></label><Button type="button" variant="secondary" disabled={busy} onClick={()=>setTerm(search.trim())}>Search</Button></div>
    {error?<div className="mt-3"><InlineNotice>{error}</InlineNotice><Button type="button" variant="secondary" onClick={()=>setRetry(r=>r+1)}>Retry search</Button></div>:null}
    <div className="mt-3 grid gap-2" aria-busy={busy}>{page.items.map(item=><label key={`${item.identity}:${item.id}`} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50"><input type="radio" name={`target-${kind}`} checked={value?.id===item.id&&value.identity===item.identity} onChange={()=>onChange(item)}/><span className="break-words">{item.label}</span></label>)}</div>
    {busy?<p role="status" className="mt-3 text-sm">Loading options…</p>:!error&&!page.items.length?<p role="status" className="mt-3 text-sm text-slate-600">{kind==="target_rules"?"You don’t have an experiment-ready nutrition goal matching this search. Create Nutrition Goal to add one.":"No matching items. Try another search or create an item in its AXVital section."}</p>:null}
    {page.nextCursor?<Button type="button" variant="secondary" className="mt-3 w-full" disabled={busy} onClick={()=>void more()}>Load more</Button>:null}
  </fieldset>;
}
