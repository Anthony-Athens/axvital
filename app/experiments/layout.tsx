import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Experiments | AXVital",
  robots: { index: false, follow: false },
};

export default function ExperimentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
