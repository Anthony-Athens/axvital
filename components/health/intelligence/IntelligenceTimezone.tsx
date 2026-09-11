"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export function IntelligenceTimezone() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!zone) throw new Error("TIMEZONE_UNAVAILABLE");
      const url = new URL(window.location.href); url.searchParams.set("timeZone", zone);
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    } catch { queueMicrotask(() => setFailed(true)); }
  }, [router]);
  return <p role="status" className="p-6">{failed ? "Your browser timezone is unavailable. Enable timezone support and reload to view local-day comparisons." : "Preparing your local-day timeline…"}</p>;
}
