import "server-only";
import { after } from "next/server";
import { track } from "@vercel/analytics/server";
import { analyticsPayload, type AnalyticsEvent, type BillingInterval } from "./policy";
const routes = new Set(["/api/stripe/webhook", "/api/notifications/signup", "/api/product-events", "/api/experiments/v2/draft"]);
export function scheduleAnalytics(request: Request, event: AnalyticsEvent, interval?: BillingInterval) {
  try {
    const url = new URL(request.url), data = analyticsPayload(event, interval);
    // The SDK implicitly uses the request URL. Never track requests with queries.
    if (!data || url.search || url.hash || !routes.has(url.pathname)) return;
    after(async () => {
      try { await track(event, data, { headers: {} }); }
      catch { console.error("analytics.delivery_failed", { category: "provider_failed" }); }
    });
  } catch { console.error("analytics.delivery_failed", { category: "scheduling_failed" }); }
}
