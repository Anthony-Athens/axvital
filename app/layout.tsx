import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Navbar } from "@/components/Navbar";
import { ProductAnalytics } from "@/components/ProductAnalytics";
import { GoogleAdsTag } from "@/components/GoogleAdsTag";
import { productionOrigin } from "@/lib/seo";
import "./globals.css";

// Self-hosted at build time; no browser requests go to Google Fonts.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

const description =
  "Track what matters, discover what works, and improve your health with personalized insights.";

export const metadata: Metadata = {
  metadataBase: new URL(productionOrigin),
  title: "AXVital | Health Operating System",
  description,
  applicationName: "AXVital",
  openGraph: {
    type: "website",
    siteName: "AXVital",
    title: "AXVital | Health Operating System",
    description,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: "AXVital | Health Operating System", description },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <body className="min-h-full bg-ground text-fg">
        <ProductAnalytics />
        <GoogleAdsTag />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:text-accent-fg focus:ring-2 focus:ring-accent-fg"
        >
          Skip to content
        </a>
        <Navbar />
        <main id="main-content" tabIndex={-1} className="min-h-dvh pt-16 lg:pt-20">
          {children}
        </main>
      </body>
    </html>
  );
}
