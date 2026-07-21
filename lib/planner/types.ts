export const ACTIVITY_TYPES = [
  "habit", "workout", "supplement", "medication", "nutrition", "hydration",
  "mobility", "recovery", "cardio", "rehab", "mindfulness", "custom",
] as const;

export const RECURRENCE_TYPES = [
  "none", "daily", "weekdays", "specific_days", "weekly", "interval",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type RecurrenceType = (typeof RECURRENCE_TYPES)[number];
export type OccurrenceStatus = "planned" | "completed" | "skipped";

export type PlannedActivity = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  activity_type: ActivityType;
  recurrence_type: RecurrenceType;
  start_date: string;
  end_date: string | null;
  scheduled_time: string | null;
  days_of_week: number[] | null;
  interval_days: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PlannedActivityOccurrence = {
  id: string;
  user_id: string;
  planned_activity_id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: OccurrenceStatus;
  completed_at: string | null;
  skipped_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  planned_activity?: PlannedActivity;
};

export type CreatePlannedActivityInput = {
  title: string;
  description?: string | null;
  activity_type: ActivityType;
  recurrence_type: RecurrenceType;
  start_date: string;
  end_date?: string | null;
  scheduled_time?: string | null;
  days_of_week?: number[] | null;
  interval_days?: number | null;
  is_active?: boolean;
};

export type UpdatePlannedActivityInput = Partial<CreatePlannedActivityInput>;
