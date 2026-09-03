export const CONTACT_TOPICS = ["Account", "Billing", "Technical Issue", "Privacy", "Feedback", "Other"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];
export type ContactSubmission = { name: string; email: string; topic: ContactTopic; message: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (value: unknown) => typeof value === "string" ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim() : "";

export function validateContactSubmission(value: unknown): ContactSubmission | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["name", "email", "topic", "message", "website"].includes(key))) return null;
  if (clean(input.website)) return null;
  const name = clean(input.name), email = clean(input.email).toLowerCase(), topic = clean(input.topic), message = clean(input.message);
  if (!name || name.length > 120 || !emailPattern.test(email) || email.length > 254 || !CONTACT_TOPICS.includes(topic as ContactTopic) || message.length < 10 || message.length > 5000) return null;
  return { name, email, topic: topic as ContactTopic, message };
}

export function contactEmailText(input: ContactSubmission, timestamp: string) {
  return [`Name: ${input.name}`, `Email: ${input.email}`, `Topic: ${input.topic}`, `Submitted: ${timestamp}`, "", "Message:", input.message].join("\n");
}
