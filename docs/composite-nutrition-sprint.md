# Composite nutrition sprint — audit and completion report

Local implementation and validation, September 25, 2026. Migrations have not been applied to a live environment.

## Audit before implementation

The repository already had one global `foods` catalog, `food_servings`, aliases, category mappings, global `food_components`, and private event component selections. Manual and voice writes shared `append_nutrition_food`, with atomic mixed voice batches and request receipts. The preceding quantity fix was committed when this sprint began; its behavior was preserved.

Matching used exact names, exact aliases, punctuation/case normalization, a constrained one-token fuzzy match, then stripped quantity/modifier prefixes. Voice favored serving-backed catalog IDs and used optional AI enrichment only after deterministic resolution failed. Existing aliases could be ambiguous; those cases remained unresolved. Manual search read `common_aliases` but did not include the separate alias table.

The principal gaps were quantities missing from component links, no component nutrition review or aggregation, reference-only composites hidden from manual search, and nutrition history displaying only the first snapshot item. Timeline already grouped multiple items into one meal, so no parallel activity source was necessary. Many structural foods (generic bread, turkey, cheese, pizza crust, cereal) had no nutrient servings; treating them as equivalent to a specific serving-backed variety would have been unsafe.

## 1. Resolution improvements

Retained exact canonical/alias priority, conservative normalization, quantity stripping, ambiguity rejection and bounded fuzzy matching. Added a narrow final-noun singular/plural normalization set, including sandwiches, pizzas, burritos, burgers and common count foods. Preparation, milk-fat, flavor and brand tokens are never dropped. Recipe-backed canonical IDs now participate in nutrition resolution alongside serving-backed foods. Manual search includes the canonical alias table and the same comparison normalization.

`with no cheese` now becomes an exclusion instead of an unmatched positive addition. Explicit component amounts such as `1 oz mayo` are separated from the component identity before matching. Connected-meal extraction instructions keep cereal with milk and sandwiches with modifiers in one event. AI supplies no recipe quantities or nutrient estimates, and uncertain AI matches remain subject to confirmation.

Chicken Salad and Salad with Chicken remain separate canonical foods; the seed does not alias a chopped-chicken recipe to a leafy salad. Duplicate canonical matches or alias collisions fail closed rather than selecting an arbitrary food.

## 2. Composite schema

Extended existing tables:

- `foods.recipe_unit`: the reference recipe's unit (`each`, `slice`, or `serving`).
- `food_components.quantity` / `unit`: optional template amounts.
- `health_event_food_components.quantity` / `unit`: event-specific reviewed amounts.

No second nutrition store was added. Per-component serving selections live in review state and are persisted through the existing `nutrition_entry_items` serving IDs, multipliers and immutable nutrient snapshots. A meal is still one `nutrition_entries` row.

## 3. Canonical versus event-specific recipes

Catalog links are copied into event review state. Editing an amount, correcting a food, adding/removing an ingredient, or excluding cheese never writes to the global definition. Existing library/explicit/AI/user-confirmed provenance remains attached to event components. Authenticated users retain read-only access to global recipe definitions.

Template ingredients and amounts are displayed as reference suggestions. Component aggregation requires explicit recipe review. An AI suggestion must also be individually confirmed before it contributes. Recipe confirmation does not reinterpret an incompatible food unit as a count of recipes.

## 4. Curated templates

The idempotent seed defines 15 modest, editable reference meals:

Turkey sandwich; ham sandwich; peanut butter sandwich; hamburger; cheeseburger; pepperoni pizza; cheese pizza; chicken burrito; chicken tacos; chicken salad; cereal with milk; oatmeal with fruit; Greek yogurt with berries; eggs and toast; grilled chicken with rice.

No calorie or macro values were seeded. Quantities are reviewable template portions. Pizza portions with insufficient reference data remain unspecified. Oatmeal with fruit uses a clearly reviewable blueberry reference; eggs and toast uses whole-wheat bread. These are not claims about what the user actually ate.

## 5. Macro aggregation

An applicable whole-food nutrition serving remains the default. A user can choose the reviewed component recipe instead; edited recipes cannot silently inherit the original whole-food macros. Components use the existing `servingMultiplier` conversion and `scaleNutrition` calculation, then the shared `sumNutrition` aggregation.

All included ingredients need a canonical food, a compatible serving, a positive amount and complete finite calorie/protein/carbohydrate/fat data. Missing ingredients do not disappear into a partial authoritative total. Component amounts describe one reference recipe and are scaled by an explicitly compatible recipe count.

Persistence accepts selected serving IDs and multipliers, not client/model nutrient totals. The database verifies included-component coverage, confirmation, unique ingredient IDs and serving ownership, then invokes `append_nutrition_food` for each ingredient. Manual and voice use the same batch implementation and produce identical nutrient snapshots. Failed recipes roll back the entire batch; receipts prevent duplicate retries.

## 6. Review UI

Manual Nutrition Tracker now exposes composite templates and a **Build a meal** action for an unmatched label. Manual and voice share component review: editable quantities/units, serving selection, component matching, additions, removal, exclusions and primary-food correction.

Aggregate previews respond to edits only when all required information is available. The recipe-review checkbox does not silently change quantity semantics. Nutrition history sums every snapshot and offers expandable component details under one meal.

## 7. Categories

Existing canonical category mappings and event inclusion/provenance rules remain authoritative. Excluded cheese does not contribute dairy; included canonical meat/grain/vegetable ingredients contribute their own categories. Categories are never used to generate nutrient values. Existing nutrition snapshot classification and grouped Timeline/Today behavior remain in place.

## 8. Incomplete behavior

An unmapped burrito retains its label without inferred ingredients. Unsupported units, missing amounts, uncertain matches, absent ingredient servings and incomplete nutrient data block aggregate macros. The user can correct the recipe in review or explicitly save an incomplete meal without nutrient snapshots.

Most sandwich and pizza templates intentionally remain incomplete with the current library: generic turkey, ham, bread, cheese, crust, cereal and other ingredients lack stored servings. The UI permits matching a specific catalog ingredient, but it does not substitute whole-wheat bread, ground turkey or another variety automatically.

## 9. Files

Updated production files:

- `app/api/nutrition/resolve/route.ts`
- `components/checkin/FoodReview.tsx`
- `components/checkin/VoiceLogDialog.tsx`
- `components/checkin/VoiceNutritionReview.tsx`
- `components/nutrition/NutritionHome.tsx`
- `lib/nutrition/food-catalog.ts`
- `lib/nutrition/food-resolution.ts`
- `lib/nutrition/food-service.ts`
- `lib/nutrition/ingestion.ts`
- `lib/nutrition/nutrition.ts`
- `lib/nutrition/voice-nutrition.ts`
- `lib/voice/provider.ts`

Added `lib/nutrition/food-quantity.ts` by extracting the existing quantity/unit/conversion helpers, and `lib/nutrition/recipes.ts` for recipe enrichment and validation. Existing voice helper exports remain compatible. This report documents the audit and delivered behavior.

## 10. Migrations

- `202609250002_composite_nutrition.sql`: optional recipe fields and shared manual/voice batch persistence. Existing voice RPC remains a compatibility wrapper.
- `202609250003_curated_recipe_templates.sql`: 15 idempotent templates, component quantities and conservative aliases; no nutrient estimates.

Apply these migrations in order before deploying the updated application. They have been tested through the local migration harness, not against a live Supabase environment.

## 11. Tests

Added `recipes.test.ts`, `recipes-database.test.ts`, and `recipes-ui.test.ts`; extended `lib/voice/ui.test.ts`.

Coverage includes plural/alias matching, distinct food variants, duplicate ambiguity, safe fuzzy matching, reference precedence, unit conversions, additions/exclusions, template immutability, incomplete ingredients, AI confirmation, idempotent seeds, manual/voice snapshot parity, one-entry meals, retry safety, invalid-recipe rollback, owner isolation, account export and read-only global definitions. UI tests exercise quantity edits, removal, matching additions, aggregate updates and one visible saved meal. Existing voice, quantity, manual nutrition, taxonomy and timeline regressions remain intact.

## 12. Validation

- Full suite: **689 passed, zero failed**.
- Final focused recipe/matching/database and manual/voice UI checks: passed after the last safety adjustments.
- TypeScript: passed.
- ESLint: passed after removing one unused test import.
- Production build: passed.
- `git diff --check`: passed.

UI tests use approved execution outside the Windows sandbox because its directory permissions prevent esbuild dependency resolution. The PGlite harness uses a documented synthetic baseline for original tables whose CREATE TABLE statements are absent from the repository, followed by real repository migrations. It is not evidence about deployed schema/grants.

## 13. Limitations

The library is deliberately small and has substantial ingredient-serving gaps. Components resolve against global canonical foods; selecting private custom foods as recipe ingredients is not included. Recipes are one level, bounded to 16 ingredients. Template portions require review and are not measured intake or AI estimates. Saved recipe reuse and a dedicated post-save component editor are not implemented; the existing incomplete-entry single-food completion flow remains available.

No live OpenAI request, physical-device recording, production database migration, deployment, or live production validation was performed. Provider extraction was tested using deterministic fixtures; production correctness is not claimed.

## 14. Recommended next sprint

Prioritize audited serving coverage for the missing common ingredients, with explicit source/variety and provenance, followed by private saved-recipe reuse and editing/completing existing composite meals. This addresses the observed data and reuse gaps without estimating macros or introducing another nutrition system.
