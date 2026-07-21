export const EXERCISE_CATEGORIES = ["strength", "cardio", "mobility", "recovery", "rehab", "plyometric", "conditioning", "custom"] as const;
export const MOVEMENT_PATTERNS = ["horizontal_push", "horizontal_pull", "vertical_push", "vertical_pull", "squat", "hinge", "lunge", "carry", "rotation", "anti_rotation", "anti_extension", "locomotion", "isolation", "mobility", "olympic_lift", "custom"] as const;
export const EQUIPMENT_OPTIONS = ["barbell", "dumbbell", "kettlebell", "machine", "cable", "band", "bodyweight", "bench", "pull_up_bar", "treadmill", "bike", "rower", "sled", "stability_ball", "other"] as const;
export const TRACKING_TYPES = ["weight_reps", "bodyweight_reps", "duration", "distance_duration", "calories_duration", "repetitions", "completion", "custom"] as const;

export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];
export type ExerciseEquipment = (typeof EQUIPMENT_OPTIONS)[number];
export type ExerciseTrackingType = (typeof TRACKING_TYPES)[number];

export const metadataLabel = (value: string) => value.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
export const normalizeExerciseName = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
export const normalizeMetadataValue = (value?: string | null) => value?.trim().toLowerCase().replace(/[\s-]+/g, "_") || null;

export function isMetadataValue<T extends readonly string[]>(options: T, value: string | null): value is T[number] {
  return value !== null && options.includes(value);
}
