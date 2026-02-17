# ADM-019 Apply + QA Runbook

Last updated: 2026-02-17

## 1) Apply Migration

Run this SQL file in Supabase SQL Editor (dev/staging first):

1. `supabase/migrations/029_adm_019_admin_payment_audit_logging.sql`

## 2) Post-Apply DB Smoke Check

```sql
select proname
from pg_proc
where proname = 'log_admin_payment_audit_event';
```

Expected:
- 1 row returned (`log_admin_payment_audit_event`).

## 3) App QA Checklist

Route:
- `/manage/transactions`

Checks:
1. Open transactions page and let table load.
- Verify one or more rows in `payment_audit_log` with:
  - `action = 'view_transaction_list'`
  - `resource_type = 'transaction_list'`
  - `success = true`
2. Search by exactly 4 digits (example: `1234`).
- Verify `search_card_last_four` rows are created.
- Verify `fields_accessed` includes `card_last_four`.
3. Expand a transaction row.
- Verify `view_payment_detail` row exists.
- Verify `fields_accessed` includes `card_last_four`, `auth_code`, `emv_data`.
4. Export CSV or Excel.
- Verify `export_data` row exists.
- Verify `resource_type = 'transaction_export'`.
5. Force an error case (for example, temporarily break RPC name in local code and retry).
- Verify `success = false` and `error_message` is populated.

## 4) Verification Query

```sql
select
  action,
  success,
  fields_accessed,
  merchant_id,
  location_id,
  user_id,
  user_email,
  user_role,
  event_timestamp
from public.payment_audit_log
order by event_timestamp desc
limit 50;
```

## 5) Notes

- Logging is best-effort and non-blocking from server actions (does not block UI data responses).
- If migration `029` is not applied, app logs one warning and continues normal behavior.
