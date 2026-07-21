export type NavigationIcon = "today" | "planner" | "workouts" | "progress" | "more" | "habits" | "protocols" | "exercises" | "insights" | "recap" | "profile";
export type NavigationGroup = "planning" | "workouts" | "account" | "insights";
export type NavigationItem = { id: string; label: string; mobileLabel?: string; href: string; icon: NavigationIcon; matchPrefixes: readonly string[]; mobilePlacement: "primary" | "more"; group?: NavigationGroup; desktop: boolean };

export const navigationItems: readonly NavigationItem[] = [
  { id: "today", label: "Today", href: "/today", icon: "today", matchPrefixes: ["/today", "/checkin"], mobilePlacement: "primary", desktop: true },
  { id: "planner", label: "Weekly Overview", mobileLabel: "Planner", href: "/weekly-overview", icon: "planner", matchPrefixes: ["/weekly-overview"], mobilePlacement: "primary", desktop: true },
  { id: "workouts", label: "Workouts", href: "/workouts", icon: "workouts", matchPrefixes: ["/workouts"], mobilePlacement: "primary", desktop: true },
  { id: "progress", label: "Dashboard", mobileLabel: "Progress", href: "/dashboard", icon: "progress", matchPrefixes: ["/dashboard"], mobilePlacement: "primary", desktop: true },
  { id: "habits", label: "Habits", href: "/habits", icon: "habits", matchPrefixes: ["/habits"], mobilePlacement: "more", group: "planning", desktop: true },
  { id: "protocols", label: "Protocols", href: "/protocols", icon: "protocols", matchPrefixes: ["/protocols"], mobilePlacement: "more", group: "planning", desktop: true },
  { id: "exercise-library", label: "Exercise Library", href: "/workouts#exercise-library", icon: "exercises", matchPrefixes: [], mobilePlacement: "more", group: "workouts", desktop: false },
  { id: "workout-progress", label: "Workout Progress", href: "/workouts/progress", icon: "progress", matchPrefixes: ["/workouts/progress"], mobilePlacement: "more", group: "workouts", desktop: false },
  { id: "insights", label: "Insights", href: "/insights", icon: "insights", matchPrefixes: ["/insights"], mobilePlacement: "more", group: "insights", desktop: true },
  { id: "weekly-recap", label: "Weekly Recap", href: "/weekly-recap", icon: "recap", matchPrefixes: ["/weekly-recap"], mobilePlacement: "more", group: "insights", desktop: true },
  { id: "profile", label: "Profile", href: "/profile", icon: "profile", matchPrefixes: ["/profile"], mobilePlacement: "more", group: "account", desktop: true },
] as const;

export const primaryMobileItems = navigationItems.filter((item) => item.mobilePlacement === "primary");
export const moreNavigationItems = navigationItems.filter((item) => item.mobilePlacement === "more");
export const desktopNavigationItems = navigationItems.filter((item) => item.desktop);

export function matchesRoute(pathname: string, prefixes: readonly string[]) { return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)); }
export function activeNavigationId(pathname: string) {
  if (matchesRoute(pathname, ["/workouts/progress"])) return "more";
  const primary = primaryMobileItems.find((item) => matchesRoute(pathname, item.matchPrefixes));
  if (primary) return primary.id;
  return moreNavigationItems.some((item) => matchesRoute(pathname, item.matchPrefixes)) ? "more" : null;
}
export function isFocusedWorkoutRoute(pathname: string) { return /^\/workouts\/sessions\/[^/]+\/?$/.test(pathname); }
