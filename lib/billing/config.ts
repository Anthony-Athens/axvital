import "server-only";
export const BILLING_PRICES={monthly:{interval:"month"as const,display:"$9.99/month",amount:999,priceId:process.env.STRIPE_PRICE_PREMIUM_MONTHLY??""},annual:{interval:"year"as const,display:"$79.99/year",amount:7999,priceId:process.env.STRIPE_PRICE_PREMIUM_ANNUAL??""}};
export type BillingInterval=keyof typeof BILLING_PRICES;
export function priceFor(interval:unknown){if(interval!=="monthly"&&interval!=="annual")throw new Error("INVALID_INTERVAL");const price=BILLING_PRICES[interval];if(!price.priceId)throw new Error("BILLING_NOT_CONFIGURED");return price}
export function appUrl(){const value=process.env.NEXT_PUBLIC_APP_URL;if(!value)throw new Error("BILLING_NOT_CONFIGURED");return value.replace(/\/$/,"")}
