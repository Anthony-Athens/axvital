import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { boundedText } from "@/lib/api/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimMilestone, sendOwnerNotification } from "@/lib/notifications/owner";
import { scheduleAnalytics } from "@/lib/telemetry/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.AXVITAL_SIGNUP_WEBHOOK_SECRET;
  const provided = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || Buffer.byteLength(provided) !== Buffer.byteLength(`Bearer ${secret}`) || !timingSafeEqual(Buffer.from(provided), Buffer.from(`Bearer ${secret}`))) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const body = JSON.parse(await boundedText(request, 65536));
    if (body?.type !== "INSERT" || body.schema !== "public" || body.table !== "profiles" || typeof body.record?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.record.id)) return Response.json({ error: "INVALID_EVENT" }, { status: 400 });
    const admin = createAdminClient();
    // Ignore all profile content in the webhook; fetch the actual Auth account.
    const { data, error } = await admin.auth.admin.getUserById(body.record.id);
    if (error) throw new Error("ACCOUNT_LOOKUP_FAILED");
    if (data.user && await claimMilestone(admin, data.user.id, "signup_completed")) {
      scheduleAnalytics(request, "Account Created");
      const user = data.user;
      after(() => sendOwnerNotification("New AXVital Signup", ["A new AXVital account was created.", `Email: ${user.email ?? "Unavailable"}`, `Created: ${user.created_at}`]));
    }
    return new Response(null, { status: 204 });
  } catch {
    console.error("owner_notification.signup_failed", { category: "processing_failed" });
    // This asynchronous webhook cannot roll back Supabase account creation.
    return Response.json({ error: "NOTIFICATION_PROCESSING_FAILED" }, { status: 503 });
  }
}
