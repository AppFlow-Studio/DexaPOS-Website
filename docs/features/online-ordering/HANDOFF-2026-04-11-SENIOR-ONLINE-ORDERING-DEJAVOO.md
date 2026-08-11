# Senior Handoff: Online Ordering, Dejavoo, and Storefront Access

**Date:** 2026-04-11  
**Last Updated:** 2026-04-14  
**Audience:** Senior engineer / technical lead  
**Purpose:** One-file status summary of what was implemented, what was verified, what is still blocked, and what needs confirmation on the Dejavoo side.

## 1. Executive Summary

The online-ordering work is now in a materially better state than the original implementation.

Implemented:

- HQ-owned online-store request/review/setup flow is now in place
- merchant online-store page is request/status driven and limited to non-payment settings after HQ completes setup (payment + tips remain HQ-only)
- merchant and location onboarding now collect the compliance/banking fields required for HQ review
- W-9, owner government ID, and branch bank support documents now upload through Bunny-backed document flows
- merchant setup requests are now gated by required packet completeness; when missing data is detected, the merchant sees a modal that shows only missing fields (text + file uploads) and cannot submit the request until complete
- branch storefront disable is now enforced at middleware level with hard `404`
- inactive-store API bypasses are now blocked in OTP, payment-init, and order-create paths
- HQ admin Online Store UI again exposes the full set of existing `online_store_config` theme controls (template/menu layout/header style + expanded theme colors + operating hours)
- Dejavoo configuration moved from a global/plaintext branch model toward a secure per-branch selected-device model
- branch-specific FTD key resolution is working through Supabase Vault
- checkout now carries `payment_device_id` through the payment flow
- order creation re-resolves the same selected device server-side
- demo card orders still save payment metadata correctly and can be voided/cancelled in demo mode
- merchant dashboard no longer exposes payment/tips configuration (HQ-only)

Current conclusion:

- app-side branch/device selection is now working
- DB/device selection is aligned
- `process-online-payment` is aligned
- current evidence points to Dejavoo-side device/key/origin registration in UAT, not a missing Dexa migration or missing order-function update

## 2. What Was Implemented

### 2.0 HQ-owned online-store setup flow

Online-store setup ownership moved out of the merchant storefront editor and into HQ review/setup flow.

Merchant behavior now:

- branch can submit an online-store setup request only
- branch sees one of:
  - pending review
  - approved / setup in progress
  - rejected with reason
  - setup completed
- after setup is completed, branch can only maintain **non-payment** storefront settings:
  - store info / branding / ordering
  - payment credentials (`TPN`, FTD key) and tips remain HQ-only

HQ behavior now:

- HQ overview shows request status per location
- pending requests open into a review screen with:
  - merchant compliance packet
  - location banking packet
  - approve action
  - reject action with reason
- after approval, HQ continues with the storefront setup editor
- first successful HQ save marks setup as completed
- approval/rejection emails are sent to merchant owner/admin recipients

Files:

- `supabase/migrations/20260412090000_online_store_request_review_flow.sql`
- `lib/online-store/setup-flow.ts`
- `app/dashboard/online-ordering/actions.ts`
- `app/dashboard/online-ordering/page.tsx`
- `app/dashboard/online-ordering/hooks/useOnlineOrderingSettings.ts`
- `app/manage/actions/admin-merchant/online-ordering.ts`
- `app/manage/merchants/[merchantId]/components/OnlineStoreTab.tsx`

### 2.0.1 Merchant/location onboarding packet expansion

To support HQ review before approval, onboarding now captures the missing compliance and banking fields.

Merchant onboarding now captures:

- legal business name
- DBA name
- EIN / Tax ID
- owner name
- owner DOB
- owner SSN
- signed W-9 document
- owner government ID document

Location onboarding now captures:

- bank name
- account holder name
- routing number
- DDA account number
- bank letter or voided check

Documents are uploaded to Bunny-backed CDN flows and then written into metadata so HQ review can open them directly from the online-store review screen.

Files:

- `app/manage/merchants/new/wizard.tsx`
- `app/manage/actions/create-merchant-onboarding.ts`
- `components/dashboard/locations/CreateLocationWizard.tsx`
- `components/admin/locations/AdminCreateLocationWizard.tsx`
- `components/dashboard/locations/steps/BankingPayoutsStep.tsx`
- `components/dashboard/locations/steps/ReviewStep.tsx`
- `lib/cdn/server.ts`
- `supabase/functions/cdn-upload/index.ts`
- `types/merchant_locations.ts`

### 2.1 Storefront disabled-state protection

Disabled storefronts are now blocked before UI render.

Behavior:

- if `online_store_config.is_active = false`, middleware returns `404`
- applies to:
  - subdomain storefront access
  - custom-domain storefront access
  - direct `/sites/[slug]` access
- storefront server data loader also treats inactive stores as not found as a fallback

Files:

- `middleware.ts`
- `app/sites/actions.ts`

### 2.1.1 Inactive-store API bypass hardening

Middleware protection alone was not enough because a disabled store could still be targeted directly through backend entry points by `store_config_id`.

Completed fix:

- `process-online-payment` now treats inactive stores as not found
- `create-online-order` now treats inactive stores as not found
- storefront OTP entry points now treat inactive stores as not found

This closes the main non-UI bypasses for disabled storefronts.

Files:

- `supabase/functions/process-online-payment/index.ts`
- `supabase/functions/create-online-order/index.ts`
- `app/sites/auth-actions.ts`

### 2.1.2 HQ Branding + Store Info Controls Restored

The HQ Online Store settings UI previously only exposed primary/secondary colors. It now round-trips and renders the full set of theme/config columns that already exist on `online_store_config`:

- template (`classic|bold|minimal`)
- menu layout (`cards|sidebyside|no-images`)
- header style (`filled|transparent|outlined`)
- expanded theme colors (`accent|background|text|border|card|headerTextColor`)
- font family (from `FONT_GOOGLE_URLS`)
- operating hours editor (`HoursConfigModal`)
- store description

Files:

- `app/manage/actions/admin-merchant/online-ordering.ts`
- `app/manage/merchants/[merchantId]/components/OnlineStoreTab.tsx`

### 2.2 Secure multi-branch / multi-device Dejavoo model

Problem with old model:

- `TPN` was effectively branch-specific
- FTD key was global or plaintext
- this could mismatch tokenization, whitelist, and charge paths

New model:

- one branch can have many payment devices
- online ordering selects one active device per location
- selected device is the source of truth for:
  - `TPN`
  - FTD key
  - whitelist target

Security improvements:

- FTD key stored in Supabase Vault
- no longer intended to sit in public/plaintext branch config
- UI stores/rotates the key through RPCs
- checkout resolves the key server-side at runtime

Merchant access restriction:

- payment device selection, TPN/FTD keys, and tipping are HQ-only
- merchant dashboard can submit requests and maintain non-payment storefront settings after HQ completes setup:
  - store info + status toggle
  - branding (colors/images)
  - ordering thresholds (pickup/delivery/min order/etc)
  - OrderOut onboarding/status

Files:

- `supabase/migrations/20260409170000_secure_online_ordering_payment_devices.sql`
- `supabase/migrations/20260409184500_add_get_location_payment_device_secret_rpc.sql`
- `app/dashboard/online-ordering/actions.ts`
- `app/dashboard/online-ordering/page.tsx`
- `app/dashboard/online-ordering/hooks/useOnlineOrderingSettings.ts`
- `app/manage/actions/admin-merchant/online-ordering.ts`
- `app/manage/merchants/[merchantId]/components/OnlineStoreTab.tsx`
- `supabase/functions/process-online-payment/index.ts`
- `supabase/functions/create-online-order/index.ts`

### 2.3 Checkout/device alignment

Behavior now:

- checkout requests `process-online-payment`
- function resolves selected device for the branch
- function returns:
  - `security_key`
  - `payment_device_id`
  - `tpn`
- checkout submits `payment_device_id` with order creation
- `create-online-order` re-resolves the same device on the backend

This removes the previous cross-device mismatch risk.

Files:

- `app/sites/components/checkout/CheckoutPage.tsx`
- `app/sites/components/checkout/PaymentCardForm.tsx`
- `supabase/functions/process-online-payment/index.ts`
- `supabase/functions/create-online-order/index.ts`

### 2.4 Demo payment behavior and cancellation

Current payment mode remains demo/fake-success for capture because live sale attempts previously hit processor-side issues.

Current behavior:

- tokenization can still run
- order creation still works in demo mode
- card metadata still saves:
  - card type
  - last 4
  - payment device metadata
- demo card cancellation transitions to `void`

Files:

- `supabase/functions/create-online-order/index.ts`
- `supabase/functions/cancel-online-order/index.ts`
- `app/sites/order-actions.ts`
- `app/sites/components/OrderTrackingPage.tsx`

## 3. Database / Function Changes That Matter

### Database

Applied migrations:

- `supabase/migrations/20260409113000_add_online_store_ftd_key.sql`
- `supabase/migrations/20260409170000_secure_online_ordering_payment_devices.sql`
- `supabase/migrations/20260409184500_add_get_location_payment_device_secret_rpc.sql`

Important DB objects:

- `public.location_payment_devices`
- `public.payment_credential_access_log`
- `public.list_location_payment_devices(uuid)`
- `public.upsert_location_payment_device(uuid, text, text, text, boolean)`
- `public.get_location_payment_device_secret(uuid, uuid)`
- `online_store_config.setup_request_status`
- `online_store_config.setup_requested_at`
- `online_store_config.setup_requested_by`
- `online_store_config.setup_reviewed_at`
- `online_store_config.setup_reviewed_by`
- `online_store_config.setup_rejection_reason`
- `online_store_config.setup_approved_at`
- `online_store_config.setup_completed_at`

### Supabase functions

Relevant redeploys:

- `process-online-payment`
- `create-online-order`
- Next.js app redeploy/restart for:
  - `middleware.ts`
  - `app/sites/actions.ts`
  - `app/sites/auth-actions.ts`

## 4. What Was Verified

### Verified in app / DB

For the new secure branch flow:

- selected branch device row exists
- selected branch `TPN` matches `online_store_config.ipospays_tpn`
- selected device is active
- selected device is marked `use_for_online_ordering = true`
- selected device has a Vault secret
- `process-online-payment` returns the aligned:
  - `security_key`
  - `payment_device_id`
  - `tpn`

### Verified behavior difference between old and new branch

Observed:

- old working branch returned:
  - `payment_device_id = null`
- new branch returned:
  - non-null `payment_device_id`

Interpretation:

- old branch is still using the legacy fallback path
- new branch is using the secure selected-device path

This confirms the new app-side branch/device selection is active for the new branch.

### Verified storefront middleware behavior

Expected and implemented:

- disabled branch storefronts should return `404` at request layer
- no storefront UI should render first

### Verified HQ request/review flow behavior

Expected and implemented:

- merchant no longer gets full storefront editor before HQ setup completion
- HQ review screen reads merchant and location packets before approval
- HQ approve/reject actions are server-side gated by request status
- merchant sees rejection reason after HQ reject
- first successful HQ setup save transitions approved requests to `setup_completed`

## 5. Current Blocker

### Exact error

New branch tokenization is failing with:

- `FTD_013 Requested Origin is Not Registered`

### Why this no longer looks like a Dexa-side selection bug

We have already verified:

- branch DB config is aligned
- selected device row is aligned
- selected device `TPN` is aligned
- secure key resolution is aligned
- `process-online-payment` is returning the correct selected branch device path

That means the remaining failure is not well explained by:

- a missing DB migration
- a missing `create-online-order` update
- missing device selection in the app
- the old global-key mismatch problem

### Most likely remaining causes

1. Dejavoo whitelist is not actually applied to the exact UAT device being used.
2. The saved FTD/Ecom key was not generated from the same exact device/TPN.
3. The Dejavoo whitelist UI saved the domain but did not apply it in the expected UAT scope.
4. The device key needs regeneration after whitelist save.
5. Whitelist may be correct for one origin/device combination but not the exact current one.

## 6. Important Technical Note About Origins

The storefront can be opened in more than one routing mode:

- subdomain-style local routing:
  - `http://{slug}.localhost:3000`
- direct path routing:
  - `http://localhost:3000/sites/{slug}`

These are different browser origins.

Dejavoo validates the actual browser `Origin`, not the slug.

For the failing branch, the verified browser origin was:

- `http://ein-l-mirasi.localhost:3000`

That exact origin must be registered on the exact Dejavoo device/key pair being used.

## 7. What Needs Senior Confirmation

Please verify on the Dejavoo/iPOS side for the failing branch device:

1. The exact TPN/device used by Dexa for that branch is the same device configured in Dejavoo for FTD tokenization.
2. The exact browser origin is whitelisted on that same device:
   - `http://ein-l-mirasi.localhost:3000`
3. The FTD/Ecom key saved into Dexa was generated from that same exact device.
4. The whitelist and the key are both in the same UAT environment as `payment.ipospays.tech`.
5. If needed, remove/re-add the origin and regenerate a fresh key for that same device, then retest.

## 8. Quick-Win Backlog

These are small, high-value follow-ups worth doing next:

1. Add origin validation in `process-online-payment`
   - only return the branch FTD key when the request `Origin` matches the branch storefront origin

2. Surface legacy fallback usage in admin
   - branches still returning `payment_device_id = null` should be flagged as still using the legacy fallback path

3. Improve checkout UX when payment initialization fails
   - if card payment init fails, block or clearly disable the card path instead of letting the user continue into a backend error

4. Persist whitelist sync metadata more clearly
   - use `location_payment_devices.whitelist_origins` and `whitelist_synced_at` consistently from the admin whitelist flow

5. Remove stale public Dejavoo token configuration
   - clean any unused `NEXT_PUBLIC_*` Dejavoo security token setup from env/config to reduce debugging noise

6. Surface onboarding packet completeness outside online-store review
   - show the same W-9 / owner ID / bank-support state in merchant HQ business info and location detail surfaces

7. Replace prompt-based HQ rejection reason entry with a proper dialog
   - current implementation uses a prompt for speed; it should be upgraded to a typed modal

## 9. Supporting Docs

If deeper detail is needed:

- `docs/features/online-ordering/SPRINT-2026-04-08-ONLINE-ORDERING-PAYMENTS-HANDOFF.md`
- `docs/features/online-ordering/FEATURE-ONLINE-ORDERING-DEJAVOO-DEVICE-MODEL.md`
- `docs/features/online-ordering/FEATURE-ONLINE-ORDERING-PAYMENTS.md`
- `docs/features/online-ordering/FEATURE-ONLINE-STORE-HQ-REQUEST-FLOW.md`
