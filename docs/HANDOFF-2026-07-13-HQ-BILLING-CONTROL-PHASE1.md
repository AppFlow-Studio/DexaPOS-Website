# HQ Self-Service Billing Control - Phase 1 Handoff

## Ticket

`[BILLING][HIGH] DEXA HQ self-service billing control - editable plans / add-ons / device pricing, add-on-aware auto-calculator, device-driven billing, POS ID, station quota & non-payment deactivation`

## Scope Completed In Website Repo

This pass implemented the website/backend scope for the billing-control ticket. POS repo login/session behavior and tablet UX remain assigned to the POS-side agent.

Implemented:

- Added billing migration:
  - `supabase/migrations/20260712120000_hq_self_service_billing_control_phase1.sql`
  - `supabase/migrations/20260713130000_hq_billing_device_bridge_and_access_gates.sql`
- Added audited HQ RPCs:
  - `upsert_billable_service(...)`
  - `upsert_device_catalog(...)`
  - hardened `upsert_subscription_plan(...)`
- Added unified calculator:
  - `calculate_subscription_total(...)`
- Added subscription recalculation:
  - `recalc_subscription(...)`
- Rewired subscription invoice snapshot/generation to use the unified calculator.
- Rewired subscription service replacement to recalculate subscription totals.
- Added `device_inventory.pos_id` generated from the last 4 characters of `serial_number`.
- Updated `admin_device_inventory` to expose `pos_id`.
- Added `device_billing_service_mappings` for device category to billing service mapping.
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
- Seeded flagship pricing defaults:
  - first station: `$99`
  - extra station: `$49`
  - POS tablet: `$39`
  - KDS: `$29`
  - online ordering: `$100`
  - loyalty: `$79`
  - delivery app integration: `$79`
  - franchise: `$399`
  - card surcharge: `4%`
- Updated website actions:
  - `app/manage/actions/subscription-billing.ts`
  - `app/manage/actions/device-catalog.ts`
  - `app/manage/actions/device-registry.ts`
  - `app/dashboard/actions/subscription-billing.ts`
- Added HQ subscription workspace controls:
  - service-billing plan editor for base station price, included stations, extra-station price, and card surcharge
  - billable service/add-on editor for POS tablet, KDS, online ordering, loyalty, delivery app integration, franchise, and future services
  - device billing mapping editor for deployed device category to billable service mapping
  - live calculator quote panel backed by `calculate_subscription_total(...)`
  - subscription save now persists the selected service-billing plan so invoice generation uses the same plan as the quote
  - suspended/past-due billing state messaging for the selected location subscription
- Updated website POS ID display/search:
  - `/manage/devices`
  - `/manage/devices/[deviceId]`
  - device registry command palette
  - merchant subscription overview device table
- Changed device catalog delete behavior to deactivate through audited RPC instead of hard-delete.

## Important Migration Note

The `admin_device_inventory` view had production/staging column-order drift. The migration now uses:

```sql
drop view if exists public.admin_device_inventory;

create view public.admin_device_inventory
```

Do not run an older copied version that contains:

```sql
create or replace view public.admin_device_inventory
```

If Supabase reports a view dependency error, stop and review before adding `cascade`.

## What Is Still Open

- Apply both billing migrations on staging and run SQL/RLS QA.
- Confirm calculator parity on live staging data.
- Confirm invoice line items match calculator line items.
- Confirm device assignment/decommission changes subscription station count and device service quantities.
- Confirm station quota blocks over-entitlement station creation/activation with the expected error.
- Confirm subscription suspend/restore disables and restores stations/payment terminals.
- POS repo consumption/enforcement remains out of this website pass.

## SQL QA

After applying the migration on staging, run:

```sql
select id, plan_code, base_price_monthly, included_stations, per_extra_station_price, card_surcharge_pct
from public.subscription_plans
where plan_code = 'SERVICE_CATALOG';
```

Then use the returned plan id:

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

Then:

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

Device billing bridge smoke test:

```sql
select public.sync_location_device_billing('<LOCATION_ID>'::uuid);
```

Expected:

- Returns `synced = true` for a location with a non-canceled subscription.
- `merchant_subscriptions.station_count` matches deployed POS tablet count, or active station fallback when no deployed POS tablets exist.
- mapped deployed devices update `merchant_subscription_services.quantity`.

Quota smoke test:

```sql
-- Use a test location whose subscription station_count is intentionally lower than active station count.
-- Creating or activating an extra station should raise:
-- Station limit reached for this location's plan - add a device/seat to add a station.
```

Suspension smoke test:

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
- Updating the status back to `active` restores only the snapshotted stations/payment terminals.

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

## Remaining POS Repo Items

- POS app must refuse login/session use when the location subscription is suspended.
- POS app must surface station quota or suspended-subscription errors cleanly instead of generic failures.
- POS app must sync local station/payment-terminal state after website/backend suspension and restore.
- POS proof video must show blocked access while suspended and restored access after payment/status restore.

## Validation Status

Local validation completed:

- `git diff --check` passed, with line-ending warnings only.
- Targeted TypeScript scan for changed billing files passed.

Not completed locally:

- Full `npx tsc --noEmit --pretty false` still fails on existing unrelated repo-wide errors.
- `npx supabase db lint --local` could not connect because local Supabase Postgres was not running.

## Done Criteria Before Closing

- Staging migration applied successfully.
- RLS verified for HQ/service-role writes and merchant/carrier rejection.
- Calculator parity verified.
- Invoice generation verified against calculator output.
- POS ID display verified.
- HQ plan/add-on/device pricing UI verified.
- Device-driven billing, quota, and suspension backend flows verified on staging.
- POS-side login/session enforcement verified in the POS repo.
- Proof video recorded.
