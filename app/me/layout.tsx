import type { Metadata } from "next";

export const metadata: Metadata = { title: "Me | AXVital", robots: { index: false, follow: false } };

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
