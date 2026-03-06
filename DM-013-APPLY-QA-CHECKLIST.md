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
8. Submit with `Invite New` manager mode:
- confirm location is created
- confirm pending invite appears in location Team tab with manager role
9. Submit with `Assign Existing` manager mode (using existing user email or `user_...` ID):
- confirm location is created
- confirm user appears in location Team tab with manager role

Expected for this phase:
1. UI flow and field capture works.
2. Manager assignment executes for invite/assign-existing flows.
3. Banking persistence logic remains deferred due hold.

## E. DM-013-09 (Admin Merchant List Status/Owner)

1. Login as HQ admin.
2. Open `/manage/merchants`.
3. Verify table/list includes owner identity (name + email when available).
4. Verify status filter options include:
- Created
- Onboarding
- Active
- Suspended
- Cancelled
5. Apply each status filter and confirm results update.
6. Set sort by `Status` and verify ordering changes.
7. Switch between grid/list views and confirm owner info still appears.

Expected:
1. Lifecycle status filtering works from onboarding status source.
2. Owner information is visible in merchant list surfaces.

## F. DM-013-08 (Location Settings Tax/Compliance, Non-Banking Scope)

1. Login as merchant owner.
2. Open `/dashboard/locations`.
3. Click the settings icon on a location card (or open `/dashboard/locations/[locationId]/settings` directly).
4. Verify route loads with `Location Tax & Banking` heading.
5. Verify `Tax & Compliance` card shows:
- masked EIN (`****1234` style when available)
- state tax ID
- sales tax rate
- registration status badge
6. Click `Edit Tax Settings`.
7. Update one or more values:
- EIN (`12-3456789`)
- tax ID
- sales tax rate percent
- registration status
8. Save and verify toast success.
9. Re-open the same location settings route and confirm updated values display in the card.
10. Verify `Banking & Payouts` section is read-only and shows `[BANK-RELATED: HOLD]` indicator.

Data verification:

```sql
select id, name, ein_last_four, tax_id, sales_tax_rate, tax_registration_status, updated_at
from locations
order by updated_at desc
limit 20;
```

Expected:
1. `sales_tax_rate` persists as decimal (e.g. `0.0875` for 8.75%).
2. `ein_last_four` reflects the latest EIN input.
3. Updates appear in `audit_logs` via existing `UpdateLocation` audit path.

## 5) Known Remaining Gaps (Not QA failure)

1. DM-013-03 carrier non-HQ auto-assign path is blocked by current `/manage` HQ-only routing model.
2. DM-013-04 card collection uses token input now; replace with processor SDK UI (Stripe Elements or equivalent) in next pass.
3. DM-013-07 banking save/tokenization wiring remains intentionally deferred due bank-related hold.
4. DM-013-08 banking management UI/persistence remains deferred due bank-related hold.

## 6) Latest Confirmed Results (March 6, 2026)

1. DM-013-05 status controls were validated in UI and confirmed.
2. DM-013-06/07 location wizard UI checks were completed and confirmed.
3. DM-013-09 merchant list status/owner/filter/sort checks were completed and confirmed.
4. Banking logic remains intentionally excluded from this confirmation due hold.
5. DM-013-08 tax settings implementation is ready for QA.
