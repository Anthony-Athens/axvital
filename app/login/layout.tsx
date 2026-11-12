import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log in | AXVital",
  description: "Log in to your AXVital account.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
