import assert from "node:assert/strict";
import test from "node:test";
import { contactEmailText, validateContactSubmission, type ContactSubmission } from "./contact.ts";

const valid = { name: "Ada", email: "ADA@example.com", topic: "Privacy", message: "Please help with my privacy request." } satisfies ContactSubmission;
test("contact submissions are normalized and bounded", () => assert.deepEqual(validateContactSubmission(valid), { ...valid, email: "ada@example.com" }));
test("contact validation rejects missing, malformed, oversized and unexpected input", () => {
  for (const value of [{ ...valid, email: "bad" }, { ...valid, topic: "Sales" }, { ...valid, message: "short" }, { ...valid, extra: true }, { ...valid, website: "bot" }, null]) assert.equal(validateContactSubmission(value), null);
});
test("contact email contains the required support fields", () => {
  const text = contactEmailText(valid, "2026-09-03T12:00:00.000Z");
  for (const expected of ["Name: Ada", "Email: ADA@example.com", "Topic: Privacy", "Submitted: 2026-09-03", "Message:"]) assert.match(text, new RegExp(expected));
});
