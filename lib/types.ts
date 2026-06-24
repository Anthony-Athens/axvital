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
