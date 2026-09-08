# Website Reservations — Business Gap Audit

**Date:** 2026-08-29 · **Branch:** `feat/website-owner-ui` · **Scope:** the native reservations
path end to end — the four public endpoints, the SQL availability and write functions, the guest
widget and manage page, the merchant settings screen, and the notification layer.

This is a read of the **code as it stands**, not of the plan. It asks a different question from
[HANDOFF-2026-08-29-RESERVATIONS-QA.md](HANDOFF-2026-08-29-RESERVATIONS-QA.md): not "does it
work?" but **"does a restaurant that switches this on run its floor better than before?"** Where
the plan already names a gap as deferred, that is noted — a deferred gap is still a gap the
business feels.

Companion documents: [PLAN-2026-08-27-RESERVATIONS-SECTION.md](PLAN-2026-08-27-RESERVATIONS-SECTION.md)
for the phase map and decisions D1–D6,
[PLAN-2026-08-29-RESERVATIONS-QA-FIXES.md](PLAN-2026-08-29-RESERVATIONS-QA-FIXES.md) for defects
already in flight.

---

## 0. What is genuinely solid

Stated first because everything below is a gap in a **working** feature, and it would be easy to
read the list as a verdict on the build. It is not.

| Area | Evidence |
|---|---|
| **Double-booking under concurrency** | `pg_advisory_xact_lock` on `(location, date)` in both writers, with a re-check inside the lock — [20260828160000_reservation_public_write.sql](../../../supabase/migrations/20260828160000_reservation_public_write.sql) |
| **Guest data is never publicly readable** | No anon grant on any reservation table; every public read goes through a `SECURITY DEFINER` function returning an allowlist of columns |
| **Cancel links are unguessable and masked** | 256-bit `manage_token`, never the confirmation number; contact details masked in Postgres, not the browser |
| **Timezones** | Every "is it in the past / within lead time" comparison runs in the *location's* zone, not the server's |
| **Closing a branch does not strand guests** | [location-closure.ts](../../../lib/site-builder/reservations/location-closure.ts) cancels every future booking and notifies each guest, `cancelled_by = 'system'` |
| **Search visibility** | `Restaurant` + `ReserveAction` JSON-LD is emitted only when bookings are actually possible — [built-site.tsx:330](../../../app/sites/%5Bslug%5D/built-site.tsx#L330) |
| **Honest failure states** | A refused availability query is never rendered as "no tables" — the `loadFailed` flag in [ReservationWidget.tsx](../../../components/site-builder/reservations/ReservationWidget.tsx) |

The engineering is strong. **The business layer around it is where the holes are.**

---

## 1. Missing business capabilities

Tiered by what it costs a restaurant, not by effort.

### T1 — Costs covers in the first month

#### B1. There are no reminders. Nothing sets `reminded`, ever.

The status exists in the enum and in every blocking-status list. **No scheduled job anywhere in
the repo writes it.** A guest books three weeks out, receives one confirmation, and hears nothing
until the night itself.

Reminder messages the day before are the single largest no-show reducer in the industry —
typically 20–30% fewer no-shows. Today the restaurant loses the whole cover with no warning and
no chance to resell it.

> **Why this is cheaper than it looks:** `sms_opt_in` is already captured at checkout and defaults
> true, `message_log` already exists, and the templates in
> [reservation-templates.ts](../../../lib/messaging/reservation-templates.ts) are already written.
> The consent, the delivery path and the ledger are all built. Only the schedule is missing.

#### B2. Nothing at all protects against no-shows.

No deposit, no card on file, no guest history, no blocklist, not even a no-show count surfaced on
the incoming booking. The same person can book the same 8-top every Friday and never turn up,
indefinitely.

Deposits are explicitly deferred by **decision D2**, and that is a defensible v1 call. But the
*free* protections were deferred alongside them: reminders (B1), a visible no-show history, and a
"this guest has no-showed twice" flag on the reservation card. None of those need a payment
integration.

#### B3. The restaurant may never learn a booking happened.

Two independent failures, compounding:

1. The merchant alert is **email only**, and `notify_emails` defaults to an empty array —
   [20260828120000_reservation_availability.sql:242](../../../supabase/migrations/20260828120000_reservation_availability.sql#L242).
   A merchant who never opens that field is told **nothing at all**.
2. The dashboard does not update live. [useReservations.ts:37](../../../app/dashboard/hooks/useReservations.ts#L37)
   sets `staleTime: 30_000` with no `refetchInterval` and no realtime subscription.

So a booking placed at 6:40pm for 7:00pm can land with nobody looking at it. There is no SMS to
the host stand and no POS-side alert. `notifyWebsiteReservationBooked` does its job correctly — it
just has nowhere to send it by default.

**Minimum fix:** seed `notify_emails` with the owner's address when reservations are first
enabled, and add polling or a realtime channel to the reservations screen.

#### B4. When the restaurant moves a booking, the guest is never told.

[floor-plan-actions.ts:1036](../../../app/dashboard/actions/floor-plan-actions.ts#L1036) notifies
on create and [:1191](../../../app/dashboard/actions/floor-plan-actions.ts#L1191) on cancel.
**`UpdateReservationAction` — which changes the date, the time, the party size or the phone —
sends nothing.**

A host moves a 7:00 to 8:00 to fit the book, and the guest arrives at 7:00 knowing nothing about
it. This is worse than a no-show: it is a guest actively misled by the restaurant.

### T2 — Suppresses bookings and loses revenue quietly

#### B5. Guests can only cancel, never change.

There is no path to move 7:00 to 7:30, or 4 people to 6. Flagged unbuilt in the plan (Phase 6,
"change time"). In practice the guest cancels and rebooks — and **between those two steps someone
else can take the slot**, because cancelling frees the table immediately. A guest wanting to add
two friends risks losing the table entirely, so most will phone instead, which is the exact
outcome the feature exists to prevent.

#### B6. Past the cancellation cutoff, the only offered action is a phone call.

[ReservationManageActions.tsx](../../../components/site-builder/reservations/ReservationManageActions.tsx)
renders `CutoffNotice` with the venue's number instead of a button, and `cancel_public_reservation`
refuses with `cutoff_passed`.

At 6pm on a Friday nobody answers that phone. The guest then simply does not show. The restaurant
would far rather hear "I can't make it" forty minutes out — a late cancellation is a table it can
still resell; a no-show is not.

**The incentive is currently backwards:** not turning up is easier than cancelling, which is the
precise failure the plan's Phase 6 rationale says the manage page exists to avoid. A late-cancel
path that records the cancellation as late is strictly better than blocking it.

#### B7. Website guests never become customers.

`reservations.customer_id` exists ([schema.sql:3558](../../../schema.sql#L3558)) and
`create_public_reservation` **never sets it**. A guest who books online is invisible to the CRM:
no visit history, no regular recognition, no birthday, no lifetime value.

Worse, the checkout collects a **marketing opt-in** and that consent lands in a column nothing
reads. We are gathering a marketing list and discarding it — both a lost asset and a consent we
have no way to honour or evidence.

#### B8. No waitlist, and no "tell me if something opens up".

The `reservation_alerts` table was created in
[20260828120000_reservation_availability.sql:277](../../../supabase/migrations/20260828120000_reservation_availability.sql#L277)
and **nothing in the codebase reads or writes it**. Every sold-out night is a customer lost
outright rather than a captured lead — and a cancellation that frees a prime Saturday slot goes to
whoever happens to refresh.

The plan itself calls this "the best return of anything on the list once the core works."

#### B9. Half the checkout the merchant configures never appears to the guest.

The settings screen and the booking API both support occasion tags, dietary tags and
`collect_birthday`. **The checkout form asks for none of them** — `CheckoutView` in
[ReservationWidget.tsx](../../../components/site-builder/reservations/ReservationWidget.tsx) sends
only name, email, phone, special requests and the three consents.

A merchant sets up *Anniversary / Birthday / Gluten-free* and it silently does nothing. The kitchen
never receives an allergy in a structured form, and the occasion upsell — the highest-margin cover
a restaurant takes — is invisible.

Related dead wire: `showDetails` is declared at
[ReservationWidget.tsx:54](../../../components/site-builder/reservations/ReservationWidget.tsx#L54)
and passed from [ReservationsSection.tsx:151](../../../components/site-builder/sections/ReservationsSection.tsx#L151),
and is never read.

#### B10. Nobody can tell whether the feature is working.

`reservation_start` fires on the header button
([HeaderSection.tsx:202](../../../components/site-builder/sections/HeaderSection.tsx#L202)).
`reservation_complete` is **defined and never fired**
([tracking.ts:288](../../../lib/site-builder/tracking.ts#L288)).

There is no funnel: no "500 opened the widget, 12 booked". A merchant deciding whether the website
earns its subscription has no number to point at, and we have no way to see where guests drop out.

---

## 2. Edge cases not covered

These are not bugs today. They are situations a real restaurant reaches in its first busy month.

| # | Case | What happens now | Business consequence |
|---|---|---|---|
| **E1** | A party of 10 books | Gets the service period's fixed `turn_time_min`, same as a 2-top | The table behind is sold to someone arriving while the 10-top is on dessert. Turn time needs to scale with party size |
| **E2** | A party of 8 needs joined tables | The hold picks up to 3 combinable tables **by capacity, largest first**, with no section or adjacency check — [public_write migration](../../../supabase/migrations/20260828160000_reservation_public_write.sql) | Tables assigned on opposite sides of the room. The host discovers it at 7pm and re-seats by hand |
| **E3** | The restaurant wants to hold tables back for walk-ins | Impossible. No cap on the share of the floor sold online; the only lever is flagging individual tables non-reservable, which is permanent and blunt | Restaurants routinely hold back 30–40% for walk-ins and regulars. Today it is all-or-nothing per table |
| **E4** | Closed for a two-week holiday | 14 separate blackout rows, added by hand. `BlackoutInput` carries a single `date` — [blackouts.ts](../../../lib/site-builder/reservations/blackouts.ts). No ranges, no recurrence | A merchant will miss a day and take bookings for a night they are shut |
| **E5** | A guest in another timezone books | `todayIso()` in [ReservationWidget.tsx](../../../components/site-builder/reservations/ReservationWidget.tsx) reads the **browser** clock for the date picker's `min` | Someone in Europe booking a US venue late at night can be shown a minimum date that hides tonight's service entirely |
| **E6** | A guest presses Back to try another time | The hold is **not released** — `backToSearch` lets it lapse on its own | One indecisive guest holds three sets of tables for five minutes each. On a small floor plan that empties the grid for everyone else |
| **E7** | Someone books five fake tables | Rate limit is 5 per 15 minutes **per IP per site** ([book/route.ts](../../../app/api/site-reservations/book/route.ts)); no repeat-email or repeat-phone check, and neither is verified | A prank or a competitor can fill a Saturday night with bookings that cost real covers. The honeypot is the only defence |
| **E8** | Both the SMS and the email fail | Logged to `message_log`, `confirmation_sent_at` stays null, nothing retries and nobody is told | The guest has a table, no confirmation and no manage link. No dashboard surface shows "this guest was never confirmed" |
| **E9** | The guest wants it in their calendar | No `.ics` on the success screen or in the email (in the plan, unbuilt) | A booking that never reaches a calendar is the one that gets forgotten |
| **E10** | A guest asks us to delete their data | No path. Names, phones and emails of strangers are retained indefinitely with no retention policy | Worth checking against the platform's stated privacy commitments before this scales |
| **E11** | Expired holds accumulate | Never swept — the daily cron is Phase 9 and unbuilt | Harmless to correctness (`expires_at` is filtered at read time), but the table grows without bound |

---

## 3. Priority

If only three things are done before this goes in front of paying merchants:

| Rank | Item | Why this one |
|---|---|---|
| **1** | **B1 — reminders** | Largest single lever on no-shows. Consent, templates and delivery ledger already exist; only the schedule is missing |
| **2** | **B3 — the merchant actually being told** | A booking nobody sees is worse than no booking. Two small fixes: seed `notify_emails`, add live refresh |
| **3** | **B4 — notify the guest when the restaurant moves them** | The only item on this list where the product actively misleads a guest |

Then **B6** (late-cancel path) and **B7** (customer linkage), each roughly a day, and each
compounding with everything above.

Everything else is real but survivable in a v1.

---

## 4. What this audit did not cover

- Load and query performance of `get_public_reservation_availability` against a real floor plan.
- Whether the TypeScript ↔ SQL availability parity test still passes on this branch.
- Browser QA — see [HANDOFF-2026-08-29-RESERVATIONS-QA.md](HANDOFF-2026-08-29-RESERVATIONS-QA.md).
- The POS tablet's view of a `source='website'` reservation.
