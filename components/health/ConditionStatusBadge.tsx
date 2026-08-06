import type { ConditionStatus } from "@/lib/conditions/types";

const labels: Record<ConditionStatus, string> = { active: "Active", monitoring: "Monitoring", remission: "In remission", resolved: "Resolved", archived: "Archived" };
export function ConditionStatusBadge({ status }: { status: ConditionStatus }) { return <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{labels[status]}</span>; }
