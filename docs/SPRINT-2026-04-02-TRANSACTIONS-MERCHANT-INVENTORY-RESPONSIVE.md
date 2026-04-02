# April 2, 2026: Transactions + Merchant Inventory Responsiveness

## Scope

This pass is separate from:

- Bunny CDN upload work
- HQ schedule/product popup redesign work
- menu/category/item popup redesign work

It covers:

1. HQ merchant transactions layout tuning for a 1280x720 laptop screen
2. merchant inventory product popup alignment with the newer modal pattern

## HQ Merchant Transactions

File:

- `app/manage/merchants/[merchantId]/components/TransactionsTab.tsx`

Problem:

- On a 1280x720 laptop, the transactions page stayed in a rigid two-column split.
- The financial summary panel and chart panel were side by side even when the available width was too tight.

Change:

- The transactions layout now stacks vertically below the higher-resolution breakpoint.
- The wider side-by-side split is preserved for larger screens.
- The date picker row was also simplified to a single-column wrapper.

Expected result:

- On 1280x720, the main transactions panels appear one under the other.
- On wider screens, the previous split layout remains.

## Merchant Inventory Product Dialogs

Merchant surfaces:

- `app/dashboard/inventory/components/AddItemDialog.tsx`
- `app/dashboard/inventory/components/EditItemDialog.tsx`

Audit result:

- merchant schedule dialogs were already on the redesigned centered blurred modal pattern:
  - `components/dashboard/menu/CreateScheduleSheet.tsx`
  - `components/dashboard/menu/ScheduleFormSheet.tsx`
- merchant inventory add dialog was already aligned closely enough
- merchant inventory edit dialog still needed the newer responsive shell

Change:

- `EditItemDialog` now uses:
  - viewport-constrained dialog height
  - blurred overlay
  - independently scrollable body
  - responsive field grids
  - fixed footer actions

Expected result:

- Merchant inventory edit works cleanly on smaller laptop/mobile-width screens.
- The dialog should no longer clip content or rely on rigid two-column layouts on narrow widths.
