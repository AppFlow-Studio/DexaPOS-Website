# RLS-AUDIT-CHECKLIST

Last updated: 2026-02-17
Purpose: Safe pre/post-checklist before any RLS migration so merchant access and HQ access both remain valid.

## Scope
Use this checklist for:
- `orders`
- `order_payments`
- `order_items`
- `order_payment_items`
- `payment_events`

## Rule of Thumb
- HQ admin policies must be additive, read-only (`FOR SELECT`), and scoped.
- Merchant policies must remain present.
- Never assume policy state is consistent across environments.

## 1) Baseline Snapshot (Read-Only)
Run before any RLS change and save results.

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('orders','order_payments','order_items','order_payment_items','payment_events')
order by tablename, policyname;
```

## 2) Confirm RLS Is Enabled

```sql
select n.nspname as schema_name,
       c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('orders','order_payments','order_items','order_payment_items','payment_events')
order by c.relname;
```

## 3) Guardrail Checks (Common Break Risk)

### 3.1 Missing merchant SELECT policy

```sql
with p as (
  select tablename, lower(policyname) as policyname, cmd
  from pg_policies
  where schemaname = 'public'
    and tablename in ('orders','order_payments','order_items','order_payment_items','payment_events')
)
select tablename
from (values ('orders'), ('order_payments'), ('order_items')) t(tablename)
where not exists (
  select 1
  from p
  where p.tablename = t.tablename
    and p.cmd in ('SELECT','ALL')
    and p.policyname like '%merchant%'
);
```

Expected: 0 rows. Any row here means merchant access is likely broken.

### 3.2 HQ policies should not be `ALL`

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('orders','order_payments','order_items','order_payment_items','payment_events')
  and lower(policyname) like 'hq_%'
  and cmd <> 'SELECT'
order by tablename, policyname;
```

Expected: 0 rows.

### 3.3 Suspicious broad policies

```sql
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('orders','order_payments','order_items','order_payment_items','payment_events')
  and lower(policyname) like '%all users%'
order by tablename, policyname;
```

Expected: ideally 0 rows unless explicitly approved.

## 4) Expected Access Shape (Target)
- Merchant users:
  - have merchant-scoped policies on `orders`, `order_payments`, `order_items`.
  - can still read needed joined tables (`order_payment_items`, `payment_events`) through merchant path.
- HQ admins:
  - have additive `hq_admin_select_*` policies only.
  - scoping uses `get_admin_merchant_ids()`.

## 5) Migration Safety Pattern
For HQ policies use idempotent replacement only on HQ policy names:

```sql
DROP POLICY IF EXISTS hq_admin_select_orders ON public.orders;
CREATE POLICY hq_admin_select_orders ... FOR SELECT ...;
```

Do not drop merchant policies in HQ migrations.

## 6) Post-Change Verification
1. Re-run sections 1-3.
2. Test one merchant user flow (orders/payments list).
3. Test one HQ admin flow (cross-merchant scoped data).
4. If any merchant access regression is found, stop and restore merchant policies before continuing.

## 7) Emergency Rollback Strategy (Policy-Level)
- Re-apply last known-good merchant policy migration.
- Keep HQ migration disabled until policy inventory matches expected shape.
- Capture `pg_policies` output before and after rollback for incident notes.

## 8) Ownership/Approval
Before deploying RLS changes:
1. Run this checklist in dev/staging.
2. Share policy diff (`pg_policies` before/after) with lead.
3. Get explicit approval prior to production apply.
