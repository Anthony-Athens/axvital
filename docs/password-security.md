# Password recovery and account security

## Architecture and behavior

AXVital already used `@supabase/ssr` cookie-backed browser/server clients,
PKCE, and the Next.js auth proxy. There was no auth callback route or recovery
template in the repository. This implementation reuses the shared browser
client's automatic PKCE URL exchange; it does not introduce another client,
auth provider, password store, or email sender.

- Login links to `/forgot-password`.
- The request calls Supabase `resetPasswordForEmail` with a redirect derived
  from the existing `NEXT_PUBLIC_APP_URL` configuration. The configured URL
  must be an HTTPS origin (HTTP is allowed for localhost development).
- `/reset-password` waits for the existing client's initialization and verifies
  the user through Supabase `getUser`. Only a Supabase `PASSWORD_RECOVERY`
  event grants access to the reset form; ordinary signed-in sessions do not.
- An observer installed when the browser singleton is created captures recovery
  events even when Navbar initializes the client before the reset page mounts.
  Event callbacks do not await auth methods while the SDK holds its lock.
- Recovery eligibility is in memory, associated with the verified user, and
  expires after 15 minutes. It is cleared on logout, user switch, or completion.
  It does not replace Supabase authorization. It survives SDK token refresh and
  refocus events, but **not a full page reload**. A reload requires a new link.
- New password submission revalidates the user and recovery eligibility and
  calls `updateUser({ password })`.
- Recovery displays confirmation, signs out with Supabase's default global
  scope, then offers Login. A sign-out failure leaves a retry button, not a
  misleading claim that logout succeeded. Revoked refresh sessions do not
  imply immediate revocation of already issued access tokens.
- Profile → Account security → Change password opens `/settings/security`.
  Both the existing proxy and the server page check authentication. Normal
  account password changes retain the current session.

## Password policy

Signup had no explicit client-side length or complexity rules. Signup, recovery,
and account changes now share a minimum of 8 and maximum of 72 JavaScript string
characters, without character-class requirements. Confirmation must match
exactly; passwords are not trimmed. Supabase's server policy remains authoritative.
Weak/compromised-password, same-password, and recent-login errors receive safe
guidance. Existing accounts can still log in with their existing passwords.

## Error handling and privacy

Successful reset requests and account-specific errors show the same neutral
message. Rate limits ask the user to wait. Network/configuration/provider failures
show generic retry guidance; raw provider errors are never displayed or logged
by these flows. Both forms guard duplicate submissions synchronously and disable
controls while pending. Passwords clear after successful updates.

No analytics events were added, deliberately avoiding email, credential, and
recovery-token telemetry. No passwords are persisted outside Supabase Auth.
The reset page removes URL query/fragment data after session validation and uses
`no-referrer` metadata. Auth tokens must also be redacted in infrastructure request
logs; application code cannot configure hosted access-log retention.

## Supabase dashboard release checklist (not verified remotely)

1. Set production `NEXT_PUBLIC_APP_URL=https://www.axvital.com`; local development
   uses `http://localhost:3000`. Rebuild after changing this public build variable.
2. In Auth URL Configuration, verify the Site URL and allow exactly:
   - `https://www.axvital.com/reset-password`
   - `http://localhost:3000/reset-password`
3. Inspect the existing Recovery email template. The reset action should preserve
   Supabase's generated `{{ .ConfirmationURL }}`. Do not replace it with a bare
   `{{ .SiteURL }}` or a link that discards the recovery token. Custom token-hash
   templates pointing at a different callback require separate integration;
   this repository does not have that callback architecture.
4. Keep the existing Resend custom SMTP settings unchanged. No Resend API key is
   needed in this application. Check delivery using an approved test account.
5. Align Supabase's password policy with the shared application baseline; stronger
   dashboard policies can reject passwords the client accepts.
6. Request a reset and open the email in the **same browser/device** that made the
   request. PKCE needs that browser's verifier. Test expiry, reuse, new-password
   login, logout, and existing signup/email verification using a test account.
7. Verify the logged-in Security form and recent-login behavior with that account.

Reference: [Supabase password reset API](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
and [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

## Verification performed

- TypeScript: passed (`npm run typecheck`).
- ESLint: passed (`npm run lint`).
- Tests: 222 passed, including 15 focused auth tests. The suite includes shared
  validation, safe errors, redirect configuration, synchronous duplicate guards,
  recovery state, mocked auth calls, source integration/privacy checks, and an
  installed-Supabase-SDK PKCE/update/sign-out integration with mocked transport.
- Production build: passed (`npm run build`), including all three new routes.
- Browser: Login recovery link and unauthenticated Security redirect verified.
  Direct reset navigation displays the invalid-link state.
- Responsive checks: Login, forgot-password, and invalid-reset pages measured at
  320, 375, 390, 430, 768, and 1024 px with no horizontal overflow. Forgot-password
  input is 48 px tall; buttons/links are 44 px. The 320 px request form was visually
  inspected. Valid-session password forms were not measured in a live browser.
- Accessibility: visible labels, autocomplete, named show/hide controls, field
  descriptions/errors, status/alert announcements, feedback focus, and visible
  focus styles implemented/reviewed. Full keyboard and screen-reader testing,
  mobile software-keyboard behavior, and live authenticated UI remain unverified.
- SMTP delivery, live template/redirect settings, and real login/signup/email
  verification were not exercised. Their existing implementation/configuration
  is unchanged except for the shared signup password validation.

## File inventory

Created:

- `app/forgot-password/page.tsx`, `app/forgot-password/layout.tsx`
- `app/reset-password/page.tsx`, `app/reset-password/layout.tsx`
- `app/settings/security/page.tsx`
- `components/auth/AuthCard.tsx`, `components/auth/PasswordForm.tsx`
- `lib/auth/passwords.ts`, `lib/auth/recovery.ts`, `lib/auth/passwords.test.ts`
- `docs/password-security.md`

Modified:

- `app/login/page.tsx`: recovery link.
- `app/signup/page.tsx`: shared password policy and helper text.
- `app/profile/page.tsx`: account security entry.
- `lib/supabase/browser.ts`: early recovery-event observer on existing singleton.

No dependencies, database migrations, SMTP changes, or new auth providers.
