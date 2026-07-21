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
export type TrackingType = "binary" | "quantity" | "duration";

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
  tracking_type: TrackingType;
  target_value: number | null;
  target_unit: string | null;
  minimum_value: number | null;
  allow_partial_completion: boolean;
  habit_color: string | null;
  habit_icon: string | null;
  sort_order: number | null;
  paused_at: string | null;
  reactivated_at: string | null;
  recurrence_active_from: string | null;
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
  actual_value: number | null;
  completion_percentage: number | null;
  completion_note: string | null;
  first_completed_at: string | null;
  last_updated_at: string | null;
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
  tracking_type?: TrackingType;
  target_value?: number | null;
  target_unit?: string | null;
  minimum_value?: number | null;
  allow_partial_completion?: boolean;
  habit_color?: string | null;
  habit_icon?: string | null;
  sort_order?: number | null;
  recurrence_active_from?: string | null;
};

export type UpdatePlannedActivityInput = Partial<CreatePlannedActivityInput>;
