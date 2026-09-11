export const campaignEvents = {
  viewed: "Condition Marketing Viewed",
  cta: "Condition Marketing CTA Clicked",
  signupViewed: "Signup Viewed",
  submitted: "Signup Started",
  completed: "Signup Completed",
} as const;
export type CampaignEvent = typeof campaignEvents[keyof typeof campaignEvents];
export const campaignKeys = ["ms", "psoriasis", "hsv"] as const;
export type CampaignKey = typeof campaignKeys[number];
export const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
export type UtmKey = typeof utmKeys[number];
export type CampaignAttribution = Partial<Record<UtmKey, string>> & { source_page?: string };
export type UtmAllowlist = Partial<Record<UtmKey, readonly string[]>>;

// Only reviewed campaign labels are admitted. Syntax filtering alone cannot exclude PII.
export function campaignAllowlist(raw = process.env.NEXT_PUBLIC_CAMPAIGN_UTM_ALLOWLIST): UtmAllowlist {
  const defaults: UtmAllowlist = {
    utm_source: ["google"],
    utm_medium: ["cpc"],
    utm_campaign: ["ms_launch", "psoriasis_launch", "hsv_launch"],
    utm_content: ["ad_a", "ad_b", "ad_c"],
    utm_term: [],
  };
  try {
    const value = raw ? JSON.parse(raw) : {};
    const result: UtmAllowlist = { ...defaults };
    for (const key of utmKeys) if (Array.isArray(value?.[key])) {
      result[key] = value[key].filter((v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(v)).slice(0, 100);
    }
    return result;
  } catch { return defaults; }
}
export function safeAttribution(input: unknown, allowed = campaignAllowlist()): CampaignAttribution {
  const output: CampaignAttribution = {};
  if (!input || typeof input !== "object") return output;
  const value = input as Record<string, unknown>;
  if (campaignKeys.some(key => value.source_page === `conditions_${key}`)) output.source_page = value.source_page as string;
  for (const key of utmKeys) if (typeof value[key] === "string" && allowed[key]?.includes(value[key])) output[key] = value[key];
  return output;
}
export function attributionFromSearch(search: string, condition?: CampaignKey): CampaignAttribution {
  const params = new URLSearchParams(search);
  const input: Record<string, string> = {};
  for (const key of ["source_page", ...utmKeys]) if (params.getAll(key).length === 1) input[key] = params.get(key)!;
  if (condition) input.source_page = `conditions_${condition}`;
  return safeAttribution(input);
}
export function campaignSignupUrl(condition: CampaignKey, search = "") {
  return `/signup?${new URLSearchParams(attributionFromSearch(search, condition))}`;
}
export function campaignPayload(event: CampaignEvent, input: unknown) {
  if (!(Object.values(campaignEvents) as string[]).includes(event)) return null;
  const attribution = safeAttribution(input);
  if ((event === campaignEvents.viewed || event === campaignEvents.cta) && !attribution.source_page) return null;
  return attribution;
}
