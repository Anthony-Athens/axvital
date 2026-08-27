import {PageContainer,PageHeader,Surface,ButtonLink} from "@/components/ui/design-system";
export default function AccountPage(){return <PageContainer narrow><PageHeader title="Account" description="Manage your preferences, security, billing, and personal data. These controls are available on every plan."/><div className="mt-6 grid gap-4 sm:grid-cols-2">{[
  ["Profile & Preferences","Update the information and preferences you choose to share.","/profile"],
  ["Security","Change your password or access account recovery.","/settings/security"],
  ["Billing","Review your plan and manage your subscription.","/settings/billing"],
  ["Export My Data","Download a portable JSON copy of your account information.","/settings/data"],
  ["Delete Account","Review the consequences and permanently close your account.","/settings/delete"],
  ["Support","Get help with your account, privacy, or billing.","/contact"],
].map(([title,description,href])=><Surface key={href}><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 text-sm text-slate-600">{description}</p><ButtonLink href={href} variant="secondary" className="mt-4">{title}</ButtonLink></Surface>)}</div></PageContainer>}
