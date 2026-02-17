# ADM Official Tickets Status (001-012)
> Last updated: 2026-02-17
> Baseline: compared against your official acceptance criteria list in chat.

---

## Summary Table

| Ticket | Status | Scratch Now? | Notes |
|--------|--------|--------------|-------|
| ADM-001 | Done (User-confirmed) | Yes | You marked it crossed out already. |
| ADM-002 | Implemented (Pending Migration Apply + QA) | After QA | Added migration with `get_admin_merchant_ids()` + admin-scoped SELECT RLS policies for orders/payment tables and supporting indexes. |
| ADM-003 | Done (User-confirmed) | Yes | You marked it crossed out already. |
| ADM-004 | Implemented (Pending Migration Apply + QA) | After QA | Added `get_admin_transactions(...)` RPC migration and wired manage transactions action to use RPC-first with fallback. |
| ADM-005 | Implemented (Pending Migration Apply + QA) | After QA | Added `get_admin_transaction_detail(p_order_id)` RPC migration and wired detail action to use RPC-first with fallback. |
| ADM-006 | Done | Yes | Advanced filter panel complete including staff searchable dropdown, URL-persisted params, and 300ms debounced filter sync. |
| ADM-007 | Done | Yes | Global search bar + URL sync + debounce + highlight + clear + keyboard shortcut implemented. |
| ADM-008 | Done (User-confirmed) | Yes | You confirmed it scratched after the remaining UI column/sticky/zebra work. |
| ADM-009 | Done | Yes | Server-side sorting + pagination complete with URL-persisted sort/page/pageSize and fetch skeleton state. |
| ADM-010 | Done (User-confirmed) | Yes | Inline expandable row now includes 2x2 detail panel, split-payment segment cards, adjustment/reversal details, loading spinner, and copy actions. |
| ADM-011 | Done (Ready for QA) | After QA | Timeline section added with event icons, status transitions, relative+absolute timestamp behavior, and collapsible raw JSON per event. |
| ADM-012 | Done (Ready for QA) | After QA | Full order breakdown now includes all order items, modifiers, void/open/tax-exempt flags, order-level discounts, and totals row. |

---

## What Is Implemented Now (Cross-ticket)

1. Manage transactions core
- Global transactions table with filters, search, row actions, export, pagination.
- Card brand visuals now reuse dashboard payment card icon component.
- Manual refresh button added.
- Server-side sortable headers wired for `Order #`, `Total`, and `Date` with URL-persisted sort state.
- Added remaining ADM-008 table UX items: `Walk-in` customer fallback, Entry/Subtotal/Tax/Tip/Discount/Staff columns, column visibility menu (default hidden: Entry/Tax/Discount/Staff), sticky header, zebra rows.
- Completed ADM-006 remainder: staff filter (searchable), filter URL persistence verification, and 300ms debounced re-fetch behavior.
- Completed ADM-009: Previous/Next pagination, page input, "Showing x-y of z", page size selector (25/50/100), server-side sorting, page reset on search/filter/sort/page-size changes, and loading skeleton during refetch.

2. Detail and actions
- Transaction detail is now inline expandable (one row at a time) with a 2x2 payment detail grid.
- Added split-payment segment rendering and adjustment/reversal details (void/return/refund/tip-adjustment).
- Added payment timeline section with event icons, status transitions, relative+absolute timestamp behavior, and raw JSON collapsible.
- Added full order breakdown section for all order items with:
  - item size/qty/unit/subtotal/tax/discount
  - modifier breakdown under each item
  - void/open-item/tax-exempt indicators
  - order-level discounts and totals row
- Refund action from row menu with confirmation and refresh.

3. Data/query layer
- View-first data path (`vw_platform_transactions`) with legacy fallback.
- Aggregate stats action for cards based on full filtered dataset.
- Added backend migrations for ADM-002/004/005:
  - `supabase/migrations/022_adm_002_admin_rls.sql`
  - `supabase/migrations/023_adm_004_admin_transactions_rpc.sql`
  - `supabase/migrations/024_adm_005_admin_transaction_detail_rpc.sql`
- Updated `app/manage/actions/hq-platform/transactions.ts` to:
  - call `get_admin_transactions` RPC first (with legacy/view fallback),
  - call `get_admin_transaction_detail` RPC first for expanded row details (with legacy fallback).

## Data Volume Note (1119 -> 200)

Date recorded: 2026-02-17

Observed change:
- Transaction total shown in manage transactions dropped from `1119` to `200`.

Why this happened:
1. **ADM-002 scoping is now active**:
- Results are restricted to merchants returned by `get_admin_merchant_ids()` (via `admin_merchant_access`) unless the user is `hq.super_admin`.
2. **ADM-004 default payment-status behavior**:
- When no `paymentStatus` filter is selected, query defaults exclude `pending` and `failed` payments.

Net effect:
- The new total (`200`) reflects **assigned-merchant scope + non-pending/non-failed statuses**, not data deletion.

---

## Recommended Next Execution Order

1. Apply DB migrations `022`, `023`, `024` in dev/staging.
2. Run QA for ADM-002/004/005 using scoped admin and super-admin test users.
3. Scratch ADM-011 and ADM-012 after final UI data verification.

---

## Already Safe To Scratch Off

1. ADM-001
2. ADM-003
3. ADM-007
4. ADM-006
5. ADM-008 (user-confirmed)
6. ADM-009
7. ADM-010 (user-confirmed)

## QA Before Scratching (ADM-011 / ADM-012)

1. Expand a transaction and confirm `Payment Timeline` renders at least one event with icon, `old -> new` status, relative timestamp, and absolute timestamp on hover.
2. Open `Raw response JSON` on one event and verify it expands/collapses correctly.
3. In `Order Breakdown (All Items)`, verify at least one item shows expected qty/unit/subtotal and any available modifiers.
4. Confirm voided/open-item/tax-exempt badges appear correctly where data exists.
5. Confirm `Order-level Discounts` and totals row values match order totals shown in POS data.
