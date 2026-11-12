import type { Metadata } from "next";
import { socialMetadata } from "@/lib/seo";

export const metadata: Metadata = socialMetadata(
  "Create your free account | AXVital",
  "Start tracking the health information that matters to you. Free to start.",
  "/signup",
);

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
