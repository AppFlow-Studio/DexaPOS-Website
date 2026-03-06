# DM-013 Apply + QA Checklist (033/034/035)

Use this to apply the current DM-013 migrations and validate them quickly.

## Banking Hold Indicator

`[BANK-RELATED: HOLD]` means pause that section until admin approval.
Current hold scope in this checklist:
1. Section `4.B DM-013-04 (Billing)` `[BANK-RELATED: HOLD]`
2. Any additional bank-account/routing/tokenization validation steps

## 1) Apply Migrations in Supabase SQL Editor

Run in this order:

1. `supabase/migrations/033_dm_013_01_merchant_onboarding_schema.sql`
2. `supabase/migrations/034_dm_013_02_location_tax_banking_schema.sql`
3. `supabase/migrations/035_dm_013_05_merchant_auto_activation.sql`

If all three return success, continue to checks below.

## 2) Schema Validation

```sql
-- merchants onboarding fields
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'merchants'
  and column_name in (
    'business_legal_name','dba_name','business_type','owner_first_name','owner_last_name',
    'owner_email','owner_phone','ein_last_four','onboarding_status','onboarding_completed_at',
    'activated_at','business_address_line1','business_address_line2','business_city',
    'business_state','business_postal_code','business_country'
  )
order by column_name;

-- locations tax/banking onboarding fields
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'locations'
  and column_name in (
    'ein','ein_last_four','tax_id','sales_tax_rate','tax_registration_status',
    'onboarding_step','onboarding_completed'
  )
order by column_name;
```

## 3) Constraint/Policy/Trigger Validation

```sql
-- Key constraints exist
select conname
from pg_constraint
where conname in (
  'merchants_onboarding_status_check',
  'merchants_business_type_check',
  'merchant_billing_profiles_billing_method_check',
  'location_banking_profiles_account_type_check',
  'location_banking_profiles_payout_frequency_check'
)
order by conname;

-- RLS policies for merchant_billing_profiles
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'merchant_billing_profiles'
order by policyname;

-- RLS policies for location_banking_profiles
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'location_banking_profiles'
order by policyname;

-- DM-013-05 trigger attached
select trigger_name, event_object_table
from information_schema.triggers
where trigger_name = 'trg_order_payments_auto_activate_merchant';
```

## 4) Manual Product QA

## A. DM-013-05 (Status + Activation)

1. Login as HQ admin.
2. Open `/manage/merchants/[merchantId]`.
3. Verify status card is visible with checklist.
4. Click `Manually Activate` and confirm status updates.
5. Click `Suspend`, provide reason, confirm.
6. Click `Cancel Account`, confirm modal path.
7. In Supabase, verify audit row(s):

```sql
select created_at, action, action_category, severity, resource_type, resource_id, merchant_id, metadata
from audit_logs
where action in ('merchant.updated','merchant.status_auto_activated')
order by created_at desc
limit 20;
```

## B. DM-013-04 (Billing) `[BANK-RELATED: HOLD]`

Merchant flow:

1. Login as merchant owner.
2. Open `/dashboard/settings/billing`.
3. Save ACH profile (bank + holder + routing + account + type).
4. Save Card profile (token + brand + last4 + exp month/year).

Admin flow:

1. Login as HQ admin.
2. Open `/manage/merchants/[merchantId]/billing`.
3. Update billing profile on behalf of merchant.

Data verification:

```sql
select
  merchant_id,
  billing_method,
  bank_name,
  account_number_last_four,
  routing_number_last_four,
  card_brand,
  card_last_four,
  is_primary,
  is_verified,
  is_active,
  created_at
from merchant_billing_profiles
order by created_at desc
limit 20;
```

Expected:

1. Only last-4 values are stored for account/routing/card numbers.
2. No full account/routing values are persisted in table fields.
3. New profile is primary and `is_verified = false`.

## C. DM-013-03 (Core wizard sanity)

1. Login as HQ admin with `hq.merchant.create`.
2. Open `/manage/merchants/new`.
3. Complete 3 steps and submit.
4. Confirm redirect to merchant detail page and owner invite sent.

## D. DM-013-06 + DM-013-07 (Location Wizard UI)

1. Login as merchant owner.
2. Open `/dashboard/locations/new`.
3. Verify wizard now shows 7 steps in sidebar:
- Location Info
- Location Address
- Tax & Compliance
- Banking & Payouts
- Business Hours
- Assign Manager
- Review & Create
4. Complete Tax step:
- EIN accepts `12-3456789` format.
- Sales tax rate accepts numeric percent.
5. Complete Banking step `[BANK-RELATED: HOLD]`:
- UI fields render for bank account + payout schedule.
- Weekly and monthly frequency reveal day selectors.
- "Use merchant billing ACH details" toggle appears.
6. Complete Assign Manager step:
- Can choose Skip / Invite New / Assign Existing.
- Invite mode shows name/email fields.
- Existing mode shows identifier field.
7. On Review step, verify tax/banking/manager sections are visible and editable via "Edit".

Expected for this phase:
1. UI flow and field capture works.
2. Banking and manager persistence logic is not required in this phase (UI-only).

## 5) Known Remaining Gaps (Not QA failure)

1. DM-013-03 carrier non-HQ auto-assign path is blocked by current `/manage` HQ-only routing model.
2. DM-013-04 card collection uses token input now; replace with processor SDK UI (Stripe Elements or equivalent) in next pass.
3. DM-013-07 banking save/tokenization wiring remains intentionally deferred due bank-related hold.

## 6) Latest Confirmed Results (March 6, 2026)

1. DM-013-05 status controls were validated in UI and confirmed.
2. DM-013-06/07 location wizard UI checks were completed and confirmed.
3. Banking logic remains intentionally excluded from this confirmation due hold.
