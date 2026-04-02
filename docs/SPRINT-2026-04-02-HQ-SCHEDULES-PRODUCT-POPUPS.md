# HQ Schedules And Product Popups

## Scope
- HQ merchant detail page
- Tabs covered:
  - `Schedules`
  - `Products`
- Keep this separate from:
  - Bunny CDN work
  - menu popup redesign work
  - HQ business-info location details work

## Permission Check
- Schedule creation and editing are protected by `hq.merchant.update`
- In current role config this includes:
  - `hq.manager`
  - `hq.platform_admin`
  - `hq.super_admin`

## Reported Issues
- HQ `Schedules` popup still used the old bottom-sheet style
- HQ `Products` popup looked acceptable on desktop but clipped on narrow/mobile-width screens

## Implementation
- Redesigned HQ schedule popup:
  - `app/manage/merchants/[merchantId]/components/AdminScheduleFormSheet.tsx`
  - moved from old `BottomSheet` shell to centered `Dialog`
  - added blurred overlay
  - fixed header/footer
  - body scrolls independently

- Improved HQ product popup responsiveness:
  - `app/manage/merchants/[merchantId]/components/inventory/AdminAddItemDialog.tsx`
  - `app/manage/merchants/[merchantId]/components/inventory/AdminEditItemDialog.tsx`
  - added viewport-constrained dialog height
  - made body scrollable
  - changed dense 2-column / 3-column layouts to collapse on smaller widths
  - made footer actions stack correctly on small screens

## Expected Result
- HQ schedule create/edit popup matches the newer centered modal pattern
- HQ product add/edit popup stays usable on mobile-width viewports without clipping
