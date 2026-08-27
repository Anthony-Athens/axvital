"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, ButtonLink, controlClass } from "@/components/ui/design-system";
import { createClient } from "@/lib/supabase/browser";
import { recovery } from "@/lib/auth/recovery";
import { PASSWORD_HELP, PASSWORD_MIN, PASSWORD_MAX, passwordError, updatePassword, submissionGuard } from "@/lib/auth/passwords";

export function PasswordForm({ recoveryMode = false }: { recoveryMode?: boolean }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [submit] = useState(submissionGuard);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (message || updated) feedback.current?.focus(); }, [message, updated, signedOut]);

  async function finishRecovery() {
    const { error } = await createClient().auth.signOut();
    if (error) {
      setMessage("Your password changed, but we couldn't sign you out. Please retry signing out before continuing.");
      return;
    }
    recovery.clear();
    setMessage("");
    setSignedOut(true);
  }

  function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(async () => {
      const validation = passwordError(password, confirmation);
      if (validation) { setMessage(validation); return; }
      setLoading(true);
      setMessage("");
      try {
        const supabase = createClient();
        const error = await updatePassword(supabase.auth, password, confirmation, recoveryMode ? id => recovery.valid(id) : undefined);
        if (error) { setMessage(error); return; }
        setPassword("");
        setConfirmation("");
        setUpdated(true);
        if (recoveryMode) await finishRecovery();
      } catch {
        setMessage("We couldn't finish the request. If your password was updated, retry signing out below; otherwise try again.");
      } finally { setLoading(false); }
    });
  }

  if (updated) return <div className="mt-6 space-y-4">
    <p ref={feedback} tabIndex={-1} role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">{message || (recoveryMode ? "Password updated. Your password has been changed successfully." : "Password updated successfully.")}</p>
    {recoveryMode && (signedOut ? <ButtonLink href="/login" className="w-full">Sign in with your new password</ButtonLink> : <Button disabled={loading} className="w-full" onClick={() => void submit(async () => {
      setLoading(true);
      try { await finishRecovery(); } catch { setMessage("Your password changed, but we couldn't sign you out. Please retry."); }
      finally { setLoading(false); }
    })}>Retry sign out</Button>)}
  </div>;

  return <form onSubmit={update} className="mt-6 space-y-4" aria-busy={loading}>
    <p id="password-help" className="text-sm text-slate-600">{PASSWORD_HELP}</p>
    {([['new-password', 'New password', password, setPassword], ['confirm-password', 'Confirm password', confirmation, setConfirmation]] as const).map(([id, label, value, setter]) => <div key={id}>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold">{label}</label>
      <input id={id} type={show ? "text" : "password"} autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} disabled={loading} value={value} onChange={event => setter(event.target.value)} aria-describedby={`password-help${message ? " password-feedback" : ""}`} aria-invalid={message ? true : undefined} className={controlClass} />
    </div>)}
    <Button type="button" variant="tertiary" aria-label={show ? "Hide new password and confirmation" : "Show new password and confirmation"} aria-pressed={show} onClick={() => setShow(!show)}>{show ? "Hide passwords" : "Show passwords"}</Button>
    {message ? <p id="password-feedback" ref={feedback} tabIndex={-1} role="alert" className="rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-900">{message}</p> : null}
    <Button type="submit" disabled={loading} className="w-full">{loading ? "Updating password..." : "Update password"}</Button>
    {recoveryMode ? <ButtonLink href="/forgot-password" variant="tertiary" className="w-full">Request new reset link</ButtonLink> : null}
  </form>;
}
