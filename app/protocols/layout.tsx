import type { Metadata } from "next";

export const metadata: Metadata = { title: "Protocols | AXVital", robots: { index: false, follow: false } };

export default function ProtocolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
