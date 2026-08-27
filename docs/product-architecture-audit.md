# Sprint 11 — Product Architecture & UX Audit

Audit date: 2026-08-27. Scope: repository implementation, local browser checks, npm advisory registry. This is a product review, not a penetration test, legal opinion, clinical validation, or accessibility certification.

## 1. Executive summary

**Do not begin broader marketing yet.** AXVital has substantial tracking infrastructure, but its core promise is interrupted between recording, understanding, and testing. Navigation favors workouts and planning; health and learning are secondary. Several schemas and entitlement names imply capabilities that their UIs do not deliver.

The most consequential findings are:

1. **Experiments have no results experience:** both detail and results routes render `ExperimentDetail`, which never renders the fetched result. Measurement/adherence configuration is incomplete. A user can invest weeks without receiving the promised answer.
2. **Today is not a reliable saved-state indicator:** all seven answers are preselected, progress starts at 100%, saved state is local, and existing check-ins are not loaded. Saving upserts a whole row. Historical timeline Edit links point to today's form. Treat this as a data-integrity issue, not just visual polish.
3. **Launch trust requirements remain unfinished:** Contact is a placeholder, Privacy/Terms explicitly remain drafts, export and account deletion are absent. Backups, delivery, production billing, and cross-account RLS require operational evidence.
4. **Pricing and implementation differ:** only condition Patterns and Outlook use server entitlements. The one-active-experiment limit and advanced Insights/Recap split are not implemented in inspected paths.
5. **Dependencies need a controlled remediation:** npm reports 7 affected packages (6 high, 1 moderate); this is not seven proven exploitable application vulnerabilities.
6. **Small defects are independently fixable:** wrong signup CTA destination, check-in payload logging, nutrition error-detail logging, missing search labels, and misleading custom-food CTA.

No navigation redesign, model change, pricing change, schema migration, voice logging, or Sprint 12 implementation is authorized by this document.

### Evidence and limits

- Enumerated all 48 `app/**/page.tsx` files, inspected their wrappers and feature components; reviewed data services, migrations, navigation, APIs, test coverage, and existing operational documents.
- Browser: local Next.js development server, in-app Chromium, anonymous session. Nine public/auth pages measured at 320, 375, 390, 430, 768, 1024, 1440 px, height 844. Seventeen app entry routes checked anonymously. These are not authenticated usability tests.
- No signed-in test account was available at audit time. Populated Today, workout execution, condition details, billing, Premium, onboarding completion, and persisted experiment workflows remain browser-unverified. No synthetic data was inserted into a real account.
- Repository policies do not establish that migrations are deployed. Provider settings, backups, SMTP, refunds, and production monitoring are unverified.
- Scores below are expert source-review judgments, not measurements from user research. Validation results are recorded at the end after safe fixes.

## 2. Current product mental model

The implementation has three overlapping models: **daily journal** (`daily_checkins`, legacy `health_events`), **activity planner** (habits, protocol activities, workouts), and **personal evidence** (conditions, episodes, patterns, experiments). Shared timeline adapters help combine history, but do not make the workflows interchangeable.

TRACK → TEST → LEARN is a useful architectural model but a poor mandatory onboarding order. Users should get descriptive value before designing an experiment. Prefer **Track → Understand → Test → Learn**, allowing users to remain in tracking indefinitely. Today should remain the daily home; Dashboard should not compete for that role.

Alternative: retain domain hubs (Health / Fitness / Nutrition) with contextual learning. This is easier for users with one domain goal, but risks duplicating Insights and hiding cross-domain relationships. Recommendation: task-oriented top level, domain pages underneath, and contextual links between them.

## 3. Route inventory

**48 page routes, including the `/checkin` compatibility alias.** Titles below are visible headings or dynamic record names, not browser metadata; most routes inherit the same root document title. Paths map directly to `app/<path>/page.tsx` (root maps to `app/page.tsx`). No standalone `/settings`, `/health/episodes`, `/nutrition`, or voice route exists.

Access legend: **P** public; **A** authenticated and included in proxy/onboarding gate; **D** authenticated data but anonymous page shell allowed (Health and Experiments omitted from `protectedRoutes`); **R** public recovery entry, valid recovery session needed to change password. Device columns: **Top** primary navigation; **More** mobile More menu; **Context** reachable through another screen; **Direct** URL/redirect only. All device entries describe code reachability, not successful populated browser testing. Gates: **None** no Premium restriction, **Premium** server-gated results, **Mismatch** advertised gate absent. Necessity is a recommendation, not a deletion instruction.

| Route | Visible title | User intent / primary action | Secondary actions | Parent location | Mobile | Desktop | Access | Gate | Necessity / overlap |
|---|---|---|---|---|---|---|---|---|---|
| `/` | Understand what affects how you feel. | Understand product / Create Free Account | Pricing, check-in, footer | Public | Direct | Direct | P | None | Keep; CTA target wrong before safe fix |
| `/login` | Welcome back | Sign in / Login | Reset password, create account | Public header | Top | Top | P | None | Keep; ignores return destination |
| `/signup` | Create your baseline | Create account / Sign Up | Login | Public header | Top | Top | P | None | Keep; repeats goal collection |
| `/forgot-password` | Reset your password | Request reset / Send reset link | Back to Login | Login | Context | Context | P | None | Keep |
| `/reset-password` | Choose a new password | Recover account / save password | Request new link, Login | Email | Direct | Direct | R | None | Keep; invalid-link state verified |
| `/onboarding` | Tune AXVital to your goal | Set primary focus / Finish Onboarding | Optional profile context | Signup/auth redirect | Direct | Direct | A | None | Keep; shorten later |
| `/today` | Today | Log and follow today's plan / Save Daily Check-In | Quick Add, planner, episodes, timeline | Primary | Top | Top | A | None | Keep as daily home |
| `/checkin` | Today (redirect) | Compatibility / redirect to Today | Same as Today | Legacy URL | Direct | Direct | Redirect | None | Keep alias; not separate product destination |
| `/weekly-overview` | Weekly Overview | Schedule activities / Add Activity | Change week, edit occurrences | Primary / Planner | Top | Top | A | None | Keep; subordinate to Today/Track later |
| `/dashboard` | Your health snapshot | Review trends / inspect charts | Weekly Recap, time filters | Primary / Progress | Top | Top | A | None | Consolidation candidate with Insights |
| `/health` | My Health | Organize conditions / Add condition | Symptoms, history, timeline, restore | My Health | More | Top | D | None | Keep; health is misplaced under Account on mobile |
| `/health/conditions/[id]` | Condition name | Manage condition / Save changes, Log episode | Primary, archive, Patterns, Outlook | My Health card | Context | Context | D | None | Keep; editing and interpretation compete |
| `/health/conditions/[id]/patterns` | Patterns Before Episodes (h2) | Compare prior windows / choose window | Details, upgrade, condition overview | Condition | Context | Context | D | Premium | Keep; top heading missing h1 |
| `/health/conditions/[id]/patterns/[patternKey]` | Pattern detail / exposure | Explain association / review comparison | Test This Pattern, back | Patterns card | Context | Context | D | Premium analysis | Keep; handoff button independently mounted |
| `/health/conditions/[id]/outlook` | Current Outlook / Current Pattern | Compare recent 72 hours / review similarity | Explanation, prior episodes, upgrade | Condition | Context | Context | D | Premium | Keep; name varies by state |
| `/health/episodes/new` | Log an Episode | Record episode / Log episode | Optional symptom links, back | Condition / active-episode summary | Context | Context | D | None | Keep; no-condition path needs guidance |
| `/health/episodes/[id]` | Episode detail / condition episode | Review and update episode | Resolve, archive, symptom links | Episode card / timeline | Context | Context | D | None | Keep; distinct from symptom event |
| `/health/symptoms` | Symptoms | Track occurrences / Log symptom | Favorites, custom symptom, history | My Health / Quick Add | Context | Context | D | None | Keep; catalog and logging compete |
| `/health/symptoms/history` | Symptom history | Find past occurrences / filter | Log, resolve/delete, My Health | Symptoms / My Health | Context | Context | D | None | Keep history view; shared component intentional |
| `/health/nutrition` | Nutrition | Record food / Log food | Search, serving, custom food, delete | Today Quick Add | Context | Context | D | None | Keep; no My Health nutrition link |
| `/health/timeline` | Health Timeline | Review past events / date and category | Expand, source links, Today | My Health | Context | Context | D | None | Keep; Today is day view of same adapter |
| `/habits` | Habits | Maintain recurring behavior / Add Habit | Filter, sort, edit, pause, delete | Planning and Programs | More | Top | A | None | Keep under Track |
| `/habits/[id]` | Habit title | Review consistency / log progress | Date history, reopen/skip | Habit card | Context | Context | A | None | Keep; overlaps Today completion intentionally |
| `/protocols` | Protocols | Manage regimens / Create Protocol | Active/paused/completed/templates/archive | Planning and Programs | More | Top | A | None | Keep, demote top-level |
| `/protocols/new` | Create a protocol | Define reusable regimen / save template | Add activities, schedules | Protocols | Context | Context | A | None | Keep; label hides template-vs-run distinction |
| `/protocols/[id]` | Protocol name | Review regimen / lifecycle actions | Planner, duplicate as template | Active protocol card | Context | Context | A | None | Keep; completion happens elsewhere |
| `/protocols/templates/[id]` | Template name | Review regimen definition / Start Protocol | Duplicate, Edit | Protocol templates | Context | Context | A | None | Keep; distinguish definition and run |
| `/protocols/templates/[id]/edit` | Edit protocol | Revise template / save | Activities, schedule | Template detail | Context | Context | A | None | Keep |
| `/experiments` | Experiments | Define question / Create experiment, Save draft | Templates, existing experiments | Insights and Recaps | More | Top | D | Mismatch | Keep; full workflow not yet reliable |
| `/experiments/[id]` | Experiment name | Review study / activate or transition | Pause, end, abandon, results, history | Experiment card | Context | Context | D | Mismatch | Keep; no edit/measurement UI |
| `/experiments/[id]/results` | Experiment name (same detail) | Intended results / View results | Same lifecycle/detail UI | Completed experiment / Insights | Context | Context | D | Mismatch | Necessary purpose, currently duplicate implementation |
| `/insights` | Insights | Understand change / Refresh, baseline window | Expand comparison, experiments | Insights and Recaps | More | Top | A | Mismatch | Keep; merge redundant Dashboard interpretation |
| `/weekly-recap` | Your Week | Weekly reflection / Regenerate Weekly Recap | View Insights | Insights and Recaps | More | Top | A | Mismatch | Keep; heading/CTA consistency improvement |
| `/workouts` | Workouts | Plan training / Build Workout | Planned, templates, exercises, history, progress | Primary | Top | Top | A | None | Keep domain hub |
| `/workouts/templates/new` | Build a Workout | Define workout / save template | Exercise library, groups, sets | Workouts | Context | Context | A | None | Keep |
| `/workouts/templates/[id]` | Template name | Review reusable workout / Edit template | Workouts | Templates tab | Context | Context | A | None | Keep; scheduling lives in hub |
| `/workouts/templates/[id]/edit` | Edit Workout | Change template / save changes | Groups, exercises, sets | Template / More actions | Context | Context | A | None | Keep; history preservation required |
| `/workouts/planned/[id]` | Planned workout name | Review scheduled snapshot / Start or Resume Workout | Workouts | Planned tab / planner | Context | Context | A | None | Keep; start rejection handling incomplete |
| `/workouts/sessions/[id]` | Session name | Execute / log sets, complete workout | Skip, rest timer, session controls | Start/resume | Context | Context | A | None | Keep; mobile shell intentionally focused |
| `/workouts/sessions/[id]/summary` | Session summary/name | Review actual performance | Workouts | History / completion | Context | Context | A | None | Keep |
| `/workouts/progress` | Workout Progress | Review training trends / date filter | Workouts | Workout Tools / Workouts | More | Context | A | None | Keep domain report; two Progress meanings |
| `/profile` | Display name (Profile eyebrow) | Edit preferences / save profile | Change password, development demo tools | Account | More | Top | A | None | Keep; not a complete account hub |
| `/settings/security` | Change password | Update password / save | Back to Profile | Profile | Context | Context | A + server check | None | Keep |
| `/settings/billing` | Billing | Manage subscription / portal or upgrade | Status/period | Account / checkout return | More | Direct | A | None | Keep; no desktop nav entry found |
| `/pricing` | Choose how deeply you want to understand your health | Compare plans / signup or upgrade | Monthly/annual, footer | Landing/footer/paywall | Context | Context | P | Comparison | Keep; enforce or remove unshipped promises |
| `/privacy` | Privacy | Understand data use / read | Footer | Public footer | Context | Context | P | None | Required; draft not launch-ready |
| `/terms` | Terms | Understand agreement / read | Footer | Public footer | Context | Context | P | None | Required; draft not launch-ready |
| `/contact` | Contact | Get support / none implemented | Footer | Public footer | Context | Context | P | None | Required; dead end |

Non-page surface inventory: `/api/analytics`, `/api/weekly-recap` GET/POST, `/api/timeline`, `/api/trigger-patterns`, `/api/condition-outlook`, `/api/product-events`, `/api/billing/status`, `/api/billing/checkout`, `/api/billing/portal`, `/api/stripe/webhook`; plus sitemap, robots, icons. These are not included in the 48 count. `#exercise-library` is a functioning tab handoff (`hashchange` listener), not a separate route. Quick Add, habit creation, food creation, condition creation, and workout scheduling are inline/dialog states, not routes.

## 4. Current navigation

Source: `lib/navigation/routes.ts`, `components/Navbar.tsx`, `components/navigation/*`.

- Desktop has **11** links: Today, Weekly Overview, Workouts, Dashboard, Habits, Protocols, My Health, Experiments, Insights, Weekly Recap, Profile; plus logo and Logout. One flex row begins at 1024 px, with no overflow strategy. Density/collision at that breakpoint is a source risk, not a measured authenticated result.
- Mobile: **Today / Planner / Workouts / Progress / More**. More contains Planning and Programs (Habits, Protocols), Workout Tools (Exercise Library, Workout Progress), Insights and Recaps (Experiments, Insights, Weekly Recap), Account (My Health, Profile, Billing). Health is not an account setting.
- Nutrition is accessed through Today → Optional Health Events → Food, despite its `/health` path. Billing lacks a desktop nav item. Security is reached through Profile and does not activate a More section because it has no route entry.
- Mobile workout progress activates More; desktop highlights Workouts. Dashboard is labeled Progress only on mobile. This adds relearning without adding value.
- Contextual back links usually return to parent hubs rather than browser history; tab state is generally local, so returning to Workouts may lose the previous tab. Timeline uses `replace`, intentionally not adding every date to history.
- More has focus trapping, Escape, body scroll lock, and explicit focus return. Other sheets do not consistently match this standard.
- No consistent breadcrumbs. Introduce parent links first; breadcrumbs are only worthwhile on multi-level pattern/template routes.

Target hierarchy is in section 31. Do not implement it in Sprint 11.

## 5. Concept definitions and comprehension

Each row answers current meaning, explanation, overlap/new-user distinction, naming, nesting, and top-level suitability. “Partial” means UI wording exists but does not establish the full distinction.

| Concept | Meaning today / UI explanation | Overlap and novice clarity | Naming / parent / top level recommendation |
|---|---|---|---|
| Daily Check-In | One daily row of subjective ratings; short helper text | Distinct from individual events, but prefilled completeness misleading | Keep Daily Check-In; Today; no separate top level |
| Health Event | Legacy timestamped food/fluid/supplement/exercise/symptom/medication/note | Generic database umbrella leaks into user language | Say log/entry in context; Today Quick Add; no |
| Timeline Event | Adapter view of source records | Not an additional record to create; UI only partially explains | Timeline entry in help; Health Timeline; no |
| Condition | Self-reported health area, catalog/custom, status | Distinct from single symptom/episode; disclaimers helpful | Condition; Health; no |
| Symptom | Catalog/favorite plus actual occurrence records | “Add” favorite versus “Log” occurrence is easy to confuse | Symptom / symptom log; Health; no |
| Episode | Condition-linked onset/end, severity, optional symptoms | Distinction explicitly explained; no inferred diagnosis | Episode umbrella, contextual flare/attack/outbreak; Health; no |
| Habit | Recurring planned activity, binary/numeric progress | Protocol-generated habit can also appear here | Habit; Track; no |
| Protocol | Template + activated multi-activity regimen | “Create Protocol” creates a template, not a running regimen | Keep concept; describe as regimen; Track/Routines; no |
| Experiment | One question/change/outcome and lifecycle | Not just a protocol; measurement/reporting gap breaks distinction | Experiment; Test; hub yes, individual concept no |
| Intervention | Change being explored, optional schema links | Technical term; choosing habit/protocol does not select a record | “What will you change?” in builder; experiment; no |
| Baseline | Prior comparison period; also rolling Insights average | Same word has different temporal semantics | Explain “usual tracking before the change” vs “recent average”; no |
| Measurement | Outcome observation from records/manual source | Schema exists, no clear user measurement path | “What to log”; experiment; no |
| Insight | Descriptive comparison from tracked data | Overlaps old Dashboard findings and patterns | Insights; Learn; hub yes |
| Pattern | Supported association or period comparison | Cross-domain Insights pattern and condition pattern differ | Contextual heading “Patterns before episodes”; Learn/condition; no |
| Trigger Discovery | Condition pre-episode comparison | “Trigger” sounds causal; UI mostly says Patterns | Prefer Patterns, retain technical names internally; no |
| Outlook | Recent 72-hour similarity to past windows | Risk of reading similarity as forecast/probability | Current Pattern with explicit subtitle; condition; no |
| Weekly Recap | Persisted weekly summary of analytics | Same inputs as Insights, different reading cadence | Weekly Recap, section Your Week; Learn; no |
| Nutrition Entry | Timestamped serving snapshot, one/more items in schema | Custom food definition is not a consumed entry | Food log / meal when supported; Nutrition; no |
| Workout Template | Reusable grouped exercise/set prescription | “Build Workout” conceals that it creates a template | Workout template; Workouts; no |
| Planned Workout | Scheduled snapshot of template | Different from actual session, not well taught upfront | Planned workout; planner/Workouts; no |
| Workout Session | Actual execution and set results | Quick Add Exercise is a separate legacy event | Workout / workout session in history; Workouts; no |
| Premium | Subscription-entitled analysis | Declared entitlements exceed enforcement | Premium only, not Pro/Paid; Account/Pricing; no |

## 6. Habits vs Protocols

Evidence: `lib/habits/habits.ts`, `lib/protocols/{types,instantiate,scheduling,analytics}.ts`, planning/habit/protocol migrations, both home components, timeline routines adapter.

| Dimension | Habit | Protocol |
|---|---|---|
| Schema | `planned_activities.activity_type='habit'` and occurrences | `protocol_templates`, template activities, `user_protocols`, links, pause periods; instantiates planned activities |
| Intent | Repeat one behavior consistently | Coordinate activities around a goal and optional duration |
| UI | Add Habit; active/paused/all; streak/adherence cards | Create template, review, start dated run; separate templates and lifecycle tabs |
| Schedule | Planner recurrence and active dates | Translates daily/weekdays/specific-days/weekly/interval/day-offset to planner recurrence |
| Completion | Yes/no or numeric/partial occurrence | Same occurrence progress mechanism; required/optional activity distinction |
| Reporting | Current/best streak, weekly/monthly adherence | Overall/required/optional adherence, days remaining, pause-aware summaries |
| Experiments | Schema can link planned activity | Schema can link active protocol; builder currently only records intervention type/name |
| Timeline | Completed routine occurrence | Same source with protocol context, not a separate duplicate log by design |

**Recommendation:** keep Protocol as a reusable structured regimen, available without an experiment. Let Experiments attach a regimen as the change to test. Nest Habits and Protocols in Track → Routines; explain “one recurring behavior” versus “a set of activities followed for a purpose or period.” Do not force all regimens into Experiments: users may follow a routine without comparing outcomes. Do not merge schemas or rename stored concepts now.

Examples: “Walk daily” is a habit; “21-day afternoon caffeine routine” is a regimen that may be used in an experiment. The current UI partly explains coordination, but template/run naming and duplicate completion entry points obscure the difference. Protocol-generated habits are returned by the general habit query; label their parent rather than asking users to create another habit.

## 7. Experiments audit

Evidence: `components/experiments/*`, all three experiment page wrappers, `lib/experiments/experiments.ts`, experiment migration, episode migration, `TestPatternButton`, analytics service.

| Workflow question/stage | Actual behavior | Problem / recommendation |
|---|---|---|
| What am I trying to learn? | Name and 10–500-character hypothesis | Length validation substitutes for guidance; use question examples |
| What will I change? | Type selector + free-text intervention; 10 technical choices | No selected habit/protocol/workout target despite schema links; one-change principle is good |
| What will I measure? | Outcome type dropdown | Symptom target, custom metric definition, units, direction and log frequency not configured |
| What is baseline? | Default 7 days, baseline-then-intervention or intervention-only | Dates calculated at draft creation, not actual activation; stale drafts can have misleading periods |
| How long? | Default 21 intervention days; editable numbers | No calendar preview, sufficiency guidance, maximum/finite validation in `validateDraft` |
| Templates | Prefill name/hypothesis/type/name | Ignores richer template outcome defaults/durations/safety notes; default Energy may not fit template |
| Review/start | Study plan shows status/design/intervention/outcome; activate RPC | No dates or log-source readiness overview; cannot repair incomplete draft through detail UI |
| Measurements | Table and source types exist | No manual measurement UI or complete measurement ingestion/results generation path found in inspected app |
| Adherence | Target % saved | No visible linkage or daily adherence workflow explaining actual adherence |
| Pause/resume | RPC actions and phase events | Must explain whether phase dates shift; current UI does not |
| Complete/end early | Lifecycle controls; confirmation for early end | Completion does not demonstrate an analysis result; minimum evidence not communicated |
| Results | Results route renders same `ExperimentDetail` | No result visualization/text, counts, adherence, or limitations rendered; View results can link to its own route |
| Edit | No draft editing UI | Users must abandon/recreate rather than correct configuration |
| Abandon | Confirmation says data preserved | Good distinction from deletion; no clear archive/restart journey |

Important schema nuance: custom numeric outcomes require a non-null definition, which the general builder does not provide and can therefore fail. Symptom constraints involving null values may evaluate UNKNOWN in PostgreSQL CHECKs; do **not** assume missing symptom selection is rejected. Such drafts can instead be under-specified. Verify supported outcome paths against an actual migrated database.

Safety: client validation rejects selected prescription-change and unsafe phrases, and supplement choice gets a caution. This is not a complete safety boundary: direct owner writes and lifecycle RPC checks do not reproduce the client content review. Avoid promising clinically safe experimentation. No new medical recommendations or model semantics are proposed here.

Relationships: Insights links completed experiments to the duplicate results route. Weekly Recap lists progress without direct per-item links. Condition tiles describe compatibility rather than a working experiment navigation. Pattern handoff creates a draft then changes its outcome to condition episode frequency; its button is mounted independently of paid pattern analysis. This is not evidence that protected pattern values leak, but its availability and readiness semantics need review. Direct Free navigation to PatternDetail also assumes `result.patterns` exists; the Free preview response has no such array, leading to generic failure instead of an upgrade/readiness state. Include this in B05/B16.

### Proposed Experiments 2.0 for Sprint 13

1. Ask “What do you want to understand?” with a plain-language question and optional eligible pattern context.
2. Select one safe change; attach an existing habit/regimen/workout or define a minimal custom action. Separate observational medication tracking from changes.
3. Select one actual measurable outcome, target record, units/direction, and exact log entry point. Do not offer unsupported types.
4. Show baseline readiness and dates; explain intervention-only limitations. Anchor planned dates to reviewed start, with deliberate pause rules.
5. Preview the timeline and daily logging/adherence expectation; review safety and evidence limitations before starting.
6. During the experiment show today's log actions, coverage and adherence, with edit/version rules and explicit pause/end/abandon consequences.
7. Complete into a real result: observations, period comparison, missingness, adherence, limitations, no causal claim; offer reflection or a new draft.

Acceptance: transactional draft creation, all offered outcomes operable, persisted results visible from both Insights and experiment, cross-owner negative tests, server lifecycle invariants, explicit insufficient-data result. This is a proposal only.

## 8. Onboarding audit

Current funnel: Landing → CTA incorrectly reaches Today → proxy sends anonymous visitor to Login → create account → signup (email/password/full name required; preferred name/goal optional) → unconditional push to Onboarding → existing profile required → primary goal required, six optional context fields → Today.

Signup does not branch on returned session versus email confirmation pending. With confirmation required it can reach Login without telling the user to check email. Onboarding waits for a pre-created profile; missing profile shows “still being prepared” and disables submit, with no retry button. Goal is asked in signup and again in onboarding. Optional weight has no unit label. Conditions are not mandatory and Premium is not inserted into onboarding: preserve these strengths.

First value is delayed by profile readiness and optional forms, then Today initially presents a plan rather than an obvious first log. Proposed: Welcome/value → one goal (sleep, symptoms/flares, energy, nutrition, fitness, wellness, experiment) → minimal preferences with units → optional condition → one actual log → Today with saved feedback. Defer full profile context. Keep account email verification and recovery explicit; don't pretend onboarding success until authoritative persistence.

## 9. Today audit

Evidence: `/today` re-exports `app/checkin/page.tsx`; `TodayPlan`, `ActiveEpisodes`, shared `Timeline`.

Order is date/header + Daily essentials progress → Today's Plan → active episodes → collapsed Daily Check-In beside collapsed Optional Health Events + timeline. On small screens this becomes a long serial page. A new user can see “100%” and “Not completed” at once, since defaults populate all questions. Reload loses local saved status and does not load today's row. Saving defaults may overwrite a previous check-in, and UTC `todayDateString` differs from the locally dated timeline at day boundaries.

Quick Add Exercise records a legacy event, not a completed workout session. TodayPlan lists generic planner occurrences; do not assume it supplies full resume/session/nutrition-summary capability. No Today nutrition summary is mounted. No Premium prompt is mounted here, which is appropriate for core tracking.

Ideal role: **What should I log? What happened today? What needs attention?** Preserve Today as daily home. Prioritize an accurate saved check-in state, optional one-tap logging access, active episode/workout context, and a compact history. Keep historical analysis in Learn. Do not solve the state bug by cosmetically changing the progress label alone.

## 10. Quick Add audit

Seven visible choices: Food, Fluid, Supplement, Exercise, Symptom, Medication, Note. Food and Symptom navigate to full structured pages via `window.location.assign`; the other five open a sheet. Episode is absent and accessed separately. Some legacy Food/Symptom field definitions remain unreachable from normal Quick Add selection.

The sheet includes optional tags, fields, Cancel/Save, 82dvh scrolling, and trigger focus return. It lacks initial focus, focus trap, Escape handling and body scroll lock. Close can discard unsaved input; the close icon remains usable while saving. The missing-user branch currently reports success and clears the form without inserting data. This should preserve input and explain sign-in failure.

Recommendation: make Quick Add a universal **launcher**, with focused specialized editors; do not force food serving search and episode lifecycle into one generic form. Use Food, Symptoms, Supplements, Hydration, Notes, Episodes as understandable first choices, with medications/activity under an expanded set. Validate that selection retains navigation context and saves once. Future voice belongs at this launcher, producing a reviewable draft in the same structured editors; no voice work now.

## 11. Timeline audit

Shared adapters cover check-ins, legacy events, nutrition, symptoms, routines, workouts, experiments and episodes. Stable source-prefixed IDs prevent identity collisions, but there is no cross-source semantic deduplication. A manual Exercise log and a workout session can both appear: explain provenance rather than silently deleting one.

Today is one day; historical timeline is a seven-day window with category filters and source detail expansion. This is a useful division: **what happened**, not an activity to-do list. Partial source failure has Retry and is distinct from an empty day.

Problems: historical check-in Edit always targets `/today#daily-checkin` without date/load context; nutrition Edit always opens the current-day Nutrition home with no selected entry editor; legacy events are not editable; metadata keys/source names leak technical vocabulary; long notes/identifiers need wrapping tests; clearing or corrupting the date query is not guarded before date formatting. Check-in grouping uses updated timestamp rather than recorded check-in date, so editing old data can move its apparent day. Keep these as integrity/remediation work, not an adapter rewrite in this sprint.

## 12. Conditions / Symptoms / Episodes audit

Condition creation has catalog/category/search plus custom fallback and optional details; detail offers archive/restore and primary selection. Self-reporting wording is appropriate. Detail currently places editing first, then episode metrics/list, Patterns, four placeholder/informational tiles and archive. It is not a functioning six-tab Health workspace.

Symptoms distinguishes favorites from occurrences, but “Add” and “Log” beside every catalog result need explicit explanation. History is a valid separate view sharing a component. Filtering to zero matches can leave a blank list because the empty condition tests total events, not filtered events.

Episode form requires a condition, captures onset/severity/functional impact, optionally links recent symptoms or adds one. With no conditions, the disabled submit needs an Add condition path. Episode versus symptom language is better than the rest of the concept system. The optional new-symptom select lacks an individual accessible name before safe fixes.

Proposed Overview / Symptoms / Episodes / Patterns / Current Pattern / Experiments is a useful **future hierarchy**, but do not add empty tabs. Overview should summarize active concerns and links, not require editing. Experiments should appear only when actual condition links can be shown. Keep historical Patterns and current similarity distinct, with explanatory subtitles.

## 13. Nutrition audit

Implemented: loaded catalog/alias search, custom foods, asynchronous servings, quantity preview, consumed time, meal type, notes, atomic food logging, current-day totals/list and soft deletion. Food choice resets and serving races deserve regression tests; request ID guards some but not all transitions (switching to a custom food does not advance it).

Favorites/recent-food/saved-meal/target utilities and migration exist, but **no corresponding controls are wired into `NutritionHome`**. Custom foods are ordered by last logged time; that is not a general recent-food picker. Historical data is reached through Timeline, not a nutrition calendar. Insights and Recap use nutrition totals, not a dedicated nutrition weekly screen. Today mounts no nutrition summary. Catalog coverage was not assessed against a representative live food list; custom fallback exists, so do not invent missing common foods or expand catalog now.

Friction: Today → expand Optional Events → Food → search/select → serving/quantity → save; no direct nav destination. “Preserved nutrition snapshots” is implementation language. “Create and log” only creates a food definition then opens the logging form; change to “Create food.” Search needs a visible label. Delete rejection currently has no catch; add local feedback preserving the list. Nutrition error logs include record identifiers and DB details; remove these payloads.

Future voice would help multi-item meal entry, but must resolve servings and confirm the preview before saving.

## 14. Workout audit

Model is substantially implemented: Template → Plan snapshot → Start → Execute sets/groups/supersets → Complete → Summary/History. Exercise library hash navigation works. Template edit/archive/restore/delete has dependency-aware safeguards in library/RPC/tests; history preservation is a strength.

Hub tabs default to Planned; Build Workout creates a template; Schedule is on template cards; template detail offers edit but not an equally obvious plan action. Empty history/templates tabs lack strong first steps. Load has no dedicated pending state, so “no workouts planned” can appear before data arrives. Resume URL can interpolate an absent session ID. Planned detail Start has no caught async failure. Template detail fetch rejection can remain “Loading template…” forever.

Execution has a focused mobile header, group/set controls, rest handling, pending state and substantial domain tests. Still requires populated keyboard/viewport QA, especially numeric inputs, bottom bars, supersets and keyboard opening. Workout Progress deliberately scrolls its 560px table; local table scroll is acceptable if labeled and keyboard reachable. Clarify global Progress (Dashboard) versus Workout Progress. Avoid replacing this workflow in Sprint 11.

## 15. Insights audit

`/api/analytics` assembles check-ins, nutrition, completed workouts, routines, symptoms and experiments. UI offers baseline window, recent changes, patterns with expandable comparisons, symptom summaries and experiment links. It uses descriptive wording and evidence/limitations, a strong foundation. There is no direct condition-Outlook card in this surface; don't claim predictive integration merely because Outlook exists elsewhere.

Questions partly answered: “What changed?” by recent changes; “What stands out?” by comparisons; “What should I investigate?” only weakly because prioritization and handoffs are limited. Dashboard maintains a separate older trend/insight path, creating two places to look. Advanced gating is not applied. Recommendation: one ranked Learn entry with at most a few meaningful findings, observation counts, source links and uncertainty; keep detailed charts secondary. Preserve no-data and partial-source warnings. Do not rename associations as causes.

## 16. Weekly Recap audit

Persisted structured briefing: Your Week metrics, Wins, Changes, Patterns Worth Watching, Symptoms, Experiment Progress, Next Week Focus. Empty sections are omitted; normalization protects older snapshots. This is better than a permanently empty dashboard.

Issues: page heading Your Week duplicates its first section and differs from nav Weekly Recap; first CTA says Regenerate even when no recap exists; empty state suggests tracking but has no direct log action; experiment progress is text without a per-experiment link; all available sections can still be long on mobile. Premium enrichment is not separated. GET returns latest persisted recap; freshness/week selection needs explicit presentation.

Intended distinction: **Insights is an explorable current analysis; Weekly Recap is a dated, concise reflection with one next-week tracking focus.** No need for two independent insight engines. Next-week focus should be a specific logging/investigation action supported by available data, not advice presented as treatment. Improve heading/initial CTA safely; defer card reordering.

## 17. Patterns vs Outlook

- Patterns: “What tended to happen before my past episodes?” Windows 24/48/72 hours or 7 days; shows comparisons, data quality, limitations and suppressed variables.
- Outlook: “How similar are my recent 72 hours to previous pre-episode periods?” Shows similarity classes and nearest periods; explicitly not a probability and not a guarantee.

Recommendation: **Patterns Before Episodes** and **Current Pattern** with the two questions as subtitles. Reserve Outlook as an internal/legacy label until Sprint 12 label testing. Avoid “risk,” “prediction,” “trigger proven,” and “what works” causal claims. The engine and thresholds remain unchanged. The loaded/unavailable/paywall titles currently differ. Free readiness copy based only on >=3 episodes overpromises because usable windows and comparison data matter; count alone is not readiness.

## 18. Free vs Premium

Evidence: `lib/billing/{entitlements,server}.ts`, billing migration, all analysis endpoints, Pricing and billing components. Declared capabilities are not proof of enforcement.

| Feature | Free sees today | Server protection / current gap | Recommended launch boundary |
|---|---|---|---|
| Tracking, conditions, episodes, timeline | Full core UI | Owner data paths/RLS; deployment unverified | Free full core logging/history |
| Trigger Discovery | Episode count/categories and UpgradeCard | Entitlement before engine; no detailed values returned to Free | Free truthful readiness preview; Premium comparison |
| Outlook | Episode count and upgrade copy | Entitlement before engine; no similarity result returned to Free | Premium comparison; explain no probability |
| Insights | Same analytics endpoint/output | No advanced entitlement check | Keep existing descriptive Insights Free; add paid enrichment only when specified/enforced |
| Weekly Recap | Same persisted summary | No advanced entitlement check, including GET | Keep basic recap Free; paid enrichment later with server projection and downgrade tests |
| Experiments | All builder/lifecycle paths | No active-count limit in inspected RPC/migrations despite pricing “1 active” | One active Free / multiple Premium only after atomic server enforcement; all own history/results retained |
| Voice / wearables | Coming to Premium wording / entitlement constants | No user workflow | Exclude from shipped value; explicitly future, no sale dependency |
| Billing/security/export/deletion | Billing/security exist, export/deletion absent | Never gate account rights | Available on all plans |

Do not change $9.99/month or $79.99/year. Resolve promises before taking public payments. Entitlement behavior has unit coverage for active, trialing, grace and expiration; live webhook/portal validation remains required. Canceled/expired plan label can remain Premium while entitlement state is inactive: explain this clearly. Billing has no retry control on load failure and no webhook polling after checkout. The checkout query alone currently causes “Payment received”; it is not authoritative payment evidence. Safe copy should say confirmation is pending without asserting receipt.

## 19. Empty / loading / error states

### Meaningful empty states

Columns assess whether state explains area, value and next step, respectively. Partial means context elsewhere is required.

| Surface/state | Area / value / next | Finding and remedy |
|---|---|---|
| Today plan empty | Yes / partial / yes | Add Activity directs planning before first health log; prioritize check-in later |
| No conditions | Yes / yes / yes | Strong Add condition state; retain optional nature |
| No tracked symptoms | Yes / partial / partial | Explain favorites versus history; nearby browse action |
| No symptom logs/history | Yes / partial / yes | Log CTA in header; filtered-no-results missing |
| No recommendations | Partial / no / no | Neutral message acceptable; optional condition link would help |
| No episodes | Yes / yes / yes | Condition card has Log episode; global no-condition form needs escape |
| No nutrition entries | Yes / partial / yes | Nearby Log Food; avoid zero totals implying complete intake |
| No matching food/servings | Yes / partial / yes/partial | Custom fallback; servings state should offer reselect/retry |
| No planned workouts | Yes / partial / partial | “Schedule from template” but no direct Templates action |
| No templates / no workout history | No / no / no | Blank grid/list; explain template and first completed session |
| No habits / filtered habits | Yes / partial / yes | Add or change filter; improve behavior example later |
| No active protocol | Partial / partial / partial | Saved templates instruction; first-time user has none |
| No protocol templates | Yes / yes / partial | Create action in header; template/run labels unclear |
| No experiments | Yes / yes / yes | Strong draft CTA, but promised value depends on results repair |
| No experiment templates | No / no / no | Empty horizontal strip; distinguish fetch failure from no templates |
| No Patterns (few episodes) | Yes / yes / partial | At least 3 explained; add source logging links later |
| Patterns with no supported difference | Yes / yes / partial | Correct neutral result; do not frame as failure |
| Outlook unavailable | Yes / yes / partial | Usable windows/comparison history explained; actionable tracking guidance needed |
| No recap | Yes / yes / partial | First action mislabeled Regenerate; safe correction planned |
| No timeline / filtered timeline | Yes / yes / yes | Clear category/date guidance; current wording says “day” on seven-day view |
| Insights insufficient data | Partial / yes / partial | Explain eligible inputs and next log; no invented findings |
| Dashboard missing check-ins | Yes / partial / partial | Another activation destination competes with Today |

### Loading states

Route `loading.tsx`: Health, Symptoms, Timeline, Habits (+ detail), Protocols, Workouts, Weekly Overview. Shared `LoadingSkeleton` includes `aria-busy`, hidden Loading and reduced-motion support. Other routes use inline skeletons/plain text; Insights/Recap have hand-coded pulses without equivalent status. Full-page loading on nutrition refresh unmounts controls. Workouts hub/progress can show zero/empty before completion; template detail can remain loading on rejection. Establish pending/empty/error separation per feature; no global skeleton redesign now.

### Errors and recovery

Most feature libraries map database errors to friendly messages; `caught instanceof Error ? caught.message` is not automatically a raw leak when upstream errors are sanitized. Raw API codes are not normally printed by current clients. No raw Stripe error display found. Concrete leakage is **console payloads**, including nutrition database `details` and check-in/legacy recap payloads. Remove them rather than introducing a generic regex that might hide useful validation text.

Failures without adequate recovery: onboarding profile preparation, billing load, workout template fetch, workout Start, nutrition Delete, Today save without a user, and date parsing. Forms generally preserve controlled inputs on caught save errors; don't erase input on failed auth. Quick Add absence of user is a false success defect. Exceptions in unchecked async handlers can evade UI feedback. Do not claim every provider failure was triggered; these are traced code paths.

## 20. Terminology and CTA audit

Searches covered app/components/lib for Check-In, Quick Add, Event, Protocol, Routine, Progress, Premium, error messages and routing. Canonical glossary is section 5. No public Pro tier found; do not mass-replace internal `paid`/status identifiers.

| Current variant / CTA | Issue | Decision |
|---|---|---|
| Daily Check-In / daily check-in | Heading vs sentence case is legitimate | Keep heading Daily Check-In, sentence daily check-in |
| Optional Health Events / Quick Add / Save Event | Generic event vocabulary, behavior differs by type | Defer launcher rename; safe Skip → Cancel |
| Fluid / Hydration | Same intent, different language in roadmap | Hydration candidate for Sprint 12; no schema rename |
| Dashboard / Progress | Device-dependent destination label | Major decision for Sprint 12 Learn consolidation |
| Weekly Overview / Planner | Same destination, new concept label | Use Planner as explanatory subtitle or unify later |
| Protocol / Programs / template | Definition and running regimen conflated | Explain template vs active regimen before renaming |
| Current Outlook / Current Pattern / Predictive Outlook | Different names by state and pricing | Sprint 12 consistent Current Pattern + disclaimer |
| Your Week / Weekly Recap | Page vs navigation label | Safe h1 Weekly Recap; retain Your Week section |
| Regenerate Weekly Recap | Wrong when no recap exists | Safe Generate Weekly Recap for initial state |
| Create and log | Custom food is only created | Safe Create food |
| Create Free Account → Today | Leads to login | Safe `/signup` target |
| View / Add / Log on cards | Context can disambiguate, screen-reader repetition does not | Add names when context absent; do not rewrite all verbs |
| Activate / start_intervention / lifecycle actions | Research/database vocabulary | Experiment 2.0: Start baseline / Start change / End experiment |
| Finish / Complete | Workout completion vs generic action | Retain context-specific Complete workout / Save log / Create template |
| “Episode outcomes are data-source compatible” | Implementation statement, not usable feature | Replace with honest help/action when integration exists |

## 21. Mobile audit

Measured public routes: `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password` (invalid recovery), `/pricing`, `/privacy`, `/terms`, `/contact` at every requested width. For all 63 combinations `documentElement.scrollWidth === clientWidth`; viewport scrollbar accounts for 15px on long pages. This establishes no **document horizontal overflow** in those states, not perfect usability or contrast.

Source risks in authenticated UI: five-tab bottom bar promotes fitness over health; More has ten links; check-in and logging are collapsed below planning; Quick Add keyboard can obscure controls despite dvh/scrolling; long condition names and workout labels need wrapping; workout template confirmation dialog has no max-height/scroll treatment; inline Timeline label/select can exceed narrow content width; nested form/sheet scroll behavior needs physical iOS testing. 44–56px shared controls are positive, but text links and dense table controls need measurement.

Required authenticated matrix (all seven widths): Today empty/saved, Quick Add five sheets, condition dialog/detail/episode form, symptom logger/history, nutrition selection/custom/delete failure, experiment draft/detail/results, workout builder/plan/execution/superset/summary, Insights populated/empty, Recap, Billing Free/Premium/error, Profile/security. **Not performed without test session.** Software keyboard, touch, zoom and screen-reader behavior remain unverified. Do not count login redirects as tests of these screens.

## 22. Desktop audit

Public pages measured at 768/1024/1440 as above. Public content containers range from narrow auth cards to 6xl landing/pricing and are reasonable in source. At 768 the application still uses mobile navigation by design; desktop nav starts at lg/1024.

Authenticated source concerns: eleven links plus logo/logout in a 7xl row; 1024 is especially dense. Narrow condition detail combines editing and analytics and may over-scroll while wide Dashboard cards compete. Different generations use 3xl/4xl/5xl/6xl containers with no explicit screen type rule. Propose narrow editors, medium record details, wider analytics, and a grouped nav after testing. No measured authenticated whitespace/collision claim is made.

## 23. Accessibility audit

Positive: shared buttons have visible focus and minimum height; controls often wrap labels; check-in options use `aria-pressed`; More handles trap/Escape/return; shared notices use alert/status; timeline expanders and disclosures expose expanded state; recovery forms have feedback focus, descriptions and autocomplete.

Concrete gaps: nutrition and symptom searches rely on placeholders; episode new-symptom select lacks its own name; onboarding selection is color-only without `aria-pressed`; root main contains nested mains in Insights, Recap and historical Timeline; no skip link; pattern page title is h2; Quick Add trap/initial focus/Escape absent; workout confirmation only autofocuses Cancel; some status text lacks live announcements; most pages share document title, which harms Next route announcements.

Safe scope: persistent search labels, episode selector name, onboarding pressed state, one main landmark, skip-to-content, clear status notices. Deeper dialog standardization is P1 and needs keyboard/focus-restoration tests. Keyboard public navigation can be checked without signing in. No automated accessibility score, WCAG conformance, contrast sweep, VoiceOver or NVDA completion is claimed.

## 24. Landing page audit

What/who/problem: strong “Understand what affects how you feel,” but audience is broad and “Health Operating System” metadata is abstract. How: three steps cover check-in and insights but not the experiment loop. Difference: personal history is implied rather than demonstrated. Free/Premium: real pricing exists but landing says “sample intelligence” and emphasizes future wearables/labs. The mockup's unexplained 87 is not an implemented health score and should not be used as proof.

Browser confirmed Create Free Account navigates to Login through Today. Fix its target. Replace the small “See what actually changes your health” claim with descriptive comparison wording; no full marketing rewrite. Future Sprint 12 copy should explain input → observed comparison → optional test, explicitly separating future capabilities. Show one real, clearly illustrative workflow with evidence counts and limitations, not an invented health score.

## 25. Marketing readiness

Recommended moments, only after prerequisites are met:

| Moment | Channel / value | Prerequisite |
|---|---|---|
| Save a daily check-in and see it in timeline | Landing/demo; immediate comprehension | Saved-state and local-date repair |
| Log an episode and link symptoms | Demo/Reddit; clear condition utility | Synthetic consented demo account, no personal health data |
| Explain a historical pattern with counts | Landing/Product Hunt; differentiating value | Premium test, non-causal caption, sufficient demo history |
| Compare Current Pattern and explain uncertainty | Demo/social; interpretable comparison | Never imply episode prediction or clinical validation |
| Draft one question/change/outcome and review a result | Demo/Product Hunt; product loop | Experiments 2.0 results implemented first |
| Read Weekly Recap and choose one tracking focus | Email/social; weekly return value | Valid dated recap, sensible no-data handling |
| Execute a superset and preserve workout history | Fitness communities/demo | Populated mobile QA |
| Choose food serving and see preview/history | SEO/demo; useful daily logging | Serving coverage and logging verified |

Do not promote voice as available. No marketing assets or campaigns created. Educational SEO should explain self-reporting and comparison limits, not treatment claims.

## 26. Analytics / funnel audit

`lib/product-events.ts` and billing migration allow 16 event names. Actual emitters found: `pricing_viewed` on Pricing mount, `upgrade_clicked` on CheckoutButton, `checkout_started` after checkout response. The presence of an allowed name does not mean it is emitted. Webhook sync does not emit `premium_activated`.

| Desired event | Current evidence | Authoritative Sprint 14 point |
|---|---|---|
| landing_viewed | Absent enum/emitter | Anonymous coarse page view, privacy-reviewed |
| signup_started | Absent | Form intent event, no field contents |
| signup_completed | Allowed only | Auth account creation/verified session distinction specified |
| onboarding_completed | Allowed only | Successful persisted profile completion |
| first_log_completed | Absent | First successful owner log write, server dedupe |
| first_checkin_completed | Different allowed name `first_daily_checkin`, no emitter | First committed check-in |
| first_condition_added | Allowed only | First committed user condition |
| first_episode_logged | Allowed only | First committed episode |
| first_experiment_created | Absent | Successful complete draft transaction |
| first_insight_generated | Absent | Successful usable analysis, excluding empty/failure |
| pricing_viewed | Emitted browser mount | De-duplicate page/session views |
| upgrade_clicked | Emitted browser | Keep intent event, never interpret as purchase |
| checkout_started | Emitted browser after session response | Server after Stripe session creation |
| premium_activated | Allowed only | Verified subscription activation with idempotent event |

Other allowed-but-unwired events: first symptom/food/workout, checkout_completed, patterns/outlook paywall viewed, experiment_limit_reached. No unique first-event constraint or robust anonymous funnel correlation found. Endpoint accepts any allowed event from anonymous callers using service role and can return 204 even on exceptions; clients could forge activation events if they were interpreted as authoritative. Local server output during Pricing browser checks showed `POST /api/product-events 500`; the emitter exists, but successful storage was not established. Root cause was not diagnosed against provider configuration.

Sprint 14: distinguish intent from authoritative completions, define first per account, enforce idempotency and server-only activation names, handle delivery failures, retention/cohort calculation and privacy-reviewed anonymous correlation. Allow only generic event names and minimal version/context; never notes, condition names, IDs of health records, hypotheses, symptom values, result classes, or Stripe health metadata. Keep first-party instrumentation; no vendor.

## 27. Launch blockers

Classification is release priority, not a legal determination. Existing `docs/launch-readiness.md`, `docs/billing.md`, `docs/password-security.md` acknowledge operational work still needed.

| Requirement | Classification | Current evidence / exit criterion |
|---|---|---|
| Account deletion | BLOCKER | No self-service or documented executable flow; verify auth/data/subscription lifecycle and retention |
| Data export | BLOCKER | No export route/action; verify complete owner-only usable export |
| Privacy policy | BLOCKER | Explicit draft; owner/counsel must finalize practices and retention |
| Terms | BLOCKER | Explicit draft; subscription/refund/governing wording unresolved |
| Health disclaimer | HIGH PRIORITY | Footer/Terms have wording; review claims across landing/Outlook/experiments |
| Support email | BLOCKER | Contact placeholder; publish monitored support/privacy channel and response process |
| Password reset | HIGH PRIORITY | Implementation/tests exist; real SMTP, PKCE email, expired/reused-link flow unverified |
| Billing | BLOCKER before paid launch | Live purchase/activation/reconciliation evidence missing; promises mismatch |
| Cancellation | BLOCKER before paid launch | Portal route exists; deployed Portal configuration and end-of-access must be verified |
| Refund process | BLOCKER before paid launch | Terms say must be finalized; publish process and support owner |
| CAPTCHA/signup abuse | HIGH PRIORITY | No client CAPTCHA flow; provider configuration unknown, not assumed absent |
| Rate limits | BLOCKER for public expensive/write APIs | No app limits found; product-event service-role insert accepts anonymous traffic |
| Error monitoring | HIGH PRIORITY | Console-only/generic errors; no confirmed production alerting |
| Database backups | BLOCKER | No restore evidence; verify provider plan, retention, restore drill |
| Dependencies | BLOCKER | Runtime high findings need applicability review and patched release |
| SEO | MEDIUM PRIORITY | Sitemap/robots exist; localhost fallback, incomplete private-route exclusions, common titles |
| Mobile QA | BLOCKER | Authenticated task matrix and real keyboard tests outstanding |
| Accessibility | HIGH PRIORITY | Safe fixes below; keyboard-critical dialog gaps must pass before release |
| Cross-browser QA | HIGH PRIORITY | Chromium anonymous only; Safari/Edge/Chrome brands untested |
| Experimental voice/wearables | POST-BETA | Future feature constants are not launch functionality |

Highest-priority product trust blocker: inability to support/export/delete a user's health data under finalized practices. Technical release gate in parallel: patch runtime advisories and verify owner isolation. Do not postpone either until after marketing.

## 28. Security / privacy surface review

- **Secrets:** service-role and Stripe helpers are server-only; imports found in API routes, not client components. Public Supabase URL/anon key are expected public configuration. No secret values were read or printed. This is import-path review, not a full built-bundle secret scan.
- **RLS:** migrations enable owner policies; billing subscription writes are service-role-only, user reads own row. Deployment and adversarial cross-owner access remain unverified. Child-link ownership constraints deserve DB tests, particularly experiment links to another owner's condition/regimen.
- **Page protection:** Health/Experiments omitted from proxy list; browser confirms anonymous shells. APIs/services still authenticate, so this is not demonstrated health-data disclosure. Align route gating later while retaining server/RLS authorization.
- **Premium:** pattern/outlook detailed analyses are checked before calculation. Free preview branches lack the explicit private/no-store header used on paid responses; standardize sensitive response headers later. Other advertised entitlements aren't enforced.
- **Logs:** check-in payload and legacy recap payload are logged in development; nutrition failures unconditionally log food/user-food/serving IDs and database details, which can contain row values. Remove these direct payloads now. Generic source-operation timeline logging is appropriately limited. Other `logDevError` calls can carry provider details in development; prohibit real health accounts in dev until systematic redaction.
- **URLs:** condition UUIDs, episode UUIDs and exposure keys appear in routes/queries; they remain sensitive context even without names. Avoid them in analytics/referrers/access logs. Dates/timezone are sent to analytics API. Recovery strips URL tokens after validation; infrastructure redaction remains required.
- **Stripe:** metadata uses account identifier and plan, not health records. Customer email is sent for billing. Webhook signature is verified and event IDs recorded; ordering/concurrency/idempotency and duplicate checkout behavior need integration tests. Query-string success is not payment evidence.
- **Analytics endpoint:** generic allowlist reduces health payload risk, but anonymous writes can spoof allowed completion names; missing rate limit and swallowed failures weaken reliability.
- **Development demo tools:** Profile demo tools are development-only, but demo check-ins upsert on owner/date and can replace real data before demo cleanup. Do not use them against a real account; isolate demo datasets in hardening work.

No formal security certification or clinical safety finding is implied.

## 29. Dependency review

Executed `npm audit --json` on 2026-08-27. Sandbox registry request failed; approved network rerun returned 7 affected packages: **6 high, 1 moderate, 0 critical**. `npm ls` established dependency paths. No `audit fix --force`, dependency install, or lockfile update was performed.

| Package / installed version | Severity | Runtime versus development | Fix / risk |
|---|---|---|---|
| next 16.2.9 | High | Runtime direct | Audit proposes 16.3.3 (non-major); direct framework advisories patched at 16.2.11, but bundled/transitive findings require whole-tree re-audit |
| sharp 0.34.5 | High | Next optional runtime image dependency | Patched range >=0.35.0; native/pre-1.0 update deserves build/image QA |
| postcss 8.4.31 (Next), 8.5.15 (Tailwind) | High | Both production dependency tree and build tooling | Audit affected through 8.5.22; use corrected parent releases, review source-map behavior |
| nanoid 3.3.15 | High | Transitive PostCSS, both trees | Audit fixed >=3.3.18; update compatible resolution and re-audit |
| brace-expansion 1.1.15, 5.0.6 | High | ESLint/minimatch development tree | Compatible fixes >=1.1.18 and >=5.0.9 |
| js-yaml 4.2.0 | High | ESLint development tree | Compatible fix >=4.3.1 |
| @tailwindcss/postcss 4.3.1 | Moderate | Direct build development dependency | Parent update available; validate generated CSS and responsive regressions |

Applicability matters: Next proxy-bypass advisory specifically requires App Router/Turbopack and single-locale i18n configuration; this repo uses App Router/Turbopack but has no `i18n.locales` in `next.config.ts`, so exploitability is not established. Other advisories involve Server Actions, custom servers, rewrites or SVG handling not demonstrated in current application usage. Do not dismiss bundled runtime findings merely because no affected call site was found.

Sources: [Next maintainer advisory](https://github.com/vercel/next.js/security/advisories/GHSA-6gpp-xcg3-4w24), [sharp maintainer advisory](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj), plus exact registry advisory output. Safe remediation: dedicated dependency change; read installed upgrade guidance, align Next/eslint-config-next, update compatible tooling/transitives, review lockfile/native changes, run clean install/type/lint/tests/build and auth/image/CSS browser smoke checks, then audit both full and production trees. Version numbers are audit-time candidates, not a guarantee of future safety.

### Cross-browser assessment

Only in-app Chromium was exercised. Chrome and Edge branded installations, desktop Safari and Mobile Safari were not tested. Installed Next browser guide is the compatibility baseline, but application APIs also matter: `Object.groupBy` in Timeline is newer than some framework-supported browsers, and no explicit polyfill was found. Native date/datetime-local, dvh, safe-area, backdrop blur, fixed bottom sheets and software keyboards need actual Safari checks. Define minimum browser versions and test graceful date/input behavior and drawer scrolling; CSS compatibility alone is not evidence of working workflows.

## 30. Product coherence scorecard

Scale: 1 = major broken/missing journey; 2 = substantial friction/gaps; 3 = usable foundation with material gaps; 4 = strong and verified; 5 = exceptionally clear and validated. Scores remain conservative because authenticated usability evidence is absent.

| Dimension | /5 | Rationale / top issue | Recommended improvement |
|---|---|---|---|
| First-time comprehension | 2 | Marketing promise exceeds visible loop | One first-log journey and concept explanation |
| Navigation clarity | 2 | 11 desktop links; Health under mobile Account | Grouped task hierarchy |
| Tracking usability | 3 | Structured logs solid; Today saved/default mismatch | Accurate local-date saved state and unified launcher |
| Condition-management UX | 3 | Conditions/episodes clear; placeholder links/tiles | Contextual overview and operable linked views |
| Experiment UX | 1 | Results route duplicate, measurement gap | Complete question-to-result workflow |
| Insight usefulness | 3 | Counts/comparisons/limits; duplicate Dashboard | Ranked Learn surface and useful handoffs |
| Premium clarity | 2 | Two real gates, other promises unenforced | Honest matrix and authoritative enforcement |
| Mobile usability | 2 | Public layout passes; primary app unverified/dense | Authenticated matrix, dialog/keyboard repair |
| Accessibility | 2 | Good primitives, inconsistent labels/dialogs/landmarks | Shared focus pattern and keyboard acceptance |
| Error recovery | 2 | Safe copy often present, missing retry/caught actions | Recoverable failure states preserving input |
| Launch readiness | 1 | Trust/legal/operations/dependency gates unresolved | Hardening release gate before marketing |

Total 23/55 (mean 2.09), an expert prioritization aid, not a scientific product KPI. Small safe fixes do not justify raising these scores without follow-up evidence.

## 31. Proposed target information architecture

```text
Today
  Daily Check-In, Quick Add, attention items, today's history
Health
  Conditions → overview / episodes / symptoms / patterns / current pattern
  Symptom history
  Health Timeline
Track
  Nutrition
  Workouts → templates / planned / active / history / progress
  Routines → Habits / Protocols (reusable regimens)
  Planner
Test
  Experiments → draft / active / results
Learn
  Insights (including useful Dashboard trends)
  Weekly Recap
Account (utility navigation)
  Profile and preferences / Security / Billing / Export / Delete / Support
```

Mobile candidate: Today / Health / Track / Learn / More, with Test and Account in More and a clear experiment handoff from Learn. Test remains prominent in desktop hierarchy and contextual journeys; avoid six tiny mobile tabs. An alternative Today / Track / Test / Learn / More is simpler but hides condition management; validate with symptom-focused users before choosing. Preserve deep links and history when consolidating Dashboard. Do not add all six proposed condition tabs until they have meaningful content.

## 32. Recommended mental model

> Track what happens. Understand your patterns. Test one change. Learn from your own history.

Help text should add: “Your records can show associations, not prove causes or predict an episode.” This guides navigation/onboarding/marketing without changing predictive semantics or promising medical benefit. Not applied globally in this sprint.

## 33. Prioritized remediation backlog

P0 must fix before public beta (paid-specific rows before paid launch); P1 before broader marketing; P2 important post-beta; P3 optional. Sizes: XS isolated copy, S small component, M workflow, L multi-surface, XL cross-system. Entries are estimates, not commitments.

| ID | Priority | Problem / user impact | Recommended fix and acceptance | Size | Sprint |
|---|---|---|---|---|---|
| B01 | P0 | No support/export/delete; users cannot exercise data control | Publish monitored contact; owner-only complete export/deletion with retention/billing handling and recovery tests | XL | 12 |
| B02 | P0 | Legal drafts/unfinished refund process | Owner/counsel finalize actual practices and publish reviewed pages; no invented legal assurance | M | 12 |
| B03 | P0 | Runtime dependency findings | Controlled upgrade, applicability review, clean build/browser checks and re-audit | M | 12 |
| B04 | P0 | Today defaults/reload/historical Edit can overwrite wrong data | Load actual day record, no invented answers, local date consistency, explicit date-specific edits, persistence/refresh tests | L | 12 |
| B05 | P0 | Paid promises lack enforcement; payment receipt implied by URL | Honest matrix, authoritative state, atomic experiment quota and downgrade/paid tests before paid release | L | 12 |
| B06 | P0 | No production DB isolation/restore evidence | Apply/verify RLS, cross-owner negative tests incl. child links, backup restore drill | L | 12 |
| B07 | P0 | Anonymous expensive/write endpoint abuse | Rate limits/request bounds; server-owned authoritative events; verify abuse tests | M | 12 |
| B08 | P0 | Signup confirmation/missing profile can strand users | Explicit confirmation/session branches, profile retry and verified first save with real test email | M | 12 |
| B09 | P0 | Primary authenticated/mobile workflows unverified | Complete seven-width matrix and core Safari/keyboard flows with isolated test accounts | L | 12–13 before beta |
| B10 | P0 if experiments remain marketed | Users complete experiment but get no answer | Implement real result/measurement path or explicitly withhold unfinished promise before beta | XL | 13 |
| B11 | P1 | Competing top-level nav and overloaded Today | Validate target IA, first-log onboarding, clearer account access; preserve redirects | L | 14 |
| B12 | P1 | Dialog keyboard traps/status/labels inconsistent | Shared accessible dialog semantics, focus restoration, Escape and pending-close behavior | M | 12–14 |
| B13 | P1 | Nutrition reuse/targets are latent; repetitive logging | Wire existing supported reuse flows after usability review, no catalog expansion | M | 14 |
| B14 | P1 | Failures hang or lose context in workouts/billing/forms | Caught Start/template loads, actionable Retry, preserve drafts and tab state | M | 12–14 |
| B15 | P1 | Condition placeholders and terminology suggest nonexistent integration | Replace with real contextual links only when supported; clarify Symptoms/Add/Log | M | 14 |
| B16 | P1 | Forecast/causal naming and readiness overclaim | Patterns Before Episodes / Current Pattern; usable-history criteria; copy review | S | 14 |
| B17 | P1 | Funnel names without authoritative emitters | Commit-based first events, dedupe, delivery monitoring and privacy review | L | 15 |
| B18 | P1 | No verified production alerting/billing reconciliation | Redacted monitoring, controlled purchase/cancel/renew/failed payment/webhook tests | M | 12 |
| B19 | P1 | Production nutrition logs contain identifiers/details | Remove payloads, regression test failure logging | S | 11 safe fix |
| B20 | P1 | Wrong signup CTA and misleading save copy | Correct target, custom-food CTA, pending billing wording | XS | 11 safe fix |
| B21 | P2 | Dashboard duplicates interpretation | Consolidate useful trends into Learn after IA validation | L | 14–16 |
| B22 | P2 | Recap too similar/long, no direct experiment handoff | Dated concise summary and one supported focus; link result | M | 14–16 |
| B23 | P2 | Common titles/SEO metadata and private indexing gaps | Unique titles, production canonical config, private noindex audit | S | 16 |
| B24 | P2 | Legacy/structured duplicate provenance and date semantics | Explicit source labels, date-specific edit contracts, no destructive dedupe | M | 14–16 |
| B25 | P2 | Development demo can overwrite real check-ins | Isolated demo account/dataset and non-overwriting seed semantics | S | 12 |
| B26 | P3 | Voice convenience unavailable | Evaluate only after reliable structured drafts and privacy boundaries | XL | After 16 |

## 34. Proposed Sprint 12–16 roadmap

**The next four implementation sprints are 12–15; Sprint 16 is the release-validation follow-through.** Urgent hardening takes precedence over the originally suggested additive sequence.

| Sprint | Outcome | Scope / exit condition |
|---|---|---|
| 12 — Trust, data integrity and launch hardening | Safe records and account control | B01–B09/B18: contact/legal/export/delete, dependencies/RLS/backups, Today/date integrity, signup/recovery, billing truth and abuse controls. Split work internally if too large; do not silently lower release gates |
| 13 — Experiments 2.0 | One change to a useful, honest result | Measurable outcomes, linked regimen, start/pause dates, adherence, transactional draft, result rendering and insufficient-data states; tests through Insights/Patterns handoff |
| 14 — Navigation, onboarding and concept simplification | Clear first-log and return journeys | Validate target IA, demote protocols, consolidate learning entry, contextual condition links, complete reuse UI and dialog consistency |
| 15 — First-party product analytics and funnel | Trustworthy activation/retention data | Authoritative completions, first-event dedupe, generic payloads, failure visibility, privacy/retention and useful funnel queries |
| 16 — Release validation and marketing readiness | Evidence-based beta go/no-go | Real browser/device/accessibility matrix, production billing/recovery/restore drills, metadata and claim review; demonstrate only working moments |

AI Voice Logging remains after these gates. No Sprint 12 work is implemented here.

## Safe-fix decision log (written before implementation)

Only isolated defects are selected: landing signup target and causal claim; check-in/recap payload log removal; nutrition error payload removal and caught Delete feedback; visible search labels; episode selector name; onboarding selection state; Weekly Recap heading/initial CTA; root skip link and nested-main removal; Quick Add unauthenticated false-success correction, Cancel label and status announcement; billing receipt wording. No schema, entitlement, model, price, nav hierarchy or experiment workflow changes.

### Implemented disposition

The preceding sections describe the **pre-fix audit baseline** unless explicitly stated otherwise. The following items are now fixed; all larger findings remain open:

- Landing Create Free Account goes to `/signup`, confirmed by browser click. Personal-experiment copy now describes observation/comparison without claiming causation.
- Direct check-in and legacy recap payload logging removed; nutrition service failures no longer print provider details or record identifiers; missing-serving debug payload removed. Other development error logging remains a documented risk.
- Quick Add without an authenticated user now reports an error and returns before form reset/close, rather than claiming a save. This branch was source-reviewed, not exercised against an expired signed-in browser session. Cancel replaces Skip; error/success feedback has alert/status roles.
- Nutrition search and both symptom search modes have persistent visible labels; the optional episode symptom selector has a name; onboarding goal buttons announce pressed state.
- Custom-food CTA is Create food, matching its action. Nutrition delete rejection is caught and shown without clearing entries. Nutrition introduction uses consumer language.
- Weekly Recap is the page heading; first creation says Generate Weekly Recap while existing recap says Regenerate. Your Week remains the section heading.
- Billing checkout-return notice no longer asserts payment receipt from a query string. Authoritative billing state behavior is unchanged.
- Root skip link targets a focusable main; nested mains removed from Insights, Recap, historical Timeline. Public browser checks found one main; clicking the visible skip link moved focus to `main-content`. Keyboard Enter attempts through the available tool did not activate the link, so keyboard activation is not claimed as passed.

### File manifest

Created: `docs/product-architecture-audit.md` (this document).

Modified (14 files):

| File | Change |
|---|---|
| `app/page.tsx` | Signup target and descriptive experiment copy |
| `app/checkin/page.tsx` | Remove payload logs, preserve input on missing auth, Cancel/status copy |
| `app/layout.tsx` | Skip link and focusable main target |
| `app/onboarding/page.tsx` | Selected goal semantics |
| `app/insights/page.tsx` | Remove nested main |
| `app/weekly-recap/page.tsx` | Heading, first-generation CTA, remove nested main |
| `app/settings/billing/page.tsx` | Non-authoritative return message |
| `components/episodes/EpisodeForm.tsx` | Symptom selector accessible name |
| `components/nutrition/NutritionHome.tsx` | Search label, consumer copy/CTA, caught Delete failure, remove debug payload |
| `components/symptoms/SymptomsHome.tsx` | Visible search labels |
| `components/timeline/HealthTimelinePage.tsx` | Remove nested main |
| `lib/nutrition/nutrition.ts` | Remove sensitive failure logging, retain friendly exceptions |
| `lib/nutrition/nutrition.test.ts` | Extend failure test and add logFood privacy/recovery regression |
| `lib/recaps/weekly.ts` | Remove recap payload logging |

No package/lockfile, migration, billing policy, analytics vendor, predictive engine or navigation configuration was changed.

## Validation record

| Check | Result on 2026-08-27 |
|---|---|
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0, no lint findings |
| `npm test` | PASS, 223 tests, 0 failed/skipped; existing Node MODULE_TYPELESS_PACKAGE_JSON warnings |
| `npm run build` | PASS, production compilation, TypeScript, prerender and route generation, exit 0 |
| `git diff --check` | PASS; Git emits line-ending conversion notices, not whitespace defects |
| Route inventory reconciliation | 48 actual page files, 48 inventory rows, no missing/extra paths |
| Public responsive regressions | 63 post-fix measurements, 0 horizontal overflows, 0 duplicate-main cases |
| Public visual inspection | 320px signup viewport inspected; readable stacked form, below-fold fields require scrolling; no full visual review of every measured page |
| Landing signup CTA | PASS: browser reaches `/signup` and Create your baseline |
| Skip-link target | Click moves focus to `main-content`; keyboard activation not established |
| Anonymous protected routes | 12 routes redirected to Login; Health, Symptoms, Nutrition, Timeline, Experiments rendered shells (17 checked total) |
| Authenticated workflows / paid transactions | NOT RUN: no test session; no writes/purchases/account changes made |
| Chrome / Edge / Safari / Mobile Safari | Brand/device-specific testing NOT RUN; in-app Chromium only |
| Registry audit | Completed with approved network access; 7 affected packages remain, no upgrades attempted |

Browser width matrix (height 844; values mean document overflow only):

| Public state | 320 | 375 | 390 | 430 | 768 | 1024 | 1440 |
|---|---|---|---|---|---|---|---|
| Landing | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Login | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Signup | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Forgot password | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Invalid reset link | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Pricing | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Privacy | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Terms | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Contact | Pass | Pass | Pass | Pass | Pass | Pass | Pass |

**Sprint status:** audit deliverable and bounded code fixes are complete; full acceptance of authenticated mobile/workflow usability and deployed production readiness is **not established**. Use this document as the remediation baseline, not a launch approval. Do not proceed automatically into Sprint 12.
