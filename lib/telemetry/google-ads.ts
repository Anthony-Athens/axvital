import { productionOrigin } from "../seo.ts";

export function googleAdsTagId(value = process.env.NEXT_PUBLIC_GOOGLE_ADS_TAG_ID) {
  return value && /^AW-\d+$/.test(value) ? value : null;
}

export function googleAdsBootstrap(tagId: string) {
  if (!googleAdsTagId(tagId)) return "";
  // Never read route, query, referrer, forms, user state, or campaign properties.
  const config = JSON.stringify({
    send_page_view: false,
    page_location: `${productionOrigin}/`,
    page_referrer: "",
    page_title: "AXVital",
    allow_ad_personalization_signals: false,
    allow_enhanced_conversions: false,
  });
  return `try {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};
    window.gtag('set', ${config});
    window.gtag('js', new Date());
    window.gtag('config', ${JSON.stringify(tagId)}, ${config});
  } catch (_) { /* Optional tag must never block the application. */ }`;
}
