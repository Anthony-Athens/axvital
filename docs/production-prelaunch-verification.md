# AXVital production pre-launch verification

Updated 2026-09-01. Classification: **Not Ready for Beta**. The existing deployed environment is authorized for synthetic pre-launch testing, but provider-writing checks remain gated until its provider identity and absence of real user data are confirmed.

## Environment map

| Component | Actual configuration | Verified |
| --- | --- | --- |
| AXVital URL | `https://www.axvital.com` | Public deployment reached in browser |
| Vercel project | Deployment appears consistent with Vercel/Next.js, but no project link or provider identity is available locally | No |
| Supabase project | A local project reference exists; it could not be matched to deployed client configuration or operator confirmation | No |
| Stripe mode | Local secret key shape indicates Test Mode | Local configuration only |
| Stripe webhook | Local webhook secret is absent; deployed endpoint/provider configuration not inspected | No |
| Email provider | Repository documents Supabase custom SMTP/Resend; deployed delivery was not verified | No |
| Support contact | Deployed Contact page states email support is unavailable | Verified unavailable |
| Privacy contact | No deployed monitored contact is shown | No |

No secret values are recorded here.

## Safety decision

The deployed application is real and reachable, and the sprint authorizes synthetic testing there. However, the following prerequisites for provider writes could not be confirmed from available evidence:

1. The local Supabase project is the exact project used by the deployment.
2. The Vercel project identity and deployed environment-variable mapping.
3. Count-level confirmation that Auth and application ownership contain no real users/data.
4. An operator-controlled disposable email inbox.
5. Deployed Stripe price, webhook, and Test Mode configuration.

Therefore no users, records, charges, subscriptions, migrations, exports, deletions, or provider artifacts were created or modified.

## Deployed read-only browser evidence

- The home, Pricing, Signup, Login, Contact, Privacy, and Terms pages loaded at `www.axvital.com`.
- Signup exposes email, password, name, preferred name, and primary-goal controls.
- Login exposes password recovery.
- Pricing displays Free and Premium, with Premium shown as `$9.99/month` in the monthly view.
- Contact explicitly reports that email support is unavailable on the deployment.
- Privacy and Terms describe account, billing, export, and deletion behavior but do not supply an approved operator identity, geography, minimum age, retention commitment, governing law, or monitored contact.

This is public-page evidence only. It does not prove Auth, email, billing, database, Storage, or deletion behavior.

## Provider verification status

| Area | Result |
| --- | --- |
| Migration parity | Blocked: deployed migration history unavailable |
| Schema/RLS | Blocked: project identity and disposable users unavailable |
| Auth/email | Blocked: operator-controlled inbox and provider configuration unavailable |
| Authenticated journey | Blocked: no verified disposable account |
| Stripe lifecycle/reconciliation | Blocked: deployed Test Mode mapping and webhook unavailable |
| Export | Blocked: no populated disposable account |
| Free/paid deletion and old-session denial | Blocked: no disposable accounts and provider identity not confirmed |
| Storage | Blocked: deployed bucket inventory unavailable |
| Backup/recovery | Blocked: Supabase project plan/capabilities unavailable |

## Explicit preflight authorization

The read-only preflight accepts either a designated staging environment or this production pre-launch strategy. Production pre-launch mode requires all of the following outside source control:

```text
AXVITAL_ENVIRONMENT=production
AXVITAL_PRELAUNCH_TESTING=true
AXVITAL_SYNTHETIC_USERS_ONLY=true
AXVITAL_NO_REAL_USER_DATA_CONFIRMED=true
AXVITAL_EXPECTED_SUPABASE_PROJECT_REF=<exact deployed project ref>
```

It additionally requires a non-local application host, an exact Supabase URL/reference match, Stripe Test Mode, and the existing operational variables. The assertions must be set only after an authorized operator has actually verified them. A passing preflight is still configuration evidence, not workflow evidence.

## Legal decision ledger

| Decision | Owner | Status |
| --- | --- | --- |
| Approved operator/legal identity | Operator/legal | Open |
| Minimum user age | Operator/legal | Open |
| Initial launch geography | Operator/legal | Open |
| Active-data and backup retention approach | Operator/privacy/legal | Open |
| Privacy-rights request and identity-verification procedure | Privacy/legal | Open |
| Refund and subscription terms | Billing/legal | Open |
| Governing law/jurisdiction, if required | Legal | Open |
| Privacy page approval | Legal/privacy | Open |
| Terms page approval | Legal | Open |

Setting an environment variable is not legal approval. Record approval and effective date in the private launch record before enabling external invitations.

## Practical initial-beta ownership

| Area | Primary role | Backup/escalation |
| --- | --- | --- |
| Application/deployment/Auth/database | Application operator | Hosting/Supabase provider support |
| Billing/webhooks/refunds | Billing owner | Stripe support and privacy owner when user data is involved |
| Privacy requests/deletion failure | Privacy owner | Application operator and legal counsel |
| Suspected exposure/security incident | Security incident owner | Privacy owner and legal counsel |

Actual people and monitored contact paths belong in the private operator register, not necessarily in the repository.

## Required next verification window

After the environment assertions and disposable inbox are supplied, run `npm run ops:preflight`. If it passes, execute in order: count-level user/data inventory; migration comparison and security preflight; two-user RLS; Auth/email; desktop/mobile journey; Stripe Test Mode lifecycle and reconciliation; export; dedicated free and paid deletion plus old-session denial; Storage inventory; QA cleanup. Stop on any identity mismatch, real-user signal, live Stripe configuration, or cross-owner access.
