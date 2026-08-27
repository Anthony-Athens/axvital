export const PRODUCT_EVENTS=["signup_completed","onboarding_completed","first_daily_checkin","first_symptom_logged","first_food_logged","first_workout_completed","first_condition_added","first_episode_logged","pricing_viewed","upgrade_clicked","checkout_started","checkout_completed","premium_activated","patterns_paywall_viewed","outlook_paywall_viewed","experiment_limit_reached"]as const;export type ProductEvent=typeof PRODUCT_EVENTS[number];export function isProductEvent(x:unknown):x is ProductEvent{return typeof x==="string"&&(PRODUCT_EVENTS as readonly string[]).includes(x)}

// Browser callers report intent, never business completion.
export const CLIENT_PRODUCT_EVENTS = ["pricing_viewed", "upgrade_clicked"] as const;
export function isClientProductEvent(value: unknown): value is typeof CLIENT_PRODUCT_EVENTS[number] { return typeof value === "string" && (CLIENT_PRODUCT_EVENTS as readonly string[]).includes(value); }
