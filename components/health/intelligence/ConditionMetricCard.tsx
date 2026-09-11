import { Surface } from "@/components/ui/design-system";

export function ConditionMetricCard({ label, value, context }: { label: string; value: string; context?: string | null }) { return <Surface compact><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{value}</p>{context ? <p className="mt-2 text-xs text-slate-500">{context}</p> : null}</Surface>; }
