export const colors = {
  blue: { 50: "#EFF6FF", 100: "#DBEAFE", 500: "#3B82F6", 600: "#2563EB", 700: "#1D4ED8" },
  slate: { 50: "#F8FAFC", 100: "#F1F5F9", 200: "#E2E8F0", 300: "#CBD5E1", 400: "#94A3B8", 500: "#64748B", 600: "#475569", 700: "#334155", 800: "#1E293B", 900: "#0F172A", 950: "#020617" },
  semantic: { success: "#059669", warning: "#D97706", error: "#DC2626", info: "#2563EB" },
} as const;

export const todaySectionOrder = ["header", "summary", "plan", "checkin", "events", "timeline"] as const;
