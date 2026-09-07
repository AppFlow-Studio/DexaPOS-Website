# Valor Recurring Billing — Sandbox E2E Findings (2026-09-07)

First live end-to-end exercise of the separated subscription billing (PR #303) against
the Valor **sandbox**, driven through the real HQ UI + staging Supabase
(`dfwqakoyittmrwbqvxgw`) with the migration applied and all six billing Edge Functions
deployed from `feat/valor-subscription-step-flow`.

Test merchant: **Joes Coffee Shop** (`org_34LN9aMJGO4jNllGTvHH4CLB5gq`), location
**Uptown Branch** (active location subscription, DEXA Valor SaaS account EPI `…333540`).
Card: Valor documented test Visa `4012000098765439 / 12/27 / 999`.

## Result: the recurring rail works — after fixing a cascade of real defects

A single `billing-charge-subscription` call was driven from failure to success. Valor
created recurring subscription **`55000`**, the invoice went **paid**, and the
subscription recovered from `past_due` to **active**. Each failure below is a genuine
finding confirmed against Valor's published error reference
(<https://valorapi.readme.io/reference/error-code-description>) — none guessed.

| Valor code | Meaning | Cause | Status |
| --- | --- | --- | --- |
| `A44` | INVALID PAYMENT INFO | Card vaulted on `demo.valorpaytech.com`; `/?addSub` runs on `securelink-staging.valorpaytech.com`. The vault_id is not resolvable across those sandbox hosts. Reproduced with a freshly-created vault entry, so not stale data. | **OPEN — see Valor question** |
| `E07` | INVALID EXPIRY DATE | `expiry_date` must be `MMYY` (docs); `MM/YY` is rejected. Card-method only (the vault path sends no expiry). | Noted |
| `SUB08` | STARTS FROM PAST DATE | The charge sent `subscription_starts_from` = the elapsed `next_billing_date` when recovering a past-due cycle. | **FIXED** |
| `A40` | INVOICE # MUST BE 12 ALPHANUMERIC | Recurring path used a naive `invoiceNumber.slice(0,12)`, leaving the hyphens in `SUB-202608-0002`. Breaks **every** recurring charge (all invoice numbers contain hyphens). | **FIXED** |

After the two fixes below + using a card whose token resolves on the transaction host,
`/?addSub` returned `error_no S00` with `subscription_id 55000`.

## Fixes applied in this change

1. **`SUB08` — clamp the schedule start to ≥ today** (charge-time, builders kept pure):
   - `supabase/functions/billing-charge-subscription/index.ts` — clamp `startsOn` to today when the scheduled cycle has elapsed.
   - `app/manage/actions/merchant-billing.ts` (card-replacement `updateSubscription`) — same clamp, preserving the original day-of-month as `charge_on`.
2. **`A40` — normalize `invoice_no` to ≤12 alphanumerics**, reusing the sale path's `normalizeValorInvoiceNumber`:
   - `supabase/functions/_shared/valor.ts` (`buildValorRecurringBody`).
   - `lib/payments/valor/subscriptionApi.ts` (`buildAddSubscriptionBody`; `buildUpdateSubscriptionBody` inherits it).
   - Regression assertions added to `tests/valor-subscription-api.test.ts`.

## Verified working through the UI (unchanged by this change)

- Migration `20260906120000` + all six Edge Functions deployed with the scope-separation code.
- 4-step wizard; "Migrated billing: setup required" cutover panel (flat layout).
- Scope-gated billing card UI: correctly blocked a location with no Valor SaaS account
  ("Valor SaaS billing is not configured for this scope") and enabled the provisioned one ("Valor ready").
- Passage.js vault card-save succeeded ("Location billing card saved securely with Valor");
  the new profile was set primary and the active subscription was **repointed** to it while the
  prior profile was demoted — i.e. card replacement is correctly scoped.
- Live pricing quote (`$730.08` = `$702.00` + 4% card surcharge) matches the cascade line items.

## Outstanding blocker — cross-host vault (`A44`)

The vault APIs run on `demo.valorpaytech.com`; the subscription/transaction APIs run on
`securelink-staging.valorpaytech.com`. A `vault_id`/`payment_id` created on the former is
rejected as INVALID PAYMENT INFO by `/?addSub` on the latter. Valor's docs do not document
cross-host vault compatibility. A raw card in `payment_info` (same request, same host/creds)
is accepted, which isolates the failure to the cross-host vault reference.

### Question for Valor (isvsupport@valorpaytech.com)

> In the Valor sandbox, can a recurring subscription created via `add_subscription`
> (`https://securelink-staging.valorpaytech.com:443/?addSub`) reference a `vault_id` +
> `payment_id` that were created through the Vault APIs on
> `https://demo.valorpaytech.com` (`/api/valor-vault/addcustomer`,
> `/api/fl-valor-vault/addpaymentprofile/{vault_id}`)? We create the customer/payment
> profile successfully on the demo host and receive valid ids, but `add_subscription` on
> the securelink host returns `error_no A44 "INVALID PAYMENT INFO"` for those ids (a raw
> card in `payment_info` is accepted on the same call). If cross-host vault references are
> not supported in sandbox, what host/flow should back a recurring subscription's
> `payment_info` — must the vault be created on the same host as the subscription API, or
> should we pass a Passage.js token / card at subscription time?
>
> Secondary: the docs page for Add Subscription lists the path as `/?addSubs`, but the
> live gateway processes `/?addSub` (and `/?addSubs`) identically — please confirm the
> canonical path.

## Environment note (not a PR defect)

The local dev server's UI "Charge" returns **Unauthorized** because `.env`'s
`SUPABASE_SERVICE_ROLE_KEY` is stale relative to staging's rotated key (2026-09-04), and
the server action authenticates to the Edge Function with only that bearer. The function
itself accepts the `x-internal-secret` (`INTERNAL_NOTIFICATION_SECRET`) fallback, which is
how the E2E calls succeeded. Consider updating the local key and/or having the server
action also send `x-internal-secret`.

## Residual staging state

The test left Uptown Branch subscription `d3d9f799` **active** with real Valor sandbox
schedule `55000` and a real vaulted test-card profile (`28969f9b`) — a usable fixture for
future runs. Staging Edge Functions were restored to exact PR code after the isolation test.
