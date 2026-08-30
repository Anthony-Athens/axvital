# Sprint 13A.15 — Statistical Reliability & Uncertainty

## 1. Implementation summary

Experiments 2.0 now derives a versioned statistical-uncertainty result during deterministic durable-capture replay. It is deliberately separate from descriptive change, outcome completeness, intervention adherence, and causal certainty.

## 2. Files changed

- `lib/experiments/reliability.ts`: reliability policy, method registry, bounded deterministic estimator, and contract.
- `lib/experiments/analysis-contract.ts` and `analysis.ts`: ordered inputs and replay integration.
- `lib/experiments/durable-evidence.ts` and `results-response.ts`: safe DTO projection and strict validation.
- `lib/experiments/results-copy.ts` and `components/experiments/ResultsView.tsx`: consumer wording and presentation.
- `lib/experiments/reliability.test.ts`, `results-display.test.ts`, and `testing/results-fixture.ts`: statistical, DTO, replay-fixture, pause, and UI-scenario coverage.
- `AGENTS.md`: Next.js 16.3.3 regenerated its maintained agent-guidance block during the required development-server verification.

## 3. Reliability concepts

The product distinguishes four concepts: outcome data quality, exposure/adherence quality, statistical uncertainty around the measured period difference, and causal certainty. Only the first three are described; causal certainty is never inferred.

## 4. Selected statistical method

Version 1 uses a 2,000-replicate circular moving-block bootstrap. Starting-point and intervention measurements are separately resampled in ordered blocks, and each replicate records intervention mean minus baseline mean. The 2.5th and 97.5th percentiles form a 95% interval.

## 5. Method rationale

A naive independent-samples t-test would treat daily records as independent. Moving blocks retain some local serial dependence while remaining deterministic, bounded, explainable, and appropriate for the existing short repeated-measurement contract. This is an uncertainty estimate for period separation, not a causal effect estimator.

## 6. Supported outcome families

Version 1 supports registry-authorized `repeated_continuous` outcomes, including verified Body Weight and supported daily nutrition averages.

## 7. Unsupported families

Repeated ordinal, count/frequency, pre/post performance, unsupported cadences, and unsupported designs return an explicit unsupported-method result. Descriptive results remain visible when otherwise eligible.

## 8. Sample-size policy

Statistical inference requires at least 10 usable observations in each period. This is separate from the existing descriptive floor of five and is not presented as a power calculation or confidence score.

## 9. Time-order handling

Eligible observations are explicitly sorted by logical date before inference. Dates must be strictly increasing within each period; duplicates and invalid ordering fail closed.

## 10. Serial-correlation handling

Each period uses circular moving blocks of length `ceil(sqrt(n))`, with a minimum of two. This partially represents adjacent-day dependence but does not fully model every autocorrelation structure.

## 11. Trend handling

Version 1 does not detrend or adjust for baseline drift. `BASELINE_TREND_NOT_ADJUSTED` is always disclosed for a supported interval.

## 12. Missing-data handling

No values are imputed and missing days are never treated as zero. Reliability is unavailable when more than 40% of expected observations are missing in either period. Complete-case selection remains an explicit limitation.

## 13. Exposure handling

Adherence is reported separately and is not used to filter outcome observations. All usable eligible active days remain in the estimator, including non-adherent days. This prevents an adherent-only post-treatment comparison.

## 14. Body Weight behavior

Verified canonical daily weight observations use the same repeated-continuous method and retained unit. Records excluded by the existing provenance contract continue to block the descriptive analysis and therefore cannot reach reliability estimation.

## 15. Interval behavior

The DTO returns the observed mean difference and a 95% percentile interval. An interval wholly above or below zero is labeled “Clearer evidence of a difference.” An interval containing zero is labeled “Uncertain difference,” with explicit wording that this is not proof of no change or failure.

## 16. Null-reference behavior

Zero is the sole version-1 null reference because the estimand is intervention-period mean minus baseline-period mean. It is exposed explicitly as `nullReference: 0` only for supported estimates.

## 17. P-value behavior

No p-value is computed or displayed. The product does not use statistical-significance wording.

## 18. Success-criterion interaction

Frozen success criteria may support the existing descriptive direction label. They do not change the estimator, interval, null reference, or reliability classification.

## 19. Early-end behavior

Early-ended experiments keep their descriptive comparison when eligible, but version 1 returns `EARLY_END_RELIABILITY_UNSUPPORTED_V1` because stopping may be outcome-related.

## 20. Pause behavior

The estimator consumes the same reconciled active-date population as descriptive outcomes and exposure. Every date touched by a pause is excluded; pauses do not extend the planned end.

## 21. Deterministic replay

The pseudo-random seed is derived from SHA-256 of the captured analysis digest and method identifier. The same retained evidence and versions reproduce exactly the same estimate and interval without current-source reads.

## 22. Versioning

The reliability contract, method, and policy are explicitly version 1. The family-indexed method registry is independent of the analysis-policy version, allowing future method additions without silently changing retained behavior.

## 23. Public DTO changes

The safe result DTO adds `reliability`: versions, status, method identifier, estimate, interval, zero reference, comparison state, bounded sample metadata, and controlled assumption/limitation codes. Raw observations, dates, seeds, digests, source IDs, and exposure opportunities remain private.

## 24. Results UX behavior

“How reliable is this result?” now separates Change tracking, Outcome data, and Statistical uncertainty. Supported estimates show the difference and interval; insufficient and unsupported states explain why without hiding the descriptive result. Method details are in an accessible disclosure.

## 25. Assumptions and limitations

The contract discloses ordered within-period observations, separate period resampling, inclusion of all eligible observed days, partial serial-correlation modeling, no trend adjustment, complete-case selection, and no causal identification.

## 26. Computational bounds

Each period is capped at 366 observations, the bootstrap is fixed at 2,000 replicates, DTO code arrays are bounded, and public result revisions retain their existing bounds. Work is linear in replicates times observations, followed by a bounded replicate sort.

## 27. Tests added

Tests cover deterministic replay, separated and zero-crossing intervals, exact/no-clear differences, the independent sample floor, missingness, invalid ordering, ordinal and early-end support boundaries, serial/trend/causal disclosures, parser rejection, safe projection, Body Weight, pause-active populations, and consumer state wording.

## 28. Validation results

Validation passed: ESLint, TypeScript, production build, `git diff --check`, focused reliability/results tests, and the full 555-test suite. The full suite required its normal unsandboxed filesystem access for two esbuild-based UI harnesses; all 555 tests then passed.

## 29. Browser verification

Engine-produced durable fixtures covered Body Weight clearer difference, Body Weight uncertain difference, insufficient statistical data with a visible descriptive result, ordinal unsupported reliability, early end, and completed study with a reconciled pause. All six were checked at 320 px, 390 px, and 1280 px with no horizontal overflow. The uncertainty disclosure opened correctly and exposed the method, sample counts, assumptions, and limitations.

## 30. Migrations created/applied

None. Reliability is a derived, versioned replay result over the existing immutable durable capture; no second persistence path or confidence-text column was added.

## 31. Linked-environment verification

No linked database migration is required or applied. Existing linked-environment behavior is covered by the unchanged durable-capture and authenticated results integration suite.

## 32. Unresolved statistical limitations

Version 1 does not fully model long-memory autocorrelation, seasonality, secular trend, informative missingness, informative stopping, measurement error, multiple outcomes, confounding, or clinical importance. The short-series block-length rule is a transparent policy choice, not universally optimal.

## 33. Recommended next sprint

Validate interval calibration and block-length policy against predeclared synthetic time-series simulations and anonymized aggregate shape distributions, then consider a separately versioned trend-aware repeated-continuous method. Do not add confounder scanning or intervention recommendations as part of that work.
