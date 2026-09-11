import { ConditionMetricCard } from "@/components/health/intelligence/ConditionMetricCard";
import { ConditionTimeline } from "@/components/health/intelligence/ConditionTimeline";
import { KeyInsight } from "@/components/health/intelligence/KeyInsight";
import { conditionIntelligenceDemos, type DemoConditionKey } from "@/lib/campaigns/condition-intelligence-demo";
import { days, metrics } from "@/lib/condition-intelligence/model";

export function ConditionIntelligenceMarketingDemo({ conditionKey, name }: { conditionKey: DemoConditionKey; name: string }) {
  const demo = conditionIntelligenceDemos[conditionKey];
  const stats = metrics(demo.episodes, demo.now);
  return <section aria-labelledby="intelligence-demo-title" className="mx-auto min-w-0 max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
    <h2 id="intelligence-demo-title" className="text-3xl font-semibold tracking-tight">See your condition in context</h2>
    <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">Track episodes, review the days before them, and explore patterns in your recorded sleep, stress, energy, and exercise. Condition Intelligence connects those comparisons to the history behind them.</p>
    <div className="mt-7 min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-6" data-condition-demo={conditionKey}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Condition Intelligence</p><h3 className="mt-1 text-2xl font-semibold">{name}</h3></div><span className="rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700">Illustrative example</span></div>
      <p className="mb-5 text-sm leading-6 text-slate-600">Fictional data, September 2025–September 2026. This example is not a finding about {name} or a prediction of your results.</p>
      <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 lg:grid-cols-4">{[
        ["Average time between episodes", days(stats.interval)], ["Time since last episode", days(stats.since)],
        ["Average episode duration", days(stats.duration)], ["Most recent episode severity", `${stats.recentSeverity} / 10`],
      ].map(([label, value]) => <ConditionMetricCard key={label} label={label} value={value}/>)}</div>
      <KeyInsight associations={demo.associations}/>
      <ConditionTimeline {...demo} mode="marketing" interactive={false}/>
      <p className="mt-4 text-sm leading-6 text-slate-600">Shaded windows show the seven days before each episode. In your account, select an episode or view a pattern’s evidence to inspect the supporting records. Associations do not establish causes; missing data can limit comparisons.</p>
    </div>
  </section>;
}
