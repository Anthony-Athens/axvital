"use client";

import { useEffect, useRef, useState } from "react";
import { useSheetDialog } from "@/components/ui/useSheetDialog";
import { supabase } from "@/lib/supabase/client";
import { ingestHealthEvents } from "@/lib/health-events/ingestion";
import { eventTypes, MAX_SECONDS, reviewedInputs, type VoiceCandidate, type VoiceEvent } from "@/lib/voice/schema";
import { VoiceRecorder } from "@/lib/voice/recording";
import { voiceErrorMessage } from "@/lib/voice/errors";
import { trackProduct } from "@/lib/telemetry/client";
import { FoodReview } from "./FoodReview";
import { provisionalFood } from "@/lib/nutrition/food-resolution";
import { nutritionDraft, type NutritionDraft } from "@/lib/nutrition/voice-nutrition";
import { logVoiceNutrition } from "@/lib/nutrition/ingestion";
import { VoiceNutritionReview } from "./VoiceNutritionReview";

type Phase = "idle" | "permission" | "recording" | "processing" | "review" | "saving" | "error";
const control = "min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus-visible:ring-2 focus-visible:ring-blue-600";
const button = "min-h-12 min-w-12 rounded-lg px-4 py-2 font-semibold focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50";

export function VoiceLogDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [ready, setReady] = useState(false);
  const [candidates, setCandidates] = useState<VoiceCandidate[]>([]);
  const [uncertain, setUncertain] = useState(false);
  const [retryChecked, setRetryChecked] = useState(false);
  const [matchingCount, setMatchingCount] = useState(0);
  const [recorder] = useState(() => new VoiceRecorder());
  const owner = useRef("");
  const requestId = useRef("");
  const phaseRef = useRef<Phase>("idle");
  const mounted = useRef(true);
  const run = useRef(0);
  const started = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  const transition = (next: Phase) => { phaseRef.current = next; setPhase(next); };
  function cancel() {
    if (phaseRef.current === "saving") return;
    run.current++; recorder.cancel(); controller.current?.abort();
    trackProduct("Voice Log Abandoned"); close.current();
  }
  const { overlayRef, dialogRef, closeRef } = useSheetDialog(cancel, phase === "saving", { boundMobileViewport: true });

  useEffect(() => {
    mounted.current = true;
    run.current++;
    let active = true;
    trackProduct("Voice Log Opened");
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user) { setMessage(voiceErrorMessage("AUTH_REQUIRED")); return; }
      owner.current = data.user.id; setReady(true);
    }).catch(() => { if (active) setMessage(voiceErrorMessage("AUTH_REQUIRED")); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (owner.current && session?.user.id !== owner.current) {
        owner.current = ""; run.current++; recorder.cancel(); controller.current?.abort(); close.current();
      }
    });
    return () => {
      active = false; mounted.current = false; recorder.cancel(); controller.current?.abort(); data.subscription.unsubscribe();
    };
  }, [recorder]);

  useEffect(() => {
    if (phase !== "recording" && phase !== "permission") return;
    const interrupt = () => {
      run.current++; recorder.cancel(); phaseRef.current = "error"; setPhase("error"); setMessage(voiceErrorMessage("RECORDING_INTERRUPTED"));
    };
    const hidden = () => { if (document.hidden) interrupt(); };
    const timer = setInterval(() => setElapsed(Math.min(MAX_SECONDS, Math.floor((Date.now() - started.current) / 1000))), 250);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", interrupt);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", interrupt); };
  }, [phase, recorder]);

  async function stopAndProcess(atLimit = false) {
    if (phaseRef.current !== "recording") return;
    const generation = run.current;
    transition("processing");
    setMessage(atLimit ? "75-second limit reached. Processing your recording…" : "");
    try {
      const recording = await recorder.stop();
      if (!mounted.current || generation !== run.current) return;
      trackProduct("Voice Recording Completed");
      const form = new FormData();
      form.set("audio", recording.audio, recording.audio.type.includes("mp4") ? "recording.mp4" : "recording.webm");
      form.set("duration", String(recording.duration)); form.set("recordedAt", recording.recordedAt);
      form.set("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone);
      const abort = new AbortController(); controller.current = abort;
      const timer = setTimeout(() => abort.abort(), 80000);
      let response: Response;
      try { response = await fetch("/api/voice-log/parse", { method: "POST", body: form, signal: abort.signal }); }
      catch { throw Error("UPLOAD_FAILED"); }
      finally { clearTimeout(timer); controller.current = null; }
      const result = await response.json();
      if (!mounted.current || generation !== run.current) return;
      if (!response.ok) throw Error(typeof result.error === "string" ? result.error : "UPLOAD_FAILED");
      if (!Array.isArray(result.candidates)) throw Error("INVALID_AI_RESPONSE");
      const parsed = result.candidates as VoiceCandidate[];
      if (parsed.some(candidate => !candidate || typeof candidate.source_fragment !== "string" || typeof candidate.time_note !== "string")) throw Error("INVALID_AI_RESPONSE");
      reviewedInputs(parsed.map(candidate => candidate.event), owner.current);
      setCandidates(parsed.map(candidate => ["food", "fluid"].includes(candidate.event.event_type) ? { ...candidate, nutrition: candidate.nutrition ?? nutritionDraft(candidate.event.food ?? provisionalFood(candidate.event.title!), [], candidate.event.amount, candidate.source_fragment) } : candidate)); transition("review"); setMessage("");
      trackProduct("Voice Parse Succeeded"); trackProduct("Voice Review Presented");
    } catch (error) {
      if (!mounted.current || generation !== run.current) return;
      recorder.cancel(); transition("error");
      setMessage(voiceErrorMessage(error instanceof Error ? error.message : "UPLOAD_FAILED"));
      trackProduct("Voice Parse Failed");
    }
  }

  async function start() {
    if (!["idle", "error"].includes(phaseRef.current) || !owner.current) return;
    const generation = ++run.current;
    setMessage(""); setElapsed(0); requestId.current = ""; transition("permission");
    try {
      await recorder.start(() => void stopAndProcess(true), code => {
        if (!mounted.current || generation !== run.current) return;
        run.current++; transition("error"); setMessage(voiceErrorMessage(code));
      });
      if (!mounted.current || generation !== run.current) return;
      started.current = Date.now(); transition("recording"); trackProduct("Voice Recording Started");
    } catch (error) {
      if (!mounted.current || generation !== run.current) return;
      transition("error"); setMessage(voiceErrorMessage(error instanceof Error ? error.message : "MIC_UNAVAILABLE"));
    }
  }

  function edit(index: number, patch: Partial<VoiceEvent>) {
    setCandidates(current => current.map((candidate, i) => {
      if (i !== index) return candidate;
      const event = { ...candidate.event, ...patch };
      let nutrition = candidate.nutrition;
      if (patch.title !== undefined || patch.event_type !== undefined) {
        delete event.food;
        if (["food", "fluid"].includes(event.event_type)) event.food = provisionalFood(event.title ?? "");
        nutrition = event.food ? nutritionDraft(event.food, [], event.amount) : undefined;
      }
      if (patch.amount !== undefined && event.food) nutrition = nutritionDraft(event.food, nutrition?.servings ?? [], event.amount);
      if (patch.food && nutrition) nutrition = { ...nutrition, reference_confirmed: false, accept_incomplete: false, ...(patch.food.food_id !== candidate.event.food?.food_id ? { servings: [], serving_id: null } : {}) };
      return { ...candidate, event, nutrition };
    }));
    trackProduct("Voice Log Edited");
  }
  function editNutrition(index: number, nutrition: NutritionDraft, food = candidates[index].event.food) {
    setCandidates(current => current.map((candidate, i) => i === index ? { ...candidate, nutrition, event: { ...candidate.event, food } } : candidate));
    trackProduct("Voice Log Edited");
  }
  async function confirm() {
    if (phaseRef.current !== "review" || matchingCount > 0 || (uncertain && !retryChecked)) return;
    transition("saving"); setMessage("");
    try {
      const inputs = reviewedInputs(candidates.map(candidate => candidate.event), owner.current);
      if (inputs.some(event => ["food", "fluid"].includes(event.event_type))) {
        requestId.current ||= crypto.randomUUID();
        await logVoiceNutrition(supabase, candidates, owner.current, requestId.current);
      } else await ingestHealthEvents(supabase, inputs);
      if (!mounted.current) return;
      trackProduct("Voice Log Confirmed"); onSaved();
    } catch (error) {
      if (!mounted.current) return;
      const code = error instanceof Error ? error.message : "PERSISTENCE_FAILED";
      setUncertain(code === "PERSISTENCE_FAILED"); setRetryChecked(false);
      transition("review"); setMessage(voiceErrorMessage(code));
    }
  }

  return <div ref={overlayRef} className="fixed inset-x-0 top-[var(--sheet-top,0px)] z-50 flex h-[var(--sheet-vh,100dvh)] items-end justify-center bg-slate-950/40 sm:items-center sm:p-6">
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="voice-log-title" className="relative flex max-h-[calc(var(--sheet-vh,100dvh)-1rem)] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-2xl sm:rounded-xl">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 id="voice-log-title" className="text-xl font-semibold">Voice Log</h2>
        <button ref={closeRef} type="button" className={button} aria-label="Close voice log" onClick={cancel} disabled={phase === "saving"}>×</button>
      </header>
      <div data-sheet-body className="min-h-0 overflow-y-auto overscroll-contain p-5">
        {(phase === "idle" || phase === "error") && <div className="space-y-4">
          <p>Describe what you ate, drank, took, did or felt. You’ll review and edit every event before saving.</p>
          <p className="text-sm text-slate-600">Up to 75 seconds. Audio is sent to OpenAI for processing. AXVital does not keep recordings or a transcript history.</p>
          <button type="button" className={`${button} bg-blue-600 text-white`} onClick={() => void start()} disabled={!ready}>{phase === "error" ? "Record again" : "Start recording"}</button>
        </div>}
        {phase === "permission" && <p role="status">Waiting for microphone permission… You can cancel at any time.</p>}
        {phase === "recording" && <div className="space-y-4">
          <p role="status" className="font-semibold text-red-700">● Recording — microphone is on</p>
          <p aria-label="Recording duration">{elapsed} / {MAX_SECONDS} seconds</p>
          <button type="button" className={`${button} bg-red-700 text-white`} onClick={() => void stopAndProcess()}>Stop recording</button>
        </div>}
        {phase === "processing" && <p role="status">Transcribing and preparing event drafts… Nothing has been saved.</p>}
        {(phase === "review" || phase === "saving") && <div className="space-y-4">
          <p>Review every event before saving. Food and drinks go to Nutrition Tracker; other events go to your activity timeline. The whole recording saves together.</p>
          <fieldset disabled={phase === "saving"} className="space-y-4">
            {candidates.map((candidate, index) => <article key={index} className="space-y-3 rounded-xl border border-slate-200 p-4" aria-label={`Event ${index + 1}`}>
              <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Event {index + 1} — review details</h3><button type="button" className={`${button} text-red-700`} aria-label={`Remove event ${index + 1}`} onClick={() => { setCandidates(current => current.filter((_, i) => i !== index)); trackProduct("Voice Log Edited"); }}>Remove</button></div>
              <label className="grid gap-1">Event type<select className={control} value={candidate.event.event_type} onChange={e => edit(index, { event_type: e.target.value as VoiceEvent["event_type"], amount: null, dose_amount: null, dose_unit: null, duration_minutes: null, distance: null, distance_unit: null, intensity: null, severity: null })}>{eventTypes.map(type => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label>
              <label className="grid gap-1">Name<input className={control} value={candidate.event.title ?? ""} maxLength={160} onChange={e => edit(index, { title: e.target.value })}/></label>
              {(["food", "fluid"].includes(candidate.event.event_type)) && <>
                <VoiceNutritionReview food={candidate.event.food} draft={candidate.nutrition ?? nutritionDraft(provisionalFood(candidate.event.title ?? ""), [])} onChange={draft => editNutrition(index, draft)}/>
                <FoodReview key={candidate.event.title} food={candidate.event.food} label={candidate.event.title ?? ""} amount={candidate.event.amount} onResolved={(food, draft) => editNutrition(index, draft, food)} onChange={food => edit(index, { food })} onBusy={delta => setMatchingCount(count => count + delta)}/>
              </>}
              <div className="grid grid-cols-2 gap-3">
                <label className="grid min-w-0 gap-1">Date<input className={`${control} min-w-0`} type="date" value={candidate.event.event_date} onChange={e => edit(index, { event_date: e.target.value })}/></label>
                <label className="grid min-w-0 gap-1">Time<input className={`${control} min-w-0`} type="time" step="1" value={candidate.event.event_time} onChange={e => edit(index, { event_time: e.target.value })}/></label>
              </div>
              <p className="text-sm text-amber-800">{candidate.time_note}</p>
              {(["food", "fluid"].includes(candidate.event.event_type)) && <label className="grid gap-1">Amount (optional)<input className={control} value={candidate.event.amount ?? ""} maxLength={160} onChange={e => edit(index, { amount: e.target.value || null })}/></label>}
              {(["supplement", "medication"].includes(candidate.event.event_type) ? ["dose_amount", "dose_unit"] : candidate.event.event_type === "exercise" ? ["duration_minutes", "distance", "distance_unit", "intensity"] : candidate.event.event_type === "symptom" ? ["severity"] : []).map(key => {
                const field = key as "dose_amount" | "dose_unit" | "duration_minutes" | "distance" | "distance_unit" | "intensity" | "severity";
                const numeric = ["dose_amount", "duration_minutes", "distance", "severity"].includes(field);
                const label = { dose_amount: "Dose (optional)", dose_unit: "Dose unit (optional)", duration_minutes: "Duration in minutes (optional)", distance: "Distance (optional)", distance_unit: "Distance unit (optional)", intensity: "Intensity (optional)", severity: "Severity 0–10 (optional)" }[field];
                return <label key={field} className="grid gap-1">{label}<input className={control} type={numeric ? "number" : "text"} step={numeric ? "any" : undefined} min={numeric ? 0 : undefined} max={field === "severity" ? 10 : undefined} value={candidate.event[field] ?? ""} onChange={e => edit(index, { [field]: e.target.value === "" ? null : numeric ? Number(e.target.value) : e.target.value })}/></label>;
              })}
              <label className="grid gap-1">Notes (optional)<textarea className={control} maxLength={2000} value={candidate.event.notes ?? ""} onChange={e => edit(index, { notes: e.target.value || null })}/></label>
              <label className="grid gap-1">Tags (comma separated)<input className={control} value={candidate.event.tags?.join(", ") ?? ""} onChange={e => edit(index, { tags: e.target.value.split(",").map(tag => tag.trim()) })}/></label>
              <details><summary className="min-h-11 cursor-pointer py-2 text-sm text-slate-600">What we heard</summary><p className="break-words text-sm">{candidate.source_fragment}</p></details>
            </article>)}
          </fieldset>
          {!candidates.length && <p>No events remain. Cancel to close Voice Log.</p>}
        </div>}
        {message && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-amber-900">{message}</p>}
        {uncertain && <label className="mt-3 flex min-h-11 items-center gap-3"><input type="checkbox" checked={retryChecked} onChange={e => setRetryChecked(e.target.checked)}/>I checked the timeline and these events were not saved.</label>}
      </div>
      <footer className="safe-bottom flex shrink-0 gap-3 border-t border-slate-200 p-4">
        <button type="button" className={`${button} border border-slate-300`} onClick={cancel} disabled={phase === "saving"}>Cancel</button>
        {(phase === "review" || phase === "saving") && <button type="button" className={`${button} flex-1 bg-blue-600 text-white`} disabled={phase === "saving" || matchingCount > 0 || !candidates.length || (uncertain && !retryChecked)} onClick={() => void confirm()}>{phase === "saving" ? "Saving…" : "Confirm and save events"}</button>}
      </footer>
    </div>
  </div>;
}
