# [C1] Schema - merchant_processor_accounts (ISO shape) + RLS + processor discriminator

## Goal

Create the processor-agnostic schema needed to run NMI and Valor side by side
while merchants migrate one payment purpose at a time.

Notion ticket: `3b18280c-1b1d-8133-a0c3-d073287e36e5`

Parent architecture: `3b18280c-1b1d-81fe-8923-ec09e70e6de0`

## Scope

Implemented in code:

- New `merchant_processor_accounts` table for `online_order`, `subscription`,
  and `invoice` processor references.
- Valor ISO identifiers, NMI rollback identifiers, fee schedule values, and
  encrypted-secret placeholders.
- Null-safe uniqueness for merchant-global and location-scoped accounts.
- Required fee data for active Valor online-order and invoice accounts.
- `merchant_billing_profiles.processor`, defaulting existing rows to `nmi`.
- Nullable processor-account links on `online_order_payment_intents` and
  `online_store_config`.
- Active lookup, primary-account, and foreign-key indexes.
- Four RLS policies: shared authorized reads plus HQ-only insert, update, and
  delete.
- Updated generated TypeScript database surfaces.

Not included:

- No processor account data is inserted or backfilled.
- No merchant is switched from NMI to Valor.
- No Valor API calls, account boarding, checkout, subscription, invoice, or
  webhook implementation is included. Those belong to C2 and later tickets.
- No production or staging migration was executed as part of the code change.

## Contracts

### Account identity

Allowed processors:

- `nmi`
- `valor`

Allowed purposes:

- `online_order`
- `subscription`
- `invoice`

The scope key is:

```text
(merchant_id, location_id, processor, purpose)
```

`location_id = NULL` means merchant-global. The unique constraint uses
`NULLS NOT DISTINCT` so two identical merchant-global rows cannot be created.

### Valor fee integrity

An active Valor account for `online_order` or `invoice` requires:

- `fee_schedule_id`
- `disc_rate_percent`
- `residual_bps`
- `surcharge_percent`

Valor `subscription` rows may leave these values null. Inactive rows may be
staged without the values, but cannot be activated until the fee contract is
complete.

### Primary account

Only one active primary account may exist for the same merchant, location,
and purpose. NMI and Valor can both remain active during migration, but only
one can be the selected primary account.

### Existing NMI behavior

All new foreign keys are nullable. Existing billing profiles default to
`processor = 'nmi'`. Existing storefront and payment-intent behavior therefore
continues until a later ticket explicitly links an account.

### Access

- Merchant owner/admin/manager: read own merchant rows.
- Carrier member: read rows for merchants owned by that carrier.
- Dexa HQ: read, insert, update, and delete all rows.
- Anonymous clients: no table privileges.
- Service role: full access for controlled backend workflows.

Clerk identity is resolved from `auth.jwt()->>'sub'`; `auth.uid()` is not used.

## Implementation Decisions

The implementation intentionally strengthens two details from the canonical
ticket SQL:

1. `UNIQUE NULLS NOT DISTINCT` is used because a normal PostgreSQL unique key
   permits duplicate rows when `location_id` is null.
2. `surcharge_percent` is included in the active Valor fee guard because the
   architecture names it as part of the ISO fee schedule.
3. A trigger rejects a location that does not belong to the account merchant,
   and composite consumer foreign keys prevent an intent/storefront from
   linking another merchant's processor account.

The parent cutover flow also reads
`online_store_config.merchant_processor_account_id`. The nullable column is
included here so the parent verification query and later C4 cutover flow have
the required schema foundation.

Encrypted fields are opaque storage only in C1. C2 must define and use the
approved encryption/Vault contract before writing either encrypted column.

## Files

Migrations:

- `supabase/migrations/20260804150000_create_merchant_processor_accounts.sql`
- `supabase/migrations/20260804150100_index_mpa_active.sql`
- `supabase/migrations/20260804150200_merchant_processor_accounts_rls.sql`

Types:

- `database.types.ts`
- `app/database.types.ts`

Documentation:

- `docs/features/billing/C1-MERCHANT-PROCESSOR-ACCOUNTS-SCHEMA.md`
- `docs/features/billing/README.md`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`

## Verification Status

Completed locally:

- [x] Ticket and parent architecture compared against current repository schema.
- [x] Existing NMI columns and runtime paths left unchanged.
- [x] Migration split keeps concurrent indexes outside the core migration.
- [x] RLS policy count in source is four.
- [x] Type surfaces updated for the new table and columns.
- [x] `git diff --check` passed.
- [x] Targeted TypeScript compile for both database type files passed.
- [ ] Repository-wide TypeScript compile is not green. It reports existing
      Clerk, dashboard, duplicate type, and Deno Edge Function errors outside
      the C1 files; no C1 type-file error appeared in the targeted compile.

Still manual on staging:

- [ ] Apply all three migrations in order.
- [ ] Verify columns, defaults, foreign keys, indexes, and four policies.
- [ ] Run fee constraint and null-safe duplicate tests.
- [ ] Run merchant, unrelated merchant, carrier, and HQ RLS tests.
- [ ] Regenerate both database type files from the applied staging schema and
      confirm the generated diff matches the maintained types.
- [ ] Attach schema output to the parent Notion ticket and obtain C1 sign-off.

## Staging Apply

Target only the shared staging project `dfwqakoyittmrwbqvxgw` first.

1. Run `20260804150000_create_merchant_processor_accounts.sql`.
2. Run `20260804150100_index_mpa_active.sql` outside an explicit transaction.
   If the SQL editor rejects multiple concurrent statements, run each
   `CREATE INDEX CONCURRENTLY` statement separately.
3. Run `20260804150200_merchant_processor_accounts_rls.sql`.
4. Do not run a data backfill and do not create production credentials.

## Post-Apply SQL

```sql
-- Columns and defaults.
select table_name, column_name, data_type, numeric_precision, numeric_scale,
       is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'merchant_processor_accounts',
    'merchant_billing_profiles',
    'online_order_payment_intents',
    'online_store_config'
  )
  and (
    table_name = 'merchant_processor_accounts'
    or column_name in ('processor', 'merchant_processor_account_id')
  )
order by table_name, ordinal_position;

-- Indexes, including the required partial active index.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'merchant_processor_accounts',
    'online_order_payment_intents',
    'online_store_config'
  )
order by tablename, indexname;

-- Exactly four C1 policies are expected.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'merchant_processor_accounts'
order by policyname;

-- Existing billing rows must remain NMI.
select processor, count(*)
from public.merchant_billing_profiles
group by processor
order by processor;
```

## Constraint QA

Use a disposable staging merchant/location and wrap accepted inserts in a
transaction that is rolled back.

```sql
-- Replace these two values before testing.
-- Merchant and location must belong to each other.
select id as merchant_id, name from public.merchants order by created_at desc limit 10;
select id as location_id, merchant_id, name from public.locations order by created_at desc limit 10;

-- Must fail: active Valor online-order account has no fee schedule.
insert into public.merchant_processor_accounts (
  merchant_id, location_id, processor, purpose
) values (
  '<MERCHANT_ID>'::uuid,
  '<LOCATION_ID>'::uuid,
  'valor',
  'online_order'
);

-- Must succeed, then roll back: subscription does not require ISO fee values.
begin;
insert into public.merchant_processor_accounts (
  merchant_id, processor, purpose, is_primary
) values (
  '<MERCHANT_ID>'::uuid,
  'valor',
  'subscription',
  true
);
rollback;
```

For the invalid insert, run it as a separate SQL editor request and confirm the
error names `fee_schedule_required_for_merchant_purposes`.

## RLS QA

SQL Editor runs as an elevated database role and does not prove client RLS.
Validate from authenticated application sessions:

1. Merchant owner/admin/manager can select their merchant row.
2. The same user cannot select another merchant's row.
3. A carrier user can select rows for a merchant tied to that carrier.
4. HQ can select, insert, update, and delete a disposable row.
5. A merchant or carrier cannot insert, update, or delete rows directly.
6. An anonymous Supabase client cannot select the table.

## Manual Account and Configuration Steps

C1 does not require creating a Valor merchant account. After C1 is verified
and signed off, C2 needs the following external inputs:

1. Obtain Valor sandbox ISO credentials from Fadil/MTech:
   `VALOR_ISO_API_KEY` and `VALOR_ISO_SECRET`.
2. Obtain or create the DEXA HQ sandbox EPI for subscription billing:
   `VALOR_DEXA_HQ_EPI`.
3. Set `VALOR_ENV=sandbox` and provision a sandbox-only
   `VALOR_WEBHOOK_SIGNING_SECRET`.
4. Temur must approve the default `fee_schedule_id`, discount rate,
   residual basis points, and surcharge percentage before C2 starts.
5. C2 then creates the Valor merchant, store, EPI, APP ID, and APP key through
   the documented ISO boarding flow. Do not paste plaintext APP keys or webhook
   secrets into `merchant_processor_accounts`.
6. Only after a sandbox smoke test should a row become `is_active = true` and
   `is_primary = true` for a purpose.

Production boarding, credential creation, data backfill, and merchant cutover
remain later-ticket work and require senior approval.

## C2 Contract Note

`online_order_payment_intents.ipospays_tpn` is still non-null in the existing
schema. C1 intentionally does not change legacy intent creation. Before C2/C3
creates Valor-only payment intents for a newly boarded merchant, the service
owner must either remove that legacy requirement in a reviewed migration or
define a temporary compatibility value. Reusing a Valor identifier under the
misnamed NMI/iPOS column is not recommended.

## Remaining Owners

- Ali Dika: staging schema/RLS verification artifact and C1 sign-off request.
- Ali Awdi: C2 processor interface, Valor service module, boarding, and secret
  storage contract after C1 approval.
- Temur: approve default ISO fee schedule.
- Fadil/MTech: provide Valor sandbox ISO credentials.
- Abubeckr: final architecture DoD sign-off after all child tickets.
