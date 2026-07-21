import type { PlannedActivityOccurrence } from "../planner/types";

type StreakOccurrence = Pick<PlannedActivityOccurrence, "scheduled_date" | "status">;

// Only generated scheduled occurrences participate. Today remains neutral while
// planned; skipped and past-planned break a run; future dates are ignored.
export function calculateCurrentStreak(rows: StreakOccurrence[], today: string) {
  const eligible = [...rows].filter((row) => row.scheduled_date <= today).sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date));
  if (eligible[0]?.scheduled_date === today && eligible[0].status === "planned") eligible.shift();
  let streak = 0;
  for (const row of eligible) { if (row.status !== "completed") break; streak += 1; }
  return streak;
}

export function calculateBestStreak(rows: StreakOccurrence[], today = "9999-12-31") {
  let best = 0; let run = 0;
  [...rows].filter((row) => row.scheduled_date <= today).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)).forEach((row) => { run = row.status === "completed" ? run + 1 : 0; best = Math.max(best, run); });
  return best;
}
