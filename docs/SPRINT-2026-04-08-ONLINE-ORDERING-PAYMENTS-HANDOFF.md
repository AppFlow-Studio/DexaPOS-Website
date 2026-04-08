# Sprint Handoff: Online Ordering, Payments, and Bug Fixes

**Date:** 2026-04-08  
**Scope:** Summary of the fixes and implementation work completed across the recent admin/HQ/menu/storefront/payment tasks, including the current status of the Dejavoo online ordering integration.

## 1. Summary

This batch included four groups of work:

1. Merchant/HQ/super-admin parity fixes
2. Menu popup and pricing/modifier fixes
3. Storefront/build fixes
4. Online ordering and Dejavoo payment integration work

The main result is:

- admin/HQ parity issues were fixed
- popup/menu bugs were fixed
- storefront motion import/build issue was fixed
- embedded Dejavoo FTD tokenization was fixed
- live Dejavoo sale processing was tested and reached the processor, but sandbox sales are currently blocked by Dejavoo/iPOS with response code `91 / HOST NO RESPONSE`
- because of that, the sale path was intentionally reverted to the previous fake-success/test-mode behavior so checkout can continue working for flow testing

## 2. Completed Bug Fixes

### 2.1 Merchant/HQ/super-admin data and navigation fixes

Completed fixes:

- merchant customers list was using the wrong org identifier
- admin customers hook was implemented instead of returning an empty list
- super-admin staff RPC was corrected to use `admin_get_unified_staff_view`
- HQ/super-admin merchant sidebar now includes:
  - `Payments`
  - `Invoices`
  - `Tips`
- HQ online ordering tab was aligned more closely with the merchant flow

Main files involved:

- `app/dashboard/customers/hooks/useCustomers.ts`
- `lib/queries/use-admin-customers.ts`
- `app/manage/actions/admin-merchant/staff.ts`
- `app/manage/merchants/[merchantId]/page.tsx`
- `app/manage/merchants/[merchantId]/components/PaymentsTab.tsx`
- `app/manage/merchants/[merchantId]/components/InvoicesTab.tsx`
- `app/manage/merchants/[merchantId]/components/TipsTab.tsx`
- `app/manage/merchants/[merchantId]/components/OnlineStoreTab.tsx`

### 2.2 Menu popup fixes

Completed fixes:

- `PriceInputGroup` was added to the category quick-add item popup
- active create/edit item popup surfaces now use the shared price input group
- missing modifier groups in merchant edit-item popup flows were fixed by wiring the real `useModifierGroups(...)` data into the sheets

Main files involved:

- `components/dashboard/menu/categories/AddItemToCategoryWizard.tsx`
- `components/dashboard/menu/NewEditItemFormSheet.tsx`
- `components/dashboard/menu/ItemFormSheet.tsx`
- `components/dashboard/menu/QuickCreateItemDialog.tsx`
- `components/dashboard/menu/items/CreateItemWizard.tsx`
- `app/dashboard/menu/[menuId]/page.tsx`
- `app/dashboard/menu/categories/page.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx`

### 2.3 Storefront build fix

Completed fix:

- storefront components were importing `framer-motion`, but this repo uses `motion/react`
- imports were corrected so the storefront could build again

Main files involved:

- `app/sites/components/BranchStorySection.tsx`
- `app/sites/components/FloatingCartBar.tsx`
- `app/sites/components/MenuBrowser.tsx`
- `app/sites/components/MobileBottomTabs.tsx`
- `app/sites/components/OrdersPanel.tsx`
- `app/sites/components/StorefrontLayout.tsx`

## 3. Dejavoo Payment Integration

## 3.1 What was fixed

### Embedded FTD checkout bootstrap

The `process-online-payment` edge function was updated to return the Dejavoo `Ecom/TOP` merchant key instead of the old auth JWT flow.

Current behavior:

- validates `store_config_id`
- validates the store has `ipospays_tpn`
- returns `DEJAVOO_FTD_ECOM_KEY` as `security_key`

Main file:

- `supabase/functions/process-online-payment/index.ts`

This change unblocked the embedded card form and tokenization.

### Embedded tokenization

The Dejavoo Freedom to Design form is now able to tokenize on the checkout page.

Confirmed working during testing:

- `process-online-payment` returned `200`
- `paymentCardToken` returned `200`

Main files involved:

- `app/sites/components/checkout/PaymentCardForm.tsx`
- `app/sites/components/checkout/CheckoutPage.tsx`

### Checkout metadata capture

The checkout flow was updated so the frontend can send non-sensitive card display metadata with the order request:

- `payment_token_id`
- `payment_card_type`
- `payment_card_last_four`
- `pay_cash_in_store`

This was added so the admin/payment UI can still show card type and last 4 even in test/fake-success mode.

Main files involved:

- `app/sites/components/checkout/PaymentCardForm.tsx`
- `app/sites/components/checkout/CheckoutPage.tsx`

## 3.2 Current live-sale status

### What happened when real sale processing was enabled

The live sale path in `create-online-order` was restored and tested.

Observed results:

1. tokenization succeeded
2. sale request reached iPOS/Dejavoo
3. processor returned:
   - `response_code = 91`
   - `response_message = HOST NO RESPONSE`

This means:

- the problem is not the storefront UI
- the problem is not the embedded tokenization anymore
- the problem is not the domain whitelist anymore, assuming the same whitelisted origin is being used
- the problem is the Dejavoo/iPOS sandbox sale host/acquirer path

Relevant processor interpretation:

- `91 / HOST NO RESPONSE` indicates host/acquirer/issuer unavailability on the processor side

Because of that processor-side sandbox issue, the live sale path was intentionally backed out again.

## 3.3 Current code state for payment processing

### Current active mode

The current `create-online-order` flow is back in fake-success/test mode for sale processing.

Current behavior:

- FTD tokenization still happens on the checkout page
- order creation still works
- live processor sale is bypassed
- for card orders, the system writes payment metadata so UI still shows:
  - `payment_method = card`
  - `card_type`
  - `card_last_four`
- for cash pickup, the system writes cash/pending payment state

Main file:

- `supabase/functions/create-online-order/index.ts`

This means checkout can continue to be tested end-to-end without being blocked by the sandbox sale host failure.

### Current cancel/void behavior

A cancel path was added for online orders:

- pending online orders can be cancelled
- if there is a real processor `rrn`, the cancel path attempts a real Dejavoo `void`
- if there is no real `rrn` because the order was created in fake-success mode, the system falls back to an internal `void` status only
- cancellation email support was added

Main files involved:

- `supabase/functions/cancel-online-order/index.ts`
- `app/sites/order-actions.ts`
- `app/sites/components/OrderTrackingPage.tsx`
- `app/sites/recovery-actions.ts`

Important limitation:

- the current auto-cancel behavior still depends on the tracking-page countdown path
- it is not yet a background scheduled job

## 4. Payment Data and UI Visibility

The goal of the current changes was to make card orders appear correctly in admin/payments UI even while live sale processing is deferred.

Expected UI-visible fields for card orders:

- payment method: `card`
- card type: from frontend tokenization metadata
- last 4: from frontend tokenization metadata

Places to verify in UI:

- merchant payments:
  - `app/dashboard/payments/page.tsx`
  - `app/dashboard/payments/components/PaymentsTable.tsx`
- merchant order payment display:
  - `components/dashboard/orders/EnhancedPayments.tsx`
- HQ transactions:
  - `app/manage/transactions/page.tsx`
  - `app/manage/transactions/components/TransactionDetailSheet.tsx`

## 5. Email Status

Order confirmation email was already wired in the checkout recovery flow and was observed firing successfully during testing.

Main file:

- `app/sites/recovery-actions.ts`

Additional work added in this batch:

- order cancellation email support

Current status:

- confirmation email: working in tested flow
- cancellation email: implemented, should be verified in cancel flow
- SMS: not implemented in this batch

## 6. Reference Notes for Dejavoo

### Current integration assumptions

- embedded checkout uses Dejavoo Freedom to Design
- `process-online-payment` returns the `Ecom/TOP` merchant key
- domain whitelist for the preview/storefront origin is assumed to be configured
- each merchant/TPN may have its own key setup on the Dejavoo side

### Important deferred issue

Real sale processing is currently deferred because sandbox sale attempts returned:

- `91 / HOST NO RESPONSE`

This should be revisited later with the Dejavoo/iPOS sandbox team or internal owner of the merchant/TPN configuration.

## 7. Open / Deferred Items

### Deferred

- real Dejavoo sale capture in `create-online-order`
- real processor-backed refunds
- background job for auto-cancel/auto-void when no tracking page is open
- SMS notifications

### Kept intentionally

- embedded tokenization on the storefront checkout page
- fake-success order creation path for card orders while sandbox sale host issues are unresolved
- internal `void` fallback for fake card orders

## 8. Recommended Next Steps

1. Verify the current fake-success/test flow:
   - checkout completes
   - admin/HQ payments show `card` and the last 4
   - cancellation changes status to `void`
   - cancellation email sends

2. Revisit real Dejavoo sale processing later:
   - confirm sandbox/UAT TPN routing
   - confirm sale host/acquirer availability
   - retry the live sale path only after the `91 / HOST NO RESPONSE` issue is resolved

3. After real sale works:
   - enable real processor `void`
   - add real refund flow using original `RRN`

## 9. Main Files Touched in This Batch

- `supabase/functions/process-online-payment/index.ts`
- `supabase/functions/create-online-order/index.ts`
- `supabase/functions/create-online-order/ipospays.ts`
- `supabase/functions/cancel-online-order/index.ts`
- `app/sites/components/checkout/PaymentCardForm.tsx`
- `app/sites/components/checkout/CheckoutPage.tsx`
- `app/sites/order-actions.ts`
- `app/sites/recovery-actions.ts`
- `app/sites/components/OrderTrackingPage.tsx`
- `components/dashboard/menu/categories/AddItemToCategoryWizard.tsx`
- `app/dashboard/menu/[menuId]/page.tsx`
- `app/dashboard/menu/categories/page.tsx`
- `app/manage/merchants/[merchantId]/page.tsx`
- `app/manage/merchants/[merchantId]/components/PaymentsTab.tsx`
- `app/manage/merchants/[merchantId]/components/InvoicesTab.tsx`
- `app/manage/merchants/[merchantId]/components/TipsTab.tsx`
- `app/manage/merchants/[merchantId]/components/OnlineStoreTab.tsx`

