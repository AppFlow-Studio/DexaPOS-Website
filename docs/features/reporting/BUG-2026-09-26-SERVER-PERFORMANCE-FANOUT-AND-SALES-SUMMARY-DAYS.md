# Server Performance totals inflated; Sales Summary days shifted

- Reported: 2026-09-26, prod, merchant `460 BREAD AND BUTTER CORP`
  (`d2dee4f2-9ed3-4aac-a512-4226fa17b512`), `/dashboard/orders/reports`
- Status: `code_complete_migration_not_applied`

## 1. Server Performance — join fan-out in `get_staff_performance_stats`

### Symptom

Sep 19 – Sep 26: one server shown with **17,004 orders / $154,396.32 sales /
$12,431.64 tips**. The Payments page shows 251 payments / $3,284.39 for a whole
month.

### Root cause

`leaderboard_data` joined `staff_order_data` (one row per order) to
`staff_tips_data` (one row per payment) on `staff_id` alone. With N orders and M
payments for a staff member every order repeats M times and every tip N times.

| Reported | Real | Multiplier |
|---|---|---|
| 17,004 orders | 78 | x 218 payments |
| $154,396.32 sales | $708.24 | x 218 payments |
| $12,431.64 tips | $159.38 | x 78 orders |

`avg_check_size` and `avg_tip_pct` were unaffected (uniform duplication cancels
in an average), which is why only the totals looked wrong.

Second issue underneath: 138 of the 216 orders were kiosk orders with no
`assigned_server_id` / `created_by_staff_id`, while their payments carried the
`processed_by_staff_id` of whoever was logged into the kiosk. Sales were
attributed by order, tips by payment, so a server's tips and sales described
different sets of orders.

### Fix

Migration `20260928130000_fix_staff_performance_stats_fanout.sql`
(rollback in `supabase/migrations/rollback/`):

- Payments are rolled up to one row per order before joining.
- Gate is the canonical `is_order_reportable(status, payment_status)` — this RPC
  was missed by the recognized-order sweep and still counted unpaid open checks.
- One staff member per order: `COALESCE(assigned_server_id, created_by_staff_id)`,
  the same rule as the Tips module (`app/dashboard/actions/tips.ts`).
- Tips follow the order, not `processed_by_staff_id`.
- New additive `unattributed` array: recognized orders nobody rang up, by
  channel. Leaderboard + unattributed reconciles to recognized sales.
- `orders_created` uses `COUNT(DISTINCT ...)`; split payments inflated it.

Response shape is otherwise unchanged. Still `SECURITY INVOKER`; grants untouched.

Web: `lib/reporting/server-performance.ts` appends a `"<Channel> (no server)"`
row per unattributed channel. Top Server is picked among staff only; Total Tips
sums every row. The analytics page cards read `leaderboard` and are unchanged.

### Verification (read-only, prod data)

The exact function body was run on prod as a session-local `pg_temp` function
(nothing persisted) for Sep 19 – Sep 26:

| Row | Orders | Sales | Tips |
|---|---|---|---|
| Sadem Awawdeh | 76 | $703.89 | $0.00 |
| Kiosk (no server) | 138 | $2,323.32 | $159.38 |
| Total | 214 | $3,027.21 | $159.38 |

Matches an independent query of recognized orders for the window: 214 orders,
`SUM(total_amount)` = $3,027.21, tips = $159.38.

## 2. Sales Summary — day rows one day early, bucketed in UTC

### Symptom

Aug 28 – Sep 26: totals were right ($2,901.94 net, 238 orders) but every row was
labelled one day early — prod has 7 orders / $88.00 on Wed Sep 2; the report said
Tue Sep 1.

### Root causes

1. **Label** — the client did `new Date("2026-09-02")`, which is UTC midnight and
   renders as Sep 1 in any timezone west of UTC.
2. **Bucketing** — the server keyed rows by `toISOString().split("T")[0]` (UTC
   day). Orders after 8 PM New York time landed on the next day: 4 orders /
   $30.91 in this range. Sep 24 showed 3 orders / $22.47 instead of 5 / $35.44.

The two errors partly masked each other.

### Fix

- `parseReportDateKey()` in `lib/reporting/date-range.ts` parses the key as a
  calendar day; used by `SalesSummaryReport.tsx`.
- `GetSalesSummaryReport` keys orders and refunds by the location's timezone via
  the existing `getLocationTimezoneMap` / `getLocalDateKey`.
- `GetSalesSummaryReport` now pages its queries (`fetchAllReportRows`). PostgREST
  caps a response at `max_rows` (1000 in `supabase/config.toml`, and the hosted
  default), so an unpaged query silently drops rows. One prod merchant already
  has 1,189 recognized orders in 30 days; Bread & Butter reaches 1,000 in about a
  week at ~100 orders/day.

## Tests

- `lib/reporting/__tests__/server-performance.test.ts`
- `lib/reporting/__tests__/date-range.test.ts`
- `tests/staff-performance-stats-fanout-migration.test.ts`

`npx vitest run` on these plus `order-channel.test.ts`: 4 files, 19 tests passed.
ESLint clean on changed files; no TypeScript errors in changed files.

## Rollout

- [x] Migration + rollback written
- [x] Function body verified against prod data (read-only)
- [x] Prerequisites confirmed on staging (`is_order_reportable`,
      `normalize_order_source`, `staff_profiles.display_name`); staging has the
      same fan-out definition
- [ ] Apply `20260928130000` to staging
- [ ] Manual QA on staging: Server Performance + Analytics > Staff cards
- [ ] Apply to prod
- [ ] Deploy web (safe before or after the migration: `unattributed` is optional)

## Open findings (not changed here)

1. **Refunds are deducted from sales that were never counted.** The recognized
   gate excludes `payment_status = 'refunded'` orders, so their gross is absent,
   but Sales Summary still subtracts their refund from net. Here: net understated
   by $4.37. The refund amount is also tax-inclusive while gross is pre-tax.
2. **Two `is_order_reportable` overloads disagree.** The 2-arg form excludes
   refunded / partially refunded orders; the 3-arg `(text, text, numeric)` form
   used by `get_sales_by_item_report_v2` includes them. Item Sales and Sales
   Summary can therefore disagree for the same period.
3. **Other unpaged reporting queries** in `app/dashboard/actions/order-analytics.ts`
   have the same 1000-row cap; only Sales Summary was paged here.
4. **Hourly Sales** buckets with `new Date(created_at).getHours()`, i.e. the
   server's timezone (UTC on Vercel), not the location's.
5. **Kiosk tip attribution is a policy choice.** Kiosk tips now sit on the
   `Kiosk (no server)` row. If they should be credited to the staff member logged
   into the kiosk, attribute by `processed_by_staff_id` for kiosk orders.
