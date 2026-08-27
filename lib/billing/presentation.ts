export type BillingStatus = {
  plan: "free" | "premium"; status: string; entitlementState: string;
  currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; priceId: string | null;
};
export function billingPresentation(data: BillingStatus) {
  const access = data.plan === "premium" && data.entitlementState !== "inactive";
  const renewing = access && !data.cancelAtPeriodEnd && data.status === "active";
  return {
    planLabel: access ? "AXVital Premium" : "Free",
    dateLabel: !access ? "Last recorded period ended" : renewing ? "Next billing date" : data.status === "trialing" && !data.cancelAtPeriodEnd ? "Trial through" : "Access through",
    cancellation: data.cancelAtPeriodEnd ? "Cancellation scheduled; renewal is turned off." : data.status === "canceled" ? "Subscription canceled." : null,
    canManage: data.plan === "premium",
  };
}
