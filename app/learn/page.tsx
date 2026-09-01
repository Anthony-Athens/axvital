import { ButtonLink, PageContainer, PageHeader, Surface } from "@/components/ui/design-system";

export default function LearnPage() {
  return <PageContainer>
    <PageHeader eyebrow="Learn" title="Understand what your data is showing" description="See what is changing, what patterns AXVital is noticing, and how your health is trending over time."/>

    <section className="mt-6" aria-labelledby="learn-start-heading">
      <p className="text-sm font-semibold text-blue-700">Start here</p>
      <Surface className="mt-2 border-blue-200 bg-blue-50/60">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="learn-start-heading" className="text-2xl font-semibold text-slate-900">Health Overview</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">See your recent health trends and overall progress at a glance. This is the clearest place to start when you want to know how you’re doing.</p>
          </div>
          <ButtonLink href="/dashboard" className="shrink-0">View Health Overview</ButtonLink>
        </div>
      </Surface>
    </section>

    <section className="mt-7" aria-labelledby="learn-deeper-heading">
      <div>
        <p className="text-sm font-semibold text-blue-700">Look deeper</p>
        <h2 id="learn-deeper-heading" className="mt-1 text-xl font-semibold text-slate-900">What changed, and what is AXVital noticing?</h2>
      </div>
      <div className="mt-3 grid min-w-0 gap-4 md:grid-cols-2">
        <Surface className="flex min-w-0 flex-col items-start">
          <p className="text-sm font-semibold text-slate-500">Patterns & Insights</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-900">Insights</h3>
          <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">Explore changes, relationships, symptom trends, and patterns across your health data. These observations can show associations, not proof of cause and effect.</p>
          <ButtonLink href="/insights" variant="secondary" className="mt-4">Explore Insights</ButtonLink>
        </Surface>
        <Surface className="flex min-w-0 flex-col items-start">
          <p className="text-sm font-semibold text-slate-500">Weekly Review</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-900">Your week in context</h3>
          <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">Review the past week, what improved, and what may deserve attention next in your saved, regenerable recap.</p>
          <ButtonLink href="/weekly-recap" variant="secondary" className="mt-4">Open Weekly Review</ButtonLink>
        </Surface>
      </div>
    </section>

    <section className="mt-7" aria-labelledby="learn-specialized-heading">
      <h2 id="learn-specialized-heading" className="text-lg font-semibold text-slate-900">Specialized views</h2>
      <div className="mt-3 grid min-w-0 gap-4 md:grid-cols-2">
        <Surface compact className="min-w-0">
          <h3 className="font-semibold text-slate-900">Training Progress</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">Review training volume, performance, and workout trends.</p>
          <ButtonLink href="/workouts/progress" variant="tertiary" className="mt-2 -ml-4">View Training Progress</ButtonLink>
        </Surface>
        <Surface compact className="min-w-0">
          <h3 className="font-semibold text-slate-900">Condition Insights</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">Condition-specific patterns and outlooks are available from your condition pages when enough relevant information exists.</p>
          <ButtonLink href="/health" variant="tertiary" className="mt-2 -ml-4">Go to My Health</ButtonLink>
        </Surface>
      </div>
    </section>

    <aside className="mt-7 rounded-xl border border-slate-200 bg-slate-100 p-4 text-sm leading-6 text-slate-600">
      Notice something worth testing? Experiments can help you evaluate a deliberate change using your own tracked observations. <ButtonLink href="/experiments" variant="tertiary" className="ml-1 px-2">View Experiments</ButtonLink>
    </aside>
  </PageContainer>;
}
