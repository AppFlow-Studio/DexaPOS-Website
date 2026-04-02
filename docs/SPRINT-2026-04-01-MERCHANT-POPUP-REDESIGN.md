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

## Merchant Operation Popups Converted In This Pass
### Link Categories to Menu
File:
- `components/dashboard/menu/AddCategoryToMenuWizard.tsx`

Changes:
- replaced the bottom sheet shell with the new centered modal shell
- kept the existing search, selection, and override flow intact
- made the search panel fixed and the category list independently scrollable

### Add Items to Category
File:
- `components/dashboard/menu/categories/AddItemToCategoryWizard.tsx`

Changes:
- replaced the bottom sheet shell with the new centered modal shell
- kept the existing add-existing vs create-new tab flow intact
- kept the footer fixed while the item list and create tab body scroll independently

## Merchant Modifier And Schedule Popups Converted In This Pass
### Modifier Group Create/Edit
File:
- `components/dashboard/menu/ModifierGroupFormSheet.tsx`

Changes:
- replaced the main modifier group bottom sheet with the new centered modal shell
- kept the existing two-column desktop layout with a scrollable preview column
- converted the nested add/edit option popup to the same centered dialog pattern

### Create Schedule
File:
- `components/dashboard/menu/CreateScheduleSheet.tsx`

Changes:
- replaced the schedule bottom sheet with the new centered modal shell
- kept the same create flow and success state
- made the schedule builder body scroll while the footer stays fixed

### Schedule Create/Edit
File:
- `components/dashboard/menu/ScheduleFormSheet.tsx`

Changes:
- replaced the schedule bottom sheet with the new centered modal shell
- kept the location-context banner, easy-fill actions, and success state
- made the schedule builder body scroll while the footer stays fixed

## Supporting Adjustments
Files:
- `components/dashboard/menu/ScheduleOverrideDialog.tsx`
- `components/dashboard/menu/ModifierItemOverrideDialog.tsx`

Changes:
- raised nested dialog elevation so child dialogs open above the new parent modals
- added blurred nested backdrops for nested flows

## Width Adjustment
Date:
- 2026-04-01

Changes:
- reduced the merchant popup widths so redesigned modals no longer feel full-page on laptop screens
- reduced preview-heavy dialogs by one width step instead of removing the preview layout
- reduced operation and schedule dialogs more aggressively because they do not need as much horizontal space
## Validation
Validation completed for this pass:
- TS parse passed for the first merchant popup batch
- later popup batches were verified with `git diff --check`
- lint remains blocked by the existing circular `.eslintrc.json` issue

## Next Recommended Step
Test the merchant menu/category/item flows in the browser.

If that passes:
- continue the redesign rollout to the remaining merchant modifier and schedule popups
