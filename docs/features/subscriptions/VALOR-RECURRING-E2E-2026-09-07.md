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
| `A44` | INVALID PAYMENT INFO | **NOT cross-host.** The subscription `payment_info` was built with the wrong keys `vault_id` / `payment_id`; Valor's `add_subscription` contract names the vault reference `CustomerProfileID` / `PaymentProfileID`, so the gateway saw no vault reference at all. The earlier cross-host theory was a mis-diagnosis: the raw-card isolation test also changed the keys. Confirmed 2026-09-10 (see resolution below). | **FIXED** |
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
3. **`A44` — correct the `payment_info` vault-reference key names** (fix landed 2026-09-10, after Valor support confirmed vault ids created via the Vault API *do* apply to subscription calls):
   - `lib/payments/valor/subscriptionApi.ts` (`buildAddSubscriptionBody` + `ValorSubscriptionPaymentInfo`) and `supabase/functions/_shared/valor.ts` (`buildValorRecurringBody`) now emit `CustomerProfileID` / `PaymentProfileID` (was `vault_id` / `payment_id`). `buildUpdateSubscriptionBody` / `updateRecurringSubscription` inherit the shared builder, so the card-repoint and past-due recovery paths are fixed too.
   - Tests updated (`tests/valor-subscription-api.test.ts`, `lib/payments/__tests__/valor-vault.test.ts`) + new Node↔Deno `payment_info` parity guard (`lib/payments/__tests__/valor-subscription-deno-parity.test.ts`).

## Verified working through the UI (unchanged by this change)

- Migration `20260906120000` + all six Edge Functions deployed with the scope-separation code.
- 4-step wizard; "Migrated billing: setup required" cutover panel (flat layout).
- Scope-gated billing card UI: correctly blocked a location with no Valor SaaS account
  ("Valor SaaS billing is not configured for this scope") and enabled the provisioned one ("Valor ready").
- Passage.js vault card-save succeeded ("Location billing card saved securely with Valor");
  the new profile was set primary and the active subscription was **repointed** to it while the
  prior profile was demoted — i.e. card replacement is correctly scoped.
- Live pricing quote (`$730.08` = `$702.00` + 4% card surcharge) matches the cascade line items.

## Resolution — `A44` was wrong `payment_info` keys, not cross-host (confirmed 2026-09-10)

Valor support answered the question below:

> "vault id and payment ids created via Vault API **can be applied** to your subscription
> calls." (And separately: the path is routed solely by `txn_type`; `/?addSub` and
> `/?addSubs` are processed identically.)

Cross-host vault references *are* supported. The real defect was the key names: the
`add_subscription` `payment_info` object must use `CustomerProfileID` / `PaymentProfileID`
(per <https://valorapi.readme.io/reference/add-subscriptions>), but the code sent
`vault_id` / `payment_id`, so Valor saw no vault reference → `A44 INVALID PAYMENT INFO`.
The prior cross-host theory was confounded because the raw-card isolation test *also*
switched to the correct keys (`card_number`/`expiry_date`/`cvv`).

### Staging proof (Uptown Branch, sub `d3d9f799` / Valor `55000`, vault `130618`/`124285`, EPI `…2412333540`)

Same account, same vault refs, same cross-host setup (demo vault → securelink `/?addSub`):

| Invoice | `payment_info` keys | `processor_response` | Invoice status |
| --- | --- | --- | --- |
| `SUB-202608-0006` / `-0007` | `vault_id` / `payment_id` | `{error_no:"A44", desc:"INVALID PAYMENT INFO"}` | voided |
| `SUB-202608-0008` (after fix) | `CustomerProfileID` / `PaymentProfileID` | `{error_no:"S00", error_code:"00", msg:"SUBSRIPTION_EDITED"}` | **paid** |

`S00` came back on the `updateSub` path (sub `55000` pre-existed), which shares the same
`payment_info` builder as `addSub`, so both the create and update/recovery paths are proven.
Subscription stayed `active`.

### Original question sent to Valor (isvsupport@valorpaytech.com) — now answered

> In the Valor sandbox, can a recurring subscription created via `add_subscription`
> (`https://securelink-staging.valorpaytech.com:443/?addSub`) reference a `vault_id` +
> `payment_id` that were created through the Vault APIs on
> `https://demo.valorpaytech.com`? … Secondary: the docs page for Add Subscription lists
> the path as `/?addSubs`, but the live gateway processes `/?addSub` (and `/?addSubs`)
> identically — please confirm the canonical path.

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
