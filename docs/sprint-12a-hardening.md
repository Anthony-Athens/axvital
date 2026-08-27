# Sprint 12A — Data Integrity & Security Hardening

Date: 2026-08-27. Scope: repository hardening, not a feature sprint.

**Status:** repository implementation and local validation complete. Deployment, live policy verification, and signed-in end-to-end QA remain **OWNER ACTION REQUIRED**. Do not interpret the local database tests as certification of the deployed Supabase project. Do not begin Sprint 12B until the staging gates below pass.

## Backlog mapping and implementation

| Sprint 11 item | Change |
| --- | --- |
| B04, B24 | Load check-ins by authenticated owner and explicit local calendar date; no invented answers; preserve historical dates in form, Timeline, and analysis inputs. |
| B06 | Restrictive owner and private-parent policies, measurement relationship checks, browser billing/event privilege revocation, executable PostgreSQL isolation tests. |
| B07 | Server authentication, bounded inputs, shared atomic request budgets, client-intent event allowlist. |
| B19 | Payload-free operation logs and consistent private/no-store API responses. |
| B25 | Development-only demo guards and insert-only collision handling. |
| B03, B09 | Deliberate dependency upgrades, clean install, automated tests, production build, responsive and anonymous-access smoke checks. |

No navigation redesign, pricing change, Experiments 2.0, voice work, or new analytics funnel was implemented.

### Check-in write contract

- An empty day has an empty answer map, 0% progress, and no database write on view. Unknown answers remain SQL null; `false` alcohol is a real answer.
- Load authenticates and queries exactly `user_id + checkin_date`. Loading or failed loading disables editing and saving. Existing partial rows show **Saved · partial**, not Completed.
- Save re-authenticates and verifies the loaded owner/date. Updates include only changed answer/weight fields. Notes, tags, and other fields are not included in the update.
- Each changed field is compared with its loaded value in the update predicate. A competing edit to that field fails rather than overwriting it. Changes to unrelated fields survive and are returned to the UI.
- New rows use INSERT, never UPSERT. The unique owner/date key rejects concurrent inserts. Returned database rows populate the form after success. Even a no-op save reloads the row.
- Failed saves retain the draft and display an error. No automatic retry overwrites competing changes. User sign-in changes clear the previously loaded account's form and require reload.
- Historical links use `/today?date=YYYY-MM-DD#daily-checkin`. Historical mode clearly displays the date and hides today's planner/Quick Add. Invalid, duplicate, impossible, or future date parameters show an error, not a silently selected replacement date.
- Legacy persisted option labels remain visible instead of becoming invisible selected values. The seven answer columns now explicitly permit null; existing values are not rewritten.

### Calendar dates and Timeline

`lib/timeline/dates.ts` owns calendar parsing, local-day ranges, safe formatting, and zone-aware daily analysis anchors. Today's form waits for the browser's local date before loading. The Quick Add date no longer uses a UTC slice.

Check-in Timeline events carry `logicalDate = checkin_date`. `updated_at` is never their Timeline date. Their stable ID remains `daily_checkin:<source id>`, with date-specific detail/edit links and a **Daily** clock label. Malformed stored check-in dates are omitted; malformed timestamp display falls back safely. Source adapters remain separate: manual Exercise and completed Workout events are not deduplicated.

The inspection also found `updated_at` relocating check-in observations in Trigger Analysis and Outlook. Those paths now use the check-in date and requested timezone; daily planned observations use their scheduled date. Noon is an explicit analysis anchor for a daily observation, not a claimed event time. This does not add new prediction features or change clinical claims.

## Files changed

| Area | Files |
| --- | --- |
| Form and persistence | `app/checkin/page.tsx`, `lib/checkins/persistence.ts`, `lib/checkins/persistence.test.ts`, `lib/types.ts` |
| Timeline/date consumers | `lib/timeline/dates.ts`, `types.ts`, `sources/checkins.ts`, `timeline.test.ts`; `components/timeline/Timeline.tsx`, `HealthTimelinePage.tsx`; `components/ui/CollapsibleSection.tsx`; `lib/trigger-analysis/service.ts`, `lib/episode-outlook/service.ts` |
| API boundaries | `lib/api/guard.ts`, `boundary.ts`, `validation.ts`, `validation.test.ts`; all ten `app/api/**/route.ts` files (eleven method operations, counting Weekly Recap GET and POST) |
| Event boundary | `lib/product-events.ts`, `components/billing/CheckoutButton.tsx` |
| Demo/logging/routes | `lib/checkins/demo.ts`, `app/profile/page.tsx`, `lib/app-errors.ts`, `lib/workouts/exercises.ts`, `lib/supabase/routes.ts`, `middleware.ts`, `lib/auth/passwords.test.ts` |
| Database | The two migrations below, `lib/security/database.test.ts`, `supabase/tests/sprint12_preflight.sql` |
| Dependencies/evidence | `package.json`, `package-lock.json`, this report |

## Forward migrations

1. `supabase/migrations/202608270001_integrity_owner_hardening.sql`
   - Enables/verifies RLS through ALTER statements on the reviewed private inventory and adds restrictive owner policies.
   - Retains existing permissive CRUD policies and grants; it does **not** add broader owner access to the undocumented original tables.
   - Adds restrictive policies for single-column private foreign keys from a fixed table inventory. PostgreSQL evaluates parent visibility under the caller's RLS. Composite owner foreign keys already enforce matching owners and are retained.
   - Protects custom exercise references while preserving shared exercise access.
   - Requires measurements to reference an outcome in the same experiment and an owned polymorphic source. The composite outcome FK is initially `NOT VALID`: new writes are checked, existing mismatches are hidden by policy pending owner review.
   - Revokes browser-role writes to subscriptions and all browser-role access to operational product/webhook events. Service-role privileges are not expanded.
   - Removes default answers/NOT NULL from the seven check-in answer columns and ensures a unique owner/date index. No existing health rows are deleted or rewritten.
2. `supabase/migrations/202608270002_api_budgets.sql`
   - Creates a private counter table and one narrowly granted, security-definer function with an empty search path.
   - Authenticated callers can consume only their own budget. Limits and route names are server/database allowlisted; callers cannot choose a user, maximum, or arbitrary bucket.

**Order matters:** apply both migrations successfully before deploying the new application. A missing budget function returns 503 rather than bypassing protection. Do not roll back by disabling RLS or restoring unsafe policies.

## Ownership review

The following is **migration-state review**, not a claim about live policies. S/I/U/D means SELECT/INSERT/UPDATE/DELETE. For owner tables, UPDATE checks both the old visible row and the new owner. Restrictive relationship checks apply to reads and mutations, including attempts to replace an owned link with another user's UUID.

| Tables | S/I/U/D policy behavior after this sprint | Parent/link checks |
| --- | --- | --- |
| `profiles` | Existing policies retained; all operations constrained to `id = auth.uid()` | Original CREATE TABLE/policies are absent from repository; staging inspection required. |
| `daily_checkins`, `health_events`, `weekly_recaps` | Existing policies retained; all operations constrained to `user_id = auth.uid()` | Original CREATE TABLE/policies absent; no new permissive access. |
| `planned_activities`, `planned_activity_occurrences` | Owner S/I/U/D | Composite activity/owner FK; protocol attachment guarded. These tables implement habits. |
| `protocol_templates`, `protocol_template_activities`, `user_protocols`, `user_protocol_activities`, `protocol_pause_periods` | Owner S/I/U/D | Existing composite owner FKs retained; optional workout-template link now guarded. |
| `exercises` | Authenticated SELECT shared or own; I/U/D own, non-null owner only | Shared catalog rows cannot be changed by browser users. Private references must be owned. |
| `workout_templates`, `workout_template_groups`, `workout_template_exercises`, `workout_template_sets` | Owner S/I/U/D | Template/group/exercise/set parent visibility now checked, not just child `user_id`. |
| `planned_workouts`, `planned_workout_exercises`, `planned_workout_sets` | Owner S/I/U/D | Template, activity, occurrence, protocol, parent workout/exercise, and source-template references guarded. |
| `workout_sessions`, `workout_session_exercises`, `workout_session_sets` | Owner S/I/U/D | Planned/source workout, session, exercise, and set references guarded. |
| `user_conditions`, `user_symptoms`, `user_symptom_events` | Owner S/I/U/D | Shared condition/symptom catalogs remain authenticated read-only. |
| `symptom_event_conditions` | S/I/D only; no UPDATE policy | Both symptom-event and condition owners checked. |
| `condition_episodes`, `episode_updates`, `episode_symptom_links` | Owner or owner-parent S/I/U/D | Conditions, episodes, and symptom events must all be visible to the owner. |
| `user_foods`, `nutrition_entries`, `user_food_preferences`, `saved_meals`, `nutrition_targets` | Owner S/I/U/D | Optional saved-meal attachment now guarded. Shared foods/servings remain read-only. |
| `nutrition_entry_items`, `saved_meal_items` | Parent-owner S/I/U/D | Entry/meal owner and private food owner checked. Existing saved-meal serving validation retained. |
| `experiments`, `experiment_phase_events` | Owner S/I/U/D | Phase-event parent ownership checked. |
| `experiment_interventions`, `experiment_outcomes`, `experiment_condition_links`, `experiment_results` | Experiment-owner S/I/U/D | Conditions, protocols, planned activities, workout templates and experiment parent all guarded. Results remain owner-authored personal analysis, not billing authority. |
| `experiment_measurements` | Owner plus experiment-parent S/I/U/D | Outcome must belong to that experiment; referenced check-in/event/workout/occurrence must be owned. Manual/calculated rows cannot attach a source UUID. |
| `subscriptions` | Owner SELECT only; browser I/U/D revoked | Stripe/service-role writes only. |
| `product_events`, `stripe_webhook_events`, `api_request_budgets` | No browser table access | Narrow server insertion/signature verification/budget RPC respectively. |

Also reviewed the existing security-invoker workout-template management functions, experiment transition function, and nutrition saved-meal flow. No service-role key was moved into client code. RLS is not replaced by page redirects.

### Material database evidence

The dev-only PGlite dependency runs actual PostgreSQL, not a mocked RLS evaluator. The test executes **every migration unmodified**, then exercises authenticated and anonymous roles with synthetic A/B identities and permissive grants resembling Supabase defaults. It asserts RLS is enabled on every migrated public table. The read-only owner preflight script is also executed for syntax validation. [PGlite runtime documentation](https://pglite.dev/docs/).

Negative tests cover cross-owner SELECT/UPDATE/DELETE on populated representative records across check-ins, profiles, events, conditions, symptoms, episodes, nutrition, habits, protocols, workouts, experiments, outcomes and results. They reject cross-owner condition/intervention/outcome/source attachments, billing writes, authoritative product-event table writes, anonymous check-in writes, and direct budget-table access. Positive partial check-in writes and own experiment measurements work. Duplicate owner/date INSERTs fail. Repeated budget calls reach the limit.

**Limitation:** the original four table definitions are missing from migration history. Tests supply a clearly labeled synthetic baseline and synthetic existing owner policies for them. The tests do not emulate Supabase Auth, PostgREST, Vercel, deployed default grants, JWT issuance, production data volume, or concurrent multi-process HTTP traffic. Other reviewed child policies are exercised by migration execution and the shared policy contract, not exhaustive per-table CRUD fixtures.

## API authorization and abuse controls

All success **and error** responses from guarded routes receive `Cache-Control: private, no-store`, including Free previews. HEAD uses the corresponding GET budget. No sensitive API is classified PUBLIC after hardening; public marketing and auth-entry pages remain public.

| Route/method | Boundary | Per account/minute | Input bounds |
| --- | --- | ---: | --- |
| `/api/analytics` GET | AUTHENTICATED | 20 | Windows 7/30/90; existing 97-day source range bounded and aligned with logical dates; valid timezone. |
| `/api/timeline` GET | AUTHENTICATED | 60 | Up to 32 logical days; timestamp range bounded, ordered, aligned. |
| `/api/weekly-recap` GET / POST | AUTHENTICATED | 30 / 6 | POST validates the existing 97-day analysis inputs and exact allowed keys. |
| `/api/trigger-patterns` GET | AUTHENTICATED Free preview; PREMIUM analysis | 12 | Strict UUID, timezone, windows 24/48/72/168; existing 180-day episode horizon retained. |
| `/api/condition-outlook` GET | AUTHENTICATED Free preview; PREMIUM analysis | 12 | Strict UUID/timezone; existing 730-day episode horizon retained. |
| `/api/product-events` POST | AUTHENTICATED client intent only | 30 | Only `event`; only `pricing_viewed` / `upgrade_clicked`. |
| `/api/billing/checkout` POST | AUTHENTICATED | 3 | Only server-allowlisted `interval`; no client price/customer/user authority. |
| `/api/billing/portal` POST | AUTHENTICATED | 6 | No input fields; customer resolved from owner's subscription. |
| `/api/billing/status` GET | AUTHENTICATED | 60 | No query fields; owner projection only. |
| `/api/stripe/webhook` POST | SERVER/WEBHOOK ONLY | No account throttle | Signature required, streamed raw body capped at 1 MiB; event-ID deduplication retained. |

Guarded URLs are capped at 2,048 characters. JSON bodies are streamed/count-bounded at 8 KiB even without Content-Length. JSON primitives/arrays, unexpected fields, duplicate query keys, malformed dates/timezones, and disjoint ranges are rejected. Browser POST Origin, when supplied, must match the request origin. Authorization is established before computation or service-role insertion.

### Rate-limit strategy

The authenticated Supabase RPC atomically increments a fixed-minute bucket. Its primary key is `(user_id, route_key)`: at most ten rows per account, rather than accumulating one row per request. Counter values saturate after rejection; windows reset on the next request. Serverless instances share the same database counter. No new rate-limit vendor or process-local fallback is used. Denied calls return 429 with Retry-After 60; storage/auth uncertainty fails closed.

This is application cost control, **not** perimeter DDoS protection. It does not throttle direct Supabase table writes, signup attacks, or requests rejected before the budget RPC. A fixed-window boundary permits a short burst across adjacent minutes. Provider quotas/WAF rules and production-volume query plans remain owner responsibilities. Webhook retries are not throttled using spoofable client IP headers.

### Product events

Anonymous ingestion is intentionally removed, including anonymous pricing telemetry. Signed-in browsers can report only the two intent names above. The client `checkout_started` emitter was removed; no replacement completion funnel is introduced. `premium_activated`, checkout completion, signup/first-log completion, and future authoritative lifecycle events cannot enter through the browser endpoint. Their existing names remain available for future trusted server code. Previously collected event rows are **not retroactively trustworthy** and should not be used as proof of conversion.

## Sensitive logging and demo safety

`logDevError`, `logDevInfo`, and the exercise database logger discard supplied provider/payload objects. Operational error output is limited to a static operation/route, HTTP status where available, and a generic category. Timeline's existing source-failure log has only source name and operation. No health values, record UUIDs, notes, hypotheses, Stripe objects, or raw provider errors are added to production logs.

Demo generation/deletion requires a development build at execution time, not merely a hidden button. Generation checks owner/date collisions before any insert and performs a batch INSERT with the database unique key as its race safeguard. It never deletes or upserts before seeding. New records use the dedicated `axvital-demo-v12` marker; deletion targets only that marker for the current owner. Legacy rows marked only `demo` are deliberately not automatically removed. A later event-insert failure may leave newly inserted demo check-ins; the tool does not attempt a destructive rollback. Use a fresh isolated development account.

## Dependency remediation

No `npm audit fix --force`, major framework upgrade, or dependency override was used. Registry metadata showed Next 16.3.3 ships patched PostCSS and permits patched Sharp; Next/eslint-config-next were aligned. Tailwind was updated within v4. Remaining vulnerable transitives were refreshed within their declared ranges, then `npm ci` verified the lockfile.

| Package | Before | Severity / relationship | After | Final audit |
| --- | --- | --- | --- | --- |
| `next` | 16.2.9 | High; direct runtime | 16.3.3 | Clear |
| `eslint-config-next` | 16.2.9 | Framework-coupled dev dependency | 16.3.3 | Clear |
| `sharp` | 0.34.5 | High; Next optional runtime | 0.35.4 | Clear |
| `postcss` | 8.4.31 / 8.5.15 | High; Next / Tailwind transitive | 8.5.23 / 8.5.26 | Clear |
| `nanoid` | 3.3.15 | High; transitive | 3.3.18 | Clear |
| `brace-expansion` | 1.1.15 / 5.0.6 | High; ESLint transitives | 1.1.18 / 5.0.9 | Clear |
| `js-yaml` | 4.2.0 | High; ESLint transitive | 4.3.2 | Clear |
| `@tailwindcss/postcss` | 4.3.1 | Moderate via PostCSS; direct dev dependency | 4.3.3 | Clear |

Before: **7 affected packages, 6 high / 1 moderate**. After clean install: **0 advisories**, full audit including dev dependencies. The lockfile retains the two expected PostCSS versions, updated framework/native binaries, patched transitives, and the single dev-only `@electric-sql/pglite@0.5.8` addition. `npm ls` reports a valid dependency tree. No exploit was demonstrated; absence of a demonstrated exploit was not used to dismiss an advisory. Audit results are a dated registry snapshot, not a guarantee against future findings.

## Automated and smoke validation

| Check | Result |
| --- | --- |
| `npm ci` | Passed; lockfile install reproducible. |
| `npm audit --json` | Passed; zero advisories after clean install. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed, no errors or warnings. |
| `npm test` | 248 passed, zero failed/skipped. |
| `npm run build` | Passed, Next 16.3.3 production build. |
| `git diff --check` | Passed. |
| Sharp | Synthetic PNG decoded, resized from 64×48 to 32×24, encoded/decoded as WebP. No current application `next/image` component was found, so a real user-image optimization flow was not exercised. |
| Production HTTP, anonymous | 12 private page requests returned 307 to sign-in; all 10 guarded API operations returned 401 with private/no-store; unsigned webhook returned 400 with private/no-store. |
| Browser responsive | Home, Pricing, Login, Signup, Forgot Password, Reset Password at 320/768/1280: 18 checks, no horizontal overflow or application-error screen. Narrow Pricing screenshot visually inspected; Tailwind styles rendered. |

The 17 requested regression areas are covered by persistence/date tests, Timeline tests, API-boundary tests and actual PostgreSQL isolation tests. Save-failure preservation and reload authority are tested through the production persistence contract with an in-memory Supabase query fixture; these are not substitutes for the signed-in browser workflow. Tests also cover competing edits, partial inserts, false alcohol values, impossible dates, local-vs-UTC boundaries, DST and the international date line, event allowlisting, body limits, cache headers, route protection, and demo collisions.

One pre-existing source-text test was updated to read the extracted protected-route module. Initial validation caught a source-encoding issue and a test-fixture lint issue; both were fixed before the successful checks above. Node's existing typeless-package warning remains; no module-system migration was performed.

### Manual QA actually performed

Only public UI and anonymous-access behavior were exercised against the local production build. No real user's records were queried for QA, no account was created, no password reset was sent, and no Stripe purchase or portal mutation was made. Signed-in Today reload/historical editing, nutrition/symptom logging, episode/workout/experiment access, Insights/Recap generation, logout, and billing behavior were **not manually verified** because an isolated approved account and migrated staging provider were not available.

## OWNER ACTION REQUIRED

1. **Staging and recovery:** take/verify a backup and restore procedure. Use a staging Supabase project with the same deployed schema, not a real user's health history. Review provider regions, production environment keys, auth redirect settings and the disabled production billing bypass separately.
2. **Preflight:** run `supabase/tests/sprint12_preflight.sql` as an authorized database administrator on staging. It is read-only and reports schema/policies and cross-owner/duplicate counts without printing health rows. Compare the original four tables and their policies with the app's expected fields. Confirm existing owner SELECT/INSERT/UPDATE/DELETE behavior; the new migration intentionally does not grant missing permissive access. Check for table-level constraints that separately require all seven answers. Resolve any duplicate owner/date records or cross-owner links through reviewed recovery work; do not automatically delete them.
3. **Apply migrations in order**, first staging, then production only after review. Re-run the preflight. Review legacy polymorphic measurement references as well; that script's FK counts cannot validate every polymorphic source. After resolving any historical same-experiment mismatch, run `ALTER TABLE public.experiment_measurements VALIDATE CONSTRAINT measurement_outcome_experiment;`. Do not assume hidden legacy links were repaired by RLS.
4. **Deployed negative tests:** create two isolated accounts A and B through the normal Auth flow. Using each account's real JWT/PostgREST session, repeat the cross-owner SELECT/UPDATE/DELETE and experiment condition/protocol/planned-activity/workout/outcome/source-link attempts from `lib/security/database.test.ts`. Verify rejected inserts/updates, no returned B records, and no deleted B rows. Do not use a service-role session for these negative tests. Verify anon cannot read/write private tables and authenticated users cannot write subscriptions or access product/webhook/budget tables directly.
5. **17-step browser workflow:** sign in as fresh A; open Today and confirm 0%; answer two questions; verify 29%; save, refresh, navigate away/back and compare exact values. Save a second synthetic date via `?date=YYYY-MM-DD`; open Timeline and edit that historical event; change one answer and save. Verify the old date changes, today's row does not, and the Timeline date stays fixed. Simulate a failed save and verify draft retention; separately test another-tab same-field conflicts. Try invalid/future URLs and a timezone near midnight.
6. **API deployment checks:** from A, verify each valid route, Free and Premium previews, 400/413 invalid inputs, 429 after the documented budget, Retry-After, and private/no-store on success/error. Verify budget denial/failure never calls the expensive operation. Confirm the request Origin check behind the actual deployment proxy. Confirm a missing/unavailable RPC yields 503. Verify authoritative browser product events return 400 when authenticated and 401 when anonymous, with no inserted row. Check Vercel cache headers and minimal logs.
7. **Feature smoke using only synthetic data:** login/logout, recovery entry, nutrition and symptom logging, condition/episode access, workouts, experiments, Insights, Weekly Recap, pricing and billing. Use Stripe Test Mode to verify changed authorization paths and webhook signature/retry behavior; no live purchase is needed for this sprint. Existing checkout/customer creation and webhook ordering/retry semantics were retained, not redesigned or production-certified here.
8. **Release gates:** deploy app only after migrations, confirm production policy/privilege state, repeat smoke checks, and monitor generic 429/503/error counts. Apply provider-side abuse controls/quotas appropriate to traffic. Do not treat the client API budget as protection for direct database access or the public auth provider.

## Remaining risks and Sprint 12B recommendation

No known failing repository check or remaining npm advisory is left. The important unresolved gates are the missing historical baseline DDL, existing production data/policy drift, unvalidated legacy measurement relationships, provider configuration/recovery checks, and signed-in end-to-end QA. Restrictive policies can hide existing invalid relationships and cause previously accepted writes to fail; that is intentional fail-closed behavior requiring reviewed cleanup, not automatic data repair. Aggregate services still depend on provider row limits and existing analysis methods; high-volume completeness/performance and clinical validity are not certified by this sprint.

**Hold Sprint 12B until the owner staging gates pass.** Repository review and deployment preparation can proceed. This report does not declare the production Definition of Done satisfied, and Sprint 12B was not started.
