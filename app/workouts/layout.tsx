import type { Metadata } from "next";

export const metadata: Metadata = { title: "Workouts | AXVital", robots: { index: false, follow: false } };

export default function WorkoutsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
