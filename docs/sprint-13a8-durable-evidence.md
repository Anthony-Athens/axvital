# Sprint 13A.8 — Durable evidence and terminal reconciliation

## 1. Implementation summary

Added versioned v2 lifecycle transitions, conservative whole-active-day reconciliation, immutable database-generated source captures, deterministic replay, and an authenticated server-only results projection. Supported nutrition-target studies can now be analyzed after normal completion or authoritative early end, including closed pause/resume intervals. Old analysis policy 1 remains available and unchanged in its lifecycle scope; durable terminal analysis uses policy/contract 2.

No polished results UI, HTTP results route, causal inference, treatment recommendation, event-rate analysis or formal workout assessment inference was introduced. Captures are explicit mutations, never a side effect of reading or rendering.

## 2. Files changed

- `supabase/migrations/202608280005_experiment_durable_evidence.sql`: transitions, immutable storage, coherent source capture, security grants, export/deletion integration.
- `lib/experiments/lifecycle.ts`: versioned history validation and active-day reconciliation.
- `lib/experiments/durable-evidence.ts`: private retained-data replay, capture/read service and safe results DTO.
- `lib/experiments/analysis-contract.ts`: policy/contract 2, lifecycle evidence and durable provenance.
- `lib/experiments/analysis.ts`: policy-2 eligibility, actual windows and active-date alignment while retaining policy-1 behavior.
- `lib/experiments/exposure-evidence.ts`: shared reconciled nutrition opportunity evaluation.
- `lib/experiments/durable-evidence.test.ts`: focused lifecycle, provenance, replay and real PostgreSQL/RLS tests.
- This handoff.

## 3. Lifecycle contract

The existing status/phase fields and append-only `experiment_phase_events` are reused. `transition_experiment_v2(target_id, expected_lifecycle_revision, action)` locks the owned model-v2 experiment, requires its Start snapshot and expected lifecycle revision, and performs a transition with an event atomically. It accepts no timestamp, owner, source, or arbitrary metadata arguments. V1 transition behavior is untouched.

New events record `lifecycle_version: 1`, sequential `lifecycle_revision`, `config_revision`, and `provenance: v2_transition_rpc`, with exact prior/next status and phase and a database timestamp. Allowed actions are pause, resume, complete, end_early, abandon and archive. Complete requires active/intervention and the planned end to have passed. Early end requires active/intervention before the planned end. A paused experiment must resume before complete/end_early; abandon is available while paused. Archive is terminal-only. At most 100 versioned transitions are accepted per experiment.

| Current terminal status | Analysis behavior | Actual end authority |
| --- | --- | --- |
| completed / complete | Supported with validated history and evidence | Completion event matching `actual_completed_at` |
| ended_early / analysis | Supported with validated history and evidence | Early-end event matching `ended_early_at` |
| abandoned / complete | No new analysis | Abandon event retained, not interpreted as sufficient study execution |
| archived | No new capture/analysis against current state; prior captured revisions remain readable | Prior captured terminal history, not archive time |
| analysis phase without an ended_early contract | Unsupported/mismatched history | No end inferred from phase alone |

There is no distinct results-ready status in the existing schema. The implementation does not invent one or spoof terminal studies as active.

## 4. Actual-bound semantics

Planned baseline and intervention dates remain immutable in the Start snapshot. Actual intervention start must match the single versioned-v2 Start `intervention_started` event and `actual_started_at`. Historical/no-baseline Start runs use this event; prospective baseline-start histories remain unsupported for analysis.

Actual end is an explicit terminal event timestamp matching the appropriate actual-end column. Analysis uses only full local calendar days inside both the actual execution interval and the frozen planned intervention interval. Early end truncates the interval. Late completion does not extend it beyond the planned end. Today, post-study records, partial start/end days and pause-touched days do not become eligible intervention days.

Reconciliation separately retains planned days, actual elapsed calendar-day difference, actual elapsed milliseconds, active dates, excluded dates, actual timestamps and resolved read bounds. Elapsed time is not an exposure denominator. Pauses do not silently extend the planned study. Existing timezone boundary utilities handle DST instead of dividing elapsed milliseconds by 24 hours. PostgreSQL sub-millisecond starts/resumes are rounded inward for day eligibility; the original exact timestamps remain retained in the source artifact.

## 5. Pause/resume behavior

Closed pause intervals are paired from validated sequential transitions. Every event must have correct provenance, revision, chronological order, prior/next state and phase. An open pause, duplicate/malformed transition, missing start, mismatched actual end or unversioned historical runtime event blocks analysis. No historical pause ledger is backfilled or inferred from the current paused field.

For day-based outcomes, a pause overlapping any portion of a day excludes that whole day from both exposure opportunities and expected outcome days. A pause from one midnight to the next excludes precisely that day; midday pause/resume can exclude two boundary days. This is deliberately conservative, not a fractional adherence calculation or a continued-surveillance assumption.

## 6. Evidence persistence approach

Options were evaluated in the requested order:

1. Reuse immutable Start and append-only phase events for configuration/lifecycle. They do not retain source observations, and phase history is already fetched by browser detail code; putting raw evidence into event metadata would expose it there.
2. Add the narrow `experiment_evidence_captures` table. This is the selected option.
3. Source-specific version references cannot reconstruct currently mutable check-ins/nutrition rows, so references alone are insufficient.
4. Broad event sourcing is unnecessary and was not introduced.

Each capture stores owner/experiment, configuration/lifecycle revisions, analysis revision, capture and analysis-policy versions, database capture timestamp, exact JSON text and SHA-256 digest. Its JSON retains the frozen Start, projected experiment state, bounded phase history, source inputs for baseline/intervention, nutrition items and logging coverage, and check-in values when relevant. Check-in payloads select only the primary configured field; no notes or unrelated health domains are copied. Nutrition uses the existing fixed-purpose nutrient projection, not food catalogs or full meal records.

Version pins explicitly retain analysis contract 2, policy 2, readiness policy 1, source adapter 1, registry 1, exposure contract 1 and lifecycle contract 1. Adapter exclusions/missingness are reproducibly derived from the retained source payload and its pinned decoder, not re-read from live sources. The resulting private `AnalysisBundle` additionally retains the exact normalized observations and analysis-input digest.

## 7. Analysis revision/versioning

`capture_experiment_evidence_v1(target_id, expected_analysis_revision, expected_lifecycle_revision)` creates the next capture only after optimistic revision checks. Initial revision requires expected revision 0; later re-analysis is an explicit new call naming the last revision. There is a 32-capture ceiling per experiment and a 2 MiB artifact limit. Conflict/retry never silently overwrites an earlier result. Reads require an explicit revision; there is no automatic latest-valid fallback that could hide a newer indeterminate result.

The artifact is a candidate analysis capture, not a promise of eligibility: truncated sources, missing observations or unverified history can produce an immutable indeterminate analysis. Result facts are always derived from that exact capture. Unsupported source/design capture requests fail explicitly. No automatic repeated snapshots or persisted persuasive conclusions.

`replayDurableCapture` verifies the SHA-256 over the exact stored UTF-8 JSON text before parsing and validates versions and metadata. PostgreSQL/JavaScript JSON formatting differences are avoided by hashing the stored text, not reserializing JSON independently. The digest is a corruption check, not a signature. Immutability and owner-scoped database writes establish provenance. Future decoder/method changes must introduce a new version and preserve old implementations for replay.

## 8. Transactional consistency boundary

The capture RPC locks the experiment root, checks analysis/lifecycle revisions, invokes a read-only `STABLE` source-capture helper, and stores its result in the same transaction. Configuration/lifecycle operations also lock this root. The stable helper and existing stable nutrition RPC use the calling read statement's MVCC snapshot, so the projected experiment, Start, event history, check-ins, nutrition entries/items and coverage are captured from one database read snapshot. PostgreSQL documents this snapshot behavior for [STABLE functions](https://www.postgresql.org/docs/17/xfunc-volatility.html).

This guarantee covers database records visible at that capture read—not what was true when an earlier event was originally logged, and not a historical as-of query at study end. The timestamp is the database transaction timestamp; it is not a claim that all source rows were created then. Edits made before capture may already have changed evidence. Edits/deletions after capture cannot change replay. No external devices/services participate. No cross-source transactional claim is made for the older Sprint 13A.7 live acquisition service.

## 9. Exposure integration

The Sprint 13A.6 evidence type and summarizer are reused. `reconciledNutritionOpportunities` evaluates the frozen numeric target against retained source results, using only validated active dates. The existing frozen nutrition evaluator remains authoritative. Counts, unknown vs non-adherent, source integrity and warnings stay distinct from outcome quality.

Terminal evidence keeps its true complete/analysis phase. Its analysis window ends at actual/planned bounds, and its opportunity dates must exactly match reconciliation. Known non-adherent active days remain in the primary outcome population. Paused days never become non-adherent. Live study-health reads remain conservative for unsupported terminal/pause history; callers must use the retained analysis service for historical results, not reinterpret current live exposure.

## 10. Outcome integration

Existing source adapters are run against a fixed-purpose in-memory transport that can read only the retained artifact. It supports only the captured nutrition RPC payload and configured check-in rows; it has no live database or fallback path. This avoids duplicating nutrition completeness, check-in validation, unit or missingness logic.

Baseline remains frozen/configured. Intervention source bounds stop at the authoritative completed-day end; eligible observations and expected days are filtered to the same active-date set used by exposure. Raw captured counts can include pause-touched records; eligible counts do not. No imputation. The five-observation floor per period, complete-read requirement, source-integrity gates and conservative methods remain in force.

## 11. Completed-study support

Supported: historical-baseline studies with a valid Start, versioned normal-completion event, supported frozen numeric nutrition target, supported daily nutrition or check-in primary outcome, sufficient complete active-day observations and fully known exposure. Completion after planned end retains the actual completion timestamp but does not add post-plan outcome/exposure days.

## 12. Early-end support

Supported under the same gates when a versioned early-end event matches `ended_early_at`. The last partial day is excluded. Early end does not erase the planned end; both remain in the capture. `EARLY_END_MAY_BE_INFORMATIVE` accompanies analysis because stopping may relate to outcomes or tolerability. No stopping-rule recommendation or causal conclusion is added.

## 13. Paused/resumed support

Supported for completed/early-ended studies with one or more fully validated closed pauses. Active-day exclusion is common to both denominators. Active studies, currently open pauses, old unversioned pauses and unresolved ends do not gain terminal eligibility merely because evidence was captured. The new transition RPC refuses to upgrade unversioned runtime history implicitly.

## 14. Event surveillance findings

Existing symptom/condition records describe observed events, optional counts, updates and censoring; they do not establish event-free observation time. A minimum future contract needs a versioned owned surveillance interval with scope (condition/symptom identity), exact start/end and timezone, observation method, explicit complete/partial/unknown status, confirmed zero-event assertion, linked event IDs, exclusions, attestation timestamp and provenance. Intervals must be non-overlapping or reconciled, and coverage changes must invalidate prior zero assertions.

Distinctions: an event row is observed-event evidence; an explicitly completed interval with zero linked events can be confirmed zero; no interval is no logging; partial coverage is incomplete surveillance. Pause overlap must define whether surveillance continued independently of exposure. No such denominator is manufactured here. Rates, rate ratios and generic count analysis remain unsupported.

## 15. Performance assessment findings

Workout sets have actual loads/repetitions and Epley eligibility but no formal baseline/post test designation or immutable assessment protocol. A future narrow assessment contract needs owner/experiment, assessment type, value/unit, performed timestamp, protocol ID/version and frozen test definition, baseline/post role, linked source records, load convention, device/manual provenance, validity/exclusions and adjudication/attestation metadata. Role assignment must be explicit, not the best conveniently selected training set.

Direct tested 1RM and estimated 1RM must be different assessment types; timed/functional tests need their own protocol and unit semantics. Test conditions, acceptable timing windows, repeat selection, invalid attempts and safety constraints need definition before comparison. No assessment table or training-set reinterpretation was added in this sprint.

## 16. Security/RLS behavior

The new table has owner-read RLS, an Auth-owner FK, and a composite experiment/owner FK. Authenticated users have SELECT only, not INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER. Fixed-purpose owner-validating definer RPCs follow the existing v2 mutation architecture; they do not use a service-role client. Private helper execution is revoked, search paths are fixed, and foreign/missing experiment writes return the same safe absent error. Capture/lifecycle SQL statements have ten-second timeouts, bounded source arrays and revision limits.

Captures cannot be updated or deleted individually, even by the normal migration-role update path. Whole-experiment/account erasure cascades remain possible and tested. The existing fail-closed account schema/export/deletion manifests now include the new table and composite ownership relationship. Existing export size limits still apply; large retained histories can require future paginated export work rather than silently omitting evidence.

`readDurableAnalysis` authenticates, owner-scopes the requested experiment/revision, privately replays and returns an allowlisted DTO containing eligibility, facts, counts, limitations, versions and capture timestamp. It omits raw observations, source IDs, frozen definitions, opportunity lists, digests and the input bundle. No application browser call was added. As with existing owner data/export, an authenticated owner can access their own rows through database API grants; this is not a claim that health evidence is inaccessible to its owner. Other owners and anonymous roles cannot access it. Private evidence must not be logged.

## 17. Tests added

19 focused tests cover normal completion, early end, no/one/multiple closed pauses, open pauses, exact midnight and partial/sub-millisecond boundaries, malformed/unversioned history, abandoned/archived states, actual-end mismatch, retained replay after edits/deletions, version/digest tampering, truncated reads, check-in ordinal replay, nutrition denominator alignment and safe DTO projection.

Real local PostgreSQL/PGlite tests apply the migration, complete a synthetic study through the new RPC, create numbered captures, detect stale revisions, deny private helper execution and direct mutations, verify foreign-owner isolation, retain old analysis after archive, export captures and erase them during account deletion without affecting another owner. A separate transition test checks pause/resume/early-end provenance, exact prior states, server timestamps, invalid transitions and anonymous denial. Synthetic backdated fixtures are inserted only by the test migration role; public RPCs cannot backdate events.

## 18. Validation results

Final post-review validation on 2026-08-28:

- Focused durable-evidence tests: **19/19 passed**.
- Full repository suite: **472/472 passed**, no failures or skips (about 57 seconds).
- `npm run typecheck`: passed.
- `npm run lint`: passed without findings.
- `npm run build`: passed; 60 pages generated, no new routes.
- `git diff --check`: passed; new files also checked against an empty file with no whitespace findings.

The repository's existing Node module-type warnings and Git LF/CRLF conversion notices remain informational. Tests use synthetic local PostgreSQL data, not authenticated staging health records.

## 19. Migrations created/applied

Created `202608280005_experiment_durable_evidence.sql`. Applied successfully only in disposable local PostgreSQL/PGlite test databases. No linked Supabase, staging or production migration was applied. No existing user records were rewritten or backfilled.

The migration extends account manifests using exact checked function-definition anchors so schema drift aborts rather than silently dropping existing checks. Review the migration and deploy against explicitly designated staging first. Existing functions/grants are retained except the narrowly documented new functions/table and manifest entries.

## 20. Staging verification

Not performed: no explicitly designated staging project and controlled fixture account were available. A local environment file is not proof of staging. No real health records were used for verification.

Staging checklist: normal completion, pause/resume then terminal end, early end, capture revision 1, replay, source edit/delete, stable revision-1 replay, explicit revision 2, stale revision conflict, foreign/anonymous denial, account export and erasure. Verify both nutrition and check-in primary outcomes, the private DTO and configured caps. Do not bypass Start/lifecycle immutability to retrofit real studies.

## 21. Unresolved provenance gaps

Captures preserve records visible at capture, not pre-capture edit history or immutable evidence from each original observation. Self-reported completion/logging does not prove actual execution or intake. Historical unversioned runtime events remain unverified. Five observations remain an arbitrary documented descriptive floor, not statistical precision or power. Whole-day exclusion can lose valid partial-day observations and pauses/early stopping may be informative. No confounding, serial dependence, regression-to-mean or measurement-error correction is claimed.

Captured raw JSON and pinned code are needed for replay; policy implementations must not be silently changed in place. No independently attested signature, device ledger, study-end automatic capture, or immutable formal test assessment exists.

## 22. Newly supported analysis cases

- Completed supported nutrition-target experiments with frozen historical baseline and daily nutrition/check-in outcomes.
- Early-ended equivalents using explicit actual end and conservative full-day bounds.
- Completed/early-ended equivalents with authoritative closed pause/resume history and aligned active-day denominators.
- Stable historical replay after subsequent source edits/deletions or experiment archival, by explicit retained revision.

## 23. Remaining unsupported cases

Abandoned analysis, new archived-state captures, unresolved ends/open pauses, legacy runtime provenance, prospective/no-baseline comparisons, crossover/washout, protocol/pattern execution, historical habit criteria verification and workout prescription verification remain unsupported. Weight units remain unresolved. Event surveillance, binary positive/negative surveillance, pre/post performance assessments and advanced statistical inference remain unimplemented. A newer insufficient revision does not automatically promote an older result as current.

## 24. Recommendation for results API/UI sprint

After staging validation, expose a narrow authenticated results-read endpoint around `readDurableAnalysis`, with exact revision validation, registered API budget and private/no-store responses. Add explicit lifecycle/capture controls with mutation authorization, origin checks and conflict/retry handling; never create captures during GET/render. Show capture revision/time, descriptive eligibility, separate quality summaries and limitations before any narrative. Provide explicit revision selection and honest no-result states. Keep raw artifacts server-side in application flows. Do not begin polished efficacy storytelling or expand unsupported analysis families without their provenance contracts.
