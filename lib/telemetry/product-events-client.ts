"use client";
import { createClient } from "@/lib/supabase/browser";
import type { CLIENT_PRODUCT_EVENTS } from "@/lib/product-events";

/**
 * Records a first-party product event for signed-in members only. The endpoint
 * requires an account, so anonymous visitors are skipped instead of producing a
 * guaranteed 401 (their page views are already counted by Vercel Analytics).
 * The session check is local (no network) and is a hint only; the API re-verifies.
 */
export async function recordProductEvent(event: (typeof CLIENT_PRODUCT_EVENTS)[number]) {
  try {
    const { data } = await createClient().auth.getSession();
    if (!data.session) return;
    await fetch("/api/product-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
    });
  } catch {
    /* Best effort: analytics never blocks the page. */
  }
}
