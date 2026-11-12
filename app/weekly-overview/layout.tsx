import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Weekly Overview | AXVital",
  robots: { index: false, follow: false },
};

export default function WeeklyOverviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
