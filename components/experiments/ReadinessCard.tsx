"use client";
import { Button, Surface } from "@/components/ui/design-system";
import type { ReadinessResult } from "@/lib/measurements/readiness-policies";
import { readinessPresentation } from "@/lib/experiments/wizard-client";
export function ReadinessCard({ result, busy, onRetry, stale=false, unavailable=false, disabled=false }: { result: ReadinessResult | null; busy: boolean; onRetry: () => void; stale?:boolean; unavailable?:boolean; disabled?:boolean }) {
  const display = result ? readinessPresentation(result) : null;
  return <Surface className="mt-4" aria-busy={busy}><h3 className="font-semibold" aria-live="polite">{busy?"Checking your existing data…":stale?"Your existing-data check is out of date":unavailable?"Unable to check your existing data":display?.title??"Your existing data"}</h3>
    {stale?<p className="mt-2 text-sm">Your selections changed, so AXVital is checking the current plan again.</p>:null}
    {unavailable?<p className="mt-2 text-sm">This is a technical issue, not a lack of tracking.</p>:null}
    {!busy&&display?<><ul className="mt-3 space-y-2 text-sm">{display.facts.map(f=><li key={f}>{f}</li>)}</ul><ul className="mt-3 space-y-2 text-sm text-slate-600">{display.warnings.map(w=><li key={w}>{w}</li>)}</ul><p className="mt-3 text-xs text-slate-500">Preview checked {new Date(result!.evaluatedAt).toLocaleString()}</p></>:null}
    {(unavailable||result?.queryCompleteness!=="complete")?<Button type="button" variant="secondary" className="mt-3" disabled={busy||disabled} onClick={onRetry}>Check again</Button>:null}
  </Surface>;
}
