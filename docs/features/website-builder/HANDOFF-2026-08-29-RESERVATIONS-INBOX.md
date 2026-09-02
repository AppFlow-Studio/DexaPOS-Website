# Handover — a reservations inbox

**Date:** 2026-08-29 · **Branch:** `feat/website-owner-ui` · **Status: planned, not built.**
No code, no migration. This file is the research, so whoever picks it up does not have to
rediscover any of it.

> **The open decisions in §4 have been answered.** See
> [`PLAN-2026-08-29-WEBSITE-INBOX.md`](./PLAN-2026-08-29-WEBSITE-INBOX.md) — the inbox became a
> combined **forms + reservations** inbox at `/dashboard/website/inbox`, and §3.2's read-state
> question was settled as a per-merchant `read_at`.
>
> **Two things this file did not know:**
>
> 1. **A merchant notification bell already exists** and is wired into the dashboard —
>    `app_notifications` + `ReadOnlyNotificationBell`, realtime, per-user read state. It is the
>    one merchant channel that works, and it now lives in
>    [approval mode §4.9](./PLAN-2026-08-29-RESERVATION-APPROVAL-MODE.md).
> 2. **The inbox ships second**, after
>    [`PLAN-2026-08-29-RESERVATION-APPROVAL-MODE.md`](./PLAN-2026-08-29-RESERVATION-APPROVAL-MODE.md).
>    Once bookings can be `pending`, *"needs an answer"* outranks *"unread"* as the thing the
>    screen is organised around — so §1's framing of the inbox as purely an awareness surface is
>    superseded.

Scope of this document is **the inbox only**. Everything else about website reservations lives
in its own handovers.

---

## 1. Why it exists

**A merchant currently has no way of being told that a table was booked.** They find out only by
going and looking. Verified 2026-08-29:

| Path | Push or pull? | State |
|---|---|---|
| `/dashboard/reservations` day view | Pull | Works — booking appears on its date with a **Website** badge |
| POS floor plan (`get_floor_snapshot_v1`) | Pull | Live: returns `next_reservation` per table. Website bookings do get `assigned_table_ids`. **Today's date only** |
| Merchant alert email → `reservation_settings.notify_emails` | Push | **Has never fired.** The list is empty on the test location, and the Resend key is invalid |
| Audit log (`website_reservation_created`) | Neither | Written, but it is a record for later, not a notification |

There is no SMS alert to the merchant at all — the alert path is email-only, though Telnyx works
and Resend does not.

**And for a multi-location merchant it is worse.** `/dashboard/reservations` is strictly **one
branch, one day**. On "All Locations" it renders *"Select a specific location to view
reservations."* while the Active / Covers / History tiles still read `0` — another false zero: it
is not zero, it is unasked. Checking five branches means switching location, **reloading** (the
server reads an `x-location-id` cookie), reading one day, and repeating. Per branch, per day.

**The day view and an inbox answer different questions, and both are needed.**

- Day view — *"who is coming tonight"* (service operations)
- Inbox — *"what has arrived since I last looked"* (awareness, across branches)

Only an inbox can carry a **Branch** column, because the day view is structurally single-branch.

---

## 2. The prior art to copy

`SubmissionsScreen` — the forms inbox — is the model, and it is deliberately close to what is
needed here.

| File | What to take from it |
|---|---|
| [`components/site-builder/dashboard/SubmissionsScreen.tsx`](../../../components/site-builder/dashboard/SubmissionsScreen.tsx) | 285 lines. Newest-first list, unread state, per-row notification status, **CSV export as the primary action** (a button, not a menu item) |
| [`app/dashboard/website/actions/forms.ts:359`](../../../app/dashboard/website/actions/forms.ts#L359) | `ListSubmissions` — one query, `.order("created_at", { ascending: false })`, `limit` capped at 500 (default 200) |
| [`app/dashboard/website/actions/forms.ts:426`](../../../app/dashboard/website/actions/forms.ts#L426) | `MarkSubmissionRead(clerkOrgId, submissionId, read)` — writes `read_at` as a timestamp or null. Two-way, so a row can be marked unread again |
| [`app/dashboard/website/forms/[formId]/submissions/page.tsx`](../../../app/dashboard/website/forms/%5BformId%5D/submissions/page.tsx) | The route shape: `force-dynamic`, `auth()` → `orgId`, load, hand a server-rendered list to the client screen |

**The most useful fact:** `ListSubmissions` scopes by `form_id` **only — never by location**. The
forms inbox is already merchant-wide. That is exactly the shape reservations needs, and it means
the pattern does not have to be bent to fit.

---

## 3. What the research settled

### 3.1 Listing needs no migration ✅

The `reservations` RLS policy is merchant-wide, not location-scoped:

```sql
CREATE POLICY "Admin Write" ON public.reservations
  AS PERMISSIVE FOR ALL TO public
  USING (is_merchant_admin(merchant_id))
  WITH CHECK (is_merchant_admin(merchant_id));
```
[`supabase/migrations/20260414000002_policies_and_indexes.sql:24`](../../../supabase/migrations/20260414000002_policies_and_indexes.sql#L24)

`is_merchant_admin` admits `merchant.owner`, `merchant.admin`, `merchant.manager` (plus
`is_dexapos_admin()`), reading the Clerk `members` table.

So a plain `.from("reservations").select(...)` through `createServerSupabaseClient()` returns
**every branch** under existing RLS. **No new RPC, no migration, no `user_location_ids()`
involvement** — the day view only needs one because `get_reservations` takes a single
`p_location_id` and a single `p_date`.

### 3.2 Unread state DOES need a migration ⚠️

This is the one thing that is not free, and it is easy to miss.

`reservations` has **no `read_at`** — confirmed against the live table. Its 45 columns include
`created_at`, `updated_at`, `confirmation_sent_at`, `last_notification_at`, `reminder_sent_at`,
`seated_at`, `arrived_at`, `cancelled_at`, `no_show_marked_at` — every timestamp except one for
"a human has seen this".

Options:

1. **`read_at timestamptz` on `reservations`** — mirrors `site_form_submissions` exactly, one
   column, simplest. Downside: read state is per-*merchant*, not per-user, so one manager
   reading clears it for everyone.
2. **A join table** (`reservation_reads(reservation_id, user_id, read_at)`) — per-user, correct
   for a restaurant with several managers, but more machinery and a nullable-left-join on every
   listing query.

Whichever is chosen, it needs a migration, `updated_at` trigger conventions, and RLS. **Decide
this before building** — it is the difference between a one-column change and a new table.

### 3.3 Sort by `created_at`, not `reservation_date`

An inbox sorted by *service* date buries a booking made this morning for next month behind
tonight's covers. The inbox is a record of **arrival**; the day view already owns service order.

### 3.4 Nav placement is genuinely awkward

"Reservations" **already appears twice** in the merchant sidebar
([`app/dashboard/layout.tsx`](../../../app/dashboard/layout.tsx)):

| Line | Title | URL | What it is |
|---|---|---|---|
| 150 | Reservations | `/dashboard/reservations` | The day view — service operations |
| 235 | Reservations | `/dashboard/website/reservations` | Website settings — the on/off switch, per branch, blackouts |

A third entry called anything like "Reservations" would make three. Worth solving deliberately
rather than appending — this codebase already carries a comment at line 236 about naming a
sidebar item badly ("NOT *Analytics* — it shows no data, and a merchant who clicks Analytics
expecting visitor numbers files a support ticket").

---

## 4. Open decisions

None of these can be inferred from the code; they need a product answer.

1. **Where does it live?** Under `Website` beside Forms (it is the website's output), or beside
   the day view under top-level `Reservations` (it is reservation data)? The second is where a
   merchant would look; the first is where the pattern it copies lives.
2. **Does it replace the day view, sit beside it, or become a tab within it?**
3. **Read state per-merchant or per-user?** §3.2 — decides the migration.
4. **Website-only, or every source?** A `source` filter (Website / POS / phone) makes it the
   merchant's single arrival log. Website-only is narrower but matches "how do I know the site
   is producing bookings".
5. **Is an unread count needed in the sidebar?** That is the thing that actually replaces a push
   notification, and it changes the layout query.
6. **Does it need CSV export?** It is the *primary* action in the forms inbox, and reservations
   are more obviously exportable than form answers.

---

## 5. Likely shape, once decided

- **Columns:** Received (`created_at`), **Branch**, Guest, Party, Service date + time, Source
  badge, Status, Confirmation number.
- **Row action:** open the existing `ReservationDetailSheet` rather than building a second
  detail view — [`app/dashboard/reservations/components/ReservationDetailSheet.tsx`](../../../app/dashboard/reservations/components/ReservationDetailSheet.tsx)
  already exists and already carries the Website badge.
- **Filters:** branch, source, status, date range.
- **Cap:** 200 rows default, 500 max, matching `ListSubmissions`.

---

## 6. Facts worth not re-deriving

- Website bookings are written by `create_public_reservation` with `source = 'website'`,
  `status = 'confirmed'`, and `assigned_table_ids` populated from the hold.
- `confirmation_sent_at` is `null` on **every** website booking so far — correct behaviour,
  recording that nothing was ever delivered. An inbox showing delivery state would surface that
  honestly, which is arguably its second-best feature after the Branch column.
- The `Website` source badge already exists: [`lib/constants/reservation-source.ts`](../../../lib/constants/reservation-source.ts).
- Test data on staging (merchant `2add44cb…`, site `ff9ce22f…`): four `source='website'`
  reservations across two branches, one confirmed and three cancelled.

---

## 7. Why it was not built

Raised by the user twice on 2026-08-29. When scoping the branch-choice work, "also the
reservations inbox" was offered as an option and **branch choice and naming only** was chosen —
so this was deliberately deferred, not forgotten.
