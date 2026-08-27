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
    <html lang="en" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="min-h-full bg-slate-50 text-slate-950">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-blue-700 focus:ring-2 focus:ring-blue-600">Skip to content</a>
        <Navbar />
        <main id="main-content" tabIndex={-1} className="min-h-dvh pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-16 lg:pb-0 lg:pt-20">
          {children}
        </main>
      </body>
    </html>
  );
}
