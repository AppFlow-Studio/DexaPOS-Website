# ADM-002/004/005 Apply + QA Runbook

Last updated: 2026-02-17

## 1) Apply Migrations (in order)

Run these SQL files against your target Supabase database in this exact order:

1. `supabase/migrations/022_adm_002_admin_rls.sql`
2. `supabase/migrations/023_adm_004_admin_transactions_rpc.sql`
3. `supabase/migrations/024_adm_005_admin_transaction_detail_rpc.sql`

Recommended place:
- Supabase Dashboard -> SQL Editor (dev/staging first, then production)

## 2) Post-Apply DB Smoke Checks

Run:

```sql
select proname
from pg_proc
where proname in (
  'get_admin_merchant_ids',
  'get_admin_transactions',
  'get_admin_transaction_detail'
)
order by proname;
```

```sql
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and policyname like 'hq_admin_select_%'
order by tablename, policyname;
```

Expected:
- 3 functions exist
- 5 admin select policies exist:
  - `hq_admin_select_orders`
  - `hq_admin_select_order_payments`
  - `hq_admin_select_order_items`
  - `hq_admin_select_order_payment_items`
  - `hq_admin_select_payment_events`

## 3) App QA (ADM-002 / ADM-004)

Use 2 HQ users:
- User A: assigned to only one merchant (not super admin)
- User B: `hq.super_admin`

Checks for User A:
1. Open `/manage/transactions`.
2. Confirm only assigned merchant transactions are visible.
3. Try URL-forced merchant filter with an unassigned merchant ID.
4. Confirm results remain scoped (empty or only allowed merchants).
5. Verify filters/search/sort/pagination still work.

Checks for User B:
1. Open `/manage/transactions`.
2. Confirm cross-merchant data is visible.

## 4) App QA (ADM-005)

1. Expand a transaction row in `/manage/transactions`.
2. Confirm details load without error.
3. Validate sections render:
- payment segments
- transaction details
- terminal info
- items paid
- EMV (when card payment has EMV)
- adjustments/reversals
- payment timeline
- full order breakdown + order discounts
4. Test on at least one:
- captured card payment
- cash payment
- split payment (if available)
- refunded/voided payment (if available)

## 5) Scratch Guidance

After QA passes:
- `ADM-002` -> scratch
- `ADM-004` -> scratch
- `ADM-005` -> scratch

Then continue to tickets `ADM-013` to `ADM-019`.
