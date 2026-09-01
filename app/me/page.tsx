import { ButtonLink, PageContainer, PageHeader, Surface } from "@/components/ui/design-system";

const groups = [
  { title: "My Health", description: "Manage the conditions and health areas AXVital organizes for you.", links: [["My Health", "/health"]] },
  { title: "Profile & Goals", description: "Update your profile, goals, tracking preferences, and personalization context.", links: [["Profile", "/profile"]] },
  { title: "Account", description: "Manage your account access, plan, and personal data.", links: [["Settings", "/settings"], ["Billing", "/settings/billing"], ["Security", "/settings/security"], ["Data & Privacy", "/settings/data"]] },
] as const;

export default function MePage() {
  return <PageContainer><PageHeader eyebrow="Me" title="Your health profile, goals, and account" description="Keep the information that shapes your AXVital experience in one easy-to-find place."/>
    <div className="mt-6 grid gap-4 lg:grid-cols-3">{groups.map((group) => <Surface key={group.title} className="flex flex-col items-start"><h2 className="text-xl font-semibold text-slate-900">{group.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{group.description}</p><div className="mt-4 flex flex-wrap gap-2">{group.links.map(([label, href]) => <ButtonLink key={href} href={href} variant="secondary">{label}</ButtonLink>)}</div></Surface>)}</div>
  </PageContainer>;
}
