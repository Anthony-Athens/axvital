import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Health | AXVital",
  robots: { index: false, follow: false },
};

export default function HealthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
