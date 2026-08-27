import type { TimelineSource } from "../types.ts";
import { isCalendarDate } from "../dates.ts";
export const getCheckinEvents: TimelineSource = async ({ client, userId, startDate, endDate }) => {
  const { data, error } = await client.from("daily_checkins").select("id,checkin_date,energy_score,mood_score,sleep_quality,exercise_level,nutrition_quality,stress_level,alcohol,weight,notes,created_at,updated_at").eq("user_id", userId).gte("checkin_date", startDate).lte("checkin_date", endDate);
  if (error) throw error;
  return (data ?? []).filter(row => isCalendarDate(row.checkin_date)).map(row => ({
    id: `daily_checkin:${row.id}`, sourceId: row.id, sourceType: "daily_checkin", eventType: "checkin" as const,
    logicalDate: row.checkin_date, occurredAt: `${row.checkin_date}T12:00:00`, endedAt: null,
    title: "Daily Check-In", subtitle: [["Sleep", row.sleep_quality], ["Energy", row.energy_score], ["Mood", row.mood_score]].filter(([, value]) => value != null).map(([label, value]) => `${label} ${value}`).join(" · ") || "Partial check-in",
    description: row.notes, status: [row.energy_score, row.mood_score, row.sleep_quality, row.exercise_level, row.nutrition_quality, row.stress_level, row.alcohol].every(value => value != null) ? "completed" : "partial",
    metadata: { energy: row.energy_score, mood: row.mood_score, sleepQuality: row.sleep_quality, exerciseLevel: row.exercise_level, nutritionQuality: row.nutrition_quality, stressLevel: row.stress_level, alcohol: row.alcohol, weight: row.weight },
    editable: true, deletable: false, detailHref: `/today?date=${row.checkin_date}#daily-checkin`, editHref: `/today?date=${row.checkin_date}#daily-checkin`,
  }));
};
