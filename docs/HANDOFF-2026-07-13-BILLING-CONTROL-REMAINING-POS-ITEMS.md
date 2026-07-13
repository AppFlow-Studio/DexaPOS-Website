# Billing Control - Remaining POS Repo Items

## Ticket

`[BILLING][HIGH] DEXA HQ self-service billing control - editable plans / add-ons / device pricing, add-on-aware auto-calculator, device-driven billing, POS ID, station quota & non-payment deactivation`

## Website/Backend Status

The website repo implementation is locally complete pending staging QA.

Implemented in the website repo:

- HQ editable service-billing plans.
- HQ editable billable services/add-ons.
- HQ editable device-category to billable-service mappings.
- Unified subscription calculator and invoice generation alignment.
- Device-driven billing sync from deployed `device_inventory` rows.
- POS ID generation/exposure on website device surfaces.
- Station quota backend trigger.
- Subscription suspend/restore backend gate for stations and payment terminals.

Relevant website migrations:

- `supabase/migrations/20260712120000_hq_self_service_billing_control_phase1.sql`
- `supabase/migrations/20260713130000_hq_billing_device_bridge_and_access_gates.sql`

## Remaining POS Items

1. POS suspended access gate
- POS app must refuse login/session use when the location subscription is `suspended`.
- The refusal should be clear and billing-specific, not a generic auth or sync failure.

2. POS quota error handling
- When backend station activation/create is blocked by `enforce_station_subscription_quota(...)`, POS should surface:
  - `Station limit reached for this location's plan - add a device/seat to add a station.`
- Do not swallow this as a generic station-save failure.

3. POS local state sync after suspension/restore
- When website/backend suspension disables stations or payment terminals, POS should sync the inactive state.
- When subscription status is restored to `active` or `trial`, POS should sync the restored station/payment-terminal state.

4. POS proof video
- Record a tablet flow showing:
  - normal access while subscription is active,
  - blocked access while suspended,
  - clear suspended billing message,
  - restored access after payment/status restore,
  - over-quota station create/activation blocked with the expected message.

## Website QA That Must Happen Before POS Final QA

- Apply both website migrations to staging.
- Verify calculator parity:
  - first station + POS tablet + KDS via ACH = `$167.00`.
  - same setup via card = `$173.68`.
- Verify generated invoice line items match the live calculator.
- Verify device assignment/deployment updates station count and mapped device service quantities.
- Verify station quota trigger blocks over-entitlement station creation/activation.
- Verify `suspended` disables stations/payment terminals and `active` or `trial` restores the snapshot.
