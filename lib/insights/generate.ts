import type { SupabaseClient } from "@supabase/supabase-js";
import { logDevError } from "@/lib/app-errors";
import type {
  InsightConfidenceLevel,
  InsightType,
  UserInsight,
} from "@/lib/types";

type SupabaseErrorDetails = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

type DailyCheckinRow = {
  user_id: string;
  checkin_date: string;
  energy_score: number | null;
  mood_score: number | null;
  sleep_quality: string | null;
  exercise_level: string | null;
  stress_level: string | null;
  alcohol: boolean | null;
};

type HealthEventRow = {
  user_id: string;
  event_date: string;
  event_type: string;
};

type InsightDraft = Omit<UserInsight, "user_id">;

export function logSupabaseError(label: string, error: SupabaseErrorDetails) {
  logDevError(label, {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
  });
}

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDateString(date);
}

function normalized(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function average(values: Array<number | null | undefined>) {
  const validValues = values.filter(
    (value): value is number => typeof value === "number" && !Number.isNaN(value),
  );

  if (!validValues.length) {
    return null;
  }

  return validValues.reduce((total, value) => total + value, 0) / validValues.length;
}

function sleepScore(value: string | null) {
  const scores: Record<string, number> = {
    poor: 1,
    average: 2,
    good: 3,
    great: 4,
  };

  return scores[normalized(value)] ?? null;
}

function confidenceLevel(sampleSize: number): InsightConfidenceLevel {
  if (sampleSize >= 20) {
    return "Strong Signal";
  }

  if (sampleSize >= 10) {
    return "Moderate Confidence";
  }

  return "Early Signal";
}

function formatDifference(value: number) {
  return Math.abs(value).toFixed(1);
}

function comparisonInsight({
  insightType,
  title,
  firstLabel,
  firstAverage,
  firstCount,
  secondLabel,
  secondAverage,
  secondCount,
  metricLabel,
  fallback,
}: {
  insightType: InsightType;
  title: string;
  firstLabel: string;
  firstAverage: number | null;
  firstCount: number;
  secondLabel: string;
  secondAverage: number | null;
  secondCount: number;
  metricLabel: string;
  fallback: string;
}): InsightDraft {
  const sampleSize = firstCount + secondCount;
  const difference =
    firstAverage === null || secondAverage === null
      ? null
      : firstAverage - secondAverage;
  const description =
    difference === null
      ? fallback
      : `${metricLabel} appears associated with ${formatDifference(
          difference,
        )} points ${difference >= 0 ? "higher" : "lower"} on ${firstLabel.toLowerCase()} compared with ${secondLabel.toLowerCase()}.`;

  return {
    insight_type: insightType,
    title,
    description,
    confidence_level: confidenceLevel(sampleSize),
    sample_size: sampleSize,
  };
}

export function generateUserInsights(
  checkins: DailyCheckinRow[],
  events: HealthEventRow[],
): InsightDraft[] {
  const exerciseEventDates = new Set(
    events
      .filter((event) => normalized(event.event_type) === "exercise")
      .map((event) => event.event_date),
  );
  const goodSleepDays = checkins.filter((checkin) =>
    ["good", "great"].includes(normalized(checkin.sleep_quality)),
  );
  const poorSleepDays = checkins.filter((checkin) =>
    ["poor", "average"].includes(normalized(checkin.sleep_quality)),
  );
  const lowStressDays = checkins.filter(
    (checkin) => normalized(checkin.stress_level) === "low",
  );
  const highStressDays = checkins.filter(
    (checkin) => normalized(checkin.stress_level) === "high",
  );
  const exerciseDays = checkins.filter(
    (checkin) =>
      exerciseEventDates.has(checkin.checkin_date) ||
      !["", "none", "no workout"].includes(normalized(checkin.exercise_level)),
  );
  const nonExerciseDays = checkins.filter((checkin) =>
    !exerciseEventDates.has(checkin.checkin_date) &&
    ["none", "no workout"].includes(normalized(checkin.exercise_level)),
  );
  const alcoholDays = checkins.filter((checkin) => Boolean(checkin.alcohol));
  const nonAlcoholDays = checkins.filter((checkin) => !checkin.alcohol);

  return [
    comparisonInsight({
      insightType: "sleep_energy",
      title: "Sleep quality and energy",
      firstLabel: "Good sleep days",
      firstAverage: average(goodSleepDays.map((checkin) => checkin.energy_score)),
      firstCount: goodSleepDays.length,
      secondLabel: "Poor sleep days",
      secondAverage: average(poorSleepDays.map((checkin) => checkin.energy_score)),
      secondCount: poorSleepDays.length,
      metricLabel: "Energy",
      fallback:
        "More sleep variety is needed before AXVital can compare sleep quality and energy.",
    }),
    comparisonInsight({
      insightType: "stress_mood",
      title: "Stress and mood",
      firstLabel: "Low stress days",
      firstAverage: average(lowStressDays.map((checkin) => checkin.mood_score)),
      firstCount: lowStressDays.length,
      secondLabel: "High stress days",
      secondAverage: average(highStressDays.map((checkin) => checkin.mood_score)),
      secondCount: highStressDays.length,
      metricLabel: "Mood",
      fallback:
        "More low and high stress days are needed before AXVital can compare stress and mood.",
    }),
    comparisonInsight({
      insightType: "exercise_energy",
      title: "Exercise and energy",
      firstLabel: "Exercise days",
      firstAverage: average(exerciseDays.map((checkin) => checkin.energy_score)),
      firstCount: exerciseDays.length,
      secondLabel: "Non-exercise days",
      secondAverage: average(nonExerciseDays.map((checkin) => checkin.energy_score)),
      secondCount: nonExerciseDays.length,
      metricLabel: "Energy",
      fallback:
        "More exercise and non-exercise days are needed before AXVital can compare exercise and energy.",
    }),
    comparisonInsight({
      insightType: "alcohol_sleep",
      title: "Alcohol and sleep quality",
      firstLabel: "Non-alcohol days",
      firstAverage: average(nonAlcoholDays.map((checkin) => sleepScore(checkin.sleep_quality))),
      firstCount: nonAlcoholDays.length,
      secondLabel: "Alcohol days",
      secondAverage: average(alcoholDays.map((checkin) => sleepScore(checkin.sleep_quality))),
      secondCount: alcoholDays.length,
      metricLabel: "Sleep quality",
      fallback:
        "More alcohol and non-alcohol days are needed before AXVital can compare alcohol and sleep quality.",
    }),
  ];
}

export async function refreshUserInsights(
  supabase: SupabaseClient,
  userId: string,
) {
  const startDate = daysAgo(29);
  const [checkinResult, eventResult] = await Promise.all([
    supabase
      .from("daily_checkins")
      .select(
        "user_id,checkin_date,energy_score,mood_score,sleep_quality,exercise_level,stress_level,alcohol",
      )
      .eq("user_id", userId)
      .gte("checkin_date", startDate)
      .order("checkin_date", { ascending: true }),
    supabase
      .from("health_events")
      .select("user_id,event_date,event_type")
      .eq("user_id", userId)
      .gte("event_date", startDate)
      .order("event_date", { ascending: false }),
  ]);

  if (checkinResult.error) {
    throw checkinResult.error;
  }

  if (eventResult.error) {
    throw eventResult.error;
  }

  const insights = generateUserInsights(
    (checkinResult.data ?? []) as DailyCheckinRow[],
    (eventResult.data ?? []) as HealthEventRow[],
  ).map((insight) => ({ ...insight, user_id: userId, is_active: true }));

  const { error: deactivateError } = await supabase
    .from("user_insights")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true);

  if (deactivateError) {
    logSupabaseError("Failed to deactivate existing insights", deactivateError);
    throw deactivateError;
  }

  if (!insights.length) {
    return [];
  }

  const { data, error: insertError } = await supabase
    .from("user_insights")
    .insert(insights)
    .select(
      "id,user_id,insight_type,title,description,confidence_level,sample_size,generated_at,is_active",
    );

  if (insertError) {
    logSupabaseError("Failed to insert refreshed insights", insertError);
    throw insertError;
  }

  return (data ?? []) as UserInsight[];
}
