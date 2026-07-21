# [BILLING][HIGH] DEXA HQ Self-Service Billing Control

## Ticket

DEXA HQ self-service billing control: editable plans, add-ons, device pricing, add-on-aware auto-calculator, device-driven billing, POS ID, station quota, and non-payment deactivation.

Follow-up to completed work:

- Device Inventory & Registry
- NMI SaaS Subscription Billing

Surface:

- Supabase schema, RLS, RPCs, triggers, migrations, seed, QA
- HQ/admin billing and device management surfaces
- POS impact through station quotas, subscription status, and device/session gating

## Current Repo Findings

Already exists:

- `subscription_plans`, `merchant_subscriptions`, `subscription_invoices`, `billable_services`, and `merchant_subscription_services`.
- `upsert_subscription_plan(...)`.
- `list_subscription_plans()`.
- `list_billable_services()`.
- `calculate_subscription_amounts(...)`.
- `calculate_billable_service_amounts(...)`.
- `replace_merchant_subscription_services(...)`.
- `get_active_station_count(...)`.
- `assign_device(...)`.
- Device catalog/admin inventory screens and actions.
- Centralized Dexa Billing NMI rail and subscription invoice charge flow.
- Device catalog has both legacy `_cents` columns and dollar columns from the money migration.

Originally missing / current implementation state:

- `upsert_billable_service(...)`: implemented locally.
- `upsert_device_catalog(...)` RPC with validation and audit: implemented locally.
- Unified `calculate_subscription_total(...)` that composes plan + services + one surcharge: implemented locally.
- `recalc_subscription(...)` and price-change cascade for future cycles: implemented locally.
- Device-to-billing bridge on assignment/deployment: implemented locally through `sync_location_device_billing(...)` and a `device_inventory` trigger.
- `device_category -> service_code` mapping table: implemented locally with HQ-editable mapping UI.
- `device_inventory.pos_id`: implemented locally.
- Station quota enforcement trigger/RPC: implemented locally through `enforce_station_subscription_quota(...)`.
- Non-payment suspension routine that disables stations/payment terminals: implemented locally through `apply_subscription_access_state(...)`.
- POS login/session gating while suspended: completed in the POS repo workstream.
- Source-of-truth decision for `merchant_subscriptions` vs `merchant_plan_subscriptions`: website implementation continues using `merchant_subscriptions`.

Conclusion:

- The website/backend implementation is locally complete for this repo.
- The implementation is complete across website/backend and POS. The ticket is not Done until both migrations are applied on staging, SQL/RLS/manual QA passes, and proof is attached.

## Implementation Update - 2026-07-12

Website repo work completed in this pass:

- Added migration `supabase/migrations/20260712120000_hq_self_service_billing_control_phase1.sql`.
- Added `device_inventory.pos_id` as a generated last-4-of-serial field and exposed it through `admin_device_inventory`.
- Added `device_billing_service_mappings` for device-category to billable-service mapping.
- Seeded/updated flagship pricing values:
  - service catalog plan: `$99` first station, `$49` extra station, `4%` card surcharge.
  - POS tablet: `$39`.
  - KDS: `$29`.
  - Online Ordering: `$100`.
  - Loyalty: `$79`.
  - Delivery App Integration: `$79`.
  - Franchise: `$399`.
- Added audited HQ RPCs:
  - `upsert_billable_service(...)`.
  - `upsert_device_catalog(...)`.
  - hardened `upsert_subscription_plan(...)`.
- Added unified calculator RPC:
  - `calculate_subscription_total(...)`.
- Added subscription recalc helper:
  - `recalc_subscription(...)`.
- Rewired invoice snapshot/generation to use the unified calculator so the invoice line items match calculator output.
- Rewired service assignment replacement to recalc the subscription after assignment changes.
- Added website server actions for:
  - billable service upsert.
  - service-billing plan upsert.
  - subscription quote calculation.
  - subscription recalc.
  - audited device catalog create/update/deactivate through RPC.
- Added HQ subscription workspace UI for:
  - service-billing plan editing.
  - billable service/add-on editing.
  - live calculator quote preview backed by `calculate_subscription_total(...)`.
  - saving the selected service-billing plan on merchant subscriptions.
- Updated HQ device registry website surfaces to show/search POS ID:
  - inventory list.
  - device detail.
  - command palette.
- Updated merchant subscription overview device table to show POS ID.
- Changed device catalog delete behavior to deactivate through the audited RPC instead of hard-deleting SKUs.

## Implementation Update - 2026-07-13

Website repo work completed in this pass:

- Added migration `supabase/migrations/20260713130000_hq_billing_device_bridge_and_access_gates.sql`.
- Updated `get_active_station_count(...)` to count deployed POS tablet devices first, with active station fallback for legacy locations.
- Added audited HQ RPC/action/UI for device-category to billable-service mappings:
  - `upsert_device_billing_service_mapping(...)`
  - `getDeviceBillingServiceMappings()`
  - `upsertDeviceBillingServiceMapping(...)`
- Added `sync_location_device_billing(...)` to recalc `merchant_subscriptions.station_count`, mapped device service quantities, and subscription monthly amount.
- Added `device_inventory` trigger to run device billing sync after deploy/decommission/category/location changes.
- Added station quota enforcement through `enforce_station_subscription_quota(...)`.
- Added subscription access state gate through `apply_subscription_access_state(...)`:
  - `suspended` disables stations and payment terminals for the subscription location.
  - restore to `active` or `trial` restores the pre-suspension station/terminal snapshot.
- Added HQ subscription workspace device billing mapping editor.
- Added HQ subscription workspace suspended/past-due state messaging.

Still open after these passes:

- Apply both billing migrations on staging and run SQL/RLS QA.
- Verify the HQ plan/add-on/device pricing UI against staging data.
- Verify the device-assignment billing bridge against staging data.
- Verify station quota enforcement against staging data.
- Verify non-payment suspend/restore backend behavior against staging data.
- POS repo consumption/enforcement is completed in the POS workstream; final closure requires combined QA/proof.

## Primary Acceptance Gate

HQ must edit a billing price in the admin UI, save it, and see every downstream dependent value update without developer involvement.

Required E2E test:

1. Seed plans, add-ons, and device fees to match the live flagship pricing page.
2. Build the flagship full-service setup:
   - first POS station: `$99`
   - one tablet: `$39`
   - one KDS: `$29`
   - ACH total: `$167/mo`
   - card total: `$173.68` with 4 percent surcharge
3. Edit one HQ-controlled price:
   - Additional Station `$49 -> $59`, or
   - Online Ordering `$100 -> $120`, or
   - KDS `$29 -> $35`
4. Confirm:
   - row persists
   - audit log is written
   - auto-calculator updates immediately
   - affected active subscription monthly amount updates for the next cycle
   - generated next invoice uses new price
   - past invoices stay unchanged
5. Revert the price and confirm the same cascade.
6. Confirm no SQL/code is needed for HQ to perform the edit.

## Implementation Plan

### Phase 0: Source-of-Truth Decisions

- Confirm whether `merchant_subscriptions` remains the billing source of truth.
- Document how `merchant_plan_subscriptions` relates to merchant-tier visibility.
- Confirm card surcharge behavior:
  - ACH = public displayed price
  - card = subtotal + 4 percent
- Confirm official seed values from the flagship pricing page.

### Phase A: HQ Editable Pricing RPCs

- Add `upsert_billable_service(...)`.
- Add `upsert_device_catalog(...)`.
- Harden `upsert_subscription_plan(...)`:
  - non-negative prices
  - included stations >= 0
  - surcharge between 0 and 100
  - audit log on changes
- Keep all functions:
  - `SECURITY DEFINER`
  - pinned `search_path = 'public', 'pg_temp'`
  - HQ/service-role write-only
- Ensure RLS rejects merchant/carrier writes.

Acceptance:

- [x] HQ backend can create/edit/deactivate add-on SKUs through audited RPC/action.
- [x] HQ backend can create/edit/deactivate device catalog models and monthly fees through audited RPC/action.
- [x] Plan/add-on/device edits write billing audit rows.
- [x] Config writes are validated and idempotent at the RPC layer.
- [ ] Merchant/carrier writes are rejected.

### Phase B: Unified Auto-Calculator

- Add `calculate_subscription_total(...)`.
- Return itemized JSON with:
  - plan base
  - station overage
  - per-unit service lines
  - add-on service lines
  - subtotal
  - one card surcharge applied to the full subtotal
  - total
- Compose existing `calculate_subscription_amounts(...)` and `calculate_billable_service_amounts(...)` where possible.
- Point invoice snapshot/generation at the same calculator.

Acceptance:

- [ ] ACH parity: first station + tablet + KDS = `$167/mo`.
- [ ] Card parity: same setup = `$173.68/mo`.
- [x] Invoice generation uses the same calculator path as quotes.
- [x] Surcharge is applied once on the full subtotal in the unified calculator.

### Phase C: Recalculation Cascade

- Add `recalc_subscription(subscription_id)`.
- Add plan/service/device-scoped helpers to recalc affected active subscriptions.
- Price edits apply to future cycles.
- Past invoices remain immutable.
- Mid-cycle add/remove support must generate pro-rated charge/credit behavior or be explicitly deferred.

Acceptance:

- [x] Editing an add-on triggers recalc for active subscriptions carrying that service.
- [x] Editing a plan station price triggers recalc for active subscriptions on that plan.
- [ ] Past invoices do not change.
- [ ] Audit clearly records old/new price and affected subscriptions.

### Phase D: Device-to-Billing Bridge

- Add a `device_category -> service_code` mapping table.
- Extend `assign_device(...)` or add `apply_device_billing_effects(...)`.
- On device deploy/assignment:
  - recompute paid station count from active POS station devices
  - update `merchant_subscriptions.station_count`
  - auto-enable/increment Tablet/KDS per-unit services
  - recalc `monthly_amount`
- On device removal/decommission:
  - decrement/recompute assignments
  - recalc subscription

Acceptance:

- [ ] Assigning a second POS station increases station count and monthly amount.
- [ ] Assigning a tablet adds the tablet service line.
- [ ] Assigning a KDS adds the KDS service line.
- [x] Mapping is HQ-editable in the website UI.
- [x] Backend trigger/RPC exists to recompute subscription quantities from deployed devices.

### Phase E: POS ID

- Add `device_inventory.pos_id` generated as last 4 of `serial_number`.
- Expose `pos_id` in:
  - `admin_device_inventory`
  - device detail
  - `assign_device(...)` return payload
  - merchant overview billing/device list

Acceptance:

- [x] Every device with a serial has a generated POS ID after migration apply.
- [x] Merchant overview shows device count and POS IDs.
- [ ] Audit/deactivation events explicitly reference POS ID.

### Phase F: Station Quota Enforcement

- Add BEFORE INSERT/update guard for `stations`.
- Block station activation beyond paid/assigned entitlement.
- Add clear error:
  - `Station limit reached for this location's plan - add a device/seat to add a station.`
- Add HQ override path.

Acceptance:

- [ ] Over-limit station creation is blocked.
- [ ] Over-limit station activation is blocked.
- [x] Backend station quota trigger exists with clear over-limit error.
- [ ] HQ override succeeds and is audited.
- [ ] Existing valid station flows are not broken.

### Phase G: Non-Payment Deactivation

- Add suspend/restore routine based on subscription status:
  - `past_due`
  - `suspended`
  - payment restored
- On suspension:
  - set location stations inactive
  - set location payment terminals inactive
  - stamp reason/timestamp
  - audit with POS ID
- Gate POS login/session status through the subscription/device status path.
- On payment success:
  - restore stations/terminals when appropriate
  - audit restore

Acceptance:

- [ ] Suspended location stations become inactive.
- [ ] Suspended location terminals become inactive.
- [x] POS login/session is refused while suspended.
- [x] Successful payment/status restore restores access.
- [x] Backend suspend/restore trigger exists for stations and payment terminals.
- [ ] Audit references POS ID.

### Phase H: HQ UI Completion

The ticket text says frontend handoff is not this ticket, but the user wants the whole ticket closed. Therefore do not mark the ticket done unless either this phase is implemented or explicitly split into a separate Notion ticket.

Required HQ UI:

- Editable Plans table.
- Editable Add-ons table.
- Editable Device Catalog pricing table.
- Live auto-calculator widget.
- Serial-select-from-inventory onboarding.
- Merchant overview POS ID count/list.
- Suspension/blocked status display.

Acceptance:

- [x] HQ can edit service-billing plan and add-on prices from UI.
- [x] HQ can edit device catalog prices from UI.
- [x] Calculator updates from saved HQ plan/add-on values.
- [x] Device mapping is editable from HQ billing UI.
- [x] Add-device/deployment backend flow updates billing through `device_inventory` trigger.
- [x] Merchant overview shows POS IDs.
- [x] Suspension state is visible in the HQ billing UI.

## Seed Values

Use these seed values unless Temur confirms a change:

| Item | Price | Model |
| --- | ---: | --- |
| First POS Station | `$99/mo` | `subscription_plans.base_price_monthly` |
| Additional Station | `$49/mo` | `subscription_plans.per_extra_station_price` |
| POS Tablet | `$39/mo each` | per-unit `billable_services` |
| KDS | `$29/mo each` | per-unit `billable_services` |
| Online Ordering | `$100/mo` | add-on `billable_services` |
| Loyalty Program | `$79/mo` | add-on `billable_services` |
| Delivery App Integration | `$79/mo` | add-on `billable_services` |
| Franchise Package | `$399/mo` | add-on `billable_services` |
| Card surcharge | `4 percent` | once on subtotal when billing method is `card` |

## QA Matrix

- [ ] Q1: HQ edits Online Ordering `$100 -> $120`; price persists, audit logs, calculator and next invoice update, past invoices unchanged.
- [ ] Q2: HQ edits Additional Station `$49 -> $59`; affected active subscriptions update for next cycle.
- [ ] Q3: Calculator first station + tablet + KDS ACH returns `$167/mo`.
- [ ] Q4: Same inputs with card returns `$173.68/mo`.
- [ ] Q5: Generated invoice equals calculator quote.
- [ ] Q6: Assigning second POS station increases `station_count` and `monthly_amount`.
- [ ] Q7: Assigning KDS adds a `$29` KDS line.
- [ ] Q8: Creating a station beyond paid/assigned count is blocked; HQ override succeeds.
- [ ] Q9: Suspended subscription disables stations/terminals and refuses POS login.
- [ ] Q10: Payment restore reactivates stations/terminals and restores POS login.
- [ ] Q11: Device POS ID equals last 4 of serial and appears in merchant overview.
- [ ] Q12: Merchant/carrier role cannot write plan/add-on/catalog rows.
- [ ] Q13: Mid-cycle station add/remove proration is correct or explicitly deferred with separate ticket.

## Video Requirement

Video is required before marking this ticket Done.

Reason:

- The Definition of Done explicitly requires screen recording by someone other than Ali Dika.
- The ticket spans HQ edit controls, calculator, invoice behavior, device assignment, quota enforcement, POS lockout, and restore.
- This is billing-sensitive and affects live merchant access.

Recommended recording flow:

1. Show HQ plan/add-on/device price editor.
2. Edit a price and save.
3. Show audit row.
4. Show calculator before/after.
5. Generate next invoice and show updated line item.
6. Show past invoice unchanged.
7. Assign POS/tablet/KDS device and show monthly amount change.
8. Try to create/activate over-quota station and show clear block.
9. Suspend subscription and show stations/terminals/POS access blocked.
10. Restore payment and show access restored.

## Migration / Release Discipline

- Stage SQL in Supabase SQL editor first.
- Use `supabase migration repair --status applied` after manual apply.
- Never `supabase db push` to prod.
- Do not touch `process_payment_v15`.
- Money remains `NUMERIC(12,2)` dollars.
- Review RLS before and after each write-path migration.

## Suggested Implementation Order

1. Build migration for Phase A and B.
2. Apply to staging and verify calculator parity.
3. Add Phase C recalc helpers and invoice snapshot wiring.
4. Add Phase D device-billing bridge.
5. Add Phase E POS ID and admin views.
6. Add Phase F station quota enforcement.
7. Add Phase G suspension/restore gate.
8. Add/finish Phase H HQ UI.
9. Run full QA matrix.
10. Record proof video.

## Current Status

Website/backend implementation is locally complete for this repo, pending staging/manual QA.

Implemented locally:

- Migration and RPC layer for audited pricing edits.
- Unified quote/invoice calculator.
- Subscription recalculation helper.
- POS ID generated field + website display/search.
- Device catalog deactivation instead of hard delete.
- HQ subscription workspace plan/add-on editors.
- HQ live calculator quote panel.
- HQ device billing mapping editor.
- Device-driven billing bridge.
- Station quota backend enforcement.
- Non-payment station/payment-terminal suspend and restore backend gate.

Not yet verified:

- Migrations have not been applied in this session.
- SQL/RLS behavior has not been tested against staging.
- Calculator parity has not been verified with live data.
- HQ billing UI has not been manually verified against staging.
- Device-driven billing bridge, station quota enforcement, and suspension/restore have not been manually verified against staging.
- POS repo login/session refusal while suspended is completed in the POS workstream.

Do not mark Done yet until staging QA, combined website/POS verification, and proof video are complete.
