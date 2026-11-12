// Mirrors the color roles defined in app/globals.css (dark theme).
export const colors = {
  surface: {
    ground: "#070C1A",
    surface: "#0E1528",
    raised: "#141D35",
    line: "#1F2A44",
    lineStrong: "#2A3756",
  },
  text: { primary: "#EEF2F8", secondary: "#AAB6CB", muted: "#8391AA" },
  accent: { action: "#2563EB", hover: "#1D4ED8", onDark: "#60A5FA" },
  category: {
    food: "#F5B454",
    fluid: "#38BDF8",
    supplement: "#A78BFA",
    workout: "#34D399",
    symptom: "#FB7185",
    habit: "#E879F9",
    checkin: "#60A5FA",
  },
  semantic: { success: "#34D399", warning: "#F5B454", error: "#FB7185", info: "#60A5FA" },
} as const;

export const todaySectionOrder = [
  "header",
  "summary",
  "plan",
  "checkin",
  "events",
  "timeline",
] as const;
