import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learn | AXVital",
  robots: { index: false, follow: false },
};

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return children;
}
