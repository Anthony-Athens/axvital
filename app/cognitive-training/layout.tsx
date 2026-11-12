import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cognitive Training | AXVital",
  robots: { index: false, follow: false },
};

export default function CognitiveTrainingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
