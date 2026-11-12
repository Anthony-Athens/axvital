"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StartProtocolModal } from "./StartProtocolModal";
import { duplicateProtocolTemplate, getProtocolTemplateById } from "@/lib/protocols/templates";
import { instantiateProtocolFromTemplate } from "@/lib/protocols/instantiate";
import type { ProtocolTemplate } from "@/lib/protocols/types";
import { supabase } from "@/lib/supabase/client";
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function TemplateDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [value, setValue] = useState<ProtocolTemplate | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState(false);
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        setValue(await getProtocolTemplateById(supabase, id));
      } catch {
        setError("We couldn’t load this protocol.");
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [id]);
  async function instantiate(date: string, name: string, end: string | null) {
    if (!value) return;
    setBusy(true);
    try {
      const p = await instantiateProtocolFromTemplate(supabase, value.id, date, name, end, today());
      router.push(`/protocols/${p.id}`);
    } catch {
      setBusy(false);
      throw new Error("We couldn’t start this protocol.");
    }
  }
  async function duplicate() {
    if (!value) return;
    setBusy(true);
    try {
      const copy = await duplicateProtocolTemplate(supabase, value.id);
      router.push(`/protocols/templates/${copy.id}`);
    } catch {
      setError("We couldn’t duplicate this protocol.");
      setBusy(false);
    }
  }
  if (!value)
    return (
      <div className="mx-auto max-w-4xl p-6 font-semibold">{error || "Loading protocol…"}</div>
    );
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-10">
      <Link href="/protocols" className="font-semibold text-accent-fg">
        ← Protocols
      </Link>
      <section className="mt-4 rounded-2xl bg-slate-950 p-6 text-white md:p-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-300">
          {value.category} · {value.difficulty ?? "Custom"}
        </p>
        <h1 className="mt-2 text-4xl font-semibold">{value.name}</h1>
        <p className="mt-3 text-fg-2">{value.goal || value.description || "No goal added."}</p>
        <p className="mt-4 font-bold">
          {value.duration_days ? `${value.duration_days} days` : "Flexible duration"} ·{" "}
          {value.activities?.length ?? 0} activities
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {!value.is_archived ? (
            <button
              onClick={() => setStart(true)}
              className="rounded-xl bg-accent hover:bg-accent-hover px-5 py-3 font-semibold"
            >
              Start Protocol
            </button>
          ) : null}
          <button
            disabled={busy}
            onClick={() => void duplicate()}
            className="rounded-xl bg-white/10 px-5 py-3 font-semibold"
          >
            Duplicate
          </button>
          <Link
            href={`/protocols/templates/${value.id}/edit`}
            className="rounded-xl bg-white/10 px-5 py-3 font-semibold"
          >
            Edit
          </Link>
        </div>
      </section>
      <section className="mt-5 rounded-2xl bg-surface p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">Schedule</h2>
        <div className="mt-4 space-y-3">
          {value.activities?.map((a, i) => (
            <article key={a.id} className="rounded-2xl bg-raised p-4">
              <div className="flex justify-between">
                <h3 className="font-semibold">
                  {i + 1}. {a.title}
                </h3>
                <span className="text-xs font-semibold uppercase text-fg-3">
                  {a.is_required ? "Required" : "Optional"}
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold capitalize text-fg-3">
                {a.schedule_type.replace("_", " ")} · {a.tracking_type}
                {a.target_value ? ` · ${a.target_value} ${a.target_unit}` : ""}
              </p>
            </article>
          ))}
          {!value.activities?.length ? (
            <p className="rounded-2xl bg-raised p-5 text-fg-3">
              This protocol does not have any activities yet.
            </p>
          ) : null}
        </div>
      </section>
      {start ? (
        <StartProtocolModal
          template={value}
          busy={busy}
          onClose={() => setStart(false)}
          onStart={instantiate}
        />
      ) : null}
    </div>
  );
}
