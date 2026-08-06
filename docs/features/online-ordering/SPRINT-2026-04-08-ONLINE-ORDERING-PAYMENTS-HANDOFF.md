# Sprint Handoff: Online Ordering, Payments, and Bug Fixes

**Date:** 2026-04-11  
**Scope:** Summary of the fixes and implementation work completed across the recent admin/HQ/menu/storefront/payment tasks, including the current status of the Dejavoo online ordering integration, the disabled-store middleware block, and the secure multi-branch payment-device layer.

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
- disabled branch storefronts are now blocked at middleware level with a hard `404`
- Dejavoo config moved from a global/plaintext branch model toward a selected per-branch payment-device model
- embedded Dejavoo FTD tokenization is wired correctly through the new secure device layer
- live Dejavoo sale processing was tested and reached the processor, but sandbox sales are currently blocked by Dejavoo/iPOS with response code `91 / HOST NO RESPONSE`
- current new-branch tokenization failures are no longer explained by app-side branch/device selection; current evidence points to Dejavoo-side origin/device registration when `FTD_013` occurs
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
- `app/manage/actions/admin-merchant/online-ordering.ts`
- `lib/queries/use-admin-online-ordering.ts`
- `middleware.ts`

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

### 2.4 Storefront disabled-site middleware block

Completed fix:

- disabled branch storefronts now return `404` at the request layer instead of relying on a UI-only disabled state
- this applies to:
  - subdomain storefront access
  - custom-domain storefront access
  - direct `/sites/[slug]` route access
- storefront data loading also now treats inactive stores as not found as a server-side fallback

Main files involved:

- `middleware.ts`
- `app/sites/actions.ts`

## 3. Dejavoo Payment Integration

## 3.1 What was fixed

### Embedded FTD checkout bootstrap

The `process-online-payment` edge function was first updated to return the Dejavoo `Ecom/TOP` merchant key instead of the old auth JWT flow, and was later extended again to resolve a branch-specific key from the selected payment device.

Current behavior:

- validates `store_config_id`
- resolves the branch `location_id`
- resolves the selected online-ordering payment device for that branch
- decrypts the branch/device FTD key server-side
- returns:
  - `security_key`
  - `payment_device_id`
  - `tpn`

Main file:

- `supabase/functions/process-online-payment/index.ts`

This change unblocked the embedded card form and tokenization.

### Secure multi-branch payment-device layer

The Dejavoo configuration model now supports the real branch/device shape more safely:

- one branch can have many payment devices
- online ordering uses one selected device per branch
- the selected device is the source of truth for:
  - `TPN`
  - FTD key
  - whitelist target

Implementation details:

- `TPN` remains stored as normal configuration data
- FTD key is now stored in Supabase Vault, not meant to live in plaintext on `online_store_config`
- merchant dashboard and HQ admin save the device through secure RPCs
- checkout now passes `payment_device_id`
- `create-online-order` re-resolves that same device on the backend

Main files involved:

- `supabase/migrations/20260409170000_secure_online_ordering_payment_devices.sql`
- `supabase/migrations/20260409184500_add_get_location_payment_device_secret_rpc.sql`
- `app/dashboard/online-ordering/actions.ts`
- `app/dashboard/online-ordering/page.tsx`
- `app/dashboard/online-ordering/hooks/useOnlineOrderingSettings.ts`
- `app/manage/actions/admin-merchant/online-ordering.ts`
- `app/manage/merchants/[merchantId]/components/OnlineStoreTab.tsx`
- `supabase/functions/process-online-payment/index.ts`
- `supabase/functions/create-online-order/index.ts`

### Embedded tokenization

The Dejavoo Freedom to Design form is now able to tokenize on the checkout page.

Confirmed working during testing:

- `process-online-payment` returned `200`
- `paymentCardToken` returned `200`
- secure branches now return a non-null `payment_device_id` from `process-online-payment`

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

### Checkout empty-card validation fix

The checkout flow now validates card input explicitly before tokenization so the user gets immediate feedback instead of a silent click/no-op.

Behavior:

- if card number / expiry / CVV are missing or invalid, checkout shows a clear error
- tokenization only runs after client-side card validation passes

Main files involved:

- `app/sites/components/checkout/PaymentCardForm.tsx`
- `app/sites/components/checkout/CheckoutPage.tsx`

### Domain whitelist flow update

Domain whitelisting now triggers not only when TPN changes, but also when the store slug/domain changes while TPN remains the same.

Main file:

- `app/dashboard/online-ordering/actions.ts`

### Admin-side store status and whitelist checks

Store operational checks are now surfaced on the HQ merchant admin side (not the public storefront preview):

- store status remains controlled from the merchant `OnlineStoreTab` toggle
- Dejavoo whitelist can be manually retriggered from the same tab
- the tab now shows payment readiness (TPN present/missing) and whitelist outcome messaging
- public storefront routes were reverted to normal rendering (no forced disabled screen)

Main files involved:

- `app/manage/merchants/[merchantId]/components/OnlineStoreTab.tsx`
- `app/manage/actions/admin-merchant/online-ordering.ts`
- `lib/queries/use-admin-online-ordering.ts`
- `middleware.ts`

### Current tokenization diagnosis

Current evidence from testing:

- old working branch still uses the legacy fallback path:
  - `payment_device_id = null`
- new branch uses the secure selected-device path:
  - `payment_device_id` is returned and matches the DB-selected device row
- DB-selected branch device, branch TPN, Vault secret, and `process-online-payment` response were verified as aligned

This means:

- secure branch/device selection is working in app code
- current `FTD_013 Requested Origin is Not Registered` failures are no longer explained by a missing migration, missing function deploy, or wrong branch-device lookup in Dexa
- the remaining failure is consistent with Dejavoo-side device/origin/key registration in UAT

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
- confirmed in demo testing:
  - demo card orders cancel to `void`
  - demo card orders save last 4 correctly
  - cash orders should remain `cancelled`

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
- `process-online-payment` now prefers the selected branch payment device and returns:
  - `security_key`
  - `payment_device_id`
  - `tpn`
- disabled storefronts should not be reachable because middleware now blocks inactive stores with a hard `404`
- each branch can now maintain its own selected Dejavoo online-ordering device
- domain whitelist for the exact storefront origin still must exist on the same Dejavoo device/key pair

### Important deferred issue

Real sale processing is currently deferred because sandbox sale attempts returned:

- `91 / HOST NO RESPONSE`

This should be revisited later with the Dejavoo/iPOS sandbox team or internal owner of the merchant/TPN configuration.

## 7. Open / Deferred Items

### Known bug

- none currently recorded for the checkout empty-card submit case (fixed in this batch)

### Deferred

- real Dejavoo sale capture in `create-online-order`
- real processor-backed refunds
- background job for auto-cancel/auto-void when no tracking page is open
- SMS notifications
- automated Dejavoo whitelist uses the standard `DEJAVOO_IPOS_API_KEY` path

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
   - disabled stores return `404` at the middleware layer

2. Revisit real Dejavoo sale processing later:
   - confirm sandbox/UAT TPN routing
   - confirm sale host/acquirer availability
   - retry the live sale path only after the `91 / HOST NO RESPONSE` issue is resolved
   - for `FTD_013`, verify the exact Dejavoo device/key/origin registration for the selected branch device

3. After real sale works:
   - enable real processor `void`
   - add real refund flow using original `RRN`

## 9. Main Files Touched in This Batch

- `supabase/functions/process-online-payment/index.ts`
- `supabase/functions/create-online-order/index.ts`
- `supabase/functions/create-online-order/ipospays.ts`
- `supabase/functions/cancel-online-order/index.ts`
- `supabase/migrations/20260409170000_secure_online_ordering_payment_devices.sql`
- `supabase/migrations/20260409184500_add_get_location_payment_device_secret_rpc.sql`
- `app/sites/components/checkout/PaymentCardForm.tsx`
- `app/sites/components/checkout/CheckoutPage.tsx`
- `app/sites/actions.ts`
- `app/sites/order-actions.ts`
- `app/sites/recovery-actions.ts`
- `app/sites/components/OrderTrackingPage.tsx`
- `app/dashboard/online-ordering/actions.ts`
- `app/dashboard/online-ordering/page.tsx`
- `app/dashboard/online-ordering/hooks/useOnlineOrderingSettings.ts`
- `components/dashboard/menu/categories/AddItemToCategoryWizard.tsx`
- `app/dashboard/menu/[menuId]/page.tsx`
- `app/dashboard/menu/categories/page.tsx`
- `app/manage/merchants/[merchantId]/page.tsx`
- `app/manage/merchants/[merchantId]/components/PaymentsTab.tsx`
- `app/manage/merchants/[merchantId]/components/InvoicesTab.tsx`
- `app/manage/merchants/[merchantId]/components/TipsTab.tsx`
- `app/manage/merchants/[merchantId]/components/OnlineStoreTab.tsx`
- `middleware.ts`
