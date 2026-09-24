export type BillingInterval = "monthly" | "annual";
export const voiceAnalyticsEvents = ["Voice Log Opened", "Voice Recording Started", "Voice Recording Completed", "Voice Parse Succeeded", "Voice Parse Failed", "Voice Review Presented", "Voice Log Confirmed", "Voice Log Edited", "Voice Log Abandoned"] as const;
export type AnalyticsEvent = "Signup Started" | "Account Created" | "First Health Event Logged" | "First Daily Check In Completed" | "Experiment Created" | "Checkout Started" | "Paid Subscription Started" | typeof voiceAnalyticsEvents[number];
const events: readonly string[] = ["Signup Started", "Account Created", "First Health Event Logged", "First Daily Check In Completed", "Experiment Created", "Checkout Started", "Paid Subscription Started", ...voiceAnalyticsEvents];
// Reconstruct properties, never forward caller objects to the vendor.
export function analyticsPayload(event: AnalyticsEvent, interval?: BillingInterval) {
  if (!events.includes(event)) return null;
  if (event === "Checkout Started" || event === "Paid Subscription Started") {
    if (interval !== "monthly" && interval !== "annual") return null;
    return { billing_interval: interval };
  }
  return {};
}
const publicPaths = new Set(["/", "/signup", "/login", "/pricing", "/about", "/contact", "/privacy", "/terms", "/health-disclaimer", "/conditions/ms", "/conditions/psoriasis", "/conditions/hsv"]);
export function analyticsUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // All private/unknown routes collapse to one non-sensitive page category.
    return url.origin + (publicPaths.has(url.pathname) ? url.pathname : "/app");
  } catch { return null; }
}
