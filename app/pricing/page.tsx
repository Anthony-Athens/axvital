import type { Metadata } from "next";
import { socialMetadata } from "@/lib/seo";
import { PricingPlans } from "@/components/billing/PricingPlans";

const title = "Pricing | AXVital";
const description = "Track for free. Upgrade to Premium for full trigger analysis, predictive outlooks, and multiple active experiments.";

export const metadata: Metadata = socialMetadata(title, description, "/pricing");

export default function PricingPage() {
  return <PricingPlans />;
}
