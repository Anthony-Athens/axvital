import type { Metadata } from "next";
import { socialMetadata } from "@/lib/seo";
import Link from "next/link";
import { TrustPage } from "@/components/account/TrustPage";

export const metadata: Metadata = socialMetadata(
  "Health Disclaimer | AXVital",
  "AXVital organizes information you track. It does not provide medical diagnosis or treatment.",
  "/health-disclaimer",
);

export default function HealthDisclaimerPage() {
  return (
    <TrustPage title="Health Disclaimer">
      <p className="text-sm text-fg-3">Effective September 3, 2026</p>
      <section>
        <h2 className="text-xl font-semibold">Informational use only</h2>
        <p>
          AXVital is a personal health tracking and wellness information platform. AXVital is not a
          healthcare provider and does not provide medical advice, diagnosis, or treatment.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Insights and experiments</h2>
        <p>
          Information, insights, correlations, trends, experiment results, and other content
          generated or displayed by AXVital are provided for informational purposes only. They may
          help you understand patterns in information you choose to track, but they should not be
          interpreted as establishing a medical cause-and-effect relationship or as a recommendation
          to begin, stop, or modify any medication, treatment, diet, supplement, exercise program,
          or other health intervention. Results may be incomplete, inaccurate, or influenced by
          factors AXVital cannot observe.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Professional care</h2>
        <p>
          Consult a qualified healthcare professional about medical conditions, symptoms,
          medications, treatments, or changes to your health. Do not disregard professional medical
          advice or delay seeking care because of information provided by AXVital.
        </p>
      </section>
      <section className="rounded-xl border border-red-400/25 bg-red-500/10 p-5">
        <h2 className="text-xl font-semibold text-red-100">Medical emergencies</h2>
        <p className="mt-2 text-red-100">
          If you believe you are experiencing a medical emergency, call 911 or your local emergency
          services immediately. AXVital does not monitor entries or support messages for
          emergencies.
        </p>
      </section>
      <p>
        Questions about this disclaimer may be submitted through{" "}
        <Link className="text-blue-300 underline" href="/contact">
          Contact AXVital
        </Link>
        .
      </p>
    </TrustPage>
  );
}
