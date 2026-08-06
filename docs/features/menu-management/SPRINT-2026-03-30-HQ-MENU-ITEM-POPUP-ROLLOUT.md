# HQ Menu And Item Popup Rollout

Date: 2026-03-30

## Scope

This document tracks the next popup-redesign rollout after the approved HQ category popup pilot.

Explicitly out of scope for this document:

1. Bunny CDN migration
2. HQ menu/category/item parity features
3. unrelated popup changes outside the HQ menu and item forms

Related work tracked separately:

1. category popup pilot: `docs/features/menu-management/SPRINT-2026-03-28-HQ-CATEGORY-POPUP-PILOT.md`
2. popup inventory and broader rollout plan: `docs/features/admin-platform/SPRINT-2026-03-28-POPUP-STANDARDIZATION.md`
3. HQ menu parity work: `docs/features/menu-management/SPRINT-2026-03-28-HQ-MENU-PARITY.md`
4. Bunny CDN migration: `docs/features/cdn-assets/SPRINT-2026-03-21-BUNNY-CDN-MIGRATION-PLAN.md`

## Goal

Apply the approved centered modal pattern to:

1. `app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuFormSheet.tsx`
2. `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx`

The item form must keep the desktop side-preview layout while moving into the centered blurred modal shell.

## This Pass

### Menu Form

Updated:

1. switched from bottom sheet to centered dialog
2. added blurred backdrop
3. made the body scroll independently
4. added a right-side preview panel for the menu on desktop

### Item Form

Updated:

1. switched from bottom sheet to centered dialog
2. added blurred backdrop
3. kept the existing desktop side-preview layout
4. preserved the multi-tab form and fixed footer inside the new dialog shell

## Acceptance Checklist

The rollout is acceptable if:

1. HQ `Create Menu` opens as a centered blurred modal
2. HQ `Edit Menu` opens as a centered blurred modal
3. HQ `Create Item` opens as a centered blurred modal
4. HQ `Edit Item` opens as a centered blurred modal
5. the item preview remains beside the form on desktop
6. footer buttons remain reachable
7. create and edit submissions still work

## Follow-up Adjustments

After rollout testing on smaller laptop viewports, the preview columns needed an additional containment fix:

1. menu preview column now scrolls independently instead of pinning its content with a sticky wrapper
2. item preview column now scrolls independently instead of pinning its content with a sticky wrapper
3. HQ item modal preview now allows the description text to expand naturally inside the scrollable preview column

## Next Matching Popup

If this rollout is approved, the next likely matching popup is:

1. `app/manage/merchants/[merchantId]/components/MenuTab/sheets/AdminAddCategoryToMenuSheet.tsx`
