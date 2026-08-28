# Sprint 13A.3B — Domain readers and baseline readiness

## 1. Files changed

- `lib/measurements/observations.ts`: additive nutrition-day metadata, domain/target identities, timestamp observations, registered supported keys.
- `lib/measurements/sources/index.ts`: closed dispatch and policy-specific default windows using the existing orchestrator and time helpers.
- `lib/measurements/sources/domain-readers.ts`: server-only nutrition, episode and symptom readers.
- `lib/measurements/readiness-policies.ts`: version-1 policies and domain-specific summary metadata.
- `lib/measurements/domain-sources.test.ts`: 17 focused adapter/readiness/security tests, including disposable PostgreSQL fixtures.
- `lib/measurements/sources.test.ts`: replace the now-supported nutrition key in the unsupported-source assertion; existing check-in/e1RM assertions unchanged.
- `supabase/migrations/202608280003_nutrition_observation_read.sql`: new fixed-purpose read RPC.
- `docs/sprint-13a3b-domain-readers.md`: this report.

No registry changes, warehouse, domain writes, new HTTP routes, wizard, or changes to deployed migrations.

## 2. Nutrition adapter

Reads `nutrition_entries`, `nutrition_entry_items`, and `nutrition_log_days`. Only the seven registered calorie/protein/carbohydrate/fat/fiber/caffeine/alcohol outcomes are dispatched. Daily sums use stored, already quantity-scaled item snapshots, never current catalog values or a second quantity multiplication. Deleted roots and their items are excluded.

`consumed_at` determines the local day in the requested analysis timezone. Each requested day exposes entry count, known/unknown item counts, item presence, selected-field completeness, logging coverage and nullable known subtotal. No entries, all-null items, or complete coverage without items produce no numeric observation. Explicit numeric zero is retained. Mixed known/null items produce a known subtotal but are field-incomplete; an entry without items also prevents field completeness. Invalid values are excluded and cannot establish completeness.

Coverage is matched by date AND analysis timezone. Missing coverage is unknown. Partial/unknown coverage is separate from selected-field missingness; complete logging does not prove dietary adherence or total intake. Summary counts distinguish qualifying complete days, partial-coverage days, unknown-coverage days and field-incomplete days (including empty days).

## 3. Nutrition consistency decision

A standard root embed cannot independently return both all requested coverage days (including empty days) and timestamp-grouped entries in an arbitrary analysis timezone: there is no direct entry-to-log-day relationship, and separate requests can observe coverage invalidation and item edits at different snapshots. A narrowly scoped RPC is therefore necessary.

`read_nutrition_observations_v1` executes one SELECT with bounded materialized CTEs for all three sources. It is STABLE and SECURITY INVOKER, with an empty search path, authenticated-only execution, explicit owner predicates and existing RLS. It accepts only bounded dates, timezone and evaluation cutoff, with no dynamic SQL, table selectors, service role or writes. Coarse timestamp bounds retain the existing index access path; exact local-date predicates also include the first occurrence of repeated midnight. The cutoff remains exclusive. Fully skipped boundary dates are rejected.

## 4. Condition/episode adapter

Validates the durable owned `user_conditions` target. Reads nonarchived owned `condition_episodes` with onsets inside the half-open window. Other metrics batch-fetch owned `episode_updates` for those roots through the exclusive evaluation cutoff, rejecting inconsistent parent chains and pre-onset updates.

- Frequency: one observation per recorded onset.
- Duration: parent must currently be resolved, the latest eligible non-null history status must be resolved, and the valid parent end instant must match that resolution update. Open, reopened, contradictory, future-ended or history-missing episodes are censored, never zero-filled.
- Peak severity: maximum eligible recorded update severity, integer 1–10, not parent summary.
- Impact: latest eligible update category using the registry mapping none/mild/moderate/significant/severe (0–4). Ordinal baseline median returns lower/upper categories, not a fabricated fractional category. Missing latest impact is not silently carried forward.

Observations preserve onset timestamps and derived local days. Updates may occur after the onset window but must precede evaluation. This is an onset cohort, not all episodes active during the window. Mutable/backdatable current records and multi-query reads do not reconstruct an immutable historical knowledge snapshot; these limitations are exposed.

## 5. Condition frequency limitation

A complete empty read returns recorded onset count 0, no invented observation, classification `limited`, and `ZERO_RECORDED_EVENTS_NOT_VERIFIED_ABSENCE`. Positive recorded counts also remain at most limited. `NO_CONDITION_SURVEILLANCE_DENOMINATOR` explicitly prevents interpreting counts as verified absence or a surveillance-normalized rate.

## 6. Symptom adapter

Reads owned, nondeleted `user_symptom_events` using either exact catalog `symptom_id` or owned durable `user_symptom_id`. Catalog history remains eligible; durable targets never fall back to catalog IDs, names, notes or fabricated backfills. Optional owned condition scope uses `symptom_event_conditions`, validates links against verified roots/condition, and deduplicates event IDs.

Frequency counts records. Occurrence count sums only recorded positive integers: null remains unknown, not 1; a known subtotal can coexist with null-value counts, and no numeric occurrence evidence returns null total. Severity uses actual integer 1–10 records. Duration requires a valid start/end interval before evaluation and does not accept explicitly unresolved records; missing/invalid ends are censored. All timestamp ordering/comparison uses numeric instants, not mixed-offset lexical order.

No symptom surveillance denominator is invented. Complete empty frequency reads return recorded count 0 with ambiguity warning and limited readiness, not symptom-free tracking.

## 7. Readiness policies

Registry version 1 / policy version 1 throughout; these are availability heuristics, not medical confidence or start authorization.

| Outcomes | Default window | Good threshold |
| --- | --- | --- |
| Seven nutrition outcomes | 14 days | At least 7 selected-field-complete AND logging-complete days, and at least 50% of requested days |
| Episode frequency | 28 days | Never good without surveillance denominator |
| Episode duration, peak severity, impact | 28 days | At least 3 eligible episodes |
| Symptom severity, duration | 14 days | At least 5 eligible events on at least 3 distinct local days |
| Symptom frequency, occurrence count | 14 days | Never good without surveillance denominator |

For numeric/ordinal availability policies, usable evidence below threshold is limited; none is insufficient. Recorded frequency counts are the explicit zero/limited exception. Nutrition coverage percentage uses qualifying complete days divided by requested days; event-day counts have no surveillance percentage. Failed/truncated reads suppress classification, baseline aggregate, latest value and recorded total, returning operational blockers instead. Existing 13A.3A policies remain unchanged.

## 8. Security review

Existing authenticated user-scoped client and safe-error orchestration are reused. Roots carry explicit owner predicates; private target lookups verify ownership, shared catalog lookups validate existence. Child IDs are restricted to validated owned parents; condition links must join the selected owned condition and eligible owned events. All dispatch, tables and nutrient columns are closed choices. No source mutation methods, private payload logging, service-role client or new private tables were introduced; existing export/deletion boundaries are unchanged.

Disposable PostgreSQL tests verify the nutrition function's invoker/STABLE metadata, authenticated owner isolation, anonymous denial, soft deletion/coverage invalidation, and successful execution in a read-only transaction. Mock adapter fixtures additionally exercise forged targets/parent data, errors and caps. No live security or migration execution was performed.

## 9. Performance review

Windows remain capped at 366 days and reads share the existing 10-second abort budget. Nutrition uses one RPC with at most 1,000 entries, 1,000 items and 366 coverage rows; reaching either event/item cap is conservatively truncated. The RPC also declares a 10-second statement timeout. Episode/symptom root reads cap at 1,000. Updates and condition links use batches of 100 parent IDs, with a total child budget of 1,000 and at most ten child queries, not per-event N+1. Target validation requires one lookup, or two for condition-scoped symptoms. Exact-count mismatches/missing counts and cap hits suppress normal readiness.

Existing access paths include `nutrition_entries_user_day_idx`, `nutrition_entry_items_entry_idx`, the log-day unique key, `condition_episodes_condition_started_idx`, `episode_updates_episode_recorded_idx`, `user_symptom_events_user_started_idx`, and the event/condition link indexes. No index was added without measured evidence. Result caps bound payloads, not necessarily database scan/count cost; live query plans, production volumes and timeout behavior have not been benchmarked. PostgreSQL snapshot semantics provide nutrition coherence; the fixture does not simulate every concurrent production transaction.

## 10. Tests and validation

- Focused new domain tests: 17 passed, including the repeated-midnight RPC regression.
- Full `npm test`: 350 passed, 0 failed; includes 13A.3A and 13A.2 lifecycle/export/deletion regressions.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed, 53 pages generated.
- `git diff --check`: passed.

Node emits the existing module-type performance warning for TypeScript test files; it is not a test failure. All database testing used local disposable PGlite, not live Supabase.

## 11. Migration

Forward migration CREATED: `supabase/migrations/202608280003_nutrition_observation_read.sql`.

Purpose: install the bounded, coherent, authenticated SECURITY INVOKER nutrition read RPC. Apply in normal migration order after existing prerequisites only with separate deployment authorization. It was applied to disposable test databases only; live Supabase is untouched. Until deployed, nutrition source calls safely fail unavailable rather than falling back to inconsistent separate reads.

## 12. Remaining 13A.3C work

- Registry-driven target/outcome discovery.
- Authenticated experiment APIs.
- HTTP attempt budgets.
- Entitlement enforcement.
- Draft/start API integration.

None of 13A.3C, the wizard, or 13A.4 was implemented.
