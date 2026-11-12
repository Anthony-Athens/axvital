// Pure helpers for the Today summary tiles. Input rows come from daily_checkins.
export type SummaryRow = {
  checkin_date: string;
  energy_score: number | null;
  mood_score: number | null;
  sleep_quality: string | null;
};

export type ScoreTrend = {
  average: number | null;
  previous: number | null;
  delta: number | null;
  /** Oldest → newest daily values for the current window (null = no entry). */
  series: (number | null)[];
};

const SLEEP_ORDER = ["Poor", "Average", "Good", "Great"] as const;

function shift(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Calendar dates of the 7-day window ending on `today` (inclusive), oldest first. */
export function windowDates(today: string, days = 7, offset = 0) {
  return Array.from({ length: days }, (_, i) => shift(today, i - (days - 1) - offset));
}

function mean(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function scoreTrend(
  rows: SummaryRow[],
  today: string,
  key: "energy_score" | "mood_score",
): ScoreTrend {
  const byDate = new Map(rows.map((row) => [row.checkin_date, row]));
  const current = windowDates(today).map((d) => byDate.get(d)?.[key] ?? null);
  const prior = windowDates(today, 7, 7).map((d) => byDate.get(d)?.[key] ?? null);
  const average = mean(current.filter((v): v is number => v !== null));
  const previous = mean(prior.filter((v): v is number => v !== null));
  const round = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
  return {
    average: round(average),
    previous: round(previous),
    delta: average !== null && previous !== null ? round(average - previous) : null,
    series: current,
  };
}

export type SleepSummary = {
  /** Most frequent quality in the window; ties resolve to the better rating. */
  typical: (typeof SLEEP_ORDER)[number] | null;
  counts: Partial<Record<(typeof SLEEP_ORDER)[number], number>>;
  /** Oldest → newest; 0 = no entry, 1–4 = Poor…Great. */
  series: number[];
};

export function sleepSummary(rows: SummaryRow[], today: string): SleepSummary {
  const byDate = new Map(rows.map((row) => [row.checkin_date, row]));
  const counts: SleepSummary["counts"] = {};
  const series = windowDates(today).map((d) => {
    const q = byDate.get(d)?.sleep_quality as (typeof SLEEP_ORDER)[number] | undefined;
    const index = q ? SLEEP_ORDER.indexOf(q) : -1;
    if (index >= 0) counts[q!] = (counts[q!] ?? 0) + 1;
    return index + 1;
  });
  let typical: SleepSummary["typical"] = null;
  for (const q of SLEEP_ORDER)
    if ((counts[q] ?? 0) > 0 && (counts[q] ?? 0) >= (typical ? (counts[typical] ?? 0) : 0))
      typical = q;
  return { typical, counts, series };
}

/** Consecutive days ending today (or yesterday, if today is not logged yet) with a check-in. */
export function checkinStreak(rows: SummaryRow[], today: string) {
  const dates = new Set(rows.map((row) => row.checkin_date));
  let cursor = dates.has(today) ? today : shift(today, -1);
  let streak = 0;
  while (dates.has(cursor)) {
    streak++;
    cursor = shift(cursor, -1);
  }
  return streak;
}
