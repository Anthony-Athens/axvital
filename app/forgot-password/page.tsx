"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button, ButtonLink, controlClass } from "@/components/ui/design-system";
import { createClient } from "@/lib/supabase/browser";
import { RESET_SENT, requestPasswordReset, resetRequestMessage, submissionGuard } from "@/lib/auth/passwords";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [submit] = useState(submissionGuard);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (message) feedback.current?.focus(); }, [message]);

  function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(async () => {
      setLoading(true);
      setMessage("");
      try {
        setMessage(await requestPasswordReset(createClient().auth, email, process.env.NEXT_PUBLIC_APP_URL));
      } catch {
        setMessage(resetRequestMessage({}));
      } finally { setLoading(false); }
    });
  }

  return <AuthCard title={message === RESET_SENT ? "Check your email" : "Reset your password"}>
    <p className="mt-3 text-sm leading-6 text-slate-600">Enter the email address associated with your AXVital account. Open the reset link in this same browser.</p>
    {message === RESET_SENT ? null : <form onSubmit={request} className="mt-6 space-y-4" aria-busy={loading}>
      <label className="block text-sm font-semibold" htmlFor="reset-email">Email</label>
      <input id="reset-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} className={controlClass} disabled={loading} />
      <Button type="submit" disabled={loading} className="w-full">{loading ? "Sending reset link..." : "Send reset link"}</Button>
    </form>}
    {message ? <p ref={feedback} tabIndex={-1} role="status" className="mt-4 rounded-lg bg-slate-100 p-4 text-sm leading-6">{message}</p> : null}
    <ButtonLink href="/login" variant="tertiary" className="mt-4 w-full">Back to Login</ButtonLink>
  </AuthCard>;
}
