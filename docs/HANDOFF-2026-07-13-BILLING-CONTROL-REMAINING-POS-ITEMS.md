# Billing Control - POS Completion Handoff

## Ticket

`[BILLING][HIGH] DEXA HQ self-service billing control - editable plans / add-ons / device pricing, add-on-aware auto-calculator, device-driven billing, POS ID, station quota & non-payment deactivation`

## Status

POS-side implementation is complete for this ticket, based on the latest handoff from the POS repo workstream.

This file replaces the earlier remaining-POS-items note. Keep the filename for reference continuity, but the content now reflects completion.

## Website/Backend Contract POS Consumes

Relevant website migrations:

- `supabase/migrations/20260712120000_hq_self_service_billing_control_phase1.sql`
- `supabase/migrations/20260713130000_hq_billing_device_bridge_and_access_gates.sql`

Backend behavior POS depends on:

- `merchant_subscriptions.status = 'suspended'` means billing access is blocked.
- `apply_subscription_access_state(...)` disables stations/payment terminals on suspension.
- Restoring status to `active` or `trial` restores the pre-suspension station/payment-terminal snapshot.
- `enforce_station_subscription_quota(...)` blocks station activation/create beyond entitlement.
- Over-quota backend error text:
  - `Station limit reached for this location's plan - add a device/seat to add a station.`

## POS Work Completed

- POS refuses login/session use when the location subscription is `suspended`.
- POS shows a billing-specific suspended access message instead of a generic auth/sync failure.
- POS surfaces station quota errors clearly.
- POS syncs local station/payment-terminal state after backend suspension.
- POS syncs restored station/payment-terminal state after subscription status returns to `active` or `trial`.
- POS proof flow is ready to record or attach for final ticket closure.

## POS QA Checklist

- [ ] Active subscription allows POS login/session.
- [ ] Active subscription allows station/payment-terminal access.
- [ ] Suspended subscription blocks POS login/session or blocks the current session with a billing-specific message.
- [ ] Suspended subscription prevents station/payment-terminal access.
- [ ] Over-quota station create/activation shows the expected quota message.
- [ ] Restored subscription status (`active` or `trial`) restores POS login/session access.
- [ ] Restored subscription status syncs station/payment-terminal state back to usable.
- [ ] Proof video attached.

## Final Closure Dependency

No POS coding items remain from this website ticket. Closure still requires the combined website + POS QA proof video and successful staging/prod migration verification.
