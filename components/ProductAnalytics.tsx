"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { attributionFromSearch, campaignEvents, campaignKeys, type CampaignKey } from "@/lib/telemetry/campaign";
import { trackCampaign } from "@/lib/telemetry/client";
import { Analytics } from "@vercel/analytics/next";
import { analyticsUrl } from "@/lib/telemetry/policy";
export function ProductAnalytics() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    const condition = pathname?.split("/")[2] as CampaignKey;
    if (pathname === `/conditions/${condition}` && campaignKeys.includes(condition)) trackCampaign(campaignEvents.viewed, attributionFromSearch(window.location.search, condition));
    if (pathname === "/signup") trackCampaign(campaignEvents.signupViewed, attributionFromSearch(window.location.search));
  }, [pathname]);
  return <Analytics beforeSend={event => {
    const url = analyticsUrl(event.url);
    return url ? { ...event, url } : null;
  }} />;
}
