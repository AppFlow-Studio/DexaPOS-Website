# Worklog: HQ-Only Online Store Payment Setup

**Date:** 2026-04-12  
**Goal:** Ensure merchant owners/admins cannot view or modify payment setup (TPN/FTD) or tipping. Those controls are HQ-only. Merchant dashboard should only support request/status + limited non-payment store details.

## Required Behavior

- Merchant dashboard (`/dashboard/online-ordering`):
  - before HQ completion: show only `Request Setup` + request status states
    - request button is blocked until the required merchant/location packet is complete (missing-only modal)
  - after HQ completion: allow editing only non-payment storefront details
  - payment device selection, TPN/FTD keys, and tipping are never visible
- HQ admin (`/manage/merchants/... -> Online Store`):
  - continues to own full setup (including payment/tips)
  - approves/rejects requests with reason + notification email

## What Changed

### Merchant UI

- Removed merchant-visible payment setup and tipping controls from `app/dashboard/online-ordering/page.tsx`.
- Post-setup merchant maintenance now includes:
  - Store Info:
    - `enabled` (store live/disabled)
    - `storeName`
    - `description`
    - `phone`
    - `email`
    - store URL is shown read-only (slug changes remain HQ-only due to payment-domain whitelisting)
  - Branding:
    - primary/secondary colors
    - logo + hero image uploads (Bunny CDN via `cdn-upload`)
  - Ordering:
    - pickup/delivery toggles
    - prep time, min order, max future days
    - delivery fee / free threshold / radius
  - OrderOut:
    - merchant OrderOut onboarding/status tools are visible inside the Online Ordering page

### Merchant Server Actions

- Hardened `app/dashboard/online-ordering/actions.ts`:
  - rejects attempts to send payment/tips keys (`ipospays*`, `tippingEnabled`, `tipPresets`)
  - updates only non-payment fields (store info, branding, ordering)
  - domain whitelist trigger is HQ-only (throws if called)

### Merchant Hook

- Updated `app/dashboard/online-ordering/hooks/useOnlineOrderingSettings.ts` to submit only the allowed non-payment fields on save.

## Docs Updated

- `docs/features/online-ordering/FEATURE-ONLINE-STORE-HQ-REQUEST-FLOW.md` now states:
  - merchant has no payment/tips access
  - HQ owns payment credentials/tipping
- `docs/features/online-ordering/HANDOFF-2026-04-11-SENIOR-ONLINE-ORDERING-DEJAVOO.md` includes the merchant restriction note.

## How To Verify

1. As merchant owner/admin:
   - open `/dashboard/online-ordering`
   - confirm there is no payment/tips/TPN/FTD UI
   - after `setup_completed`, confirm Store Info/Branding/Ordering/OrderOut are visible and save works
2. As HQ admin:
   - open merchant -> `Online Store`
   - confirm payment/tips remain available in HQ setup as before
