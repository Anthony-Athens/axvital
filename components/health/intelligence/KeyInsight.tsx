import { leadingAssociation } from "@/lib/condition-intelligence/associations";
import type { ConditionAssociation } from "@/lib/condition-intelligence/model";
const percent = (value: number | null) =>
  value === null ? "Not enough data yet" : `${Math.round(value * 100)}%`;
export function KeyInsight({ associations }: { associations: ConditionAssociation[] }) {
  const leading = leadingAssociation(associations);
  const sufficient = associations.some((a) => a.sufficient);
  return (
    <aside
      className="my-5 rounded-xl border border-blue-400/25 bg-blue-500/10 p-4 sm:p-5"
      aria-label="Key Insight"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Key Insight</p>
      {leading ? (
        <>
          <h3 className="mt-2 text-lg font-semibold">
            {leading.label} was observed before {leading.episodesObserved} of{" "}
            {leading.eligibleEpisodes} eligible episodes.
          </h3>
          <p className="mt-2 text-sm text-fg-2">
            {percent(leading.preEpisodeRate)} of tracked pre-episode days vs.{" "}
            {percent(leading.baselineRate)} of typical eligible tracked days.
          </p>
          <p className="mt-2 text-xs text-fg-3">
            Largest observed increase among eligible factors; exploratory and unadjusted for other
            factors.
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-fg-2">
          {sufficient
            ? "No repeated increase met the Key Insight criteria. You can still review the comparisons below."
            : "AXVital needs more tracked data around your episodes before it can compare patterns reliably."}
        </p>
      )}
    </aside>
  );
}
