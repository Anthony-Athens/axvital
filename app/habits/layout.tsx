import type { Metadata } from "next";

export const metadata: Metadata = { title: "Habits | AXVital", robots: { index: false, follow: false } };

export default function HabitsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
