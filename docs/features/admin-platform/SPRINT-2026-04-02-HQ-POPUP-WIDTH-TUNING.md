# HQ Popup Width Tuning

Date: 2026-04-02
Status: Done

## Goal
Reduce the width of the already-redesigned HQ popups so they feel less full-page on laptop screens.

This track is separate from:
- Bunny CDN migration
- HQ creation parity
- merchant popup redesign

## Changed
### HQ Item Popup
File:
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx`

Changes:
- reduced the desktop width by one step
- kept the preview-beside-form layout intact

### HQ Link Category Popup
File:
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/AdminAddCategoryToMenuSheet.tsx`

Changes:
- reduced the popup width for laptop screens
- kept the search and list flow unchanged

### HQ Menu Schedules Popup
File:
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuSchedulesSheet.tsx`

Changes:
- reduced the popup width for laptop screens
- kept assigned schedules and schedule creation flow unchanged

## Left Unchanged
These were already reasonably narrow:
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuFormSheet.tsx`
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryFormSheet.tsx`

## Validation
- `git diff --check` passed with only CRLF warnings
