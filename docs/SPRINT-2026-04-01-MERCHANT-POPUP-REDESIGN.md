# Merchant Popup Redesign

Date: 2026-04-01
Status: In Progress

## Goal
Apply the agreed merchant popup shell:
- centered modal
- blurred/dimmed page backdrop
- fixed header/footer
- scrollable body

This track is separate from:
- Bunny CDN migration
- HQ creation parity
- unrelated bug fixes

## Live Merchant Popups Converted In This Pass
### Create Menu
File:
- `app/dashboard/menu/page.tsx`

Changes:
- upgraded the old small dialog to the new centered modal shell
- added blurred backdrop
- added a right-side preview summary on desktop

### Category Create/Edit
File:
- `components/dashboard/menu/CategoryFormSheet.tsx`

Changes:
- replaced the bottom sheet shell with the new centered modal shell
- kept the existing merchant category flow intact
- kept the preview column and made the overall modal body scroll correctly

### Item Create/Edit
File:
- `components/dashboard/menu/NewEditItemFormSheet.tsx`

Changes:
- replaced the bottom sheet shell with the new centered modal shell
- kept the existing merchant item flow intact
- kept the right-side preview and made it independently scrollable

### Create Item Wizard
File:
- `components/dashboard/menu/items/CreateItemWizard.tsx`

Changes:
- replaced the bottom sheet shell with the new centered modal shell
- added a right-side preview panel on desktop
- kept the existing category-selection and pricing flow intact

## Supporting Adjustment
File:
- `components/dashboard/menu/ScheduleOverrideDialog.tsx`

Changes:
- raised dialog elevation so it opens above the new category modal
- added a blurred nested backdrop

## Validation
Validation completed for this pass:
- TS parse passed for all touched merchant popup files
- `git diff --check` passed with only CRLF warnings

## Next Recommended Step
Test the merchant menu/category/item flows in the browser.

If that passes:
- continue the redesign rollout to the remaining merchant menu operation popups
