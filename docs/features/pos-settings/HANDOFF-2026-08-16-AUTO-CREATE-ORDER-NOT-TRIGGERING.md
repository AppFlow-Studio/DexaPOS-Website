# POS Auto-Create Order Not Triggering

**Reported:** 2026-08-16 through the Dexa support system
**Surface:** POS tablet order flow
**Repository owner:** Dexa-POS
**Website status:** Not applicable; handoff recorded
**POS status:** Investigation and implementation pending in Dexa-POS

## Report

After enabling `Auto-create orders` on Samir's tablet, opening or completing the order flow did not automatically create the expected order.

## Repository Triage

The website repository does not expose or execute this setting. The POS repository owns the complete behavior:

- `stores/useStoreSettingsStore.ts` persists `autoCreateOrder`.
- `app/(main)/settings/order-line.tsx` controls the setting.
- `app/(main)/order-processing.tsx` eagerly selects or creates the order.
- `stores/usePaymentStore.ts` starts the next order after payment.

The POS repository was inspected read-only and already contained unrelated local changes. No POS file was modified from this website ticket branch.

## POS Investigation Plan

- Confirm the toggle persists after leaving settings and restarting the app.
- Capture station type, selected station, active order, and reusable draft state.
- Test entering Sales with no active order.
- Test completing payment and observing creation of the next order.
- Check whether an existing empty draft was reused, making creation appear to fail.
- Check effects and store hydration for a stale pre-toggle value.

## Acceptance Criteria

- Enabling the setting persists after restart.
- Entering Sales with no active order creates or activates an empty draft.
- Completing a quick-service/takeout payment starts the next order.
- Disabling the setting leaves the order screen empty until `New Order` is selected.
- Dine-in session safeguards remain unchanged.

## Handoff

Implement and verify this ticket in Dexa-POS. Website and shared-database changes are not indicated by the current contract.

No website migration, component, action, or package file was changed for this
report.
