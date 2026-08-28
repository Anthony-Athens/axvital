# Sprint 13A.12 — Nutrition Goals

## 1. Implementation summary

Nutrition Goals now provides create/edit/archive/restore for supported daily targets, with embedded creation in the Experiment wizard. Existing domain persistence and evaluators are reused; Eating Patterns remain read-only and explicitly unsupported for analysis.

## 2. Files changed

- Routes: `app/health/nutrition/goals/page.tsx`, `app/api/nutrition/goals/route.ts`.
- UI: `components/nutrition/NutritionGoals.tsx`, `NutritionGoalForm.tsx`, `NutritionHome.tsx`; `components/experiments/ExperimentWizard.tsx`, `TargetPicker.tsx`.
- Domain/API: `lib/nutrition/goals.ts`, `goals-api.ts`, `lib/api/validation.ts`, `lib/experiments/wizard-client.ts`.
- Migration: `supabase/migrations/202608280007_nutrition_goals_access.sql`.
- Verification: `lib/nutrition/goals.test.ts`, `goals-ui.test.ts`, `testing/goals-db-client.ts`, `testing/goals-harness.tsx`, `scripts/goals-browser.mjs`.

## 3. Existing nutrition architecture findings

Audited before implementation: `target_rules` already stores owned, validated, versioned definitions with archive timestamps and RLS. `nutrition_patterns` and ordered memberships already exist. Legacy `nutrition_targets` projections are trigger-maintained and protected against direct canonical edits. Start freezes definition/name/ID/revision. Exposure uses `supportedFrozenTarget` and `evaluateFrozenNutritionDay`; durable replay reads retained evidence, not mutable targets. Habits/protocols establish reversible deactivation/archive conventions. No dormant goal-management UI was found.

## 4. Persistence/migration decision

No new tables or duplicated history. The guarded migration registers management request budgets and filters available Experiment targets to the supported numeric subset. Existing ownership, RLS, revisions and snapshots remain authoritative. Repeat application is tested.

## 5. Nutrition Goals destination

`/health/nutrition/goals` is linked from Nutrition tracking. Active/Archived lists show names, target summaries, status and compatibility. Lists use bounded keyset paging, empty states and retry. Raw definition JSON is never rendered.

## 6. Numeric target contract

Optional name: blank or 2–120 trimmed characters. Blank names become target summaries. Amount must be finite, positive and within the existing 1,000,000 validator ceiling. Canonical unit derives from nutrient. Client and server independently validate; the server rebuilds definitions and invokes the existing rule validator.

## 7. Supported nutrients/operators

Calories/kcal; protein, carbohydrates, fat and fiber/g. Daily At least, At most and Exactly map to gte/lte/eq. No range, alcohol occurrence, exclusion, cutoff, arbitrary unit/text or compound-rule authoring.

## 8. Creation/edit/archive behavior

Creates are distinct: equivalent targets never silently overwrite each other. Active compatible targets can be edited with optimistic revision checks. Archive/restore is reversible and revision-checked; no hard-delete API. Unsupported historical rules are labeled and can be archived/restored, but not rewritten through the constrained editor.

## 9. Historical integrity behavior

Live edits increment existing rule revisions; started studies preserve frozen criteria/name/revision. Archive does not delete references. Tests prove snapshot and retained result stability after live edits/archive.

## 10. Eating Patterns findings

Templates and versioned memberships can already be frozen, but there is no supported whole-pattern adherence evaluator. Existing pattern names/status are listed read-only with an explicit unsupported-analysis message. No unconstrained pattern editor was introduced.

## 11. Experiment compatibility behavior

Compatible target cards say Supported in Experiments. Archived and unsupported nutrition targets are unavailable for new choices. Pattern selection carries an explicit unsupported-analysis warning. Tracking support is not presented as analysis support.

## 12. Wizard Change integration

Nutrition target offers existing owned choices, a targeted empty state, Create Nutrition Goal and a management link. The new action is embedded; other intervention flows are unchanged.

## 13. Create-and-return flow

No navigation occurs: goal/outcome/name/dates/question remain in the wizard. Success auto-selects the returned target, remounts discovery, clears readiness preview and returns focus to Change. Cancel preserves the draft and refreshes choices. Type switching and Back/Continue are disabled during creation. Uncertain saves lock automatic retries and instruct users to close/check the list.

## 14. Discovery behavior

Existing server RPC remains owned, label-only and keyset-paginated. Availability now requires active status and the supported numeric nutrient subset. Historical selected references can still resolve as unavailable. Created targets appear after refresh; archived targets disappear. Existing stale-response generation guards plus remounting prevent old results replacing the newly selected target.

## 15. Start snapshot behavior

A management-API-created target is selected into a real Premium draft and started through normal SQL transactions. Its frozen definition/revision is asserted, then remains identical after source update/archive/restore.

## 16. Exposure behavior

No evaluator duplication. New definitions feed the existing frozen nutrition evaluator. Tests cover met, missed, incomplete, absent and unsupported states. Missing/incomplete logging remains Unknown, not non-adherent.

## 17. Active experiment behavior

The existing active-study experience consumes frozen labels/requirements and shared exposure counts without a new target structure. Current requirement/unknown semantics stay unchanged. Logging remains in normal Nutrition tracking; no second logging UI was added.

## 18. Results/replay behavior

A synthetic PostgreSQL test authors a target via the API, uses it in terminal capture, replays results, edits/archives the live target and proves retained results unchanged. Explicit later captures preserve earlier revisions. Actual Start is separately exercised; historical terminal timestamps are synthetic test setup only.

## 19. API/security

`/api/nutrition/goals` uses authentication, owner-derived filters, exact query/body keys, UUID/revision/action validation, same-origin JSON mutations, bounded bodies/reads, timeouts, registered database budgets and private/no-store responses. Foreign/nonexistent mutations share GOAL_NOT_FOUND. Raw provider/definition/owner details are omitted from public responses. Existing SQL independently validates stored rules and enforces RLS.

## 20. Entitlement behavior

Nutrition management remains generally available without Premium. Existing Experiment authoring/Start Premium checks are unchanged. Downgrade does not hide goals or historical results.

## 21. Mobile/accessibility

Visible labels, native keyboard controls, decimal input mode, associated error IDs, aria-invalid, alert/status roles and text statuses are used. Focus enters Name and returns to the appropriate heading after save/cancel. Browser measured no horizontal overflow at 320×800 for management and 390×844 for inline creation. No modal focus trap was introduced.

## 22. Tests added

Fifteen nutrient/operator combinations; invalid fields/types/amounts; canonical units; evaluator met/missed/unknown; real PostgreSQL owner CRUD/archive/restore, duplicate, foreign/anonymous/origin/key denial; safe projections; real Start; snapshot/history stability; terminal durable replay; management UI/focus/errors; inline preservation/auto-selection/stale responses; uncertain-save retry locking.

## 23. Validation results

Full suite: 545 passed, 0 failed. Focused Nutrition Goals: 23 passed. Typecheck, ESLint, production build and git diff --check passed. Build generated 64 pages including the new route. Existing typeless-package and Windows line-ending warnings remain; no dependencies were added.

## 24. Browser verification

Browser skill drove real components and API/domain handlers against disposable PGlite at localhost:3112. Outside Experiments: empty → invalid input → create Protein 180 → edit 200 → archive → archived list. Inside: Weight/Body Composition → Body Weight → Nutrition target → create Fiber 30 → auto-selected → Design → Review. Focus, friendly copy, wrapping and 320/390px widths were inspected. Viewport override reset.

## 25. Migrations created/applied

`202608280007_nutrition_goals_access.sql` created and applied only to disposable local test databases, including repeat application. NOT applied to linked Supabase. Apply before deploying the new API/UI so budgets and discovery filtering exist.

## 26. Linked-environment verification

Unavailable: no designated disposable linked fixture/account supplied. No real health records, targets, patterns or linked migrations were changed. Local role/RLS tests are not claimed as deployed Supabase verification.

## 27. Unresolved nutrition-pattern gaps

There is no authoritative whole-pattern adherence denominator/evaluator for arbitrary exclusions, timing or named dietary styles. Frozen membership alone is insufficient. Pattern management stays limited. Existing zero-valued numeric rules may be analyzed by the older evaluator, but this new authoring form requires positive values.

## 28. Recommended next sprint

Review/apply the migration in a disposable linked environment and verify create → Start → active evidence → capture/results with synthetic data. Define a narrow, versioned Eating Pattern analysis contract before expanding pattern support. Do not begin Experiment Wizard simplification.
