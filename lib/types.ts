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
  userId: string;
  date: string;
  energyScore: number;
  moodScore: number;
  sleepQuality: "poor" | "average" | "good" | "great";
  exerciseLevel: "none" | "light" | "moderate" | "intense";
  nutritionQuality: "poor" | "average" | "good" | "excellent";
  stressLevel: "low" | "medium" | "high";
  alcohol: boolean;
  weight?: number | null;
  createdAt: string;
  updatedAt?: string | null;
};

export type HealthEvent = {
  id: string;
  userId: string;
  type: HealthEventType;
  occurredAt: string;
  description?: string | null;
  amount?: string | null;
  dose?: string | null;
  duration?: string | null;
  intensity?: "light" | "moderate" | "intense" | string | null;
  severity?: number | null;
  notes?: string | null;
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  supplementName?: string | null;
  doseAmount?: number | null;
  doseUnit?: string | null;
  exerciseType?: string | null;
  durationMinutes?: number | null;
  distance?: number | null;
  distanceUnit?: string | null;
  tags?: string[];
  createdAt: string;
  updatedAt?: string | null;
};

export type HealthEventRow = {
  id: string;
  user_id: string;
  type: HealthEventType;
  occurred_at: string;
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
  updated_at?: string | null;
};
