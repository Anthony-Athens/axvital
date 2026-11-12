// One color + icon per kind of thing a member logs. Color is never the only cue:
// every use pairs this icon (and usually a text label) with the tint.
export type Category =
  | "food"
  | "fluid"
  | "supplement"
  | "medication"
  | "workout"
  | "symptom"
  | "habit"
  | "protocol"
  | "checkin"
  | "note"
  | "cognitive"
  | "plan";

const paths: Record<Category, string> = {
  food: "M7 3v8a2 2 0 0 0 4 0V3M9 13v8M17 3c-1.7 0-3 2-3 5s1.3 4 3 4v9",
  fluid: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  supplement: "M8.5 15.5l7-7a3.5 3.5 0 0 0-5-5l-7 7a3.5 3.5 0 0 0 5 5zM9.5 9.5l5 5",
  medication: "M4 7h16v4H4zM6 11v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8M12 13v5M9.5 15.5h5",
  workout: "M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12",
  symptom: "M3 12h4l2-5 4 10 2-5h6",
  habit: "M20 6L9 17l-5-5",
  protocol: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  checkin:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  note: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  cognitive:
    "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 3 5 3 3 0 0 0 5 1V5a3 3 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-3 5 3 3 0 0 1-5 1",
  plan: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M8 3v4M16 3v4",
};

// Literal class strings so Tailwind can see them.
export const categoryTone: Record<Category, { text: string; tint: string; bar: string }> = {
  food: { text: "text-cat-food", tint: "bg-cat-food/15", bar: "bg-cat-food" },
  fluid: { text: "text-cat-fluid", tint: "bg-cat-fluid/15", bar: "bg-cat-fluid" },
  supplement: {
    text: "text-cat-supplement",
    tint: "bg-cat-supplement/15",
    bar: "bg-cat-supplement",
  },
  medication: {
    text: "text-cat-supplement",
    tint: "bg-cat-supplement/15",
    bar: "bg-cat-supplement",
  },
  workout: { text: "text-cat-workout", tint: "bg-cat-workout/15", bar: "bg-cat-workout" },
  symptom: { text: "text-cat-symptom", tint: "bg-cat-symptom/15", bar: "bg-cat-symptom" },
  habit: { text: "text-cat-habit", tint: "bg-cat-habit/15", bar: "bg-cat-habit" },
  protocol: { text: "text-cat-habit", tint: "bg-cat-habit/15", bar: "bg-cat-habit" },
  checkin: { text: "text-cat-checkin", tint: "bg-cat-checkin/15", bar: "bg-cat-checkin" },
  note: { text: "text-fg-2", tint: "bg-fg-2/10", bar: "bg-fg-3" },
  cognitive: { text: "text-cat-fluid", tint: "bg-cat-fluid/15", bar: "bg-cat-fluid" },
  plan: { text: "text-accent-fg", tint: "bg-accent-fg/15", bar: "bg-accent-fg" },
};

export function CategoryGlyph({
  category,
  className = "h-[18px] w-[18px]",
}: {
  category: Category;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={paths[category]} />
    </svg>
  );
}

/** Tinted rounded square holding a category glyph. */
export function CategoryIcon({
  category,
  size = "md",
}: {
  category: Category;
  size?: "sm" | "md" | "lg";
}) {
  const tone = categoryTone[category];
  const box =
    size === "sm"
      ? "h-8 w-8 rounded-[10px]"
      : size === "lg"
        ? "h-10 w-10 rounded-xl"
        : "h-9 w-9 rounded-[11px]";
  return (
    <span className={`grid shrink-0 place-items-center ${box} ${tone.tint} ${tone.text}`}>
      <CategoryGlyph
        category={category}
        className={size === "lg" ? "h-5 w-5" : "h-[18px] w-[18px]"}
      />
    </span>
  );
}

/** Maps planner activity types to a category. */
export function activityCategory(type: string | null | undefined, protocol = false): Category {
  if (protocol) return "protocol";
  switch (type) {
    case "workout":
    case "cardio":
    case "mobility":
    case "rehab":
      return "workout";
    case "habit":
    case "mindfulness":
    case "recovery":
      return "habit";
    case "hydration":
      return "fluid";
    case "supplement":
      return "supplement";
    case "medication":
      return "medication";
    case "nutrition":
    case "meal":
      return "food";
    default:
      return "plan";
  }
}
