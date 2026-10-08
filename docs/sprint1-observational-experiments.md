# Sprint 1 — observational experiments

## Repository findings and scope

The existing legacy and v2 experiment engines assume an intervention, baseline/readiness and comparison analysis. Their configuration, lifecycle, results and Premium projection remain intact. The measurement registry already defines daily check-in energy, mood, sleep quality and version-2 body weight. Weight must have persisted explicit-unit provenance; ambiguous historical weights cannot be assumed to be pounds or kg. Existing custom outcome JSON is experiment-specific metadata, not a reusable canonical observation store.

This extension uses the established date-only/timezone utilities, weight normalization, authenticated API guard/budget, design-system controls, and account export/deletion contracts. It adds a separate observational authoring/runtime path rather than inserting observational studies into intervention analysis. No personal account, real study, billing configuration, production database or deployment was modified.

## Migration application

Apply `supabase/migrations/202610080004_observational_experiments.sql` **after all existing migrations**, including `202610080003_cognitive_training.sql`, to a disposable/staging database first. Follow the repository's normal Supabase migration workflow; do not run selected SQL fragments or skip earlier migrations. This is one additive transactional migration and does not backfill or reinterpret existing experiment records. It was executed with all prior migrations in the repository's synthetic PGlite PostgreSQL fixture.

New tables:

- `observation_metrics`: immutable reusable version-1 definitions, rating bounds/anchors, units, direction and instructions. Changing a scale/unit requires a new definition, preserving historical meaning.
- `observational_studies`: title/question, inclusive calendar schedule (up to 367 dates), fixed timezone, one primary custom metric or supported source, multiple factor references and per-factor offsets, morning-entry default, revision and lifecycle status. Configuration freezes when started. Terminal transitions freeze completeness at the last due date.
- `metric_observations`: canonical `(user_id, metric_id, observed_date)` key, explicit recorded/not-observed status, value, manual observer/coverage/note, original submission time and last edit time. No experiment-owned duplicate log and no persisted factor value copies.

Authenticated users have owner-filtered SELECT through RLS. Table writes are revoked; `save_observational_v1` derives ownership from `auth.uid()`, enforces the existing full-experiments Premium requirement, validates configuration/ranges/anchors/lifecycle, checks composite metric ownership, serializes concurrent writes, and rejects stale revisions/observation edits. It runs with a fixed empty search path and exposes no owner argument. Auth-user cascade FKs and guarded patches extend the existing reviewed account schema and export function. Do not introduce a competing export/deletion mechanism.

## UI walkthrough

1. Open **Experiments → Create observational experiment** (also available from the Intervention builder's study-type navigation). Enter a title/question and three calendar months using the first/last observed dates; duration is an alternative. Save a draft and resume from Experiments.
2. Under Primary outcome choose **Create reusable metric**. Enter `Snoring intensity`, choose bounded rating, use 0–4 and add descriptions for any/all scale values. Choose lower as preferred, add optional instructions, then save the metric. This is a user-configured example, not product-specific logic.
3. Select **New entries describe → Preceding day or night (morning entry)**. Select **Body weight** as a factor. Choose **Same as observed date** if Monday's weight should accompany Monday night's outcome entered Tuesday morning. Choose preceding-day alignment if Sunday is desired instead. Other working check-in factors can be selected independently.
4. Save the draft, then **Save and start**. The daily view defaults to the preceding date for morning entries and explicitly shows both observed date and next morning. Factor rows show their actual linked date, value/unit or missing state.
5. Select rating **0** to record an observed zero. For an unobserved night choose **Not observed**; it has no numeric value. Optional observer, coverage and note are under the disclosure. A failed save leaves the input intact.
6. Choose another observed date to backdate; return to an existing date to correct it. The shared-observation notice explains that corrections affect all studies using that metric/date. Concurrent changes require reload before retry.
7. Results show outcome points, raw linked weight and optional seven-day average, completeness counts, and an accessible table. Select the saved metric in another study to reuse the same canonical data. Daily check-in source outcomes link to the existing date-specific check-in editor. Today links to experiment observations without generating extra activity events.

## Date and results policy

Observed dates are literal calendar dates in the frozen study timezone; date arithmetic uses existing date-only helpers, independent of process timezone or DST duration. Submission/edit timestamps are separate timestamptz values. Each factor reads exactly `observed_date + offset`, with offsets 0 or -1. No nearest record, interpolation, silent date substitution or forward fill is permitted.

Completeness considers inclusive scheduled dates from start through the earlier of planned end, last due date, and terminal finish date. Today is due for same-day entries; yesterday is the last due period for preceding-night morning entries. Future periods never count. Pausing marks the study paused but does not remove scheduled dates; users can still record, backfill and correct observations. Explicit not-observed entries are counted independently from finite numeric values (including zero and boolean false represented as 0). All other due dates are missing. Results have independent outcome/source error and empty states. No correlations, statistical significance, causality, trigger discovery or intervention-analysis changes were added.

Weights normalize verified lb to kg using exactly 0.45359237 kg/lb and accept verified kg directly. Legacy/invalid/unverified weights stay missing. The optional average is the arithmetic mean of available verified observations in the seven **calendar dates** ending on the factor's linked source date (inclusive); one through seven eligible days contribute. Missing dates are excluded, never zero. The UI/table show units and contributing-day count; raw points remain missing where no eligible source exists. Six prior dates are retrieved for windows, plus the preceding-day alignment margin. Source edits/deletions refresh on refocus or **Refresh tracking data**. No source data is copied into observations.

## Validation and limits

- Full regression suite, TypeScript, ESLint and production build are run for this change; all 717 tests passed, and TypeScript, ESLint and production build passed.
- PostgreSQL tests execute real migrations and RLS against two synthetic users: Premium projection, cross-owner study/metric rejection, table write denial, immutable definition, range/anchor validation, stale-write rejection, shared canonical reuse, export and prepared account deletion.
- Domain tests cover month/DST boundaries, user-zone dates, elapsed completeness, zero/false versus not-observed, weight provenance, mixed-unit normalization and seven-day missing-day policy.
- Production-component UI tests cover three-month authoring, custom anchors, morning default, factor alignment, draft/start, zero, metadata, not-observed, failed-save preservation, backdating/corrections, reusable metric selection and live source edit/deletion refresh.
- Browser checks use `node scripts/observational-browser.mjs` (localhost port 3112), a disposable in-memory transport and the production React components/CSS. Builder/custom-metric form and daily/results layouts were inspected at 320px and 390px plus 1280px desktop; overflow measurements stayed within the viewport and keyboard Tab moved from Title to Question with visible focus. Zero saving and metadata were also exercised in-browser.
- This is not verification against a deployed Supabase instance or a real account. Browser HTTP transport simulates writes; database guarantees are tested separately in PostgreSQL. Physical mobile devices, screen-reader speech output and a live Supabase end-to-end run were not available/performed. The repository's synthetic baseline stands in for original schema tables missing from migration history.

## Sprint 2: Diets extension points

Use the source catalog/`sourceValue` adapter boundary and `{source, offset}` references, keeping independent outcome and factor selection. New sources must be implemented, owner-validated and date-aligned in both API retrieval and database allowlists before becoming selectable. Preserve an explicit source-definition contract/version when introducing richer diet/exposure semantics; the current catalog reuses check-in v1 scores and body-weight v2 provenance.

Keep canonical metric observations independent from experiments, preserve immutable definitions, and never cache/copy mutable source values into them. Diet adherence and food exposure should have their own source-domain meaning/coverage and adapters rather than arbitrary custom-factor builders or heuristic reinterpretation of nutrition logs. Preserve the established Premium gate and export/deletion contract for every new owned table. Observational results remain descriptive; later analyses should be separate, versioned contracts.

Release audit: the original last-due boundary is now exported as scheduledEndDate and shared by observational comparisons and their date controls. Morning-entry results no longer count today's not-yet-due outcome as missing. See [observational-release-verification.md](observational-release-verification.md).
