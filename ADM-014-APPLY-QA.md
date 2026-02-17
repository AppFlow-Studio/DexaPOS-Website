# ADM-014 Apply + QA Runbook

Last updated: 2026-02-17

## 1) Apply Migration

Run this SQL file in Supabase SQL Editor (dev/staging first):

1. `supabase/migrations/028_adm_014_merchant_breakdown_rpc.sql`

## 2) Post-Apply DB Smoke Check

```sql
select proname
from pg_proc
where proname = 'get_admin_merchant_breakdown';
```

Expected:
- 1 row returned (`get_admin_merchant_breakdown`).

## 3) App QA Checklist

Route:
- `/manage/transactions`

Checks:
1. New section appears below summary cards: `Merchant Breakdown`.
2. Section is hidden by default and opens with `Show` toggle.
3. Table columns include:
- Merchant Name
- Location Count
- Transaction Count
- Card Revenue
- Cash Revenue
- Total Revenue
- Avg Ticket
- Tip Total
- Void Count
- Void Rate %
- Trend (sparkline)
4. Sorting:
- Click each column header and verify asc/desc sorting works.
5. Sparkline:
- Each row shows a daily revenue trend line when trend data exists.
6. Filter response:
- Changing date range in transactions filters updates merchant breakdown data.
- Merchant/location/payment-status filter changes also update breakdown data.
7. Empty state:
- For filters with no data, section shows `No merchant data available for this period.`
8. Migration fallback behavior:
- If migration 028 is missing, section should show empty data without breaking page.

## 4) Scratch Guidance

After migration apply + QA pass:
- ADM-014 can be scratched.
