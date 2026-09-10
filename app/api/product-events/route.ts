import { withApiGuard } from "@/lib/api/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isClientProductEvent } from "@/lib/product-events";
import { claimMilestone } from "@/lib/notifications/owner";
import { scheduleAnalytics } from "@/lib/telemetry/server";
async function handlePOST(request: Request) {
  const body = await request.json().catch(() => null);
  const activation = body?.event === "first_health_event" || body?.event === "first_daily_checkin";
  if (!body || (!activation && !isClientProductEvent(body.event)) || Object.keys(body).some(key => key !== "event")) return Response.json({ error: "INVALID_EVENT" }, { status: 400 });
  const client = await createClient(), { data, error: authError } = await client.auth.getUser();
  if (authError || !data.user) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  if (activation) {
    try {
      if (await claimMilestone(createAdminClient(), data.user.id, body.event)) scheduleAnalytics(request, body.event === "first_health_event" ? "First Health Event Logged" : "First Daily Check In Completed");
    } catch { console.error("analytics.activation_failed", { category: "claim_failed" }); }
    return new Response(null, { status: 204 });
  }
  const { error } = await createAdminClient().from("product_events").insert({ user_id: data.user.id, event_name: body.event });
  return new Response(null, { status: error ? 503 : 204 });
}
export const POST = withApiGuard("product-events", handlePOST);
