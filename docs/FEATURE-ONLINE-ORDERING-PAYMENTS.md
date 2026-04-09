# Feature: Online Ordering + Payments

## Feature

- Name: Online Ordering + Payments
- Owner: Checkout/Storefront + Supabase Functions
- Status: `demo_mode`

## Goal

- Keep checkout demo flow realistic:
  - tokenization on checkout page
  - order created successfully
  - payment metadata visible in admin/HQ
  - cancellation behavior correct (`void` vs `cancelled`)

## Active Mode

- `demo`
- Live processor sale is intentionally bypassed right now.

## Current Behavior

- Embedded FTD bootstrap works through:
  - `supabase/functions/process-online-payment/index.ts`
- Checkout can tokenize on-page.
- `create-online-order` currently runs demo/fake-success payment path.
- Checkout card validation now blocks empty/incomplete card submits with a clear error.
- Card orders should save display metadata:
  - `payment_method`
  - `card_type`
  - `card_last_four`
- Cancellation path:
  - card/demo-card pending order -> `void`
  - cash pending order -> `cancelled`
- Store disabled checks:
  - middleware detects inactive store for subdomain/custom domain and rewrites to disabled page
  - `/sites/[slug]` routes render disabled state when store is off
- Domain whitelist trigger:
  - re-runs on TPN change or slug/domain change

## Known Bugs

- none currently tracked in this feature doc

## Decisions

- Date: 2026-04-09
- Decision: keep sale in demo mode (no live capture) until sandbox sale host issue is resolved.
- Reason: live sale attempts returned host-side failure (`91 HOST NO RESPONSE`), blocking demo reliability.

## Files Touched

- `supabase/functions/process-online-payment/index.ts`
- `supabase/functions/create-online-order/index.ts`
- `supabase/functions/create-online-order/ipospays.ts`
- `supabase/functions/cancel-online-order/index.ts`
- `app/sites/components/checkout/CheckoutPage.tsx`
- `app/sites/components/checkout/PaymentCardForm.tsx`
- `middleware.ts`
- `app/sites/components/StoreDisabledView.tsx`
- `app/sites/[slug]/disabled/page.tsx`
- `app/sites/[slug]/page.tsx`
- `app/sites/[slug]/checkout/page.tsx`
- `app/sites/[slug]/info/page.tsx`
- `app/sites/[slug]/order/[orderId]/page.tsx`
- `app/dashboard/online-ordering/actions.ts`
- `app/sites/order-actions.ts`
- `app/sites/recovery-actions.ts`
- `app/sites/components/OrderTrackingPage.tsx`

## Deploy Notes

- Functions to deploy for this feature:
  - `process-online-payment`
  - `create-online-order`
  - `cancel-online-order`
- Required secrets:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DEJAVOO_FTD_ECOM_KEY`
  - Dejavoo/iPOS keys for live paths (kept configured, but live sale currently bypassed)

## Validation Steps

1. Place demo card order:
   - order succeeds
   - payment shows card + last 4 in UI
2. Auto-cancel pending demo card order:
   - status becomes `void`
3. Cancel pending cash order:
   - status becomes `cancelled`
4. Verify cancellation email sends for cancelled/voided order flow

## References

- `docs/SPRINT-2026-04-08-ONLINE-ORDERING-PAYMENTS-HANDOFF.md`
- `docs/FEATURE-ONLINE-ORDERING-DEJAVOO-DEVICE-MODEL.md`
- `docs/REFERENCE-EMERGENCY.md`

## Last Updated

- 2026-04-09
