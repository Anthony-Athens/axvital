"use client";
import { useSyncExternalStore } from "react";
import { attributionFromSearch, campaignEvents, campaignSignupUrl, type CampaignKey } from "@/lib/telemetry/campaign";
import { trackCampaign } from "@/lib/telemetry/client";

const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};
const currentSearch = () => window.location.search;
const serverSearch = () => "";
export function CampaignSignup({ condition }: { condition: CampaignKey }) {
  const search = useSyncExternalStore(subscribe, currentSearch, serverSearch);
  const href = campaignSignupUrl(condition, search);
  return <a href={href} rel="noreferrer" onClick={() => {
    trackCampaign(campaignEvents.cta, attributionFromSearch(window.location.search, condition));
  }} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-7 font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400">Get Started</a>;
}
