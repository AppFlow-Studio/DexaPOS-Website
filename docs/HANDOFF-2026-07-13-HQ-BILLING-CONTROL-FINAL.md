# HQ Self-Service Billing Control - Final Handoff

## Ticket

`[BILLING][HIGH] DEXA HQ self-service billing control - editable plans / add-ons / device pricing, add-on-aware auto-calculator, device-driven billing, POS ID, station quota & non-payment deactivation`

## Final Status

Implementation is complete across the website/backend scope and the POS scope.

This ticket can move to final QA/Done after the staging or production verification items below are checked and proof is attached.

## Website / Backend Work Completed

Migrations added:

- `supabase/migrations/20260712120000_hq_self_service_billing_control_phase1.sql`
- `supabase/migrations/20260713130000_hq_billing_device_bridge_and_access_gates.sql`

Backend/RPC work completed:

- Added audited HQ pricing/catalog RPCs:
  - `upsert_billable_service(...)`
  - `upsert_device_catalog(...)`
  - hardened `upsert_subscription_plan(...)`
- Added unified calculator:
  - `calculate_subscription_total(...)`
- Added subscription recalculation helper:
  - `recalc_subscription(...)`
- Rewired subscription invoice snapshot/generation to use the unified calculator.
- Rewired subscription service replacement to recalculate subscription totals.
- Added `device_inventory.pos_id` generated from the last 4 characters of `serial_number`.
- Updated `admin_device_inventory` to expose `pos_id`.
- Added `device_billing_service_mappings` for device-category to billable-service mapping.
- Added HQ-editable device billing mapping RPC/action/UI:
  - `upsert_device_billing_service_mapping(...)`
  - `getDeviceBillingServiceMappings()`
  - `upsertDeviceBillingServiceMapping(...)`
- Added device-driven billing bridge:
  - `sync_location_device_billing(...)`
  - `device_inventory` trigger to recalc deployed device service quantities.
- Updated `get_active_station_count(...)` to count deployed POS tablet devices first, with legacy active-station fallback.
- Added station quota enforcement:
  - `enforce_station_subscription_quota(...)`
  - blocks station create/activation beyond the subscription station entitlement.
- Added non-payment access gate:
  - `apply_subscription_access_state(...)`
  - subscription status trigger disables stations/payment terminals on `suspended`.
  - restore to `active` or `trial` reactivates the pre-suspension station/terminal snapshot.

Seeded flagship pricing defaults:

- First station: `$99`
- Extra station: `$49`
- POS tablet: `$39`
- KDS: `$29`
- Online ordering: `$100`
- Loyalty: `$79`
- Delivery app integration: `$79`
- Franchise: `$399`
- Card surcharge: `4%`

Website UI/actions completed:

- Updated website actions:
  - `app/manage/actions/subscription-billing.ts`
  - `app/manage/actions/device-catalog.ts`
  - `app/manage/actions/device-registry.ts`
  - `app/dashboard/actions/subscription-billing.ts`
- Added HQ subscription workspace controls:
  - service-billing plan editor.
  - billable service/add-on editor.
  - device billing mapping editor.
  - live calculator quote panel backed by `calculate_subscription_total(...)`.
  - subscription save persists the selected service-billing plan.
  - suspended/past-due billing state messaging.
- Updated website POS ID display/search:
  - `/manage/devices`
  - `/manage/devices/[deviceId]`
  - device registry command palette
  - merchant subscription overview device table
- Changed device catalog delete behavior to deactivate through audited RPC instead of hard-delete.

## POS Work Completed

POS-side implementation is considered complete for this ticket.

Completed POS responsibilities:

- POS refuses login/session use when the location subscription is `suspended`.
- POS surfaces clear billing-specific errors for suspended access instead of generic auth/sync failures.
- POS surfaces the station quota error from `enforce_station_subscription_quota(...)` clearly:
  - `Station limit reached for this location's plan - add a device/seat to add a station.`
- POS syncs local station/payment-terminal state after website/backend suspension.
- POS syncs restored station/payment-terminal state after subscription status returns to `active` or `trial`.
- POS proof flow should show active access, suspended blocked access, quota block, and restored access.

## Important Migration Note

The `admin_device_inventory` view had production/staging column-order drift. The migration intentionally uses:

```sql
drop view if exists public.admin_device_inventory;

create view public.admin_device_inventory
```

Do not run an older copied version that contains:

```sql
create or replace view public.admin_device_inventory
```

If Supabase reports a view dependency error, stop and review before adding `cascade`.

## Final SQL QA

Run after applying both migrations on staging.

### Calculator Parity

```sql
select id, plan_code, base_price_monthly, included_stations, per_extra_station_price, card_surcharge_pct
from public.subscription_plans
where plan_code = 'SERVICE_CATALOG';
```

Use the returned plan id:

```sql
select *
from public.calculate_subscription_total(
  '<PLAN_ID>'::uuid,
  1,
  '[{"service_code":"pos_tablet","quantity":1},{"service_code":"kds","quantity":1}]'::jsonb,
  'ach'
);
```

Expected ACH total:

- `$167.00`

```sql
select *
from public.calculate_subscription_total(
  '<PLAN_ID>'::uuid,
  1,
  '[{"service_code":"pos_tablet","quantity":1},{"service_code":"kds","quantity":1}]'::jsonb,
  'card'
);
```

Expected card total:

- `$173.68`

### Device Billing Bridge

```sql
select public.sync_location_device_billing('<LOCATION_ID>'::uuid);
```

Expected:

- Returns `success = true` for a location with a non-canceled subscription.
- `merchant_subscriptions.station_count` matches deployed POS tablet count, or active station fallback when no deployed POS tablets exist.
- mapped deployed devices update `merchant_subscription_services.quantity`.
- subscription `monthly_amount` recalculates.

### Station Quota

Use a test location where subscription `station_count` is lower than the attempted active station count.

Expected error on extra station create/activation:

```text
Station limit reached for this location's plan - add a device/seat to add a station.
```

### Suspension / Restore

```sql
update public.merchant_subscriptions
set status = 'suspended'
where id = '<SUBSCRIPTION_ID>'::uuid;

select status, metadata
from public.merchant_subscriptions
where id = '<SUBSCRIPTION_ID>'::uuid;
```

Expected:

- `stations.is_active = false` for the subscription location.
- `payment_terminals.is_active = false` for the subscription location.
- `metadata.billing_access_state` stores the suspended snapshot.
- POS login/session is blocked with a billing-specific message.

Restore:

```sql
update public.merchant_subscriptions
set status = 'active'
where id = '<SUBSCRIPTION_ID>'::uuid;
```

Expected:

- snapshotted stations are active again.
- snapshotted payment terminals are active again.
- POS access works again.

## Website QA

1. Open `/manage/devices`.
2. Confirm each device row shows `POS ID` when serial is present.
3. Open a device detail page.
4. Confirm header/details show `POS ID`.
5. Press `Ctrl+K` in the device registry area.
6. Search by serial/model and by last-4 POS ID.
7. Open merchant subscription overview.
8. Confirm device table shows POS ID.
9. Open `/manage/device-catalog`.
10. Deactivate a catalog item.
11. Confirm it becomes inactive instead of disappearing from the database.
12. Check `audit_logs` for billing/catalog events.
13. Open `/manage/subscriptions/<merchantId>`.
14. In `Billing Catalog Controls`, edit a service-billing plan price, save it, and confirm the value reloads.
15. Edit a billable service/add-on price, save it, and confirm the value reloads.
16. In `Live Calculator Quote`, select the service-billing plan, station count `1`, POS tablet quantity `1`, and KDS quantity `1`.
17. Confirm ACH returns `$167.00`.
18. Confirm Card returns `$173.68`.
19. Generate a subscription invoice and confirm invoice line items match the live quote.
20. In `Billing Catalog Controls`, map `pos_tablet` to the POS tablet billable service and save.
21. Map `kds` to the KDS billable service and save.
22. Assign/deploy a POS tablet or KDS device to the test location and confirm subscription service quantities/monthly amount recalc.
23. Set a subscription to `suspended` and confirm the warning banner is shown in `/manage/subscriptions/<merchantId>`.
24. Restore the subscription to `active` or `trial` and confirm the banner clears.

## POS QA

1. Start with subscription status `active`.
2. Confirm POS login/session works.
3. Try normal station access and payment-terminal access.
4. Set subscription status to `suspended` from HQ.
5. Confirm POS syncs the suspended state.
6. Confirm POS login/session is refused or current session is blocked with a billing-specific message.
7. Confirm station/payment-terminal access is unavailable.
8. Try to create/activate a station above entitlement and confirm the quota message is shown.
9. Restore subscription status to `active` or `trial`.
10. Confirm POS syncs restore state.
11. Confirm POS login/session and station/payment-terminal access work again.

## Closure Checklist

- [ ] Staging migrations applied successfully.
- [ ] `supabase migration repair --status applied` completed after manual apply.
- [ ] RLS verified for HQ/service-role writes and merchant/carrier rejection.
- [ ] Calculator parity verified.
- [ ] Invoice generation verified against calculator output.
- [ ] POS ID display/search verified.
- [ ] HQ plan/add-on/device pricing UI verified.
- [ ] Device-driven billing bridge verified.
- [ ] Station quota backend verified.
- [ ] Suspension/restore backend verified.
- [ ] POS suspended login/session enforcement verified.
- [ ] POS quota/suspended error handling verified.
- [ ] Proof video recorded and attached.

## Validation Status

Local validation completed:

- `git diff --check` passed with line-ending warnings only.
- Targeted TypeScript scan for changed billing files passed.

Known local limitation:

- Full `npx tsc --noEmit --pretty false` still fails on existing unrelated repo-wide errors.
- `npx supabase db lint --local` could not connect because local Supabase Postgres was not running.

## Final Note

There are no remaining coding items for this ticket in the website repo based on the current completed POS handoff. Remaining work is release QA, staging/prod migration discipline, and proof attachment.
