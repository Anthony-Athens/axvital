# USDA catalog enrichment — implementation and operating guide

Live USDA search/detail reads were performed on September 26, 2026. The reviewed snapshot was imported into a **local PGlite database built from repository migrations**, with the synthetic original-table baseline documented in `lib/security/test-database.ts`. No production database was changed. No physical-device testing is claimed.

## Results

| Measure | Before | After local import |
|---|---:|---:|
| Canonical catalog records, including recipe templates | 97 | 117 |
| Foods with complete core macros and a usable serving | 64 | 98 |
| Foods with any serving | 64 | 98 |
| Complete composite templates | 3 / 15 (20%) | 13 / 15 (86.7%) |
| Reviewed USDA records attached | 0 | 61 |

The 61 imports add 20 foods and enrich 41 existing foods. Of these, 14 previously serving-less foods gain nutrition, and 27 existing foods receive provenance only. All existing curated serving values, food IDs, aliases and component relationships are preserved. Taxonomy mappings are additive. The curated-versus-USDA per-100g comparisons are in `fdc-catalog-reconciliation.json`; they are reference comparisons, not permission to overwrite curated values.

Before-sprint unit coverage was oz, cup, tbsp, each, slice, fl oz and scoop. The resulting catalog also supports g and tsp. Existing private custom foods remain in `user_foods`; imported reference foods are shared `foods`. Historical nutrition remains in immutable entry-item snapshots.

The audit found no existing structured USDA IDs. Existing provenance was `source_type`, `source_reference` and `is_verified`. Matching already uses both `foods.common_aliases` and the normalized `food_aliases` table (84 alias rows before import).

Highest-impact gaps were bread, turkey, ham, cheese, beef patty, burger bun, tortilla, mayonnaise, chicken, cereal and berries. Pizza crust also lacks usable nutrition, but filling it alone cannot complete either pizza recipe because their component quantities are unspecified.

## Architecture and access

`lib/nutrition/fdc/client.ts` is an operator/server-only Node module. It uses the official USDA HTTPS API with a fixed origin. It is imported only by command-line tooling and tests. No user-facing logging path invokes it, and no new public API route was added. USDA receives only deliberately supplied catalog search terms or FDC IDs; no transcript, user ID, symptom or health log is sent.

`searchFoodDataCentral` requests up to 30 results, returns at most 12 projected candidates, and prefers Foundation, then Survey (FNDDS), then SR Legacy. Within a type, USDA relevance order is preserved. Search descriptions are candidates, never automatic canonical matches. Search responses do not reliably include portions; `food(id)` fetches and maps the detail record, including supported portions. Explicit branded discovery is supported, but branded imports are rejected because their mass/volume basis needs a separate review workflow.

The imported set uses **23 Foundation, 29 Survey (FNDDS), and 9 SR Legacy** records. Higher-priority records were used when identity and required macros were compatible. Several newer Foundation records returned no core macros; compatible survey records were selected instead. Cooked foods were not mapped to raw Foundation records merely to satisfy the source preference. No branded foods were imported.

The client has a 12-second request timeout, an 8 MB response limit, a 100-entry/15-minute in-memory cache, in-flight deduplication, and a default 100-request hourly process budget (CLI: 150). HTTP 429 blocks subsequent requests for the bounded Retry-After interval. There are no automatic retries. Budgets and caches are per process, not a shared deployment-wide quota. Error messages never include the API key, request URL or provider response body.

## Configuration and commands

Use Node 24, install repository dependencies, and configure locally:

```dotenv
USDA_FDC_API_KEY=your-server-only-key
NEXT_PUBLIC_SUPABASE_URL=your-project-url
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
```

The database credentials are required only for explicit remote import/dry-run. The USDA key is required only for live discovery/preparation. Never put either secret in a `NEXT_PUBLIC_*` variable. The existing public Supabase URL is not a secret. Obtain the USDA key through the [official API guide](https://fdc.nal.usda.gov/api-guide/).

Offline validation of the shipped snapshot, with no credentials or network:

```powershell
node --experimental-strip-types scripts/fdc-local-audit.ts --input data/fdc-prepared.json --output local-fdc-review.json
```

This creates a fresh, disposable local database, applies migrations, imports all 61 records, and reports coverage, macro comparisons, missing data and duplicate candidates. Omit `--input` for a baseline audit. Output paths must be new; existing reports are never overwritten.

Live discovery and explicit preparation:

```powershell
node --env-file-if-exists=.env.local --experimental-strip-types scripts/fdc-catalog.ts discover --input data/fdc-import-manifest.json --output fdc-candidates.json
node --env-file-if-exists=.env.local --experimental-strip-types scripts/fdc-catalog.ts prepare --input data/fdc-reviewed-manifest.json --output fdc-prepared-new.json
```

The initial 64-target manifest remains an unreviewed backlog. The reviewed manifest fixes the selected FDC ID, exact description, data type, canonical identity and AXVital categories for 61 foods. Review any changed preparation output before importing it. Preparation does not approve changed descriptions or data types, invent nutrients, or write to a database. A partial preparation report with errors is not an import artifact; the command exits unsuccessfully.

For deployment, first apply `supabase/migrations/202609260001_fooddata_central.sql` using the project's normal migration workflow, then deploy the compatible application. This additive migration creates provenance and refresh tracking but deliberately imports no external dataset. After reviewing the local report, an operator can run:

```powershell
node --env-file-if-exists=.env.local --experimental-strip-types scripts/fdc-catalog.ts import --remote --dry-run --input data/fdc-prepared.json --output fdc-deployment-plan.json
node --env-file-if-exists=.env.local --experimental-strip-types scripts/fdc-catalog.ts import --remote --input data/fdc-prepared.json --output fdc-import-results.json
```

`--dry-run` verifies prepared integrity and canonical identity and returns planned payloads without writes; it is not a database transaction simulation. The local audit exercises SQL validation. Remote imports validate again in the service-only database function. A production catalog may differ from the migration seed and can therefore reject conflicts that the local audit does not have.

Each food import is atomic. A batch stops on a write failure and saves completed results. Retrying the same prepared file is safe: existing provider IDs return `unchanged`. Use a new report output path each time. To explicitly apply reviewed upstream changes, prepare a new artifact and add `--refresh` to the import command. Refresh is never scheduled automatically and requires no USDA call when importing a prepared artifact.

## Schema, identity and refresh

`food_external_sources` records provider, FDC ID, data type, description, source category, upstream date, per-100g values, content hash, imported timestamp and last-refreshed timestamp. `(source_provider, external_id)` is unique; the AXVital UUID remains the primary identity. USDA categories are stored separately from AXVital exposure categories.

`food_servings` gains source provider, external ID, stable portion key and `source_retired`. Existing curated rows keep null external identifiers. Imported serving IDs survive upsert. Explicit refresh retires disappeared upstream portions instead of deleting them; the shared readers and snapshot writer reject retired portions for new logs. Historical snapshots remain unchanged. Existing curated servings are never displaced by an upstream refresh, even when USDA differs.

The import checks reviewed identity, prepared-data digest, canonical conflicts, duplicate source IDs, exact normalized names and aliases, portion bounds, complete core macros, per-100g consistency and category existence. Missing categories or invalid portions roll back that food. It never automatically merges near matches. Curated food metadata and aliases remain intact; manifest category mappings are only added.

Authenticated users can read provenance for active foods. Only the service role can execute `import_fdc_food` or write provenance. Existing user nutrition RLS and custom-food ownership remain unchanged. No authenticated global write permission was added.

## Nutrients and portions

Full generic USDA detail records provide a per-100g basis. The mapper preserves unknown nutrients as null. Energy prefers nutrient 2048, then 2047, then 1008 in kcal; 1062 kJ is converted only when kcal is unavailable. Protein 1003, carbohydrate 1005 and fat 1004 are required. Existing optional fields preserve fiber 1079, total sugar 2000/1063, sodium 1093, caffeine 1057 and alcohol 1018. Saturated fat is not added because the existing model has no corresponding field.

Every imported food has a 100 g serving. Additional servings require USDA-supplied gram weights and safely recognized units. Scaling uses the existing `scaleNutrition`; ounce conversion and recipe aggregation use the existing serving-resolution engine. No density or gram weight is invented. Unrecognized or conflicting portions are omitted and counted.

Explicit standard count examples are the supplied whole large egg, hamburger bun and medium tortilla portions. Ordinary bread uses USDA's medium/regular slice; snack-size, crust-removed and thick/thin variants are not silently treated as that slice. Other sizes require grams or subsequent reviewed serving support. Source food details and portions remain inspectable in the compact `data/fdc-source-records.json` projection, fetched from the live API and retained for reproducibility.

Some generic canonical records deliberately use a specific reference: Bread uses survey white bread (28 g regular slice), Burger Bun a white bun (52 g), Tortilla the survey NFS medium portion (28 g), Lettuce iceberg, and Chicken the survey cooked unspecified-part/skin-not-eaten reference. These are reference recipe ingredients, not claims about every real meal. The existing recipe confirmation and portion-editing flow remains required. Curated existing foods retain their original serving assumptions.

## Composite coverage

All seeded component IDs already had canonical matches. “Serving” below means compatible with the unchanged stored quantity/unit; pizzas have no such quantities. “Macros” means the component now has complete core nutrient data, even where the recipe quantity remains unknown.

| Template | Components | Canonical matches | Compatible servings before → after | Macro components before → after | Full aggregate before → after |
|---|---:|---:|---:|---:|---|
| cereal-with-milk | 2 | 2 | 1 → 2 | 1 → 2 | no → yes |
| cheese-pizza | 3 | 3 | 0 → 0 | 0 → 2 | no → no |
| cheeseburger | 3 | 3 | 0 → 3 | 0 → 3 | no → yes |
| chicken-burrito | 3 | 3 | 2 → 3 | 2 → 3 | no → yes |
| chicken-salad | 2 | 2 | 0 → 2 | 0 → 2 | no → yes |
| chicken-tacos | 2 | 2 | 1 → 2 | 1 → 2 | no → yes |
| eggs-and-toast | 2 | 2 | 2 → 2 | 2 → 2 | yes → yes |
| greek-yogurt-with-berries | 2 | 2 | 1 → 2 | 1 → 2 | no → yes |
| grilled-chicken-with-rice | 2 | 2 | 2 → 2 | 2 → 2 | yes → yes |
| ham-sandwich | 2 | 2 | 0 → 2 | 0 → 2 | no → yes |
| hamburger | 2 | 2 | 1 → 2 | 1 → 2 | no → yes |
| oatmeal-with-fruit | 2 | 2 | 2 → 2 | 2 → 2 | yes → yes |
| peanut-butter-sandwich | 2 | 2 | 1 → 2 | 1 → 2 | no → yes |
| pepperoni-pizza | 4 | 4 | 0 → 0 | 0 → 3 | no → no |
| turkey-sandwich | 2 | 2 | 0 → 2 | 0 → 2 | no → yes |

The detailed report includes per-template aggregate nutrients calculated with existing Nutrition Tracker functions. No recipe component or quantity was changed.

## Reconciliation, behavior and remaining gaps

Four existing alias-collision groups remain: hamburger, minced beef, beef mince and lean ground beef. The report flags near-duplicate ground-beef names without merging different fat percentages or raw/cooked identities. The existing cooked burger patty is retained without a second mapping to the same FDC ID used by the generic beef-patty component. A separate white-bread canonical food was not created because the reviewed generic Bread already uses that USDA identity. Pizza crust was not mapped to a complete pizza or focaccia from loose search results.

Nineteen records still lack direct macro servings, including 15 recipe records (13 can now aggregate their components), pizza crust, the taxonomy-only tacos/salad-with-chicken records, and Coca-Cola Zero Sugar. The latter would require an explicitly reviewed branded workflow. Detailed missing-serving and taxonomy-only lists are in the reconciliation report.

Manual search now includes serving-backed USDA-enriched component-library foods through the provenance relation, while incomplete taxonomy-only foods stay hidden. Voice and manual logging still read the same local canonical IDs, servings and aliases. Both persist through the existing authoritative Nutrition Tracker paths. Added mayonnaise still needs the user's quantity review. USDA never parses voice, and unavailable USDA does not affect already-local logging.

## Files and validation

- `.env.example`: server-only key documentation.
- `lib/nutrition/fdc/{client,mapping,import,reconcile}.ts`: bounded external client, pure mapping, reviewed import and reconciliation.
- `lib/nutrition/nutrition.ts`, `food-service.ts`: enriched manual catalog visibility and retired-serving filtering.
- `supabase/migrations/202609260001_fooddata_central.sql`: additive metadata, protected import and retired-serving rejection.
- `scripts/fdc-catalog.ts`, `fdc-local-audit.ts`: explicit remote operator workflow and credential-free local audit.
- `data/fdc-{import-manifest,reviewed-manifest,prepared,source-records}.json`: target backlog, reviewed identities, prepared snapshot and compact live-source evidence.
- `lib/nutrition/fdc.test.ts`: deterministic mapping/client tests and a real PostgreSQL import, permissions, preservation, refresh, all-template and voice/manual integration regression.
- `docs/fdc-catalog-before.json`, `fdc-catalog-reconciliation.json`: before audit and full reproducible import/comparison report.

Tests never call live USDA. They verify representative egg, chicken breast, bread, milk, rice, Greek yogurt, mayonnaise and pepperoni math; malformed data, missing macros/portions, HTTP errors, cache/rate behavior, source uniqueness, migration reapplication, import reruns, unchanged curated data, shared recipe math, three eggs, turkey sandwich with reviewed mayo, grilled chicken and rice, cereal with milk, Greek yogurt with reviewed blueberry quantities, and equal voice/manual persisted totals. Existing nutrition/voice/composite/UI tests remain in the full suite.

Validation completed:

| Check | Result |
|---|---|
| Focused deterministic USDA tests | 4 passed, including the PostgreSQL and UI-service integration regression |
| Full suite, including nutrition, voice, composites and UI regressions | 693 passed; 0 failed, skipped or cancelled |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed after removing one unused test import |
| `npm run build` | Passed, Next.js 16.3.3 production build |
| Live official USDA search/detail reads | Verified; snapshot retained |
| Explicit local import of reviewed snapshot | 61 imported/enriched; 0 failures |
| Migration reapplication and import retry | Verified in PostgreSQL tests |
| Built browser JavaScript key check | 64 bundles checked; zero USDA key matches |
| Production database import / physical device | Not performed |

## Limitations and next sprint

This is catalog tooling and a deployable snapshot, not an end-user USDA search UI. It does not automatically fill missing household portions on already-curated foods, support every USDA portion phrase, import branded records or synchronize upstream changes. The existing bounded catalog loaders still need pagination before substantially larger catalogs or many retained historical portions. Process-local rate control should become shared only if external discovery becomes a multi-worker service.

The next focused sprint should provide reviewed pizza crust and recipe quantities, explicit portion variants, and a small operator comparison/review interface. Keep raw/cooked and fat-percentage identities separate and expand only through reviewed sources.

USDA references: [API guide](https://fdc.nal.usda.gov/api-guide/) and [Foundation Foods documentation](https://fdc.nal.usda.gov/Foundation_Foods_Documentation/).
