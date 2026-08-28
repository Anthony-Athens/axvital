# Sprint 13A.9 — Results API & Minimal Contract-Driven Results Experience

## 1. Implementation summary

Added authenticated, owner-scoped v2 results reads, explicit capture creation, bounded revision discovery, and a text-first results destination. The UI consumes the durable public contract without recomputing analysis. Existing v1 routing/controls remain unchanged. No capture occurs on GET, render, mount, refresh, or revision selection.

## 2. Files changed

- Added `app/api/experiments/v2/results/route.ts` and `results/revisions/route.ts`.
- Added `lib/experiments/results-api.ts`, `results-service.ts`, `results-client.ts`, `results-copy.ts`, and `results.test.ts`.
- Added `components/experiments/ExperimentResults.tsx` and `ResultsView.tsx`.
- Updated `components/experiments/ExperimentV2Status.tsx` to route terminal v2 records into results.
- Updated `lib/api/validation.ts` with exact results query/body allowlists.
- Updated the existing Sprint 13A.8 `captureDurableAnalysis` error projection to distinguish known conflicts from uncertain mutation outcomes.
- Added this handoff. Earlier dirty Sprint 13A.8 analysis, lifecycle, evidence, test, documentation, and migration files were preserved; they are not newly introduced schema work for this sprint.

## 3. Required durable-evidence schema presence

Requires the separately managed Sprint 13A.8 infrastructure: `experiment_evidence_captures`, its owner RLS and immutability trigger, `capture_experiment_evidence_v1`, internal `axvital_experiment_capture_input`, and authoritative `transition_experiment_v2` history. Existing start snapshots and experiment phase events are also required. Repository definitions and disposable database tests were inspected/run. Presence in a linked deployment was not verified. Missing objects fail safely rather than triggering schema changes.

## 4. Results read API

`GET /api/experiments/v2/results?id=<uuid>&revision=<1..32>` requires a specific canonical positive integer revision. Unknown/duplicate query parameters, foreign ownership, and v1 records are rejected. The handler delegates to `readDurableAnalysis` and returns only its existing public DTO. It never returns observations, source IDs, frozen definitions, opportunity artifacts, evidence text, or digest. Missing revisions return 404; failed infrastructure returns a safe error.

## 5. Capture mutation API

`POST /api/experiments/v2/results` accepts only `id`, `expectedAnalysisRevision` (0–31), and `expectedLifecycleRevision` (0–100). Server ownership/model/lifecycle checks precede the existing capture service/RPC. Only completed or early-ended studies may attempt capture. The RPC remains authoritative for supported frozen configuration, concurrency, and immutable revision allocation. Success returns HTTP 201 and the safe DTO for the allocated revision, not the private capture.

## 6. API security and budgets

Reuses the authenticated application boundary, same-origin mutation checks, bounded body validation, and private/no-store responses. Rejected experiment attempts also consume budget. Read and discovery share the already registered `http/experiments/draft:GET` budget (30/minute); capture shares `http/experiments/start:POST` (6/minute). These aliases are server-selected, never request-controlled. This intentionally shares existing capacity rather than adding unregistered route keys or changing SQL. Budget denial returns 429 with Retry-After. Route max duration is 60 seconds; database data reads/capture RPC use 10-second abort signals; revision count, replay input size, and page size are bounded. Authentication and shared budget execution retain the existing boundary behavior.

Retained reads do not require Premium, including after downgrade. Capture preserves the existing Sprint 13A.8 owner-authorized policy rather than adding a new paywall. Premium authoring/Start behavior is unchanged.

## 7. Revision discovery

`GET /api/experiments/v2/results/revisions?id=<uuid>&before=<optional 1..33>` returns descending metadata pages of four revisions. Metadata contains revision, timestamp, policy version, replayed contract version, and eligibility. Contract version is null when an integrity failure prevents replay; it is not inferred from policy version. No more than 32 retained revisions are accepted. Discovery additionally returns explicitly projected experiment header/end dates, latest/lifecycle revision, and server-derived capture availability/reason. It does not return frozen configuration or raw events. At most four private captures are replayed per request to determine eligibility.

## 8. No-capture state

Terminal studies with no retained revision explain that results have not been captured and that an explicit action retains currently available evidence. Generate Results appears only when discovery considers capture potentially meaningful. It warns that capture success does not guarantee analyzable facts. Unsupported preparation displays its reason without invoking capture.

## 9. Eligibility-state presentation

Ready, Insufficient data, Unable to determine, Unsupported design, and Blocked by integrity have distinct text and structured reason copy. Facts are displayed only for ready results. Read/infrastructure failures use an alert and do not preserve stale facts under a newly requested revision. Corrupt artifacts that cannot be replayed remain explicit API failures; discovery labels their metadata integrity-blocked rather than substituting another revision.

## 10. Continuous result presentation

Displays server-provided counts, means, medians, ranges, absolute difference, and relative difference where returned. Neutral movement is taken directly from the contract. Formatting changes numeric display precision only; no new statistic, denominator, unit conversion, significance, or effect calculation is performed. The existing public facts contract has no display-unit field; this sprint does not infer units from question text.

## 11. Ordinal result presentation

Displays rank distributions and the two returned central ranks without averaging rank codes. Uses server direction/desirability classifications. Does not invent percentage differences or continuous-scale interpretations for ordinal data.

## 12. Exposure-quality presentation

Separate section shows eligible, adherent, non-adherent, and unknown opportunities plus evidence completeness and source integrity. Unknown is never converted to zero or non-adherent. No combined Study Quality score is introduced.

## 13. Outcome-quality presentation

Separate baseline/intervention sections show usable observations, expected observations, missing observations, and read completeness. Null denominators/missing counts display Unknown. Logging coverage explicitly does not prove measurement accuracy or complete intake. Selective complete-case limitations remain visible.

## 14. Interpretation language

Displays the authoritative Descriptive or Indeterminate tier and explains that summaries do not establish causation. Higher/lower/unchanged uses returned neutral movement. Improved/worsened appears only when returned by the server's desirability classification. No efficacy, significance, confidence-strength, or medical recommendations are generated.

## 15. Limitations presentation

Dedicated readable list maps existing scientific/lifecycle/evidence codes to user-facing text. All returned limitations remain visible. Future unmapped codes receive a readable space-separated fallback rather than being discarded. No AI narrative or cherry-picked summary is introduced.

## 16. Early-end behavior

Early-ended studies show actual end separately from frozen planned end and warn that stopping may relate to the outcome. `EARLY_END_MAY_BE_INFORMATIVE` is also rendered when present in retained results. Shortened studies are not presented as equivalent to planned completion.

## 17. Pause behavior

`PAUSE_TOUCHED_DAYS_EXCLUDED` explains that reconciled pause dates were excluded from outcomes and exposure, not marked non-adherent. Whole-day/boundary and planned-end limitations are also mapped. No raw lifecycle metadata or invented excluded-day count reaches the UI.

## 18. Revision selection and history

Default entry selects the newest retained revision, regardless of eligibility. A valid `?revision=` deep link selects that exact revision. Native labeled selection exposes dates/status; older metadata can be loaded explicitly. Historical selection is visibly identified and the copy states that newer does not mean stronger. Selection clears facts immediately, aborts obsolete reads, guards response generations, and never falls back to an older ready result. Successful selection updates the URL and focuses the analysis heading.

## 19. Mutation conflict and uncertainty handling

A synchronous ref lock prevents duplicate clicks before React state updates. The action sends one POST. Success loads its authoritative returned revision. Known conflicts are displayed and followed by read-only revision/lifecycle reconciliation. Unknown RPC/transport failures are projected as uncertain; a GET confirms whether a newer revision exists. If none is confirmed, the action remains locked and only Refresh capture status is offered. There is no automatic mutation retry. Unmount invalidates reads and prevents a late mutation response from launching a new read/navigation. Different-revision failures never display the old result as the requested revision.

## 20. Mobile and accessibility findings

Used the browser skill to inspect the actual server-rendered ResultsView with synthetic public DTOs and production CSS in a temporary, isolated local preview. At 320px and 390px, document width stayed within viewport and quality/period sections stacked; at 1024px they used two columns. Inspected ready/historical/early-end/pause and no-capture presentations. Native revision control has an accessible label; headings and textual states are present. Loading/notice uses status, failure uses alert, and successful revision reads target a focusable analysis heading. No charts or color-only states.

The preview was not hydrated and made no authenticated application requests. Live controller keyboard/focus behavior and signed-in mutation interaction were not browser-tested. Automated render, request-state, and source integration checks cover those boundaries only partially. The temporary preview file/server were removed/stopped and browser viewport restored.

## 21. Tests added

20 focused tests cover authenticated owner/v1 isolation, strict revision/query validation, missing captures, safe ready/insufficient/unavailable/integrity DTOs, no private leakage, cache headers, budgets, bounded discovery, initial/next capture, origin/body/state rejection, stale analysis/lifecycle revisions, uncertain outcomes, immediate duplicate locking, stale read tokens, uncertainty reconciliation, no-capture rendering, all five eligibility presentations, continuous/ordinal facts, unknown values, separate qualities, limitations, early end, pause disclosure, historical selection, and no automatic capture. Tests render the real view. Controller source checks are explicitly not a substitute for hydrated end-to-end tests.

## 22. Validation results

- Focused results tests: 20 passed.
- Full repository suite: 492 passed, zero failed/skipped; includes existing disposable database suites.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; both new dynamic API routes registered.
- `git diff --check`: passed (only existing Windows LF/CRLF conversion notices).

Node emits the repository's existing module-type warnings; expected safe failure logs occur in negative API tests. Neither indicates a test failure.

## 23. Environment/integration verification performed

Ran local mocked HTTP/domain tests, existing disposable PGlite database suites, production compilation, and isolated synthetic browser rendering. No linked staging/production schema query or authenticated end-to-end capture was performed: an explicitly verified deployment and disposable user fixture were not available for this task. Therefore deployment schema presence and live grants/PostgREST behavior remain an integration verification prerequisite. Do not assume a successful build proves deployed migration presence. Missing infrastructure has safe 503 handling and focused test coverage.

## 24. Migrations created/applied

None created, modified, or applied to a linked environment in Sprint 13A.9. The pre-existing Sprint 13A.8 migration remains untouched for separate owner deployment. Local disposable test harnesses applied existing repository migrations as part of normal tests, as permitted. No production/staging records were created or changed.

## 25. Remaining unsupported results

No event-rate/surveillance analysis, formal pre/post workout analysis, protocol/pattern/workout execution verification, unresolved weight provenance/units, advanced statistical analysis, causal identification, or efficacy narrative. Capture supports only the existing durable frozen historical-baseline/nutrition-target design and supported check-in/nutrition outcomes. Scientific limitations remain those of the existing server policies. Artifact corruption fails closed. Large histories require paged reads sharing the existing read budget.

## 26. Recommended next sprint

After the owner separately verifies durable schema deployment, run an authenticated disposable-fixture integration pass covering initial/next capture, owner isolation, downgrade reads, conflict/timeout reconciliation, and keyboard/mobile revision navigation. Consider a separately versioned safe display-label/unit contract and hydrated controller regression harness before richer presentation. Do not begin advanced storytelling or new analysis families implicitly.
