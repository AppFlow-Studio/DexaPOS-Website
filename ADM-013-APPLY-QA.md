# ADM-013 Apply + QA Runbook

Last updated: 2026-02-17

## 1) Apply Migration

Run this SQL file in Supabase SQL Editor (dev/staging first):

1. `supabase/migrations/026_adm_013_admin_transaction_summary_rpc.sql`

## 2) Post-Apply DB Smoke Check

```sql
select proname
from pg_proc
where proname = 'get_admin_transaction_summary';
```

Expected:
- 1 row returned (`get_admin_transaction_summary`).

## 3) App QA Checklist

Route:
- `/manage/transactions`

Checks:
1. Top section shows 6 cards:
- Total Transactions
- Card Revenue
- Cash Revenue
- Total Revenue
- Avg Tip
- Voided/Returned
2. Card values change when filters/search/date range change.
3. Total Transactions subtext shows `% change vs previous period`.
4. Revenue cards:
- Card/Cash revenue reflect captured payments only.
- Total revenue split text shows `Card % / Cash %`.
5. Avg Tip card:
- Main value is average tip amount.
- Subtext shows average tip percent.
6. Voided/Returned card:
- Main value shows count and amount.
- Subtext shows void rate percent.
7. Click-card behavior:
- Total Transactions: clears `method` filter only.
- Card Revenue and Avg Tip: toggle card-family methods.
- Cash Revenue: toggle `cash`.
- Total Revenue: clears `method`.
- Voided/Returned: toggle `paymentStatus=void,refunded,partially_refunded`.
- In all cases `page` resets to `1`.
8. If migration 026 is not applied, cards show:
- `Summary unavailable (apply migration 026)`.

## 4) Scratch Guidance

After migration apply + QA pass:
- ADM-013 can be scratched.
