# Recognized-Order Canonical Predicate — Reporting Consistency Fix

## Problem (locked spec)
No single definition of a reportable order. Two wrong filters in use:
- **Undercount:** surfaces gating on `status = 'completed'` miss paid-but-not-manually-completed orders (~68% of orders / ~47% of revenue hidden).
- **Overcount:** analytics RPCs use `status NOT IN ('draft','cancelled','void')` with NO payment gate → unpaid open checks counted as revenue.

## Canonical "Recognized Order" predicate (locked)
```
payment_status IN ('paid','captured')
AND status NOT IN ('draft','cancelled','void','refunded')
```
- Volume AND revenue share this one gate.
- Refunds netted via existing dedicated refunds calc, NOT this gate.
- `captured` retained only for 188 legacy Dec-2025 orders.
- Operational views (KDS, active-orders) OUT OF SCOPE.

## Decisions confirmed with user
- Scope: **Full canonical sweep** (every public.orders reporting surface).
- Online report: **Add first-party online channel** (public.orders order_type='online') alongside OrderOut, gated by canonical predicate — fixes Charcoal Gardenia $0 repro.

---

## Plan

### Phase 1 — SQL source of truth (new migration)
File: `supabase/migrations/<ts>_recognized_order_predicate.sql`
1. `is_order_reportable(order_status, payment_status) RETURNS boolean` — IMMUTABLE, PARALLEL SAFE, `SET search_path=''`, body = locked predicate.
2. Partial index `idx_orders_reportable` on `(merchant_id, location_id, created_at)` WHERE the predicate. `CREATE INDEX CONCURRENTLY` can't run in a txn — put in its own migration file and flag for reviewer.
3. Rewrite RPCs to add the payment gate (use `is_order_reportable(status, payment_status)`):
   - `get_financial_kpis` — summary, daily_stats, best_sellers, order_types (4 blocks). Leave refunds subquery as-is.
   - `get_sales_by_item_report`
   - `get_top_performing_merchants` (no location param; uses now()-interval) — add payment gate.
   - Review `get_cash_flow_report` / `get_voids_report` — gate on `op.status`/`refunded_amount`, not order status; confirm no change needed. Flag `authorized` ≠ settled in cash flow but leave (out of scope).

### Phase 2 — TS query layer (app/dashboard/actions/order-analytics.ts)
Add shared helper:
```ts
// Mirror of SQL is_order_reportable — recognized-order gate for all reporting queries.
function applyReportablePredicate<T>(q: T): T {
  return (q as any)
    .in("payment_status", ["paid", "captured"])
    .not("status", "in", "(draft,cancelled,void,refunded)");
}
```
Apply to EVERY `.from("orders")` reporting query (~139, 278→canonical, 323, 392, 465, 529, 821, 1266, 1411, 1639, 1745, 1846, 1863 [orders!inner via .not("orders.status"...)], 1948, 2024). Replace `.eq("status","completed")` and bare `.not("status","in",...)` with the helper. Redefine `completedOrders`/`avgOrderValue` (GetOrderStats ~552) over the recognized set. Remove dead `status === 'refunded'` branch (~1990) if redundant after exclusion.

### Phase 3 — Admin merchants "today" cards (app/manage/actions/merchants.ts ~325-341)
- `orders_today`: drop overcount filter → canonical predicate.
- `revenue_today`: drop `status === 'completed'` undercount → sum recognized rows.
- Single filtered query feeds both.

### Phase 4 — Online Ordering report (first-party channel)
`app/dashboard/actions/online-ordering-analytics.ts` currently reads ONLY `orderout_orders`. Add a first-party branch: public.orders WHERE order_type='online' + canonical predicate, aggregate as a synthetic platform merged into `platforms`/`dailyTrends`/totals. Verify 4 tiles + Revenue-by-Platform render non-zero for repro merchant.

### Phase 5 — Verify
- `npm run lint` + `npm run test`.
- Grep: no remaining `status = 'completed'` revenue gate or payment-less `NOT IN (draft,cancelled,void)` on reporting surfaces.
- Cross-check same merchant/date agrees across Admin card, dashboard tiles, Online Ordering report.
- Read-side only; no payment-write RPC touched; no backfill.

## Adjacent bug (NOT in scope — file separately)
`process_order_payment()` already-paid guard checks `= 'captured'` (retired) → never fires for `paid`, double-pay window.

## Review

### Delivered
**SQL (Phase 1)** — two new migrations:
- `20260626000000_recognized_order_predicate.sql`: `is_order_reportable(order_status, payment_status)` IMMUTABLE helper; rewrote `get_financial_kpis` (4 blocks), `get_sales_by_item_report`, `get_top_performing_merchants` to use it. Left `get_cash_flow_report`/`get_voids_report` (payment-domain, not order status) with a note that cash flow's `authorized` ≠ settled.
- `20260626000001_recognized_order_index.sql`: `idx_orders_reportable` partial index, `CREATE INDEX CONCURRENTLY` (own file, repo convention).

**TS single source of truth** — `lib/reporting/recognized-order.ts`: `applyReportablePredicate(query, prefix?)` (query-builder) + `isOrderReportable(row)` (in-memory) + exported constants. Typed loosely internally to avoid TS2589 on deep PostgREST chains.

**Merchant surfaces (Phase 2)** — `app/dashboard/actions/order-analytics.ts` (~13 queries), `app/dashboard/actions/tax-reporting.ts` (4), `app/dashboard/online-ordering/actions.ts` QR analytics (2). `GetSalesSummaryReport` + admin equivalents re-source refunds from `order_payments` so refunds aren't lost when `refunded` orders drop out of the gate.

**Admin/HQ surfaces (Phase 3)** — `app/manage/actions/merchants.ts` (today cards), `hq-platform/{tax-report,analytics,dashboard}.ts`, `admin-merchant/{analytics,orders,transactions}.ts`. Revenue/volume aggregates gated; deliberately LEFT ungated: void-rate denominator, void/refund anomaly report, operational order lists/detail, live event feeds, KDS status, and write mutations.

**Online report (Phase 4)** — `online-ordering-analytics.ts` no longer early-returns when a merchant has no OrderOut rows; adds a first-party `order_type='online'` channel ("Online Store (Direct)") gated by the predicate. Fixes the Charcoal Gardenia $0 repro.

### Verification
- `tsc --noEmit`: zero errors in any changed file (repo has 682 pre-existing errors, ignored at build per CLAUDE.md).
- `vitest`: no failure attributable to these changes — all failures are pre-existing (menu cascade-labels, storefront a11y, and `tests/orders.test.ts` which throws on missing Supabase env vars, 3 tests skipped).
- Grep sweep: remaining `status NOT IN (draft,…)` on orders are only the intentional void/refund-rate queries; remaining `status='completed'` is KDS item status, not order status.
- All added imports verified used.

### Not applied / follow-ups
- **Migrations NOT applied to any remote DB** — files written only; awaiting user's migration flow.
- Adjacent bug (separate ticket): `process_order_payment()` already-paid guard checks retired `= 'captured'` → double-pay window.
- `get_cash_flow_report` counts `authorized` (unsettled) — flagged, out of scope.
- `GetTransactionVolumeReport` (payment-event counts) and platform order-heatmap/live-event feeds left as operational by design.
