import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export const metadata: Metadata = {
  title: "Settings | AXVital",
  robots: { index: false, follow: false },
};
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const { data, error } = await (await createClient()).auth.getUser();
  if (error || !data.user) redirect("/login");
  return (
    <>
      <nav
        aria-label="Account settings"
        className="mx-auto flex max-w-6xl flex-wrap gap-1 border-b border-line px-4 py-3"
      >
        {[
          ["/me", "Back to Me"],
          ["/settings", "Account Settings"],
          ["/settings/security", "Security"],
          ["/settings/billing", "Billing"],
          ["/settings/data", "Data & Privacy"],
          ["/settings/delete", "Delete Account"],
          ["/contact", "Support"],
        ].map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-blue-300 hover:bg-blue-500/10 focus-visible:ring-2 focus-visible:ring-accent-fg"
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
