# Sprint 13A.3C — Experiment discovery and authenticated APIs

## 1. Preflight findings

The working tree was clean. Actual 13A.3A/3B adapters, contracts, readiness policies and `202608280003_nutrition_observation_read.sql` were present. Their 41 focused tests passed before editing. Local Next.js route-handler documentation was read. No live Supabase inspection or writes were performed; schema findings refer to repository migrations and disposable PostgreSQL fixtures.

Verified the registry, `validateOutcome`, `validateV2Draft`, `readObservations`, `getBaselineReadiness`, cookie-authenticated server client, shared API guard/stream validation, subscription projection and entitlement helpers, budgets, and transactional save/start RPCs. Existing experiment queries used broad legacy embeds and generic errors; a bounded v2 read projection was needed. Existing read policies do not revoke owned data on subscription downgrade, so draft review remains Free-readable.

Integration gaps addressed:

- Save/start had no `full_experiments` enforcement. Authoritative SQL protection was required.
- Shared 8 KiB body handling was smaller than the 16 KiB v2 configuration contract.
- Existing HTTP budgets lacked experiment attempt keys.
- Existing TypeScript outcome validation coerced string registry versions; it now requires numeric `1`, matching SQL.
- The registry enables exercise-session frequency and exercise repetitions, but neither has a readiness adapter. Discovery preserves registry enablement and explicitly reports readiness unavailable; no adapter was added or silently enabled.
- Prospective storage/start exists in SQL, but its runtime transition API does not. Storage compatibility is preserved without advertising a usable prospective API flow.

## 2. Files changed

New route files under `app/api/experiments/v2/`:

- `outcomes/route.ts`
- `targets/route.ts`
- `draft/route.ts` (GET and POST)
- `baseline-readiness/route.ts`
- `start/route.ts`

New services/tests:

- `lib/experiments/api.ts`: thin authenticated orchestration and Premium projection checks.
- `lib/experiments/api-errors.ts`: exact safe error allowlist.
- `lib/experiments/discovery.ts`: public registry projection and small grouping metadata.
- `lib/experiments/targets.ts`: bounded cursor validation and target read RPC client.
- `lib/experiments/draft-read.ts`: bounded owned draft/configuration projection and reference labels.
- `lib/experiments/api.test.ts`: 16 API/security tests, including disposable database cases.
- `supabase/migrations/202608280004_experiment_api_access.sql`: entitlement wrappers, HTTP budgets and fixed-purpose target reads.
- `docs/sprint-13a3c-experiment-apis.md`: this report.

Modified:

- `lib/api/boundary.ts`: pass authenticated context to handlers; experiment-only attempt-before-validation ordering. Other routes retain their prior ordering.
- `lib/api/validation.ts`: experiment exact-key/query rules, strict Origin and explicit draft envelope bound.
- `lib/measurements/validation.ts`: strict numeric registry version.
- `lib/experiments/v2.ts`: existing wrappers use the safe RPC error mapping.
- `lib/experiments/foundations.test.ts`: authoring regressions seed real Premium subscription rows instead of relying on formerly ungated RPCs. No assertions or domain protections removed.

## 3. Outcome discovery

`GET /api/experiments/v2/outcomes` requires authentication, not Premium. Every outcome comes from `outcomeRegistry`; routes contain no metric definitions. Public projection includes key/version, label, group, help/limitations, unit, grain, scale, aggregations/recommendation, target selector, enablement/reason, readiness availability/policy/window and primary-performance preference.

All eight approved goal groups are represented in grouping metadata. Estimated 1RM remains preferred; body weight remains disabled. Disabled definitions are visible but unavailable. Registry enablement is distinct from readiness implementation. No SQL, source table names, adapter selectors or formula expressions are returned. Historical and none are the advertised modes; prospective reports storage support with runtime unavailable.

## 4. Target discovery

`GET /api/experiments/v2/targets?kind=...&search=...&cursor=...&limit=...`

Closed kinds:

| Kind | Identity and scope |
| --- | --- |
| `conditions` | Owned nonarchived `user_condition_id` |
| `symptoms` | Active owned durable `user_symptom_id` |
| `catalog_symptoms` | Active shared `symptom_id`, explicitly separate identity |
| `exercises` | Visible nonarchived shared or same-owner `exercise_id` |
| `habits` | Owned active habit planned activities; no occurrence generation |
| `protocols` | Owned user protocols, not protocol templates; no activation |
| `nutrition_patterns` | Owned nonarchived reusable patterns |
| `target_rules` | Owned nonarchived nutrition-domain structured rules |
| `workout_templates` | Owned nonarchived templates |

Default page size 20, maximum 50, search maximum 100 characters. Case-insensitive literal substring search occurs in PostgreSQL across custom/catalog display labels. `%` is literal, not a wildcard. Results use stable ascending UUID keyset pagination, with a one-row lookahead. The opaque base64url cursor contains kind, normalized search and last UUID, all validated. It is not an authorization token; every page re-applies RLS/owner filters. Concurrent inserts before the cursor may not appear until a new traversal; this is not a frozen snapshot.

`discover_experiment_targets_v1` is a fixed-purpose SECURITY INVOKER read function, not arbitrary table discovery. It permits bounded selected-ID resolution for draft labels without an owner argument or writes. Its union handles custom/catalog labels in one database query instead of fetching large lists for application filtering. Protocol/pattern/template selection is a candidate list: transactional save/start still validates member completeness and compatibility.

## 5. Draft load API

`GET /api/experiments/v2/draft?id=<uuid>` returns only an owned model-v2 draft, its baseline fields, revision, intervention/outcome configuration and public-safe reference labels. Foreign and nonexistent IDs both return `404 EXPERIMENT_NOT_FOUND`; non-drafts also use absent behavior on this draft-specific endpoint.

One explicit root/child projection reads configuration. Child embeds cap at two interventions/five outcomes to detect invalid cardinality; accepted limits remain one/four. Reference labels are grouped by kind and batch-resolved from owned/visible targets. Removed/unavailable references have a null label and unavailable flag rather than another owner's metadata. No event history, raw observations, private subscription fields or internal source configuration is added. Reads remain allowed after downgrade; no subscription check can lock users out of this review path.

## 6. Baseline readiness API

`POST /api/experiments/v2/baseline-readiness` accepts the existing `{outcome,timeZone,startDate?,endDateExclusive?}` contract. `outcome` retains the existing registry/target/aggregation fields. Extra keys, owner and evaluation cutoff are rejected. Existing registry validation and bounded DST-safe window helpers remain authoritative. Only the server supplies evaluation time.

The handler delegates to `getBaselineReadiness` and returns its public contract, not the observation envelope. Complete reads return 200, preserving good/limited/insufficient. Failed/truncated reads return 503 with the original operational readiness contract, null classification/aggregate and blockers. Nutrition missingness, censoring, current-record and missing-surveillance limitations are not recalculated or stripped.

## 7. Draft save API

`POST /api/experiments/v2/draft` accepts exactly `{id,revision,input}`. New drafts use `id:null, revision:0`; updates use UUID and current positive revision. `input` uses `DraftV2Input`, including valid incomplete drafts. Existing validation checks configuration bounds, registry compatibility, interventions, dates and outcomes. The transactional `save_experiment_v2` RPC performs all persistence and ownership/domain enforcement.

Creation returns 201, update 200, with an allowlisted experiment projection. No TypeScript insert/update sequence was added. Valid prospective configuration remains storable.

## 8. Start API

`POST /api/experiments/v2/start` accepts exactly `{id,revision}`. After ownership/revision/mode preflight, it calls the existing `start_experiment_v2`. The database rechecks revision and invariants under its existing locks, captures the immutable snapshot, and appends the existing phase event. Preflight is not a replacement for the transaction. A competing save changes revision and is rejected by SQL.

Retries for the same started revision retain the existing RPC behavior. An HTTP timeout can have an uncertain mutation outcome: reload the draft/status through the appropriate read path before deciding how to retry; never assume cancellation rolled back a committed transaction. No lifecycle endpoint beyond start was added.

## 9. Entitlement enforcement

API readiness/save/start require `full_experiments` using the authoritative subscription projection and existing entitlement policy. This slice deliberately supplies production semantics to the helper, so a development environment flag cannot bypass SQL protection. Missing projection means Free; projection read error is unavailable, not a grant.

SQL checks the same policy: Premium active/trialing with null or future period end, or Premium past_due/canceled with a future end (existing grace behavior). Expired, missing, Free, unpaid or other inactive states fail closed. Clients cannot write the subscription projection under existing RLS.

The migration renames the original engines to `axvital_save_experiment_v2_internal` and `axvital_start_experiment_v2_internal`, revokes their execution from PUBLIC/anon/authenticated/service_role, and replaces the public names with checked wrappers. The original implementation bodies, transaction locks, budgets and snapshots are unchanged. No client-set bypass exists. Database-owner administrative capability remains administrative, not an exposed API path. Existing v2 write guards continue to prevent legacy/direct-table activation. No automatic lifecycle changes are introduced on downgrade, and existing data stays readable.

## 10. HTTP versus RPC budgets

All limits use the existing shared per-owner database minute buckets:

| HTTP attempt key | Per minute |
| --- | ---: |
| `http/experiments/outcomes:GET` | 30 |
| `http/experiments/targets:GET` | 30 |
| `http/experiments/draft:GET` | 30 |
| `http/experiments/readiness:POST` | 12 |
| `http/experiments/draft:POST` | 20 |
| `http/experiments/start:POST` | 6 |

Existing mutation keys remain `experiments/draft:POST` (20/minute) and `experiments/start:POST` (6/minute). The HTTP guard consumes only its own distinct key, after authentication and before request validation/entitlement; malformed authenticated attempts therefore count. Anonymous requests do not consume an owner bucket. HTTP budget RPC commits separately from the later mutation request.

The mutation budget is called inside the original transaction: if that transaction raises/rolls back, its increment rolls back too. Successful calls, including successful start retries, consume it. Direct RPC calls remain subject to this transactional budget and entitlement checks, not the HTTP budget. No claim is made that it durably counts rejected/rolled-back direct attempts. Account/billing and other existing key limits are unchanged. Budget storage failures fail closed; 429 includes `Retry-After: 60`.

## 11. Same-origin and body limits

Every experiment POST requires Origin exactly equal to the request URL origin, including rejecting missing Origin, matching hardened account behavior. JSON is required. The shared stream reader enforces byte limits before JSON parsing, with or without Content-Length.

Draft envelope limit: 24,576 bytes, accommodating the existing 16,384-byte input configuration plus wrapper/serialization overhead. Existing TypeScript/SQL input limits still apply (SQL uses canonical JSONB text). Readiness/start remain at 8,192 bytes. Oversized HTTP streams return 413; URL limit remains 2,048 characters. Query and body extra/duplicate keys are rejected. These changes do not enlarge other routes' limits.

## 12. Error mapping

All handled responses, including errors, use `Cache-Control: private, no-store`.

| Status | Public codes/behavior |
| --- | --- |
| 400 | `INVALID_REQUEST`, `INVALID_CURSOR`, `INVALID_BODY`, `INVALID_CONFIGURATION` for exact validation errors and allowlisted SQL input/constraint classes |
| 401 | `AUTH_REQUIRED` |
| 403 | `PREMIUM_REQUIRED`, `INVALID_ORIGIN` |
| 404 | `EXPERIMENT_NOT_FOUND`, `TARGET_NOT_FOUND`; malformed target shape is 400, valid absent/foreign RPC target is 404 |
| 409 | `REVISION_CONFLICT`, `STARTED_CONFIGURATION_IMMUTABLE`, `INVALID_TRANSITION`, `EXPERIMENT_CONFIGURATION_INCOMPLETE`, `START_DATE_MUST_BE_TODAY`, `EMPTY_PROTOCOL`, `EMPTY_WORKOUT_TEMPLATE`, `EMPTY_PATTERN`, `QUESTION_REQUIRED`, `PROSPECTIVE_RUNTIME_UNAVAILABLE` |
| 413 | `BODY_TOO_LARGE`, `CONFIGURATION_TOO_LARGE` |
| 414 | `URL_TOO_LONG` |
| 415 | `JSON_REQUIRED` |
| 429 | `RATE_LIMITED` |
| 503 | `TEMPORARILY_UNAVAILABLE`; failed/truncated readiness instead retains its public operational contract |

Unknown RPC messages are never reflected. Existing generic boundary failures outside the handler use `500 REQUEST_FAILED`. Logs contain only the shared route/status/category diagnostic, never request or health payloads. Existing v2 wrapper callers now share the safe mapping as well.

## 13. Draft idempotency

Null-ID creation is NOT automatically retry-idempotent. Repeating it can create another draft; response metadata explicitly says `creationRetryIdempotent:false`. No partial idempotency token scheme was added. Revision-based updates retain optimistic conflict protection; after a successful update the old revision conflicts.

## 14. Review/start consistency

Readiness is evaluated-at preview data and is not frozen or atomically compared with source markers during start. Referenced labels are current metadata. The start transaction's configuration snapshot is authoritative for what actually started. Existing immutable snapshot and revision rules remain the consistency boundary; no second start implementation exists.

## 15. Prospective baseline handling

Discovery advertises historical/none only and explicitly reports prospective runtime unavailable. Draft storage/loading remains compatible with prospective. The HTTP start endpoint returns `409 PROSPECTIVE_RUNTIME_UNAVAILABLE` for prospective configurations. The original direct RPC storage/start semantics are retained behind the new Premium wrapper, including existing foundational prospective regression coverage; this is not advertised as an integrated runtime flow. No prospective transition API or UX was added.

## 16. Security review

All routes use the existing cookie-authenticated anonymous-key server client, verified auth identity and shared budget boundary. Private reads apply owner filters/RLS; target SQL accepts no arbitrary owner/table/formula. Readiness has no client clock. Draft responses use explicit projections; child relationships stay under existing RLS. The new target function is invoker/STABLE, bounded, has empty search path and no writes/dynamic SQL. New mutation wrappers retain definer semantics only to reach their revoked internal implementations and enforce the server-owned subscription projection.

No service-role dependency, source mutation, billing behavior outside experiments, export/deletion table set, RLS weakening or live destructive test was introduced. This is local verification, not certification of an independently deployed schema or production grants.

## 17. Performance review

Target search returns at most 51 rows (50 exposed) using one RPC with a 10-second client timeout and SQL statement-timeout setting. UUID keyset ordering avoids offset drift and is compatible with existing primary keys. Server-side substring matching may still scan owner/catalog rows; a result cap is not a scan-cost guarantee. No speculative indexes were added; live production query plans remain unmeasured.

Draft load uses one bounded root/embed query plus at most five grouped target-kind queries (one intervention and four outcomes, with condition/symptom kinds shared). Each selected-ID read is capped at ten IDs, and client requests have 10-second timeouts. No per-day/event discovery loop, occurrence generation, large client-side search filter or unbounded child embed was added. Existing readiness source budgets/caps are unchanged. API save/start client calls have bounded waits; authoritative transaction correctness does not depend on HTTP cancellation.

## 18. Tests

New focused API/security suite: 16 tests. Covers registry projection, disabled outcomes, anonymous denial, downgrade review, owner absence semantics, exact-key/version validation, origin, body bounds including the larger envelope, safe mappings, Premium API gates, readiness delegation and operational states, event surveillance warning preservation, pagination, start/revision/prospective behavior, direct RPC entitlement/privilege enforcement, separate budgets and real target search/RLS/read-only execution.

The existing foundation suite now supplies Premium fixture rows and retains actual save/update/start, concurrent revision, retry, immutable snapshot, export/deletion and prospective compatibility assertions. Adapter regressions and billing tests remain unchanged. Database fixtures use disposable PGlite with repository migrations and synthetic baseline tables; HTTP tests invoke the shared route service with a mocked user client. No running live PostgREST instance or signed-in browser was used, so deployment-specific PostgREST configuration is not certified by these tests.

## 19. Migration

Created `supabase/migrations/202608280004_experiment_api_access.sql`, after 003. It adds authoritative full-experiment wrappers, six separate HTTP budget keys, and the bounded target-discovery/reference read RPC. No deployed 001/002/003 migration was edited. It creates no tables and requires no data backfill. Apply only through the normal separately authorized deployment workflow; missing migration causes API budget checks to fail closed.

Applied only to disposable test databases. **No live Supabase writes or migration execution.**

## 20. Validation results

- Preflight 13A.3A/3B adapter tests: 41 passed.
- Focused API/security suite: 16 passed, 0 failed.
- Final full `npm test`: 366 passed, 0 failed, 0 skipped.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; 58 pages generated and all five new route paths compiled (six operations).
- `git diff --check`: passed; Git emitted only Windows line-ending normalization notices.

Existing Node module-type performance warnings remain. Injected failure tests intentionally emit the shared sanitized route/status/category log. No private payload appears in those diagnostics.

## 21. Remaining 13A.4 work

Only the user-facing Experiments 2.0 wizard/review/start UX and any explicitly deferred lifecycle UX. No 13A.4 UI, alternate experiment engine, source adapter, readiness threshold, or prospective lifecycle transition was implemented in this slice.
