export type NavigationIcon = "today" | "planner" | "workouts" | "progress" | "more" | "habits" | "protocols" | "health" | "experiments" | "exercises" | "insights" | "recap" | "profile";
export type PrimaryNavigationId = "today" | "track" | "learn" | "experiments" | "me";
export type NavigationItem = { id: PrimaryNavigationId; label: string; href: string; icon: NavigationIcon };

export const navigationItems: readonly NavigationItem[] = [
  { id: "today", label: "Today", href: "/today", icon: "today" },
  { id: "track", label: "Track", href: "/track", icon: "planner" },
  { id: "learn", label: "Learn", href: "/learn", icon: "insights" },
  { id: "experiments", label: "Experiments", href: "/experiments", icon: "experiments" },
  { id: "me", label: "Me", href: "/me", icon: "profile" },
] as const;

export const primaryMobileItems = navigationItems;
export const desktopNavigationItems = navigationItems;

export function matchesRoute(pathname: string, prefixes: readonly string[]) { return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)); }
function isConditionAnalysisRoute(pathname: string) { return /^\/health\/conditions\/[^/]+\/(?:patterns(?:\/|$)|outlook(?:\/|$))/.test(pathname); }
export function activeNavigationId(pathname: string): PrimaryNavigationId | null {
  if (matchesRoute(pathname, ["/today", "/checkin"])) return "today";
  if (matchesRoute(pathname, ["/experiments"])) return "experiments";
  if (matchesRoute(pathname, ["/learn", "/dashboard", "/insights", "/weekly-recap", "/workouts/progress"]) || isConditionAnalysisRoute(pathname)) return "learn";
  if (matchesRoute(pathname, ["/track", "/weekly-overview", "/workouts", "/habits", "/protocols", "/health/nutrition", "/health/symptoms", "/health/episodes", "/health/timeline"])) return "track";
  if (matchesRoute(pathname, ["/me", "/profile", "/settings"]) || pathname === "/health" || matchesRoute(pathname, ["/health/conditions"])) return "me";
  return null;
}
export function isFocusedWorkoutRoute(pathname: string) { return /^\/workouts\/sessions\/[^/]+\/?$/.test(pathname); }
