import Link from "next/link";
import { conditionDisplayName } from "@/lib/conditions/conditions";
import type { UserCondition } from "@/lib/conditions/types";
import { ConditionStatusBadge } from "./ConditionStatusBadge";

export function ConditionCard({ item }: { item: UserCondition }) {
  const name = conditionDisplayName(item); const diagnosed = item.diagnosed_on ?? item.diagnosed_year;
  return <article className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">{name}{item.condition?.short_name ? <span className="ml-2 text-sm font-medium text-slate-500">{item.condition.short_name}</span> : null}</h3><p className="mt-1 text-sm text-slate-500">{item.condition?.category?.name ?? "Custom condition"}</p></div>{item.is_primary ? <span className="shrink-0 rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">Primary</span> : null}</div>
    <div className="mt-4 flex flex-wrap items-center gap-2"><ConditionStatusBadge status={item.status}/>{diagnosed ? <span className="text-sm text-slate-600">Diagnosed {typeof diagnosed === "string" ? new Date(`${diagnosed}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : diagnosed}</span> : null}</div>
    {item.notes ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{item.notes}</p> : null}
    <Link href={`/health/conditions/${item.id}`} aria-label={`Manage ${name}`} className="mt-auto inline-flex min-h-11 items-center pt-4 text-sm font-semibold text-blue-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Manage condition <span aria-hidden="true" className="ml-1">→</span></Link>
  </article>;
}
