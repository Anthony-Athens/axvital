"use client";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/design-system";
import { getUserConditions } from "@/lib/conditions/conditions";
import { createClient } from "@/lib/supabase/browser";

export function HealthProfileSummary() { const [count, setCount] = useState<number | null>(null); useEffect(() => { getUserConditions(createClient()).then((rows) => setCount(rows.filter((row) => !row.archived_at).length)).catch(() => setCount(null)); }, []); return <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8"><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">Health profile</p><h2 className="mt-2 text-2xl font-black tracking-tight">{count === null ? "Your conditions" : `${count} condition${count === 1 ? "" : "s"} tracked`}</h2><p className="mt-2 leading-7 text-slate-600">Manage the health areas you want AXVital to organize.</p><ButtonLink href="/health" className="mt-4">Manage in My Health</ButtonLink></section>; }
