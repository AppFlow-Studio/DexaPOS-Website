# Feature: Online Store HQ Request Flow

## Goal

Move storefront setup ownership to HQ while keeping merchant-side online ordering limited to:

- requesting setup
- seeing review/setup status
- post-setup non-payment storefront details (no payment/tips access)

## Planned Flow

1. Merchant selects a location and requests online-store setup.
2. HQ reviews the branch packet and either approves or rejects.
3. If approved, HQ completes the storefront setup.
4. Merchant sees one of:
   - pending review
   - approved / setup in progress
   - rejected with reason
   - setup completed, with limited non-payment controls

## Current Implementation

Implemented:

- merchant online-store page no longer owns full storefront setup
- merchant can:
  - request setup
    - request is blocked until the merchant + location compliance packet is complete
    - when missing data is detected, a modal shows only missing fields (text + file uploads)
  - see request status
  - maintain limited non-payment storefront details after HQ marks setup complete
- merchant cannot view or edit:
  - payment device / TPN / FTD keys
  - tipping settings
- HQ online-store tab now reads the branch review packet before setup
- HQ can:
  - inspect merchant compliance packet
  - inspect location banking packet
  - approve a pending request
  - reject a pending request with a reason
  - continue full storefront setup after approval
- first successful HQ save after approval marks the request as `setup_completed`
- approval/rejection emails are sent to merchant owner/admin recipients

## Request Status UX

Merchant-facing status messages:

- `not_requested`: request setup CTA only
- `pending_review`: "team is currently reviewing your request"
- `approved`: "request approved, store setup in progress"
- `rejected`: rejection reason shown with re-submit CTA
- `setup_completed`: non-payment maintenance only (payment + tips always HQ)

HQ-facing status flow:

- overview shows request status for each location
- opening a pending request shows review packet + approve/reject actions
- opening an approved/completed request shows the full setup editor
- opening a rejected request shows the rejection reason and packet context

## Request Status Source Of Truth

Use `public.online_store_config` with these states:

- `pending_review`
- `approved`
- `rejected`
- `setup_completed`

Rows are created as skeleton configs when a merchant submits a setup request.

## Compliance / Review Packet

Merchant-level onboarding packet lives in `merchants.public_metadata`.

Location-level payment / banking packet lives in `locations.public_metadata`.

Current implementation target:

- merchant onboarding collects business + owner + document fields
- location onboarding collects branch banking / support-document fields
- HQ online-store review reads both packets before approval

Implemented onboarding packet fields:

- merchant onboarding:
  - legal business name
  - DBA name
  - EIN / Tax ID
  - owner name
  - owner DOB
  - owner SSN
  - signed W-9 upload
  - owner government ID upload
- location onboarding:
  - bank name
  - account holder name
  - routing number
  - DDA account number
  - bank letter / voided check upload

Document handling:

- merchant docs upload through Bunny CDN organization document flow
- branch bank support docs upload through Bunny CDN merchant document flow
- HQ review surfaces document links directly in the online-store tab

## Main Files

- `supabase/migrations/20260412090000_online_store_request_review_flow.sql`
- `lib/online-store/setup-flow.ts`
- `app/dashboard/online-ordering/actions.ts`
- `app/dashboard/online-ordering/page.tsx`
- `app/dashboard/online-ordering/hooks/useOnlineOrderingSettings.ts`
- `app/manage/actions/admin-merchant/online-ordering.ts`
- `app/manage/merchants/[merchantId]/components/OnlineStoreTab.tsx`
- `app/manage/merchants/new/wizard.tsx`
- `app/manage/actions/create-merchant-onboarding.ts`
- `components/dashboard/locations/CreateLocationWizard.tsx`
- `components/admin/locations/AdminCreateLocationWizard.tsx`
- `components/dashboard/locations/steps/BankingPayoutsStep.tsx`
- `components/dashboard/locations/steps/ReviewStep.tsx`
- `lib/cdn/server.ts`
- `supabase/functions/cdn-upload/index.ts`

## Notes

- W-9 and bank support docs should upload to Bunny CDN and be linkable from HQ review.
- Existing live stores are backfilled as `setup_completed`.
- Disabled storefront enforcement remains at middleware + backend entry points.
- Dejavoo whitelist/tokenization troubleshooting is intentionally separate from this request/review flow.
