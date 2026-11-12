"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { calculateProtocolSummary } from "@/lib/protocols/analytics";
import {
  cancelProtocol,
  completeProtocol,
  createTemplateFromUserProtocol,
  getProtocolOccurrencesForRange,
  getUserProtocolById,
  pauseProtocol,
  protocolDay,
  protocolDaysRemaining,
  resumeProtocol,
  summarizeCompletion,
} from "@/lib/protocols/protocols";
import type { ProtocolOccurrence, UserProtocol } from "@/lib/protocols/types";
import { derivedOccurrenceStatus } from "@/lib/habits/progress";
import { supabase } from "@/lib/supabase/client";
import { logDevError } from "@/lib/app-errors";
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function ActiveProtocolDetail() {
  const { id } = useParams<{ id: string }>();
  const date = today();
  const [p, setP] = useState<UserProtocol | null>(null);
  const [rows, setRows] = useState<ProtocolOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const protocol = await getUserProtocolById(supabase, id);
      setP(protocol);
      setRows(await getProtocolOccurrencesForRange(supabase, id, protocol.start_date, date));
    } catch (reason) {
      logDevError("Failed to load protocol", reason);
      setError("We couldn’t load this protocol.");
    } finally {
      setLoading(false);
    }
  }, [date, id]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const stats = useMemo(
    () =>
      p ? calculateProtocolSummary(rows, p.pause_periods ?? [], date, p.activities ?? []) : null,
    [date, p, rows],
  );
  async function status(action: "pause" | "resume" | "complete" | "cancel") {
    if (!p) return;
    if (
      ["complete", "cancel"].includes(action) &&
      !confirm(
        `${action === "complete" ? "Complete" : "Cancel"} this protocol? Its history will be preserved.`,
      )
    )
      return;
    setBusy(true);
    try {
      if (action === "pause") await pauseProtocol(supabase, p.id, date);
      if (action === "resume") await resumeProtocol(supabase, p.id, date);
      if (action === "complete") await completeProtocol(supabase, p.id, date);
      if (action === "cancel") await cancelProtocol(supabase, p.id, date);
      setMessage(`Protocol ${action}d.`);
      await load();
    } catch (reason) {
      logDevError("Failed to update protocol", reason);
      setError("We couldn’t update the protocol status.");
    } finally {
      setBusy(false);
    }
  }
  async function saveTemplate() {
    if (!p) return;
    setBusy(true);
    try {
      const t = await createTemplateFromUserProtocol(supabase, p.id);
      setMessage(`Saved “${t.name}”.`);
    } catch {
      setError("We couldn’t save this protocol as a template.");
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return <div className="mx-auto max-w-5xl p-6 font-semibold">Loading protocol progress…</div>;
  if (!p) return <div className="mx-auto max-w-5xl p-6 font-semibold">Protocol not found.</div>;
  const todayRows = rows.filter((r) => r.scheduled_date === date);
  const summary = summarizeCompletion(rows, date);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-10">
      <Link href="/protocols" className="font-semibold text-accent-fg">
        ← Protocols
      </Link>
      <section className="mt-4 rounded-2xl bg-slate-950 p-6 text-white md:p-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-300">
          {p.category} · {p.status}
        </p>
        <h1 className="mt-2 text-4xl font-semibold">{p.name}</h1>
        <p className="mt-3 text-fg-2">{p.goal || p.description}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/10 px-4 py-2 font-bold">
            Protocol Day {protocolDay(p.start_date, date)}
          </span>
          {protocolDaysRemaining(p.end_date, date) !== null ? (
            <span className="rounded-full bg-white/10 px-4 py-2 font-bold">
              {protocolDaysRemaining(p.end_date, date)} days remaining
            </span>
          ) : null}
          <span className="rounded-full bg-white/10 px-4 py-2 font-bold">
            {stats?.overall.percentage ?? 0}% adherence
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {p.status === "active" ? (
            <button
              disabled={busy}
              onClick={() => void status("pause")}
              className="rounded-xl bg-amber-400 px-4 py-3 font-semibold text-fg"
            >
              Pause
            </button>
          ) : null}
          {p.status === "paused" ? (
            <button
              disabled={busy}
              onClick={() => void status("resume")}
              className="rounded-xl bg-accent hover:bg-accent-hover px-4 py-3 font-semibold"
            >
              Resume
            </button>
          ) : null}
          {["active", "paused"].includes(p.status) ? (
            <>
              <button
                disabled={busy}
                onClick={() => void status("complete")}
                className="rounded-xl bg-white/10 px-4 py-3 font-semibold"
              >
                Mark completed
              </button>
              <button
                disabled={busy}
                onClick={() => void status("cancel")}
                className="rounded-xl bg-white/10 px-4 py-3 font-semibold"
              >
                Cancel
              </button>
            </>
          ) : null}
          <button
            disabled={busy}
            onClick={() => void saveTemplate()}
            className="rounded-xl bg-white/10 px-4 py-3 font-semibold"
          >
            Duplicate as template
          </button>
          <Link href="/weekly-overview" className="rounded-xl bg-white/10 px-4 py-3 font-semibold">
            Weekly Overview
          </Link>
        </div>
      </section>
      {error ? (
        <p className="mt-4 rounded-2xl bg-rose-500/10 p-4 font-bold text-rose-300">{error}</p>
      ) : null}
      {message ? (
        <p className="mt-4 rounded-2xl bg-emerald-500/10 p-4 font-bold text-emerald-200">
          {message}
        </p>
      ) : null}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Overall", stats?.overall.percentage ?? 0],
          ["Required", stats?.required.percentage ?? 0],
          ["Optional", stats?.optional.percentage ?? 0],
          [
            "Today",
            `${todayRows.filter((r) => r.status === "completed").length}/${todayRows.length}`,
          ],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-surface p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-fg-3">{l}</p>
            <p className="mt-2 text-2xl font-semibold">{typeof v === "number" ? `${v}%` : v}</p>
          </div>
        ))}
      </section>
      <section className="mt-5 rounded-2xl bg-surface p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">Today’s protocol activities</h2>
        <div className="mt-4 space-y-2">
          {todayRows.map((r) => {
            const link = p.activities?.find((a) => a.planned_activity_id === r.planned_activity_id);
            return (
              <div key={r.id} className="flex justify-between rounded-2xl bg-raised p-4">
                <span>
                  <strong className="block">{r.planned_activity?.title}</strong>
                  <span className="text-sm text-fg-3">
                    {link?.is_required ? "Required" : "Optional"}
                  </span>
                </span>
                <span className="font-semibold capitalize">{derivedOccurrenceStatus(r, date)}</span>
              </div>
            );
          })}
          {!todayRows.length ? (
            <p className="text-fg-3">No protocol activities scheduled today.</p>
          ) : null}
        </div>
      </section>
      <section className="mt-5 rounded-2xl bg-surface p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">Progress summary</h2>
        <p className="mt-3 text-lg font-bold">
          You completed {stats?.required.percentage ?? 0}% of required activities across this
          protocol.
        </p>
        <div className="mt-4 flex gap-4 text-sm font-bold text-fg-3">
          <span>{summary.completed} completed</span>
          <span>{summary.skipped} skipped</span>
          <span>{summary.missed} missed</span>
        </div>
      </section>
    </div>
  );
}
