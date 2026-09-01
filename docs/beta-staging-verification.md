# AXVital beta staging verification record

Updated 2026-09-01. Classification: **Not Ready for Beta**. This record deliberately contains no credentials, tokens, user data, or private provider identifiers.

## Safety decision

No dedicated staging deployment was explicitly designated in the available workspace configuration. The local app URL is localhost, the configured Supabase project has no operator-provided staging designation, and no linked Vercel project is available. Therefore no remote migration, account creation, RLS mutation, email delivery, Stripe lifecycle, export, deletion, Storage mutation, backup restore, or rollback rehearsal was attempted.

The local Stripe key is Test Mode, but that alone does not prove the connected Supabase project or application is staging.

## Environment map

| Component | Staging configuration | Verified |
| --- | --- | --- |
| AXVital app | Not designated; local config points to localhost | No |
| Vercel project/environment | Not linked or identified | No |
| Supabase project | A project host is configured locally; staging identity is not asserted | No |
| Stripe mode | Local key shape indicates Test Mode | Local configuration only |
| Stripe product/prices | Local IDs are present; provider objects were not queried | No |
| Email delivery | Provider/sender not identified | No |
| Support contact | Not configured locally or delivery-tested | No |
| Privacy contact | Not configured locally or delivery-tested | No |

## Evidence ledger

| Area | Repository/code evidence | Staging/provider evidence | Status |
| --- | --- | --- | --- |
| Migrations | Ordered migrations exist through `202608280007_nutrition_goals_access.sql`; read-only preflight SQL exists | Remote history and schema not queried | Blocked |
| RLS | Policy migrations and database verification scripts exist | No two-user deployed test | Blocked |
| Auth/email | Automated auth/account tests exist | No signup, verification, reset, or SMTP delivery test | Blocked |
| Browser journey | Routes and automated repository tests/build are available | No designated staging URL or disposable accounts | Blocked |
| Stripe | Test-mode-aware billing implementation and read-only reconciliation tool exist | No Checkout, webhook, Portal, cancellation, or reconciliation run | Blocked |
| Export | Export implementation and automated tests exist | No deployed representative export | Blocked |
| Free deletion | Coordinated deletion implementation/tests exist | No disposable-user deletion or old-token denial test | Blocked |
| Paid deletion | Billing-first deletion implementation/tests exist | No Test Mode paid lifecycle or old-token denial test | Blocked |
| Storage | No application Storage usage found in the repository audit | Buckets, policies, and objects not inventoried remotely | Blocked |
| Observability | Safe errors and provider log touchpoints are documented | Alerts/delivery paths not configured or exercised | Blocked |
| Support/privacy | Workflow and escalation requirements are documented | Monitored contacts and owners not asserted | Blocked |
| Backup/recovery | Backup and rollback procedures are documented | Provider plan, last backup, restore owner, and rehearsal not verified | Blocked |

## Required designation before provider testing

An authorized operator must supply and independently confirm, outside source control:

1. The staging application URL and linked Vercel project/environment.
2. The exact non-production Supabase project reference.
3. Stripe Test Mode keys, webhook endpoint/secret, and intended test product/price IDs.
4. Staging Auth redirect allowlist and email provider/sender.
5. Approved disposable synthetic-user email strategy.
6. Monitored support/privacy contacts and role-based incident owners.
7. Backup configuration, restore owner, and an approved non-production rehearsal target.

Set `AXVITAL_ENVIRONMENT=staging` and `AXVITAL_STAGING_SUPABASE_PROJECT_REF=<exact-ref>` only after that designation. Then run `npm run ops:preflight`. A zero exit verifies configuration consistency only; it does not replace the provider and workflow checks in `docs/beta-operations-runbook.md`.

## Launch blockers

- **Blocker:** no explicitly designated staging app/Vercel/Supabase mapping.
- **Blocker:** deployed migration parity and schema/RLS preflight are unknown.
- **Blocker:** Auth/email and complete desktop/mobile journey are untested in staging.
- **Blocker:** Stripe Test Mode lifecycle and reconciliation are untested against the designated deployment.
- **Blocker:** deployed export, free deletion, paid deletion, cleanup, and old-token denial are untested.
- **Blocker:** Storage and backup/recovery provider state are unknown.
- **Blocker:** monitored support/privacy contacts, incident ownership, and legal approval are not asserted.
- **Should Fix Before Beta:** critical alert paths and Vercel rollback should be rehearsed after designation.
- **Post-Beta:** broader centralized monitoring and continuous drift checks may follow the controlled launch.

## Next step

Run a remediation sprint after the operator designates staging and supplies the non-secret environment map. Execute the runbook in order, preserving private evidence separately, and invite a controlled beta cohort only if every mandatory gate passes.
