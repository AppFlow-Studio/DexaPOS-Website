# ADM-016 Apply + QA Runbook

Last updated: 2026-02-17

## 1) Apply Migration

Run this SQL file in Supabase SQL Editor (dev/staging first):

1. `supabase/migrations/027_adm_016_batch_reconciliation_rpc.sql`

## 2) Post-Apply DB Smoke Checks

```sql
select proname
from pg_proc
where proname in ('get_admin_settlement_batches', 'get_admin_settlement_batch_payments')
order by proname;
```

Expected:
- 2 rows returned.

Optional quick data check:

```sql
select *
from public.get_admin_settlement_batches(null, null, null, null, 10);
```

## 3) App QA Checklist

Route:
- `/manage/transactions`

Checks:
1. A new section appears: `Batch Reconciliation`.
2. Batch list columns include batch id, merchant/location, business date, opened/closed times, transaction count, gross/tip/refund/net deposit, status.
3. Filters work:
- Merchant
- Batch status
- Date from / date to (business date)
4. Clicking a batch loads linked `order_payments` detail rows for that batch number.
5. Discrepancy detection:
- Rows with mismatched linked amount vs batch gross show a red discrepancy badge.
- Matched rows show a green matched badge.
6. Export:
- `Export Selected Batch` downloads a CSV with the selected batch + linked payment rows.
7. Refresh button reloads list and selected batch detail.
8. If migration 027 is not applied, section shows fallback warning mentioning migration 027.

## 4) Scratch Guidance

After migration apply + QA pass:
- ADM-016 can be scratched.
