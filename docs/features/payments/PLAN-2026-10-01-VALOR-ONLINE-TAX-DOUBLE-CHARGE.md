# Plan: online orders charge exactly what the customer saw

Two fixes: Valor charging tax twice, and the storefront showing a different item price from
the one the server charges.

**Status:** Both implemented (uncommitted). `create-online-order` deployed to staging and
sandbox-verified on 2026-10-01. Prod not deployed.
**Date:** 2026-10-01
**Rollout:** No migration. Ship the edge function and the web app together, because the
storefront now sends the menu and category with each cart line. Either order is safe: the
server still prices lines without that context the old way. Staging first, then prod.

## Problem

A customer at 460 Bread & Butter paid **$16.22** for an order the site totaled at **$15.16**
(`ORD-20260930-0001`).

| | Site | Valor receipt |
|---|---|---|
| Subtotal | 11.95 | |
| Tax (8.88%) | 1.06 | |
| Tip | 2.15 | |
| Amount | | 15.16 |
| State Tax | | 1.06 |
| **Total charged** | **15.16** | **16.22** |

Valor added the tax a second time on top of a total that already included it. Nobody configured
tax on the Valor side. We sent it.

## Cause (verified)

`supabase/functions/create-online-order/index.ts:1286` calls `valorCreateSale` with:

- `amountMinor: totalCents`: the grand total (subtotal + tax + tip + delivery + fee), **and**
- `taxMinor: taxCents`

`supabase/functions/_shared/valor.ts:363` sends `taxMinor` to Valor as `tax_amount`. Valor adds
`tax_amount` on top of `amount`.

**Evidence:**

- Valor's Direct Sale Token API docs (valorapi.readme.io/reference/direct-sale-token-api) define
  `tax_amount` as "Tax amount to be applied to the transaction". The docs example shows add-on
  fields summing into `netamt`. The docs never say explicitly that tax is additive. The prod data
  below proves that it is.
- On prod, Valor's own sale response (`order_payments.processor_response`) shows
  `netamt = amount + tax` for every Valor online order that had tax:

| Order | We charged (`amount`) | Tax | Valor `netamt` | Overcharge |
|---|---|---|---|---|
| ORD-20260928-0001 | 17.35 | 1.41 | 18.76 | 1.41 |
| ORD-20260929-0001 | 28.20 | 2.30 | 30.50 | 2.30 |
| ORD-20260930-0001 | 15.16 | 1.06 | 16.22 | 1.06 |
| **Total** | | | | **4.77** |

**Not affected:**

- POS tablet card-present payments. The tablet doesn't send tax to Valor.
- The four $0.01 test orders, which had $0.00 tax.
- The NMI path.
- Every other merchant. 460 B&B is the only merchant using Valor online checkout on prod.

`lib/payments/valor/saleApi.ts` has the same `tax_amount` field. No caller passes tax to it
today.

## Fix

Stop sending `tax_amount`. `amount` stays the grand total. That total is already exactly what
the customer agreed to pay.

**Why not send `amount = total − tax` with `tax_amount = tax`?** The settlement matcher
(`record_valor_online_batch_webhook`) compares `order_payments.amount` with Valor's batch
`purchase_amount`. Valor's batch webhook reports `purchase_amount` as the `amount` we send
(1516 for the order above). It reports tax separately in `state_tax_amount` (106). If `amount`
stays the grand total, settlement matching needs no change. Splitting tax out would break the
match unless we also rewrote the matcher.

The tradeoff: Valor's receipt won't show a separate tax line, and Valor won't get Level 2 tax
data. Level 2 data rarely matters for consumer cards at a restaurant.

### Changes

- [x] `supabase/functions/_shared/valor.ts`: remove `taxMinor` from `ValorSaleParams` and
  `tax_amount` from `ValorSaleRequestBody` and `buildSaleRequestBody`. Add a short comment that
  Valor adds `tax_amount` on top of `amount`.
- [x] `lib/payments/valor/saleApi.ts`: same removal. This is the Node source of truth, and the
  parity test pins the two copies together. Removing the param, rather than just not passing it,
  stops anyone from wiring tax back in.
- [x] `supabase/functions/create-online-order/index.ts`: drop `taxMinor` from the call and fix
  the comment at line 1284.
- [x] Guard: after an approved Valor sale in `create-online-order`, if `netamt` in the response
  (converted to cents) differs from `totalCents`, call `logError('PAYMENT_AMOUNT_MISMATCH', …)`
  with both values. Log only, no automatic void. Any future drift then shows up in the edge
  logs instead of on a customer's card.
- [x] Tests:
  - `lib/payments/__tests__/valor-sale.test.ts`: replace "includes tax but leaves tip inside
    the grand total" with a test that the body never contains `tax_amount`.
  - `lib/payments/__tests__/valor-storefront-deno-parity.test.ts`: drop `taxMinor` from the
    first case.

### Remediation for the 3 overcharged customers

- [ ] Refund only the excess ($1.41, $2.30, $1.06) as **partial refunds in the Valor merchant
  portal**, against each original transaction (`order_payments.transaction_id`). The batches
  are already closed, so these are refunds, not voids.
- **Don't** use the dashboard Refund dialog for this. It would record a local refund against a
  payment that our books already show at the correct amount, and the order would then look
  partially refunded.
- [ ] After the first refund, check how the batch webhook that carries `refund_amount` is
  handled by the settlement matcher.

## Related finding (separate fix, not in this change)

`process_online_order` inserts `order_payments.total_amount = p_total + p_gratuity`. The
storefront's `p_total` already includes the tip, so the tip is counted twice:
`ORD-20260930-0001` has `total_amount` 17.31 against a real total of 15.16.
`app/dashboard/actions/refund-online-order.ts:128` uses `total_amount` as the refund cap, so a
"full refund" would request 17.31 and Valor would reject it because it exceeds the sale.

The OrderOut webhook also calls this RPC, with `order.total`. Before changing the RPC, confirm
whether OrderOut's total includes gratuity. Track this as its own fix.

## Fix 2: storefront showed one item price, server charged another

### Problem

Found during the staging E2E. The storefront showed the Americano at **$5.25**, its Espresso
Bar category price. `create-online-order` charged **$7.25**, the location price. The customer
saw $6.67 on the Pay button and on the confirmation page, but was charged $8.84
(`ORD-20261001-0001`, Joes Coffee Uptown, staging).

### Cause (verified)

1. The cart never sent `menu_id` or `category_id`. They appeared nowhere in `useCart.ts`,
   `CheckoutPage.tsx` or `StorefrontItem`. So Step 6 always called `get_effective_price`
   without context, which falls back to L2 > L1.
2. Even with context, the two pricing functions disagree. The storefront prices items with
   `get_menus_for_location` → `get_menu_with_categories`, which runs its own cascade. For
   example, a location-owned menu uses `category price → base price` and ignores the location
   item override. On staging Uptown, 48 of the 146 items shown online were charged differently
   from what was displayed. Passing context to `get_effective_price` still left 20 of them
   wrong.

Blast radius on prod: all 893 items 460 B&B shows online currently charge exactly what's
displayed, so no prod charge changes. Other merchants with category or menu prices would have
been hit.

### Change

The server now prices a cart line from **the same RPC the storefront displays**, for the menu
and category the item was added from.

- [x] `app/sites/lib/storefront-menu.ts`: new home of `mapRpcMenuToStorefront`, moved out of
  the `"use server"` `actions.ts`. It stamps every item with `menu_id` and `category_id`.
- [x] `types/storefront.ts` and `PlaceOrderItem`: optional `menu_id` / `category_id`.
  `CheckoutPage` sends them, `useCartSync` saves them, and `CartRecovery` restores them.
- [x] `supabase/functions/_shared/storefront-menu-pricing.ts`: a pure index of
  `menu|category|item` to price, cash price and delivery price, built from
  `get_menus_for_location` output. It skips menus hidden online and inactive menu categories,
  matching the storefront.
- [x] `create-online-order` Step 6: a line with context is priced from that index. If the line
  isn't on the live online menu, or its cart price no longer matches the menu, the server
  returns **409 `cart_item_changed`** before any charge: "X has changed on the menu since you
  added it. Please remove it from your cart and add it again." This also stops a tampered cart
  from naming a cheaper hidden menu. If the menu RPC fails, the server returns 503
  `pricing_unavailable` and charges nothing. Lines without context (reorders, carts saved
  before this change) keep the old `get_effective_price` price.
- [x] `app/sites/lib/__tests__/storefront-menu-pricing-parity.test.ts`: the display mapping and
  the server index must agree on every price. It also checks that inactive categories, hidden
  menus and malformed payloads are not chargeable.

### Verified on staging (2026-10-01)

- Direct requests to the deployed function:

  | Request | Result |
  |---|---|
  | Honest line (Happy Hour / Espresso Bar at $5.25) | Priced OK, then stops at `payment_token_required` |
  | Same line at a stale $4.00 | `cart_item_changed` |
  | Menu hidden online (Morning Rush) | `cart_item_changed` |
  | Made-up category at $1.00 | `cart_item_changed` |

  None of these created an order or a charge.
- Browser sandbox checkout `ORD-20261001-0002`: the screen showed $6.67, the server stored
  subtotal $5.25 + tax $0.47 + tip $0.95, and Valor charged `netamt` **6.67**.

### Known limits (unchanged behavior)

- **Reorders** (`OrdersPanel`) have no menu context, so they still use `get_effective_price`.
  They also display the old order's price, which can differ from today's menu.
- **Modifier prices** are still trusted from the client (Step 6 comment). That's a separate
  hardening item; the same menu index could validate them.
- **Order-line category:** `order_items.category_name` is chosen by `process_online_order`,
  not from the cart's category. Staging recorded the Americano under "Downtown Appetizers".
  This affects category sales reports only, not charges.

## Verification

1. `npm run test -- lib/payments`: the sale and parity tests pass.
2. Deploy `create-online-order` to staging. Place a sandbox order with tax and a tip. Confirm
   `processor_response->>'netamt'` equals the order total, and the Valor receipt total matches
   the site total.
   **Done 2026-10-01:** `ORD-20261001-0001` (Joes Coffee Uptown, Valor public sandbox EPI,
   Visa test card) was approved. Valor received `amount` 8.84 with no tax field and charged
   `netamt` 8.84. Before the fix, staging showed `netamt = amount + tax` (for example,
   32.66 + 2.66 = 35.32). The $8.84 vs $6.67 gap on this order was the item-pricing bug,
   fixed in Fix 2 and re-verified with `ORD-20261001-0002`.
3. Promote to prod by deploying `create-online-order` and the web app (Fix 2 needs both).
   `create-online-order` is the only function that imports
   `createSale` from `_shared/valor.ts`. The other importers use the client-token, recurring,
   cancel and webhook helpers, so they don't need a redeploy.
4. On the next real prod order, run:
   `select amount, processor_response->>'netamt' from order_payments where processor_name = 'valor' and metadata->>'source' = 'online_order' order by approved_at desc limit 1`
   The two values must match.
