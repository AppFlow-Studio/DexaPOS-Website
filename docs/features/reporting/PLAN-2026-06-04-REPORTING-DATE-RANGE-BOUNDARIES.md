# Reporting Date Range Boundaries And Loading State

## Ticket

Charcoal Gardenia pilot reporting defects covering wrong date-filter results, distorted daily charts, picker desync, and loading states that hang on skeletons.

## Scope

- Merchant dashboard reporting surfaces
- Backend RPC date-boundary contract
- Frontend date-range utility, query state handling, chart gap-fill, and picker draft/applied state
- Discrepancy report reconciliation is included in this stream

## Important Callout

This is not a quick fix ticket.

It is a cross-cutting backend + frontend stream and should stay separate from modifier and QR work.

## Ground Truth

### Confirmed backend targets

- `get_financial_kpis`
- `get_cash_flow_report`
- `get_sales_by_item_report`
- `get_voids_report`

### Confirmed backend issue

- `get_financial_kpis` still uses inclusive `BETWEEN`
- daily buckets still use `AT TIME ZONE 'UTC'`

### Confirmed note to treat carefully

- The pasted ticket groups `detect_schedule_conflicts` into the same bug family.
- The actual repo SQL shows schedule-overlap logic there, not the same reporting aggregation path.
- Do not change that function blindly from the pasted note alone.

## Locked Decisions

1. Boundary contract
- Use half-open windows: `>= start AND < end_exclusive`
- Client sends UTC instants derived from store-local day boundaries

2. Timezone contract
- Use each location's own `locations.timezone`
- All-locations views aggregate per location-local calendar day

3. UI state contract
- Skeleton only for real loading
- Disabled or invalid query states must not look like loading forever
- Picker draft state and applied state must reconcile cleanly

## Planned Work

### Backend track

- Convert reporting RPC filters from inclusive `BETWEEN` to half-open boundaries
- Rework local-day bucketing in `get_financial_kpis`
- Audit discrepancy aggregation for mismatched windows or fan-out

### Frontend track

- One shared timezone-aware date-range utility
- Fix query state machine so disabled/error/empty/loading are distinct
- Zero-fill daily chart series
- Fix picker draft vs applied desync

## Status

- Ticket documented
- Backend migration drafted locally for half-open date boundaries and local-day financial buckets
- Frontend reporting utility now exists locally:
  - `lib/reporting/date-range.ts`
  - `app/dashboard/hooks/useReportingDateRange.ts`
- Frontend pages using the migrated report RPCs now consume the shared reporting range:
  - `app/dashboard/transactions/page.tsx`
  - `app/dashboard/reports/financials/page.tsx`
  - `app/dashboard/reports/discrepancy/page.tsx`
  - `app/dashboard/reports/voids/page.tsx`
  - `app/dashboard/reports/sales-by-items/page.tsx`
  - `app/dashboard/reports/cash-management/page.tsx`
- Dashboard date picker draft/applied state is now unified in:
  - `components/dashboard/orders/DateRangePicker.tsx`
- Financial daily chart inputs are now zero-filled before rendering on the two affected financial chart pages
- Direct-query analytics helpers now use the same half-open end-boundary contract in:
  - `app/dashboard/actions/order-analytics.ts`
- Direct-query daily sales bucketing now uses each order location's timezone in:
  - `GetOrderAnalytics(...)`
  - `GetSalesByDateRange(...)`
- Additional reporting consumers now use the corrected range or filled daily series:
  - `app/dashboard/reports/page.tsx`
  - `app/dashboard/orders/analytics/page.tsx`
  - `app/dashboard/page.tsx`
- Modifier work remains separate

## Remaining Frontend Work

- Audit any non-reporting direct-query analytics helpers outside the ticket surface
- Manual QA:
  - picker draft/apply/cancel behavior
  - single-day last-day inclusion
  - zero-gap chart rendering
  - discrepancy denominator reconciliation

## QA Later

- Single-day local boundary checks
- last-day inclusion checks
- zero-day chart gap-fill checks
- stuck-skeleton regression checks
- picker trigger/highlight/footer consistency checks
- discrepancy reconciliation checks
