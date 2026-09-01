import { ButtonLink, PageContainer, PageHeader, Surface } from "@/components/ui/design-system";

const destinations = [
  ["Overview", "Dashboard", "See a snapshot of recent check-ins, trends, routines, and activity.", "/dashboard"],
  ["Patterns", "Insights", "Explore baselines, recent changes, and patterns in your tracked data.", "/insights"],
  ["Weekly Review", "Weekly Recap", "Generate a concise briefing from your most recent week.", "/weekly-recap"],
  ["Training Progress", "Workout Progress", "Review workout performance and progress over time.", "/workouts/progress"],
] as const;

export default function LearnPage() {
  return <PageContainer><PageHeader eyebrow="Learn" title="Understand what your data is showing" description="Review your progress from different angles without changing how your data is calculated."/>
    <div className="mt-6 grid gap-4 sm:grid-cols-2">{destinations.map(([eyebrow, title, description, href]) => <Surface key={href} className="flex flex-col items-start"><p className="text-sm font-semibold text-blue-700">{eyebrow}</p><h2 className="mt-1 text-xl font-semibold text-slate-900">{title}</h2><p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{description}</p><ButtonLink href={href} variant="secondary" className="mt-4">Open {title}</ButtonLink></Surface>)}</div>
  </PageContainer>;
}
