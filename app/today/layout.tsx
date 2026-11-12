import type { Metadata } from "next";

export const metadata: Metadata = { title: "Today | AXVital", robots: { index: false, follow: false } };

export default function TodayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
