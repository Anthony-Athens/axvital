# Sprint 13A.2 — Experiments 2.0 foundations

Implemented 2026-08-28. **Local implementation, not production migration approval.** No Supabase migration was applied, no deployment performed, no account-deletion setting changed, and no creation wizard or Sprint 13B evaluator was built.

## Final workout-performance amendment (2026-08-28)

This amendment supersedes earlier statements that Estimated 1RM is disabled. It relies on the user's supplied production audit (179 sets, 34 positive-load/1–10-rep candidate rows with durable exercise joins); no production query was executed or production rows fabricated. The aggregate audit alone does not assert that all 34 have completed status; eligibility is still checked per set.

Exact files changed for this amendment:

- [Registry](C:/Users/apath/axvital/lib/measurements/registry.ts): enable `exercise_estimated_1rm`, registry version **1**, label **Estimated 1RM**, formula metadata `epley` version **1**, unit `lb`, observation grain `set`, only `maximum` aggregation. `WORKOUT_PERFORMANCE_PRIMARY_OUTCOME` identifies it as the future primary strength-performance selection; session frequency remains an internal activity metric, not that default. No wizard was built.
- [Pure numeric adapter and reader contract](C:/Users/apath/axvital/lib/measurements/estimated-1rm.ts): eligibility, Epley v1, maximum of supplied window-scoped sets, and `EpleyV1SourcePoint` for a later bounded reader. No database fetching or baseline service.
- [Targeted tests](C:/Users/apath/axvital/lib/measurements/estimated-1rm.test.ts): 18 synthetic boundary/contract tests.
- [Foundation SQL tests](C:/Users/apath/axvital/lib/experiments/foundations.test.ts): exercise-target draft/start accepts absolute/percentage/target criteria and freezes formula metadata; prior regressions retained.
- [Unapplied migration 002](C:/Users/apath/axvital/supabase/migrations/202608280002_experiment_atomic_authoring.sql): fixed SQL registry whitelist synchronized with TypeScript. Formula expression is descriptive metadata, never executed/evaluated from JSON.
- This report: source evidence, semantics, remaining gates and corrected future-slice instructions.

**Completion:** `workout_session_sets.status = 'completed'` is authoritative. `lib/workouts/sessions.ts` sets that status and normally stamps `completed_at`; `lib/workouts/analytics.ts` counts completed sets by status. Neither session-exercise `is_completed`, parent session completion nor a timestamp alone substitutes for the set status. Completed sets in an unfinished session are not automatically excluded. A missing completion timestamp is retained as unknown timing context; the later reader must apply explicit window/cutoff semantics without inventing a timestamp.

**Units:** the existing application workout convention is pounds: `lib/workouts/execution.ts:38` renders actual loads as `lb`, and `components/workouts/WorkoutExecution.tsx:48` renders prescribed loads as `lb`. The parser persists numeric loads unchanged through `sessions.ts`. The schema has `actual_weight`/`planned_weight` but no load-unit column or unit-switch/conversion contract. Epley reuses this application convention; no numeric-value inference, conversion, new unit column or historical backfill was added. This does not prove provenance for out-of-band/imported historical writes. Mixed-unit data must not be pooled; any such evidence needs a separate provenance correction. Body-weight unit assumptions do not follow from this workout-only convention.

**Eligibility:** both set and session-exercise owners match the caller's authenticated scope; their session IDs and the set's session-exercise FK agree; the durable exercise ID matches the target; tracking is `weight_reps`; set type is exactly `working`; status is `completed`; actual load is finite and positive; actual reps are an integer from 1 through 10 inclusive. Missing, pending/skipped, warm-up, incompatible or foreign-target rows are excluded, not zeroed. The future authenticated reader must additionally validate session ownership, query bounds, date window and analysis cutoff. Pure helpers are not authorization boundaries.

**Formula:** `actual_weight * (1 + actual_reps / 30.0)`, unrounded, preserving logged load. A one-rep set uses this formula too, not a special-case identity. Maximum eligible value is the window metric; no eligible values yields `null` (unknown). A dumbbell load of 125 is used as 125, never doubled. Equipment/per-implement conventions are not normalized, so comparisons require the same logged convention. The formula is an estimate, not a tested true 1RM. Future formula changes require a new version/key and preserved old implementation, never reinterpretation of this version.

The point contract retains set/session/exercise IDs, workout `sessionDate`, nullable `completedAt`, value/unit and formula version. It enables future observation counts, first/last dates, latest/best and trend inputs without prematurely collapsing sets to daily maxima. No readiness calculation, trend, result or success evaluation was implemented. Existing criteria validation supports +20 lb absolute, +5%, and >=405 lb; kg criteria are rejected rather than converted. External-load volume, best-single load, body weight and load-normalized comparisons remain disabled/unavailable pending their separate semantics review.

Validation: **309 tests pass**, zero failures/skips, including disposable local migration application, TS/SQL registry parity, preflight drift checks, v1 compatibility, started configuration/child protection, controlled lifecycle transitions, export and prepared-account deletion. Typecheck, lint, production build and diff checks pass. New tests cover reps 1/10/11, null/zero/negative/nonfinite load, null/fractional reps, working/completed status, tracking/identity/ownership, no planned substitution, max/empty semantics, deterministic Epley, no doubling and criteria.

Migration 001 and the strengthened preflight are **unchanged by this amendment**. Migration 002 changed only registry metadata; no table, RLS, lock, budget, lifecycle or account-control redesign. Started runtime transitions remain possible through the trusted paths tested in the preceding correction. Remaining gate before migration 001: reviewed live migration parity through `202608270005` plus the full read-only preflight, with all existing schema/constraint/key/trigger/index/account issues resolved and separate staging authorization. No new e1RM schema blocker was found locally; historical out-of-band unit provenance and real multi-session behavior remain explicit operational limitations. Do not proceed to 13A.3 or execute migrations as part of this amendment.

## Pre-migration corrections (2026-08-28)

Both **unapplied** migration SQL files and the preflight were corrected in place; no new migration or production lifecycle API was introduced. Tests were extended in `lib/experiments/foundations.test.ts`. This section supersedes any earlier blanket description of the parent-row freeze.

### Exact started-parent field classification

| Classification | Columns | Handling for started v2 |
| --- | --- | --- |
| Identity/configuration/start provenance | `id`, `user_id`, `model_version`, `config_revision`, `name`, `hypothesis`, `description`, `question`, `question_is_custom`, `analysis_timezone`, `baseline_mode`, `study_design`, `baseline_start_date`, `baseline_end_date`, `intervention_start_date`, `intervention_end_date`, `planned_start_date`, `planned_end_date`, `actual_started_at`, `created_at` | Immutable, including through migration-owned functions. Actual start records the original start, not resume time. |
| Lifecycle/runtime allowlist | `status`, `current_phase`, `actual_completed_at`, `paused_at`, `ended_early_at`, `archived_at`, `updated_at` | Mutable only through trusted migration-owned transactional functions; direct API updates still fail. |
| Legacy definition/result compatibility | `adherence_target`, `minimum_baseline_observations`, `minimum_intervention_observations`, `result_summary`, `notes` | Preserved for v1; frozen after v2 start. Legacy thresholds materially define a test. Notes/result-summary runtime semantics are not approved in 13A.2; a future forward migration must explicitly classify them before allowing v2 updates. |

The guard compares complete old/new JSONB rows after removing only the seven runtime columns. New columns therefore default to protected. Model version remains immutable before and after start. No caller-controlled flag, GUC, owner parameter or role argument bypass was added. A trusted function must independently authenticate/lock the owner, validate a transition and append history atomically; the guard is not itself a lifecycle state machine. Existing v1 `transition_experiment` remains untouched and tested. The old invoker RPC remains unavailable for v2; approved future definer lifecycle functions are now possible without weakening the configuration freeze.

Interventions, outcomes, condition links and snapshots remain frozen. V2 phase events are append-only through trusted paths, including before start; update/delete is blocked while the parent exists. Whole-experiment/account cascade deletion remains allowed. Measurement/result writes remain out of scope and protected; a future 13B contract must explicitly authorize its own storage paths.

### Preflight additions

- Mandatory separate `npx supabase migration list` verification: compare **every** local/remote version through `202608270005`. SQL emits `REQUIRED_SEPARATE_VERIFICATION` without querying privileged migration-history tables, so absent/inaccessible history does not abort the script.
- Exact-name checks and actual definitions for the three replaced CHECK constraints; `MISSING_OR_NAME_MISMATCH` is a blocker. All candidate checks on those tables are listed to expose alternate deployed names.
- Valid immediate non-partial unique `(id,user_id)` key checks for experiments, user symptoms, planned activities, user protocols, protocol templates/members, and the two new rule/pattern parents. New absent parents report `NOT_CREATED_YET`; pre-existing missing keys report a blocker. Post-migration local tests require the new parents' keys.
- Trigger inventory includes enabled/internal state, definition, function identity/owner/security mode on experiment tables, Nutrition targets/entries/items, symptom events, profiles, subscriptions and Auth users.
- Unique/partial index definitions, validity and predicates cover primary intervention/outcome indexes, experiment ownership, measurement identity and new parent tables. Review definitions, not just names.

### Fingerprint decision

Keep `source_fingerprint` and explicitly document it in the database as an **intervention-source-only** marker. It is `md5(source::text)` over the JSONB returned by `axvital_intervention_configuration`, not the whole experiment configuration. JSONB canonicalizes object keys. Protocol members sort by sort-order then membership ID; workout exercises by group/exercise order then exercise-row ID; prescription sets by unique set number; pattern rules by unique display order. Existing nested arrays retain their stored order, so reordering them can change the marker even if logically equivalent.

Changes to selected source IDs/names, captured schedules/status/targets/definitions, members/order, pattern/rule revisions, or workout template `updated_at` and prescription fields change the marker. Revision/timestamp-only edits can intentionally create conservative change signals. Uncaptured source fields, source observations, experiment question/outcomes/criteria/windows/timezone and lifecycle do not enter it. It is neither a security primitive nor a full-history/equivalence guarantee; no cross-database-version serialization guarantee is claimed. Snapshot format/version must govern any future serialization evolution.

### Regression evidence and validation

The new lifecycle test uses a **test-only**, owner-checking, row-locking SECURITY DEFINER pause function created by the migration role. Authenticated A can pause and append correct history; B cannot; direct API status updates fail. Privileged runtime phase updates are also permitted. Started question/dates/configuration/legacy result fields and intervention/outcome update/delete attempts fail even under the migration role; snapshot mutation and event deletion fail. Fingerprint repeatability, lifecycle exclusion and rule-change sensitivity are tested. Existing whole-experiment deletion and prepared Auth-account deletion tests still verify snapshot removal and shared/other-owner survival. Preflight tests exercise both schema versions and deliberately renamed constraint drift. V1 pause still works.

Validation: **291 tests pass**, including disposable PGlite application of all migrations; typecheck, lint and production build pass. PGlite remains single-connection and synthetic: this does not certify live schema parity or real concurrent lock behavior.

### Exact next live preflight steps — no migration application

1. In PowerShell run `Set-Location C:\Users\apath\axvital`. Confirm the CLI is linked to the intended Supabase project; do not relink or infer a project from this report.
2. Run `npx supabase migration list`. Review local/remote parity for every migration through `202608270005`. The two `202608280001` / `202608280002` rows should be local-only. Stop on drift or unexpected deployment. This task did not run that remote command.
3. In that project's authorized SQL Editor (or approved schema-auditor connection), execute the **entire** `supabase/tests/sprint13a2_preflight.sql`, including `begin transaction read only` and `rollback`. Do not execute either migration. If a client leaves the transaction aborted after an error, issue `ROLLBACK` before further read-only inspection.
4. Retain/review all metadata and aggregate result sets: exact constraints/definitions, required old composite keys, primary/identity index definitions, enabled triggers/function owners, RLS/grants, account-contract issues and anomaly counts. `NOT_CREATED_YET` for the two new parents is expected before migration; missing existing requirements are not. If permissions hide required metadata, obtain an authorized audit rather than treating empty results as success.
5. Return the preflight findings and CLI parity results for review. No migration is production-ready until reviewed; any later staging application needs separate authorization in 001 → 002 order. Do not proceed to 13A.3 yet.

## Delivered files

| Files | Purpose |
| --- | --- |
| [Read-only preflight](C:/Users/apath/axvital/supabase/tests/sprint13a2_preflight.sql) | Schema/column/FK/RLS/policy/grant/function inventory and aggregate data anomalies; no hypotheses, notes, food names or observation payloads. |
| [202608280001_experiment_domain_foundations.sql](C:/Users/apath/axvital/supabase/migrations/202608280001_experiment_domain_foundations.sql) | All additive tables/columns, evidence/coverage triggers, canonical target projection, owner policies and v2 direct-write protection. Account contract/export/deletion updates commit in this same transaction. |
| [202608280002_experiment_atomic_authoring.sql](C:/Users/apath/axvital/supabase/migrations/202608280002_experiment_atomic_authoring.sql) | Fixed outcome whitelist, target/criterion validation, selective source configuration, atomic draft/save/start and private-pattern creation RPCs, conservative mutation budgets. |
| [lib/rules/types.ts](C:/Users/apath/axvital/lib/rules/types.ts), [validation.ts](C:/Users/apath/axvital/lib/rules/validation.ts), [service.ts](C:/Users/apath/axvital/lib/rules/service.ts) | Reusable, bounded rule definitions and validated owner-scoped persistence with optimistic rule revision updates. |
| [Measurement registry](C:/Users/apath/axvital/lib/measurements/registry.ts), [measurement validation](C:/Users/apath/axvital/lib/measurements/validation.ts) | Versioned source metadata, enabled/disabled outcomes, target/aggregation/unit/criterion contracts. No observation readers or result computations. |
| [V2 experiment domain](C:/Users/apath/axvital/lib/experiments/v2.ts) | Discriminated intervention inputs, incomplete draft validation, generated question helper, authenticated transactional RPC wrappers. Existing v1 authoring remains unchanged. |
| [Pattern templates](C:/Users/apath/axvital/lib/nutrition/pattern-templates.ts), [pattern service](C:/Users/apath/axvital/lib/nutrition/patterns.ts) | Six reviewed/configurable template identities; caller supplies explicit carbohydrate limit or exclusions; transaction creates private pattern plus private rules. |
| [Classification contracts](C:/Users/apath/axvital/lib/nutrition/classifications.ts), [target adapter](C:/Users/apath/axvital/lib/nutrition/target-rule-adapter.ts) | Unknown-preserving evidence/coverage types and numeric compatibility projection. Not dietary evaluation. |
| [Symptom types](C:/Users/apath/axvital/lib/symptoms/types.ts), [symptom service](C:/Users/apath/axvital/lib/symptoms/symptoms.ts) | Optional explicit `userSymptomId` when logging; omitted for existing callers. No inferred or historical backfill. |
| [Foundation tests](C:/Users/apath/axvital/lib/experiments/foundations.test.ts), [shared SQL fixture](C:/Users/apath/axvital/lib/security/test-database.ts), [existing security tests](C:/Users/apath/axvital/lib/security/database.test.ts) | 17 additional test cases with SQL/RLS assertions. Existing synthetic baseline fixture extracted for reuse; one old assertion recognizes the new earlier food-owner rejection. |
| This report and [account data controls](C:/Users/apath/axvital/docs/account-data-controls.md) | Contract documentation, remaining gates, execution order and next-slice prompt. |

The reviewed 13A.1 audit was already present and untracked at the beginning of this task; it was preserved, not rewritten. No existing applied migration was edited. No app route, component, dependency, environment configuration, billing function or feature flag was changed.

## Schema/model summary

### Existing entities remain authoritative

Existing experiment rows receive only additive defaults: `model_version=1`, `config_revision=1`, nullable v2 fields. V2 creation explicitly inserts version 2. No legacy names, hypotheses, dates, measurements, results or intervention rows are rewritten. Model version cannot be changed through ordinary updates.

New experiment fields are question/custom-question flag, timezone, baseline mode and configuration revision. Existing date/status/phase fields are reused. Interventions reuse the existing activity/protocol-instance/workout-template links, adding rule/pattern references. Outcomes add registry key/version, empty whitelisted source configuration, exercise/user-symptom references and an optional structured success criterion. Condition outcomes keep `user_conditions` as the target; symptom outcomes optionally scope by real event-condition associations.

The initial source configuration vocabulary is deliberately `{}`: registry v1 itself defines eligibility and aggregation choices. Do not add arbitrary query/table/column names to it later. Extend through an explicitly versioned validated contract.

### Seven new tables

| Table | Ownership and role |
| --- | --- |
| `target_rules` | Private owner root, Auth CASCADE. Name, bounded versioned definition, optional exercise FK, revision/archive metadata. |
| `nutrition_patterns` | Private owner root, Auth CASCADE. Name, optional template provenance, editable instance revision/archive. |
| `nutrition_pattern_rules` | Private owner child with composite same-owner pattern CASCADE and rule RESTRICT; unique ordered membership, maximum 20 slots. Only Nutrition rules. |
| `food_classification_assertions` | Shared curated evidence linked to existing global foods. Authenticated read only; no browser curation writes. Not exported/deleted with an account. |
| `user_food_classification_assertions` | Private evidence for exactly one global food, owned food, or owned logged item. Subject CASCADE, root Auth CASCADE, explicit parent-owner policies. |
| `nutrition_log_days` | Private date/timezone logging-coverage attestation: unknown/partial/complete. No row means unknown. Not an adherence result. |
| `experiment_start_snapshots` | Private, one per experiment, composite owner/experiment CASCADE. Selective JSON plan, version/revision/timestamp and source fingerprint. No normal insert/update/delete grants. |

Rules use one bounded discriminated JSON definition rather than repeating its fields in independently editable scalar columns. This follows the audit's structured/validated representation principle: SQL and TypeScript both whitelist exact keys and valid metric/operator/unit/period combinations. Exercise IDs also have a real FK and must agree with the definition. No executable expressions are stored.

Initial rule types: numeric Nutrition thresholds (including valid zero), zero alcohol occurrences, explicit food-classification exclusions, local-time cutoff with valid timezone, and exercise-ID session-count requirements per week. Alcohol occurrence rules are a future evaluation contract, not a claim that sparse food logs prove abstinence. No ingredient graph or allergy certification.

### Canonical Nutrition target compatibility

Unlinked old `nutrition_targets` retain existing semantics. No operator is inferred or backfilled. For an explicitly linked target, the rule is canonical; target type/value/unit must equal its controlled projection. Semantic edits go through the rule. A trigger refreshes linked projections atomically; independent conflicting target edits or detaching/replacing its canonical link are rejected. Numeric zero is accepted only on a linked target. Exclusion/cutoff/alcohol-occurrence rules have no numeric legacy projection and are not forced into one.

Selecting a rule in an experiment creates no ordinary Nutrition target and changes no priority/activation/schedule. The existing target-resolution behavior remains unchanged. Later APIs/UI must expose operator meaning from the rule rather than interpreting a legacy numeric projection as a new independent goal.

### Food evidence and coverage

Evidence retains classification key, present/absent/unknown state, bounded provenance and version. No evidence is seeded by guessing food categories. The logger captures a bounded evidence snapshot, preferring private food evidence over curated evidence, and explicitly marks missing keys unknown. Caller-supplied snapshot content is replaced by the database capture. Existing rows remain null/unknown. Later item-specific assertions are separately preserved; they do not silently rewrite the original capture.

Coverage has validated timezone/date and server-controlled confirmation time. Entry and item INSERT/UPDATE/DELETE triggers invalidate relevant coverage; moving an entry invalidates both old and new days, in every stored timezone. Soft deletion/restoration and metadata/nutrient edits also invalidate it conservatively. Per-owner transaction locks serialize confirmation and log changes. Normal API roles cannot TRUNCATE logs to bypass row triggers. No completeness conclusion is derived from missing records, nor from all logged items being classified.

Log source/evidence fields cannot be changed in place; metadata/nutrient corrections remain possible and invalidate coverage. Existing hard deletion of referenced food sources was already constrained by the log-source CHECK; archival remains the normal path. Item-level evidence corrections are separate records. Account cleanup deletes logs before owned foods.

## Transactional authoring and security

Public authenticated RPC contracts:

- `save_experiment_v2(target_id, expected_revision, input)`: full replacement of the supplied v2 draft configuration, not a patch. New ID uses null + revision 0; saves require the exact current revision and increment it. Name is required; intervention/outcomes/date configuration can initially be absent. Supplied interventions/outcomes must be valid, with no placeholders. Child writes and phase event are atomic.
- `start_experiment_v2(target_id, expected_revision)`: authenticates/locks owner and experiment, verifies revision and exactly one intervention/primary outcome, revalidates targets/registry/criteria and dates, captures a bounded selective snapshot and appends correct from/to event values. Repeating the same start/revision returns the existing started experiment without a second snapshot/event.
- `create_nutrition_pattern(input)`: transactionally creates a private pattern and new private rule instances from explicit reviewed definitions. It does not create a Protocol. Template changes cannot update existing instances.

`SECURITY DEFINER` is used narrowly for these validated database contracts and private trigger helpers, not by introducing service keys or service-role clients. Mutation functions derive owner from `auth.uid()`, use fixed SQL and empty search paths, and reject arbitrary owners/keys/configuration. Private helpers with owner arguments are not callable by API roles. Public metadata/validation functions are authenticated-only. All new private tables have RLS and explicit grants; new relationship policies supplement the one-time Sprint 12A hardening.

V2 direct writes to experiment configuration, history, snapshots and the out-of-scope measurement/result write paths are blocked for API roles. The old v1 operations still work. Protection does not depend on browser flags or forgeable session settings. Started configuration and snapshot updates fail even through a privileged accidental update path; parent experiment/account deletion still cascades successfully. The guard uses the migration-owned function identity rather than assuming original domain table ownership.

The snapshot captures selected source IDs/names/configuration, rule definitions or pattern members, protocol schedules/targets, workout **template prescriptions** (not logged execution sets), registry definitions/version, target labels, timezone/windows/question and criterion. It excludes histories, source observations, health notes and unrelated rows. Source fingerprint is an MD5 change-detection marker, not a security signature. Source entities remain editable; their edits do not resnapshot started experiments.

Limits: one intervention, one primary plus up to three secondary outcomes at start; 20 pattern rules; 50 protocol members / workout template exercises; 100 workout prescription sets; 16 KiB draft body; 64 KiB start snapshot. Start uses historical/prospective/none mode, at most 366 inclusive days per configured phase, and requires the first active phase to begin **today in the selected timezone**. Scheduled activation is not implemented. Prospective starts in baseline; historical/none start in intervention. No readiness or result computation occurs.

Weak/no historical data does not block start; malformed/incomplete configuration does. Existing active/paused/etc. status vocabulary is preserved. The old transition RPC cannot mutate v2 records: future v2 pause/complete/end semantics need their own reviewed contract rather than bypassing the freeze. No such UX was introduced here.

### Enabled and disabled outcomes

Enabled metadata covers energy, mood, ordinal sleep quality; logged calories/protein/carbohydrate/fat/fiber/caffeine/alcohol with explicit unknown-data limitations; recorded condition episode counts/resolved duration/recorded peak severity/ordinal impact; symptom row frequency/known occurrence count/severity/resolved duration; exercise session counts and repetitions. Each definition names its future source adapter, units/grain, allowed aggregation/direction, eligibility, limitations and a clearly heuristic baseline recommendation.

Estimated 1RM is enabled by the final Epley v1 amendment above, using the existing workout-app pound convention and strictly eligible actual sets. Body weight, best logged single and external-load volume remain disabled pending their own unit/load-semantics verification. No body-fat, waist, nightly sleep-duration, steps, added-sugar or verified-dietary-adherence source is claimed. Registry metadata does not mean authenticated source readers are implemented.

Success criteria support absolute/percentage change and target values. Units must agree with the registry; percentage changes require ratio scales, and ordinal change criteria are rejected. Target thresholds are validated against rating/ordinal ranges. Criteria are frozen, never evaluated in this slice.

## Account export/deletion integration

Migration 001 replaces the three existing account contract functions additively, in the same transaction as all six new private tables:

- `axvital_account_schema_issues`: includes each private table's required owner/Auth CASCADE/RLS/SELECT contract, and explicit new relationship FK/delete-action/composite-owner checks. Unknown incoming dependencies still fail closed.
- `axvital_export_account`: fixed allowlist includes rules, private patterns/members, private evidence, coverage and snapshots. Shared evidence stays excluded. Existing redactions and row/byte limits remain. Export version becomes `axvital.account.v2`; additive columns on existing sources are included.
- `axvital_cleanup_deleted_account`: still validates the entire contract and corruption scan before any deletion. Deletes experiments/snapshots, then patterns/members and Nutrition targets before rules; private evidence/coverage before their source cleanup. Existing logs-before-foods and experiment-before-condition order remains. Auth cleanup is still one transaction.

Migration 005's billing-coordination functions and the existing deletion preparation/enablement controls are unchanged. No caller starts deleting application rows separately from Auth deletion. Shared catalog data and another account survive; corrupt cross-owner evidence rolls the attempted cleanup back.

Database mutation budgets: draft 20/min/account, start 6/min/account, pattern creation 12/min/account. Existing export 2, delete 3, checkout 3 and portal 6 remain unchanged. These in-transaction counters apply to committed RPCs; exceptions roll back their increments. The next HTTP slice must also use the existing request guard to charge attempts outside the mutation transaction, without accidentally double-charging the same route budget. No HTTP API route was added now.

## Tests and validation

Added 17 test cases (many contain multiple real SQL assertions) covering:

- Pure rule validation, zero, exact keys, templates and unknown semantics.
- TS/SQL registry parity, disabled outcomes and invalid success criteria.
- Preflight execution against pre-13A and post-13A local schemas without mutation.
- V1 compatibility and incomplete v2 drafts without fake outcomes.
- Canonical target projection, private pattern membership and atomic failed creation rollback.
- Same-owner/forged activity, protocol, condition, symptom, exercise and evidence references; shared and private exercise selection; anonymous denial.
- SQL exact-one enforcement, stale revisions, idempotent start, correct future event history, post-start writes and immutable snapshot protection.
- Both queued start/edit orderings and simultaneous queued starts.
- Source edits preserving snapshots; owned protocol selection without activation; durable custom symptom identity.
- Historical/prospective/no-baseline phases, malformed dates/timezones, unchanged account/billing limits.
- Coverage invalidation for item edits/removal, entry moves, soft deletion and removal; unknown evidence snapshots.
- Export containing all new private tables; account and whole-experiment deletion; shared/other-owner survival; corruption/schema drift failing closed.
- Workout prescription snapshots excluding logged execution observations.

Validation commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`. The full suite reached **309 passing tests, zero failures/skips** after the workout amendment; final verification is recorded in the task handoff. Existing Node module-type warnings and Git line-ending notices are not unrelated code-cleanup targets.

Important test limitation: PGlite is a disposable single-connection PostgreSQL engine with a synthetic original schema. Queued race tests exercise both legal orderings and revision rejection; they are **not** evidence of real multi-session lock scheduling under hosted Supabase. Preflight and concurrency/load tests on authorized staging remain mandatory. No Supabase or provider state was touched by these tests.

## Remaining live verification and precise execution order

1. Confirm deployed migration parity through `202608270005_billing_customer_coordination.sql`, authorized staging access, backup/restore plan and migration role privileges. No historical unit convention is assumed.
2. Run **only** `supabase/tests/sprint13a2_preflight.sql` against the authorized staging/deployed inventory. It uses a read-only transaction and rollback. Missing assumed tables/columns may deliberately stop it; resolve schema drift rather than skipping failures. Review aggregate cardinality/cross-owner/measurement/nutrient anomalies, full policies/grants/FK actions and account schema issues. The script must be reviewed before production readiness is considered.
3. Resolve any unexpected legacy DDL, permissive privileges, function ownership/default grants, malformed historical records or unresolved 12B/005 contract issues. No automatic text/identity/operator backfills are included. Original profile/check-in/health-event DDL remains an external assumption.
4. With separate authorization, apply **202608280001_experiment_domain_foundations.sql** to staging. All new personal data is export/deletion-safe in this transaction, and direct v2 writes are guarded before authoring is enabled.
5. Apply **202608280002_experiment_atomic_authoring.sql** to staging. It installs controlled authoring and budget changes; it does not start existing experiments.
6. Rerun the preflight/account schema checks and exercise authenticated A/B/anonymous roles, real two-session draft/start/source-edit and coverage races, shared/private targets, exports and prepared disposable account deletion. Confirm old clients still function, archived source behavior, body/snapshot/export limits and lock latency. No production account should be used for deletion validation.
7. Only after those reviews, approve a separate production application window in the **same 001 → 002 order**. Do not enable deletion, deploy UI, change medical claims, or enable unit-dependent outcomes as a side effect. No production application is authorized or performed by this task.

Further limitations to keep explicit: a start snapshot preserves intended configuration, not all transient source edits; later review APIs should detect source changes between preview and start. Existing custom-symptom histories remain unlinked until a separately reviewed deterministic mapping is available; current old callers do not magically create stable links. Profile typical sleep hours is not sleep history. Food coverage is self-reported logging completeness, not proof of intake or adherence. The source adapters must preserve these distinctions.

## Recommended Sprint 13A.3 prompt

> Implement Sprint 13A.3 — Experiments 2.0 source adapters, read-only baseline readiness and authenticated APIs. Read AGENTS.md, the relevant local Next.js guides, the 13A.1 architecture audit and `docs/sprint-13a2-experiments-foundations.md`. Inspect the 13A.2 contracts/tests first; do not create another rule/experiment system or rewrite existing migrations/data.
>
> Implement bounded owner-scoped measurement readers under `lib/measurements/sources` for enabled registry v1 outcomes only. Preserve original observations in their source tables. Honor explicit target IDs, parent consistency, timezone/calendar grains, eligibility and analysis cutoff; do not substitute planned workout values, null nutrients, absent logs or later episode updates for observations. Distinguish observed zero, missing data, source failure and truncated queries. Use the approved Epley v1 pure adapter/point contract for Estimated 1RM, preserving the workout-app lb convention without conversions or implement multipliers. Keep other disabled metrics disabled; do not pool mixed-unit/provenance data or reinterpret formula versions.
>
> Add read-only baseline readiness returning window, eligible observations/days/sessions, unknown/incomplete fields and actionable non-medical warnings. Do not call occurrence-generation helpers or copy baseline records. Sparse episode/symptom logging does not establish event-free surveillance; Nutrition completeness is separate from classification evidence. Weak baseline generally warns rather than prevents proceeding. Implement no adherence, success evaluator, results, scoring, causality or statistics beyond readiness counts/coverage.
>
> Add authenticated bounded APIs for v2 draft save/load, baseline preview and review/start using existing transactional RPCs, Auth-derived owner, same-origin writes, private/no-store responses, safe errors and the existing shared API-budget system. Charge failed HTTP attempts without double-counting the in-transaction mutation budgets. Preserve optimistic revisions and start retries. Detect source configuration changes between review and start rather than silently accepting a stale preview. Any required RPC evolution must be an additive forward migration with tests, not weakening direct-write or snapshot protection. Keep legacy paths intact; do not route v2 through the old transition RPC.
>
> Extend tests for sources/nulls/timezones/DST/target scoping/censoring, API authentication/body/range limits and failures, start concurrency, and account export/deletion regressions. Run tests, typecheck, ESLint and build. Do not apply Supabase migrations, deploy, change deletion flags, build the creation wizard, add progress/results UI, or start Sprint 13B. Report files, validation, live preflight gates, operational limits, and the next Sprint 13A.4 wizard/review integration prompt.
