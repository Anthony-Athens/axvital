"use client";

import { FormEvent, useRef, useState } from "react";
import { CONTACT_TOPICS } from "@/lib/contact";

export function ContactForm() {
  const busy = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage("");
    setSuccess(false);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(data)),
      });
      if (response.status === 429) {
        setMessage(
          "You’ve sent several messages recently. Your entries are still here; please try again in a few minutes.",
        );
        return;
      }
      if (!response.ok) throw new Error();
      formRef.current?.reset();
      setSuccess(true);
      setMessage("Thanks — your message has been sent to AXVital Support.");
    } catch {
      setMessage(
        "We couldn’t send your message. Your entries are still here; please try again shortly.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const control =
    "mt-2 min-h-12 w-full rounded-lg border border-line-strong bg-surface px-4 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30";
  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="mt-5 space-y-4 rounded-xl border border-line bg-raised p-4 sm:p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-fg-2">
          Name
          <input name="name" autoComplete="name" required maxLength={120} className={control} />
        </label>
        <label className="text-sm font-semibold text-fg-2">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            className={control}
          />
        </label>
      </div>
      <label className="block text-sm font-semibold text-fg-2">
        Topic
        <select name="topic" required defaultValue="" className={control}>
          <option value="" disabled>
            Select a topic
          </option>
          {CONTACT_TOPICS.map((topic) => (
            <option key={topic}>{topic}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold text-fg-2">
        Message
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          className={`${control} py-3`}
        />
      </label>
      <label className="sr-only" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <p className="text-sm text-fg-2">
        Please do not include sensitive medical information in your message.
      </p>
      {message ? (
        <p
          role={success ? "status" : "alert"}
          className={`rounded-lg p-3 text-sm font-semibold ${success ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-100"}`}
        >
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-lg bg-blue-600 px-5 font-semibold text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-accent-fg focus-visible:ring-offset-2 disabled:bg-slate-600"
      >
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
