# Sprint 13A.7 — Results framework and analysis contracts

## 1. Implementation summary

Added a read-only, server-only v2 analysis foundation. It captures frozen configuration and exact evidence, returns structured eligibility, separates exposure/outcome quality, and calculates conservative descriptive facts only when eligible. No causal inference, result persistence, lifecycle changes, HTTP endpoint, or polished results UI was added. Existing v1 results remain unchanged.

## 2. Files changed

- `lib/experiments/analysis-contract.ts`: versioned private input, bundle, quality, eligibility and facts types.
- `lib/experiments/analysis.ts`: deterministic capture/replay, integrity checks, method selection and descriptive calculations.
- `lib/experiments/analysis-service.ts`: authenticated, owner-scoped acquisition using existing readers.
- `lib/experiments/analysis.test.ts`: focused domain, replay and service tests.
- This handoff document.

Existing measurement registry, source adapters, readiness policies, frozen nutrition evaluator and exposure reader are reused without alteration. Legacy `comparePeriods` and its strength labels are not reused.

## 3. Analysis-input contract

`AnalysisInput` v1 includes analysis-policy/readiness-policy versions, experiment ID/model/revision/status/phase, full immutable Start snapshot/version, canonical ISO cutoff, both complete `SourceResult` captures, full exposure evidence, acquisition issues and integrity limitations. The Start configuration contains outcome identity, primary role, aggregation, units/definition version, intervention reference and frozen definition, timezone, and inclusive baseline/intervention dates. Each source capture preserves adapter/registry/contract versions, exact resolved windows, observations, exclusions and missingness. Exposure captures its own contract version and source revision.

`captureAnalysisBundle` detaches the input with `structuredClone`, hashes recursively key-sorted JSON with SHA-256, and returns `{input,inputDigest,result}`. `analyzeCapturedInput(input, expectedDigest)` checks the supplied digest and recomputes using policy v1. Array order remains part of the capture. The digest detects changes relative to a retained checksum; it is **not** an authenticity signature. These are trusted internal typed contracts, not an untrusted JSON ingestion API.

Reproducibility means replay of the **retained complete bundle at its explicit cutoff**, with the corresponding implementation/policy version. Calling acquisition again with the same cutoff does not reconstruct historical database state: sources are mutable current-record retrospective reads. There is no persistent bundle store in this sprint. Do not discard the bundle and claim the cutoff alone makes a result reproducible. Do not log or publicly serialize bundles; they contain private source IDs and observations.

## 4. Eligibility contract

Every rejection has a code, scope (`input`, `design`, `exposure`, `baseline`, `intervention`) and state. All reasons are retained. State precedence is integrity block, unsupported design, unable to determine, insufficient data, then ready. Facts are null unless ready.

- `ready`: supported design/method, valid matching frozen versions and windows, acceptable exposure, complete reads and at least five eligible observations in each period.
- `insufficient_data`: too few eligible observations, unfinished intervention, or incomplete/unknown exposure opportunities.
- `unsupported_design`: no historical baseline, unsupported family/cadence/aggregation, unsupported lifecycle, or unsupported frozen nutrition rule.
- `blocked_by_integrity`: snapshot/revision/definition/window mismatch, duplicate or conflicting evidence, unresolved pauses, lifecycle race, or unverified historical exposure criteria.
- `unable_to_determine`: unavailable/failed/truncated observation reads or unknown exposure denominator.

Unsupported plans short-circuit source acquisition. Unavailable evidence fields remain null; their additional reasons do not override a higher-priority design/integrity reason. Snapshot transport failures return a safe service error rather than alleging a corrupt snapshot.

The five-observation minimum is an explicit v1 descriptive-method floor, **not** a power calculation, clinical threshold, confidence measure, or evidence-strength score.

## 5. Supported analysis families

| Family | Initial supported observations | Method |
| --- | --- | --- |
| Repeated continuous | Enabled daily nutrition quantity outcomes with frozen `average` aggregation | Complete-day mean, numeric median, range, mean difference, relative mean difference when defined |
| Repeated ordinal | Energy, mood and sleep-quality check-ins | Median lower/upper rank pair and observed-value distribution |

Energy/mood are treated conservatively as ordinal despite their numeric coding and legacy average configuration. Analysis does not use the readiness engine's arithmetic rating aggregates. Only primary outcomes are analyzed; secondary outcomes are preserved in the Start capture but not analyzed.

## 6. Unsupported outcome types

Count/frequency is explicitly classified but not calculated: episode and symptom logs lack authoritative surveillance time and confirmed zero-event periods. Binary repeated is reserved in the family contract; no current registry outcome provides authoritative positive and negative surveillance, so none is enabled. Estimated 1RM is classified as pre/post performance but rejected because no frozen baseline/post assessment-point protocol exists. Training-set Epley estimates are not manufactured into endpoint tests or daily measurements.

Weight remains registry-disabled because its units/provenance contract is unresolved. Sleep duration is not an available outcome. Other episodic severity/duration/impact, unsupported workout cadences, and daily nutrition `sum` configuration are not silently converted to supported methods. No ratio/rate/proportion/trend is fabricated for these cases.

## 7. Baseline/intervention semantics

Both periods come exclusively from the Start snapshot, in its analysis timezone. Inclusive configured end dates become exclusive logical-day bounds through existing timezone/window utilities. Baseline must finish before intervention starts; overlapping, reversed, invalid or unsupported windows fail closed. Existing readers limit a window to 366 days and resolve local calendar/DST boundaries; no elapsed-hours-to-days shortcut is introduced.

Only **historical baseline + active/intervention lifecycle + fully ended frozen intervention period** is initially supported. An active study can remain active after its planned end. Before the final intervention day closes, the service returns insufficient data and does not calculate an interim comparison. No-baseline/prospective/crossover designs are unsupported.

Completed, stopped, analysis-phase and early-ended studies remain unsupported because the existing exposure reader does not define authoritative reconciliation for those phases. The service does not spoof them as active. Supporting terminal lifecycle windows requires a separate authoritative contract, not a UI workaround.

## 8. Exposure handling

Results retain opportunity, adherent, non-adherent and unknown counts, dated states, completeness, source integrity and warnings separately from outcome quality. Baseline dates never receive intervention adherence requirements.

V1 requires a known frozen-schedule denominator, nonzero opportunities, complete evidence, no unknown opportunities, and `frozen_definition_verified` integrity. At present, the existing reader provides this for supported daily numeric nutrition targets. Current-only habit criteria matches are adequate for a limited study-health display but not for this stricter historical analysis. Workouts, protocols and patterns retain their existing unsupported/unverified limitations.

The primary population is all eligible observed intervention days, including known non-adherent days. There is no adherent-only subset, imputation or post-hoc efficacy selection. Source/opportunity identity, dates, revision and counts are checked. When exposure and outcome use the same nutrient, their captures are cross-checked with the existing frozen target evaluator; contradictory evidence blocks facts.

## 9. Missing-data semantics

Outcome quality preserves expected days, captured points, eligible points, missing eligible days, observed dates, source missingness and read completeness. Nutrition points qualify only when the authoritative adapter reports both field completeness and complete logging coverage. Partial subtotals are never treated as known daily intake. No check-in, intake, adherence or event value is imputed.

Failed/truncated reads have unavailable counts/denominators for analysis, not apparent complete-case coverage. Complete reads with missing dates may pass the five-point floor, but the result carries missing-not-imputed and selective-complete-case limitations. Logging completeness remains self-reported evidence, not independently measured intake.

## 10. Pause handling

The exposure reader checks owned pause events. Analysis requires `pauseState: clear`; unresolved or unavailable pause history blocks facts. The service rechecks pause events after acquisition and rechecks experiment revision/status/phase. It never subtracts guessed pause durations. An authoritative pause-adjusted ledger remains necessary for future paused/resumed analysis.

## 11. Integrity/version handling

Supported versions are analysis contract/policy/readiness policy 1, Start snapshot 1, source contract/adapter/registry 1, and exposure contract 1. Frozen measurement key/version/unit/scale/grain/source adapter/target/aggregations/formula must match the implemented definition. Root revision must match the Start revision; source identity and resolved cutoff/windows must match the analysis plan. Invalid values, duplicate daily points, inconsistent nutrition-day captures and digest mismatches block effects.

The reads are bounded but **not one cross-table transaction**. Lifecycle and pause rechecks plus same-nutrient contradiction checks reduce detectable races, not all possible concurrent edits. Exact captured inputs enable replay, not a claim that every source existed in that state at one transaction timestamp. A future transactionally coherent capture or durable versioned evidence ledger is needed for stronger provenance.

## 12. Descriptive calculations

For eligible continuous values in each period: count, arithmetic mean, numeric median, minimum and maximum. Absolute change is intervention mean minus baseline mean. Relative percent change is `100 * absoluteChange / abs(baselineMean)`; zero baseline yields null with an explicit limitation. Nonfinite calculated changes block facts. No normalization across differing units occurs.

Ordinal summaries contain count, frequency distribution, and central lower/upper observed ranks. Even-sized samples retain both ranks rather than averaging ordinal codes. Neutral movement is higher/lower only when the median rank intervals do not overlap; identical intervals are unchanged; other overlaps are indeterminate. Ordinal absolute/relative arithmetic differences are null.

Rate difference, rate ratio and trend are explicitly null in this version. Null is not zero or evidence of no association.

## 13. Direction logic

`expected_direction` predicts movement; it does not establish what is desirable. Only an explicit frozen `change` success criterion supplies higher/lower desirability in v1. A target-value criterion is not treated as globally monotonic desirability. Otherwise, neutral movement and numeric facts are retained while direction is indeterminate.

Known desirable movement maps to improved, opposite movement to worsened, exact equality to little_change. The latter means exact descriptive equality, not clinical equivalence. The result does not claim the configured success amount was achieved; criterion threshold assessment is not implemented. Ordinal direction can remain indeterminate even when its distribution differs.

## 14. Interpretation tiers

Only `descriptive` and `indeterminate` are emitted. Ready facts receive descriptive; all withheld facts receive indeterminate. A descriptive tier does not imply statistical reliability, clinical benefit, or causal identification. No suggestive tier or quantity-derived strength score exists.

## 15. Statistical methods used

Only descriptive arithmetic/rank summaries and differences are implemented. The mean and numeric median follow standard location definitions; ordinal rank intervals intentionally avoid equal-distance assumptions. See [NIST measures of location](https://www.itl.nist.gov/div898/handbook/eda/section3/eda351.htm) for the underlying continuous summary definitions. The sample floor, eligibility gates and rank-interval movement rule are explicit product policies, not NIST recommendations or validated clinical methods.

No p-values, significance tests, confidence/credible intervals, regression, adaptive stopping, causal models or treatment recommendations were added. There is no adjustment for serial dependence, secular trends, seasonality, concurrent interventions, measurement error or regression to the mean.

## 16. API/security behavior

`buildExperimentAnalysis(client, experimentId, serverClock?)` validates UUID, verifies authentication, and loads only owned model-v2 experiments and Start snapshots. It derives outcome/source/dates/timezone/criteria from frozen configuration. Existing readers enforce their owner boundaries, row caps and ten-second query timeouts. The service has no write path and no service-role bypass. Foreign/missing experiments share the existing 404 behavior; failures do not expose database details.

No HTTP route was added, so no new public budget/cache/CSRF boundary is claimed. Before HTTP exposure, add exact validation, private/no-store responses, registered API budget, safe public DTO projection and no owner/date/cutoff/criteria overrides. Never return the internal input bundle directly. The injected clock is for trusted server tests, not user-controlled as-of analysis.

## 17. Minimal results UX

No new UI. The private server bundle and focused fixtures validate the contract. There are no client-side scientific calculations or new efficacy labels. Existing study-health UI and v1 results routes were left unchanged. Polished results storytelling was not begun.

## 18. Tests added

29 focused tests cover ready analysis; insufficient baseline/intervention; unknown exposure; failed/truncated reads; pause, source, revision, definition, target, date and window integrity; unsupported baseline/lifecycle/count/binary/pre-post/weight; continuous and ordinal summaries; zero baseline; missing nutrition; non-adherent inclusion; desirability; digest replay/detachment; unfinished cutoff; conservative tier vocabulary; server-only boundaries; authentication/ownership; safe errors; successful acquisition through actual adapters with mocked database transport; lifecycle race; and contradictory same-nutrient captures.

The existing broader suite continues to exercise real local PGlite security, Start freezing, owner isolation and observation SQL. The new service tests do not claim live Supabase integration.

## 19. Validation results

Final post-review validation on 2026-08-28:

- Focused analysis tests: **29/29 passed**.
- Full suite: **453/453 passed**, no failures/skips (about 54 seconds).
- `npm run typecheck`: passed.
- `npm run lint`: passed, no findings.
- `npm run build`: passed; 60 pages generated, existing route inventory unchanged.
- `git diff --check`: passed. New untracked files were additionally checked with `git diff --no-index --check` against an empty file; no whitespace errors.

Node emits the repository's existing module-type warning during strip-types tests. Git may warn about future LF-to-CRLF conversion; neither is a test failure. No dependency, framework, route or migration changes were needed.

## 20. Migrations created/applied

None. No schema changes, remote migrations, result persistence or production data mutations. Local PGlite tests apply existing migrations only inside their disposable test database.

## 21. Staging verification

Not performed. No verified staging project or controlled staging user was provided. A local environment file is not proof of a staging target; no production/user data was used to manufacture evidence.

Before release: in an explicitly designated staging environment, verify an owned frozen numeric nutrition target with a historical baseline and closed intervention, complete source days, replay equality, a missing day, an unknown exposure day, a pause event, foreign-owner denial, and a lifecycle change during capture. Keep the bundle private and delete controlled fixtures through normal owned cleanup.

## 22. Known scientific limitations

This is a selected complete-case, nonrandomized within-person period comparison. It cannot distinguish intervention effects from time, confounding, expectations, altered logging, or spontaneous variation. Five points can be highly unstable. Missingness can be informative. Self-reported exposure and nutrition logging do not prove actual execution or intake. Historical habit rule execution, workout prescription verification, symptom surveillance, assessment-point provenance, pause-adjusted windows and terminal phase reconciliation remain unresolved. Replaying captured inputs is not immutable historical database reconstruction.

## 23. Recommended next sprint

Prioritize terminal/early-end lifecycle and pause-window contracts plus durable, transactionally coherent evidence capture before expanding eligibility. Add authoritative event surveillance and performance assessment-point contracts before rates or pre/post effects. Then expose a narrowly projected, authenticated/budgeted results API and a minimal contract-driven display. Validate desirability and meaningful-change metadata before stronger direction labels. Do not infer that this foundation authorizes polished efficacy storytelling or advanced inference.
