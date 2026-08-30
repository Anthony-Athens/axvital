# Sprint 13A.13 — Experiment Wizard Simplification

## 1. Implementation summary

The v2 wizard now starts with consumer intent, recommends a practical design, checks existing data automatically, and ends with a concise confirmation. Existing experiment contracts, source adapters, readiness authority, snapshot behavior, revision safety, Premium gates, and v1 behavior remain unchanged.

## 2. Files changed

- `components/experiments/ExperimentWizard.tsx`
- `components/experiments/ReadinessCard.tsx`
- `lib/experiments/discovery.ts`
- `lib/experiments/wizard-client.ts`
- `lib/experiments/api.test.ts`
- `lib/experiments/wizard.test.ts`
- `lib/nutrition/goals-ui.test.ts`
- `scripts/goals-browser.mjs`
- `docs/sprint-13a13-wizard-simplification.md`

## 3. Goal taxonomy changes

The user-facing groups are Lose Weight / Improve Body Composition, Improve Sleep, Improve Fitness / Performance, Improve Nutrition, Manage a Condition or Symptoms, Improve Mood / Energy, and Other. Condition and symptom registry entries retain their internal identities but map to one intent group. Discovery tests assert that merging the presentation loses no outcomes.

## 4. Outcome availability behavior

Discovery now returns an explicit server-derived `analysisAvailable` property. The wizard translates it into Available, Trackable but experiment analysis is not supported yet, or Unavailable. Unsupported-but-trackable entries remain visible and explained, but cannot advance to Start. Client code does not reproduce readiness calculations.

## 5. Body Weight behavior

Body Weight is the prominent outcome for the weight/body-composition goal. Its copy says AXVital can compare entries whose units are verified. Readiness translates good, insufficient, ambiguous-unit, and incomplete-read states into user language while retaining all server classifications and warnings.

## 6. Change-step behavior

The step is titled “What do you want to try?” and exposes Habit, Protocol, Nutrition Goal, Eating Pattern, and Workout Plan. These labels map to the existing authoritative intervention types. Eating Pattern remains discoverable but clearly blocked because adherence analysis is not supported.

## 7. Nutrition Goal create/select regression

Existing compatible goals remain searchable. Inline creation preserves prior wizard choices, adopts and selects the authoritative created ID, refreshes the picker, and restores heading focus. Hydrated tests cover creation, stale picker responses, selection, and progression to Review.

## 8. Generated naming

New experiments receive a short `Change & Outcome` title when both selections are known, for example `Protein 180 & Body Weight`. The 120-character backend bound is retained. A user edit disables automatic naming; loaded drafts are never renamed.

## 9. Generated question

The question is independently generated as “What changes in my [outcome] when I try [change]?” with an optional measurement target. It remains editable under customization and is not treated as the list title or a claim of causation.

## 10. Design recommendation behavior

Versioned product policy v1 recommends 28 days for supported daily repeated outcomes with readiness support and 14 days otherwise. The UI explicitly describes this as product policy, not statistical optimization. Existing 1–366 day validation and start-today contract remain authoritative.

## 11. Baseline/readiness language

The routine card is “Your existing data.” Its states are Ready, More data recommended, Unable to verify recent weight entries, and Unable to check your existing data. Warnings preserve missingness, event-surveillance, nutrition, workout-estimate, and causal limitations without exposing registry, adapter, provenance, or classification terminology.

## 12. Automatic refresh behavior

Readiness runs once, after a 250 ms one-shot debounce, when Design is reached with a complete supported historical design. A stable readiness key prevents a redundant Review request. Relevant input changes immediately hide prior results, increment a generation, and abort the obsolete request. Late successes cannot replace newer state. Failed/incomplete reads expose Check again; there is no polling loop.

## 13. Customize/advanced behavior

The recommended duration, starting-point approach, and generated name stay visible. Baseline mode and dates, experiment dates/duration, time zone, and question are grouped in a native “Customize dates, time zone and question” disclosure. Readiness warnings remain outside the disclosure.

## 14. Review redesign

Review shows the experiment title followed by intent, selected change, measurement, starting-point state, period, and question. It omits the previous flat repetition of implementation fields. Edit goal, outcome, change, and design buttons return directly to the appropriate step without clearing draft state.

## 15. Scientific limitation copy

Review states that AXVital compares observations before and during the experiment, can identify patterns and differences, and may not prove causation. Duration copy avoids power/sample-size claims. Source-specific readiness limitations remain visible.

## 16. Mobile/accessibility findings

Rendered checks passed at 320 × 700, 390 × 760, 768 × 900, and 1280 × 900 with no horizontal overflow. Actions wrap at 320 px and remain inside the viewport. Cards and long unsupported explanations wrap. Native radio, select, input, details, and button semantics are retained; step headings receive focus; errors remain associated with the fieldset; readiness uses live/status text rather than color alone. No browser warnings were observed.

## 17. Existing-draft compatibility

No stored fields or registry identities changed. Existing v2 drafts restore their exact name, question, dates, secondary outcomes, success criteria, and authoritative target identities; automatic naming is disabled on restore. Existing v1 detail and mutation paths were not modified.

## 18. Save/Start regression

Save remains revisioned and HTTP-only with duplicate-click protection, authoritative ID/revision adoption, conflict freezing, and uncertain-response lockout. Start remains explicit, requires a saved current revision and current readiness preview, and delegates lifecycle validation to the server. Premium behavior is unchanged.

## 19. Tests added

Focused coverage now includes the merged intent group and lossless mapping, policy duration, generated title/question, availability translation, Body Weight readiness wording, automatic-readiness fixture behavior, concise Review content, inline Nutrition Goal preservation, Check again language, stale request protection, and existing Save/Start/v1/v2 regressions.

## 20. Validation results

- Focused wizard/hydrated UI suite: 34 passed
- TypeScript: passed
- ESLint: passed with no findings
- Full repository suite: 547 passed
- Production build: passed
- `git diff --check`: passed

The test runner continues to print the repository's existing Node module-type warnings; they do not fail validation.

## 21. Browser verification

The disposable real-component harness exercised the flagship flow: Lose Weight / Improve Body Composition → Body Weight → inline Protein 180 Nutrition Goal → 28-day recommended design → automatic Ready status → concise `Protein 180 & Body Weight` Review. It also verified the merged Condition/Symptom group and visible unsupported-analysis explanations. Four responsive widths had equal document client and scroll widths and no console warnings.

## 22. Migrations created/applied — expected none

No migration was created or applied. The change is discovery metadata, policy, presentation, and client orchestration only.

## 23. Linked-environment verification

No linked environment was modified or queried. Validation used repository tests and a disposable local synthetic database; no user health records or remote state were involved.

## 24. Unresolved UX issues

Condition, symptom, Eating Pattern, and performance-assessment concepts remain intentionally visible but unavailable for experiment analysis until their backend analysis/adherence families exist. Freeform changes remain unsupported. These are platform capability limits, not hidden wizard defects.

## 25. Recommended next sprint

Measure completion and abandonment across the five existing steps, then refine recommendation explanations using observed usability evidence. Any new outcome or intervention support should begin with authoritative evidence/analysis contracts; do not start a Results UX v2 redesign from this sprint.
