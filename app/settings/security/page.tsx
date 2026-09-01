import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { PasswordForm } from "@/components/auth/PasswordForm";
import { ButtonLink } from "@/components/ui/design-system";
import { createClient } from "@/lib/supabase/server";

export default async function SecurityPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  return <AuthCard title="Change password">
    <p className="mt-3 text-sm leading-6 text-slate-600">Update your account password. You’ll remain signed in.</p>
    <PasswordForm />
    <ButtonLink href="/settings" variant="tertiary" className="mt-4 w-full">Back to Account Settings</ButtonLink>
  </AuthCard>;
}
