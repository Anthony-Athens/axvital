import type { SupabaseClient } from "@supabase/supabase-js";
export function notificationsEnabled(env: Record<string, string | undefined> = process.env) {
  return env.VERCEL_ENV === "production" || env.AXVITAL_NOTIFICATIONS_ALLOW_NON_PRODUCTION === "true";
}
export async function claimMilestone(admin: SupabaseClient, owner: string, event: "signup_completed" | "premium_activated" | "first_health_event" | "first_daily_checkin") {
  const { data, error } = await admin.rpc("claim_product_milestone", { target_user: owner, milestone: event });
  if (error) throw new Error("MILESTONE_CLAIM_FAILED");
  return data === true;
}
export async function sendOwnerNotification(subject: "New AXVital Signup" | "New AXVital Paid Member", lines: string[]) {
  if (!notificationsEnabled()) return;
  try {
    const key = process.env.RESEND_API_KEY?.trim(), from = process.env.AXVITAL_EMAIL_FROM?.trim(), to = process.env.AXVITAL_ADMIN_EMAIL?.trim();
    if (!key || !from || !to) { console.error("owner_notification.delivery_failed", { category: "configuration_missing" }); return; }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text: [...lines, `Environment: ${process.env.VERCEL_ENV === "production" ? "Production" : "Non-production"}`].join("\n\n") }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) console.error("owner_notification.delivery_failed", { category: "provider_rejected", status: response.status });
  } catch { console.error("owner_notification.delivery_failed", { category: "request_failed" }); }
}
