export function reportActivation(event: "first_health_event" | "first_daily_checkin") {
  try {
    void fetch("/api/product-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event }), keepalive: true }).catch(() => undefined);
  } catch { /* Saving must still succeed. */ }
}
