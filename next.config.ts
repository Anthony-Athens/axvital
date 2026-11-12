import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseWs = supabaseUrl.replace(/^http/, "ws");
const google = "https://www.googletagmanager.com https://*.google.com https://*.googleadservices.com https://*.doubleclick.net";

// Enforced now: blocks clickjacking, plugins, <base> hijacking and off-site form posts.
// None of these can break current pages.
const enforcedCsp = ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join("; ");

// Full allowlist runs report-only first: violations appear in the browser console
// without blocking anything. Promote it to Content-Security-Policy once clean.
const reportOnlyCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${google}`,
  "font-src 'self'",
  `connect-src 'self' ${supabaseUrl} ${supabaseWs} ${google}`.trim(),
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  `frame-src ${google}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.0.0.14"],
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Content-Security-Policy", value: enforcedCsp },
      { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      // Voice logging needs the microphone on our own origin only.
      { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), browsing-topics=()" },
    ] }];
  },
};

export default nextConfig;
