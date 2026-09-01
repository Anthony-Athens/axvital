import { ButtonLink, PageContainer, PageHeader, Surface } from "@/components/ui/design-system";

export default function MePage() {
  return <PageContainer>
    <PageHeader eyebrow="Me" title="Your health profile, goals, and account" description="Manage the information that helps AXVital understand your health context and personalize your experience."/>

    <section className="mt-6" aria-labelledby="me-health-heading">
      <p className="text-sm font-semibold text-blue-700">Your health context</p>
      <Surface className="mt-2 border-blue-200 bg-blue-50/60">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="me-health-heading" className="text-2xl font-semibold text-slate-900">My Health</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Manage your health conditions and the context AXVital uses to better understand your tracking data, including related episodes and symptoms.</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">Manage condition context here. AXVital surfaces condition-specific patterns and outlooks in Learn.</p>
          </div>
          <ButtonLink href="/health" className="shrink-0">Open My Health</ButtonLink>
        </div>
      </Surface>
    </section>

    <section className="mt-7" aria-labelledby="me-profile-heading">
      <p className="text-sm font-semibold text-blue-700">Personalization</p>
      <Surface className="mt-2">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="me-profile-heading" className="text-xl font-semibold text-slate-900">Goals & Profile</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Manage the personal information and goals AXVital uses to personalize your experience, including your primary goal, weight goals, sleep context, and health focus.</p>
          </div>
          <ButtonLink href="/profile" variant="secondary" className="shrink-0">Manage Profile & Goals</ButtonLink>
        </div>
      </Surface>
    </section>

    <section className="mt-7 border-t border-slate-200 pt-6" aria-labelledby="me-account-heading">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold text-slate-500">Account</p>
        <h2 id="me-account-heading" className="mt-1 text-lg font-semibold text-slate-900">Account administration</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Manage account access, your plan, and personal data. Additional controls, including account deletion and support, remain available inside Account Settings.</p>
      </div>
      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
        <ButtonLink href="/settings" variant="secondary">Account Settings</ButtonLink>
        <ButtonLink href="/settings/billing" variant="tertiary">Billing</ButtonLink>
        <ButtonLink href="/settings/security" variant="tertiary">Security</ButtonLink>
        <ButtonLink href="/settings/data" variant="tertiary">Data & Privacy</ButtonLink>
      </div>
    </section>
  </PageContainer>;
}
