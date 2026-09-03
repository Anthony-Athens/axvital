# Pre-launch polish audit

## Inventory recorded before implementation

| Flow | Existing implementation | Classification / action |
| --- | --- | --- |
| Quick Log: food, supplements, medications and other quick entries | QuickLogDialog + useSheetDialog | Already stable pattern; retain |
| Add Condition | AddConditionDialog + useSheetDialog | Already stable pattern; retain |
| Add/edit activity and habit | ActivityForm, whole form scrolls | Needs stabilization |
| Habit/protocol progress on Today | ProgressModal, content-sized overlay | Needs stabilization |
| Start protocol (library and template detail) | StartProtocolModal | Needs stabilization; errors currently behind overlay |
| Symptom event logging | SymptomLogDialog, whole dialog scrolls | Needs stabilization |
| Create custom exercise | CustomExerciseForm in two overlay callers | Needs stabilization |
| Exercise library picker | ExerciseSelector, nested scrolling | Needs stabilization |
| Schedule workout | WorkoutsHome inline overlay | Needs stabilization; missing dismiss and dialog semantics |
| Archive/delete workout template | WorkoutsHome confirmation overlay | Needs focus/scroll handling and visible errors |
| Nutrition goal create/edit, including experiment inline creation | NutritionGoalForm | Stable inline form; retain (already guards uncertain saves) |
| Food/nutrition page forms | Page/inline forms or Quick Log | Stable enough; no overlay rewrite |
| Protocol create/edit activities | Full-page editors | Stable enough; retain page scrolling |
| Workout template create/edit, planned/session editors | Full-page editors; ExerciseSelector overlay above | Retain editors; fix picker |
| Experiment create/edit and target creation outside wizard | Full-page/inline forms | Stable enough; no overlay rewrite |
| Profile/MyHealth/settings/auth/account deletion | Page/inline forms | Stable enough; no overlay rewrite |
| Condition archive confirmation | Inline alertdialog | Inline confirmation, change semantics to a labelled group |
| Native confirm prompts (habit/protocol deletion) | Browser-controlled dialogs | Stable enough; retain native behavior |
| Navigation/campaign fixed headers | Navigation, not modal forms | Not relevant |

No desktop-only form dialogs identified. Inventory uses component and route source inspection; it is not a claim of real-device certification.

## Scope

Preserve database schemas, RLS, authentication, calculations, persistence contracts, billing behavior, and contact/legal behavior. No new product features or monitoring dependencies.

## Implemented changes

- Added `components/ui/SheetDialog.tsx`, reusing `useSheetDialog` and the Quick Log/Add Condition structure. This is a layout wrapper around the existing hook, not another viewport/focus implementation.
- Migrated activity/habit create/edit, progress, protocol start, symptom logging, custom exercise, exercise picker, schedule, and workout archive/delete overlays. Small desktop dialogs retain a narrow centered presentation; larger editors/pickers retain a wide centered presentation.
- Fixed mobile height, stationary header/footer, one vertical scrolling body, safe-area footer, explicit dialog label, 44px close/actions, native selects, and at least 16px text/numeric/select controls in the shared sheet. Conditional content changes the body only. Symptom severity now has a 44px control area.
- Shared hook follows visualViewport height AND offsetTop, reacts to resize/scroll and window resize, reveals focused fields within the body, restores body styles/scroll, and removes listeners/animation frames. It focuses the close button to avoid opening the keyboard automatically. Focus traps ignore disabled footer fieldsets; only the top sheet traps focus, and overlapping sheets retain the page lock until the last closes.
- Sheet submission uses a synchronous ref guard against duplicate submits and blocks dismissal during a request. Rejections render a safe per-flow alert without resetting input. Forms are unmounted on dismiss/success as before; symptom state now resets even when a parent retains the dialog component.
- Parent callbacks now propagate safe failure signals into activity/progress/protocol sheets instead of leaving errors behind the backdrop. Workout schedule errors are inside the sheet; archive/delete errors stay visible there. Exercise archive promises now have a user-facing rejection handler. Exercise picker resets temporary filters on close and restores focus after the create/back transition.
- Weekly planner closes the editor immediately after confirmed persistence. A subsequent occurrence-refresh failure reports that the activity saved, rather than leaving a create form available for accidental resubmission. No persistence contract or recurrence algorithm changed.
- Health catalog and episode errors are isolated from condition loading using independent settled results, with a visible partial-refresh notice/retry. Unavailable condition counts are not shown as zero.
- Removed redundant nested alert roles in Add Condition and Symptom Log. Changed the inline condition archive confirmation from `alertdialog` to a labelled group because it is not a modal.
- Profile demo failures use safe, actionable copy rather than raw error messages. Best-effort checkout intent telemetry catches network rejection so it does not create an unhandled promise rejection.

## Error-state audit

| Area | Finding / disposition |
| --- | --- |
| Today / planner | Existing localized load messages; progress failures now visible inside sheet. Weekly planner distinguishes save from later refresh failure. |
| Dashboard | RecentActivity already isolates failed sources, preserves previously loaded items, and provides Retry. Main check-in and optional recap handling remain separate; optional recap failure is currently indistinguishable from no recap. No dashboard calculation changed. |
| Health / MyHealth | Independent conditions/catalog/episode loads and retry notice added. Existing route error fallback retained. Condition/symptom libraries generally map database failures to local messages; session codes in symptom/exercise forms now use readable copy. |
| Nutrition | Goal form already preserves input, validates locally, locks duplicate/uncertain saves, and exposes errors. Page/inline layout retained. Food mutations already use safe serving/save messages. |
| Workouts | Stabilized overlays, visible mutation failures, exercise archive rejection handling, and safe load failure copy. Multi-source WorkoutsHome initial load remains coupled; previously loaded lists are retained. |
| Habits | Editor/progress failures propagate to sheet. Existing native delete confirmation retained. |
| Protocols | Both Start callers propagate errors to the sheet; full-page editors retained. Protocol overview adherence reads can still share a failure path with overview loading. |
| Experiments | Existing API error allowlists, uncertain-mutation guards, and inline nutrition goal handling retained. Existing hydrated tests passed. No calculations touched. |
| Profile / account / settings | Existing friendly profile/auth/account/billing errors retained. Raw demo mutation messages removed. Contact form already preserves entries and resets only on successful delivery. |

## Production observability (repository evidence, not deployment certification)

| Mechanism | What exists / what remains unverified |
| --- | --- |
| Vercel logs | Server console events can be collected by the host. No deployment log drain, retention setting, alert destination, or live log access was verified. Repository operations runbook documents manual verification gates. |
| Server/API errors | `lib/api/boundary.ts` logs route, numeric status, and fixed operation category for returned/thrown 5xx responses. API responses use bounded codes and private/no-store caching. |
| Supabase failures | Many browser operations use development-only `logDevError`; it discards raw errors. Exercise helper logs static operation/category in development. Timeline source failures log a fixed source name/operation and return partial-source status. No universal production client database-error ingestion exists. |
| Stripe | Checkout/portal/status use guarded routes. Webhook failures previously caught inside handlePOST returned 500 without the outer logger running; returned 5xx now also emit one sanitized event. Existing thrown-error logging retained. Successful webhook IDs are persisted for deduplication. |
| Resend | Contact uses a 10-second AbortSignal timeout, checks non-OK status, returns generic failure codes, and now logs fixed configuration/provider/request categories. No email body, reply address, API key or raw provider response is logged. |
| Auth email | Supabase SMTP/Resend sender/domain credentials and delivery configuration are external. This sprint did not change or remotely verify authentication email settings. |
| Client exceptions | No Sentry or equivalent exception ingestion, global exception reporting, or alerting integration found. Existing route error UI is recovery, not exception tracking. Launch risk documented; no dependency added. |
| First-party analytics | `/api/product-events` accepts only allowlisted client intent names with no extra fields and persists user_id/event_name; completion events have separate authoritative paths. `/api/analytics` computes user insights, not exception telemetry. Product telemetry is not a substitute for error monitoring. |

## Privacy and provider findings

- Removed the WorkoutsHome development logger that printed raw error message/details/hint/status objects. Remaining application console sites inspected use static operation/category/source/status context; existing logDevError/logDevInfo discard payload arguments.
- New contact and webhook logger tests inject private provider content and assert it is absent from logs. No health events, symptoms, conditions, medication/nutrition details, experiment answers, contact contents, tokens or session secrets were added to logging.
- Provider dashboards, Vercel request logs and Supabase logs/backups may have separate metadata/retention policies. Repository source inspection cannot certify those policies.
- Stripe checkout failures already have generic user copy and guarded 5xx logs. Billing status has a manual Refresh status action; cancel/reactivation is delegated to the Stripe portal. Live status synchronization, Test Mode failures and portal return behavior require external QA. No checkout/subscription/portal behavior changed.
- Resend contact failures now have safe operational visibility. Sending failures preserve form entries. Sender verification, inbox receipt and auth SMTP delivery still need live checks. Contact validation, timeout, API contract, and legal text were left intact.

### Existing backend follow-ups (not changed)

- Add Condition inserts before its optional primary-condition RPC; failure of the second operation can leave a saved row while reporting failure. Existing uniqueness protection helps with retries, but atomicity requires a separate persistence review.
- Symptom logging inserts an event then associations and attempts rollback if associations fail; the rollback response is not checked. Optional My Symptoms hydration is deliberately best-effort. No transaction/migration was introduced here.
- Stripe webhook duplicate lookup uses the returned data without separately checking the lookup error. Provider retry/deduplication behavior should be exercised in Test Mode as part of billing launch QA.

## Validation

- Final `npm run typecheck`, `npm run lint` (zero warnings/errors), and `npm run build`: passed. `git diff --check`: passed.
- Main test run: 564 tests passed; three esbuild UI files were blocked by sandbox dependency access. With that access enabled, all 15 tests in those files passed (conditions, nutrition goals, hydrated experiment results).
- New production-observability tests: 2 passed, covering handled webhook 500 visibility and contact log privacy.
- `scripts/prelaunch-mobile-check.mjs` bundles actual components with synthetic persistence/provider fixtures, serves production CSS locally, and runs headless Chromium. No live user data or provider writes. It checks eight modal variants at 320px, 390px and 1024px; horizontal bounds, fixed controls, visible footer/close, focused controls, Tab/Shift+Tab, scroll unlock, conditional fields, simulated keyboard height/offset changes, duplicate submission, failure preservation and success reset.
- Final browser run: all eight modal variants passed at each of 320px, 390px and 1024px, including focused-field visibility after simulated keyboard changes. Failure/success checks passed for six form flows; no browser exceptions. The 320px screenshot was visually inspected.
- Screenshots are generated to ignored `coverage/prelaunch-{width}.png`. Browser script requires an existing Playwright package/browser; it installs nothing. Use PLAYWRIGHT_MODULE for the installed package path and optional PLAYWRIGHT_CHANNEL=chrome for installed Chrome, after `npm run build`.
- Real on-screen keyboard, iOS rubber-band/browser-chrome behavior, orientation rotation, native picker touch interaction, screen-reader behavior and live authenticated saves remain manual QA. Mocked success is not proof of a live Supabase/Stripe/Resend integration.

## Files

Created: `components/ui/SheetDialog.tsx`, `lib/api/production-observability.test.ts`, `scripts/prelaunch-mobile-check.mjs`, `docs/prelaunch-polish.md`.

Modified:
- `components/ui/useSheetDialog.ts`
- `components/planner/ActivityForm.tsx`, `TodayPlan.tsx`, `WeeklyPlanner.tsx`
- `components/habits/ProgressModal.tsx`, `HabitDetail.tsx`, `HabitsDashboard.tsx`
- `components/protocols/StartProtocolModal.tsx`, `ProtocolsHome.tsx`, `TemplateDetail.tsx`
- `components/symptoms/SymptomLogDialog.tsx`
- `components/workouts/CustomExerciseForm.tsx`, `ExerciseSelector.tsx`, `WorkoutsHome.tsx`
- `components/health/AddConditionDialog.tsx`, `ConditionManager.tsx`, `HealthHome.tsx`
- `components/billing/CheckoutButton.tsx`
- `app/profile/page.tsx`, `app/api/contact/route.ts`, `app/api/stripe/webhook/route.ts`

No migration required. No schemas, RLS, auth, billing algorithms, nutrition totals, experiment calculations, workout/habit/protocol algorithms, dashboard calculations or legal text changed. No packages added.
