# HQ Business Info Location Details

## Scope
- Track the missing HQ behavior in `merchants/[merchantId]/business info`
- Keep this separate from:
  - Bunny CDN migration work
  - popup redesign work
  - menu parity work

## Reported Issue
- Role: `hq.manager` and higher
- Page: HQ merchant detail -> `Business Info` tab -> `Locations`
- Problem: clicking `View Details` on a location row did nothing

## Root Cause
- `app/manage/merchants/[merchantId]/components/BusinessInfoTab.tsx`
  - rendered a `View Details` button with no click handler
- `getMerchantDetails(...)`
  - only returned summary location fields for the business-info table
- HQ had no dedicated read-only location details view wired from this page

## Implementation
- Added HQ-safe read action:
  - `app/manage/actions/admin-merchant/locations.ts`
  - `adminGetMerchantLocationById(merchantId, locationId)`
- Added admin query cache key:
  - `lib/queries/admin-keys.ts`
  - `merchantLocationDetail(merchantId, locationId)`
- Added reusable HQ query hook:
  - `lib/queries/use-admin-merchant.ts`
  - `useAdminMerchantLocationDetails(...)`
- Wired `View Details` button in:
  - `app/manage/merchants/[merchantId]/components/BusinessInfoTab.tsx`
- Added read-only HQ details dialog showing:
  - overview
  - contact info
  - address and geo data
  - pricing and tax settings
  - business hours
  - system metadata

## Expected Result
- HQ managers and higher can open full location details from the Business Info tab
- Details are read-only
- No behavior change to merchant-side location management flows
