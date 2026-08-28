# Sprint 13A.1 — Experiments 2.0 architecture audit and implementation plan

Date: 2026-08-28. Status: architecture recommendation, not implementation authorization.

## Executive recommendation

Extend the existing experiment tables; do not introduce a second experiment system. Treat an experiment as a versioned plan referencing existing behaviors, targets, and measurement sources. Keep exactly one primary intervention and one primary outcome when a plan is ready to start. Preserve incomplete drafts and legacy records without inventing missing semantics.

Use a typed, versioned outcome/source registry; reusable structured rules outside the Experiments namespace; user-owned nutrition patterns built from those rules; and one immutable, selective configuration snapshot at start. Read historical observations from their original domain tables. Do not copy check-ins, food logs, episodes, or workout sets into experiment measurement tables simply to run an experiment.

The largest risks are not missing tables: they are missing semantics, nullable/partial observations, mutable source configuration, unrecorded units, and the fixed account export/deletion contract.

### Evidence and limitations

- Inspected checked-in migrations through `202608270005`, domain types/services, experiment and related routes/components, account-control SQL and documentation, analytics, trigger analysis, and database tests.
- No live Supabase connector, database inventory, or user-data export was available in this audit. No live experiment rows were inspected. Counts, deployed migration status, grants, actual historical units, and unmappable legacy records remain unverified. Seed templates and local fixtures are not production records.
- Original CREATE TABLE definitions for profiles, daily check-ins, health events, and weekly recaps are absent from migrations. Application types and queries establish expected fields, not complete deployed DDL. Account-control documentation records previous owner confirmations; this audit did not independently reverify them.
- `lib/security/database.test.ts` explicitly constructs a synthetic original schema and executes checked-in migrations in disposable PGlite databases. Passing those tests does not establish live-schema parity.
- No product code, migration, schema, deployment, account setting, or user data was changed. Only this report was added. Existing tests executed migrations in their local disposable test database; no Supabase migrations were applied.

### Principal source map

Paths in tables below are repository-relative identifiers. These links open the principal sources:

- [Experiment schema](C:/Users/apath/axvital/supabase/migrations/202608060003_add_experiment_engine.sql), [episode extension](C:/Users/apath/axvital/supabase/migrations/202608210003_add_condition_episodes.sql), [ownership hardening](C:/Users/apath/axvital/supabase/migrations/202608270001_integrity_owner_hardening.sql).
- [Experiment service/types](C:/Users/apath/axvital/lib/experiments/experiments.ts), [creation/list UI](C:/Users/apath/axvital/components/experiments/ExperimentsHome.tsx), [detail UI](C:/Users/apath/axvital/components/experiments/ExperimentDetail.tsx).
- [Nutrition foundation](C:/Users/apath/axvital/supabase/migrations/202608060004_add_nutrition_foundation.sql), [nutrition reuse/targets](C:/Users/apath/axvital/supabase/migrations/202608060005_add_nutrition_reuse_targets.sql), [nutrition helpers](C:/Users/apath/axvital/lib/nutrition/reuse.ts).
- [Planning types](C:/Users/apath/axvital/lib/planner/types.ts), [protocol schema](C:/Users/apath/axvital/supabase/migrations/202607210003_add_protocols.sql), [protocol instantiation](C:/Users/apath/axvital/lib/protocols/instantiate.ts).
- [Workout schema](C:/Users/apath/axvital/supabase/migrations/202607210004_add_workout_planning_execution.sql), [workout types](C:/Users/apath/axvital/lib/workouts/types.ts), [safe template management](C:/Users/apath/axvital/supabase/migrations/202608210001_add_safe_workout_template_management.sql).
- [Symptom schema](C:/Users/apath/axvital/supabase/migrations/202608060002_add_symptom_intelligence.sql), [episode helpers](C:/Users/apath/axvital/lib/episodes/episodes.ts), [baseline helpers](C:/Users/apath/axvital/lib/analytics/baselines.ts), [analytics source queries](C:/Users/apath/axvital/lib/analytics/service.ts).
- [Account SQL contract](C:/Users/apath/axvital/supabase/migrations/202608270003_account_control.sql), [account controls documentation](C:/Users/apath/axvital/docs/account-data-controls.md), [database regression tests](C:/Users/apath/axvital/lib/security/database.test.ts).

## A. Current-state architecture

### Experiment tables, fields, relationships, and ownership

| Table | Current structure and purpose | Ownership / deletion |
| --- | --- | --- |
| `experiments` | UUID; `user_id`; required name/hypothesis; description; status/phase/design; baseline, intervention and planned date pairs; actual start/completion/pause/end-early timestamps; adherence target; minimum baseline/intervention observations; result summary, notes, audit/archive timestamps. Unique `(id,user_id)`. | Owner RLS; Auth CASCADE. Date ordering and completion/archive timestamp checks. |
| `experiment_interventions` | Type, name, instructions, numeric/text target, unit, frequency type/target, timing text, `custom_definition`, primary flag. Nullable FKs to planned activity, user protocol, workout template. | Parent-experiment RLS; experiment CASCADE; linked source FKs SET NULL. Partial unique index allows at most one primary. |
| `experiment_outcomes` | Primary/secondary role; type/name; symptom FK or custom symptom text; check-in field, metric key, custom metric definition; aggregation, expected direction, measurement frequency, unit, minimum observations, ordering. Episode migration adds `user_condition_id` and four episode types. | Parent-experiment RLS; experiment CASCADE; symptom and condition RESTRICT. Partial unique index allows at most one primary. |
| `experiment_condition_links` | Many-to-many contextual condition links; unique experiment/condition. | Parent-experiment RLS; both FKs CASCADE. Not a measurable outcome. |
| `experiment_phase_events` | Owner/experiment, event type, from/to status and phase, occurred timestamp, reason, metadata. | Both Auth and experiment CASCADE; owner and parent checks. Not append-only under current owner CRUD policy. |
| `experiment_measurements` | Owner/experiment/outcome; timestamp, phase; exactly one numeric/boolean/text value; unit; source type/UUID; manual flag and notes. | Auth/experiment/outcome CASCADE. Later composite `(outcome_id,experiment_id)` FK, initially NOT VALID, prevents mismatched new references. RLS validates source ownership. |
| `experiment_results` | One row per experiment; generation timestamp; counts/completeness/adherence/quality; primary baseline/intervention/change/percent/text; secondary JSON, limitations, analysis version. | Experiment CASCADE; owner through parent. Exists as storage, not an integrated result pipeline. |
| `experiment_templates` | Shared slug/name/description/hypothesis template, intervention/outcome JSON defaults, durations/safety notes/order/active status. Eight seeded templates. | Authenticated SELECT of active rows; no owner field or browser write policy. |

The later restrictive policies matter: Sprint 12A adds owner guards and checks existing single-column private FKs through the referenced table's SELECT policy. It also checks measurement source ownership and outcome/experiment identity. These policies are generated when that migration runs; they do **not** automatically protect FKs added in Sprint 13A. New references need their own constraints and policies.

`experiment_measurements.source_record_id` is polymorphic, not a durable FK. Allowed sources include check-ins, symptom/health events, occurrences, sessions, manual values and calculated snapshots; no nutrition-item or condition-episode source type exists. The ownership helper requires null source IDs for manual/calculated snapshots. Historical source deletion can make a referenced measurement invisible under RLS. Do not expand this table into a duplicate observation warehouse.

### UI, APIs, types, and defects relevant to 13A

- `/experiments` renders `ExperimentsHome`: one-page draft form, template cards, current experiment list. `/experiments/[id]` and `/experiments/[id]/results` both render the same `ExperimentDetail`; the latter is not a distinct results implementation.
- Client components call browser Supabase services directly. There is no experiment-specific `app/api` endpoint today. Draft creation is several requests with compensating deletion, not one transaction. The created-event insert result is not checked.
- Habit/protocol/workout intervention selection currently collects a type and free-text name, not an existing entity selection. Existing source FK columns are not populated by `createDraft`.
- Outcome choices include entries that are not configured adequately: custom numeric lacks the required custom definition and fails its DB check. Symptom selection lacks symptom identity. The original symptom-outcome CHECK has a nullable expression, so SQL UNKNOWN can permit missing identity rather than reliably rejecting it. Validate explicitly; do not rely on that CHECK.
- Template clicks copy only name, hypothesis, intervention type/name; they ignore primary/secondary outcome defaults and template durations. Unrelated templates can retain the initial Energy outcome.
- TypeScript interfaces are partial handwritten projections. `Outcome` omits condition ID and other SQL fields; `Intervention` omits linked IDs. SQL phase `washout` is absent from the TS phase union. Types do not provide an authoritative registry.
- `createPatternExperimentDraft` already links a real user condition and sets `episode_frequency`, but first creates an Energy outcome then updates it in further requests. Preserve the handoff while making its eventual write atomic and correctly typed from the outset.
- Other consumers include `lib/timeline/sources/experiments.ts`, `lib/analytics/service.ts`, and `components/episodes/TestPatternButton.tsx`. Existing workout template dependency checks also inspect experiment links.

### Lifecycle and baseline/result behavior

Stored statuses: `draft`, `scheduled`, `active`, `paused`, `completed`, `ended_early`, `abandoned`, `archived`. Stored phases: `planning`, `baseline`, `intervention`, `washout`, `analysis`, `complete`.

`transition_experiment` locks the owner row. It supports draft activation, baseline→intervention, pause/resume, complete, end early, and abandon. Activation checks primary intervention/outcome existence; unique indexes provide the upper bound. Scheduled/archive/restore names exist in storage but do not have corresponding actions in this RPC. UI omits some RPC-supported actions, such as completing a paused experiment.

Important gaps:

1. Presence is checked on activation only. Owner table CRUD can subsequently remove or change primary children or directly change status; there is no durable exact-one or frozen-config invariant.
2. The transition function updates `old` with `RETURNING *` before writing the event, so `from_status`/`from_phase` use the new values. Future events must use separately captured prior values. Do not fabricate corrected historical transitions.
3. A baseline-intervention draft starts its baseline on the creation day and plans intervention afterwards. It does not inspect the preceding historical period. Activation of an old draft does not refresh its dates.
4. Date generation mixes local `setDate` with UTC `toISOString().slice(0,10)`. Experiments store no analysis timezone.
5. No immutable experiment start snapshot/version exists. No baseline readiness query or configured success criterion exists.
6. `comparePeriods` computes simple means/change and a sample-count-based evidence label, but no production caller was found connecting it to measurement collection or result persistence. Do not promote that label into a quality claim or wire this helper into 13A.
7. `episodeOutcomeValues` already provides count/duration/peak-severity/impact values. It is a useful domain helper, not a complete experiment evaluator: onset-window selection, later updates and censored durations need explicit policy.

## B. Existing domain integration map

| Domain | Actual storage and code | Routes and integration recommendation |
| --- | --- | --- |
| Habits | `planned_activities` filtered by `activity_type='habit'`; `planned_activity_occurrences`; `lib/habits/*`, `lib/planner/*`. Binary/quantity/duration targets, minimum, partial completion, recurrence, pause/reactivation. | `/habits`, `/habits/[id]`, `/today`, `/weekly-overview`. Reuse intervention `linked_planned_activity_id`; never create `experiment_habits`. |
| Protocols | `protocol_templates`, `protocol_template_activities`, `user_protocols`, `user_protocol_activities`, `protocol_pause_periods`; instantiated activities live in planning. | `/protocols`, `/protocols/new`, `/protocols/[id]`, template detail/edit. Select an existing **user protocol instance**, not merely its template; reuse `linked_user_protocol_id`. |
| Conditions | Shared `condition_categories`, `conditions`; private `user_conditions`; `lib/conditions/*`. Custom user conditions supported. | `/health`, `/health/conditions/[id]`. Outcome targets use `user_conditions.id`, not catalog condition ID. Keep contextual links separate. |
| Symptoms | Shared `symptom_categories`, `symptoms`, `condition_symptoms`; private `user_symptoms`, `user_symptom_events`, `symptom_event_conditions`; `lib/symptoms/*`. | `/health/symptoms`, `/health/symptoms/history`. Catalog condition-symptom relationships are suggestions; actual event-condition links define condition-scoped observations. |
| Condition episodes | `condition_episodes`, `episode_updates`, `episode_symptom_links`; `lib/episodes/*`. Timestamp interval, severity 1–10, ordinal impact, status and progress updates. | `/health/episodes/new`, `/health/episodes/[id]`, condition pages. Use condition FK + selected metric; episode frequency is not the condition itself. |
| Exercises | `exercises`, global when `user_id IS NULL`, private otherwise; aliases, normalized name, tracking type/equipment; `lib/workouts/exercises.ts`. | Library selector inside workout builders; no separate library page required. Add outcome exercise FK and shared-or-owner checks. Do not match by name. |
| Workout templates | `workout_templates`, groups, exercises, sets; `lib/workouts/templates.ts`. Safe replace/delete RPCs and dependency checking. | `/workouts/templates/new`, `/workouts/templates/[id]`, `/edit`. Existing experiment FK can represent a template intervention. Templates themselves are not performance observations. |
| Workout plans | `planned_workouts`, `planned_workout_exercises`, `planned_workout_sets`; source references plus name/target/group snapshots. | `/workouts/planned/[id]`. Planned targets are not completed performance. |
| Workout execution | `workout_sessions`, `workout_session_exercises`, `workout_session_sets`; actual reps/load/duration/distance/status/completion timestamp. | `/workouts/sessions/[id]`, `/summary`, `/workouts/progress`. Join through exercise ID, validate redundant parent IDs, and use eligible actual sets only. |
| Nutrition | `nutrition_entries`, `nutrition_entry_items`, `nutrition_targets`, `saved_meals`, `saved_meal_items`, `user_food_preferences`; `lib/nutrition/*`. | `/health/nutrition`, `NutritionHome`. Use consumed timestamp and snapshot nutrient values; integrate rules here, not a separate experiment food log. |
| Foods | Global `food_categories`, `foods`, `food_servings`; private `user_foods`. | Existing Nutrition search/custom-food UI. Categories are browsing taxonomy; not complete ingredient evidence. |
| Daily check-ins | Expected `daily_checkins`; `lib/types.ts`, `lib/checkins/persistence.ts`. Daily weight, energy/mood, ordinal sleep, stress, exercise/nutrition quality, alcohol, notes/tags. | `/checkin`, profile/history/analytics. Partial answers remain null. Unique owner/date enforced by hardening migration. |
| Measurements/body composition | Historical weight is a check-in field; profile current/goal weight are mutable settings. No general body-measurement table found. | `/checkin`, `/profile`. No body-fat or waist source; do not invent one inside Experiments. |
| Supplements/health events | Expected `health_events`: type, local event date/time, optional supplement name/dose fields, fluid/food/exercise/symptom/note fields. Planned supplement behavior can use planning/protocol activities. | `/today#optional-events`, timeline. No durable supplement catalog identity; prefer existing scheduled behavior completion rather than matching supplement-name text. |
| Other tracking | `weekly_recaps`, optional `user_insights`, analytics and trigger/outlook services. | `/insights`, `/weekly-recap`, condition patterns/outlook. Derived summaries are not original measurements. No dedicated steps, sleep-duration, or continuous activity history found. |

### Existing snapshots are useful precedent, not universal versioning

Protocol instantiation copies template configuration into a user protocol and planned activities; later template edits do not retroactively replace those copies. Those instance/activity rows remain mutable. Habit targets/schedules have no immutable historical versions; occurrences retain results but not the entire schedule/target definition. Baseline inspection must not call `getHabitOccurrencesForRange`, which invokes occurrence generation and writes data.

Workout plans snapshot template configuration; sessions copy planned values and store actual values separately. Source links often SET NULL. These are application snapshots with editable execution records, not blanket database immutability. Nutrition logging snapshots servings/nutrients and retains food references. Episodes have progress rows, but owner CRUD policies mean the comment describing immutable updates is not an enforced append-only guarantee.

## C. Requirement-by-requirement gap analysis

Legend: **Already supported**, **Partially supported**, **Missing**, **Requires design decision** describe the current implementation, not deployed-data verification.

| Prompt requirement | Classification | Evidence / gap |
| --- | --- | --- |
| 1A: durable existing-entity integration | Partially supported | Habit/protocol/template and condition/symptom FKs exist; wizard does not use most; exercise target missing. |
| 1B: structured semantics | Partially supported | Numeric targets, recurrence and aggregations exist; no reusable predicate/operator/source contract. |
| 1C: one primary intervention | Partially supported | At-most-one index plus activation presence; not maintained after start. Protocol already groups behaviors. |
| 1D: exactly one primary outcome, optional secondary | Partially supported | Role/index exists; secondaries not authored by UI; primary can disappear after activation. |
| 2: weight/body composition | Partially supported | Weight history exists by expected check-in contract; body fat/waist absent; units implicit. |
| 2: condition target + measured outcome | Partially supported | Episode outcome FK/types and condition handoff exist; general picker absent. |
| 2: existing symptom / condition-associated symptom | Partially supported | Catalog/user symptoms and event links exist; stable custom-symptom-to-event identity missing. |
| 2: workout exercise performance | Partially supported | Actual sets and exercise identity exist; no outcome exercise FK or versioned derivation; load units absent. |
| 2: sleep | Partially supported | Ordinal quality exists; historical sleep duration does not. Profile typical hours is not a time series. |
| 2: mood/energy | Already supported | Daily numeric 1–10 fields; need experiment source adapters and readiness. |
| 2: nutrition outcomes | Partially supported | Snapshot nutrients exist; experiment types/registry and completeness interpretation missing. |
| 2: custom outcomes | Requires design decision | Legacy manual-value/custom-definition storage exists; reusable custom metric source is absent. Do not widen this sprint. |
| 3: existing habit / protocol selection | Partially supported | Storage FKs exist; selection UI, typing and validation missing. Instance-vs-template must be explicit. |
| 3: nutrition targets including zero/cutoff | Partially supported | Existing targets lack explicit operator and reject zero; timestamps support cutoffs but no time-rule model. |
| 3–4: reusable patterns and food evidence | Missing | No rule sets, ingredient graph, multi-label dietary evidence or coverage attestation. |
| 4: foods/macros/categories/manual/incomplete data | Partially supported | Foods, servings, snapshots and nullable nutrients exist; private foods lack category, no ingredient completeness. |
| 4: adherent / non_adherent / unknown | Missing | No dietary evaluation contract; generic totals can turn null into zero. |
| 5: reusable rules across domains | Requires design decision | Reuse targets/recurrence as inputs; adopt typed reusable predicates instead of text or arbitrary JSON logic. |
| 6: Target/Pattern/Habit/Protocol/Experiment separation | Partially supported | Habit/protocol/experiment separation exists; target semantics and patterns need formalization. |
| 7: historical baseline/readiness | Partially supported | Analytics has 7/30/90-day baselines; experiment dates are prospective; no target-aware read-only readiness. |
| 8: preregistered success criterion | Missing | Expected direction/adherence target are not change thresholds for an outcome. |
| 9: draft/start/lifecycle | Partially supported | Drafts and transitions exist, incomplete UX; exact-one/direct-write protection and start freeze absent. |
| 9: historical configuration integrity | Requires design decision | Domain snapshots exist selectively; adopt experiment start configuration snapshot, not wholesale duplication. |
| 10: outcome registry | Partially supported | Analytics definitions and trigger exposure definitions are precedents, not centralized target-aware source contracts. |
| 11: editable generated question | Partially supported | Required name/hypothesis plus handoff text exist; no authoritative generation from structured configuration. |
| 12: six-step creation wizard | Missing | Existing single form does not implement the proposed flow or historical readiness. |
| 13: backwards compatibility / existing data inventory | Requires design decision | Keep v1 rows; live record inventory remains outstanding. No implicit conversions based on names. |
| 14: ownership/RLS/FKs | Partially supported | Strong 12A protection for then-existing relationships; new FKs need explicit same-owner/identity enforcement. |
| 14: export/deletion/budgets | Partially supported | Strong fixed contract exists; every new private table and guarded API requires additive integration. |
| 15: exclude Sprint 13B | Already supported by this audit boundary | No implementation. Leave existing comparison code untouched; do not expand scoring/results/adherence. |
| 16: required A–J architecture report | Already supported by this deliverable | This document, including schema/file plan and decisions. |
| 17: validation/no migrations/no deploy | Already supported | Validation passed locally; no Supabase apply, schema changes, deployment or implementation. |

## D. Recommended additive data model

### Invariants and naming

Use “outcome target entity” for a Condition/Symptom/Exercise, and “behavior target” for a measurable rule. Do not conflate either with the experiment's outcome value.

- A v2 draft may be incomplete. A **ready/startable** experiment must contain exactly one primary intervention and exactly one primary outcome; secondary outcomes are bounded (recommend three initially). If product requires a primary from the first save, save Step 1's outcome first; do not invent a placeholder Energy outcome.
- For v2 allow one intervention row total in 13A; multi-component changes are represented by a protocol or pattern. Leave legacy nonprimary rows untouched.
- Database validation, not UI-only checks, must enforce type/reference compatibility, same-owner links, exact-one at start and throughout started life, and snapshot immutability.
- New tables below use UUID `id`, `created_at`, `updated_at` unless immutable, and appropriate owner/time/reference indexes. Private roots use `user_id NOT NULL REFERENCES auth.users ON DELETE CASCADE`; private child tables also carry `user_id` and composite owner FKs where feasible. Authenticated roles have owner-only SELECT and controlled writes; anonymous has none. Explicitly grant/revoke privileges; do not depend on deployed default grants.

### Existing table additions

| Table / proposed column(s) | Purpose, constraints, references and ownership |
| --- | --- |
| `experiments.model_version` | Integer, existing rows default 1; explicit v2 creation sets 2. Controls compatibility validation/rendering, not inferred from content. Inherits owner RLS/deletion. |
| `experiments.config_revision` | Monotonic integer for draft optimistic concurrency. Increment through transactional draft save; start requires matching revision. |
| `experiments.question` | Nullable bounded editable display text. Preserve `name` and `hypothesis` unchanged for legacy records. Generated v2 question is editable but never parsed as logic. |
| `experiments.question_is_custom` | Boolean marking user override, so changing a picker does not silently replace edited text. |
| `experiments.analysis_timezone` | Validated IANA timezone required for v2 start; freezes daily grouping. No retroactive timezone claim for v1. |
| `experiments.baseline_mode` | Nullable for legacy; v2 `historical`, `prospective`, or `none`. Reuse existing baseline/intervention date columns and study design; no duplicate date fields. Historical activation enters intervention; prospective enters baseline. |
| `experiment_interventions.rule_id` | Nullable FK to private `target_rules`; RESTRICT, archive rules instead. Numeric/time/exclusion target variant uses one rule. Owner must match experiment. |
| `experiment_interventions.nutrition_pattern_id` | Nullable FK to private `nutrition_patterns`; RESTRICT. Add `nutrition_pattern` to the allowed intervention types. Owner must match experiment. |
| Existing intervention linked IDs | Reuse, do not add replacement habit/protocol/workout IDs. V2 CHECK/trigger requires exactly the appropriate reference for each type; custom/manual gets an explicitly validated configuration, not inferred links. Add explicit owner checks to new FKs. |
| `experiment_outcomes.registry_key`, `registry_version` | Nullable for v1; required for v2 start. Whitelisted measurement definition/version. Keep legacy `outcome_type` as a compatibility category; widen its CHECK only for enabled v2 categories. Reuse aggregation/direction/unit fields with strict registry validation. |
| `experiment_outcomes.exercise_id` | Nullable FK to `exercises`, RESTRICT. Permit shared or same-owner private exercise only. Required for exercise outcomes. Archived referenced rows remain historically readable. |
| `experiment_outcomes.user_symptom_id` | Nullable FK to `user_symptoms`, RESTRICT; same owner as experiment. Reuse `symptom_id` where catalog-only identity suffices. Define one authoritative target selector and consistency checks when both IDs appear. |
| `experiment_outcomes.source_config` | Bounded versioned JSON for whitelisted aggregation options, source policy and eligibility (e.g. set types). No SQL/table names or arbitrary expressions supplied by users. Existing `user_condition_id` scopes episode or condition-associated symptom outcomes. |
| `experiment_outcomes.success_criterion` | Nullable versioned JSON discriminated union (below). Primary outcome only initially. Immutable as part of started configuration. |
| `nutrition_targets.rule_id` | Nullable unique FK to `target_rules`, RESTRICT, same owner; links existing Nutrition target row to canonical rule. See single-source contract below. Do not backfill ambiguous operators. |
| `user_symptom_events.user_symptom_id` | Nullable same-owner FK to `user_symptoms`, RESTRICT. New logs for a selected custom user symptom use it. Backfill only unambiguous owner/identity matches after preflight; retain original names/catalog IDs. Needed before claiming durable custom-symptom history. |
| `nutrition_entry_items.classification_snapshot` | Nullable, bounded versioned evidence JSON captured at logging (classification states, provenance/version, explicit unknowns). Parent-owned like current nutrient snapshots; immutable evidence except explicit audited correction. Legacy null means unknown, not classification-free. |

No new observation/result/baseline tables are needed in 13A. Do not add generic measurements for body fat, sleep duration or steps under the guise of experiment infrastructure.

### New tables

| Proposed table | Purpose and key columns | FKs, ownership, RLS, deletion |
| --- | --- | --- |
| `target_rules` | One reusable measurable requirement. `user_id`, `name`, `definition_version`, `domain`, `metric_key`, `rule_kind`, `operator`, nullable `numeric_value`, `unit`, `period`, optional `exercise_id` or `planned_activity_id`, bounded `config`, `archived_at`. Numeric, classification exclusion, and local-time cutoff are distinct validated variants. | Private root/Auth CASCADE. Exercise FK RESTRICT with shared-or-owner check; planned activity FK RESTRICT with owner check. Numeric zero allowed when metric/operator permits. No generic polymorphic entity UUID. Archive referenced rules; delete consumers before rules during account cleanup. |
| `nutrition_patterns` | Private editable rule set. `user_id`, `name`, `description`, `template_key`, `template_version`, `revision`, `archived_at`. Template key/version identify a code-shipped starting recipe, not an editable global row. | Private root/Auth CASCADE, owner RLS. Referenced patterns RESTRICT on hard deletion; archive normally. Template provenance is not a FK to a nonexistent template table. |
| `nutrition_pattern_rules` | Ordered required members: `user_id`, `nutrition_pattern_id`, `rule_id`, `display_order`; unique pattern/rule. Only nutrition-domain rules in 13A. | Composite same-owner pattern CASCADE and rule RESTRICT. Owner RLS checks both. Sharing a rule between patterns is deliberate; default pattern customization clones rule definitions transactionally to avoid surprising edits elsewhere. |
| `food_classification_assertions` | Curated global evidence, not another food catalog: `food_id`, `classification_key`, `state` (`present`,`absent`,`unknown`), `evidence_source`, bounded provenance, `definition_version`, `reviewed_at`. Unique food/key. | FK to global `foods` CASCADE; no user ID. Authenticated SELECT, trusted curation writes only. Shared table retained on account deletion, excluded from personal export. Taxonomy keys are versioned typed config with DB validation. |
| `user_food_classification_assertions` | Private evidence/overrides for a global food, private food, or specific logged item: `user_id`, exactly one of `food_id`,`user_food_id`,`nutrition_entry_item_id`, classification key/state/provenance/version, timestamps. Separate partial uniqueness for each subject/key. | Subject FKs CASCADE; root Auth CASCADE. Global food readable, private food/item same owner (item via nutrition entry); owner RLS. Item assertion wins over private food/global-food override, then curated assertion. Keep provenance and conflicts visible. |
| `nutrition_log_days` | Explicit coverage, not adherence: `user_id`, `local_date`, `time_zone`, `coverage_status` (`partial`,`complete`,`unknown`), `confirmed_at`, `revision`. Unique owner/date/timezone. | Private root/Auth CASCADE, owner RLS. No row means unknown. Any log edit affecting that local day invalidates/requires reconfirming complete coverage; classification completeness is separately computed later. |
| `experiment_start_snapshots` | One immutable start record: `user_id`, unique `experiment_id`, `config_revision`, `snapshot_version`, `captured_at`, bounded `configuration`, `source_fingerprint`, optional bounded `baseline_readiness`. | Same-owner experiment CASCADE plus Auth CASCADE. Owner SELECT only; controlled DB start path inserts, no direct user UPDATE/DELETE. Account deletion can still cascade. Store selected configuration/provenance, not source observations or entire domain rows. |

These seven new tables are a maximum coherent foundation, not a mandate to build a generic policy engine. If shipping a smaller first slice, defer food evidence/coverage and explicitly disable classification-pattern evaluation; do not omit them while claiming categorical adherence is possible.

### Reusable rule contract and Nutrition single source of truth

The registry determines valid metric/domain/unit/operator/period combinations. Rules use typed numeric predicates for macros/counts/duration, a typed classification key for exclusions, or a validated local-time cutoff config. Examples include `protein_grams gte 180 g/day`, `carbohydrate_grams lte 50 g/day`, `dairy excludes`, and exercise-ID completed session count `gte 2/week`. Steps/sleep-duration keys can be documented as unavailable; they must not be selectable until a real source exists. Magnesium is an existing planned supplement activity reference, not parsed title text.

Existing `nutrition_targets` already stores metric-specific value/unit, dates, priority and source metadata. It lacks operator, rejects zero, and its `source_record_id` has no FK. `resolveTargets` currently considers only `source_type='user'`. Do not silently make experiment targets override a user's ordinary Nutrition targets.

For linked v2 targets, **the rule owns semantics**. Existing target value/type/unit columns are a compatibility projection maintained by a controlled database write path/trigger; independent edits are rejected. Existing callers must read/write through the adapter, and updates must be atomic. Unlinked v1 target rows retain their original meaning. Extend zero-value validation only for linked rule variants that permit it. Unsupported rule types (classification/cutoff) live directly in rules/patterns and must not be forced into legacy numeric rows. Keep priority/date activation metadata in Nutrition targets; selecting a rule in an experiment does not activate or supersede it in Nutrition.

For 13A, link an existing Nutrition target only after user confirmation of operator/period; do not manufacture `gte` or `lte` for ambiguous historical values. Expose reusable types under `lib/rules`, not `lib/experiments/rules`. Future Protocol requirements and goals can reference the same rules, without implementing those integrations now.

### Success criterion

Use a bounded, versioned discriminated object, not a rule sentence:

- Change: `{version:1, kind:'change', basis:'absolute'|'percent', direction:'increase'|'decrease', operator:'gte', amount:5, unit:'lb'|'%'} `.
- Target value: `{version:1, kind:'target_value', operator:'lte'|'gte'|'eq', value:180, unit:'lb'}`.

Validate units and meaningful comparisons against the outcome registry. Use nonnegative magnitudes with explicit direction. Percent change is unavailable with zero/missing baseline and inappropriate for arbitrary ordinal ranks. Distinguish outcome success from intervention adherence target. Freeze the criterion before start; implement no evaluator now.

### Start transaction and historical integrity

Keep existing status values. “Ready” should initially be derived validation state, not a second stored status that can become stale. Retain legacy pause/end-early/abandon semantics. Do not add another cancelled synonym or automatic scheduler in 13A.

Start must atomically authenticate, lock experiment/configuration and relevant linked configuration, compare revision, validate all references/cardinalities/date windows, collect a selective snapshot, insert it once, change phase/status/timestamps, and append a correct transition event. Make double-start retry-safe. Coordinate child writes with parent locking so a concurrent draft edit cannot slip between validation and snapshot. Database constraints/triggers or a narrowly permissioned mutation path must stop direct PostgREST bypass; an API wrapper alone is insufficient. If a definer function is required for protected inserts, use explicit auth checks, fixed SQL/empty search path, least privileges and no caller-controlled owner.

Snapshot question, selected identity IDs/display names, rule definitions, protocol member IDs/required flags/schedules/targets, referenced workout prescription where relevant, outcome registry/configuration versions, units, timezone, date windows, criterion and baseline coverage summary. No daily observations, full health notes, copied condition history, or entire food catalogs.

Do not freeze the source Habit or Protocol globally. Later edits remain allowed but cannot rewrite the experiment's start plan. Persist a deterministic fingerprint for comparing selected configuration; show “linked plan changed since start” when detected. A start snapshot preserves intended intervention, not a complete chronology of every intervening edit. Accurate mid-study exposure reconstruction would require domain revisions or configuration-change events captured when edits occur; leave that broader requirement explicit for 13B. Fork a new experiment to materially change a started plan in 13A. Preserve source IDs in snapshot if existing SET NULL FKs clear; never silently rebind by name.

## E. Nutrition rules, patterns, and uncertainty

### What current data actually contains

`foods` has one global category, aliases, source/verification metadata and optional brand. `food_servings`, private `user_foods`, and log-item snapshots carry nullable calories, protein, carbohydrate, fat, fiber, sugar, sodium, caffeine, and alcohol values. The common TS nutrient type exposes only a subset. Serving quantities/units and optional gram equivalence exist; logged item values are already scaled snapshots, so do not multiply them again.

There is no ingredient graph, ingredient list completeness, multi-label food trait model, private-food category, or daily “all intake logged” confirmation. Saved-meal items are references to foods/servings, not verified ingredient breakdowns. Manual foods require at least one nutrient in SQL; other nutrients may be null. Restaurant items have no special ingredient/completeness model: they can be represented as custom foods or sourced catalog foods with name/brand and partial numbers.

Global categories include dairy, eggs, grains, legumes, prepared foods, beverages, protein, oils/fats, etc. They do not establish animal/plant derivation. Butter is seeded as oils/fats and whey powder as other; “protein” is not a universal meat classification. Total sugar is not added sugar. Nullable alcohol grams do not mean alcohol-free. Category labels can be evidence candidates for curation, never automatic proof that all other classifications are absent.

`totalNutrition` and analytics/trigger source builders coalesce unknown nutrients to zero. `totalKnownNutrition` is a better starting point because it reports incomplete fields, but an empty log still needs explicit coverage status. Do not use existing totals unchanged for experimental readiness/adherence.

There is also a deletion hazard worth preserving in preflight: log-item source FKs say SET NULL, but the source CHECK requires a complete catalog pair or private-food reference. Hard-deleting a referenced food/serving can therefore violate that CHECK. Existing archive behavior and account cleanup order (logs before private foods) matter; do not assume SET NULL alone guarantees safe historical retention.

### Pattern templates and customization

Ship versioned typed templates in application configuration first, with reviewed descriptions and configurable rules. Selecting one creates a private pattern/rules once, not new foods. Global template changes affect future selections only. The user reviews limits/allowed categories; all templates are preferences, not medical prescriptions or nutritional guarantees.

| Pattern | Proposed configurable semantics | Current limitation |
| --- | --- | --- |
| Ketogenic | User-reviewed total-carbohydrate ceiling; display the exact configured rule. Optional net-carb variant only when its definition and inputs are available. | No proof of ketosis. Fiber often absent; no sugar-alcohol detail, and no universal net-carb definition. Do not silently subtract missing fiber or market a threshold as medical validation. |
| Low Carb | Configurable carbohydrate ceiling with explicit units/day. | Do not hardcode a universal low-carb definition or confuse a maximum with a minimum. |
| Vegan | Exclude explicitly animal-derived ingredients/foods. Dairy, eggs and meat are examples, not an exhaustive taxonomy. | Composite/prepared foods and unknown additives remain unknown; honey/other animal-derived items need explicit evidence. |
| Vegetarian | Configurable exclusion of meat/fish/seafood and other selected animal tissues; explicit dairy/egg allowances. | Distinguish vegetarian from pescatarian; gelatin/broths require evidence. |
| Dairy Free | Exclude dairy-derived ingredients, not just `food_categories.slug='dairy'`. | Dairy-free is not identical to lactose-free and does not certify allergy safety or cross-contact handling. |
| Carnivore | User-defined animal-source pattern with explicit allowances/exceptions for dairy, eggs, seasonings, beverages and other non-animal items. | Not every item fits an animal/plant binary; water/salt must not automatically fail. No strict definition without user review. |

Future patterns (gluten-free, low-FODMAP, no-added-sugar, Mediterranean-style, etc.) require new evidence/definitions; do not make them functional by adding labels. Amount-dependent rules and ingredients are future Nutrition work.

### Three-valued evaluation contract for 13B

13A stores the data and types; it does not calculate adherence. Specify future outputs as `adherent`, `non_adherent`, `unknown`, with coverage/evidence reasons and rule version.

- An explicit violating item can establish non-adherence even if the rest of the day is incomplete.
- Absence of violating evidence establishes adherence only when relevant intake coverage and classification evidence are sufficiently complete under the chosen policy.
- Missing meals, unclassified items, conflicting assertions, missing metric values, or no logs ordinarily produce unknown.
- For nonnegative numeric lower bounds, a known subtotal already above the target can establish the threshold; a known subtotal below an upper bound cannot establish that the unlogged remainder is below it. A known subtotal exceeding an upper bound can establish violation. Formalize those distinctions in 13B tests.
- Explicit “no alcohol” check-in answers support a separate self-reported alcohol-free-day source; they are not interchangeable with zero alcohol grams in food logs. “No food after 20:00” needs local-time grouping plus coverage, not just no late entries.
- Classification snapshots and current evidence must have an explicit policy. Prefer recorded-at-log evidence; a later correction may lead to a separately versioned recomputation, never a silent rewrite of historical results.

## F. Outcome registry and baseline sources

### Registry location and contract

Use typed application definitions under `lib/measurements` shared with future analytics/insights, plus DB-stored key/version/configuration on outcomes. Database checks/RPC validation whitelist keys and compatible configurations; users cannot choose table names, columns, joins, or SQL. Avoid DB-stored executable query definitions. Version registry behavior and retain implementations needed by started experiments; a snapshot containing a version number is not enough if that version's implementation disappears.

Each definition specifies label, target kind, source adapter, observation grain, unit/scale, allowed aggregation and expected-direction choices, eligibility/exclusion rules, completeness limits and baseline recommendations. Share source readers with existing domain services while preserving their existing public behavior; do not reuse lossy aggregate snapshots as authoritative input.

### Outcomes derivable from existing records

“Supported source” means the required observations exist in the repository model; it does not mean the current experiment UI/evaluator already supports it or that this user has data.

| User-facing outcome / proposed key | Source / target | Unit and likely aggregation | Data-quality limitations |
| --- | --- | --- | --- |
| Body weight / `body_weight` | `daily_checkins.weight`; no entity target | Current app convention lb; daily value then mean/median | Nullable; no per-row units. Confirm legacy units before enabling conversions or unit-dependent success. Profile current weight is not history. |
| Energy / `energy_score` | `daily_checkins.energy_score` | 1–10; daily mean/median | Self-report, missing answers excluded; not zero. |
| Mood / `mood_score` | `daily_checkins.mood_score` | 1–10; daily mean/median | Same; no diagnosis inference. |
| Sleep quality / `sleep_quality_score` | `daily_checkins.sleep_quality` | Ordered 1–4 mapping; median/distribution, optional labelled score mean | Poor/Average/Good/Great; known legacy aliases need explicit mapping. Not hours; percentage-change success is misleading for ordinal ranks. |
| Alcohol reported / `alcohol_reported_days` | `daily_checkins.alcohol` | Yes-days / answered days, or percentage | Explicit false is observed absence; missing answer is unknown; not grams or episode occurrences. |
| Logged calories / `nutrition_calories` | Nondeleted entries + item snapshots | kcal; daily known subtotal then eligible-day mean | Incomplete nutrient fields and missing meals; “logged” must remain in label unless complete coverage is established. |
| Logged protein / `nutrition_protein_grams` | Same | g/day; subtotal/eligible-day mean | Same. |
| Logged carbohydrate / `nutrition_carbohydrate_grams` | Same | g/day; subtotal/eligible-day mean | Total carbs, not net carbs. |
| Logged fat / `nutrition_fat_grams` | Same | g/day; subtotal/eligible-day mean | Same coverage limits. |
| Logged fiber / `nutrition_fiber_grams` | Same, nonnull fiber | g/day; subtotal/eligible-day mean | Schema supports it; seed foods often omit it. |
| Logged sugar / `nutrition_sugar_grams` | Same, nonnull sugar | g/day | Total sugar only, not added sugar; require adapter/type extension. |
| Logged sodium / `nutrition_sodium_mg` | Same, nonnull sodium | mg/day | Sparse fields, not consistently authored by current UI. |
| Logged caffeine / `nutrition_caffeine_mg` | Same, nonnull caffeine | mg/day | Missing values must not become zero. |
| Logged alcohol / `nutrition_alcohol_grams` | Same, nonnull alcohol | g/day | Separate from check-in boolean; missing classification/intake remains unknown. |
| Logged condition episodes / `condition_episode_frequency` | `condition_episodes` by `user_condition_id`, nonarchived | Onsets per fixed window; optionally reported onsets/week | Event capture completeness unknown; zero logged episodes does not prove symptom-free time. Unequal windows require normalized rates. |
| Resolved episode duration / `condition_episode_duration_hours` | Episode start/end, condition target | Hours; median/mean of eligible resolved episodes | Ongoing episodes are censored, not zero. Specify onset cohort and analysis cutoff; later resolution must not leak into earlier preview. |
| Peak recorded episode severity / `condition_episode_peak_severity` | Episode plus `episode_updates`, condition target | 1–10; max per episode then mean/median | Limit updates by analysis cutoff; mutable current severity is not necessarily onset severity. Sparse progress logs understate peak. |
| Recorded episode functional impact / `condition_episode_impact` | Episode/update impact, condition target | Ordered categories (0–4 only as a labelled mapping); distribution/median | Select latest-at-cutoff or peak explicitly; current episode row may reflect later edits. No unqualified percentage improvement. |
| Logged symptom events / `symptom_event_frequency` | Nondeleted `user_symptom_events` by catalog symptom; optional condition event links | Event rows/window or events/week | Row frequency differs from sum of `occurrence_count`; keep those separate. Custom-text identity is legacy only until durable link added. |
| Reported symptom count / `symptom_occurrence_count` | Same, known `occurrence_count` | Sum counts/window | Null is not automatically one; distinguish incomplete counts from event-row frequency. |
| Recorded symptom severity / `symptom_severity` | Same, nonnull severity | 1–10; mean/median per event | Selected condition scope requires actual `symptom_event_conditions`, not catalog association. |
| Resolved symptom duration / `symptom_duration_minutes` | Same, valid start/end | Minutes; mean/median | Unresolved excluded/censored, overlapping events not automatically additive burden. |
| Exercise sessions / `exercise_session_frequency` | Completed sessions → session exercises → completed eligible sets, exercise ID | Distinct sessions/window or per week | A planned/pending exercise is not performed; duplicate exercise rows in one session count once. |
| Exercise repetitions / `exercise_repetitions` | Completed eligible actual sets, exercise ID | Reps; session sum or weekly sum | Exclude null/invalid reps and incompatible tracking types; never substitute planned reps. |
| Exercise max logged load / `exercise_max_load` | Completed valid weight/reps sets, exercise ID | Recorded load; maximum/session | Conditional on confirmed lb convention or explicit units. Does not establish true maximal strength. |
| Exercise external-load volume / `exercise_external_load_volume` | Sum valid actual load × reps by exercise | lb·reps under verified convention; session/weekly sum | Exclude unsupported bodyweight/assistance interpretations and unknown load/reps; existing null→zero helper is insufficient. |
| Exercise estimated 1RM / `exercise_estimated_1rm` | Eligible actual weight/reps sets, exercise ID | Same confirmed load unit; max/session | Derivable but new formula/rep-range/set eligibility/version is a design decision. Not available as an existing calculated metric, nor true 1RM. Gate until chosen and units verified. |
| Best logged single / `exercise_best_single_load` | Completed eligible reps=1 sets, exercise ID | Confirmed load unit; maximum | A single rep is not necessarily maximal. Call it best logged single, not true 1RM. |
| Workout duration / `workout_session_duration_minutes` | Completed sessions, duration or valid start/end | Minutes/session; mean/median | Elapsed time can include rest; no default zero for unknown end/duration. |
| Exercise duration/distance / `exercise_duration_seconds`, `exercise_distance` | Compatible completed sets with actual fields and exercise ID | Seconds or explicit distance unit; session sum | Include only compatible tracking types/units; no synthetic pace from mismatched/missing data. |
| Recorded habit/protocol completion / `habit_completion_rate`, `protocol_completion_rate` | Existing occurrences, selected activity/protocol | Completed / eligible scheduled occurrences, % | Source exists; denominator depends on schedule generation/pauses/required members and mutable configuration. Defer experiment-specific adherence evaluation to 13B. |

No reliable existing source for body fat, waist, nightly sleep duration, steps, added sugar, verified dietary adherence, generic symptom-burden score, or confirmed true 1RM was found. Do not offer those as ready outcomes. A fixed-repetition best-load metric could be derived after defining N and exact-vs-at-least-N semantics; it is not automatically a measured rep maximum.

### Baseline time grains and completeness

| Source | Date/time grain | Readiness can establish | Cannot establish |
| --- | --- | --- | --- |
| Check-ins | `checkin_date` date, one owner/day | Nonnull metric days, window coverage, first/last valid date | Sleep duration, provenance of undocumented weight units, answers on omitted days |
| Nutrition | `consumed_at` timestamptz; multiple items/event | Logged days, item count, known/unknown nutrient or classification fields | Complete food intake from row existence alone |
| Symptoms | Start/end timestamptz; event/count grain | Recorded events, valid severity/duration counts, missing count/end fields | Event-free surveillance days or complete symptom absence |
| Episodes | Start/end plus update timestamps | Onsets, resolved/ongoing counts, available severity/impact updates | True no-episode days; unaffected baseline if intervention already existed |
| Workouts | Session date plus start/end; set completion timestamp | Distinct eligible sessions/sets, load/rep/unit gaps | True max effort, missing sessions, stable equipment/technique |
| Planning | Scheduled date/time plus completion timestamp | Existing scheduled/completed/partial/skipped rows | Past unmaterialized schedules reconstructed from today's mutable plan |
| Legacy health events | Local event date/time and creation timestamp | Recorded typed events and populated optional fields | A reliable global timezone, supplement identity, or complete intake from free text |

For historical mode, baseline ends before intervention begins. Convert event timestamps to the frozen experiment timezone; use half-open instant intervals and inclusive displayed date ranges. Treat date-only observations as calendar dates, not midnight UTC. Reuse/test timezone helpers for DST and avoid hardcoding 24 hours per local day. Specify whether sleep quality describes the previous night; do not invent a lag shift silently.

Readiness should return source status (`available`, `no_data`, `unavailable`, `truncated`), eligible observation count, distinct observed days/sessions, requested window, missing-field counts and warnings. “Baseline ready” means enough usable recorded observations under a documented metric-specific recommendation, not sufficient medical evidence. Existing 7/30/90-day thresholds are reusable precedent, not validated thresholds for every outcome. Sparse symptom/episode logs should say “logging coverage unknown.” Source failures must not appear as zero observations; bound queries and detect truncation.

Warn, do not ordinarily block, for weak/no baseline. Block malformed dates, invalid relationships or unsupported metric definitions; distinguish these from low data. A user testing an already-active Habit/Protocol needs a warning that prior data may already include the intervention.

## G. Migration and compatibility strategy

### Required read-only preflight before writing final migration SQL

1. Obtain authorized staging schema inventory and deployed migration list, RLS/policies/grants, FK actions, validated/not-valid constraints, original table column types, triggers, and indexes. Preserve production credentials and health payloads outside logs.
2. Inventory all existing experiment rows by owner/status/design/phase; child primary/secondary counts; intervention references; outcome types/identities/units/configurations; measurement source validity and same-experiment links; results and phase history. Report aggregate anomaly counts, not private hypothesis text.
3. Identify active records missing primaries, ambiguous custom/symptom names, unreferenced protocol/habit labels, stale dates, custom definitions, and condition-handoff records. Do not assume there are none because UI validation exists.
4. Validate current 12B account contract and 005 coordination expectations; run reviewed existing inventory/preflight scripts in the appropriate staging state. Identify old cross-owner rows before adding/validating new FKs.
5. Inspect historical weight/load units, malformed/nonpositive sets, duplicate parent relationships, nutrient null rates, and diet classification gaps. Determine which custom-symptom matches are unambiguous.
6. Review locks/backups, old-client compatibility, archive/hard-delete behavior, bounded snapshot/export size and account cleanup ordering. No migration application is authorized by this audit.

### Focused forward migrations (names are proposed, timestamps assigned later)

| Order | Proposed migration suffix | Contents / release gate |
| --- | --- | --- |
| 1 | `reusable_rules_and_patterns` | Rules, private patterns/membership, explicit RLS/FKs/grants; Nutrition target bridge and controlled semantics. Include corresponding account export/schema/deletion changes **in the same transaction**. |
| 2 | `nutrition_evidence_and_coverage` | Shared/private assertions, log classification snapshot and coverage table, logging/reuse integration constraints, invalidation behavior. Include account contract additions atomically. |
| 3 | `experiment_v2_configuration` | Version/revision/question/timezone/baseline fields, typed outcome target references, success criteria and compatibility constraints. Stable custom-symptom event links where unambiguous; start snapshot table plus account integration. |
| 4 | `experiment_v2_atomic_lifecycle` | Transactional draft save/start, corrected future event history, started-config protections, cardinality, bounded snapshot creation, lifecycle compatibility and concurrency. Include guarded-route budget keys. |
| 5, only if needed | `experiment_v2_verified_backfills` | Explicitly reviewed deterministic conversions and constraint validation after staging inventory. No heuristic linking by names; no required blanket v1 conversion. |

Prefer nullable additive fields initially, selective v2 checks, staged NOT VALID/VALIDATE where appropriate, and transactional function updates. Do not edit old applied migrations. Each migration introducing personal data must be export/deletion-safe immediately; a final catch-all account migration would leave an unsafe intermediate deployment state.

### Legacy behavior

- Existing records remain `model_version=1`, retain names/hypotheses, stored statuses/phase dates, measurements/results and relationships. No mass conversion or deletion.
- Render the existing detail/history with a clear “Legacy configuration” indicator when structure is incomplete. Existing result fields remain readable, but do not invent missing results or treat quality labels as validated evidence.
- Fully deterministic draft mappings may be proposed for user confirmation; conversion transaction validates all required references. Ambiguous draft records can be completed explicitly or copied to a new v2 draft without overwriting the original.
- Do not label a new snapshot of an already-running v1 record as its historical start configuration. Keep it legacy; any later migration capture must say when/what was actually captured.
- Preserve condition-pattern handoffs and template entry points. Repair their v2 authoring paths, not historical meanings. Keep legacy transition behavior routed separately where new historical-baseline activation differs.
- Soft archive linked user objects; ordinary hard deletion respects RESTRICT/dependency warnings. Existing SET NULL paths retain snapshot identity/configuration. Account deletion removes the experiment first, so strict target references must not block full-account erasure.

## H. Application implementation and account-control plan

### Proposed file/work slices

| Slice | Existing files to extend / proposed files | Acceptance |
| --- | --- | --- |
| Domain contracts | `lib/experiments/experiments.ts`; proposed `types.ts`, `validation.ts`, `compatibility.ts`, `questions.ts` within that directory | Discriminated v1/v2 inputs, strict registry/target identity, no fake Energy placeholder, safe generated editable question. |
| Reusable registry/readers | Proposed `lib/measurements/registry.ts`, `types.ts`, `sources/{checkins,nutrition,episodes,symptoms,workouts,routines}.ts` | Owner-scoped bounded queries, explicit units/timegrain/null/coverage semantics; no copied raw observations. |
| Rules/Nutrition | Proposed `lib/rules/{types,validation,service}.ts`, `lib/nutrition/patterns.ts`, `pattern-templates.ts`, `classifications.ts`; extend nutrition service/reuse/UI | Existing targets remain authoritative via bridge; private patterns configurable; unknown evidence preserved; no adherence engine. |
| Baseline readiness | Proposed `lib/experiments/baseline-readiness.ts` | Read-only target-aware counts/coverage/warnings, no materialized occurrences or result scoring. |
| Authenticated APIs | Proposed `app/api/experiments/route.ts`, `[id]/route.ts`, `[id]/baseline/route.ts`, `[id]/start/route.ts`; guarded pattern/rule mutation endpoints if used | Verify owner from Auth, same-origin writes, bounded bodies/ranges and safe errors; database mutation invariants also hold for direct API-role SQL. |
| Wizard | Extend `ExperimentsHome`; proposed `components/experiments/ExperimentWizard.tsx` and step components; `/experiments/new`, `/experiments/[id]/edit` if routing warrants | Six steps, save/resume incomplete draft, real entity selectors, unsupported choices disabled with reason, accessible mobile controls. |
| Review/start | Extend `ExperimentDetail`; proposed `ExperimentReview.tsx` | Primary/secondary/outcome target distinct, question/date/timezone/criterion review, weak-baseline warning, atomic idempotent start and frozen plan display. |
| Other entry points | `components/episodes/TestPatternButton.tsx`, experiment handoff service, template defaults, timeline/analytics consumers, workout dependency RPCs | No broken links, unmapped new statuses, or silent semantics changes. |
| Tests/docs | Extend experiment/nutrition/episode/workout/API/account/database tests; proposed registry/rule/readiness/concurrency tests; update account docs and preflight SQL | Real SQL/RLS negative cases plus source fixtures and user-facing flow validation; no unrelated lint cleanup. |

Use local Next.js 16.3.3 guides under `node_modules/next/dist/docs/` before implementing route/page code, per AGENTS.md. This audit writes no Next.js code.

### Wizard behavior

1. Goal/domain selects a supported measurement family, not a disease label as a metric.
2. Intervention uses an owned existing habit/protocol, structured Nutrition target, private pattern, or explicitly manual supported fallback. Selecting does not silently instantiate/start a protocol or alter its schedule.
3. Target entity and primary metric are selected together, with optional bounded secondary outcomes; incompatible choices are rejected server-side too.
4. Read-only baseline preview distinguishes low data, unavailable source, unknown logging coverage and genuinely observed zero values.
5. Plan specifies timezone, intervention start/end or duration, baseline mode/window, optional criterion. Future dates require an explicit scheduled/start policy; do not start immediately with a future intervention window accidentally.
6. Review shows the whole structured plan and editable generated question; Save Draft and Start remain separate actions. Start preserves the exact reviewed revision.

### Sprint 12B integration is mandatory

- **Export allowlist/manifest: YES.** Extend `axvital_export_account()` for every new private table using owner or fixed parent predicates. Shared assertions/code templates stay excluded, while user pattern definitions and recorded classification/start snapshots are included. Existing experiment columns are picked up by row serialization, but nested JSON must be reviewed for private cross-owner content, size and portable provenance. Bump/document export version if format semantics change.
- **Deletion schema assertions/manifest: YES.** Extend `axvital_account_schema_issues` inventory and documentation for required tables, owner paths, grants/RLS, and FK actions. Preserve `axvital_assert_account_schema` and 005's stronger `axvital_assert_deletion_contract` expectations.
- **Deletion cleanup: YES.** Extend explicit cleanup order and `paths` map if any new child omits `user_id`. Proposed explicit owner columns simplify cross-owner scanning but do not eliminate fixed inventory updates. Delete experiments/snapshots first; pattern memberships/patterns and linked Nutrition targets before rules; rules before referenced activities/exercises; private classifications before their subjects; retain existing logs-before-private-foods order. Keep the Auth BEFORE DELETE cleanup transaction and billing preparation unchanged.
- **Ownership checks: YES.** New FKs need explicit owner/parent-consistency checks, including user symptom links, Nutrition target/rule, pattern membership, item assertions, and global/private exercise selection. The 12A one-time policy-generation loop is not dynamic enforcement for future schema.
- **API budgets: YES.** Add explicit route keys to `axvital_consume_api_budget` and extend `lib/api/validation.ts` for exact bodies/query fields. Current unknown keys fail closed and POST bodies otherwise default to no keys. Propose conservative initial limits (e.g. draft writes 20/min, readiness 12/min, start 6/min/account), tune under staging load; keep existing account export/delete limits untouched. For PATCH/DELETE, extend same-origin/body validation beyond its current POST-only handling, or use explicit POST action endpoints.
- Protect bounded reads with row/byte/time limits and pagination/truncation detection. Snapshot caps must stay compatible with existing 10,000 rows/source, 3 MiB SQL export accumulation, 4 MiB final JSON, 15-second RPC abort and 30-second route budget. Do not claim HTTP abort guarantees SQL cancellation.
- Keep deletion disabled unless its independently documented release gates are met. No new service-role access in normal experiment or Nutrition paths. No new external storage, billing, telemetry or health payload logging required.

### Test cases required before shipping

Two-owner and anonymous CRUD; shared/private/archived exercise selection; forged parent IDs and nutrition serving-food mismatch; wrong-condition/symptom links; duplicated or missing primaries; draft deletion and safe reordering; invalid registry keys/operator/unit/criterion; numeric zero targets; lost-update revisions; simultaneous start/edit/link edits; start retries; direct table writes after start; nested snapshot immutability; preserved legacy rows and condition handoffs; template defaults; DST/midnight/partial days; no data vs source failure/truncation; open episodes; missing nutrient fields; known negative food evidence vs unknown; no intake logs; source archives/deletes; full export; prepared account deletion with all new tables; cross-owner corruption rollback; shared catalog/other-account survival; unchanged billing coordination. Nutrition evaluation expectations are contract fixtures for later work, not an instruction to build the 13B engine.

## I. Risks and unresolved decisions

| Decision / risk | Recommendation / remaining approval |
| --- | --- |
| Actual deployed data and DDL unknown | Obtain read-only inventory before final SQL/backfills. Local validation is not migration approval. |
| Protocol template vs instance | Pick `user_protocols` initially; explain how to instantiate separately. Supporting template-only planned intervention requires an explicit non-surprising creation flow. |
| Weight/load unit ambiguity | Current UI/analytics use lb convention but SQL does not store units. Confirm historical convention; otherwise disable unit-dependent outcomes until additive domain unit provenance is approved. Do not invent kg conversion for unknown rows. |
| Estimated 1RM definition | Choose/version formula, eligible rep range, set types and tracking/equipment restrictions; label estimate, not measured maximum. Keep disabled until this and units are resolved. |
| “Exactly one” versus incomplete draft | Require exactly one at ready/start and thereafter; allow incomplete draft before Step 3. Product may instead require outcome selection before first persistence. |
| Ready and scheduled states | Derived Ready avoids stale status. Use manual start initially; decide future scheduled activation before supporting it in v2. Preserve old stored values. |
| Start snapshot versus full change history | Snapshot records intended plan; it cannot reconstruct transient source edits. No silent re-snapshot. Full effective-dated intervention history is future domain work. |
| Custom symptom identity | Add domain-level event FK, backfill only proven matches; no string-based identity claim for ambiguous history. |
| Rules vs legacy Nutrition targets | Canonical rule + controlled projection, not two editable truth sources. Approval needed for default operators and target conflict/priority UX; never automatically override ordinary targets. |
| Dietary definitions | Configurable reviewed templates, explicit unknowns and exceptions. No medical diet advice or allergy safety certification. |
| Food evidence scope | Minimal assertion/snapshot/coverage model now; ingredients/recipes/providers later. Unknown coverage remains unknown even if all logged foods are classified. |
| Episode/symptom frequency denominator | Say recorded onsets/events per time window. No inferred symptom-free days; separate reported counts from row counts and avoid future-update leakage. |
| Default baseline recommendation | Set metric-specific product heuristics with clear warning wording, not statistical confidence claims. Establish sparse-event tracking coverage policy before results. |
| Custom outcomes | Preserve v1 manual storage. Defer new reusable custom metrics/authoring until domain source is specified; otherwise risk a parallel measurements silo. |
| Snapshot size/export pressure | Bound configuration/memberships/secondary count and omit raw observations; test large protocols/patterns with export limits. |
| RLS and immutable rows during erasure | Owner visibility must survive archives; started-config protections must allow whole-experiment/account deletion while preventing child tampering. Test both direct API and cleanup role paths. |

## J. Recommended Sprint 13A boundary

Implement the additive v2 model, explicit entity selection, typed enabled outcome registry, reusable rule/pattern persistence, minimum Nutrition classification/coverage foundation, six-step draft creation, historical baseline readiness, optional structured success criterion, generated editable question, atomic review/start snapshot, legacy compatibility and account/security integration.

Initial enabled outcomes should emphasize energy, mood, ordinal sleep quality, verified-unit weight, condition episode frequency/severity/resolved duration, catalog-symptom frequency/severity/resolved duration, and logged Nutrition macros with honest completeness labels. Exercise session/repetition outcomes can ship from eligible records; load/volume/e1RM require verified units, and e1RM additionally requires its formula contract. Do not claim unavailable sources are ready merely because a registry entry exists.

Do not implement statistical conclusions, causal claims, result scoring, daily adherence calculation, Nutrition pattern evaluator, confounders, Experiment Quality, Today experiment cards, progress/results charts, AI recommendations or automated medical recommendations. Those remain Sprint 13B or later. Reading baseline counts and preserving planned definitions is 13A; interpreting experimental effects is not.

### Exact recommended next implementation prompt

> Implement Sprint 13A.2 — Experiments 2.0 foundations using `docs/sprint-13a1-experiments-architecture-audit.md` as the reviewed architecture. Begin by reading AGENTS.md and the relevant local Next.js guides. Keep all existing experiment and domain data; do not build a parallel experiment system.
>
> Scope this first implementation slice to focused additive migration files, domain types/validation, the versioned measurement registry, reusable rule/private Nutrition pattern persistence with an explicit legacy Nutrition-target adapter, minimal food-evidence/coverage schema, v2 experiment configuration and selective start snapshots, and transactional draft/start contracts. Update account export/schema assertions/deletion ordering and API-budget definitions in the same migration transactions as new private data. Add explicit same-owner/shared-catalog checks and direct-write-resistant lifecycle invariants. Preserve 005 billing/deletion coordination and existing enablement settings.
>
> Treat legacy rows as v1 and new explicit configurations as v2. Preserve stored hypotheses/results/history; do not infer relationships, operators, units or historical snapshots from names. Ready is derived, incomplete drafts are allowed, and started v2 experiments have exactly one intervention and one primary outcome. Resolve snapshot concurrency, immutable configuration and full-account deletion together. Add deterministic generated-question and structured success-criterion contracts, but no evaluator.
>
> First report any missing deployed-schema/preflight evidence and decisions needed for final backfills. Do not claim a migration is production-ready without that evidence. Keep load-dependent workout metrics and e1RM disabled until historical units and the estimation contract are verified; unsupported body-composition/sleep-duration/steps/custom sources stay disabled. Do not automatically instantiate or activate a linked protocol, override ordinary Nutrition targets, or convert v1 data.
>
> Add tests for registry/rule validation, legacy compatibility, source uncertainty, cross-owner/parent identity, atomic draft/start and concurrent edits, direct-write snapshot protection, and complete export/deletion with all new tables. Run tests, typecheck, ESLint and build. Do not apply Supabase migrations, deploy, enable account deletion, build the wizard yet, or implement Sprint 13B statistics, results, adherence, quality, confounders, cards/charts or recommendations. End with migration/file summary, validation results, remaining decisions and the proposed Sprint 13A.3 source-adapter/readiness/API slice, followed by Sprint 13A.4 wizard/review integration.

## Validation performed for this audit

| Command | Result |
| --- | --- |
| `npm test` | PASS: 274 tests, 0 failures, 0 skipped. Includes local PGlite security/account and relevant domain tests. Existing Node MODULE_TYPELESS_PACKAGE_JSON warnings; no unrelated cleanup. |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, no output diagnostics |
| `npm run build` | PASS: Next.js 16.3.3 production build, 53 static-page generation tasks, experiment routes included |

No live-data audit, browser interaction test, Supabase migration application, deployment, medical validation or production deletion enablement was performed.
