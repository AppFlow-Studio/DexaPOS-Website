# ADM Official Tickets Status (001-012)
> Last updated: 2026-02-15
> Baseline: compared against your official acceptance criteria list in chat.

---

## Summary Table

| Ticket | Status | Scratch Now? | Notes |
|--------|--------|--------------|-------|
| ADM-001 | Done (User-confirmed) | Yes | You marked it crossed out already. |
| ADM-002 | Not started | No | RLS policy scope work not implemented in this session. |
| ADM-003 | Done (User-confirmed) | Yes | You marked it crossed out already. |
| ADM-004 | Partial | No | Functional list/filter/search endpoint exists, but not as the exact `get_admin_transactions(...)` RPC contract. |
| ADM-005 | Partial | No | Transaction detail is implemented via server action + drawer, but not full RPC output (events/settlement schema parity not complete). |
| ADM-006 | Done | Yes | Advanced filter panel complete including staff searchable dropdown, URL-persisted params, and 300ms debounced filter sync. |
| ADM-007 | Done | Yes | Global search bar + URL sync + debounce + highlight + clear + keyboard shortcut implemented. |
| ADM-008 | Done (User-confirmed) | Yes | You confirmed it scratched after the remaining UI column/sticky/zebra work. |
| ADM-009 | Done | Yes | Server-side sorting + pagination complete with URL-persisted sort/page/pageSize and fetch skeleton state. |
| ADM-010 | Done (Pending QA) | No | Inline expandable row now includes 2x2 detail panel, split-payment segment cards, void/return/tip-adjustment details, loading spinner, and copy actions. |
| ADM-011 | Partial | No | Timeline section added in expanded transaction view with icons, status transitions, relative/absolute time, and collapsible raw JSON; final parity depends on payment_events dataset availability and full field coverage. |
| ADM-012 | Partial | No | Basic items shown in detail view, but full modifier/void/open-item/tax-exempt/order-discount breakdown is incomplete. |

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
- Refund action from row menu with confirmation and refresh.

3. Data/query layer
- View-first data path (`vw_platform_transactions`) with legacy fallback.
- Aggregate stats action for cards based on full filtered dataset.

---

## Recommended Next Execution Order

1. ADM-002 (RLS + access enforcement)
2. ADM-004 (formal admin transactions RPC contract)
3. ADM-005 (formal transaction detail RPC contract)
4. ADM-011
5. ADM-012

---

## Already Safe To Scratch Off

1. ADM-001
2. ADM-003
3. ADM-007
4. ADM-006
5. ADM-008 (user-confirmed)
6. ADM-009
