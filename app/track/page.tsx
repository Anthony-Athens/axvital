import { ButtonLink, PageContainer, PageHeader, Surface } from "@/components/ui/design-system";

const groups = [
  { title: "Daily & Planning", items: [["Weekly Overview", "Plan your week and keep scheduled activities moving.", "/weekly-overview"]] },
  { title: "Nutrition", items: [["Nutrition", "Log food and review today’s nutrition.", "/health/nutrition"], ["Nutrition Goals", "Set and manage the nutrition targets that matter to you.", "/health/nutrition/goals"]] },
  { title: "Movement & Training", items: [["Workouts", "Plan sessions, train, and review your workout history.", "/workouts"]] },
  { title: "Habits & Routines", items: [["Habits", "Build repeatable actions and track your progress.", "/habits"], ["Protocols", "Organize habits and activities around a focused plan.", "/protocols"]] },
  { title: "Symptoms & Health Events", items: [["Symptoms", "Log symptoms and review their history over time.", "/health/symptoms"], ["Health Timeline", "See health, activity, nutrition, symptoms, and routines together.", "/health/timeline"], ["My Health", "Manage the conditions and health areas you are tracking.", "/health"]] },
] as const;

export default function TrackPage() {
  return <PageContainer><PageHeader eyebrow="Track" title="What do you want to track?" description="Choose an area to log what happened, plan what’s next, or review your history."/>
    <div className="mt-6 space-y-7">{groups.map((group) => { const id = `track-${group.title.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`; return <section key={group.title} aria-labelledby={id}><h2 id={id} className="text-lg font-semibold text-slate-900">{group.title}</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{group.items.map(([title, description, href]) => <Surface key={href} className="flex flex-col items-start"><h3 className="text-lg font-semibold text-slate-900">{title}</h3><p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{description}</p><ButtonLink href={href} variant="secondary" className="mt-4">Open {title}</ButtonLink></Surface>)}</div></section>; })}</div>
  </PageContainer>;
}
