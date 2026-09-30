# Devices → Support: report an issue from a device

**Status:** built, verified locally on 2026-09-26. Not committed, not deployed.
**Branch:** `dexaposwebsite-preview`
**Migrations:** none. Every table and column this needs already existed.

## Why

`/dashboard/devices` was a dead end. The registry is HQ-owned and read-only, so
the page could tell a merchant that their printer was in repair but gave them no
way to say "and it is still broken". The most common reason to open the page —
*my printer is broken, help* — had no landing place, and the device timeline
already spoke of "support notes" the merchant could not create.

The plumbing for the fix was already in the schema and unused:

- `support_tickets.category = 'hardware'`, with a free-form `metadata jsonb`
- `device_notes.external_ticket_id` — a column whose only purpose is to tie a
  device note to a ticket, rendered by the activity feed as "Ticket X"
- `CreateTicket()` already took `metadata` and ran on the service-role client

Both ends existed. Nothing connected them.

## The flow

1. **Devices page** — every row and the device dialog carry *Report an issue*,
   linking to `/dashboard/support/new?device=<uuid>`.
2. **Support form** — reads the param, loads the device, and locks category to
   Hardware and location to the device's. Symptom chips (per device category)
   seed the subject. A read-only device card shows exactly what support will
   receive.
3. **Submit** — the device snapshot goes into ticket `metadata`; the server
   writes one `device_notes` row with `external_ticket_id = ticket_number`. The
   merchant lands on the ticket thread, as before.
4. **Back on the device** — the dialog shows an open-ticket band linking to the
   conversation, the row shows the ticket number, and the ticket appears in the
   device's own support history.

While a device has an open ticket, *Report an issue* steps back to secondary and
*View conversation* becomes the primary action: a merchant who already asked for
help should not be invited to ask twice.

## Constraints honoured

- **`device_notes` is HQ-insert-only** under RLS and has an append-only trigger
  blocking UPDATE/DELETE. The note is therefore written server-side on the
  service-role client, and never rewritten — a later state change appends.
- **Ownership is re-checked on both sides.** The device id arrives from a query
  string, so `getMerchantDevice` scopes by `merchant_id` on read and
  `linkTicketToDevice` re-checks before writing. A crafted id cannot write a
  note onto another merchant's device.
- **A failed note never fails the ticket.** The report is the merchant's goal;
  the note is a convenience. Failures log and continue, like the existing
  notification warning.
- **DS-CTL-09.** Status pills stay uncoloured. Urgency is carried by the
  attention band, which names the device rather than tinting its status.

## Also fixed on the page

- **Stat tiles are filters.** `StatTile` already supported `onClick`/`isActive`;
  the tiles now apply the status filter and toggle off when pressed again.
  Counts moved to a pre-filter `scopedDevices` set, so filtering to one tile no
  longer zeroes the other three.
- **Attention band** above the list names the device that needs help.
- **Warranty dates** show under the badge (`Until Mar 14, 2027` /
  `Ended Jan 2, 2026`) instead of `Warranty active` alone.
- **Row restructured.** It was a single `<button>`; a link cannot nest inside
  one. The row is now a group: a button for the history, a link for the report.
- **HQ ticket context** (`buildSupportTicketContext`) leads with the device —
  serial, model, location, registry status, warranty, firmware, MAC — so an
  agent never has to ask for a serial number. The old `Device` label, which
  actually meant the submitting browser, was renamed `Submitted from`.

## Files

| File | Change |
|---|---|
| `app/dashboard/devices/page.tsx` | Report buttons, ticket band, tile filters, attention band, row restructure |
| `app/dashboard/support/new/page.tsx` | `?device=` param, device card, symptom chips, locked category/location |
| `app/dashboard/actions/support.ts` | `deviceId` input, `linkTicketToDevice`, `GetDeviceTicketLinks` |
| `app/dashboard/actions/device-registry.ts` | `getMerchantDevice` |
| `app/dashboard/hooks/useSupport.ts` | `useDeviceTicketLinks`, invalidations |
| `app/dashboard/hooks/useDeviceRegistry.ts` | `useMerchantDevice` |
| `components/support/DeviceContextCard.tsx` | new |
| `lib/support/device-symptoms.ts` | new — symptom chips per device category |
| `lib/support/ticket-context.ts` | device block for the HQ ticket view |
| `types/device-registry.ts` | `DeviceSupportTicketLink` |
| `lib/support/__tests__/ticket-context.test.ts` | new — 4 tests |

## Verified

Browser E2E on `localhost:3000` as Joes Coffee Shop, 2026-09-26, 0 console errors:

- Row *Report issue* → form pre-filled with TEST-PRN-0002, printer-specific
  symptoms, category and location hidden
- Symptom chip → subject `TEST-PRN-0002 — not cutting paper`
- Submit → ticket `DEXA-00014` created, landed on the thread
- Device dialog → ticket band, *Report another issue*, and the support note in
  the timeline tagged `Ticket DEXA-00014`
- Tiles → filtering to "Needs attention" shows only the printer; counts stay
  2/1/1/1; pressing again clears

`tsc` clean on every touched file (two pre-existing errors remain in
`audit-logs.ts` and `types/merchant_locations.ts`). ESLint clean apart from the
pre-existing `watch()` React Compiler warning. Vitest 4/4.

## Left out, deliberately

- **Urgency / priority.** The design had a "can still trade" vs "stopping
  service" control, but `create_support_ticket` has no `p_priority` parameter —
  it would need a migration to the RPC. Shipping a control that silently does
  nothing is worse than not shipping it. Open item.
- The plain-English rewrite of the device timeline's raw titles
  (`deployed -> in_repair`) shown in the mockup. Same defect class as the
  Activity Log's fallback sentences; worth doing as one pass across both.
