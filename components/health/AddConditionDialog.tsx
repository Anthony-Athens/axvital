"use client";
import { FormEvent, useMemo, useRef, useState } from "react";
import { useSheetDialog } from "@/components/ui/useSheetDialog";
import { Button, InlineNotice, controlClass } from "@/components/ui/design-system";
import { addUserCondition, filterCatalog } from "@/lib/conditions/conditions";
import type { CatalogCondition, ConditionCategory, UserCondition } from "@/lib/conditions/types";
import { createClient } from "@/lib/supabase/browser";
import { ConditionDetailsFields, type ConditionFormValues } from "./ConditionDetailsFields";
const initialDetails: ConditionFormValues = { status: "active", diagnosedOn: "", diagnosedYear: "", isPrimary: false, notes: "" };
type AddConditionDialogProps = {
    open: boolean;
    categories: ConditionCategory[];
    catalog: CatalogCondition[];
    onClose: () => void;
    onAdded: (item: UserCondition) => void;
};
export function AddConditionDialog(props: AddConditionDialogProps) {
    return props.open ? <AddConditionForm {...props}/> : null;
}
function AddConditionForm({ categories, catalog, onClose, onAdded }: AddConditionDialogProps) {
    const searchRef = useRef<HTMLInputElement>(null);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("");
    const [selected, setSelected] = useState<CatalogCondition | null>(null);
    const [customMode, setCustomMode] = useState(false);
    const [customName, setCustomName] = useState("");
    const [details, setDetails] = useState(initialDetails);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const results = useMemo(() => filterCatalog(catalog, category, search), [catalog, category, search]);
    const { overlayRef, dialogRef, closeRef } = useSheetDialog(onClose, saving);
    const submitting = useRef(false);
    function close() { if (!submitting.current)
        onClose(); }
    async function submit(event: FormEvent) { event.preventDefault(); if (submitting.current)
        return; submitting.current = true; setSaving(true); setError(""); try {
        const item = await addUserCondition(createClient(), { conditionId: selected?.id, customName: customMode ? customName : null, status: details.status, diagnosedOn: details.diagnosedOn || null, diagnosedYear: details.diagnosedYear ? Number(details.diagnosedYear) : null, isPrimary: details.isPrimary, notes: details.notes });
        onAdded(item);
        onClose();
    }
    catch (caught) {
        setError(caught instanceof Error ? caught.message : "We couldn’t add this condition.");
    }
    finally {
        submitting.current = false;
        setSaving(false);
    } }
    return <div ref={overlayRef} className="fixed inset-x-0 top-[var(--sheet-top,0px)] z-[70] flex h-[var(--sheet-vh,100dvh)] items-end justify-center bg-slate-950/45 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget)
        close(); }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="add-condition-title" tabIndex={-1} aria-describedby="add-condition-description" className="relative flex h-[calc(var(--sheet-vh,100dvh)-1rem)] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-auto sm:max-h-[calc(var(--sheet-vh,100dvh)-3rem)] sm:max-w-[44rem] sm:rounded-2xl"><div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6"><div><h2 id="add-condition-title" className="text-xl font-semibold text-slate-900">Add a condition</h2><p id="add-condition-description" className="mt-1 text-sm text-slate-600">Choose a catalog condition or add your own.</p></div><button ref={closeRef} type="button" disabled={saving} onClick={close} aria-label="Close add condition" className="grid min-h-11 min-w-11 place-items-center rounded-lg bg-slate-100 text-xl focus-visible:ring-2 focus-visible:ring-blue-600">×</button></div>
    <form onSubmit={submit} aria-busy={saving} className="flex min-h-0 flex-1 flex-col"><div data-sheet-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6"><div className="grid gap-5">{!selected && !customMode ? <><label className="grid gap-1.5 text-sm font-semibold text-slate-700">Search conditions<input ref={searchRef} type="search" className={controlClass} placeholder="Try MS, Sleep Apnea, or IBS" value={search} onChange={(event) => setSearch(event.target.value)}/></label><div><p className="text-sm font-semibold text-slate-700">Filter by category</p><div className="mt-2 flex gap-2 overflow-x-auto pb-2" aria-label="Condition categories"><button type="button" onClick={() => setCategory("")} aria-pressed={!category} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${!category ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>All</button>{categories.map((item) => <button key={item.id} type="button" onClick={() => setCategory(item.id)} aria-pressed={category === item.id} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${category === item.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>{item.name}</button>)}</div></div><div aria-live="polite" className="sr-only">{results.length} matching conditions</div><div className="rounded-xl border border-slate-200">{results.length ? results.map((item) => <button key={item.id} type="button" onClick={() => setSelected(item)} className="flex min-h-14 w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"><span><span className="block font-semibold text-slate-900">{item.name}{item.short_name ? ` (${item.short_name})` : ""}</span><span className="block text-sm text-slate-500">{item.category?.name}</span></span><span aria-hidden="true">→</span></button>) : <div className="p-6 text-center"><p className="font-semibold text-slate-900">No matching conditions found</p><p className="mt-1 text-sm text-slate-600">Try another search or add a custom condition.</p></div>}</div><button type="button" onClick={() => setCustomMode(true)} className="min-h-11 text-left text-sm font-semibold text-blue-700">Condition not listed? Add a custom condition</button></> : <><div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{customMode ? "Custom condition" : "Selected condition"}</p>{customMode ? <label className="mt-2 grid gap-1.5 text-sm font-semibold text-slate-700">Condition name<input ref={searchRef} className={controlClass} maxLength={120} value={customName} onChange={(event) => setCustomName(event.target.value)}/></label> : <p className="mt-1 font-semibold text-slate-900">{selected?.name}</p>}<button type="button" onClick={() => { setSelected(null); setCustomMode(false); }} className="mt-2 min-h-11 text-sm font-semibold text-blue-700">Choose a different condition</button></div><ConditionDetailsFields values={details} onChange={setDetails}/></>}{error ? <div role="alert"><InlineNotice>{error}</InlineNotice></div> : null}</div></div>{selected || customMode ? <div className="safe-bottom flex shrink-0 gap-2 border-t border-slate-200 bg-white px-5 pb-3 pt-3 sm:justify-end sm:px-6"><Button type="button" variant="secondary" disabled={saving} onClick={close}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Add condition"}</Button></div> : null}</form></div></div>;
}
