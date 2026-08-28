# Sprint 13A.6 — Exposure Evidence & Historical Reconciliation

## 1. Implementation summary

Introduced a versioned server/domain exposure-evidence contract and integrated it into the existing v2 study-status service. The reliable expansion beyond habit evidence is frozen numeric nutrition targets, evaluated through the existing nutrition observation adapter and complete-day logging contract. Workout scheduled occurrences are now exposed without claiming verified prescribed performance. Protocol and whole-pattern history remain explicitly unsupported rather than receiving invented scores.

No efficacy, effect estimates, significance, recommendations, lifecycle mutations or experiment-specific logging were added.

## 2. Files changed

- `lib/experiments/exposure-evidence.ts`: evidence DTO, bounded opportunity helpers, summary and compatibility presentation.
- `lib/experiments/exposure-reader.ts`: server-only snapshot reconciliation and source orchestration.
- `lib/nutrition/frozen-target.ts`: reusable validated frozen numeric-target evaluator and explicit supported subset.
- `lib/experiments/study-status.ts`: consumes shared evidence instead of owning habit-specific read/classification logic.
- `lib/experiments/study-health.ts`: additive exposure-evidence field in status DTO.
- `components/experiments/ActiveStudyStatus.tsx`: generic adherence counts and expandable dated evidence/integrity details; no evaluator imports.
- `lib/experiments/exposure-evidence.test.ts`: 25 new tests.
- `lib/experiments/study-health.test.ts`: existing mock now supplies exact row counts required by conservative read completeness. Assertions were retained.
- This handoff.

## 3. Exposure-evidence contract

`ExposureEvidence`, contract version 1, contains intervention type, frozen source ID, frozen source revision where available, experiment revision, phase, evaluation timestamp, completed-day window, denominator provenance, eligible/adherent/non-adherent/unknown counts, classification, evidence completeness, source-integrity state, pause state, safe warnings and dated opportunity evidence.

Counts are nullable when the denominator is unknown. An empty known denominator is zero opportunities with unknown adherence, never automatic success or failure. Opportunity states are adherent, non-adherent or unknown. Raw nutrition values, occurrence IDs, session IDs, owner IDs and database errors are not returned in this public evidence projection; the frozen source identity is deliberately explicit.

The old `exposure` summary remains for compatibility. Its habit `skipped` field is not reused for missed nutrition targets; nutrition non-adherence is exposed under the new contract's correctly named `nonAdherentCount`.

## 4. Eligible-opportunity semantics

- Habits: frozen recurrence dates intersected with completed intervention days.
- Supported nutrition targets: one opportunity per completed intervention day, because the validated frozen rule explicitly has `period: day`.
- Workouts: recorded scheduled occurrences linked to the frozen template identity, excluding draft/cancelled records. This is a current recorded-schedule denominator, not a reconstruction of all intended historical workouts.
- Protocols and patterns: no unsupported denominator is invented.

Today/future days are excluded from aggregate counts. Today can show recorded habit status separately. Off-days never become missed opportunities. Date ranges are validated and bounded to 366 days. Multiple distinct workouts on one date remain distinct recorded opportunities; duplicate records do not earn repeated credit.

## 5. Habit support

Uses the frozen Start schedule and existing planner recurrence function. Completed occurrence = recorded adherence; explicit skip = recorded non-adherence; missing, planned or multiple ambiguous records = unknown. No occurrence materialization helpers are called.

The owned current habit's selective fields must match the frozen definition before and after the occurrence read. Missing/changed sources, concurrent edits, failed queries and incomplete counts suppress definitive evidence. This preserves 13A.5's conservative current-record behavior while labeling integrity honestly as `current_criteria_match`, not a complete historical version proof. Edit-and-revert history is not reconstructable.

## 6. Protocol support

The audit confirmed that Start freezes members and required/optional flags. Existing protocol analytics provide item-level completion summaries and pause exclusions; they do not provide a versioned whole-execution record tied to the frozen experiment membership. Current membership and multi-step pause/resume operations can change, and planned occurrences can be removed.

Protocol evidence therefore remains unknown with a specific membership/execution/pause-history limitation. Optional completion is never substituted for required exposure. No new protocol completion rule was invented and no protocol-wide percentage is fabricated.

## 7. Nutrition-target support

Supported rule subset is exported explicitly: version-1 daily numeric `gte`, `lte` and `eq` targets for calories, protein, carbohydrate, fat and fiber, with canonical units validated by the existing rule validator.

The evaluator requires complete logging coverage in the experiment's analysis timezone, complete known nutrient fields, actual item evidence and a finite nonnegative subtotal. Only then is the frozen threshold applied. Met → adherent; not met → non-adherent. Partial/unknown logging, absent records, empty entries, null nutrients, invalid totals and failed/truncated reads → unknown, even when the available subtotal crosses a minimum threshold.

The existing `readObservations` nutrition path calls `read_nutrition_observations_v1`, whose single SQL snapshot reads owned entries, item snapshots and logging coverage coherently. It already guards truncation, parent chains and duplicate evidence. No separate subtotal calculator or live-rule lookup was introduced. Later edits/deletion of a live target do not replace its self-contained frozen definition.

Ranges, alcohol-occurrence rules, exclusions and cutoffs are not supported by this evaluator. Unsupported definitions stay unknown; no partial rule approximation occurs.

## 8. Nutrition-pattern support

Start freezes pattern members and definitions. This sprint does not claim that independently evaluated member targets establish whole-pattern adherence: there is no versioned whole-pattern composition/evidence contract covering all supported numeric, exclusion and cutoff definitions. Pattern evidence remains unknown with that specific limitation. No heuristic pattern score or mutable live-pattern reinterpretation was introduced.

## 9. Workout support

The reader exposes bounded, owned, recorded scheduled occurrences linked to the frozen template. It distinguishes descriptions of a completed scheduled workout, an explicit recorded skip and an unconfirmed scheduled workout. All remain unknown experimental exposure until prescription equivalence is established.

Start snapshots contain exercise prescriptions, rounds/rest/group metadata and set targets. Planned workouts preserve many prescription fields; session/set records preserve actual performance and links. However, the current projection does not establish complete equivalence for every frozen prescription field or define which performed deviations satisfy the experiment. Matching template ID or completed/skipped status alone therefore receives no adherence/non-adherence credit. This intentionally does not implement an approximate prescription matcher.

Missing/deleted schedules cannot be reconstructed. Duplicate IDs, read errors or truncated schedule reads yield an unknown denominator. No calendar-day workout denominator is used.

## 10. Phase handling

The contract carries the authoritative study phase. Baseline/planning are explicitly not applicable for intervention exposure: zero expected intervention opportunities and no adherence claim. Reconciliation supports active/paused intervention-phase studies only. Analysis, complete and advanced washout/crossover phases remain unsupported rather than being inferred. Frozen intervention bounds—not baseline dates—drive exposure windows.

## 11. Pause handling

Any recorded experiment pause, current paused state, or unavailable pause read makes the affected study projection unknown with a null denominator. This is intentionally the conservative whole-projection option, not a claim of reconstructed pause-adjusted eligibility. Current phase-event history and protocol pause tables do not supply a complete immutable historical reconciliation guarantee. No duration is subtracted based solely on current status. Outcome completeness remains separate and is also withheld where pause adjustment is unresolved.

## 12. Frozen-source/version integrity

Reused the existing immutable version-1 Start snapshot and required matching experiment configuration revision and a valid frozen source identity before source reads. Unsupported/missing/mismatched snapshots suppress evidence.

Integrity states distinguish a self-contained verified frozen definition, a current habit-criteria match, mismatch, unavailable source and unverifiable history. Numeric nutrition definitions can be evaluated independently of later live rule changes. Habit status semantics still depend on current criteria matching and explicitly retain a retrospective-history limitation. Workout/protocol/pattern integrity is not overstated.

No new persistence/versioning system or hash approximation was introduced. No migration was necessary for the supported subset.

## 13. Unknown-data semantics

Missing records never automatically become non-adherence. Unknown input is preserved per opportunity and in aggregate counts. Incomplete reads suppress positive and negative classifications. Known frozen schedules may retain their eligible count with all opportunities unknown; incomplete workout schedule enumeration cannot retain a precise denominator. Unsupported definitions never silently degrade to a supported subset. An explicit habit skip differs from an insufficiently logged nutrition day.

## 14. Study Health integration

`loadStudyStatus` consumes `readExposureEvidence` and projects its summary; intervention-specific evidence logic is no longer embedded in that orchestration function. React displays server classifications, integrity, denominator provenance and dated reasons.

Exposure, outcome completeness and Study Health remain separate. The existing collection-only health projection retains unknown propagation. Its explanation explicitly states that Study Health does not indicate whether the intervention is working. A nutrition target not met is non-adherence, not an efficacy conclusion and not a habit skip.

## 15. API/security behavior

No new endpoint or client-controlled evaluation input was added. The existing authenticated status GET retains exact UUID/query validation, ownership filters, private/no-store responses and the registered shared experiment-read budget. Callers cannot override owner, study dates, clock or frozen configuration.

Reads are capped and timed out. Habit/workout reads require exact count agreement and fail conservatively at the cap. Nutrition uses the existing bounded authenticated source RPC. Snapshot ownership and experiment revision are checked by the status service; status/revision is rechecked after collection reads. Safe static warnings replace internal error details. No source/lifecycle mutations or occurrence-generation calls were added. The pre-existing request-budget counter remains the normal API boundary side effect.

## 16. Tests added

25 new focused tests cover the contract, adherence/skip/unknown, empty denominator, duplicate evidence, off-days/today/future, bounded recurrence, source mismatch/missing/concurrent changes, failed/truncated/missing-count reads, revision mismatch, baseline phases, pause ambiguity, numeric min/max/equality, insufficient logging, unsupported rules, frozen criteria, atomic-reader delegation, duplicate nutrition items, protocol required/optional/history limitations, pattern unknowns, workout scheduled opportunities and unverifiable performance, status integration and no client evaluator/mutation code.

Combined with the existing study-health file: 39 focused tests pass. The existing mock's exact-count metadata was corrected without removing assertions.

## 17. Validation results

- New exposure file: 25 passed.
- Exposure plus study-health files: 39 passed.
- Full repository suite: 424 passed, zero failures/skips.
- Typecheck: passed.
- ESLint: passed.
- Production build: passed.
- `git diff --check`: passed; normal Git line-ending notices may appear.

## 18. Migrations created/applied

None created or applied. The audit reused existing Start snapshots, current source identities, occurrence records, nutrition snapshots/coverage and workout schedules. No real user health data was changed, and no lifecycle action or experiment Start was performed.

## 19. Staging verification

Not performed. The workspace contains local environment configuration, but a verified staging deployment and controlled signed-in fixture user were not established. That configuration was not assumed to be staging, and no real-user records were used as test fixtures.

Controlled local tests exercised habit adherence, skip, unknown, source changes, supported nutrition, missing/incomplete logs and unsupported sources. These use test clients around the actual domain/source adapter and existing repository tests; they are not a claim of authenticated staging E2E verification. A staging pass remains required before rollout.

## 20. Unsupported evidence sources

Whole-protocol historical execution; whole-pattern adherence; exclusion/cutoff/alcohol-occurrence/range nutrition rules; verified performed workout-prescription matching; pause-adjusted studies; unsupported phases; unavailable/mismatched source versions. Each remains explicitly unknown or not applicable, with no invented percentage.

## 21. Known architectural gaps

Current-record history is mutable. Source edit-and-revert histories, complete protocol membership/execution ledgers, immutable pause reconstruction, deleted workout schedules and full performed-prescription equivalence are not solved by this sprint. Numeric nutrition target evidence is a frozen-criterion comparison against currently available historical logging—not a reproducible immutable dataset snapshot. Before expanding support, define the minimum reusable evidence/version contracts for each source rather than creating a general versioning subsystem by default.

## 22. Requirements for an eventual results engine

Require phase-aware, versioned evidence and reproducible analysis cutoffs; distinguish planned eligibility from recorded-only schedules; preserve unknown denominators and source-integrity limitations; define minimum acceptable outcome and exposure quality without conflating the two; specify protocol and workout adherence semantics before using them in interpretation; reconcile pauses explicitly; never convert missing logs into confirmed non-adherence or event absence. Freeze the analysis inputs/version and surface uncertainty. This sprint provides exposure evidence only and does not begin the results sprint.
