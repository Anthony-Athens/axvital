# Observational experiments and Diets release verification

Date: 2026-10-08. **Repository checks pass; authenticated deployed release verification remains blocked.** This bounded sprint fixed two reproducible calculation defects, overlapped bounded evidence reads, and clarified rule capability. It added no analytics features, schema migrations, logging system or entitlement bypass. No commit, production deployment, remote migration, personal enrollment/record, or real billing change was performed.

## Environment and migration ledger

| Environment | Identification and applied migration status | Verification performed |
| --- | --- | --- |
| Repository | Ordered prerequisites present: `202610080003_cognitive_training.sql`, Sprint 1 `202610080004_observational_experiments.sql`, Sprint 2 `202610080005_diets.sql`, Sprint 3 `202610080006_linked_factors.sql`. All earlier migrations are prerequisites; Sprint 4 and this sprint add none. | Source/guarded SQL compatibility inspection and regression execution. Presence in Git is not deployment evidence. |
| Disposable PGlite | Explicit in-memory synthetic PostgreSQL created by test helpers; all repository migrations executed after synthetic definitions for original baseline tables absent from repository history. | Authenticated/anon roles, actual RPCs/RLS, ownership, export, deletion, versioning, completeness and source correction regressions. Database removed on close; this is not Supabase/PostgREST. |
| Local Next production build | Loopback only, port 3116, ordinary existing config; no signed-in account or mutation. | Observational and Diets routes redirect signed-out navigation to Login. Observational, observational-results, Diets and supplement APIs return 401. This verifies actual Next auth boundaries, not signed-in persistence. |
| Local Supabase | No Docker executable or `supabase/config.toml`; no running local Supabase identified. | None; no applied migration history exists to report for a configured local project. |
| Configured remote Supabase | URL and normally configured credentials are present, but environment designation, expected/staging project assertion and synthetic test account are absent. Billing bypass is false. Private identifiers/credentials were not printed. | Target not treated as safe staging. Remote migration history is **unknown**, not assumed applied. No remote schema/account/billing mutation or authenticated provider verification. |
| Preview/staging | No authorized app URL/test-account pair identified. | Premium/free/grace-period UI, PostgREST, new-session persistence and full signed-in application workflow remain unverified. |

## Defects and small changes

1. Sprint 4 results clipped to today regardless of morning-entry schedule, inconsistent with Sprint 1. `scheduledEndDate` now centralizes the original timezone/entry-offset/terminal boundary. Both results range controls and the server reader use it. A real PostgreSQL regression fixes the example: on January 3, a preceding-night study analyzes January 1–2, with one recorded outcome and one missing, not two missing. Factor offsets remain independent and unchanged.
2. Diet ingredient evaluation could label an unconfirmed AI identity Nonadherent using reviewed catalog facts about its guessed food. It now uses the same ingredient certainty helper as linked exposure. Catalog/reusable food facts require reliable food identity; scoped reviews of the actual item/component/anchor/event/user food can establish ingredients independently. The new regression verifies Needs review for the guess, Nonadherent after actual-serving review, and Nonadherent after confirming the identity. No ingredient, macro, preparation or quantity inference was added.
3. Linked history previously awaited dates serially. It now processes at most four dates together, retains chronological output, and shares source-day promises within each request. No persisted cache or cross-owner memoization was introduced. Existing moved/deleted-source, effective-version and reused-diet alignment regressions pass with the new schedule.
4. Diet editor guidance now explicitly connects identity/ingredient rules with the limits on amounts/servings and review of sauces/breading. It does not offer a quantity rule the evaluator cannot execute.

## Verification actually completed

- Baseline targeted suite: 13 passed before edits. Targeted date/ingredient/read regressions pass after edits. Full suite **735 passed**; TypeScript, lint (no warnings), production build and diff whitespace checks pass.
- Actual PostgreSQL tests cover draft/start/outcome persistence, zero/not-observed values, category/specific exceptions and immutable versions, ownership/anon denial, wrong-owner references, export and synthetic account deletion. Existing canonical intake/supplement move/edit/delete tests invalidate the relevant dates; diet exceptions preserve actual exposures and remain separate from regular adherence.
- Production-component JSDOM regressions cover three-month custom 0–4 outcome authoring, morning defaults/alignment, failed-save preservation, backdating, unsaved outcome retention on focus/source refresh, unknown versus absent, results errors/empty states, date filtering and chart/table alternatives. These use mocked HTTP/auth.
- The Diets browser harness uses real local PGlite RPCs with mocked HTTP/auth. This sprint created a disposable category-exclusion/specific-food-allow draft with a Saturday exception, saved it by keyboard, and verified the reusable definition after reload. Editor controls had zero unlabeled inputs/selects/textareas in a DOM label audit. At 320px/390px/1280px there was no horizontal page overflow.
- The results browser harness uses real calculations/components with synthetic HTTP/auth. Expanded continuous-factor details had three labeled chart images and table captions, with no page overflow at 320px/390px/1280px. Keyboard activation opened disclosures. Existing automated results tests verify stale chart removal on errors and recovery after changed outcomes.
- No automated axe engine was installed. Manual browser accessibility-tree/DOM checks and keyboard checks were performed; they do not constitute a comprehensive accessibility audit. Screen-reader speech, focus behavior across real authenticated source pages, and physical phones remain unverified. Viewport emulation is not device testing.

The complete signed-in UI journey through actual Supabase, a second account, a new login session, and source logging screens was **not** completed. Neither were deployed intervention/Nutrition/Protocols/Today/timeline smoke tests. Their repository regressions pass, and no activity-record insertion was added; this is not proof of deployed compatibility or absence of duplicates in deployed data.

## Reproducible performance evidence

Run `node --experimental-strip-types scripts/observational-release-benchmark.mjs`. The script imports no environment file, uses no remote credentials, and creates only a disposable PGlite fixture. Fixture Premium state is synthetic database-test setup, not a real subscription or a bypass of application access. Timing excludes database creation/seeding and measures the actual `readObservationalResults` reader/calculations through the synthetic Supabase-shaped transport.

Dataset: 90 scheduled dates, seven factors (weight, diet, canonical food, dairy, gluten, alcohol, exact supplement), a custom 0–4 rating, 90 composite meals/180 included components, 90 beverages, 45 supplement uses, 90 weights, 90 outcome records including explicit not-observed days; private source classifications and a serving-specific correction. Confirmations are conservatively invalidated by classification changes, so incomplete regular diet/negative exposures remain excluded in this workload. Reported pair counts are deliberately not replaced with zero or fabricated complete logging.

Single-run measurements on this Windows workspace; normal runtime/load variation applies:

| Scenario | Serial dates, no added latency | Four dates, no added latency | Serial dates, simulated 20 ms/RPC | Four dates, simulated 20 ms/RPC |
| --- | ---: | ---: | ---: | ---: |
| Initial 90-date result read | 5,275 ms | 4,675 ms | 8,791 ms | 5,811 ms |
| Change to 31-date range | 1,586 ms | 1,691 ms | 3,155 ms | 1,954 ms |
| 90-date refresh after correction | 4,607 ms | 4,907 ms | 8,938 ms | 5,749 ms |

Each 90-date run made **18 metadata/outcome queries + 270 source RPCs**: 90 each for diet, intake and supplements. Each 31-date run made **12 queries + 93 source RPCs**. Multiple food/classification factors reuse one intake RPC per source day; counts did not grow per food factor. Before/after pair counts matched. The optimization overlaps waits rather than claiming fewer requests or consistently faster local CPU work. Simulated latency is an explicitly injected delay before each RPC, not a measurement of remote Supabase latency. One client results request performs these bounded server reads; these figures are not browser page-render timings.

Diet and independent intake exposure still each read their domain snapshot for the same day. Metadata is reread per 31-day chunk. No source cache persists across requests, so corrections refresh immediately. Profile real staging network/query plans and a maximum-range request before release; any future reduction must retain `readDietAssessment`, owner boundaries and fingerprints. The remaining SQL/snapshot cost and conservative confirmation invalidation are documented follow-ups, not an infrastructure rewrite in this sprint.

## Diet capability audit

| Capability | Actual behavior |
| --- | --- |
| Quantity-limited beverage exceptions | Unsupported. No amount/limit selector is offered. An allow rule allows the resolved identity, without a quantity cap. Instructions are explanatory only. |
| Serving size/unit normalization | Existing nutrition ingestion/recipe workflows and verified weight/supplement adapters normalize their supported units. Diet rule evaluation itself is categorical; it does not enforce servings, grams or fluid amounts. Missing macros do not prove ingredient absence. |
| Breading/preparation | Persisted included components or a canonical component library replace the parent representation. Known breading/classification may establish a violation; unconfirmed/inferred identity stays reviewable. No preparation guess is treated as reviewed fact. |
| Sauce/uncertain components | Unknown required ingredients or unresolved relevant identity/category yields Needs review unless a separate reliable violation already establishes Nonadherent. Absence needs completeness; planned exception stays its own status with underlying reasons. |
| Specific versus category exception | Specific food rules override category rules. Ingredient restrictions still apply independently. Equal-specificity contradictions block activation or become Needs review if later catalog changes introduce ambiguity. |

## Release steps — not executed against production

1. Identify an authorized disposable local/staging project and application URL, record target identity and backup/recovery plan, and obtain two synthetic users plus legitimately configured Premium/free accounts. Do not reuse personal records or change entitlements just to pass a check.
2. Read that target's migration history and original schema first. Compare **all** repository migrations in filename order. Resolve the absent baseline definitions from the real application's schema; the synthetic test baseline is not a production schema source. Review pending SQL before applying anything. A configured local project can apply pending migrations with `supabase migration up --local`; use the established team's reviewed staging migration process for remote staging. Never reset a populated database.
3. Confirm the 0004 observational, 0005 Diets and 0006 linked-factor functions/tables/policies are present after applying only approved pending migrations. This sprint requires no new SQL. Record migration versions actually observed, not inferred from Git.
4. Through ordinary authenticated Supabase/PostgREST, execute the request's full three-month example: category rules/specific exception/weekly exception, custom 0–4 morning outcome, all supported factors, composite/beverage/supplement/weight logging, uncertainty review, separate confirmations, zero/not-observed/failed-save cases, corrections/deletion/date moves, reload and new-session persistence. Verify both affected dates and history/results.
5. Attempt cross-owner reads/writes/references with the second user; verify actual Premium/free/expired/grace-period handling without changing the pricing model. Export and delete only explicitly disposable synthetic accounts. Service-role success is not evidence of RLS.
6. Smoke-test existing intervention creation/logging/results, Nutrition, Protocols, Today and timeline. Inspect for duplicate activity records. Measure real initial/range/correction timings and source request counts with the benchmark-sized workload; check screen-reader output and physical mobile devices.
7. Record evidence and remaining failures, review these code changes, and follow the normal release approval/rollback process. Production migration/deployment is a separate step; it was not authorized or executed here.

## Personal trial checklist — user-operated after release verification

For a few days, assess whether entering a morning rating clearly identifies the preceding night and each factor's source date. Record zero when observed and Not observed when unknown. Use normal existing logging; do not duplicate entries in experiments. Review one uncertain ingredient, confirm food and supplement completeness separately, and check that returning to an unsaved outcome preserves it. Correct or move one appropriate record and verify both dates update. Inspect exception days, exclusions and small-sample results. Note extra taps, confusing wording, lost input, unexpected confirmation invalidation, and load times. No personal trial was created automatically.

## Changed files

- `lib/experiments/observational.ts`, `observational-results-service.ts`, `components/experiments/ObservationalResults.tsx`: shared last-due date boundary.
- `lib/diets/model.ts`, `lib/experiments/linked-evidence.ts`: shared ingredient certainty policy; `lib/diets/release-review.test.ts`: regression.
- `lib/experiments/linked-service.ts`: bounded four-date reads; `lib/experiments/observational-results-database.test.ts`: morning-count regression.
- `components/diets/DietsHome.tsx`: capability/review guidance.
- `scripts/observational-release-benchmark.mjs`: disposable reproducible performance workload.
- This record and implementation guides: findings, limitations, release and trial instructions.
