import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "AXVital | Health Operating System",
  description:
    "Track what matters, discover what works, and improve your health with personalized insights.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-950">
        <Navbar />
        <main className="min-h-dvh pb-24 pt-16 md:pb-0 md:pt-20">
          {children}
        </main>
      </body>
    </html>
  );
}
