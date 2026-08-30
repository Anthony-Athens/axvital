# Sprint 13A.14 — Results UX v2: What Happened?

## 1. Implementation summary

The v2 Results page now leads with the observed primary movement, authoritative difference, period averages or ordinal ranks, and a concise frozen experiment summary. Adherence, measurement details, design context, descriptive reliability, limitations, and revision history follow in a progressive consumer hierarchy. Scientific analysis and durable-capture policies were not changed.

## 2. Files changed

- `components/experiments/ResultsView.tsx`
- `lib/experiments/results-display.ts`
- `lib/experiments/results-copy.ts`
- `lib/experiments/results-response.ts`
- `lib/experiments/results-display.test.ts`
- `lib/experiments/results.test.ts`
- `lib/experiments/results-hydrated.test.ts`
- `lib/experiments/testing/results-fixture.ts`
- `scripts/results-browser.mjs`
- `docs/sprint-13a14-results-what-happened.md`

## 3. Results information architecture

The default order is frozen experiment name/question, primary result hero, What you tested, adherence, measurement details, tracked summary, design, How reliable is this result?, limitations, and explicit new-analysis generation. Revision history is moved into a native disclosure. No placeholder confounder or next-step recommendations are shown.

## 4. Primary-result presentation

Ready continuous results show the outcome plus neutral server direction, authoritative absolute difference, and baseline/experiment averages. Exact equality alone becomes “was unchanged”; no client meaningful-change threshold exists. Improved/worsened appears only as an additional statement when the server explicitly returns supported desirability.

## 5. Experiment-summary presentation

What you tested shows the frozen change label, measured outcome, planned experiment days, and historical starting-point days. The retained experiment name and question are used where display v2 is available; older revisions fall back safely without regenerating from mutable sources.

## 6. Adherence presentation

The page shows a percentage, `adherent of eligible opportunities`, known non-adherent count, and unknown count. It explains that the analysis summarizes the experiment as it occurred, including known non-adherent days, and never describes unknown opportunities as failures.

## 7. Adherence percentage semantics

The presentation utility derives `adherent / eligible` only when both server-projected values are authoritative and eligible is greater than zero. It rounds to a whole display percentage and always shows the underlying counts. Zero or unknown denominators produce explanatory text and no percentage. This is a presentation ratio, not an analysis score.

## 8. Continuous outcome presentation

The main layer emphasizes absolute difference and two averages. A native “View measurement details” disclosure contains median, range, usable counts, and relative difference when the server returns one. React performs formatting only; it does not recompute scientific facts.

## 9. Body Weight presentation

Verified Body Weight v2 renders as `Body Weight decreased`, an authoritative negative kg difference, and baseline/experiment kg averages. The unit comes from retained verified display metadata; there is no locale conversion or inferred pounds display.

## 10. Ordinal presentation

Ordinal results show the starting-point and experiment central rank intervals and neutral movement. The detail disclosure retains the complete server distribution. No mean, relative percentage, or arithmetic average of ordinal codes is introduced.

## 11. Tracked-measure summary

Tracked during this experiment lists primary-outcome observations in each period and authoritative eligible change opportunities. It does not scan other AXVital data, calculate secondary associations, or imply influence.

## 12. Design summary

The display contract exposes allowlisted historical days, planned days, reconciled active days, excluded-day count, and frozen logical date bounds. The UI prioritizes day counts and does not expose lifecycle events, time-zone mechanics, policy versions, or raw configuration.

## 13. Early-end behavior

Ended-early results receive a distinct callout showing planned versus completed eligible days and the existing server limitation. The observed result remains visible but is not styled as equivalent to normal completion.

## 14. Pause behavior

When the retained result includes the reconciled-pause limitation, the page explicitly says pause-touched days were excluded from outcomes and adherence and were not counted as not followed or missing. Raw transitions are never exposed.

## 15. Reliability-summary behavior

The first-pass section keeps change tracking, outcome data, and analysis status separate. It reports followed/not-followed/unknown counts, observed versus expected measurements, and Descriptive or Indeterminate status. It explicitly states that this is data completeness, not statistical confidence.

## 16. Interpretation language

Movement copy says higher, lower, exactly equal, or indeterminate. It states that the result is a descriptive period comparison and that statistical reliability and causal certainty are not established. It never says worked, effective, caused, proven, clinically significant, or statistically significant.

## 17. Eligibility-state copy

Ready shows the result. Insufficient data becomes “Not enough usable data.” Unable to determine explains that AXVital could not verify enough experiment data. Unsupported design says the result type is not supported yet. Integrity blocking says historical information could not be reconciled safely. Duplicate reason codes from baseline/intervention scopes are presented once without dropping distinct limitations.

## 18. Revision-history behavior

The newest retained revision remains selected by default. History is available under “View previous analyses” with capture dates and eligibility. Selecting history updates the URL, labels the view as historical, clears stale facts during loading, and focuses the new result heading. A newer indeterminate revision is never replaced by an older ready result.

## 19. Limitation presentation

All returned codes are preserved and grouped as Data, Experiment, or Interpretation limitations. Unknown future codes remain visible through the existing readable fallback. The limitations disclosure is open by default; early-end and pause limits are also surfaced in design context.

## 20. Mobile/accessibility

Rendered verification passed at 320 × 700, 390 × 760, 768 × 900, and 1280 × 900 with no horizontal overflow. The layout uses stacked cards instead of a horizontal result table. Headings define semantic regions, the result heading receives focus, native disclosures/selects remain accessible, percentage text has count equivalents, and states are not color-only. No browser warnings were observed.

## 21. Public DTO changes

`ResultsDisplay` is additively versioned from v1 to v2. V2 allowlists frozen experiment name, question, intervention label, outcome display metadata, and concise design day/date values derived during durable replay. It exposes no IDs, source objects, raw observations, opportunity lists, transition events, evidence text, digest, or frozen JSON. Display-less v1 and unknown future versions retain safe fallbacks.

## 22. Analytics/instrumentation changes or proposed event taxonomy

No instrumentation was added because this results sprint should not broaden analytics work. Proposed future allowlisted events are `experiment_wizard_started`, `experiment_wizard_step_viewed` with a bounded step enum, `experiment_wizard_completed`, and `experiment_results_viewed` with only eligibility and whether the newest/historical revision is displayed. Do not include experiment names, questions, outcome values, intervention values, IDs, or health data.

## 23. Tests added

Focused coverage includes display-v2 validation and old-contract fallback, continuous hero facts, verified-kg Body Weight, neutral movement/desirability behavior, ordinal rank/distribution behavior, full and partial adherence, unknown exposure, zero denominator, normal/early/pause design, all eligibility states, grouped limitation preservation, explicit generation, revision selection, stale-read protection, uncertain capture reconciliation, and v1 routing regression.

## 24. Validation results

- Focused results suite: 43 passed
- Full repository suite: 549 passed
- TypeScript: passed
- ESLint: passed
- Production build: passed
- `git diff --check`: passed

The repository's existing Node module-type warnings remain non-failing.

## 25. Browser verification

The real hydrated component harness used DTOs produced through durable replay. Verified scenarios: Protein 15 & Body Weight, ordinal Sleep quality, full and partial adherence, unknown exposure, early end with pause, insufficient data, unable to determine, unsupported design, integrity block, empty/no-capture, and explicit historical revision selection. The Body Weight hero showed verified kg values and restrained noncausal copy. Four responsive widths and console output were checked.

## 26. Migrations created/applied — expected none

No migration was created or applied. The work is an additive safe display projection, centralized copy, React presentation, and test/browser infrastructure.

## 27. Linked-environment verification

No linked environment was modified or queried. Tests and browser checks used synthetic durable captures and a disposable loopback harness; no user records or remote state were involved.

## 28. Unresolved results UX gaps

The page intentionally has no statistical reliability method, uncertainty interval, causal model, confounder scan, secondary-outcome analysis, or next-experiment recommendation. Generic older display-v1 revisions cannot show frozen experiment/change/design labels that were not present in that contract. Pause-specific day count is not separately claimed when the retained contract only proves total excluded days.

## 29. Recommended next sprint

Define an authoritative statistical/reliability contract before adding confidence language or visual scoring. Keep exposure completeness, outcome completeness, and statistical uncertainty separate. Confounder or next-step work should remain a later contract-first sprint and must not reinterpret these retained descriptive revisions.
