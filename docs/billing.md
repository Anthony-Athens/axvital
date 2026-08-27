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


## Sprint 12B account controls

See [Sprint 12B account control report](sprint-12b-account-control.md) for export, deletion migrations, immediate billing closure during account deletion, and required staging/owner checks. Ordinary subscription cancellation still does not delete health records. Self-service account deletion defaults off; legal/support launch gates remain open.


## Subsequent targeted fix — customer mapping concurrency

**Supersedes earlier statements that the future Checkout race remains uncorrected.** The race is now repository-resolved using a database-reserved logical operation, deterministic Stripe idempotency, atomic mapping establishment and immutable mapping guards. Metadata-only webhook upserts have been replaced with matching-projection updates. See [Billing customer integrity](billing-customer-integrity.md) for implementation, finite retry window, orphan recovery, file inventory and read-only reconciliation.

New migration: `202608270005_billing_customer_coordination.sql`, after 003/004. Review and apply 003/004/**005** together for staging validation before serving the new Checkout code. No migration or external provider change was performed here. Existing customer mappings are preserved.

**OWNER ACTION REQUIRED:** run the read-only historical inventory in the correct provider/project scope (including every Test Clock if used), resolve duplicate/unmapped billable subscriptions, verify baseline schema/Storage/grants and exercise concurrent Test Mode Checkout and failure/retry/webhook flows. Historical data was not inspected. Account deletion must remain disabled. Legal/support gates are unchanged; Sprint 12C was not begun.
