# HQ Creation Parity Rebase

Date: 2026-04-01
Status: In Progress

## Goal
Rebase HQ menu/category/item creation back onto the current merchant owner/admin creation flow before applying the centered blurred popup redesign.

This track is separate from:
- Bunny CDN migration
- unrelated bug fixes
- popup redesign rollout docs

## Source Of Truth
Merchant owner/admin creation flows are the baseline for:
- menu creation
- category creation
- item creation

HQ should follow the same creation flow first, then both sides can be restyled with the agreed popup shell.

## What Was Found During Scan
Current workspace state after the user rollback:
- merchant-side menu/category/item creation is back on the older baseline flow
- HQ still had newer popup/form variants for some creation paths
- category creation was the clearest mismatch: HQ had a different section structure and different schedule behavior
- menu creation also diverged from merchant by using a richer HQ-only form structure
- item creation still has a larger parity gap and needs a separate pass

## Completed In This Rebase Pass
### HQ Menu Creation
File:
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuFormSheet.tsx`

Changes:
- removed the HQ-only preview-oriented create flow
- moved the form back toward the merchant owner/admin creation structure
- kept the form focused on:
  - context banner
  - name
  - description
  - image upload
  - active state
- preserved HQ admin actions and Bunny CDN upload behavior

### HQ Category Creation
File:
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryFormSheet.tsx`

Changes:
- reintroduced merchant-style sectioning
- separated `Appearance` from `Basic Information`
- reintroduced `Availability Schedule` as a distinct collapsible section
- changed create-mode schedule behavior so schedule selections are stored locally and applied after category creation
- kept HQ-only location override and prep-station capabilities in place
- preserved add-to-menu behavior when category creation happens inside a menu context

## Remaining In This Track
### HQ Item Creation
File:
- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx`

Changes completed in this pass:
- kept the current HQ admin shell in place, but aligned the missing creation behavior with the merchant baseline
- added visible category assignment during item creation
- added inline quick-create category support directly inside the HQ item form
- made quick-created categories respect the current location scope
- updated the preview card to reflect selected categories during create/edit
- kept edit mode honest by showing current categories as read-only instead of exposing category toggles that do not persist through the current HQ save path

Notes:
- this completes the creation-side parity gap that was still visible on HQ item creation
- category reassignment from the HQ item edit form is still a separate behavior track if it needs to match merchant edit behavior later
- popup redesign is still intentionally separate from this parity track

## Validation Notes
Validation completed for this pass:
- `git diff --check` on touched files: clean except CRLF warnings
- TypeScript syntax parse for touched files: passed

Validation still blocked repo-wide:
- repo lint config still throws the existing circular `.eslintrc.json` error

## Next Recommended Step
Creation parity for HQ menu, category, and item flows is now covered at the form-behavior level.

Next step:
- apply the final popup redesign across both HQ and merchant flows only after this parity baseline is accepted in testing
