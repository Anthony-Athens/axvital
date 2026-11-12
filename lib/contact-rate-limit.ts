import "server-only";
import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Opaque per-sender bucket: an HMAC of the client IP, so raw IPs are never stored.
 * Vercel sets x-forwarded-for itself, so its first entry is the real client.
 */
export function contactSenderBucket(request: Request, secret: string) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  return "ip:" + createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}

/** True when the message may be sent. Fails open (logged) if the limiter is unavailable. */
export async function consumeContactBudget(request: Request) {
  const secret =
    process.env.AXVITAL_CONTACT_RATE_SALT?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    console.error("contact.rate_limit_unavailable", { category: "configuration_missing" });
    return true;
  }
  try {
    const { data, error } = await createAdminClient().rpc("axvital_consume_contact_budget", {
      sender_bucket: contactSenderBucket(request, secret),
    });
    if (error) {
      console.error("contact.rate_limit_unavailable", { category: "rpc_failed" });
      return true;
    }
    return data === true;
  } catch {
    console.error("contact.rate_limit_unavailable", { category: "request_failed" });
    return true;
  }
}
