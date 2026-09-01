import { ButtonLink, PageContainer, PageHeader, Surface } from "@/components/ui/design-system";

type TrackAreaProps = {
  title: string;
  description: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string }[];
  className?: string;
};

function TrackArea({ title, description, primary, secondary = [], className = "" }: TrackAreaProps) {
  return <Surface className={`flex min-w-0 flex-col items-start ${className}`}>
    <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
    <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{description}</p>
    <div className="mt-4 flex w-full flex-wrap items-center gap-2">
      <ButtonLink href={primary.href}>{primary.label}</ButtonLink>
      {secondary.map((action) => <ButtonLink key={action.href} href={action.href} variant="tertiary">{action.label}</ButtonLink>)}
    </div>
  </Surface>;
}

export default function TrackPage() {
  return <PageContainer>
    <PageHeader eyebrow="Track" title="Track what matters to you" description="Keep the health data that matters to you in one place, and choose where to manage or review it."/>
    <div className="mt-6 grid min-w-0 gap-4 md:grid-cols-2">
      <TrackArea title="Daily Health" description="Complete your Daily Check-In on Today, then review health, activity, nutrition, symptoms, and routines together over time." primary={{ label: "Go to Today", href: "/today" }} secondary={[{ label: "Health Timeline", href: "/health/timeline" }]} className="border-blue-200 bg-blue-50/60 md:col-span-2"/>
      <TrackArea title="Nutrition" description="Log food intake, review today’s nutrition, and manage the daily nutrition targets you care about." primary={{ label: "Open Nutrition", href: "/health/nutrition" }} secondary={[{ label: "Nutrition Goals", href: "/health/nutrition/goals" }]}/>
      <TrackArea title="Training" description="Plan workouts, build templates, use your exercise library, and return to your workout history." primary={{ label: "Open Workouts", href: "/workouts" }}/>
      <TrackArea title="Habits & Routines" description="Habits are individual actions you repeat consistently. Protocols organize multiple actions or scheduled activities into a structured routine." primary={{ label: "Manage Habits", href: "/habits" }} secondary={[{ label: "Manage Protocols", href: "/protocols" }]}/>
      <TrackArea title="Symptoms & Conditions" description="Symptoms capture what you experience and when. Conditions provide health context for symptoms, episodes, and insights." primary={{ label: "Manage Symptoms", href: "/health/symptoms" }} secondary={[{ label: "My Health & Conditions", href: "/health" }]}/>
      <TrackArea title="Weekly Planning" description="See planned workouts, habits, protocols, and other scheduled activities across your week." primary={{ label: "View Weekly Overview", href: "/weekly-overview" }} className="md:col-span-2"/>
    </div>
  </PageContainer>;
}
