# Sprint 13A.11 — Body Weight

## Pre-change audit

Completed before schema/application edits. The authoritative dated source is `daily_checkins.weight`, one owned check-in per logical date. Profiles' `current_weight`/`goal_weight` are mutable context, not dated observations. Health-event structures and workout load fields are not body-weight measurement sources. No supported weight import/integration contract or historical unit preference was found.

The original daily_checkins/profiles CREATE TABLE migrations are absent from repository history (also explicitly documented by the disposable SQL harness). Current and historical check-in UI used an unlabeled Weight input. Profile/onboarding inputs are similarly unlabeled. Existing rows have no source unit, provenance version, or distinguishable importer. Demo generation writes plausible numeric weight values but does not prove their units. Therefore no historical date range can be safely backfilled as lb or kg. Numeric magnitude, locale, and current profile values are not evidence.

Analytics, weekly recaps, timeline and legacy experiment code consume the existing numeric weight field without converting it. Workout lb conventions do not establish body-weight provenance. Body Weight registry v1 is disabled and labeled lb; it must remain available unchanged for old references. The new experiment contract will be a distinct registry version using kg.

Persistence is necessary: new explicit source value/unit/version fields and a canonical kg value will accompany future entries. No legacy backfill. The old weight column remains a compatibility field, normalized to lb for new explicitly verified entries; the source value/unit retain the original entry. Raw-only legacy writes invalidate any prior proof rather than silently inheriting it. Existing ambiguous rows remain unchanged and unavailable to experiment analysis.

## 1. Implementation summary

Body Weight v2 is supported through registry discovery, authenticated bounded observation reads, readiness, authoring/Start, conservative continuous analysis, and durable results. Canonical analysis and display use kg. Historical ambiguity is never resolved by guessing. No new inference, medical interpretation, or Nutrition Targets / Patterns work.

## 2. Files changed

- Capture/UI: `app/checkin/page.tsx`, `lib/checkins/persistence.ts`.
- Measurement contract: `lib/measurements/body-weight.ts`, `registry.ts`, `validation.ts`, `observations.ts`, `readiness-policies.ts`, `sources/index.ts`.
- Experiments: `lib/experiments/discovery.ts`, `wizard-client.ts`, `analysis.ts`, `durable-evidence.ts`, `results-copy.ts`.
- Migration: `supabase/migrations/202608280006_body_weight_provenance.sql`.
- Tests: `lib/measurements/body-weight.test.ts`, `sources.test.ts`, `lib/checkins/persistence.test.ts`, `lib/experiments/api.test.ts`, `foundations.test.ts`, `wizard.test.ts`.
- Synthetic browser fixtures: `lib/experiments/testing/results-fixture.ts`, `weight-wizard-harness.tsx`, `scripts/weight-browser.mjs`.

The working tree already contained Sprint 13A.10 results components, display/response helpers, tests, browser harness, documentation and package changes. Those were preserved, not reset or attributed to this sprint. No new dependencies were added for 13A.11.

## 3. Authoritative weight source

`daily_checkins`, owned by authenticated user, with date-only `checkin_date`. Profile current/goal weight is not a dated source. Health-event payloads and workout resistance are not substituted for body weight.

## 4. Historical provenance findings

Neither creation timestamps nor repository history prove lb/kg for any historical range. The original table creation migrations are absent; historical inputs were unlabeled and importer/unit provenance was not stored. Inspected check-in history includes `07d5aca` and `adddd37`. No historical user unit preference or supported weight importer was found. Numeric plausibility and the workout lb convention are insufficient evidence.

## 5. Canonical unit contract

`weight_source_value` retains the entered numeric value; `weight_source_unit` is lb or kg; `weight_provenance_version=1` identifies explicit capture. Generated `weight_kg` is canonical. Exact conversion: kg = lb × 0.45359237. The normalizer validates finite positive input and agreement with persisted canonical value (floating-point tolerance only). Existing form maximum 2000 remains unchanged; no new physiological range was introduced.

## 6. Provenance states

`explicit_unit_verified` is the only qualifying state currently emitted. `source_contract_verified` and `legacy_unit_verified` are reserved, not inferred. Missing proof yields `legacy_unit_ambiguous`; malformed/nonfinite values yield `invalid_value`; unsupported source/unit/version yields `unsupported_source`. Missing/null measurements are missing, not zero.

## 7. Migration decision

Persistence was necessary to distinguish future explicit entries from ambiguous history. Additive fields and a generated canonical column do not backfill old rows. A trigger rejects incomplete/invalid proof and derives the compatibility value for explicit inputs. Existing ownership/RLS stays unchanged; internal functions are not publicly callable. Guarded SQL function patches add v2 authoring/capture support while retaining the original registry definitions.

## 8. Future capture semantics

Today/Check-in explicitly labels new entries as pounds. A changed weight writes source value, lb and provenance v1. Clearing clears proof. Unrelated edits do not attest legacy values, and unchanged legacy values are never automatically converted. Verified kg records from a future explicit writer remain supported; current UI does not introduce a unit selector. An older writer changing only `weight` invalidates existing proof. Deploy this migration before the updated application.

## 9. Measurement adapter

Authenticated owner derives from the cookie client, never the request. The adapter uses owned half-open logical-date windows in the analysis timezone, exact count, 1000-row limit and timeout. It emits only verified canonical numeric values. Missing exclusions and query failures remain explicit. Missing/unavailable schema reads fail closed. Raw source unit/value/version remain private durable evidence, not public results payload.

## 10. Duplicate-day rule

One designated daily check-in per owner/date, enforced by existing uniqueness. Duplicate logical dates fail the read rather than averaging, selecting a favorable value, or double-counting. Date-only readings do not invent timestamps. Existing timezone/DST window rules are reused.

## 11. Registry changes

`body_weight@2`: Body Weight, kg, daily, ratio, average/median, no target selector, enabled. `body_weight@1` stays disabled with original metadata. Discovery selects the newest version per key. SQL and TypeScript definitions are compared in tests. Save now persists the selected version instead of a hardcoded 1; Start validates and freezes that version.

## 12. Readiness behavior

Default 14-day historical window; seven verified days spanning seven days qualifies as good availability. Sparse verified history is limited; no measurements is insufficient; exclusively excluded weight records yield unavailable historical data. Mixed history reports usable counts and excluded-record warnings. Readiness is an availability preview, not scientific confidence or a new Start gate.

## 13. Wizard behavior

Weight / Body Composition offers selectable Body Weight v2 through server-driven discovery. Unverified history says it cannot safely be used and asks the user to track explicit-unit weights. Review retains the measurement, selected change, dates and baseline preview. No wizard-wide redesign.

## 14. Baseline behavior

Users choose a historical window, not individual records. Verified daily observations determine usable count, gaps and the existing availability policy; missing days are never imputed. The same adapter feeds analysis. A mixed baseline may have enough verified days for readiness but still conservatively suppress analysis because excluded records could bias comparison.

## 15. Analysis integration

Repeated continuous outcome, method `verified_daily_weight_mean_median_v1`. Reuses mean, median, range, absolute and permitted relative changes. The descriptive five-observation floor is unchanged and tested at four/five. Any weight provenance/value exclusions in either analyzed period produce `unable_to_determine` and no comparison facts. Null/absent days remain missing. Existing exposure eligibility and pause/terminal rules are unchanged.

## 16. Direction/desirability behavior

Frozen change success criteria may define increase or decrease as desirable. Expected direction, question wording and weight loss do not establish desirability. Without such a criterion, results report neutral higher/lower/unchanged and indeterminate desirability. Gain/loss/unspecified tests use the same decreasing observations to prove this distinction. Maintenance/target-range desirability is not added.

## 17. Display metadata/unit handling

Sprint 13A.10 retained display projection resolves Body Weight and kg from the validated frozen v2 definition. All mean/median/range/absolute-change facts use kg; relative change uses %. No locale/profile-based presentation conversion was introduced. Captured analysis facts are not mutated. Browser showed 81.647 kg baseline, 79.379 kg intervention and −2.268 kg difference for synthetic 180/175 lb data.

## 18. Mixed-unit behavior

Verified lb/kg normalize to the same canonical unit. Tests include equivalent 180 lb / 81.6466266 kg, ambiguous rows, corrupt canonical values, unsupported versions/units, nonfinite/zero/negative and string values. Ambiguous records cannot silently join verified comparisons.

## 19. Durable capture/replay

Existing immutable evidence captures retain source value/unit/version/canonical value and frozen definition. Weight capture advertises measurement registry version 2; non-weight captures retain version 1. Capture policy remains 2, source adapter/readiness contract remains 1, and normalization contract is tied to weight registry v2/provenance v1. No second persistence mechanism. SQL tests exercise authenticated capture, edits/deletion, explicit revision 2, old revision replay, private-helper denial, cross-owner isolation, export and erasure.

## 20. Compatibility findings

Existing numeric `weight` values are untouched. New verified entries keep that compatibility field in lb, preserving the preexisting raw consumers in dashboards/trends, weekly recaps, timeline and legacy experiments. Historical unit ambiguity in those old raw displays is not repaired or relabeled by this sprint. Profile/onboarding and health-event fields are unchanged. Existing raw-only demo helpers still work and remain unverified for v2; the new synthetic weight fixture explicitly supplies proof. Account export retains new fields via existing row export and retains evidence captures. Existing test suites cover check-ins, analytics, recap, timeline, demos, account and legacy experiments.

## 21. Tests added

Normalization and provenance rejection; mixed-unit owned bounded source reads; duplicate and failed-read handling; unavailable readiness; v2 discovery; legacy version preservation; SQL registry parity; authored Start snapshot; unchanged legacy check-in edits; clearing and explicit pounds; repeated continuous median and gain/loss neutrality; four/five observation floor; immutable replay; generated SQL conversion; raw-only proof invalidation; migration repeatability; RLS/export/erasure.

## 22. Validation results

- `npm test`: 522 passed, 0 failed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed, 62 static pages generated.
- `git diff --check`: passed (only Windows line-ending warnings).

Two intermediate failures were fixed: an old registry test hardcoded version 1, and SQL authoring persisted version 1 regardless of selection. Both are covered by passing regressions. Node reports the existing typeless-package warning; no package module-mode change was made.

## 23. Migrations created/applied

Created `202608280006_body_weight_provenance.sql`. Applied only by disposable PGlite test databases, including a repeat application and a legacy-row preservation test. NOT applied to a linked Supabase environment. Original four-table schema is synthetic in that harness; passing local migrations does not prove deployed schema parity. Rollout requires reviewing/applying this migration on the intended environment before deploying the new capture UI.

## 24. Browser/mobile verification

Browser skill used against `scripts/weight-browser.mjs` at localhost:3111. Real ExperimentWizard/TargetPicker/ReadinessCard and hydrated ExperimentResults/ResultsView components run with synthetic transport and engine-produced data. Verified goal → Body Weight enabled → Protein ≥180 g/day → 28-day design → Review, good baseline and ambiguous-history explanation. Results render authoritative kg, neutral lower movement and noncausal limitations. Review inspected at 390px and results at 320px; results also checked at 1280px, without horizontal overflow. Viewport override reset.

The wizard harness does not exercise deployed authentication or real HTTP routes, and its readiness fixture uses fixed synthetic dates. Browser did not submit Save/Start; those contracts were verified in authenticated disposable PostgreSQL tests. No real health records, credentials or source data were used.

## 25. Linked-environment verification

Unavailable: no designated disposable linked fixture/account was provided. No linked migrations or real records were altered. Local SQL role/RLS tests and synthetic browser checks are not claimed as live Supabase verification.

## 26. Unresolved weight-data gaps

No supported historical unit backfill rule, immutable historical unit preference, importer identity, original table-creation migration, or retained display preference exists. Verified units do not prove scale accuracy or clinically meaningful change. Old raw analytics can still contain mixed ambiguous historical numbers. Current UI cannot re-attest an unchanged value merely by saving unrelated fields. These are explicit limitations, not filled by guesses.

## 27. Recommended next sprint

Designate a disposable linked environment, review schema parity, apply the reviewed migration there, and verify newly captured weight → baseline → frozen Start → terminal capture/replay. Separately decide whether explicit kg entry and unit-aware legacy trends are desired. Do not start Nutrition Targets / Patterns expansion as part of this sprint.
