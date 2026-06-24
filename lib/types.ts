export type HealthEventType =
  | "food"
  | "fluid"
  | "supplement"
  | "exercise"
  | "symptom"
  | "medication"
  | "note";

export type DailyCheckin = {
  id: string;
  user_id: string;
  checkin_date: string;
  energy_score: number;
  mood_score: number;
  sleep_quality: "Poor" | "Average" | "Good" | "Great";
  exercise_level: "None" | "No Workout" | "Light" | "Moderate" | "Intense";
  nutrition_quality:
    | "Poor"
    | "Average"
    | "Good"
    | "Excellent"
    | "Clean"
    | "Balanced"
    | "Great";
  stress_level: "Low" | "Medium" | "High";
  alcohol: boolean;
  notes?: string | null;
  tags?: string[] | null;
  weight?: number | null;
  created_at: string;
  updated_at?: string | null;
};

export type HealthEvent = {
  id: string;
  user_id: string;
  event_date: string;
  event_time: string;
  event_type: HealthEventType;
  title: string;
  description?: string | null;
  amount?: string | null;
  dose?: string | null;
  duration?: string | null;
  intensity?: "light" | "moderate" | "intense" | string | null;
  severity?: number | null;
  notes?: string | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  supplement_name?: string | null;
  dose_amount?: number | null;
  dose_unit?: string | null;
  exercise_type?: string | null;
  duration_minutes?: number | null;
  distance?: number | null;
  distance_unit?: string | null;
  tags?: string[];
  created_at: string;
};

export type HealthEventRow = {
  id: string;
  user_id: string;
  event_date: string;
  event_time: string;
  event_type: HealthEventType;
  title?: string | null;
  description?: string | null;
  amount?: string | null;
  dose?: string | null;
  duration?: string | null;
  intensity?: string | null;
  severity?: number | null;
  notes?: string | null;
  tags?: string[] | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  supplement_name?: string | null;
  dose_amount?: number | null;
  dose_unit?: string | null;
  exercise_type?: string | null;
  duration_minutes?: number | null;
  distance?: number | null;
  distance_unit?: string | null;
  created_at?: string | null;
};
