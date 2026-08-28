# Sprint 13A.5 — Active Experiment Experience & Study Health

## 1. Implementation summary

Added a read-only, authenticated v2 status endpoint and active-study presentation. It separates calendar progress, intervention exposure, outcome completeness and collection health. It reads existing Start snapshots and tracking data; it creates no experiment-specific logs or scientific results.

## 2. Files changed

- `app/api/experiments/v2/status/route.ts`
- `lib/experiments/study-status.ts`: owned snapshot/source reads and server orchestration.
- `lib/experiments/study-health.ts`: status DTO, calendar presentation and conservative server-used collection projections.
- `lib/experiments/api.ts`: status action, Free read access, existing read-budget selection.
- `lib/api/boundary.ts`: optional server-only budget alias; other callers retain their existing budget keys.
- `lib/api/validation.ts`: exact status query allowlist.
- `components/experiments/ActiveStudyStatus.tsx`: read/refresh controller and presentation.
- `components/experiments/ExperimentV2Status.tsx`: non-draft v2 delegation; draft review retained.
- `components/experiments/ExperimentDetail.tsx`: read retry and stale-ID/generation protection; existing v1 lifecycle behavior retained. Reformatted with the installed TypeScript printer before targeted edits.
- `lib/experiments/study-health.test.ts`, `api.test.ts`, `wizard.test.ts`.
- `scripts/experiments-preview/data.ts`, `preview.tsx`, `README.md`.
- This handoff.

## 3. Lifecycle behavior

The page displays the persisted status and phase, frozen question, linked intervention/outcome, analysis timezone, dates, current study day, total duration and elapsed calendar-day progress. Drafts retain the existing review flow. Scheduled, active, paused, completed, ended-early, abandoned and archived states are not rewritten into invented statuses. Passing the expected end date does not complete the experiment. Calendar progress does not subtract pauses or claim adherence. Collection estimates run only for active intervention periods without recorded pause history; other states remain unknown, with no final-results interpretation.

## 4. Supported adherence sources

Habit exposure uses the frozen Start schedule and the existing planner `occursOnDate` function. It reads existing owned occurrence statuses without calling habit helpers that materialize occurrences. Completed means recorded completion; skipped means explicit non-adherence. Absent/planned/ambiguous records are unknown. Classification is available only when the currently linked habit still matches the frozen selective criteria and the source read is complete. This is a current-record assessment, not a reconstructed audit history.

## 5. Unsupported adherence sources

- Protocol: existing analytics define required/optional completion and pause exclusions, but historical membership/pause reconciliation against the frozen study configuration is not supplied by a status contract. No replacement protocol-completion rule was invented.
- Nutrition target: frozen numeric/exclusion/cutoff criteria are displayed, but there is no general authoritative historical rule evaluator mapping all supported definitions to verified complete intake. Logged subtotal helpers are not safe substitutes; target met/not-met stays unknown.
- Nutrition pattern: frozen rules are displayed; no authoritative historical pattern-adherence evaluator exists here.
- Workout template: planned workouts link to templates and sessions, and preserve prescription snapshots. Template ID alone does not verify that a performed prescription matches this experiment's frozen version. No calendar-day adherence denominator or unverified completion percentage is displayed.
- Changed/unavailable habits, failed/truncated reads, unsupported snapshots and pause-adjusted studies remain unknown.

## 6. Eligible-opportunity handling

Habit denominators are scheduled opportunities on completed study days within the frozen experiment bounds. Daily, weekly, specific weekdays, interval and one-time schedules reuse existing recurrence semantics. Off-days are excluded. Today is presented separately and is not prematurely counted missing. Missing occurrence rows are not synthesized or written. Duplicate evidence does not produce duplicate credit. An empty denominator yields unknown, not 0% adherence.

## 7. Outcome completeness behavior

The server reads the frozen primary-outcome identity and calls the existing measurement/readiness engine for completed intervention days. It projects coverage facts only, not baseline aggregates, interim effects or readiness-as-efficacy labels.

Check-in outcomes reuse backend expected/observed-day coverage. Nutrition uses qualifying days with both known nutrient values and complete logging. Missing confirmed coverage is not proof of absent intake. Event/symptom/episode and workout sources can expose captured observations but have unknown expected/missing counts where no measurement cadence exists. Event counts are not symptom-free surveillance. Unimplemented adapters, invalid targets and incomplete reads remain unknown. No frontend daily-frequency assumptions are introduced.

## 8. Study Health behavior

The server combines the two explicit collection states: unknown evidence → Unable to determine; known skipped exposure or missing confirmed outcome coverage → Needs attention; both fully supported/complete → Good. There is no arbitrary At risk threshold or opaque combined percentage. This new read-only projection is not a statistical result or readiness-policy replacement.

The page states: “Study health reflects whether AXVital is collecting enough exposure and outcome data to evaluate this experiment later. It does not indicate whether the intervention is working.”

## 9. Today/current requirements

Supported habits show whether today is eligible and recorded completed, skipped or not confirmed. Other sources explicitly report that requirements cannot be determined. Links reuse existing habit/protocol, nutrition, workout, check-in, symptom and health surfaces. Outcome logging for today is reviewed in the existing tracker; no duplicate entry form or unsupported daily obligation is added.

## 10. Snapshot/source-change behavior

The existing version-1 Start snapshot freezes the question, dates/timezone, outcome definition/target label and selective intervention configuration. The endpoint requires its revision to match the experiment. It renders frozen labels, schedule/target summaries and nutrition rule criteria rather than replacing them with mutable live settings. Habit fields are compared with the current owned source; differences or deletion suppress adherence and produce an informational warning. Other source types disclose that comprehensive change detection is unavailable. Edit-and-revert history and all historical source versions cannot be reconstructed from these current tables. No new persistence model or fingerprint approximation was added.

## 11. Loading/error/race handling

The authenticated GET endpoint has an exact `id` query allowlist, UUID validation, owned v2 lookup, private/no-store responses and bounded queries/timeouts. It shares the existing `http/experiments/draft:GET` database budget: 30 reads/minute combined, not an unregistered limiter key. The alias is supplied only by server code. Domain reads do not write; the existing rate limiter updates its normal budget counter.

Free users retain read-only experiment access; mutations retain their existing Premium gates. Requests cannot override owner, cutoff or configuration. Snapshot/source errors are safe messages, not private database details. Lifecycle/revision is rechecked after collection reads. The client guards responses by request identity and aborts obsolete reads. Refresh, focus and 60-second revalidation hide the prior preview while loading. Failure does not leave old health displayed as current. Outer detail loading also has retry and stale-ID/generation guards. No lifecycle mutation or mutation retry was added.

## 12. Mobile/accessibility findings

Used the Browser skill to inspect actual active components in the isolated synthetic harness at 390×844. The document width did not exceed the viewport. Primary status and timeline appear first; sections stack, text wraps and progress has a textual accessible label. Existing page-container padding is retained; no new fixed footer obstructs navigation. Read errors use alerts, loading uses status text, and refreshed content is announced politely. This was not a screen-reader certification, full-shell staging test or real-device accessibility audit.

## 13. Legacy compatibility

The model-version branch remains before legacy lifecycle-action construction. V1 action availability, transition calls, timeline and results links remain unchanged. V2 non-drafts use the new read-only status component and never render legacy action controls. The existing whitespace-sensitive structural test was made formatting-insensitive while retaining its ordering assertion.

## 14. Tests added

16 new tests: 14 focused study-health/service tests, one authenticated status API/budget/ownership test, and one actual React server-render test covering active exposure/completeness states. The anonymous API test now includes status. Coverage includes timezone/DST progress, off-day denominators, explicit skip vs unknown, empty/duplicate records, nutrition completeness, unsupported cadence, failure/truncation, frozen-source changes, pause history, owned reads, textual/mobile layout, no logging forms and stale-response safeguards.

The separately run study-health and wizard files contain 32 passing tests. Some interaction/race checks are structural assertions rather than a browser race-injection framework; existing test strength was not reduced.

## 15. Validation results

- Focused study-health + wizard: 32 passed, zero failures.
- Full repository suite: 399 passed, zero failures/skips.
- Typecheck: passed.
- ESLint: passed.
- Production build: passed, including `/api/experiments/v2/status`.
- `git diff --check`: passed. Line-ending notices are not whitespace errors.

## 16. Migrations created/applied

None. Existing snapshot, tracking and budget tables are reused. No live Supabase writes, experiment starts or lifecycle actions were performed.

## 17. Live/staging verification

No signed-in live/staging verification. Browser testing used only the local in-memory preview: active timeline, unknown/zero-opportunity state, separate exposure/completeness, tracker links, mobile layout, refresh failure clearing old content, and recovery. No real health data or credentials were used. The preview is not a production route and blocks unrecognized network requests. Actual adherent/non-adherent/unknown render states are also covered by the React server-render test.

## 18. Known backend gaps

Authoritative historical protocol, nutrition rule/pattern and frozen-workout exposure reconciliation remains unavailable. Comprehensive source-change history, pause-adjusted study windows and expected cadence for event/workout outcomes are also missing. Current-record observations can be edited later. Readiness classifications are availability heuristics, not active-study efficacy or final analysis. A lifecycle/results-ready HTTP contract and automatic completion are not added here.

## 19. Remaining work

Signed-in staging integration with controlled fixtures; deeper real-device/assistive-technology coverage; authoritative exposure contracts for unsupported sources; phase-aware history and cadence where scientifically appropriate. Final results and lifecycle controls remain outside this sprint.

## 20. Recommended next sprint

Prioritize backend exposure-evidence contracts and historical source/version reconciliation, with explicit eligible-opportunity and unknown-data semantics. Validate these in staging before expanding Study Health classifications. Do not build final conclusions on unsupported adherence percentages. Sprint 13A.6 was not begun.
