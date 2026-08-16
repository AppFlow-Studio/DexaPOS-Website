# Merchant Backend Pagination

**Status:** Implementation complete for four safe merchant lists; authenticated manual QA pending
**Branch:** `feat/merchant-pagination`
**Database migration:** None

## Purpose

Large merchant lists must not fetch an entire tenant dataset and paginate it in
the browser. This work introduces one pagination contract and applies it first
to high-growth merchant surfaces whose row queries can be separated safely
from page-level metrics: Orders, Customers, Invoices, and Discounts.

## Implemented

### Shared contract

- A normalized page contract clamps page size to `1..100` and defaults to 25.
- Server actions return rows plus exact `total`, `totalPages`, and next/previous
  state.
- A responsive pagination bar is shared by merchant list pages.
- React Query retains the previous page while the next page is loading.

### Customers

- The default customer directory uses Postgres `range()` and an exact count.
- Name, email, and phone search runs before pagination in Postgres.
- Sorting is deterministic, with customer ID as a stable tie-breaker.
- Page state is stored in `?page=` and resets when search changes.
- `?customerId=` deep links still open a profile even when that customer is not
  in the current page.
- Existing location-specific aggregation remains compatible, but it still
  aggregates that location's orders before slicing. The current Customers page
  remains merchant-wide and does not invoke that branch.

### Orders

- The order list uses an exact-count query and a 25-row Postgres range.
- Order number/customer search runs in Postgres before pagination.
- Date, status, type, channel, platform, staff, amount, and payment-method
  filters run before pagination.
- Payment-method filtering now uses an inner embedded payment relation instead
  of filtering a fetched page in JavaScript.
- Date, ID, status, and total sorting operate on the complete filtered dataset.
- The table's original client search/sort/pager remains the default for other
  consumers; the merchant Orders page opts into server mode.
- KPI cards use a separate narrow projection instead of fetching a second copy
  of every order with items, modifiers, and payments.
- Page state is stored in `?page=` and resets when filters, search, or sorting
  change.

### Invoices

- The invoice list uses an exact-count query and a 25-row Postgres range.
- Status and location filters run before pagination.
- Date ordering is deterministic, with invoice ID as a stable tie-breaker.
- Page state is stored in `?page=` and resets when the status tab changes.
- Existing invoice KPI cards remain database-authoritative through their
  separate aggregate RPC and therefore are not reduced to the visible page.

### Discounts

- Discount rows use exact-count server pagination after location, active-state,
  expiry, search, and sort filters are applied.
- Sorting is deterministic, with discount ID as the final tie-breaker.
- Search is debounced and page state is stored in `?page=`.
- Filter, search, and sort changes reset to page 1; invalid pages self-correct
  after mutations or filtering.
- KPI tiles use a separate location-scoped narrow projection so they describe
  all discounts rather than only the visible page.
- React Query optimistic status updates are constrained to list caches and no
  longer risk treating the stats payload as a list.

## Pagination Audit

| Surface | Decision | Reason |
| --- | --- | --- |
| Orders | Implemented | High growth and previously fetched nested full history |
| Customers | Implemented | High growth and previously loaded all active customers |
| Audit Logs | Already server-paginated | Existing count/range contract |
| Disputes | Already server-paginated | Existing count/range contract |
| Support | Already server-paginated | Existing action contract |
| Tax report | Already server-paginated | Existing report contract |
| Payments / Transactions | Follow-up | Current summaries and filters depend on the full client dataset; paginate only with separate aggregate contracts |
| Invoices | Implemented | KPIs already use a separate aggregate RPC, so visible rows can be paginated safely |
| Timesheets | Follow-up | Requires date/employee aggregates independent of visible rows |
| Discounts | Implemented | Row query is isolated; KPI tiles now have a separate scoped stats query |
| Inventory | Follow-up | Stock/category filters and location override resolution still depend on the full item set |
| Devices | No current need | Device inventory is low-cardinality and activity is already independently bounded |
| Menus / Categories / Modifiers | Do not paginate current reorder views | Drag-and-drop and contiguous display order require the complete ordered collection |
| Locations / Stations / Cash Drawers | No current need | Low-cardinality operational lists |
| Reservations | No current need | Naturally bounded by selected business day |

## Files

- `types/pagination.ts`
- `lib/pagination.ts`
- `lib/__tests__/pagination.test.ts`
- `components/dashboard/PaginationBar.tsx`
- `app/dashboard/actions/customers.ts`
- `app/dashboard/customers/hooks/useCustomers.ts`
- `app/dashboard/customers/page.tsx`
- `app/dashboard/actions/order.ts`
- `app/dashboard/hooks/useOrder.ts`
- `app/dashboard/orders/page.tsx`
- `components/dashboard/orders/OrderFilters.tsx`
- `components/dashboard/orders/OrdersDataTable.tsx`
- `types/order-management.ts`
- `app/dashboard/actions/invoices.ts`
- `app/dashboard/invoices/hooks/useInvoices.ts`
- `app/dashboard/invoices/page.tsx`
- `app/dashboard/actions/discounts.ts`
- `hooks/use-discounts.ts`
- `app/dashboard/discounts/page.tsx`

## Automated Verification

- Pagination utility tests: 3 passed.
- Targeted ESLint: no errors; the existing TanStack Table React Compiler warning
  remains.
- `npm run build`: passed on Next.js 16.2.12 (118 routes generated).
- `git diff --check`: passed.
- Full repository type checking is currently blocked by unrelated baseline
  errors, including duplicate legacy declarations in `types/order-management.ts`.
- Playwright was not installed. Authenticated browser storage and test merchant
  credentials are required before browser automation adds value.

## Manual QA

### Customers

1. Sign in as a merchant with more than 25 customers.
2. Open `/dashboard/customers` and confirm only 25 rows render.
3. Select Next and confirm `?page=2`, a new row set, and a correct total/range.
4. Reload page 2 and confirm it remains on page 2.
5. Search for a customer known to be outside page 1 and confirm the result is
   found and pagination resets to page 1.
6. Open a customer from global search using `?customerId=<id>` and confirm the
   profile opens even when the customer is not in the visible page.
7. Test desktop, tablet, and phone widths.

### Orders

1. Open `/dashboard/orders` for a merchant with more than 25 orders.
2. Confirm only 25 orders render and Next changes `?page=` and the row set.
3. Search by display/order number and customer name; confirm matches can be
   found outside the original page and page resets to 1.
4. Sort Date, ID, Status, and Total; move to page 2 and confirm order remains
   globally sorted rather than sorting each page independently.
5. Apply each existing filter, especially Payment Method, and confirm the total
   and pages represent only matching orders.
6. Clear filters and confirm all-channel behavior returns.
7. Open an order on page 2 and verify details, receipt, refund, and void actions
   still receive the complete order payload.
8. Confirm KPI cards remain stable when changing table-only filters and page.
9. Test desktop, tablet, and phone widths.

### Invoices

1. Open `/dashboard/invoices` for a merchant with more than 25 invoices.
2. Confirm only 25 rows render and Next changes `?page=` and the row set.
3. Reload page 2 and confirm it remains on page 2.
4. Select Draft, Sent, Paid, and Overdue tabs; confirm each resets to page 1
   and the total/pages represent that status only.
5. Change the dashboard location and confirm invoice rows and totals use that
   location while KPI cards remain correct.
6. Open, send/resend, mark paid, cancel, and delete an invoice from page 2.
7. Confirm mutations refresh the current list and KPI cards without leaving an
   invalid empty page.
8. Test desktop, tablet, and phone widths.

### Discounts

1. Open `/dashboard/discounts` for a merchant with more than 25 discounts.
2. Confirm only 25 rows render and Next updates `?page=2` with a different row set.
3. Reload page 2 and confirm the same page remains selected.
4. Search for a discount outside page 1 and confirm search resets to page 1 and
   finds it through the server query.
5. Test Active/Inactive, Hide expired, sort field, and sort direction controls;
   each must reset to page 1 and update the exact total.
6. Confirm Total, Active, Scheduled, and Expired tiles do not change when moving
   between pages or applying table-only filters.
7. Toggle, edit, and delete a discount on the last page; confirm rows, totals,
   and page bounds refresh without leaving an invalid empty page.
8. Switch between All Locations and a location for a multi-location merchant;
   confirm rows and KPI tiles use the same scope.
9. Test desktop, tablet, and phone widths.

## Remaining Work

- Perform authenticated manual QA above, including the newly added Discounts flow.
- Design separate aggregate endpoints before paginating Payments, Transactions,
  and Timesheets. Paginating their current arrays without that work
  would make totals and client-side filters incorrect.
- Redesign Inventory filters and effective-stock resolution as a paginated SQL
  contract before paging its catalog; client slicing would be incorrect.
- Consider an aggregate RPC for Orders KPI cards if all-time order volume makes
  the narrow overview projection too large.
- Add Playwright only after a reusable authenticated merchant fixture is agreed;
  do not add it solely for this ticket.
