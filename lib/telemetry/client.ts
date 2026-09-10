"use client";
import { track } from "@vercel/analytics";
import { analyticsPayload, type AnalyticsEvent, type BillingInterval } from "./policy";
export function trackProduct(event: AnalyticsEvent, interval?: BillingInterval) {
  try { const data = analyticsPayload(event, interval); if (data) track(event, data); } catch { /* Best effort. */ }
}
