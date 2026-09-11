import Script from "next/script";
import { googleAdsBootstrap, googleAdsTagId } from "@/lib/telemetry/google-ads";

export function GoogleAdsTag() {
  const tagId = googleAdsTagId();
  if (!tagId) return null;
  return <>
    <Script id="axvital-google-ads-config" strategy="afterInteractive">{googleAdsBootstrap(tagId)}</Script>
    <Script id="axvital-google-ads-library" src={`https://www.googletagmanager.com/gtag/js?id=${tagId}`} strategy="afterInteractive"/>
  </>;
}
