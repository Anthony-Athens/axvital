import Link from "next/link";
import { ContactForm } from "@/components/contact/ContactForm";
import { TrustPage } from "@/components/account/TrustPage";

export default function ContactPage(){return <TrustPage title="Contact AXVital">
  <section><h2 className="text-xl font-semibold">How can we help?</h2><p>Questions, feedback, account issues, or need help? Send us a message.</p><ContactForm/></section>
  <section><h2 className="text-xl font-semibold">Self-service account tools</h2><ul className="list-disc space-y-2 pl-5"><li><Link className="text-blue-700 underline" href="/settings/data">Download your data</Link></li><li><Link className="text-blue-700 underline" href="/settings/delete">Delete your account</Link></li><li><Link className="text-blue-700 underline" href="/settings/billing">Manage billing</Link></li><li><Link className="text-blue-700 underline" href="/forgot-password">Recover your password</Link></li></ul></section>
  <section><h2 className="text-xl font-semibold">Important</h2><p>Support does not provide medical advice and this form is not monitored as an emergency service. Do not send passwords, authentication codes, payment-card numbers, or detailed health histories.</p></section>
</TrustPage>}
