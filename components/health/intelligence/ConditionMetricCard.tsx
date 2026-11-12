import { Surface } from "@/components/ui/design-system";

export function ConditionMetricCard({
  label,
  value,
  context,
}: {
  label: string;
  value: string;
  context?: string | null;
}) {
  return (
    <Surface compact>
      <p className="text-sm text-fg-3">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-fg">{value}</p>
      {context ? <p className="mt-2 text-xs text-fg-3">{context}</p> : null}
    </Surface>
  );
}
