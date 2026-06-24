import type { SupabaseClient } from "@supabase/supabase-js";
import type { WeeklyRecap } from "@/lib/types";

type SupabaseErrorDetails = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

type DailyCheckinRow = {
  checkin_date: string;
  energy_score: number | null;
  mood_score: number | null;
  sleep_quality: string | null;
  weight: number | null;
};

type HealthEventRow = {
  event_date: string;
  event_type: string;
};

export function logWeeklyRecapError(label: string, error: SupabaseErrorDetails) {
  console.error(label, {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
  });
}

function isNoRowsError(error: SupabaseErrorDetails) {
  const message = error.message?.toLowerCase() ?? "";
  const details = error.details?.toLowerCase() ?? "";

  return (
    error.code === "PGRST116" ||
    message.includes("no rows") ||
    details.includes("0 rows")
  );
}

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysAgoFrom(anchorDate: string, days: number) {
  const date = new Date(`${anchorDate}T12:00:00`);
  date.setDate(date.getDate() - days);
  return localDateString(date);
}

function average(values: Array<number | null | undefined>) {
  const validValues = values.filter(
    (value): value is number => typeof value === "number" && !Number.isNaN(value),
  );

  if (!validValues.length) {
    return null;
  }

  return Number(
    (validValues.reduce((total, value) => total + value, 0) / validValues.length).toFixed(1),
  );
}

function sleepScore(value: string | null) {
  const scores: Record<string, number> = {
    poor: 1,
    average: 2,
    good: 3,
    great: 4,
  };

  return scores[value?.trim().toLowerCase() ?? ""] ?? null;
}

function calculateStreak(checkins: DailyCheckinRow[]) {
  const dates = new Set(checkins.map((checkin) => checkin.checkin_date));
  const sortedDates = [...dates].sort((a, b) => b.localeCompare(a));

  if (!sortedDates.length) {
    return 0;
  }

  const cursor = new Date(`${sortedDates[0]}T12:00:00`);
  let streak = 0;

  while (dates.has(localDateString(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function formatMetric(value: number | null) {
  return value === null ? "--" : value.toFixed(1);
}

function weightChange(checkins: DailyCheckinRow[]) {
  const weightEntries = checkins
    .filter((checkin) => typeof checkin.weight === "number")
    .sort((a, b) => a.checkin_date.localeCompare(b.checkin_date));

  if (weightEntries.length < 2) {
    return null;
  }

  const first = weightEntries[0].weight;
  const last = weightEntries[weightEntries.length - 1].weight;

  if (first === null || last === null) {
    return null;
  }

  return Number((last - first).toFixed(1));
}

function buildTitle(averageEnergy: number | null, averageSleep: number | null, streak: number) {
  if (averageEnergy !== null && averageEnergy >= 7) {
    return "Strong Week for Energy";
  }

  if (averageSleep !== null && averageSleep >= 3) {
    return "Sleep Continues to Improve";
  }

  if (streak >= 7) {
    return "Consistency Building";
  }

  return "Weekly Patterns Taking Shape";
}

function buildWentWell({
  averageEnergy,
  averageMood,
  averageSleep,
  exerciseCount,
  supplementCount,
  streak,
}: {
  averageEnergy: number | null;
  averageMood: number | null;
  averageSleep: number | null;
  exerciseCount: number;
  supplementCount: number;
  streak: number;
}) {
  const bullets = [
    streak >= 7
      ? "You completed a full week of Daily Check-Ins."
      : `${streak} consecutive check-in day${streak === 1 ? "" : "s"} are building consistency.`,
    exerciseCount > 0
      ? `You logged ${exerciseCount} exercise event${exerciseCount === 1 ? "" : "s"} this week.`
      : "You captured baseline data that can make future exercise patterns easier to compare.",
    averageEnergy !== null && averageEnergy >= 7
      ? `Average energy was strong at ${formatMetric(averageEnergy)}.`
      : averageMood !== null && averageMood >= 7
        ? `Average mood was steady at ${formatMetric(averageMood)}.`
        : averageSleep !== null && averageSleep >= 3
          ? "Sleep quality was a supportive signal this week."
          : `You logged ${supplementCount} supplement event${supplementCount === 1 ? "" : "s"} for extra context.`,
  ];

  return bullets.slice(0, 3);
}

function buildWatchFor({
  averageEnergy,
  averageMood,
  averageSleep,
  symptomCount,
  weightDelta,
}: {
  averageEnergy: number | null;
  averageMood: number | null;
  averageSleep: number | null;
  symptomCount: number;
  weightDelta: number | null;
}) {
  const bullets: string[] = [];

  if (averageEnergy !== null && averageEnergy < 6) {
    bullets.push("Energy was lower this week, so sleep, stress, and activity patterns may be worth watching.");
  }

  if (averageMood !== null && averageMood < 6) {
    bullets.push("Mood trended lower this week; compare it with stress and sleep logs next week.");
  }

  if (averageSleep !== null && averageSleep < 2.5) {
    bullets.push("Sleep quality had room to improve based on this week's check-ins.");
  }

  if (symptomCount > 0) {
    bullets.push(`${symptomCount} symptom event${symptomCount === 1 ? "" : "s"} were logged this week.`);
  }

  if (weightDelta !== null && Math.abs(weightDelta) >= 2) {
    bullets.push(`Weight changed by ${weightDelta > 0 ? "+" : ""}${weightDelta} this week.`);
  }

  return bullets.length ? bullets.slice(0, 3) : ["Keep logging consistently so weekly patterns become clearer."];
}

export function buildWeeklyRecap({
  userId,
  weekStart,
  weekEnd,
  checkins,
  events,
}: {
  userId: string;
  weekStart: string;
  weekEnd: string;
  checkins: DailyCheckinRow[];
  events: HealthEventRow[];
}): WeeklyRecap | null {
  if (checkins.length < 7) {
    return null;
  }

  const averageEnergy = average(checkins.map((checkin) => checkin.energy_score));
  const averageMood = average(checkins.map((checkin) => checkin.mood_score));
  const averageSleep = average(checkins.map((checkin) => sleepScore(checkin.sleep_quality)));
  const streak = calculateStreak(checkins);
  const exerciseCount = events.filter((event) => event.event_type === "exercise").length;
  const supplementCount = events.filter((event) => event.event_type === "supplement").length;
  const symptomCount = events.filter((event) => event.event_type === "symptom").length;
  const weightDelta = weightChange(checkins);
  const title = buildTitle(averageEnergy, averageSleep, streak);
  const summaryParts = [
    `Your average energy was ${formatMetric(averageEnergy)} and average mood was ${formatMetric(averageMood)} this week.`,
    averageSleep === null
      ? "Sleep quality needs more check-ins before a weekly average is clear."
      : `Average sleep quality was ${formatMetric(averageSleep)} out of 4.`,
    exerciseCount > 0
      ? `You logged ${exerciseCount} exercise event${exerciseCount === 1 ? "" : "s"}.`
      : "No exercise events were logged this week.",
  ];

  return {
    user_id: userId,
    week_start: weekStart,
    week_end: weekEnd,
    title,
    summary: summaryParts.join(" "),
    avg_energy: averageEnergy,
    avg_mood: averageMood,
    avg_sleep: averageSleep,
    checkin_streak: streak,
    exercise_event_count: exerciseCount,
    supplement_event_count: supplementCount,
    symptom_event_count: symptomCount,
    weight_change: weightDelta,
    what_went_well: buildWentWell({
      averageEnergy,
      averageMood,
      averageSleep,
      exerciseCount,
      supplementCount,
      streak,
    }),
    watch_for: buildWatchFor({
      averageEnergy,
      averageMood,
      averageSleep,
      symptomCount,
      weightDelta,
    }),
  };
}

export async function generateWeeklyRecap(
  supabase: SupabaseClient,
  userId: string,
) {
  const today = localDateString(new Date());
  const weekStart = daysAgoFrom(today, 6);
  const weekEnd = today;
  const [checkinResult, eventResult] = await Promise.all([
    supabase
      .from("daily_checkins")
      .select("checkin_date,energy_score,mood_score,sleep_quality,weight")
      .eq("user_id", userId)
      .gte("checkin_date", weekStart)
      .lte("checkin_date", weekEnd)
      .order("checkin_date", { ascending: true }),
    supabase
      .from("health_events")
      .select("event_date,event_type")
      .eq("user_id", userId)
      .gte("event_date", weekStart)
      .lte("event_date", weekEnd),
  ]);

  if (checkinResult.error) {
    logWeeklyRecapError("Failed to load weekly check-ins", checkinResult.error);
    throw checkinResult.error;
  }

  if (eventResult.error) {
    logWeeklyRecapError("Failed to load weekly events", eventResult.error);
    throw eventResult.error;
  }

  const recap = buildWeeklyRecap({
    userId,
    weekStart,
    weekEnd,
    checkins: (checkinResult.data ?? []) as DailyCheckinRow[],
    events: (eventResult.data ?? []) as HealthEventRow[],
  });

  if (!recap) {
    return null;
  }

  console.log("Saving weekly recap payload", recap);

  const { data, error } = await supabase
    .from("weekly_recaps")
    .upsert(recap, { onConflict: "user_id,week_start" })
    .select(
      "id,user_id,week_start,week_end,title,summary,avg_energy,avg_mood,avg_sleep,weight_change,generated_at,what_went_well,watch_for,checkin_streak,exercise_event_count,supplement_event_count,symptom_event_count",
    )
    .maybeSingle();

  if (error) {
    logWeeklyRecapError("Failed to save weekly recap", error);
    throw error;
  }

  return data as WeeklyRecap;
}

export async function loadLatestWeeklyRecap(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("weekly_recaps")
    .select(
      "id,user_id,week_start,week_end,title,summary,avg_energy,avg_mood,avg_sleep,weight_change,generated_at,what_went_well,watch_for,checkin_streak,exercise_event_count,supplement_event_count,symptom_event_count",
    )
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isNoRowsError(error)) {
      return null;
    }

    logWeeklyRecapError("Failed to load latest weekly recap", error);
    throw error;
  }

  return data as WeeklyRecap | null;
}
