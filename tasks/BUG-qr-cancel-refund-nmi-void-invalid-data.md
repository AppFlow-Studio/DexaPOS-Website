# BUG: QR/online order cancel → NMI void/refund fails ("The provided data is invalid")

**Area:** Payments / `cancel-online-order` edge function → NMI v5 void/refund
**Severity:** HIGH — guests cannot cancel a paid order; the 1-minute no-response auto-cancel also fails; money is never reversed. A paid order gets stuck `pending` with no recovery.
**Found:** 2026-07-16, QR dine-in refund test on staging (`dfwqakoyittmrwbqvxgw`)
**Status:** Reproduced from the guest UI AND directly against the edge function. Real bug.

## Symptom

Guest taps **Cancel** on the order-tracking page (auto_accept turned off so the order is `pending` and cancellable). UI shows **"The provided data is invalid."** and the order stays `pending`. The tracking page's **1-minute no-response auto-cancel** (OrderTrackingPage.tsx:196, trigger "timeout") ALSO does nothing — same code path, same failure.

## Reproduction (edge function, exact guest payload)

```
POST /functions/v1/cancel-online-order
{ order_id, session_token, reason:"testing refund", cancelled_by:"customer" }
→ { "success": false, "error": "The provided data is invalid." }
```
Order ORD-20260716-0012 (id b3a54cf4-…): status `pending`, payment `captured`, is_settled `false`, transaction_id `12309791933`, NMI status `pendingsettlement` (v5 rest_api sale, response_code 100).

## Root cause (traced)

`cancel-online-order/index.ts:198-210`: unsettled payment → takes the **voidSale** branch (`_shared/nmi.ts:183`), which POSTs `/api/v5/payments/{txn}/void` with body `{ void_reason: <reason> }` (`nmi.ts:192`). NMI returns **E_INVALID_SUBMISSION → "The provided data is invalid."**, surfaced verbatim at `index.ts:212-222`.

"The provided data is invalid." is a known NMI response (matched in `_shared/nmi.ts:316,383` and `lib/payments/nmi.ts:226/371/438`) meaning the **submission body/format is rejected** — NOT an auth error (auth succeeds; we get a transaction-level error). Prime suspect: the v5 void endpoint does not accept the `{ void_reason }` body as sent (wrong field/format for this gateway/account), so the void is malformed. Refund path (`refundSale`, settled orders) sends `{ amount }` and may hit the same class of issue — untested (this order was unsettled).

## Impact
- No paid online/QR order can be cancelled or auto-cancelled.
- Combined with `tasks/BUG-qr-refund-partial-missing-admin-refund-statusonly.md` (admin refund is status-only, no partial UI), there is currently **NO working real-money refund/void path for online orders at all**.
- A paid order that hits the cancel path gets stuck `pending`; ORD-20260716-0012 ($9.52 paid) is currently stuck this way on staging — needs manual handling.

## Suggested fix
- Verify the exact NMI v5 void/refund request contract for this account (field names, whether `void_reason` is allowed, required headers). Fix `voidSale`/`refundSale` body in `supabase/functions/_shared/nmi.ts`.
- Add a test: cancel an unsettled (void) AND a settled (refund) online order; assert NMI approves and `apply_refund_to_payment` records it.
- Don't surface raw NMI "provided data is invalid" to guests — map to a friendly message + alert ops (a failed void = stuck paid order).

## Environment note
Could not fully reproduce the raw NMI void via curl from this env (raw `Authorization: <key>` → E_AUTHENTICATION_MISSING; likely IP-whitelist / base-URL difference — the edge fn's Deno egress authenticates, local curl does not). The edge-function error IS the authoritative signal. Test the void fix from the deployed edge fn, not local curl.
