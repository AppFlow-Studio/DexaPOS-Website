# BUG: online orders store `total_amount` tip-INCLUSIVE; rest of system is tip-EXCLUSIVE

**Area:** Payments / online orders (`process_online_order`) — shared, affects ALL online orders (website/QR/OrderOut/delivery), not just QR
**Severity:** High — customer-facing wrong totals on receipts; latent analytics/refund risk
**Found:** 2026-07-15, QR dine-in E2E test (order ORD-20260715-0004, staging `dfwqakoyittmrwbqvxgw`)
**Status:** Root-caused, NOT fixed — the correct fix is a semantic decision touching financial columns; needs owner sign-off before changing.

## Symptom

A single QR order showed THREE different totals:
- Checkout UI: ~$9.52 (pre-tip figure the guest saw before/around tip entry)
- Payment-confirmation email (inline template): **$10.60** ✓ correct
- Order/tracking receipt email (receipt template): **$11.95** ✗ wrong (tip counted twice)

Real order math: subtotal 8.50 + tax 0.75 + tip 1.35 = **10.60** charged (NMI processor amount = 10.60).

## Root cause — a `total_amount` semantics mismatch

`orders.total_amount` means different things depending on who wrote the row:

| Writer | `total_amount` | Evidence |
|---|---|---|
| POS (dine_in/takeout) | **tip-EXCLUSIVE** | ORD-20260714-0002: 26.66+2.37=29.03, total 32.31 = +3.28 tip |
| `process_online_order` | **tip-INCLUSIVE** | line 229/231-233: `total_amount = p_total`, and `p_total := subtotal+tax+gratuity` (line 186) |

Two receipt consumers make OPPOSITE assumptions:
- **Inline placed-email** (`loadOrderContext`, order-notifications.ts:164): treats `orders.total_amount` AS the final total → correct **only because** online is tip-inclusive → 10.60 ✓
- **Receipt template** (`receipt-template.ts:279-280` → `getOrderBreakdown` `lane.total + tip`): assumes `total_amount` is tip-EXCLUSIVE and adds tip → 11.95 ✗ for online, ✓ for POS.

`getOrderBreakdown` (`order-breakdown.ts:114-117`) resolves `lane.total = pick(card_total, total_amount)`; for online, `card_total`/`effective_total` are ALSO set to `p_total` (tip-inclusive), so no lane escapes the mismatch.

There is ALSO a secondary tip double-count in `order_payments`: `process_online_order` inserts `amount=p_total, total_amount=p_total+gratuity` (line 513) → order_payments.total_amount = 11.95 while amount = 10.60. `order_payments.amount` (charged) is correct.

## Correct fix (needs sign-off — do NOT ship blind)

Make `process_online_order` match POS convention: store `total_amount / card_total / cash_total / effective_total` **tip-EXCLUSIVE** (= subtotal + tax − discount + surcharge, NO gratuity). Keep `tip_amount` separate. Then:
- receipt template `lane.total + tip` foots correctly (11.95 → 10.60)
- BUT the inline placed-email (which shows `total_amount` as the final total) would then show the PRE-tip total → that consumer must ALSO be updated to add tip.
- `order_payments.amount` stays `p_total` (charged, tip-incl) — correct. Fix `order_payments.total_amount` to = amount (drop the `+ gratuity`).

**Blast radius to check before shipping:** `app/dashboard/actions/order-analytics.ts`, `app/dashboard/reports/cash-management/page.tsx`, refund RPCs (`apply_refund_to_payment_v4`), and any revenue rollups that sum `orders.total_amount` for online orders — flipping tip-inclusive→exclusive shifts those numbers by the tip.

**Cannot apply from here:** no direct DB connection / psql / MCP-apply access in this environment. Migration must be applied by someone with DB access.

## CONFIRMED on multiple real orders (2026-07-16)

| order | subtotal | tax | tip | orders.total_amount | order_payments.total_amount (shown in receipt email) |
|---|---|---|---|---|---|
| ORD-20260716-0003 | 15.00 | 1.33 | 2.70 | 19.03 ✓ | **21.73** ✗ (= 19.03 + tip 2.70 again) |
| ORD-20260716-0001 | 8.50 | 0.75 | 1.35 | 10.60 ✓ | 11.95 ✗ |

Receipt/order-confirmation email shows the inflated figure; payment-confirmation email (reads orders.total_amount) shows the correct one.

## Why this can't be patched in the receipt template (verified)

Tried `chargedTotal = amountPaid > 0 ? amountPaid : lane.total + tip` — REVERTED. Real paid POS orders prove `amount_paid` is tip-EXCLUSIVE for POS but tip-INCLUSIVE for online:
- POS ORD-20260711-S10-0007: sub 999 + tax 88.66 = total_amount 1087.66 = amount_paid 1087.66, tip 217.53 SEPARATE (tip-exclusive).
- online ORD-20260716-0003: total_amount 19.03 = amount_paid 19.03 INCLUDES tip 2.70 (tip-inclusive).

So no template-layer signal (`amountPaid`, `order_type`) cleanly separates them without risk to POS receipts. The ONLY correct fix is at the source: make `process_online_order` store `total_amount` (and card_total/cash_total/effective_total, and order_payments.total_amount) tip-EXCLUSIVE to match POS. Requires the migration below + updating the inline placed-email consumer. DB-access + sign-off required; cannot apply from this env.

## Fixed in this pass (safe, app-layer)
- Receipt email now renders the **Table number** (`receipt-template.ts`, order-meta block) when `order.table_number` is present — was omitted entirely, so QR receipts had no table. Renders nothing for non-QR orders.

## Related
- Tracking link "missing" in email = `NEXT_PUBLIC_APP_URL=http://localhost:3000` in the test env → email link points at localhost (untappable from a phone). Env/config, not code; prod has a real URL. For LAN testing set it to the LAN IP.
- Notification opt-out toggle not persisting — separate defect, see below / own ticket.
