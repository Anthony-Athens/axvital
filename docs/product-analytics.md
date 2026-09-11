# Product analytics and owner notifications

This change is review-only: no deployment, secrets, database migration, database webhook or production data was changed by the implementation task.

## Required rollout steps

1. Review and apply `supabase/migrations/202609100001_product_milestones.sql` through the usual migration process before deploying this code. It uses the existing `product_events` table, adds a service-role-only claim function, and baselines existing accounts, health records, check-ins and subscriptions. It does not change Auth triggers, profiles, RLS policies or subscription provisioning. Baseline rows are suppression markers, not newly observed conversions; no historical analytics or email is emitted.
2. Set server-only `AXVITAL_ADMIN_EMAIL` and `AXVITAL_SIGNUP_WEBHOOK_SECRET` (a randomly generated secret of at least 32 characters). Reuse existing `RESEND_API_KEY` and verified `AXVITAL_EMAIL_FROM`. Support/contact recipients are not used as the owner recipient because their purpose differs. No actual secret files were edited.
3. Notifications require `VERCEL_ENV=production`. For deliberate local/preview testing only, set `AXVITAL_NOTIFICATIONS_ALLOW_NON_PRODUCTION=true` and use a test recipient. `NODE_ENV=production` alone never enables email.
4. In Supabase → Database → Webhooks, add one asynchronous **INSERT** webhook on **public.profiles**, POST to `https://<production-domain>/api/notifications/signup`, with `Content-Type: application/json` and `Authorization: Bearer <AXVITAL_SIGNUP_WEBHOOK_SECRET>`. Do not choose UPDATE or an Auth “before user created” hook. The existing Auth `on_auth_user_created` / `handle_new_user()` trigger continues to create profiles unchanged. Standard Supabase webhook payloads contain profile fields; the handler only uses the ID, never logs the body, and never sends that body to Analytics or Resend. Configure only against the intended environment.
5. In Vercel → AXVital project → Analytics, enable **Web Analytics**, then deploy through the normal review workflow. Custom events require **Pro or Enterprise**. Pageviews use the supported `@vercel/analytics/next` component in the root layout.
6. Ensure the existing Stripe webhook subscription includes `invoice.paid` (already handled by this application's webhook). Keep the existing signing secret and event subscriptions. No success-page trigger or second billing integration is introduced.
7. With test services, verify one signup, one monthly and one annual checkout, invoice retry, one check-in and one quick-add health event. Check Resend delivery and the Vercel dashboard. Local tests mock provider delivery; they do not prove live dashboard/service configuration.

Sources: [Vercel custom events](https://vercel.com/docs/analytics/custom-events), [Supabase database webhooks](https://supabase.com/docs/guides/database/webhooks).

## Events and exact integration points

| Event | Fires at | Properties |
|---|---|---|
| Pageview | Root `ProductAnalytics` on navigation throughout the app | Public path or `/app`; no URL query/hash |
| Signup Started | `app/signup/page.tsx` after password validation, immediately before existing Supabase signup request | None |
| Account Created | Protected signup webhook, after Auth account lookup and successful profile-backed `signup_completed` claim | None |
| First Health Event Logged | Quick-add in `app/checkin/page.tsx` reports after successful insert; `/api/product-events` verifies exactly one persisted record and claims `first_health_event` | None |
| First Daily Check In Completed | `saveCheckin` reports after successful new-row save; `/api/product-events` verifies exactly one persisted record and claims `first_daily_checkin` | None |
| Experiment Created | `app/api/experiments/v2/draft/route.ts` after the existing atomic draft handler returns HTTP 201 | None |
| Checkout Started | Existing `CheckoutButton`, after checkout API succeeds with a URL, immediately before redirect to Stripe | `billing_interval`: `monthly` or `annual` |
| Paid Subscription Started | Existing signed Stripe webhook on positive `invoice.paid`, after subscription sync and successful first-paid claim | `billing_interval`: `monthly` or `annual` |

First-event checks deliberately favor undercounting over false claims. If the report arrives after multiple records have been saved, it skips the event. Once claimed, deletion/recreation does not cause another event. Existing records are baselined during migration. Completely deleted historical records cannot be reconstructed; “first” means first determinable from retained state. Legacy/import/demo paths are not instrumented. Only the active v2 atomic experiment creation endpoint is instrumented; incomplete legacy multi-write draft creation is not counted. Browser blockers/network failures can also prevent best-effort events.

## Notifications and duplicate prevention

Signup success remains the existing browser → Supabase Auth flow. Supabase asynchronously reports the profile insertion. The protected handler fetches the Auth account, checks the persisted profile and claims its milestone before scheduling email with Next.js `after()`. Repeated signup requests that do not create a real account/profile never generate account conversions.

The paid hook accepts only a paid invoice with a positive amount, matching customer/subscription projection and one of the configured monthly/annual prices. It runs after existing subscription synchronization. A zero-dollar invoice, trial start, subscription creation alone or success URL is insufficient. A later positive invoice after a free trial can qualify. The email includes account email, interval, formatted amount and paid timestamp; no health data or card information.

Both use `claim_product_milestone`: a PostgreSQL transaction advisory lock serializes claims per account/event; an existing row suppresses subsequent deliveries. This also suppresses different paid invoices/events for the same account, beyond the existing Stripe event-ID retry ledger. The function is inaccessible to anonymous/authenticated clients. All state remains in the existing `product_events` table, with existing account deletion handling.

Delivery is **at most once, best effort**, not a durable email queue. A claimed milestone remains claimed if Resend fails, the process crashes, or scheduling fails. This prevents duplicates even on ambiguous provider timeouts and long-delayed Stripe retries, but can lose an owner email/event. Failures produce fixed-category logs, not provider bodies, email addresses, record IDs or secrets. Signup webhook processing errors can be inspected/replayed before a claim; do not automatically delete claims to retry ambiguous delivery. Supabase webhook network failures require operational inspection; this implementation does not add a delivery scheduler.

The migration conservatively suppresses all preexisting Stripe subscription IDs, including incomplete/canceled states: current projection data cannot prove their payment history. This avoids announcing existing members on renewals, at the cost of missing a first payment from a pre-rollout incomplete subscription. No historical payment reconciliation or backfill is introduced.

## Privacy and failure boundaries

The client and server helpers accept only enumerated event names. They reconstruct metadata as an empty object or a monthly/annual classification, never forward arbitrary objects, identifiers or health fields. Client `beforeSend` strips URL query/hash and collapses every private/unknown path to `/app`. Global `Referrer-Policy: no-referrer` prevents application paths from leaking via outgoing referrers. This intentionally gives up detailed private-page analytics.

Server events use the supported Vercel SDK with empty explicit headers: no forwarding of cookies, user-agent, IP or referrer from Auth/Stripe/application requests. Because the SDK still derives the request URL from Vercel context, the wrapper allows only four fixed API paths and skips query-bearing requests. Webhook events are server-originated conversions and cannot be accurately attributed to a browser visitor funnel; no identity stitching is attempted.

Analytics is not an audit log. Provider delivery and browser script execution are best effort. Analytics scheduling and email errors never roll back saved data or break primary provisioning. No health/PHI values, names, emails, Supabase IDs, Stripe IDs or record IDs are supplied to Vercel by the instrumentation. Vercel still performs its standard pageview network/visitor processing; this is not a claim that its infrastructure receives no technical request data.

The dependency added is `@vercel/analytics`; Resend continues to use its existing HTTP API pattern, without an additional SDK. No cookies/banner, advertising analytics vendor, new auth flow, new subscription system, success-page conversion, deployment, production data edit or secret modification is included.

## Review file manifest

Modified:

- `.env.example`
- `package.json`
- `package-lock.json`
- `next.config.ts`
- `app/layout.tsx`
- `app/signup/page.tsx`
- `app/checkin/page.tsx`
- `app/privacy/page.tsx`
- `app/api/experiments/v2/draft/route.ts`
- `app/api/product-events/route.ts`
- `app/api/stripe/webhook/route.ts`
- `components/billing/CheckoutButton.tsx`
- `lib/checkins/persistence.ts`
- `lib/api/production-observability.test.ts`

Added:

- `components/ProductAnalytics.tsx`
- `lib/telemetry/policy.ts`
- `lib/telemetry/client.ts`
- `lib/telemetry/activation.ts`
- `lib/telemetry/server.ts`
- `lib/telemetry/telemetry.test.ts`
- `lib/notifications/owner.ts`
- `lib/notifications/paid.ts`
- `app/api/notifications/signup/route.ts`
- `supabase/migrations/202609100001_product_milestones.sql`
- `docs/product-analytics.md`

## Local verification

Production build and TypeScript passed. The full test suite passed 588 tests; the final focused telemetry suite passed eight tests, including an additional end-to-end mocked Stripe route retry/failure check. Coverage includes layout analytics wiring, URL/property filtering, environment gating, verified signup and duplicate suppression, Resend failure isolation, both billing intervals, paid invoice qualification, server header stripping, real PostgreSQL milestone claims and role denial. The existing suite exercises checkout/customer coordination, subscription synchronization, health-event validation and check-in persistence. Provider calls are mocked: no real accounts, charges, owner emails or production data were created. UI test bundling required running outside the filesystem sandbox because esbuild could not read the parent directory inside it.


## Condition marketing funnel extension

See `docs/condition-campaigns.md` for the current campaign policy, launch steps and limitations. Known public condition pages now retain their clean path in pageviews. The existing client SDK also receives Condition Marketing Viewed, Condition Marketing CTA Clicked, Signup Viewed, Signup Started, and conservative browser Signup Completed events with reconstructed source_page/approved UTM properties. This scoped exception supersedes the earlier statement that every event has only empty or billing-interval properties. Private routes, existing server milestones, header stripping and no-referrer policy remain unchanged. Account Created is still the authoritative deduplicated total and has no campaign attribution; do not add it to browser Signup Completed counts. No health/account fields or advertising scripts were added.
