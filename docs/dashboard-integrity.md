# Dashboard integrity audit

Before: `/dashboard` loads 30 days of `daily_checkins`, the latest 10 `health_events` (renders 5), and the latest `weekly_recaps`. HabitSummary and ProtocolSummary have independent loaders. Recent Activity has no structured nutrition, symptom, episode, workout, or routine source.

Existing timeline adapters cover `daily_checkins`, `health_events`, `nutrition_entries` + item snapshots, `user_symptom_events` + condition labels, `condition_episodes` + condition labels, `workout_sessions` + exercise/set snapshots, `planned_activity_occurrences` + planned activity/protocol labels, and `experiment_phase_events`. Condition and symptom catalogs are context, not separate logged events. Nutrition and structured symptom writes do not mirror into health_events. Workout completion updates a planner occurrence; it must not become an additional habit. Protocol-linked occurrences are classified as protocol actions.

The Dashboard's averages, sleep mapping, trend construction, and stored recap loader are separate from the activity feed and retain their formulas. The existing timeline workout adapter uses start time and labels every non-in-progress state Completed. The Dashboard projection corrects these terminal-state representations without changing the shared timeline or workout execution. Date-only check-ins do not display the artificial noon anchor as a logged time.

## Delivered hierarchy

Before: oversized hero/check-in count → separate habit/protocol summaries → five metrics → low-data notice → nested recap counters → three charts → five generic health events.

After: concise Health Overview/date context → up to three populated signals (energy, mood, sleep) → Recent Activity → existing trends → recap and routine navigation → health disclaimer. Mobile signal rows are compact; Recent Activity comes before charts. Streak and latest weight move to secondary context. Redundant recap counters and the Dashboard-only habit/protocol summary instances are removed; their source components and calculations remain unchanged. This also removes the Dashboard's per-protocol summary queries.

## Recent Activity sources

| Canonical source | Activity and timestamp |
| --- | --- |
| `health_events` | Food, fluid, supplement, medication, exercise, symptom, note and other legacy logs; local `event_date` + `event_time` |
| `nutrition_entries` + `nutrition_entry_items.source_name` | One food/meal entry, regardless of item count; `consumed_at` |
| `user_symptom_events` + `symptoms.name` | One symptom event; `started_at`, optional severity |
| `workout_sessions` | One session; terminal `ended_at`, otherwise `started_at`; duration only when recorded |
| `planned_activity_occurrences` + `planned_activities` + `user_protocols.name` | Habit/protocol completion or skip; `completed_at` / `skipped_at` |
| `daily_checkins` | One daily observation on `checkin_date`, without a clock |
| `condition_episodes` + condition labels | Separate started/resolved facts at `started_at` / `ended_at` |
| `experiment_phase_events` + experiment name | Existing meaningful lifecycle events at `occurred_at` |

Condition catalogs, condition setup records, templates, planned-but-unperformed actions, workout sets, and symptom-condition joins are not separate activity events. No condition is invented from a symptom association. Nutrition totals and macro calculations are intentionally not duplicated in this summary; meal names are sufficient detail.

The loader uses the same canonical domains as the timeline but a separate lightweight projection: existing adapters fetch deep workout sets, use scheduled-date filtering for routines, and require start-time filtering for workouts. Reusing those unchanged would omit late completions or load unnecessary data. Shared timeline behavior is intentionally untouched.

## Integrity, chronology, and bounds

Deduplicate by source type + source ID, with lifecycle phase retained for episode starts/resolutions. Workout planner records are excluded by activity type; matching `planned_activity_occurrence_id` also suppresses mirrors by stable relationship. Same-name or same-time independently logged records remain separate. No text-based cross-table merge is attempted because no mirrored nutrition/symptom link is present in the audited writers/schema.

Queries use verified user ID and existing RLS. Twelve fixed parallel query branches, 40 rows per branch, a 14-local-day window, and 12 displayed items. Separate completion/start and completion/skip branches prevent scheduled/start dates from dropping late completions. There are no per-item or per-protocol requests. Deleted nutrition/symptom records and archived episodes are excluded. View timeline opens existing `/health/timeline`; no new history feature.

Actual timestamps are compared as instants, not ISO text, and displayed using browser-local Intl. Date-only health records/check-ins and old untimed routine completions keep their logical date, sort after timed records on the same day, and explicitly say Time not recorded. A creation timestamp is used only when an occurrence timestamp is unavailable and the record is not a valid date-only observation. Workout end time falls back to start, then creation time. Thus backdated check-ins are not moved to the date of editing.

Loading skeletons, localized source-failure notices with Retry, and a compact empty state are independent from the check-in/recap loader. Partial results remain visible; failed refreshes retain previous results with a stale-data warning. Focus and timeline-refresh events refresh the feed, with late-response protection.

## Scope and file inventory

Modified: `app/dashboard/page.tsx`.

Created: `components/dashboard/RecentActivity.tsx`, `lib/dashboard/recent-activity.ts`, `lib/dashboard/recent-activity.test.ts`, `scripts/preview-dashboard.mjs`, and this audit.

No migration, RLS, auth, Stripe, legal/contact, nutrition totals, workout execution, habit/protocol completion, experiment, or insight-generation change. No new analytics model, dashboard filter system, or history pagination feature. The only metric-query correction is bounding check-ins at today so future rows cannot affect the existing averages/trends. Existing streak formula is retained and labeled latest recorded streak rather than implying a current streak.

## Validation

- Ten new unit tests cover instant sorting, completion chronology, canonical IDs, workout/planner suppression, independent same-name records, food/supplement/symptom projection, null metadata, creation-time fallback, date-only/local-day handling, episode phases, abandoned sessions, bounded queries and partial failures.
- TypeScript, ESLint, production build and diff whitespace checks passed.
- Full sandbox suite: 564 passed and two existing esbuild parent-directory access failures. Approved out-of-sandbox rerun of those two UI files: all 14 contained tests passed.
- Browser QA used the actual Dashboard component with read-only synthetic fixtures at 1440px, 390px and 320px. No horizontal overflow; long titles and times wrap separately; one workout row with distinct habit/protocol rows. Checked populated, empty, loading, all-source-error, partial-source-error and Retry states. No unexpected console errors in populated state.
- Live authenticated database writes and end-to-end production logging were not performed. The fixture harness is localhost-only, never imported by application routes, and requires no account. It is retained for repeatable visual QA; no real user data was created or deleted.
