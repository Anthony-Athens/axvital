export const protectedRoutes = [
  "/today",
  "/track",
  "/learn",
  "/me",
  "/health",
  "/experiments",
  "/weekly-overview",
  "/habits",
  "/protocols",
  "/workouts",
  "/dashboard",
  "/insights",
  "/weekly-recap",
  "/profile",
  "/onboarding",
  "/settings",
];
export const authRoutes = ["/login", "/signup"];

export function isRoute(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

