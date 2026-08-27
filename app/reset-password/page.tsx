"use client";

import { useEffect, useState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { PasswordForm } from "@/components/auth/PasswordForm";
import { ButtonLink } from "@/components/ui/design-system";
import { INVALID_RECOVERY } from "@/lib/auth/passwords";
import { recovery } from "@/lib/auth/recovery";
import { createClient } from "@/lib/supabase/browser";

export default function ResetPasswordPage() {
  const [state, setState] = useState<"loading" | "valid" | "invalid">("loading");
  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const url = new URL(window.location.href);
    const failed = url.searchParams.has("error") || new URLSearchParams(url.hash.slice(1)).has("error");
    async function validate() {
      try {
        // getUser waits for the shared client's automatic PKCE URL exchange.
        const { data, error } = await supabase.auth.getUser();
        if (active) {
          window.history.replaceState(window.history.state, "", "/reset-password");
          setState(!failed && !error && recovery.valid(data.user?.id) ? "valid" : "invalid");
        }
      } catch { if (active) setState("invalid"); }
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      // Never await another auth method while Supabase holds its event lock.
      if (event === "PASSWORD_RECOVERY") setTimeout(() => { if (active) void validate(); }, 0);
    });
    void validate();
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return <AuthCard title="Choose a new password">
    {state === "loading" ? <p role="status" className="mt-4">Checking your reset link...</p> : state === "valid" ? <PasswordForm recoveryMode /> : <div className="mt-4 space-y-4">
      <p role="alert" className="text-sm leading-6 text-slate-600">{INVALID_RECOVERY}</p>
      <ButtonLink href="/forgot-password" className="w-full">Request new reset link</ButtonLink>
    </div>}
  </AuthCard>;
}
