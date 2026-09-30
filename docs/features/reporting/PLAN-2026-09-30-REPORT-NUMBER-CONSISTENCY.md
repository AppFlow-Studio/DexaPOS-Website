# Report Number Consistency — one calculation behind every report

- Opened: 2026-09-30, from the Reports-tab UX review (finding #1: "the same number is different on different pages")
- Environment used for evidence: staging branch `dfwqakoyittmrwbqvxgw` (the `staging` branch of prod project `hifouuofcaytijrkbvcy`)
- Reproduction scope: merchant Joes Coffee Shop (`2add44cb-f498-4653-aca3-a8f0ca258e70`), location Uptown Branch
  (`8835e749-9bbf-4405-b4a4-7f28a56f990a`, `America/New_York`), window Aug 30 00:00 → Sep 30 00:00 local
- Status: `applied_on_staging_verified` (branch `fix/report-number-consistency`, not yet committed)
- Staging verification (2026-09-30, browser, Uptown Branch, Aug 31 – Sep 30): Sales Overview net $11,229.70 =
  Financials net $11,229.70 (gross $11,248.57 − discounts $2.85 − refunds $16.02) = Sales by Items net $11,229.70 /
  gross $11,248.57; Voids & Refunds and Discrepancy refunded sales $16.02; Compare Locations ranking $11,249 gross
  (was $71,213); AOV $261.16 = 11,229.70 ÷ 43; Kiosk "−$0.05 / 0 orders" gone. Sales by Items first showed
  $11,229.69 (per-row rounding) — fixed with largest-remainder rounding in `get_sales_by_item_report_v2`, re-applied.
- Migration: `supabase/migrations/20260930150000_report_number_consistency.sql` — the user applies it on
  staging via the SQL editor; nothing is dropped

## 0. Progress log (2026-09-30)

Built:
- SQL: `is_order_sale`, `report_order_money`, `report_sale_orders`, `report_refunds`, `report_item_sales`,
  `assert_report_access`, `get_sales_report`; `get_financial_kpis`, `get_sales_by_item_report_v2`,
  `get_voids_report` rewritten on top (same signatures/shapes, fields added); live-only 3-arg
  `is_order_reportable` committed verbatim.
- Pages: Sales Overview, Financials, Sales by Items, Compare Locations, Order Reports → Sales Summary,
  Tax (summary + range fix), Voids & Refunds, Discrepancy.
- `lib/reporting/recognized-order.ts`: `isOrderSale` / `applySalePredicate` mirror + `tests/sale-order-predicate.test.ts`.

Verified: inline read-only SELECT of the money logic on staging — all 7,109 merchant orders foot
(gross − discount + tax + service charge + tip = collected), no negative discounts; Uptown Branch, same 30 days:
gross $12,248.76 − discounts $2.85 − refunds $16.02 = **net $12,229.89** (was $12,612.32; cash orders at their
real price + mixed-tender discount). Refunds $21.56 (the other $17.18 on the old Voids page were refunds on
voided orders). `tsc` (no new errors), eslint clean, vitest 16/16 on the touched tests.

Not verified yet: the migration compiling on staging (first run is the user's apply) and browser QA after it.

Deviations from the plan, found while building:
- **Net per order = lane total − lane tax − service charge** (capped at gross), discount = gross − net. Reason:
  on discounted orders the bare `subtotal` is already post-discount (e.g. ORD-20260729-S1-0001: card_subtotal
  84, discount 5, subtotal 79), so `subtotal − discount_amount` subtracted the discount twice; and the cash
  lane's discount is not the flat `discount_amount`. Deriving from the stored lane total makes every order foot.
- Refunds use `order_payments.refunded_amount` (dated `refunded_at`) split pro-rata into sales / tax / service
  charge / tip. `order_refund_items` is stored on the card track even for cash orders, and per-payment
  `subtotal_portion`/`tax_portion` are unreliable on split tenders, so neither is used.
- Refunds on voided orders are excluded everywhere (never in gross → must not be subtracted).
- Voids no longer include lines voided as part of a refund on a sale order (already in refunds).
- Sales by Items allocates each order's gross/discount/refund to its lines in proportion, so item totals
  equal Sales Overview exactly; "Unique Items" counts distinct item names.
- Compare Locations: 30-day preset aligned to the other pages (`subDays(now, 30)`); rankings respect the
  selected locations; heatmap weekday/hour in location time.
- Discrepancy: the "% of all orders" rate is removed (mixed populations); "Total Net Impact" / "Revenue lost"
  replaced by "Refunded Sales" = the Financials refunds line.

## 1. Problem (every number reproduced to the cent with read-only SQL)

Same merchant, same location, same 30 days — the report pages disagree:

| Metric | Page A | Page B | Verified cause |
|---|---|---|---|
| Revenue | Sales Overview **$12,612.32** | Sales by Items **$13,630.10** | Two different "paid order" rules exist in the live DB (§2.1). Items admits a partially-paid order ($1,011.50) and refunded orders ($6.28): 12,612.32 + 1,011.50 + 6.28 = **13,630.10** |
| Revenue | Sales Overview $12,612.32 | Compare Locations **$71,213.26** | Comparison has no payment gate: $11,545.57 paid + **$59,667.69 unpaid open checks** (84 %). Also UTC day bounds, ignores the selected location |
| Avg order value | **$345.41** | Revenue ÷ orders = **$307.62** | AOV = Σ`total_amount` (incl. tax + service charge) ÷ 41; revenue = Σ(`subtotal` − `discount_amount`) |
| Refunds | Financials **$6.58** | Voids & Refunds **$38.74** · Order Reports **$21.58** | Three refund definitions: by order date + payment status / by refund date + `refunded_amount>0` / by refund date + payment status |
| Net sales footing | Financials: Gross 12,612.32 − Refunds 6.58 = Net **12,612.32** | Order Reports: 10.25 − 0.05 = **10.20** | Financials never subtracts refunds and drops refunded orders from gross; Order Reports subtracts refunds that include tax + tip from pre-tax sales (→ "Kiosk −$0.05, 0 orders") |
| Cash-order sales | reported **$8,232.97** | actually charged **$7,863.38** | Every surface sums the card-price columns (`subtotal`, `tax_amount`), even for cash-priced orders (+$369.59 overstated) |
| Tax | Financials **$1,154.37** (card tax) | lane-correct tax **$1,121.59** | Same card-price issue; Tax page also defaults to month-to-date |
| Top items | Overview: apeeeeeeeeee 12 sold | Sales by Items: 13 sold | Same two-rule problem as Revenue (the partial order contains one of each) |
| Discrepancy rate | "92.7 % of all orders" | — | 38 affected orders ÷ 41 recognised orders — but 30 of the 38 are `void` orders that are not in the 41 (mixed populations) |

### 2.1 Two live "paid order" rules (schema drift)

```sql
-- 2-arg: used by get_financial_kpis (+ TS mirror lib/reporting/recognized-order.ts)
payment_status IN ('paid','captured') AND status NOT IN ('draft','cancelled','void','refunded')

-- 3-arg (text,text,numeric): exists ONLY in the live DB, no repo migration.
-- Used by get_sales_by_item_report(_v2), get_platform_gmv_by_day, get_avg_ticket_by_day,
-- get_avg_time_to_first_order
status NOT IN ('draft','cancelled','void')
AND payment_status IN ('paid','captured','partial','partially_refunded','refunded')
AND total_amount >= 0
```

### 2.2 Root cause

Every page computes its numbers with its own query and its own formula (RPCs, and JS
aggregation over raw `orders` rows in server actions). There is no shared definition of
gross, discounts, refunds, net, tax or order count, so every page drifts independently.

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| D1 | Report every order at the **price actually charged** (cash-priced orders use the `cash_*` columns) | User, 2026-09-30 |
| D2 | **Refunded orders stay in Gross**; refunds are subtracted on their own line: **Gross − Discounts − Refunds = Net** | User, 2026-09-30 |
| D3 | A refund is recognised on the **date it happened** (`refunded_at`), not the order date | Proposed (standard accounting) |
| D4 | **Partially-paid** orders (`payment_status='partial'`, an open check mid-payment) are **not** sales yet | Proposed — needs sign-off |
| D5 | AOV = Net Sales ÷ Orders (same numerator as Revenue) | Proposed |
| D6 | Existing `is_order_reportable` stays as-is for surfaces outside this change (HQ, operational). This work adds a new rule rather than silently changing callers it does not migrate | Proposed (minimal blast radius) |

## 3. Canonical definitions

**Sale order** (`is_order_sale(status, payment_status)`):
`status NOT IN ('draft','cancelled','void','declined') AND payment_status IN ('paid','captured','partially_refunded','refunded')`

Per sale order, on the **charged lane** (`payment_pricing_mode = 'cash'` → `cash_*`, otherwise card columns; `mixed` →
card ladder with `amount_paid` bridging the cash discount, as in `lib/orders/order-breakdown.ts`):

| Field | Definition |
|---|---|
| Gross sales | lane subtotal |
| Discounts | `discount_amount` (+ mixed-tender cash discount) |
| Tax | lane tax |
| Service charge | `service_charge` (flat on both lanes) |
| Tips | `tip_amount` |
| Local date / hour | `created_at AT TIME ZONE location.timezone` |

**Refund** (one row per refunded payment, dated `refunded_at`): money returned =
`order_payments.refunded_amount`, split into sales / tax / service charge / tip portions — from
`order_refund_items` (`subtotal_refunded`, `tax_refunded`) when present, otherwise pro-rated by the
order's lane breakdown.

**Net sales** = Gross − Discounts − Refunds(sales portion). **Orders** = count of sale orders.
**AOV** = Net ÷ Orders.

**Void** = `order_items.is_voided`, amount from the line's lane subtotal; excludes lines voided as part
of a refund (they are already in Refunds). Voids never reduce sales (they never entered gross).

## 4. Design — one calculation, many views

Two SQL set-returning functions become the only source every report reads:

- `report_sale_orders(p_merchant_id, p_location_ids uuid[], p_start, p_end)` — one row per sale order with the
  normalised columns above (lane gross, discount, tax, service charge, tip, net-before-refunds, local date,
  local hour, order type, channel/source, location).
- `report_refunds(p_merchant_id, p_location_ids uuid[], p_start, p_end)` — one row per refund with its
  portions, local date and staff/reason (falling back to `reversals.reason_code` / `initiated_by`).

Every existing RPC and server action is rebuilt as a `GROUP BY` over these two, so a new report cannot
invent its own formula. Grouping (by day, hour, location, item, channel) stays page-specific; the money
definitions do not.

Item-level reports join `order_items` onto `report_sale_orders` (so they inherit the same order set) and
use the line's lane subtotal.

## 5. Work items

### Phase 0 — close the open questions (read-only SQL, no code)
- [ ] Reconcile refund sources on staging: `order_payments.refunded_amount` ($38.74 / 10 rows) vs `reversals` ($21.62 / 9 rows). Pick the one that matches money actually returned
- [ ] Confirm `order_refund_items` coverage (what share of refunds have line portions)
- [ ] Confirm the `mixed` lane footing on a real mixed order against `getOrderBreakdown`

### Phase 1 — SQL source of truth (one new migration)
- [ ] `is_order_sale(order_status, payment_status)` IMMUTABLE helper
- [ ] `report_sale_orders(...)` and `report_refunds(...)` (STABLE, `SECURITY INVOKER`, `search_path=''`)
- [ ] Rewrite `get_financial_kpis` over them: summary (gross, discounts, refunds, net, tax, service charge, tips, orders, AOV), `daily_stats`, `best_sellers`, `order_types`
- [ ] Rewrite `get_sales_by_item_report_v2` over them (fixes the 3-arg gate for this surface)
- [ ] New `get_location_comparison(...)` returning per-location daily / daypart / hourly / ranking aggregates, replacing the five JS fallbacks
- [ ] Fix `get_voids_report`: lane line amount, exclude refund-driven voids, staff/reason fallback
- [ ] Commit the live 3-arg `is_order_reportable` body into the repo unchanged (ends the drift; HQ callers untouched — D6)

### Phase 2 — TS layer (`app/dashboard/actions/order-analytics.ts` and friends)
- [ ] `lib/reporting/recognized-order.ts`: add the `is_order_sale` mirror next to the existing predicate
- [ ] Sales Overview (`app/dashboard/reports/page.tsx`): previous-period trend from a second `get_financial_kpis` call over the equal-length prior window; Top items from the items RPC
- [ ] Financials (`financials/page.tsx`): render the footing as Gross − Discounts − Refunds = Net; service charge from the same RPC
- [ ] Compare Locations (`location-analytics-fallback.ts`, `comparison/hooks/useComparisonData.ts`): switch to the new RPC; honour selected locations; location-timezone windows
- [ ] Order Reports Sales Summary (`GetSalesSummaryReport`): read the two facts; refunds by sales portion
- [ ] Tax (`tax-reporting.ts`): same sale set and lane as Financials; replace the `setHours(23,59,59)` end with the exclusive end
- [ ] Voids & Refunds / Discrepancy pages: distinct refunded orders; drop the double-counting "Total Net Impact"; rate = affected orders ÷ orders placed, same population

### Phase 3 — verify
- [ ] Read-only SQL: each rewritten function body run inline as a SELECT on staging; totals equal across Overview, Financials, Items, Comparison, Order Reports and Tax for the reproduction scope
- [ ] Footing check: Gross − Discounts − Refunds = Net on every page, to the cent
- [ ] Browser QA of all affected pages (Uptown Branch + All Locations), before/after screenshots
- [ ] `npm run lint`, `npm run test`, targeted `tsc`
- [ ] Unit tests for the TS mirror and the lane resolver

### Phase 4 — hand-off
- [ ] Ordered checklist for the user to apply the migration on staging (the user applies migrations — not done by Claude)
- [ ] Update this document with results and the before/after number table

## 5b. Part 2 — one date range across all report pages (done 2026-09-30)

Problem: each page kept its own range with a different default — 8 pages "Last 30 days" coded as
`subDays(now, 30)` (really 31 days), Order Reports 8 days (and skipped the location-timezone window),
Tax month-to-date, Cash Drawers today, Compare Locations its own pills, Online Ordering in the URL.

Built:
- `stores/report-date-range-store.ts` — `useReportDateRange()`; Zustand persisted to **sessionStorage**
  (kept while the tab is open; a new session starts at "Last 30 days"). Relative presets are stored as the
  preset and recomputed daily; only "Custom range" stores dates.
- `getPresetDates()` exported from `components/dashboard/orders/DateRangePicker.tsx` so the default is the
  picker's own "Last 30 days" (30 days).
- All 12 report pages use it. Order Reports now passes the location-timezone window to its tabs. Online
  Ordering keeps only the platform in the URL (no links passed dates). Compare Locations got the standard
  picker; its Today/Yesterday/7/30 pills are shortcuts onto the shared range. Removed now-unused
  `getDateRangeFromPreset`, `parseDateParam`, `formatDateParam` (each used only in its own file).

Verified in the browser: fresh session → all 12 pages "Sep 1 – Sep 30, 2026"; choosing "Last 7 days" on Tax
→ all 12 pages "Sep 24 – Sep 30" (Compare pill "7 Days" active), survives reload, no page errors.
Uptown Branch Sep 1–30: Sales Overview = Order Reports = Financials = $8,297.24 / 38 orders (= Tax taxable sales).

## 6. Out of scope (found during the review, separate tickets)

- Kitchen Performance: ticket time uses `orders.updated_at − created_at` (avg 6,231 min, median 1,286 min); Y-axis labels clipped (`width={36}`)
- Tax Breakdown "Payment" column empty: filters `order_payments.status = 'paid'`, POS writes `'captured'` (44/44 rows)
- Default date ranges differ per page; duplicate reports (Discrepancy ≈ Voids & Refunds; Cash Management ≈ Cash Drawers); export buttons
- HQ analytics still on the 3-arg rule (`get_platform_gmv_by_day`, `get_avg_ticket_by_day`, `get_avg_time_to_first_order`)
- Outside the Reports tab, still on the old calculation (`GetOrderAnalytics`): dashboard home (`app/dashboard/page.tsx`),
  Orders → Analytics, HQ merchant Overview/Analytics tabs. HQ merchant analytics that call `get_financial_kpis`
  DO pick up the new numbers.
- Financials "Transactions", "Payments" and "Waterfall" tabs and Order Reports tabs other than Sales Summary were not rebuilt.
- Staging branch status is `MIGRATIONS_FAILED` in the Supabase branch list — worth checking before applying anything

## 7. Expected visible impact

Numbers will move. For the reproduction scope: Revenue drops from $12,612.32 toward the charged-lane
net (cash orders −$369.59, minus refunds), and Compare Locations drops from $71,213 to the same net as
every other page. HQ totals are unchanged by this work.
