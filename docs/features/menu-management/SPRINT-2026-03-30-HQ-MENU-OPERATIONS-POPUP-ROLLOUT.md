# HQ Menu Operations Popup Rollout

Date: 2026-03-30

## Scope

This document tracks the next HQ popup-redesign pass after the approved category, menu, and item modal rollouts.

Explicitly out of scope for this document:

1. Bunny CDN migration
2. HQ menu/category/item parity features
3. unrelated popup changes outside the HQ menu operational flows
4. modifier group forms and large detail views

Related work tracked separately:

1. category popup pilot: `docs/features/menu-management/SPRINT-2026-03-28-HQ-CATEGORY-POPUP-PILOT.md`
2. menu and item popup rollout: `docs/features/menu-management/SPRINT-2026-03-30-HQ-MENU-ITEM-POPUP-ROLLOUT.md`
3. popup inventory and broader rollout plan: `docs/features/admin-platform/SPRINT-2026-03-28-POPUP-STANDARDIZATION.md`
4. HQ menu parity work: `docs/features/menu-management/SPRINT-2026-03-28-HQ-MENU-PARITY.md`
5. Bunny CDN migration: `docs/features/cdn-assets/SPRINT-2026-03-21-BUNNY-CDN-MIGRATION-PLAN.md`

## Goal

Apply the approved centered blurred modal pattern to the next lower-risk HQ menu operation popups:

1. `app/manage/merchants/[merchantId]/components/MenuTab/sheets/AdminAddCategoryToMenuSheet.tsx`
2. `app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuSchedulesSheet.tsx`

## This Pass

### Add Existing Categories

Updated:

1. switched from bottom sheet to centered dialog
2. added blurred backdrop
3. preserved the search and selection summary at the top
4. kept the category list independently scrollable
5. kept the footer actions fixed and reachable

### Menu Schedules

Updated:

1. switched from bottom sheet to centered dialog
2. added blurred backdrop
3. preserved schedule assignment and schedule creation in the same popup
4. made the central body scroll independently inside the modal shell
5. kept the footer close action fixed

## Acceptance Checklist

The rollout is acceptable if:

1. HQ `Link Existing Category` opens as a centered blurred modal
2. HQ category linking search and list remain usable
3. HQ `Set Schedule` opens as a centered blurred modal
4. assigned schedules, existing schedule assignment, and create-schedule flow remain usable
5. footer buttons remain reachable on laptop-sized viewports
6. category linking and schedule assignment still submit correctly

## Deferred Candidates

The next likely matching HQ popup candidates after this pass are:

1. `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ModifierFormSheet.tsx`
2. `app/manage/merchants/[merchantId]/components/MenuTab/sheets/MenuDetailSheet.tsx`
3. `app/manage/merchants/[merchantId]/components/MenuTab/sheets/CategoryDetailSheet.tsx`
4. `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemDetailSheet.tsx`
