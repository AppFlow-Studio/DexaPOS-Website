# DEFECT/GAP: QR/online refund — partial refund missing; admin refund is status-only

**Area:** Payments / refunds for online + QR dine-in orders
**Severity:** Medium-High — acceptance criterion "partial + full refund via apply_refund_to_payment_v3" is only partially satisfiable
**Found:** 2026-07-16, QR dine-in refund testing on staging (`dfwqakoyittmrwbqvxgw`)
**Status:** Root-caused. Full-refund-via-cancel WORKS; partial + admin-initiated real refund are gaps.

## The three refund paths and what each actually does

1. **Guest cancel → real refund/void (WORKS).**
   - `app/sites/components/OrderTrackingPage.tsx:286` → `cancelOnlineOrder` (`app/sites/order-actions.ts:480`) → edge `cancel-online-order`.
   - Edge fn calls the REAL NMI gateway reversal (refund if settled / void if not, `cancel-online-order/index.ts:198-200`) THEN persists via `apply_refund_to_payment` RPC with reversal_type refund|void, auth/RRN/reference (`:232-242`).
   - This is a genuine, correctly-wired refund. **BUT full-amount only** — refunds `payment.total_amount` (`:199`); no partial.

2. **HQ admin "Refund" button → STATUS-ONLY (does NOT refund money).**
   - `refundAdminOrder` (`app/manage/actions/admin-merchant/transactions.ts:639`), reached via ReceiptModal Refund button (`components/dashboard/orders/ReceiptModal.tsx:694-703`, gated on `showAdminActions` + `hq.merchant.update`).
   - It ONLY flips `orders.status/payment_status = 'refunded'` and marks `order_payments` refunded. Does NOT call `apply_refund_to_payment_v3/v4` and does NOT hit the NMI gateway (`refundNmiSale`/`voidNmiSale` in `lib/payments/nmi.ts` are NEVER called anywhere). No money returns to the card. Misleading — looks like a refund, isn't one.

3. **Partial refund → NO path at all.**
   - `apply_refund_to_payment_v4` supports `partial_refund` and a `p_refund_amount`, but NO UI or server code calls it with a partial amount for online/QR orders (grep: only type defs + the cancel flow's full-amount call reference the RPC family).

## Impact on acceptance criterion

> Payment safety proven: … partial + full refund of a paid `qr_dine_in` order via `apply_refund_to_payment_v3`

- **Full refund:** satisfiable via guest cancel (real gateway + RPC) — though it uses `apply_refund_to_payment` (base), and the criterion names v3; v3/v4 are the current forks. TESTABLE.
- **Partial refund:** NOT satisfiable — no implementation. GAP.
- **Admin-initiated real refund:** NOT satisfiable — the only admin button is status-only. GAP.

## Recommended fixes (out of QR-testing scope; separate work)

- Wire a real refund action (merchant and/or HQ) that calls `apply_refund_to_payment_v4` + `refundNmiSale`/`voidNmiSale`, with an amount field for partial refunds.
- Fix or clearly re-label `refundAdminOrder` so a status-only change isn't presented as a money refund.

## Cannot drive from shell
`apply_refund_to_payment_v4` is auth-gated (`user_merchant_id()`/`user_location_ids()` — bare service-role = "Payment not found or access denied"). Real refund test needs an authenticated session (guest cancel on the tracking page, or a future admin UI).
