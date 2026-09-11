"use client";
import { campaignPayload, type CampaignEvent } from "./campaign";
import { track } from "@vercel/analytics";
import { analyticsPayload, type AnalyticsEvent, type BillingInterval } from "./policy";
export function trackProduct(event: AnalyticsEvent, interval?: BillingInterval) {
  try { const data = analyticsPayload(event, interval); if (data) track(event, data); } catch { /* Best effort. */ }
}

export function trackCampaign(event: CampaignEvent, input: unknown) {
  try { const data = campaignPayload(event, input); if (data) track(event, data); } catch { /* Navigation and Auth never depend on analytics. */ }
}
