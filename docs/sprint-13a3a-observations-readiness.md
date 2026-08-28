# Sprint 13A.3A — observation readers and historical readiness

Implemented 2026-08-28. This is **13A.3A only**. No live Supabase access, migration, HTTP route, wizard, domain write, readiness persistence or 13A.3B adapter was introduced. The deployed 13A.2 registry, formula, migrations, lifecycle, budgets and account contracts are unchanged.

## 1. Preflight and changed files

The working tree was clean at the initial read-only inspection. The registry, Epley helper, check-in persistence, workout persistence, cookie-based Supabase client, date helpers, API test conventions and PGlite fixture matched the approved audit. No meaningful repository drift was found. The relevant local Next.js server/client-boundary guide was inspected. Existing date helpers use process-local dates in some paths; those paths are not used for experiment boundaries.

All files below are new:

| File | Purpose |
| --- | --- |
| [observations.ts](C:/Users/apath/axvital/lib/measurements/observations.ts) | Internal observation/source envelope and separate operational status |
| [time-window.ts](C:/Users/apath/axvital/lib/measurements/time-window.ts) | Validated logical dates, date arithmetic, zoned boundaries, historical windows |
| [sources/index.ts](C:/Users/apath/axvital/lib/measurements/sources/index.ts) | Closed server-only dispatcher, authenticated bounded check-in and workout reads |
| [readiness-policies.ts](C:/Users/apath/axvital/lib/measurements/readiness-policies.ts) | Versioned pure policies and public-safe readiness result |
| [experiments/readiness.ts](C:/Users/apath/axvital/lib/experiments/readiness.ts) | Server-only read → evaluate orchestration |
| [sources.test.ts](C:/Users/apath/axvital/lib/measurements/sources.test.ts) | 24 focused test cases, including local FK/RLS verification |
| This report | Contracts, decisions, validation and remaining work |

## 2. Observation contract

The exact TypeScript declarations live in `observations.ts`.

`SourceResult` includes `contractVersion:1`, registry key/version, `adapterVersion:1`, source domain, target, grain, unit, aggregation, validated window, observations, observation count, query completeness, counts, exclusions, warnings and temporal limitations.

Each internal `Observation` contains:

- `sourceId`, `logicalDate`, `precision:'date'`, `eligibility:'eligible'`.
- `value`: `{kind:'numeric',value}` or `{kind:'ordinal',value,category}`.
- Optional workout grouping/context: session ID/start time, group order, exercise order, set number, nullable completion time, raw actual weight and reps.

There is no invented observation timestamp. Workout timestamps are genuine stored context, not substituted for `session_date`. Identity and raw set details remain in the internal source result; readiness does not expose them. Target identity remains because it describes the requested metric, not an unrelated source record.

Envelope counts distinguish `sourceRows`, `nullValues`, `excluded`, `censored` and `absentDays`. Check-in absent days count dates without an owned row, not dates with null answers. Workout absent-day coverage is null because an unlogged date is not an expected workout. On incomplete reads, absent days are unknown.

Numeric zero survives the generic observation/aggregate contract; metric eligibility still rejects zero energy/mood and nonpositive e1RM load. No filler points are generated.

## 3. Adapter entry point and authentication

`readObservations(client, request, clock?)` accepts the existing user-scoped Supabase server client. It verifies identity with `auth.getUser()`; owner is not accepted in request data. Clock injection is a server/test dependency, not a serialized input. Normal calls use the server's current time.

Request shape:

```text
{ outcome: OutcomeInput, timeZone: string,
  startDate?: string, endDateExclusive?: string }
```

The date pair is either both present or both omitted. Exact-key validation rejects owner/cutoff/table/query/formula additions. Existing `validateOutcome` checks target, aggregation, criterion and registry compatibility. Dispatch supports exactly:

- `energy_score`, version 1
- `mood_score`, version 1
- `sleep_quality_score`, version 1
- `exercise_estimated_1rm`, version 1

Other registered metrics are not silently routed here. Disabled registry definitions remain unchanged. Invalid request/authentication/target errors reject; source query failures become operationally failed results with safe codes, not raw database messages. No health payloads are logged.

Both the dispatcher and experiment orchestration import `server-only`. Pure contracts, timezone logic and policy functions contain no credentials or database access. A later server caller should obtain the client from the existing `lib/supabase/server.ts`; no new client framework was created.

## 4. Timezone and cutoff strategy

`historicalWindow` defaults to the preceding **14 complete local dates**, ending at today's local date exclusively. Explicit requests may include today; they cannot include future dates beyond tomorrow's exclusive boundary. Maximum window is **366 calendar days**. Malformed, impossible, empty, reversed, oversized, or one-sided windows fail.

`localDateBoundary` uses `Intl.DateTimeFormat` with the explicit zone. It scans a bounded UTC neighborhood for the first local-date crossing, then bisects to millisecond precision. It handles ordinary DST, midnight gaps and repeated midnight by selecting the first instant of the local date. An entirely skipped boundary date fails explicitly rather than being silently reassigned. Date arithmetic/validation uses UTC calendar operations, never the process timezone.

The window carries derived half-open `startAt`/`endAtExclusive` and `effectiveEndAtExclusive = min(requested end, evaluatedAt)`. The logical-date pair remains unchanged; a current partial day has an explicit warning and cutoff. Check-ins filter `checkin_date`; workouts filter `session_date`. Neither is shifted like a timestamp.

Analysis is **current-record retrospective**: current answers/actual values for the selected logical dates, not event-sourced reconstruction. A later edit does not get excluded merely because it was edited after the historical window. A workout completion at or after the server evaluation cutoff, or with an invalid completion timestamp, is censored. Missing completion time remains unknown context; set status still controls completion. Real timestamp comparisons use parsed instants, not lexical offset comparisons.

No trend, causal or statistical-confidence calculation is performed.

## 5. Check-in reader

One query selects only ID, owner, logical date, energy, mood and sleep quality from `daily_checkins`. It applies owner equality, `checkin_date >= startDate`, `checkin_date < endDateExclusive`, stable date/ID order, count and row limit. No notes or unrelated health fields are fetched.

Energy/mood must be integer 1–10 values. Sleep mapping is exactly Poor=1, Average=2, Good=3, Great=4. Null values are counted separately; invalid scores/aliases are excluded. Duplicate logical dates fail the read rather than artificially inflating readiness. Ownership and date bounds are rechecked after retrieval.

Missing rows and null answers never become zero. The reader does not call check-in persistence or any mutation helper.

## 6. Workout e1RM reader

One bounded exercise lookup verifies a shared or same-owner target. One bounded set-root query embeds only many-to-one session and session-exercise parents using the actual repository FK names:

- `workout_session_sets_workout_session_id_fkey`
- `workout_session_sets_workout_session_exercise_id_fkey`

Explicit filters cover set owner, session owner, session-exercise owner, selected exercise ID and session-date bounds. The reader then verifies all IDs/owners agree, including that the exercise parent references the same session as the set.

Eligibility requires `weight_reps`, `working`, set `status='completed'`, known finite positive actual weight and integer actual reps 1–10. The existing `estimated1rmEpleyV1` performs the calculation and numeric eligibility checks; the formula is not duplicated. Parent session completion is not required. Missing actual values are counted, not substituted from planned values; planned values are not fetched.

Each eligible set remains a point with its raw weight/reps. Load remains the existing application lb convention, without conversion or dumbbell doubling. Lack of per-row unit provenance and estimate-versus-measured-1RM limitations are returned as warnings.

Latest ordering: logical date → stored session start instant → session ID tie-break → group order → exercise order → set number → source ID tie-break. These are deterministic ordering rules, not claims about actual execution order. Best is separately the maximum estimate. Duplicate source records fail closed.

## 7. Readiness policy and response

Policies are separately keyed by registry key with `registryVersion:1`, `policyVersion:1`, and default window 14 days. The existing registry's recommendation metadata is not rewritten; these approved readiness policies are the authoritative threshold implementation for this slice.

| Outcome | `good` | Otherwise |
| --- | --- | --- |
| Energy, mood, sleep quality | At least 7 valid distinct days spanning at least 7 calendar dates inclusively | At least one: limited; none: insufficient |
| Estimated 1RM | At least 5 eligible sets across at least 2 sessions and 2 session dates | At least one: limited; none: insufficient |

Numeric aggregates use the selected registry-approved average/median, or maximum for e1RM. Sleep returns `ordinal_median` with lower and upper **category-valued** central observations. For an even sample crossing categories, both categories are retained; no 2.5 category is fabricated. For an odd sample, lower and upper agree.

`ReadinessResult` includes contract/policy/registry versions; target, aggregation, unit and historical mode; requested/effective windows, timezone/evaluatedAt; observation/day/session counts; earliest/latest date and precision; latest value; baseline aggregate; classification; warnings/blockers; query completeness; temporal limitations; observation coverage and missingness.

Workout-specific summary adds `eligibleSetCount`, `distinctSessionCount`, `distinctDateCount`, `latestValue`, `bestValue`, `earliestDate`, `latestDate`. No source row/session identifiers are returned by readiness. `getBaselineReadiness` returns this result, not the internal points.

On `failed` or `truncated` reads, classification, baseline aggregate, latest/best values and earliest/latest summaries are null. Diagnostic counts may describe the fetched subset and must be interpreted alongside query completeness. Blockers identify operational inability to evaluate—not inability to start an experiment. Normal limited/insufficient history has warnings and no start blocker. Check-in coverage is a whole-number percentage of observed valid days; workout coverage percentage is null because scheduled-training coverage is unknown.

## 8. Bounds, security and performance

- Maximum requested range: 366 dates.
- Maximum data rows: 1,000, including ineligible/null rows in the selected source scope.
- A reached cap, absent exact count, or disagreement between count and returned rows marks truncation. This also catches a server-side row cap below the requested limit.
- A shared 10-second abort signal bounds target/source fetches after authentication.
- Check-ins: one data request. Workouts: one target lookup plus one flat set/parent request. No per-day/per-set N+1 calls or unbounded one-to-many embeds.
- No service role, dynamic SQL, arbitrary source selection, mutation RPCs, process-local cache or persisted readiness.
- Source errors are sanitized; authentication and invalid targets reject safely. Existing RLS remains in force in addition to explicit owner filters.

Existing access paths include the unique check-in owner/date index; workout session owner/date index; set session/status index; set session-exercise/set-number unique index; and parent primary keys. The real PostgREST join/count plan was not measured against hosted Supabase. Exact counts can cost more than fetching the bounded page, and parent-filter pushdown must be checked on authorized staging. No index has been demonstrated necessary locally, so none was created. If a later plan shows excessive work, measure the actual set-root query first rather than adding speculative indexes.

The target and set reads are separate snapshots. Changes between them cannot bypass owner/chain checks; current-record retrospective results are not promised as an immutable multi-query historical snapshot. The set and parent values themselves are retrieved in one source query.

## 9. Tests and validation

24 new tests cover timezone boundaries (normal, fractional offset, spring/fall DST, midnight gap, skipped date), window bounds/defaults, logical-date preservation, no filler zeros, null/excluded/missing distinctions, owner checks, closed dispatch, foreign/shared/private exercise targets, numeric and ordinal aggregates, all readiness thresholds, latest versus best, workout eligibility boundaries, parent consistency, unknown/future completion timing, query errors/caps/missing counts, duplicate handling and same-day ordering.

The mocked Supabase query builder exercises production reader logic and verifies filters/bounds/projections. It exposes no mutation methods. Node tests stub only the Next `server-only` marker using Node 24 module hooks; the repository's existing Node 20 typings are retained with a narrow test-only hook type declaration. PGlite executes the existing migration stack and verifies real FK names and authenticated check-in RLS inside a read-only transaction. Existing 13A.2 tests retain broader workout ownership, v1, lifecycle, export and deletion coverage. These tests do not execute hosted PostgREST or certify its query plan.

Validation commands:

- `node --experimental-strip-types --test lib/measurements/sources.test.ts`
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`

Final validation: **333 tests passed**, zero failures/skips, including the 24 new focused cases. TypeScript typecheck, ESLint, production build and diff checks passed. Existing Node module-type warnings are unchanged.

## 10. Disabled/deferred and migrations

Body weight stays disabled with its original registry reason. No steps, sleep duration, body fat, waist, best-single load, volume or unit-normalized metrics were enabled. Session frequency/repetitions remain registry definitions but have no adapter in this slice. Only historical readiness is implemented; no prospective/none/manual readiness service, route, wizard, lifecycle or authoring changes were added.

**No migration was created or edited. No live SQL was executed. No health/workout data was written.** Local disposable fixtures are synthetic test data only.

## 11. Remaining 13A.3B work only

1. Nutrition: snapshot nutrient readers, logical-day aggregation, per-field null/subtotal accounting, explicit logging-coverage integration and coherent item/coverage reads; never infer zero intake or dietary adherence.
2. Conditions/episodes: owner-scoped onset/update readers, recorded-count versus surveillance distinction, resolved-duration censoring, recorded peak/ordinal-impact handling, and explicit mutable-history limitations.
3. Symptoms: catalog/durable user-symptom readers, optional exact condition scope, count/severity/duration semantics, identity-gap and missing-count handling without text matching or historical backfills.

Do not implement these adapters, authenticated HTTP routes, or the wizard as part of this delivery.
