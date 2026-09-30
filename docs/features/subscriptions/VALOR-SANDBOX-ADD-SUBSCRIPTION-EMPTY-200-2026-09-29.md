# Valor sandbox: `add_subscription` returns an empty HTTP 200 (2026-09-29)

**Status:** Blocked on Valor. Not a Dexa code defect.
**Supersedes:** the "A44 cross-host vault" blocker in
[VALOR-BILLING-PROD-PROMOTION-CHECKLIST.md](./VALOR-BILLING-PROD-PROMOTION-CHECKLIST.md) (resolved
2026-09-10) and the "EPI not provisioned for native recurring" diagnosis (disproved below).

## Finding

On the Valor sandbox, **every Add Subscription request that passes validation returns
`HTTP 200`, `Content-Type: text/html; charset=UTF-8`, zero-byte body, and creates nothing.**
This includes Valor's own documented example request, sent verbatim, on Valor's public demo EPI
with Valor's documented test card.

Requests that fail validation still get a normal JSON error, so the endpoint is reachable and the
credentials are good. The failure is in Valor's processing step after validation.

## Evidence

All calls: host `securelink-staging.valorpaytech.com`, EPI `2412333540`, 2026-09-29.

### Valid requests (all empty 200, nothing created)

| # | Endpoint | Request | Result |
|---|---|---|---|
| D1 | `POST /api/v1/add-subscription` | Valor docs example, verbatim (card `4012881888818888`) | empty 200 |
| D2 | `POST /?addSubs` | Same, plus `txn_type: add_subscription` | empty 200 |
| D3 | `POST /?addSub` | Same | empty 200 |
| D4 | `POST /api/v1/add-subscription` | Docs example, `is_validate_card: 1` | empty 200 |
| R0 | `POST /?addSub` | Shipped Dexa request: vault `131851`/`125536`, start `2026-10-01` | empty 200 |
| R1 | `POST /?addSub` | R0 with `is_validate_card: 1` | empty 200 |
| R3 | `POST /?addSub` | R0 with Uptown's vault `130618`/`124285` | empty 200 |
| R4 | `POST /?addSub` | R0 with `surchargeIndicator: 0` | empty 200 |
| R5 | `POST /?addSub` | R0 starting today | empty 200 |
| R6 | `POST /?addSub` | R0 with `failure_notification: 0` | empty 200 |
| R7 | `POST /?addSub` | Required fields only | empty 200 |
| R8 | `POST /?addSub` | Raw test card `4012000098765439` | empty 200 |
| V1-B | `POST /api/v1/add-subscription` | Vault as `vault_id`/`payment_id` | empty 200 |

### Invalid requests (proper JSON, so the endpoint and credentials work)

| Request | Result |
|---|---|
| Wrong EPI | `400 D27 INVALID EPI ID` |
| `failure_notification: 1` with no email or phone | `400 SUB21` |
| `subscription_starts_from: 20261001` | `400 SUB07 USE YYYY-MM-DD FORMAT` |
| Legacy endpoint, `CustomerProfileID` without `PaymentProfileID` | `400 A44 INVALID PAYMENT INFO` |
| V1 endpoint, legacy keys `CustomerProfileID`/`PaymentProfileID` | `400 A44 INVALID PAYMENT INFO` |

### Nothing was created

`GET /?viewSubs` (`txn_type: listsubscription`) on the EPI after the runs shows only the two
subscriptions that existed before: `55000` (Uptown, active, 2 payments) and `54763` (inactive QA
row from 2026-09-02). No empty-200 call left a schedule behind.

### It used to work

| Date | Call | Result |
|---|---|---|
| 2026-09-07 | Add, raw card | `S00`, created `55000` |
| 2026-09-10 | Update `55000`, vault | `S00 SUBSRIPTION_EDITED` |
| 2026-09-12 | Add, vault, EPI `2319993369` | not approved, body not captured |
| 2026-09-14 | Add, vault, EPI `2412333540` | empty 200 |
| 2026-09-29 | Add, any valid request | empty 200 |

So Add Subscription last succeeded on 2026-09-07 and has failed on every attempt since
2026-09-12, across two EPIs.

## What this rules out

- **Dexa request shape.** Valor's own example fails identically.
- **Vault vs card.** Both fail.
- **Legacy vs V1 endpoint, `/?addSub` vs `/?addSubs`.** All fail.
- **EPI not enabled for recurring.** The same EPI created `55000`, still lists it, and has charged
  it twice.
- **Downtown Hamra's data.** Uptown's known-good vault fails the same way.

## Corrections to Valor's docs (confirmed live)

- `subscription_starts_from` must be `YYYY-MM-DD`. The reference says `YYYYMMDD`, which the API
  rejects with `SUB07`. Dexa already sends the accepted format.
- The legacy endpoint takes vault keys `CustomerProfileID`/`PaymentProfileID`; the V1 endpoint
  takes `vault_id`/`payment_id`. They are not interchangeable.
- `failure_notification: 1` requires an `email` or `phone`.

## Dexa-side fixes made while investigating

- `chargeSubscriptionInvoiceViaValor` now also sends `x-internal-secret`. The 2026-09-29 Downtown
  Hamra failure (`SUB-202611-0002`, "Unauthorized", 0 attempts) never reached Valor: the app sent
  the legacy service-role JWT and the function compares against the `sb_secret_` key.
- Both recurring builders now send `failure_notification: 0` when there is no email or phone,
  instead of failing with `SUB21`. Needs a `billing-charge-subscription` redeploy.
- The empty-200 error message no longer blames EPI provisioning.

## Message for Valor ISV support

> **Subject:** Sandbox Add Subscription returns HTTP 200 with an empty body (EPI 2412333540)
>
> On the sandbox, Add Subscription returns `HTTP 200`, `Content-Type: text/html`, and a
> zero-byte body for every request that passes validation. No subscription is created
> (confirmed with View Subscription).
>
> This reproduces with the example request from your own reference page, sent verbatim to
> `POST https://securelink-staging.valorpaytech.com/api/v1/add-subscription` on EPI
> `2412333540` with card `4012881888818888`. It also reproduces on the legacy `/?addSubs`
> endpoint, with a vault profile, and with `is_validate_card: 1`.
>
> Invalid requests return normal JSON errors (`D27`, `SUB21`, `SUB07`, `A44`), so the endpoint
> and credentials are fine. Add Subscription last succeeded for us on 2026-09-07 (it created
> subscription `55000`) and has failed since 2026-09-12.
>
> 1. Can you check the server-side error for these requests and tell us when Add Subscription
>    will work again on the sandbox?
> 2. Can you give us a sandbox EPI under our ISV account (DEXAPOS) with Recurring and Vault
>    enabled, so recurring webhooks are delivered to our endpoint? Subscription `55000` on the
>    public demo EPI shows 2 payments, but we received no `RECURRING BILLING` webhook for either.
> 3. For production EPI `2501496431` (DEXA POS AI): the Vault API returns "You do not have
>    permission to access vault." Please enable Vault (customer and payment profiles) and confirm
>    Recurring/Subscriptions is enabled on that EPI.
> 4. Your reference lists `subscription_starts_from` as `YYYYMMDD`, but the API only accepts
>    `YYYY-MM-DD`. Which is intended?

## Production finding: Vault is not enabled on the central merchant (2026-09-29)

First prod test, merchant Sakura Tea Test. Central credentials saved (EPI `2501496431`) and the
location's subscription rail provisioned on that EPI, both verified in the database. Adding a
card then failed with Valor's message:

> You do not have permission to access vault.

This is an account permission, not a credential or host problem. The production vault host
(`https://online.valorpaytech.com`) answers unrecognised keys with a different message,
`Not a valid APP ID or APP Key`. Getting the permission message means Valor accepted the keys
and refused the Vault feature for that merchant. No card was saved and nothing was charged.

**Ask for Valor / Mtech:** enable Vault (customer and payment profiles) for merchant DEXA POS AI,
EPI `2501496431`, and confirm Recurring/Subscriptions is enabled on the same EPI. No code change
or credential re-entry is needed afterward unless the keys are regenerated.

## What can and cannot be verified on staging until Valor responds

| Step | Verifiable now |
|---|---|
| App to edge function auth | Yes |
| Card vaulting under the central EPI | Yes |
| Request validation (all fields accepted) | Yes |
| Update of an existing subscription | Yes (`55000`) |
| Webhook receiver, signed synthetic event | Yes |
| **Creating a new subscription** | **No** |
| Real recurring webhook delivery | No (public demo EPI is not ours) |

## Reproduce

Scripts are throwaway and live outside the repo. Each call is a single JSON `POST` with
`appid`, `appkey`, `epi` in the body. To re-test after Valor responds, send the docs example to
`/api/v1/add-subscription`; a fix returns `{"error_no":"S00", "subscription_id": …}`. Delete the
result with `DELETE /api/v1/delete-subscription`.
