# Condition campaign pages

Routes: `/conditions/ms`, `/conditions/psoriasis`, `/conditions/hsv`.

`lib/campaigns/conditions.ts` owns the copy. `components/campaigns/ConditionLandingPage.tsx` owns the shared server-rendered layout. The dynamic route generates only configured slugs; unknown slugs return 404. Add one configuration object to add a future page after copy review. There is no CMS, data write, or condition inference from visits.

Campaign routes use a simplified AXVital / Sign In header. Hero, experiment, and final Get Started links all go to `/signup` without query parameters. Legal links remain visible. Normal application navigation is unchanged outside `/conditions/:slug`.

## Discoverability and metadata

Each page has unique title, description, and Open Graph text. The existing application does not use canonical metadata, so none was introduced. The sitemap is an explicit list, not automatic route discovery; these routes are excluded. No inbound links were added to the homepage, footer, or product navigation. Campaign-only pages use `noindex, follow`; this discourages search indexing but is not access control. Direct visitors and advertising crawlers can load them without authentication.

## Privacy and analytics

The homepage has no established CTA telemetry. The first-party client event allowlist only permits pricing/upgrade intent; it was not expanded. No new events, pixels, cookies, storage, or third-party scripts were added. If measurement is later required, review generic campaign-view and signup-intent events without topic, URL, referrer, or condition fields; do not add them casually to third-party advertising tools.

The campaign response has `Referrer-Policy: no-referrer`, matching metadata, and outbound links have `rel=noreferrer`. Plain links also avoid Next.js signup prefetching from the campaign page. These protections do not hide the initial URL from the host, CDN, browser history, or the advertising platform that supplied it. Do not use condition-page visits to infer a diagnosis, create remarketing audiences, or populate health records. Review access-log retention and any future pixels/link decoration before launching ads. No HIPAA or security certification claim is made.

## Copy boundaries

Examples are hypothetical personal questions, not recommended treatments or validated outcomes. Copy does not promise disease improvement or causal discovery. MS does not imply relapse diagnosis/progression prediction; psoriasis does not imply food or supplements treat it; HSV uses stigma-free language and disclaims transmission-risk assessment/prevention and replacement of antiviral care. The HSV precaution that absent symptoms do not establish safety is consistent with [CDC information](https://www.cdc.gov/herpes/about/index.html).

The pages clarify that available experiment outcomes/readiness depend on tracking and that saving/starting requires Premium. No pricing experiment was introduced. Medical/marketing review before paid launch is still recommended.

No migrations, RLS changes, authentication changes, or domain/backend changes are required. Possible future configurations: migraine, IBS, eczema, GERD, arthritis, sleep apnea (not implemented).

## Verification (September 3, 2026)

- TypeScript, ESLint, production build, and three new campaign tests passed.
- Full sandbox test run: 554 passed; two existing UI test files failed because esbuild could not read the parent directory. Both files were rerun with approved elevated access: all 14 contained tests passed.
- All three routes and `/signup`, `/privacy`, `/terms`, `/contact`, `/health-disclaimer` returned HTTP 200 without credentials. Each campaign response included `Referrer-Policy: no-referrer`.
- Browser checks covered all three campaigns at 1440px desktop, 390px mobile, and 320px narrow-phone widths. No horizontal overflow or broken images; mobile hero signup remained within the first viewport. Campaigns use no raster images.
- Hero, mid-page, and final signup CTAs reached the existing logged-out signup form. The signup document referrer was empty. The explanatory anchor and Health Disclaimer link worked. Unique titles/Open Graph metadata and `noindex, follow` were verified. No browser console errors/warnings were observed.
- No account was created, no data was submitted, and no deployment was performed.

## File inventory

Created: `app/conditions/[slug]/page.tsx`, `components/campaigns/CampaignHeader.tsx`, `components/campaigns/ConditionLandingPage.tsx`, `lib/campaigns/conditions.ts`, `lib/campaigns/conditions.test.ts`, and this document.

Modified: `components/Navbar.tsx` (campaign-only header selection) and `next.config.ts` (campaign-only referrer header). Homepage, footer, sitemap, and domain features are unchanged.
