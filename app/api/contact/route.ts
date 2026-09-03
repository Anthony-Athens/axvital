import { boundedText } from "@/lib/api/validation";
import { contactEmailText, validateContactSubmission } from "@/lib/contact";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "INVALID_ORIGIN" }, { status: 403 });
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "JSON_REQUIRED" }, { status: 415 });
    const raw = await boundedText(request, 6144);
    const submission = validateContactSubmission(JSON.parse(raw));
    if (!submission) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const to = (process.env.AXVITAL_CONTACT_EMAIL ?? process.env.AXVITAL_SUPPORT_EMAIL)?.trim();
    const from = process.env.AXVITAL_EMAIL_FROM?.trim();
    if (!apiKey || !to || !from) return Response.json({ error: "CONTACT_UNAVAILABLE" }, { status: 503 });

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: submission.email,
        subject: `AXVital Support: ${submission.topic}`,
        text: contactEmailText(submission, new Date().toISOString()),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return Response.json({ error: "DELIVERY_FAILED" }, { status: 503 });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "DELIVERY_FAILED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
