# Condition campaigns: SEO and funnel measurement

## Public discovery

Campaign URLs are `https://axvital.com/conditions/ms`, `https://axvital.com/conditions/psoriasis`, and `https://axvital.com/conditions/hsv`. The three statically generated pages retain unique observational titles, descriptions, Open Graph text, index/follow metadata, one primary H1, and the shared Condition Intelligence demo. Unknown slugs remain 404. No redesign or medical claims were added.

`lib/seo.ts` supplies the production origin to the existing metadata, sitemap and robots routes. Canonical and Open Graph URLs use the clean self URL regardless of campaign queries or preview environment. The existing sitemap already included all three pages; its localhost fallback is now removed. Existing build-time lastModified, monthly frequency and 0.6 priority remain. Robots permits condition pages and advertises the production sitemap; private-route rules are unchanged. Indexing is a search-engine decision, not guaranteed by inclusion.

The audit found no reusable JSON-LD or Twitter metadata convention. No new structured-data subsystem, medical schema, or social-image pipeline was added. Those are optional future work. Older documentation describing these pages as noindex and excluded from the sitemap was stale and is superseded here.

## Funnel

The existing Vercel Analytics integration is reused; no Google Ads/GTM scripts or new provider are installed. Event names are centralized in `lib/telemetry/campaign.ts`, matching the existing title-case product event convention.

| Step | Event | Source |
|---|---|---|
| Landing | Pageview plus Condition Marketing Viewed | Root ProductAnalytics on the exact three public paths |
| CTA | Condition Marketing CTA Clicked | Every shared CampaignSignup link |
| Signup reached | Signup Viewed | Root ProductAnalytics on /signup |
| Valid submission | Signup Started (existing name) | After validation, before Supabase signUp |
| New account observed | Signup Completed | Successful Auth response with nonempty identities and created_at within this request's client-clock interval |
| Authoritative account total | Account Created (existing) | Verified, deduplicated profile INSERT webhook; no campaign attribution |
| Paid conversion | Paid Subscription Started (existing) | Verified first positive invoice.paid; billing interval only |

Do not sum Signup Completed and Account Created: they observe the same business milestone with different delivery/attribution boundaries. Browser completion conservatively skips obfuscated replies, existing accounts, malformed timestamps, clock-skewed responses and errors. It is best effort, not an accounting ledger or proof of email verification. The existing profile webhook is the authoritative deduplicated account-creation integration. No source-to-user identity stitching or campaign persistence in Auth, profiles, product_events, cookies or browser storage is introduced. Paid conversion remains unconnected to campaign source.

Root route effects suppress Strict Mode/rerender duplicates. Signup suppresses in-flight and completed resubmissions. Reloads/revisits may count new views; this is not unique-user counting. An active session proceeds to existing onboarding; a confirmation-required response stays on signup with a generic check-email message instead of redirecting an unauthenticated user to protected onboarding. Existing signup validation and account provisioning remain in place.

## Attribution and privacy

The query key `source_page` accepts only `conditions_ms`, `conditions_psoriasis`, or `conditions_hsv`. All five standard UTM keys are supported: utm_source, utm_medium, utm_campaign, utm_term, utm_content. Values must match explicit approved labels. The initial Google Ads defaults in `lib/telemetry/campaign.ts` are source `google`, medium `cpc`, campaigns `ms_launch` / `psoriasis_launch` / `hsv_launch`, and content `ad_a` / `ad_b` / `ad_c`. Values are lowercase and exact-match; no case normalization occurs. `utm_term` has an empty default allowlist and is discarded for this release, including dynamic keyword/search text. Its existing support for explicitly reviewed labels remains available through configuration; no free-text pass-through is introduced. Configure additional labels before building using `NEXT_PUBLIC_CAMPAIGN_UTM_ALLOWLIST`, a JSON object of arrays keyed by UTM name. Supplied arrays replace defaults for that key. Maximum 100 labels per key, each 1–64 ASCII letters/digits/underscore/hyphen. Use nonpersonal campaign/keyword/ad codes; never approve names, identifiers, health narratives, emails or user-entered search text. A character filter alone cannot establish that a value is safe, which is why the exact allowlist is required.

Example URL pattern (placeholders must be replaced with reviewed configured labels):

`?utm_source=google&utm_medium=cpc&utm_campaign=<approved_campaign>&utm_content=<approved_ad_variant>`

No example campaign names are embedded in production links. Unlisted values, duplicate parameters, click IDs, referrers, arbitrary keys and fragments are discarded. The landing condition overrides forged source_page input. The same sanitizer reconstructs analytics properties instead of forwarding input objects. Attribution travels only in the signup URL and component memory; it is omitted from Auth requests and subsequent onboarding redirects. The source survives a no-JavaScript CTA; UTM propagation and custom events require JavaScript. No cross-tab/cross-device/email-confirmation attribution is attempted.

All analytics URLs strip query/hash. Only the three known marketing paths are added to the public path allowlist; private and unknown paths still collapse to /app. Event properties contain source_page and approved UTMs only, never emails, names, passwords, Auth IDs or health records. Condition source identifies a public campaign, not a diagnosis. Do not use these events for health-based advertising audiences. Global no-referrer handling and noreferrer CTA links remain. Incoming URLs are still visible to the browser, hosting/CDN infrastructure and referring ad platform; review their retention separately. The privacy page reflects campaign measurement.

Delivery is best effort: blockers, disabled scripts, network failures, immediate navigation, clock skew or service settings can cause undercounting. Vendor failures are caught and never awaited before navigation/Auth. Fixed-category development errors omit credentials and payloads.

## External launch steps

1. Confirm the apex domain is the intended production host; configure hosting redirects from www and HTTP to HTTPS apex. Repository canonicals do not configure DNS or redirects. Verify redirects preserve campaign queries.
2. Verify the domain property in Google Search Console, submit `https://axvital.com/sitemap.xml`, and inspect each clean URL for live indexing eligibility. Preview-host noindex controls are hosting configuration.
3. Enable/verify Vercel Web Analytics and custom event availability for the project. Configure reviewed UTM labels and redeploy. Test-service calls do not verify dashboard delivery.
4. Complete/verify the migration, Supabase profile INSERT webhook, secrets and Stripe invoice.paid configuration documented in `docs/product-analytics.md`. Confirm Auth email confirmation, Site URL and redirect settings against the deployed onboarding flow.
5. Run one controlled fresh signup in the intended test environment and reconcile browser funnel events with the authoritative Account Created webhook. Test confirmation enabled/disabled and an existing-account attempt. No real account, payment, owner email, or advertising campaign was created during local QA.
6. Google Ads conversion import is not configured. If later approved, its browser integration point is the `campaignEvents.completed` call after `newlyCreatedSignup` in app/signup/page.tsx; do not attach to CTA clicks or generic success navigation. Define consent, conversion deduplication and eligible minimal payload separately. Do not send condition source, keyword/health context, or signup fields to advertising systems. The existing server Account Created event is an alternative authoritative signal but has no browser click attribution. Vercel custom events do not automatically become Google Ads conversions.

Before paid launch, verify live redirects, indexing, dashboard events, webhook totals and applicable advertising/privacy requirements. This repository pass does not establish Google Ads policy eligibility or configure campaigns.

External references: [Search Console sitemap submission](https://support.google.com/webmasters/answer/7451001), [Google Ads website conversion setup](https://support.google.com/google-ads/answer/16560108).

References: [Vercel custom events](https://vercel.com/docs/analytics/custom-events), [Supabase signup responses](https://supabase.com/docs/reference/javascript/auth-signup).

## Validation and files

Regression coverage includes the real metadata/sitemap/robots exports, safe labels and forged/duplicate parameters, all three CTA keys, native navigation under analytics failure, Strict Mode view deduplication, actual signup UI success/confirmation/failure/existing-account responses, submission locking and separation of attribution from Auth fields. Service calls are mocked; the production-page browser pass uses real local Next routes without submitting real credentials.

Main files: app/conditions/[slug]/page.tsx, app/sitemap.ts, app/robots.ts, lib/seo.ts, components/campaigns/CampaignSignup.tsx, components/campaigns/ConditionLandingPage.tsx, components/ProductAnalytics.tsx, lib/telemetry/{campaign,client,policy}.ts, lib/auth/signup-result.ts, app/signup/page.tsx, app/privacy/page.tsx, .env.example, campaign/SEO/UI tests and documentation. No dependencies, migrations, pricing changes or Condition Intelligence calculations changed.


Final local results (September 11, 2026): all 627 tests pass, including the updated root-layout VM fixture with unchanged URL-sanitization assertions. TypeScript, ESLint and production build pass. Browser checks covered all three query-bearing routes at 320/390/1440 pixels, single title/description/canonical/H1, index/follow, Open Graph URL, demo presence, all four CTA destinations, and actual logged-out signup navigation with an empty referrer. No page overflow or browser errors occurred. Mobile signup navigation passed at 320 and 390 pixels; the generated sitemap and robots output were inspected. The unconfigured sample campaign label was correctly omitted while source and medium survived. Live vendor delivery, real account creation and Google dashboard setup remain external validation steps.


## Initial Google Ads allowlist rollout

The approved values ship as central defaults; an unset `NEXT_PUBLIC_CAMPAIGN_UTM_ALLOWLIST` or `{}` uses them. No environment variable is required for this rollout. Existing per-field environment arrays still replace defaults, so remove stale overrides or update them to match the approved values before rebuilding/deploying. NEXT_PUBLIC values are incorporated at build time; changing a deployed environment value requires a new build. No local or remote environment settings were changed.

Approved examples:

- https://axvital.com/conditions/ms?utm_source=google&utm_medium=cpc&utm_campaign=ms_launch&utm_content=ad_a
- https://axvital.com/conditions/psoriasis?utm_source=google&utm_medium=cpc&utm_campaign=psoriasis_launch&utm_content=ad_b
- https://axvital.com/conditions/hsv?utm_source=google&utm_medium=cpc&utm_campaign=hsv_launch&utm_content=ad_c

Unknown source/medium/campaign/content values, uppercase variants, arbitrary fields and unapproved utm_term values remain discarded. The earlier QA note about dropping ms_launch describes the pre-configuration state; these three launch labels are now approved. Canonical URLs and all funnel event names/semantics remain unchanged. Attribution still never enters Auth/profile data.

Allowlist validation: all 17 relevant attribution, signup UI, telemetry and SEO tests pass; TypeScript, ESLint and production build pass. Changes in this configuration pass are limited to lib/telemetry/campaign.ts, its two attribution/UI test files, .env.example and this document.


## Google Ads base tag

The root layout now includes `GoogleAdsTag` once, alongside the unchanged Vercel `ProductAnalytics`. This supersedes earlier notes that no Google script is installed. `NEXT_PUBLIC_GOOGLE_ADS_TAG_ID=AW-18445445142` is configured in .env.example and local .env.local; set the same value in the deployment environment and rebuild. Missing/invalid values omit the scripts. No GA4 or GTM container existed to extend.

Two stable Next Script IDs load the initialization and gtag.js with afterInteractive, without repeating scripts on client navigation. Initialization queues one config for the destination. Configuration suppresses automatic pageviews, overrides page_location with the generic production homepage, clears page_referrer, sets a generic AXVital title, and disables personalized-ad signals and Enhanced Conversions. No existing Vercel events, UTM properties, forms, account IDs, or health data are forwarded to gtag. Optional initialization failures are caught; script/network failures do not gate rendering or Auth.

Google's script still performs its own network/cookie processing; these settings are not a claim of zero technical data collection. Keep automatic user-provided data collection and Enhanced Conversions disabled in the Google tag destination settings; no account-side settings were changed here. Do not add health-based audiences or attach extra destinations with automatic collection. Review deployed tag behavior with Google's tooling after rollout. Reference: https://support.google.com/google-ads/answer/13438166 and https://developers.google.com/tag-platform/security/guides/privacy.

No conversion label is available in the repository. Account Created conversion wiring remains deferred: obtain the label for AW-18445445142, then attach an explicitly deduplicated conversion to verified successful account creation, not a CTA or pageview. Existing browser Signup Completed and server Account Created events remain Vercel-only. The generic URL configuration intentionally gives up page/campaign detail in Google; aggregate campaign analysis stays in Vercel.

Base-tag validation: all 21 relevant telemetry/campaign tests, TypeScript, ESLint and production build pass. Local production browser checks show one gtag.js loader and one config block on signup and all three condition pages; signup-to-login client navigation retains one of each. The configured destination is AW-18445445142, Vercel's script remains present, and no browser errors appeared. Remote Google Ads diagnostics and deployment environment settings were not changed or verified.
