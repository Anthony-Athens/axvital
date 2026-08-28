"use client";
import { Button, Surface } from "@/components/ui/design-system";
import type { ReadinessResult } from "@/lib/measurements/readiness-policies";
import { readinessPresentation } from "@/lib/experiments/wizard-client";
export function ReadinessCard({ result, busy, onRetry, stale=false, unavailable=false, disabled=false }: { result: ReadinessResult | null; busy: boolean; onRetry: () => void; stale?:boolean; unavailable?:boolean; disabled?:boolean }) {
  const display = result ? readinessPresentation(result) : null;
  return <Surface className="mt-4" aria-busy={busy}><h3 className="font-semibold" aria-live="polite">{busy?"Checking your baseline…":stale?"Baseline configuration changed":unavailable?"Baseline check unavailable":display?.title??"Check your recent tracked data"}</h3>
    {stale?<p className="mt-2 text-sm">Your previous preview no longer applies. Check this configuration again.</p>:null}
    {unavailable?<p className="mt-2 text-sm">This is a technical issue, not insufficient history. Please retry.</p>:null}
    {!busy&&display?<><ul className="mt-3 space-y-2 text-sm">{display.facts.map(f=><li key={f}>{f}</li>)}</ul><ul className="mt-3 space-y-2 text-sm text-slate-600">{display.warnings.map(w=><li key={w}>{w}</li>)}</ul><p className="mt-3 text-xs text-slate-500">Preview checked {new Date(result!.evaluatedAt).toLocaleString()}</p></>:null}
    <Button type="button" variant="secondary" className="mt-3" disabled={busy||disabled} onClick={onRetry}>{result?.queryCompleteness!=="complete"?"Check baseline / retry":"Refresh baseline"}</Button>
  </Surface>;
}
