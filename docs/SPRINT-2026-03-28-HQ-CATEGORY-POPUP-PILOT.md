# HQ Category Popup Redesign Pilot

Date: 2026-03-28

## Scope

This document tracks the popup redesign pilot only.

Explicitly out of scope for this document:

1. Bunny CDN migration
2. menu/category/item data bug fixes
3. unrelated popup refactors outside the HQ category form

Related but separate work:

1. Bunny CDN migration is tracked separately in `docs/SPRINT-2026-03-21-BUNNY-CDN-MIGRATION-PLAN.md`
2. broader popup inventory and rollout planning is tracked in `docs/SPRINT-2026-03-28-POPUP-STANDARDIZATION.md`

## Pilot Target

Component selected for the first redesign pass:

- `app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryFormSheet.tsx`

This component is the right pilot because:

1. it is a create/edit form, not a detail viewer
2. it is already used in the HQ menu workflow being tested
3. it is smaller and safer than the HQ item form

## Design Goal

Match the requested popup direction:

1. centered modal
2. blurred page backdrop
3. contained scrollable body
4. fixed, always-reachable footer actions

## Implementation Approach

The pilot uses the shared dialog primitive instead of the bottom-sheet primitive.

Changes:

1. `components/ui/dialog.tsx`
   Added optional `overlayClassName` so blur can be enabled per-dialog instead of globally changing every dialog.
2. `app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryFormSheet.tsx`
   Switched from bottom sheet to centered dialog layout.

## Pilot Styling Decisions

For this first popup:

1. overlay uses blur and a softened dark tint
2. dialog is centered with rounded corners and heavier elevation
3. header and footer are fixed sections
4. the form body scrolls independently when content grows
5. section content stays close to the existing design system to reduce behavioral risk

## Acceptance Checklist

The pilot is acceptable if:

1. opening `Create Category` in HQ shows a centered modal
2. the page behind the modal is visibly blurred
3. the close button and footer actions stay reachable on laptop screens
4. large image previews do not push the submit button out of view
5. create and edit flows still submit correctly

## If Approved

Next matching popup candidates:

1. `app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuFormSheet.tsx`
2. `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx`
3. `app/manage/merchants/[merchantId]/components/MenuTab/sheets/AdminAddCategoryToMenuSheet.tsx`

These should be migrated in sequence only after visual approval of this pilot.
