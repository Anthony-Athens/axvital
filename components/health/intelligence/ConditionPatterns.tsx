import { KeyInsight } from "./KeyInsight";
import { Surface } from "@/components/ui/design-system";
import { coverageLabels } from "@/lib/condition-intelligence/associations";
import { DAY, type ConditionAssociation, type FactorKey } from "@/lib/condition-intelligence/model";
import { formatCalendarDay } from "@/lib/measurements/time-window";
import { dateLabel } from "./ConditionTimeline";

const percent = (value: number | null) => value === null ? "Not enough data yet" : `${Math.round(value * 100)}%`;
type EvidenceSelection = { selectedKey: FactorKey | null; onSelect: (key: FactorKey | null) => void; timeZone: string };
function relativeLabel(row: ConditionAssociation) {
  if (!row.sufficient) return null;
  if (row.baselineRate === 0) return "No factor-present baseline days were recorded; a ratio cannot be calculated.";
  if (row.relativeRate === 1) return "Equally common in both groups of tracked days.";
  return row.relativeRate === null ? null : `${Number(row.relativeRate.toFixed(2))}× the baseline frequency`;
}
export function AssociationEvidence({ association, selectedKey, onSelect, timeZone }: { association: ConditionAssociation } & EvidenceSelection) {
  const selected = selectedKey === association.factorKey;
  return <details open={selected} className="mt-4 border-t border-slate-200 pt-2"><summary aria-controls="condition-timeline" aria-expanded={selected} onClick={event => { event.preventDefault(); onSelect(selected ? null : association.factorKey); }} className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">View evidence<span className="sr-only"> for {association.label}</span>{selected ? <span className="ml-2 text-xs">Timeline focus active</span> : null}</summary><div className="space-y-3 pb-2 text-sm leading-6 text-slate-600">
    <a href="#condition-timeline" className="inline-flex min-h-11 items-center font-semibold text-blue-700">See highlighted timeline context ↑</a>
    <p>{association.definition}</p><p>An eligible episode has at least one usable, non-episode lookback day. “Observed before” means at least one of those days contained the factor.</p>
    <ul className="space-y-3">{association.evidence.map(e => <li key={e.episodeId} className="rounded-lg bg-slate-50 p-3"><strong className="block text-slate-900">Episode starting {dateLabel(e.onset, timeZone)}</strong><span className="block">Lookback: {formatCalendarDay(e.start)}–{formatCalendarDay(e.end - DAY)}</span><span>{e.presentDays} factor-present / {e.eligibleDays} eligible days · {e.eligibleDays === 0 ? "Not eligible" : e.presentDays ? "Factor observed" : "Factor not observed"}</span></li>)}</ul>
    <p>Combined lookbacks: {association.preEpisodeOccurrences} factor-present / {association.preEpisodeEligibleDays} unique eligible days. Baseline: {association.baselineOccurrences} / {association.baselineEligibleDays} eligible days.</p>
    <p>Baseline excludes episode days and every lookback day. Shared lookback days count once in combined rates; they can support more than one episode’s observation count. Missing answers are excluded.</p>
    {association.reasons.length ? <ul className="list-disc pl-5">{association.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : null}
  </div></details>;
}
export function AssociationCard({ association, ...selection }: { association: ConditionAssociation } & EvidenceSelection) {
  const relative = relativeLabel(association);
  return <Surface className={selection.selectedKey === association.factorKey ? "ring-2 ring-blue-600" : ""}><p className="text-xs font-semibold text-slate-500">{coverageLabels[association.dataQuality]}</p><h3 className="mt-2 text-lg font-semibold">{association.label}</h3>
    {association.sufficient ? <><p className="mt-2 text-sm text-slate-600">Observed before {association.episodesObserved} of {association.eligibleEpisodes} eligible episodes</p><dl className="mt-5 grid grid-cols-2 gap-4"><div><dt className="text-xs text-slate-500">Pre-episode tracked days</dt><dd className="mt-1 text-2xl font-semibold">{percent(association.preEpisodeRate)}</dd><dd className="text-xs text-slate-500">{association.preEpisodeOccurrences} / {association.preEpisodeEligibleDays} days</dd></div><div><dt className="text-xs text-slate-500">Typical eligible tracked days</dt><dd className="mt-1 text-2xl font-semibold">{percent(association.baselineRate)}</dd><dd className="text-xs text-slate-500">{association.baselineOccurrences} / {association.baselineEligibleDays} days</dd></div></dl><p className="mt-4 text-sm font-medium text-slate-700">{relative}</p></> : <p className="mt-3 text-sm text-slate-600">Not enough data yet</p>}
    <AssociationEvidence association={association} {...selection}/>
  </Surface>;
}
export function ConditionPatterns({ associations, ...selection }: { associations: ConditionAssociation[] } & EvidenceSelection) {
  return <section className="mt-8" aria-labelledby="potential-patterns-title"><h2 id="potential-patterns-title" className="text-xl font-semibold">Potential patterns observed before episodes</h2><p className="mt-2 text-sm text-slate-500">Possible associations — not proof of causation. Comparisons use full local calendar days within the displayed 12 months. Data coverage describes availability, not clinical confidence.</p>
    <KeyInsight associations={associations}/>
    <div className="grid gap-4 md:grid-cols-2">{associations.map(association => <AssociationCard key={association.factorKey} association={association} {...selection}/>)}</div>
  </section>;
}
