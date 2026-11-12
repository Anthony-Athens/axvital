// Synthetic rows for scripts/preview-app.mjs. Fictional data only; dates are relative
// to the viewer's local today so every screen has something current to show.
const pad = (n) => String(n).padStart(2, "0");
const day = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const at = (offset, hour, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
const today = day(0);

const checkins = Array.from({ length: 20 }, (_, i) => i)
  .filter((i) => i !== 0 && i !== 9 && i !== 12)
  .map((i) => ({
    id: `c${i}`,
    user_id: "preview-user",
    checkin_date: day(-i),
    energy_score: [7, 8, 6, 7, 7, 6, 8, 6, 5, 6, 6, 7, 6, 5, 7, 6, 6, 7, 6, 5][i],
    mood_score: [8, 7, 7, 8, 6, 7, 8, 7, 6, 7, 6, 7, 7, 6, 7, 7, 6, 7, 6, 6][i],
    sleep_quality: ["Good", "Great", "Good", "Average", "Good", "Good", "Great", "Good"][i % 8],
    exercise_level: "Moderate",
    nutrition_quality: "Good",
    stress_level: "Low",
    alcohol: false,
    weight: null,
  }));

const activity = (id, title, type, extra = {}) => ({
  id,
  title,
  activity_type: type,
  tracking_type: "binary",
  target_value: null,
  target_unit: null,
  user_protocol_id: null,
  user_protocol: null,
  protocol_links: [],
  ...extra,
});
const occurrence = (id, date, time, status, plannedActivity, extra = {}) => ({
  id,
  user_id: "preview-user",
  scheduled_date: date,
  scheduled_time: time,
  status,
  actual_value: null,
  completion_percentage: status === "completed" ? 100 : 0,
  completion_note: null,
  created_at: at(-7, 6),
  planned_workouts: [],
  planned_activity: plannedActivity,
  ...extra,
});
const creatine = activity("a-creatine", "Creatine 5 g", "supplement");
const walk = activity("a-walk", "Lunch walk", "habit");
const upperA = activity("a-upper-a", "Upper Body A", "workout");
const lowerB = activity("a-lower-b", "Lower Body B", "workout");
const windDown = activity("a-wind", "Evening wind-down", "recovery");

const weekStart = (() => {
  const d = new Date();
  const back = (d.getDay() + 6) % 7; // Monday
  return -back;
})();
const occurrences = [];
for (let i = 0; i < 7; i++) {
  const offset = weekStart + i;
  const past = offset < 0;
  const isToday = offset === 0;
  const date = day(offset);
  occurrences.push(
    occurrence(`o-cr-${i}`, date, "07:30:00", past || isToday ? "completed" : "planned", creatine),
  );
  if (i < 5)
    occurrences.push(
      occurrence(
        `o-walk-${i}`,
        date,
        "12:15:00",
        past ? (i === 1 ? "skipped" : "completed") : isToday ? "completed" : "planned",
        walk,
      ),
    );
  if (i === 0 || i === 3)
    occurrences.push(
      occurrence(`o-up-${i}`, date, "18:00:00", past ? "completed" : "planned", upperA, {
        planned_workouts: [{ id: "pw-1" }],
      }),
    );
  if (i === 5)
    occurrences.push(
      occurrence(`o-low-${i}`, date, "09:00:00", "planned", lowerB, {
        planned_workouts: [{ id: "pw-2" }],
      }),
    );
  if (i < 6)
    occurrences.push(
      occurrence(
        `o-wind-${i}`,
        date,
        "21:30:00",
        past ? (i === 2 ? "skipped" : "completed") : "planned",
        windDown,
      ),
    );
}

const timelineEvents = [
  {
    id: "t1",
    sourceId: "c0",
    sourceType: "daily_checkins",
    eventType: "checkin",
    logicalDate: today,
    occurredAt: at(0, 7, 40),
    endedAt: null,
    title: "Daily Check-In",
    summary: "Energy 7 · Mood 8 · Sleep Good",
    details: [],
  },
  {
    id: "t2",
    sourceId: "n1",
    sourceType: "nutrition_entries",
    eventType: "meal",
    logicalDate: today,
    occurredAt: at(0, 8, 5),
    endedAt: null,
    title: "Oats and berries",
    summary: "Breakfast · 420 kcal",
    details: [],
  },
  {
    id: "t3",
    sourceId: "h1",
    sourceType: "health_events",
    eventType: "fluid",
    logicalDate: today,
    occurredAt: at(0, 10, 40),
    endedAt: null,
    title: "Water",
    summary: "24 oz",
    details: [],
  },
  {
    id: "t4",
    sourceId: "h2",
    sourceType: "health_events",
    eventType: "supplement",
    logicalDate: today,
    occurredAt: at(0, 7, 30),
    endedAt: null,
    title: "Creatine",
    summary: "5 g",
    details: [],
  },
  {
    id: "t5",
    sourceId: "s1",
    sourceType: "user_symptom_events",
    eventType: "symptom",
    logicalDate: today,
    occurredAt: at(0, 14, 20),
    endedAt: null,
    title: "Headache",
    summary: "Severity 3/10",
    details: [],
  },
];

const item = (name, calories, protein, carbs, fat, fiber, extra = {}) => ({
  id: `i-${name}`,
  source_name: name,
  calories,
  protein_grams: protein,
  carbohydrate_grams: carbs,
  fat_grams: fat,
  fiber_grams: fiber,
  sugar_grams: null,
  sodium_mg: null,
  caffeine_mg: null,
  alcohol_grams: null,
  quantity_multiplier: 1,
  ...extra,
});
const nutritionEntries = [
  {
    id: "n1",
    title: "Oats and berries",
    meal_type: "breakfast",
    consumed_at: at(0, 8, 5),
    notes: null,
    nutrition_status: "complete",
    stated_amount: null,
    source_type: "manual",
    deleted_at: null,
    items: [
      item("Rolled oats", 230, 8, 40, 4, 6),
      item("Mixed berries", 70, 1, 17, 0, 4),
      item("Whole milk", 120, 9, 3, 8, 0),
    ],
  },
  {
    id: "n2",
    title: "Chicken rice bowl",
    meal_type: "lunch",
    consumed_at: at(0, 12, 50),
    notes: null,
    nutrition_status: "complete",
    stated_amount: null,
    source_type: "manual",
    deleted_at: null,
    items: [item("Chicken rice bowl", 680, 52, 70, 18, 6)],
  },
  {
    id: "n3",
    title: "Protein shake",
    meal_type: "snack",
    consumed_at: at(0, 15, 30),
    notes: null,
    nutrition_status: "incomplete",
    stated_amount: null,
    source_type: "manual",
    deleted_at: null,
    items: [item("Protein shake", 120, 24, 3, 2, null)],
  },
];
const symptomEvents = [
  {
    id: "s1",
    started_at: at(0, 14, 20),
    severity: 3,
    custom_symptom_name: "Headache",
    symptom: null,
    deleted_at: null,
  },
  {
    id: "s2",
    started_at: at(-3, 9, 0),
    severity: 5,
    custom_symptom_name: "Fatigue",
    symptom: null,
    deleted_at: null,
  },
  {
    id: "s3",
    started_at: at(-7, 16, 0),
    severity: 7,
    custom_symptom_name: "Headache",
    symptom: null,
    deleted_at: null,
  },
  {
    id: "s4",
    started_at: at(-11, 10, 0),
    severity: 4,
    custom_symptom_name: "Fatigue",
    symptom: null,
    deleted_at: null,
  },
];

// Workouts
const tmpl = (id, name, exercises, sets, minutes) => ({
  id,
  user_id: "preview-user",
  name,
  description: null,
  category: "strength",
  estimated_duration_minutes: minutes,
  is_archived: false,
  groups: [
    {
      id: `${id}-g`,
      exercises: Array.from({ length: exercises }, (_, i) => ({
        id: `${id}-e${i}`,
        sets: Array.from({ length: sets[i] ?? 3 }, (_, j) => ({ id: `${id}-e${i}-s${j}` })),
      })),
    },
  ],
});
const templates = [
  tmpl("t-ua", "Upper Body A", 6, [4, 4, 3, 3, 3, 3], 55),
  tmpl("t-ub", "Upper Body B", 6, [4, 4, 3, 3, 3, 3], 55),
  tmpl("t-la", "Lower Body A", 5, [4, 4, 3, 3, 3], 50),
  tmpl("t-lb", "Lower Body B", 5, [4, 4, 3, 3, 3], 50),
];
const plannedWorkout = (id, name, templateId, offset, time, status = "planned") => ({
  id,
  user_id: "preview-user",
  workout_template_id: templateId,
  planned_activity_id: null,
  planned_activity_occurrence_id: null,
  user_protocol_id: null,
  name,
  description: null,
  scheduled_date: day(offset),
  scheduled_time: time,
  estimated_duration_minutes: 55,
  status,
  notes: null,
  created_at: at(-10, 8),
  updated_at: at(-10, 8),
});
const plannedWorkouts = [
  plannedWorkout("pw-1", "Upper Body A", "t-ua", 0, "18:00:00"),
  plannedWorkout("pw-2", "Lower Body B", "t-lb", 2, "09:00:00"),
  plannedWorkout("pw-3", "Upper Body B", "t-ub", 5, "18:00:00"),
];
const sessionSets = (sessionId, rows) =>
  rows.map(([weight, reps], i) => ({
    id: `${sessionId}-s${i}`,
    status: "completed",
    actual_weight: weight,
    actual_weight_unit: "lb",
    actual_reps: reps,
    planned_workout_set_id: `pws-${i}`,
  }));
const workoutSession = (id, name, offset, minutes, sets) => ({
  id,
  user_id: "preview-user",
  planned_workout_id: null,
  planned_activity_occurrence_id: null,
  name,
  session_date: day(offset),
  status: "completed",
  started_at: at(offset, 18),
  ended_at: at(offset, 18, minutes),
  duration_seconds: minutes * 60,
  perceived_difficulty: null,
  energy_before: null,
  energy_after: null,
  notes: null,
  exercises: [{ id: `${id}-x`, sets: sessionSets(id, sets) }],
});
const heavy = (w) => [
  [w, 6],
  [w, 6],
  [w, 6],
  [w - 10, 8],
  [w * 0.7, 10],
  [w * 0.7, 10],
  [w * 0.6, 12],
  [w * 0.6, 12],
];
const workoutSessions = [];
for (let week = 0; week < 8; week++) {
  const base = 150 + week * 4;
  workoutSessions.push(
    workoutSession(
      `ws-a${week}`,
      week % 2 ? "Upper Body B" : "Upper Body A",
      weekStart - 7 * (7 - week) + 0,
      52,
      heavy(base),
    ),
  );
  workoutSessions.push(
    workoutSession(
      `ws-b${week}`,
      "Lower Body A",
      weekStart - 7 * (7 - week) + 2,
      48,
      heavy(base + 60),
    ),
  );
}
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
const liveExercise = (id, order, name, label, planned, done) => ({
  id,
  workout_session_id: "session-1",
  exercise_name: name,
  display_label: label,
  group_order: order,
  group_label: label[0],
  group_type: "straight",
  exercise_order: 1,
  tracking_type: "weight_reps",
  sets: planned.map(([weight, reps], i) => ({
    id: `${id}-s${i}`,
    workout_session_id: "session-1",
    workout_session_exercise_id: id,
    planned_workout_set_id: `p-${id}-${i}`,
    set_number: i + 1,
    status: i < done ? "completed" : "pending",
    planned_weight: weight,
    planned_reps: reps,
    planned_reps_min: null,
    planned_reps_max: null,
    planned_duration_seconds: null,
    planned_distance: null,
    distance_unit: null,
    actual_weight: i < done ? weight : null,
    actual_weight_unit: "lb",
    actual_reps: i < done ? reps : null,
    actual_duration_seconds: null,
    actual_distance: null,
    completed_at: i < done ? minutesAgo(30 - order * 8 - i * 3 + (order === 2 ? 26 : 0)) : null,
  })),
});
workoutSessions.push({
  id: "session-1",
  user_id: "preview-user",
  planned_workout_id: "pw-1",
  planned_activity_occurrence_id: null,
  name: "Upper Body A",
  session_date: day(0),
  status: "in_progress",
  started_at: minutesAgo(32),
  ended_at: null,
  duration_seconds: null,
  exercises: [
    liveExercise(
      "lx1",
      1,
      "Bench press",
      "A1",
      [
        [185, 6],
        [185, 6],
        [185, 6],
        [175, 8],
      ],
      4,
    ),
    liveExercise(
      "lx2",
      2,
      "Barbell row",
      "B1",
      [
        [155, 8],
        [155, 8],
        [155, 8],
        [155, 8],
      ],
      4,
    ),
    liveExercise(
      "lx3",
      3,
      "Overhead press",
      "C1",
      [
        [115, 8],
        [115, 8],
        [115, 8],
      ],
      1,
    ),
    liveExercise(
      "lx4",
      4,
      "Pull-up",
      "D1",
      [
        [0, 10],
        [0, 10],
        [0, 10],
      ],
      0,
    ),
  ],
});
workoutSessions.push(workoutSession("ws-now", "Lower Body A", weekStart, 48, heavy(220)));
workoutSessions.push(workoutSession("ws-now2", "Upper Body B", weekStart + 2, 51, heavy(185)));
const library = [
  ["Bench press", "strength", "chest", "barbell"],
  ["Barbell row", "strength", "back", "barbell"],
  ["Overhead press", "strength", "shoulders", "barbell"],
  ["Pull-up", "strength", "back", "bodyweight"],
  ["Back squat", "strength", "quadriceps", "barbell"],
  ["Romanian deadlift", "strength", "hamstrings", "barbell"],
].map(([name, category, muscle, equipment], i) => ({
  id: `x${i}`,
  user_id: null,
  name,
  category,
  primary_muscle_group: muscle,
  equipment,
  default_tracking_type: "weight_reps",
  is_active: true,
  archived_at: null,
}));

window.DB = {
  foods: [
    "Rolled oats",
    "Greek yogurt",
    "Chicken rice bowl",
    "Banana",
    "Eggs and toast",
    "Protein shake",
  ].map((name, i) => ({
    id: `f${i}`,
    name,
    brand_name: null,
    common_aliases: [],
    source_reference: null,
    recipe_unit: null,
    external_sources: [],
    is_active: true,
  })),
  user_foods: [],
  food_aliases: [],
  workout_templates: templates,
  planned_workouts: plannedWorkouts,
  exercises: library,
  daily_checkins: checkins,
  planned_activities: [],
  planned_activity_occurrences: occurrences,
  health_events: [{ id: "h1" }],
  nutrition_entries: nutritionEntries,
  experiments: [{ id: "e1" }],
  user_conditions: [],
  user_symptom_events: symptomEvents,
  workout_sessions: workoutSessions,
  condition_episodes: [],
};
window.RPC = {};

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (!url.startsWith("/api/")) return realFetch(input, init);
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (url.startsWith("/api/timeline")) return json({ events: timelineEvents, failedSources: [] });
  if (window.API && window.API[url.split("?")[0]])
    return json(window.API[url.split("?")[0]](url, init));
  return json({});
};
