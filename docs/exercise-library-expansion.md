# Exercise library expansion

Migration: `supabase/migrations/202610080001_expand_shared_exercise_library.sql`.

Against the repository's existing seed, this adds **92 records** and covers **4 requested names by reuse/aliases** (96 defined requests total). **Icon Carry** is excluded: the repository contains no definition; the owner must define the movement and equipment before it can be represented accurately.

Reused names:
- Two Hand Kettlebell Swing → existing Kettlebell Swing.
- Kettlebell Goblet Squat → existing Goblet Squat.
- Kettlebell Squat to Press → Kettlebell Thruster.
- Kettlebell Plank Drag → Kettlebell Plank Pull Through.

The existing shared canonical names, IDs, metadata and aliases are preserved. New aliases include KB shorthand and text alternatives for combination arrows. Existing alternate shared names are matched without case/punctuation sensitivity. If multiple existing shared records match a seed entry, the migration aborts atomically for manual reconciliation; it never deletes or merges IDs referenced by workouts. Actual added/reused counts can differ on databases containing additional shared records. Private exercises and workout snapshots are untouched.

Equipment stays unspecified for Preacher Curl, Calf Raise, Back Extensions and Weighted Dips because the requested names do not establish a particular apparatus. Crunch uses bodyweight; Reaction Ball Training uses the supported `other` equipment. Descriptions are optional in this library and are not added. Holds use duration, carries use distance/duration, and combinations use completion; the builder continues to allow all set fields.

Exercise search now pages through all visible active exercises rather than discarding records after the first 300. Creating a custom exercise also checks exact normalized aliases for duplicates.

## Validation

Run from the repository root:

```powershell
node --experimental-strip-types --test lib/workouts/*.test.ts
npm run typecheck
npx eslint lib/workouts/exercises.ts lib/workouts/catalog-expansion.test.ts lib/workouts/catalog-builder-ui.test.ts
```

The database test runs repository migrations in disposable PGlite, checks counts/metadata/ID preservation, reruns the migration, exercises authenticated RLS and workout foreign keys, verifies alternate-name reuse and searches past 300 records. The browser test renders the actual selector and workout builder with seeded rows, selects all 94 affected canonical records, verifies category/equipment labels and confirms the save payload preserves exercise IDs and tracking types. Its persistence/router boundaries are mocked; this is not a deployed browser/Supabase smoke test.

## Apply

No production migration was applied. Review pending migration history before applying anything; these commands can apply other pending repository migrations too.

For a running local Supabase stack:

```powershell
npx supabase migration list --local
npx supabase migration up --local
```

For staging, ensure the linked Supabase project is staging, reconcile migration history, preview, then apply:

```powershell
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

Deploy the application changes through the project's usual deployment process. Smoke-test kettlebell/equipment/category filters, aliases (Two Hand Kettlebell Swing and Kettlebell Plank Drag), Reaction Ball Training and saving a workout against staging. Production application remains a separately reviewed deployment action.
