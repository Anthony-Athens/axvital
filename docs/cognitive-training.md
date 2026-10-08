# Native Cognitive Training · Mental Mathletics

Implemented in AXVital with no runtime dependency on the standalone application, its Supabase project, authentication, environment, APIs, hosting, or Stripe configuration. All source changes are in AXVital. Historical accounts and results are not migrated.

## Reference inspected

The requested `C:\Users\apath\mentalmathletics` path was absent. The application was found and inspected, read-only, at `C:\Users\apath\mental-mathletics`.

- `components/TestLauncher.tsx`: timed tests of 2, 5, and 10 minutes; count tests of 20, 50, and 100 questions; addition, subtraction, multiplication, division, and mixed operations.
- `lib/math/generateQuestion.ts`: one fixed difficulty, preserved as **Standard**. Addition uses A=0–99 and B=0–(99−A). Subtraction generates result=0–99 and B=0–(99−result), then A=result+B. Multiplication uses A=0–12 and B=0–floor(99/A), or 0–99 when A=0. Division uses B=1–12, quotient=0–floor(99/B), and dividend=B×quotient. Answers are nonnegative integers up to 99. Mixed selects each operation uniformly.
- `lib/math/testStats.ts`: accuracy **percentage** multiplied by QPM. Example: 15 correct of 20 over 2 minutes = 75% × 10 QPM = **750**. The specified fraction-based fallback is not used because the original formula was verified. Saved version: `mental-mathletics-percent-qpm-v1`.
- `components/TestSessionRunner.tsx`: one question per answer; count mode advances on correct or incorrect submissions. The reference counts interval callbacks and saves summaries and answer details separately. AXVital replaces those mechanisms with timestamp deadlines, question identity guards, and an atomic validated save.
- `components/TestResultsSummary.tsx`: summary metrics and three heuristic quality flags (average response under 300ms, fewer than five answers, repeated identical answers). AXVital supplies answer review instead; these flags are not presented as validated quality judgments.
- `app/dashboard/page.tsx` and `components/ScoreHistoryCharts.tsx`: newest-first history, personal summaries, trends and baseline comparisons, per-operation detail, and a premium dashboard. Percentiles group all scores by user, require at least three sessions per user, and report the fraction of other users whose average is at or below the current user's average. The reference mixes configurations and reads individual platform results into the browser. That population comparison is not reused.
- `README.md` and persistence calls: expected tables are `profiles`, `test_sessions`, and `session_questions`. There are no checked-in database migrations or reference benchmark dataset. Deployed DDL, RLS, trigger behavior, population coverage, and representativeness could not be verified from source alone. No connection was made to the reference database, and no secrets were copied.

## AXVital behavior

Track links to `/cognitive-training`; Learn links to `/cognitive-training/history`. The five primary navigation tabs remain unchanged. These routes use AXVital's existing authentication and onboarding protection. Standard arithmetic practice and personal history are treated as ordinary authenticated tracking, like workouts; AXVital's premium feature matrix is unchanged. No new entitlement, billing product, or standalone premium gate is introduced.

Easy uses answer/operand cap 20 and factor/divisor cap 5. Standard uses 99 and 12. Hard uses 999 and 25. These two additional difficulty settings are AXVital defaults, not claimed as original functionality. The same construction rules preserve integer division, nonnegative subtraction, and bounded valid questions.

The test clock starts when the first question is published before paint. It uses elapsed timestamps, the maximum of wall time and a monotonic clock, and checks expiry on every answer and on tab visibility/focus. The timer only updates presentation. A backgrounded or sleeping timed test expires at its original deadline; its elapsed time is the configured duration, not the later time when the tab resumes. Count tests store actual elapsed milliseconds through the final answer. Rapid repeated callbacks cannot answer the same question twice; held Enter key repeats are suppressed. Blank, fractional, nonfinite, exponential, and malformed inputs are rejected.

Deliberate exit discards the unfinished test. Other navigation unmounts and abandons it. Browser unload warns about an active test. No incomplete session is stored. Completed tests show accuracy, actual elapsed time, QPM, versioned score, correct/answered counts, and per-answer correctness and response duration. They can repeat the same configuration with a new session identity.

Only completed sessions are persisted. The session stores raw answer review data (operands, operation, submitted answer, elapsed answer timestamp); correct answers and response durations are derived rather than stored redundantly. No health or condition data is included.

History is chronological and filterable by mode, difficulty, and operation. Personal bests and trends are partitioned by mode **and duration/count**, operation, difficulty, scoring version, and generator version. The trend is the difference between the latest five and preceding five mean scores; ten equivalent results are required. Older results are paginated in batches of 100. Best/trend summaries explicitly say when they cover only loaded history.

Today's Activity and the dashboard's Recent Activity read saved sessions directly, with the saved session ID as identity and the completion time as occurrence time. Each view shows “Completed Cognitive Training” once, links to the result, and creates no habit, workout, planner, or health-event mirror. The timeline classifies it separately as `cognitive_training` under the Activity filter, with only configuration and duration metadata. Cognitive data is not added to health correlation or condition intelligence sources.

## Database and deployment

Migration: `supabase/migrations/202610080003_cognitive_training.sql`.

1. Review and apply the migration to **AXVital's** Supabase project through the existing deployment process, after prior migrations. This task did not apply any production migration.
2. Deploy AXVital normally. There are no new environment variables, services, credentials, packages, or changes to Stripe configuration.
3. Smoke-test with two test accounts against the deployed AXVital database: complete both modes, reload a saved result, verify isolated history, retry a save, and confirm Recent Activity.

The new `cognitive_sessions` table has owner-only SELECT RLS and no direct client write privileges. Authenticated users save through `save_cognitive_session_v1(jsonb)`, which uses `auth.uid()`, validates configuration, operands, integer answers, chronological answer times, timestamps, completion criteria, supported versions, and payload bounds. It independently recomputes counts, accuracy, QPM, score, and completion time. Summary and answer detail commit together.

Session ID is the primary key. Identical retries return that ID; conflicting payloads and cross-owner collisions fail without overwriting records. Completed sessions cannot be edited by the client. Account exports include sessions; ownership schema checks include the new table; existing account deletion preparation and auth-user cascading deletion remove sessions safely.

## Preserve before standalone shutdown

No live old-project data was exported as part of this task. Before decommissioning:

- Archive the standalone source and commit identity, especially question generation, scoring, dashboard percentile logic, and test option definitions. Preserve the score's percentage scaling and original question distribution, including asymmetric multiplication ranges.
- Preserve the old project's database schema, migrations if maintained elsewhere, RLS policies, auth/profile triggers, and documentation. The repository does not contain this deployed contract.
- If future population comparisons are desired, preserve an authorized benchmark export or sufficiently aggregated score distribution **before deleting the project**. Its provenance must include collection dates, scoring/generator rules, mode and value, operation selection, inclusion/exclusion rules, minimum sessions per participant, sample size, tie handling, and population composition. The old summaries omit operation/difficulty/version; answer details may identify the operators actually seen but cannot reliably establish the selected configuration. Mixed and focused tests cannot be safely reconstructed from a few answered questions alone. These gaps require resolution before calling it a comparable benchmark.
- The original percentile algorithm uses each eligible user's mean and counts ties at or below, excluding the current user. Preserve that definition for audit, but use a reviewed, anonymous, configuration-matched aggregate dataset for a future implementation. Do not expose individual users' scores or transplant the old browser-wide query.
- Preserve account/result backups only under a separately authorized historical migration/retention plan. Importing accounts, passwords, identities, or personal results remains out of scope. No old credentials or user records are needed for AXVital to function.

## Validation and limits

Final checks: `npm test` **714/714 passed** (including 16 new cognitive tests); focused cognitive/timeline/recent-activity run **45/45 passed**; `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed. Existing workout, tracking, subscription, navigation, security, and account regression tests are included in the full suite. No production migration was run.

Domain tests exercise all operations/difficulties, RNG bounds, verified score units and precision, invalid inputs, deadline expiry without interval callbacks, duplicate question tokens, actual count timing, abandonment, configuration/version partitioning, navigation, and activity identity.

PostgreSQL tests use the repository's PGlite migration fixture and real database roles/RLS. They execute the complete migrations, validate atomic metrics, client-write denial, anonymous/unauthenticated denial, two-user isolation, immutable/conflicting retries, malformed/incomplete inputs, account export, and prepared account deletion. A simulated lost network response after a real committed SQL save verifies retry without duplication. The fixture is a synthetic baseline and does not assert the state of deployed Supabase.

React DOM tests exercise the actual components with synthetic persistence: numeric input and focus, blank/invalid submissions, rapid duplicate callbacks, count completion, answer review, save failure/retry with the same ID, fresh repeat attempts, timed background-return expiry, exit without save, configuration launch, and owner/configuration query filters. Browser visual checks use the real components and production CSS with synthetic data at mobile and desktop widths. Enter submission was verified in the browser. Production auth and database were not modified or exercised by those preview checks.

Unsaved results remain available for retry in the current page; they are not a durable offline queue and are lost if that page is closed or reloaded before saving. Personal scores are self-reported practice data, not a tamper-proof competition system; database validation checks arithmetic and consistency, not whether a human performed the test. Population percentiles, historical migration, original premium analytics/baseline recommendations, and mobile-device virtual-keyboard testing remain deferred.
