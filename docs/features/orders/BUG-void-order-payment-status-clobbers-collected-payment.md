# BUG — `void_order` clobbers payment dimension on paid-then-voided orders

**Type:** Bug (backend / data correctness)
**Surface:** POS void flow → order-level `payment_status` + `amount_paid` rollup; visible on Web Dashboard → Order Details drawer & full page.
**Severity:** Medium — produces incorrect/misleading payment state on any order that was paid and later voided. Distorts the payment dimension and can mislead reconciliation.
**Found via:** Order `#S1-0002` (Uptown Branch) — Cash $27.06, "1 payment recorded", yet `payment_status = void`.
**Owner:** Backend / POS RPC owners.
**Related (do not conflate):** The cosmetic header-badge labeling fix (`Order: Void` / `Payment: Void`) is a *separate, shipped* change. It did not cause this bug — it **revealed** it by making the two status dimensions individually legible.

---

## Decision (product)

For a **paid-then-voided** order, the order-level `payment_status` should become **`refunded`** — voiding the order is treated as returning the money to the customer.

> Note: this differs from what the RPC's own "Refund $X?" return value (`refund_amount`) implies (a separate, manual refund step). The product decision is that **void = money back**, so the rollup should reflect `refunded`, not a deferred `paid`. Implementer should reconcile the RPC's prompt/return contract with this (see Open questions).

---

## Symptom

`#S1-0002` Order Details header reads `ORDER DETAILS · Order: Void · Payment: Void`, while the body shows:
- ORDER TOTAL **$27.06**, "**1 payment recorded**", method **Cash**, payment captured.

So a clearly-paid order reports `payment_status = void` and (in the rollup) `amount_paid = 0`. The payment dimension contradicts the recorded payment.

## Root cause

`public.void_order(p_order_id, p_void_reason)` — defined in
`supabase/migrations/20260413223430_remote_schema.sql` (lines ~9907–10028), this is the **live POS void path**.

Step 5 of the RPC unconditionally clobbers the order rollup (lines ~9978–9988):

```sql
UPDATE public.orders
SET
  status         = 'void',
  amount_paid    = 0,        -- ← discards the real collected amount
  payment_status = 'void',   -- ← forces payment dimension to void regardless of collection
  ...
WHERE id = p_order_id;
```

The RPC **already computes** that money was collected (lines ~9959–9963 → `v_refund_amount`, returned to the POS so it can prompt "Refund $X?"), then discards that knowledge in the persisted rollup. The underlying `order_payments` rows are *preserved* (only flagged `is_voided = true`), which is why the drawer can still show "1 payment recorded / $27.06". Only the order-level summary lies.

## Secondary defect found during investigation

Web action `VoidOrder` in `app/dashboard/actions/order.ts` (lines ~482–492) writes:

```ts
payment_status: "unpaid",
```

`"unpaid"` is **not a member** of the live `payment_status` enum
(`pending | processing | authorized | captured | failed | declined | refunded | partially_refunded | void | paid | partial` — confirmed in `database.types.ts` ~16931–16942). This path is either dead or silently failing the enum constraint. The two void paths (POS RPC vs. web action) disagree about the resulting payment_status and should be reconciled. (The POS RPC is the one that actually ran on `#S1-0002`.)

## Proposed fix

New migration replacing `void_order` step 5 so the rollup reflects reality:

1. **Stop zeroing `amount_paid`.** Keep the real collected amount. Sales/void reporting already excludes voided money via `is_voided` filters on items/payments (per the RPC's own comment: "Void the payment records so they don't count towards daily sales"). Verify this before changing (see Open questions #2).
2. **Derive `payment_status` instead of hardcoding `'void'`** — per the product decision, a void that returned collected money → **`refunded`**; a void with nothing collected → `pending`. There is in-repo precedent for "derive, don't force" payment_status in `supabase/migrations/20260501000005_lane_g_void_payment_status_recompute.sql` (lines ~92–102, the `void_payment` G2 recompute).
3. **Reconcile the web `VoidOrder` action** to write a valid enum value consistent with the RPC (drop `"unpaid"`).
4. **Backfill** existing paid-then-voided orders currently stuck at `payment_status='void'` / `amount_paid=0` to the corrected state (one-off data migration; scope by `status='void' AND EXISTS captured non-... payment`).

## Open questions for implementer

1. **Refund modeling.** Product says void = money back ⇒ `refunded`. But should voiding also create an actual refund/reversal record (`apply_refund_to_payment` with `reversal_type='void'`/`'refund'`) so the money-returned event is auditable, or is flipping the rollup `payment_status` to `refunded` sufficient? The RPC currently only *returns* `refund_amount` and leaves the refund to a separate POS step — that contract needs reconciling with "void = refunded".
2. **Reporting dependence on `amount_paid=0`.** Confirm no daily-sales / KPI / reconciliation query relies on voided orders having `amount_paid = 0` before that zeroing is removed. (RPC comment claims `is_voided` filtering is the mechanism — verify in the report queries.)
3. **Payment-row vs order-level `void`.** At the `order_payments` row level, `status='void'` is a legitimate pre-settlement reversal (distinct from `refunded`). The fix is strictly about the **order-level** rollup; leave row-level void semantics intact.

## Acceptance criteria

- [ ] Voiding an order that had collected payment results in order-level `payment_status = refunded` (not `void`) and a truthful `amount_paid`.
- [ ] Voiding an order with **no** collected payment results in `payment_status = pending` (genuinely unpaid void), not `void`.
- [ ] Daily sales / void reports unchanged (voided money still excluded from sales).
- [ ] Web `VoidOrder` action and POS `void_order` RPC agree on the resulting `payment_status`; no invalid enum value written.
- [ ] Backfill corrects existing affected orders (e.g. `#S1-0002`).
- [ ] Verified on the Order Details drawer: `#S1-0002`-style order reads `Order: Void · Payment: Refunded`.

## Evidence

- Order `#S1-0002`, Uptown Branch — see attached screenshots (header pills + table row + payment card).
- `void_order` RPC: `supabase/migrations/20260413223430_remote_schema.sql:9907-10028` (clobber at 9978-9988).
- Web action: `app/dashboard/actions/order.ts:458-520` (invalid `"unpaid"` at 486).
- Enum: `database.types.ts:16931-16942`.
- Precedent for derive-don't-force: `supabase/migrations/20260501000005_lane_g_void_payment_status_recompute.sql:92-102`.
