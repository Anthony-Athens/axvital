import type { Metadata } from "next";

export const metadata: Metadata = { title: "My Health | AXVital", robots: { index: false, follow: false } };

export default function MyHealthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
