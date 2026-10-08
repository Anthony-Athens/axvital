# Workout rescheduling

## Root cause and date readers

Weekly Planner loads `planned_activity_occurrences.scheduled_date` and groups cards by that calendar date. Its only reschedule entry point is Edit → ActivityForm → Start date (and Scheduled time); repository inspection found no drag-and-drop reschedule handler.

Previously `updatePlannedActivity` updated `planned_activities.start_date`, then deleted future planned occurrences and let the planner regenerate them. It did not update `planned_workouts.scheduled_date`, the canonical date used by upcoming workout range queries and workout details. Deleting the original occurrence also set the workout's occurrence foreign key to null. Thus the planner displayed the new date while the workout still aged out according to the old date.

Today uses the planner occurrence date; WorkoutsHome uses the planned workout date from today through the current month's end; workout details load the original workout by ID. WorkoutsHome's existing current-month window is preserved, so a workout moved into a later month appears in that month's range and in its planner week/details, not immediately in the current month's list.

## Fix

`updatePlannedActivity` remains the shared authorized edit entry point. It now invokes the `update_planned_activity` PostgreSQL RPC. The function uses SECURITY INVOKER, explicit authenticated ownership and existing RLS. It locks the activity, planned workout and original occurrence and updates the canonical workout date/time, occurrence date/time and activity date/time within one transaction. Any constraint or persistence failure rolls back all updates. It does not create a workout or replace the occurrence. Only requested activity fields and workout/occurrence schedule fields change; workout snapshots, supersets, sets and configuration retain their IDs and contents.

Started/completed workouts, workouts with sessions, and previously mismatched/detached schedules are rejected. Ordinary activity recurrence edits continue preserving completed/skipped occurrences and now perform their activity update/occurrence cleanup in the same transaction too.

The edit form restores its original date/time on failure, displays an error and leaves the calendar unchanged. On success, the planner refreshes and notifies browser-side Supabase readers. Today, workout lists and details re-read on schedule changes, route activation, focus, visibility return and cross-tab storage invalidation. `router.refresh()` also runs after commit; it alone does not reload client-side Supabase state. Workout cards now link directly to the original planned workout when a linked ID is available.

Date inputs remain YYYY-MM-DD strings and are persisted as PostgreSQL DATE, with no timestamp conversion. Existing local-today and UTC calendar-arithmetic conventions remain in use.

## Regression coverage

- Actual scheduling service creates date A; the real edit RPC moves the same workout to B.
- Database records and Today/planner readers agree; A is empty, B has exactly one occurrence and one workout; passing A does not remove B from the upcoming date range.
- Forward/backward week moves, month boundaries and New York/UTC/UTC+14 database settings preserve calendar dates.
- Forced failure after workout and occurrence writes rolls back all three records; invalid dates, target occurrence collisions and another user's edits also fail without a partial move.
- The original workout can be opened and started on B. Its new session references the original workout and occurrence, with the preserved superset exercises and planned sets.
- Started/completed sessions cannot be rescheduled and completed history remains unchanged.
- A rendered WeeklyPlanner/ActivityForm/TodayPlan/WorkoutsHome/PlannedWorkoutDetail integration test waits for the real transactional save, restores failures and confirms every view refreshes and the Open Workout link retains the original ID. Router/Supabase transport boundaries are test adapters; this is not a deployed Supabase browser test.

Validation completed: **100 relevant tests passed**, plus `npm run typecheck`, full-project `npm run lint`, `npm run build`, and `git diff --check`. The date-editor UI regression was also rerun after the final success-message reset.

Run:

```powershell
node --experimental-strip-types --test lib/planner/*.test.ts lib/workouts/*.test.ts lib/habits/*.test.ts lib/protocols/*.test.ts
npm run typecheck
npm run lint
```

## Migration and reconciliation

Apply `202610080002_atomic_workout_rescheduling.sql` before deploying the application code. No production migration or data reconciliation was performed.

For a running local Supabase stack:

```powershell
npx supabase migration list --local
npx supabase migration up --local
```

For staging, first verify the linked project and review ALL pending migrations:

```powershell
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

Previously rescheduled workouts **may require reconciliation**. Missing occurrence links or inconsistent dates are candidates, not evidence of the user's intended date. The migration deliberately does not repair them. Use an authorized read-only database session to inspect candidates, then ask the owner for the intended date before any separately reviewed repair:

```sql
select w.id as planned_workout_id, w.user_id,
       w.scheduled_date as workout_date,
       a.start_date as activity_date,
       o.scheduled_date as occurrence_date,
       w.planned_activity_id, w.planned_activity_occurrence_id
from public.planned_workouts w
left join public.planned_activities a
  on a.id = w.planned_activity_id and a.user_id = w.user_id
left join public.planned_activity_occurrences o
  on o.id = w.planned_activity_occurrence_id and o.user_id = w.user_id
where w.status in ('draft', 'planned')
  and (a.id is null or o.id is null
       or o.planned_activity_id is distinct from w.planned_activity_id
       or a.start_date is distinct from w.scheduled_date
       or o.scheduled_date is distinct from w.scheduled_date);
```

After staging deployment, smoke-test an A→B edit, navigation between weeks, Today on B, the direct workout link and starting the original workout. Production migration application remains a separate deployment action.
