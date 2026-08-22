# AXVital billing

AXVital has a Free plan and one Premium plan: $9.99 monthly or $79.99 annually. Stripe is authoritative; Supabase stores a webhook-synchronized entitlement projection.

## Test Mode setup

1. Create one Premium product with monthly and annual recurring prices.
2. Configure STRIPE_PRICE_PREMIUM_MONTHLY and STRIPE_PRICE_PREMIUM_ANNUAL.
3. Set the secret key, webhook secret, application URL, and Supabase service-role key.
4. Apply supabase/migrations/202608220001_add_billing_subscriptions.sql.
5. Configure /api/stripe/webhook for checkout completion, subscription create/update/delete, invoice paid, and invoice payment failed.
6. Configure Customer Portal.
7. Test success, cancellation, renewal, portal updates, and failed payment using documented Stripe test cards.

Checkout accepts only server-allowlisted intervals and supports Stripe promotion codes. No health information is sent to Stripe. Automatic Tax and trials are deferred.

Active and trialing grant Premium. Past-due and canceled retain grace access only through a future stored period end. Other and unknown states fail closed. Cancellation never deletes health data. The development bypass works only outside production.

Webhook payloads are signature-verified and recorded by event ID. Service-role code writes subscriptions; authenticated users have read-only RLS access to their own row.

## Production checklist

- Activate and verify Stripe; review support contact, statement descriptor, refund policy, tax requirements, and Portal settings.
- Create live products and Prices and configure the live webhook.
- Set production deployment variables and keep the billing bypass disabled.
- Test a controlled purchase, cancellation, renewal, portal return, and webhook delivery.
- Confirm RLS and service-role isolation.

Troubleshooting: checkout errors usually indicate missing URL/key/Price configuration. Portal errors may indicate no customer mapping. Activation depends on the verified webhook, not the Checkout redirect.
