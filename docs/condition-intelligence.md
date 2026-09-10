# Condition Intelligence — Release 2

Entry: `/my-health` (existing HealthHome), then `/my-health/conditions/[id]` from a condition card. `/health` and condition management remain available. Both paths share the Me navigation and authentication/onboarding protections.

The server page verifies authentication and condition ownership through existing Supabase helpers, then loads bounded data. `lib/condition-intelligence/load.ts` selects minimal fields with explicit owner filters and existing RLS. No service credentials, mutations, migrations, or chart dependencies are introduced. Condition categories and symptom mappings remain in the existing catalog model.

`model.ts` owns shared types, range, lookback, metric calculations, daily tick aggregation and plotting coordinates. Its Activity type now optionally retains check-in observations, and it defines ConditionAssociation and per-episode evidence types. `associations.ts` is a pure calculation utility called by the existing loader, not another loading or normalization pipeline. Components in `components/health/intelligence` accept normalized props without Supabase dependencies. The parent accepts precomputed associations, or computes them with the same utility for demo inputs. `mode="marketing"` removes application links; no marketing route or demo data ships in the application. The standalone browser QA script uses synthetic records only.

Sources: condition_episodes, health_events (nutrition, fluid, supplements, exercise, symptoms, medication, notes), daily_checkins, nutrition_entries, workout_sessions, user_symptom_events. Each physical table is queried separately because there is no unified server aggregation endpoint; categories within health_events share one query. Queries page in 500-row batches over 12 months plus the initial descriptive lookback. Activity over 10,000 rows per source is omitted with an incomplete-source notice, never silently counted as complete. An episode read failure produces a retry state. The existing episode query also includes episodes overlapping the visible period (older ongoing, missing-end, or recently ended episodes); these exclude active days from baseline but do not appear as new onsets or enter the displayed start-based metrics. No query per factor or episode is added.

Release 2 changes the fixed default from 18 to 12 months through CONDITION_RANGE_MONTHS and rangeStart. The helper supports future month lengths and clamps leap/month-end dates; no range controls are added. All metrics describe episodes starting in the last 12 months. Average interval averages elapsed start-to-start days. Time since latest episode uses its start. Duration averages valid completed durations; latest completed duration selects the latest end timestamp. Reopened episodes ignore stale end timestamps. Severity averages nonmissing episode-level overall_severity (1–10); this field can change when an episode is updated. Most recent severity uses the latest start, without falling back to an older recorded value.

Elapsed days are 24-hour units, displayed to one decimal. Descriptive timestamped lookbacks remain [start minus 7 days, start). Date-only records use the seven UTC calendar days preceding onset day. Legacy event times lack a timezone and are interpreted as UTC explicitly in this release. The configurable constant is PRE_EPISODE_LOOKBACK_DAYS. Descriptive cards may contain the same record in overlapping windows. Counts represent logs, not distinct real-world activities; no cross-source equivalence is inferred.

The timeline is a daily view: episode markers are placed at UTC onset-day boundaries, daily aggregated ticks at day midpoints, and shading covers the seven preceding calendar days. All use timelineX. Activity types retain staggered rows *inside* the shaded plotting area; dark episode strokes and dots render on top. Interval labels occupy a separate lower band, and date labels sit below it. timelineLayout sizes the plot for the category count to avoid marker clipping. Exact timestamp descriptive summaries can differ at the boundary from this calendar-day visualization.

Missing measurements stay missing. No episodes shows onboarding text; one episode explains the interval requirement; sparse windows show no recorded activity; incomplete reads show a notice. Metrics collapse to one column at 320px, two from 390px, and three on desktop. Only the keyboard-focusable timeline region scrolls horizontally. No global overflow suppression is used.

## Supported factors

All four factors use the existing daily_checkins table. Each factor evaluates only a valid answer for that field, not whether the overall check-in is complete. Missing, null, unrecognized, and invalid answers are ignored independently. Identical duplicate daily answers count once; conflicting duplicate answers make that factor/day unknown.

| Factor | Eligible answer | Present | Absent |
| --- | --- | --- | --- |
| Poor sleep quality | Poor, Average, Good, Great | Poor | Average, Good, Great |
| High self-reported stress | Low, Medium, High | High | Low, Medium |
| Low energy (1–3/10) | Integer 1–10 | 1–3 | 4–10 |
| Exercise reported | None, No Workout, Light, Moderate, Intense | Light, Moderate, Intense | None, No Workout |

Sleep quality is not sleep duration. Exercise is a self-report, not a workout-session count. Nutrition target adherence, supplement adherence, and medication adherence are omitted because optional logs do not establish reliable absence or historical targets in these normalized inputs. Symptoms without a log are not interpreted as symptom-free days.

## Comparison and evidence methodology

Analysis is aligned with the visible 12 months, but uses only full UTC days wholly inside it: ceil(range start) through the day before today. This excludes the partial first day and current day. Extra lookback data loaded before the range remains available to descriptive cards, but never enters association denominators.

For every visible onset, reuse lookback at UTC midnight to define the previous seven days. Union those day sets. Exclude all selected-condition episode days from BOTH comparison groups, including onset and resolved end days. Missing/invalid end times are treated conservatively as ongoing through today. Older overlapping episodes participate in this exclusion. Baseline comprises eligible answered days outside all episode and lookback days. An untracked day never counts as absence. Archived episodes are excluded by the existing archival convention.

The pre-episode rate is factor-present days divided by eligible days in the union of lookbacks. Baseline rate uses eligible non-episode/non-lookback days. Shared days count only once in either population. Per-episode counts intentionally retain their individual windows: an episode is eligible with at least one usable non-episode lookback day, and “observed before” requires at least one present day. A shared day can support two episode observation counts, so these are not independent replications.

Thresholds are centralized in associations.ts: at least 2 eligible episodes, 7 unique eligible lookback days, 28 eligible baseline days, and 3 factor-present days across both groups. These are practical display gates, not statistical significance criteria. Incomplete check-in reads suppress every factor. Unsupported comparisons return null rates/ratios, display “Not enough data yet,” and retain raw counts and missing requirements in evidence.

When sufficient, relativeRate = preEpisodeRate / baselineRate. Zero baseline yields null and explanatory text, never Infinity. Zero pre-episode rates can be displayed with adequate factor observations in baseline; they do not generate a Key Insight. Equal rates are described as equal. Raw unrounded rates determine ranking and ratios; percentages are rounded for display.

Quantity cues: Limited data below the gates; Moderate data coverage after the gates; More data coverage with at least 4 eligible episodes, 21 unique eligible lookback days and 60 baseline days. These labels do not measure effect size, confidence, clinical validity, or completeness relative to all possible days.

Key Insight considers sufficient factors with a strictly greater pre-episode rate and observations before at least 2 eligible episodes. Sort by descending absolute rate difference, then fraction of eligible episodes preceded by the factor, then total eligible-day count, then stable factor key. No opaque score, significance test, or causal interpretation is used. If nothing qualifies, show either a data-building state or “No repeated increase met the Key Insight criteria.”

Native details/summary disclosures provide keyboard/touch-accessible View evidence: definitions, onset dates, full lookback dates, per-window eligibility and presence counts, unique combined counts, baseline counts and unmet gates. Windows with no usable days are explicitly ineligible. AssociationEvidence includes normalized eventIds for later marker highlighting; the current daily/category aggregation has no factor-selection state, so exact interactive highlighting is deferred. The new ConditionPatterns component stays presentation-only and accepts normalized associations for app/demo reuse.

## Verification and limitations

Pure calculation and loader tests cover interval/year boundaries, durations, ongoing episodes, severity, half-open lookback boundaries, date-only logs, aggregation, owner/date query filters, carry-in episode predicates and partial failures. Release 2 adds tests for range/leap-day handling, shared plotting coordinates, vertical marker bounds, factor eligibility, missing/duplicate days, pre/baseline exclusions, overlapping windows, sparse/one-episode inputs, thresholds, zero/equal rates and ranking. Browser QA uses `node scripts/condition-intelligence-browser.mjs` after building; `?state=empty`, `?state=one`, and `?state=sparse` exercise data-building states. Browser checks use synthetic data; live authenticated Supabase data is not exercised.

Release 2 validation: full suite 609/609 passed, TypeScript passed, ESLint passed, production build passed. Synthetic browser checks at 320, 390 and 1440px showed no page-level horizontal overflow. Timeline keyboard scrolling moved only the timeline region; activity rows remained inside shading. Evidence disclosures opened with 44px summary targets, and no-episode, one-episode and sparse states suppressed rates. Physical touch-device testing and live authenticated database/browser verification remain outside this QA run.

Limitations: descriptive, unadjusted comparisons only. Tracking selection, seasonality, treatment changes, correlated factors and repeated/shared days may explain observed differences. No multiple-comparison correction, uncertainty intervals, independence assumptions or clinical validation are claimed. Long ongoing episodes can eliminate baseline eligibility. Dense episode labels can still overlap. UTC dates may differ from the user's local calendar; only currently stored check-in answers are available, not historical edit snapshots.

Release 3 candidates: explicit account-timezone semantics, evidence-to-marker selection using eventIds, dense-marker collision handling, date-range controls, stronger coverage and uncertainty methods, and additional factors only after reliable observation/absence contracts exist. Any experiment integration needs its own scoped release. Existing advanced pattern screens are not embedded; no forecasting, notifications, treatment recommendations or automated experiments are added.
