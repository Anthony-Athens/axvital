"use client";
import { Analytics } from "@vercel/analytics/next";
import { analyticsUrl } from "@/lib/telemetry/policy";
export function ProductAnalytics() {
  return <Analytics beforeSend={event => {
    const url = analyticsUrl(event.url);
    return url ? { ...event, url } : null;
  }} />;
}
