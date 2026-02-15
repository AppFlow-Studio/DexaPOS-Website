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
| ADM-006 | Partial | No | Advanced filter panel implemented; `Staff` filter and exact debounce behavior from AC are still pending. |
| ADM-007 | Done | Yes | Global search bar + URL sync + debounce + highlight + clear + keyboard shortcut implemented. |
| ADM-008 | Partial | No | Remaining UI set completed: Customer/Entry/Subtotal/Tax/Tip/Discount/Staff columns, column visibility toggle defaults, sticky header, alternating rows. Keep partial until final ticket-wide QA/spec pass. |
| ADM-009 | Partial | No | Pagination exists; sorting currently client-side in manage table (not full server-side sort contract + page size selector + URL sort persistence). |
| ADM-010 | Not started (spec parity) | No | Current behavior is side drawer, not inline expandable row with full 2x2 layout/copy actions. |
| ADM-011 | Not started | No | Payment event timeline UI not implemented. |
| ADM-012 | Partial | No | Basic items shown in detail view, but full modifier/void/open-item/tax-exempt/order-discount breakdown is incomplete. |

---

## What Is Implemented Now (Cross-ticket)

1. Manage transactions core
- Global transactions table with filters, search, row actions, export, pagination.
- Card brand visuals now reuse dashboard payment card icon component.
- Manual refresh button added.
- Client-side sortable headers added for `Order #` and `Date`.
- Added remaining ADM-008 table UX items: `Walk-in` customer fallback, Entry/Subtotal/Tax/Tip/Discount/Staff columns, column visibility menu (default hidden: Entry/Tax/Discount/Staff), sticky header, zebra rows.

2. Detail and actions
- Transaction detail side sheet (not inline expansion) with order/payment/context sections.
- Refund action from row menu with confirmation and refresh.

3. Data/query layer
- View-first data path (`vw_platform_transactions`) with legacy fallback.
- Aggregate stats action for cards based on full filtered dataset.

---

## Recommended Next Execution Order

1. ADM-002 (RLS + access enforcement)
2. ADM-004 (formal admin transactions RPC contract)
3. ADM-005 (formal transaction detail RPC contract)
4. ADM-006 remaining items (Staff filter + exact debounce semantics)
5. ADM-009 (server-side sorting/page-size/URL sort)
6. ADM-010, ADM-011, ADM-012

---

## Already Safe To Scratch Off

1. ADM-001
2. ADM-003
3. ADM-007
