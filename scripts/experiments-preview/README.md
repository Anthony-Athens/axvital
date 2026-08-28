# Synthetic Experiments UI preview

Run `node scripts/experiments-preview/server.cjs` from the repository root, then open http://127.0.0.1:3101.

This isolated development harness renders the actual Experiments components using installed React, TypeScript, Tailwind and Next's bundled webpack. It does not add a production route or a test framework. Generated bundles live in a temporary directory.

All fetch requests are replaced by in-memory fixtures; unrecognized requests throw. Supabase reads are replaced by synthetic rows and mutation RPCs throw. No credentials or real user data are loaded. Reloading the page resets the fixtures. The top controls select Free/Premium and readiness states; counters expose synthetic create/save/start calls.

This is component-level browser QA, not proof of authenticated Next/Supabase integration. It does not reproduce the full application shell, pagination datasets, checkout, real source data or all server validation. Do not use it to assess server authorization. Existing API tests cover those contracts separately.
