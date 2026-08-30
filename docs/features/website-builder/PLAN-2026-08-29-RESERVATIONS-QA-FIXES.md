# Plan — fixing what the reservations browser QA found

**Date:** 2026-08-29 · **Branch:** `feat/website-owner-ui` · **Nothing is committed, and
nothing in this plan commits anything.**

**Source:** [HANDOFF-2026-08-29-RESERVATIONS-QA.md](./HANDOFF-2026-08-29-RESERVATIONS-QA.md)
Part 3. **Scope agreed:** items **#1–12** — Blocking, Functional gaps, and Built-but-never-
exercised. Housekeeping (**#13–16**) is explicitly out.

---

## Progress at 2026-08-29

**Both migrations are applied to staging.** Everything below is verified in a real browser
unless it says otherwise.

| Item | State |
|---|---|
| **#1** dashboard visibility | ✅ **Fixed and proven.** `RES-C5MLQQ` now renders on Fri 28 Aug under the right branch, with the Website badge |
| **#2** confirmation delivery | Code hardened; delivery still unproven — blocked on a valid `RESEND_API_KEY` |
| **#3** merchant alert | Blocked on the same key |
| **#4** location picker | ✅ **Built and proven** at 1440 and 390 |
| **#5** policy consent | ✅ **Built and proven** — required, unchecked, blocks submit; enforced server-side too |
| **#6** rest of Phase 5 | Party clamp, `9+` large-party fallback and the real booking window ✅ proven; the rest outstanding |
| **#9** header booking dialog | ✅ **Proven** — and a defect found and fixed on the way |
| **#7, #8, #10, #11, #12** | Not started |

### What the browser actually showed

- **#1** — scoped to `Joes Downtown Brooklyn Updated`, Friday 28 August: `RES-C5MLQQ`,
  `Playwright Tester`, `Website` badge. The screen that read `Active 0 / History 0`.
- **#4** — with `forceLocationChoice` **on**, the brand page now offers a **two-branch picker**
  where §1.2 recorded a phone number. Choosing a branch loads 32 real slots. Identical at 390.
- **#5** — checkbox `required`, unchecked by default, carrying the merchant's own policy text.
  Submitting without it is refused by the browser: *"Please check this box if you want to
  proceed."*
- **#6** — guest options `1 … 8 | 9+`, and choosing `9+` gives
  *"For parties of 9 or more, please call us at (347) 659-1866"* — **the branch's** number, not
  the site's. Date window `2026-08-29 → 2026-10-28`, exactly `max_advance_days = 60`.
- **#9** — dialog opens, `aria-modal="true"`, focus moves inside, body scroll locked, Escape
  closes it and returns focus to the trigger.
- **Header count** — exactly **one** booking entry at 1440, 800 and 390 (inside the collapsed
  menu at the two narrow widths). §1.4 holds.
- **Zero console errors** on every surface, in every run. All four public API routes still
  reach their handlers signed out — §1.1 holds.

### 🔴 A new defect, found by #9 and fixed

**The header's "Book a table" dialog opened onto an empty picker.** `HeaderSection` built its
own dialog config from `ctx.site.locationId` — the *pricing* location — and shipped **no branch
list at all**. So the button that is the feature's primary entry point could not book: the
exact §1.2 bug, one component over, which the #4 fix did not reach because the section and the
header each resolved a branch their own way.

Fixed by giving them **one** rule: `lib/site-builder/reservations/resolve-branch.ts`, which both
now call. The header also withholds the dialog entirely when nothing is bookable, so the anchor
falls back to navigating to the page that explains why.

This is the second time in this feature that two places answering the same question drifted
apart — the first was `GetLocations` vs `user_location_ids()` in #1. Both are now single
definitions with a test.

### Environment left as found

`forceLocationChoice` and `defaultLocationId` restored; the temporary `booking_policy` set to
exercise #5 cleared back to null. One five-minute hold was created during the policy test and
expires on its own.

### A correction to the QA recipe

`input[type="email"]` **no longer matches the sign-in form** — Clerk renders the field as
`input[name="identifier"]` with `type="text"`, so the documented selector times out. The
password-Enter trick still stands, and is still required (a `Continue` selector hits Google
OAuth). The sign-in page needs ~15s before its inputs exist.

### Deviations from this plan, and why

1. **#4 needed a migration after all.** The plan asserted "no new public endpoint, no
   migration". That was wrong: the public site renders through an **anon** client, and
   `20260828120000` grants anon zero row access to every reservation table — by design. The
   config now comes from `get_public_reservation_config`, SECURITY DEFINER and granted to
   `service_role` only, returning an allowlist of columns. Same shape as
   `get_public_reservation_availability`, and anon row access stays at zero.
2. **#1 grew a second half.** `GetLocations`' *non-admin* branch ignored
   `location_members.is_active` too, so a scoped staff member had the same picker/RPC
   disagreement. Now filtered, which narrows that branch to match the RPC.
3. **#1's "honest screen" is not being built.** With parity restored, "offered by the picker,
   refused by the RPC" can no longer happen for any role that exists, so a dedicated *"you do
   not have access"* state would be dead UI. The one live case left is HQ impersonation, which
   is out of scope and flagged below.
4. **Test infrastructure:** `vitest.config.mts` now aliases `server-only` to a stub. The real
   package throws on import outside a server component, which under Vitest turns "this module
   is server-side" into "this test file cannot load". Next still enforces the boundary at build
   time, and `render.test.tsx` guards the render graph by grepping source, so nothing is
   weakened.
5. **One pre-existing tsc error fixed in passing:** `ReservationsSection` still had a
   `mode === "link"` branch, unreachable since link mode was removed.

---

## 0. The one decision that changed on investigation

The handoff left **#1** unresolved: *"the most likely explanation is that this test account is
not a member of that location. It has **not** been proven either way."*

It is now proven, and the proof inverts the fix we chose before looking.

**Both bookings exist and are correct.** Read with the service role against staging:

```
RES-C5MLQQ  source=website  status=confirmed  2026-08-28 17:00  loc 657a703d…  merch 2add44cb…
RES-LNEARC  source=website  status=cancelled  2026-08-30 17:00  loc 657a703d…  merch 2add44cb…
```

Right merchant, right location, right status, right date. Nothing the reservations work wrote
is wrong. They are invisible because **the location picker and the RPC use two different,
disagreeing access models.**

| | Source of truth | Result for the QA account on `Joes Downtown Brooklyn Updated` |
|---|---|---|
| **Picker** — `GetLocations` ([get-locations.ts:70](../../../app/dashboard/actions/get-locations.ts#L70)) | Clerk `members.role` — owner/admin gets **every** merchant location | Offered |
| **Data** — `get_reservations` → `user_location_ids()` | `location_members` rows with `is_active = true` | Refused |

The QA account (`mikedoe`) has a `location_members` row for that branch with
**`is_active: false`**. So the picker offers a location the RPC will not answer for, and the
screen renders `Active 0 / History 0` — the same class of false answer as §1.2's "No tables
available". It is not reservations-specific: *no* booking on that branch is visible to that
account, from any source.

### Why we are **not** aligning the picker down to the RPC

That was the agreed option. The data says it would be a serious regression.

`user_location_ids()` has a second branch, meant to give merchant-level staff every location:

```sql
AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.code = ur.role_code
            WHERE ur.user_id = get_my_claim('sub')
              AND r.organization_type = 'merchant'
              AND r.level_type IN ('merchant', 'organization'))
```

**That branch is dead code.** Every merchant role in the `roles` catalog has `level_type` of
`admin`, `manager` or `member` — none is `merchant` or `organization` — and `user_roles` is
empty for these accounts anyway. It has never matched anyone and never can.

So `user_location_ids()` is, in practice, *only* the `location_members` branch. And the real
merchant **owner** on this org holds active membership on **one of five** locations:

```
owner (merchant.owner)  active membership: 8835e749 (Uptown Branch) + one NULL-location row
merchant locations:     5 (4 active)
```

Shrinking the picker to match would strip the owner of **four of their five locations across
the entire dashboard**, not just reservations. The picker's model is the correct one; the
RPC's is the broken one.

> **Recommendation, reversing the earlier choice: repair `user_location_ids()`.** If you would
> rather still shrink the picker, say so and I will build that instead — but I would be
> shipping a known regression, so I am not defaulting to it.

---

## 1. Blocking

### ☐ #1 — Website bookings not visible on `/dashboard/reservations`

**Root cause:** proven above. A dead merchant-level branch in `user_location_ids()` leaves the
helper meaning "active `location_members` rows only", which contradicts every screen that
resolves locations through `GetLocations`.

**Fix — one migration, replacing the dead branch with a helper that already exists:**

- [x] New migration replacing the `user_roles` branch of `user_location_ids()` with
      `is_merchant_owner(user_merchant_id())`.
      → `supabase/migrations/20260829120000_user_location_ids_merchant_admin_branch.sql`,
      with a rollback beside it. **Written, not applied.**
      **Why that helper and not `is_merchant_admin`:** `is_merchant_owner` reads
      `members.role IN ('merchant.owner','merchant.admin')` — *byte-for-byte the set
      `GetLocations` grants all-locations to*. `is_merchant_admin` also includes
      `merchant.manager`, which would make the RPC **broader** than the picker and open access
      nobody asked for. Both read the same Clerk `members` table the picker reads, so the two
      models stop being two models.
- [x] Keep the `location_members` branch untouched — non-admin staff must stay scoped.
- [x] Parity test asserting `GetLocations`' owner/admin set and `user_location_ids()` return
      the same locations for the same user, in the spirit of the existing
      `resolveReservationMode` ↔ SQL parity test.
      → The rule now has **one** definition, `lib/auth/merchant-location-access.ts`, which
      `GetLocations` imports and `merchant-location-access.test.ts` runs both predicates over
      (9 tests). The two legacy strings `org:admin` / `admin` remain a deliberate TypeScript-
      only widening — zero rows carry either on staging, production is unaudited, and dropping
      them could strip a real owner of their locations. The test pins that divergence so it
      stays a decision.
- [x] **Second half, found while fixing this:** `GetLocations`' non-admin branch ignored
      `location_members.is_active`, giving scoped staff the same disagreement. Now filtered.

**Blast radius, stated honestly:** `user_location_ids()` appears **75 times** in the schema —
RLS policies and RPCs across orders, floor plans, shifts, inventory and more. This migration
*widens* access for owners/admins only, and can never narrow: the existing branch is kept and
the added one is a union. No non-admin's access changes. It still needs a deliberate pass.

- [ ] Enumerate all 75 call sites; confirm each is a merchant-scoped read where an owner/admin
      seeing all their own locations is intended.
- [ ] Apply to staging, then re-run the QA account through reservations, orders and floor plan.

**Verify:** sign in as `mikedoe`, scope to `Joes Downtown Brooklyn Updated`, open 2026-08-28 →
`RES-C5MLQQ` appears with the **Website** source badge; 2026-08-30 History shows `RES-LNEARC`
cancelled.

**Dropped, with reason:** *"make the screen honest"* — a dedicated "you do not have access"
state. With parity restored, a location the picker offers is a location the RPC answers for,
so the false zero cannot occur for any role that exists. Building the state would be building
dead UI. The one case left is impersonation, below.

**Flagged, not fixed (out of scope):** under HQ **impersonation** the reservations screen is
already broken for an unrelated reason — an impersonating admin has no `staff_profiles` row,
so `user_merchant_id()` is `NULL` and `get_reservations` returns nothing regardless of this
migration. Pre-existing, wider than this feature, and worth its own ticket.

---

### ☐ #2 — No confirmation has ever been delivered

**Not a code defect.** The notification path runs on every booking, catches its own failures
and never breaks the booking — exactly as designed. Both providers rejected every attempt:
`RESEND_API_KEY` is invalid locally, and the QA booked `5555550123`, a non-routable number.

**You are supplying a valid key**, so this splits into config plus two real code gaps the
failure exposed.

- [ ] **You:** put a working `RESEND_API_KEY` (and `RESEND_FROM_EMAIL`) in `.env`, and give me
      a routable test phone number. Nothing below can be proven without both.
- [x] **Email sends are not logged.** `logOutboundMessage` already accepts `channel: "email"`,
      but [notify.ts](../../../lib/site-builder/reservations/notify.ts) called it for **SMS
      only**. Every failed confirmation email vanished into a server log with no durable trace.
      → All four `sendEmail` call sites now go through one `sendAndLogEmail` wrapper writing
      `channel: "email"` rows, **one per recipient** so a merchant alert to three addresses
      that bounced for one does not read as a single ambiguous failure. `message_log.channel`
      has no CHECK constraint and `to_number` is text, so no migration was needed.
- [ ] **Nothing surfaces to the merchant.** A booking whose confirmation bounced looks
      identical in the dashboard to one that arrived. Surface delivery state on the reservation
      — `confirmation_sent_at` is already the honest signal; show it, and show when it is absent.
- [ ] Re-book end-to-end and confirm a real email lands and `confirmation_sent_at` is stamped.

**Verify:** one booking → guest email received, guest SMS received, `confirmation_sent_at`
non-null, one `message_log` row per channel.

---

### ☐ #3 — Merchant alert has never executed

**Confirmed on staging:** `reservation_settings.notify_emails` for the QA location is `[]`, so
the branch was skipped entirely. The editor exists
([ReservationsScreen.tsx:746](../../../components/site-builder/dashboard/ReservationsScreen.tsx#L746))
and the write path exists (`reservations-settings.ts:259`). The path is unproven, not missing.

- [ ] Populate `notify_emails` through the merchant UI — not by direct SQL, since that write
      path is exactly the half that has never run.
- [ ] Book, and confirm the merchant alert arrives with the guest's **unmasked** contact
      details and **no** `manageUrl` (notify.ts sets it null deliberately; assert it).
- [ ] Cancel, and confirm the cancellation alert arrives.
- [ ] Confirm de-duplication: enter the same address twice in different cases → one email.

**Verify:** depends on #2's key. Runs in the same session.

---

## 2. Functional gaps

### ☐ #4 — No location picker (Phase 5)

Today a brand page that resolves no branch shows a phone number. Honest, but not the feature.

**The architectural constraint that decides the design:** `ReservationsSection` is a **server
component that must not be `async`** — the builder canvas renders the section graph through
`renderToStaticMarkup`, which cannot await. So the section cannot fetch. It already solves
this by serialising config into `data-dexa-reservations` for `ReservationRuntime` to portal into.

- [x] Load bookable locations in **`buildPublicRenderContext`** (already async, already the
      public-only path) and hang them on `ctx` — never in the section, never client-side.
      Builder and preview get an empty list and keep their static mock.
      → `RenderSite.reservations`, defaulted empty in `createRenderContext`, and gated on
      `resolveReservationMode(...) === "native"` so a site without bookings pays nothing.
- [x] Serialise the list into the existing `data-dexa-reservations` payload.
      **Correction:** this DID need a migration — see Deviation 1. `get_public_reservation_config`
      + `lib/site-builder/reservations/config.ts`, which never throws: a reservations outage
      degrades the section to a phone number rather than blanking the merchant's site.
- [x] Widget gains a `location` step **before** `search`, skipped entirely when exactly one
      location is bookable — the common case, and today's behaviour, which must not regress.
- [x] Each option shows its address.
- [x] The phone-number fallback stays for the genuine no-bookable-location case.
- [x] **Beyond the plan:** a pinned branch is now honoured *only if it is genuinely bookable*.
      A section pinned to a branch that has since switched bookings off used to render a widget
      that queried forever and reported an empty grid. It now falls through to the picker.
- [ ] The grid labelled in **that location's** timezone, never the visitor's — the zone is
      carried on `BookableLocation` but the grid does not yet use it.

**Verify:** `forceLocationChoice` back **on** (Part 6 left it off) → the brand page offers a
picker, not a phone number. Single-location merchant sees no extra step.

### ☐ #5 — No cancellation-policy checkbox at checkout

`booking_policy` is stored and shown on the manage page; the guest never agrees to it. The
plan specified it **required and unchecked**.

- [x] Ship `booking_policy` (plus `collect_birthday`, `large_party_phone`, party-size bounds,
      `max_advance_days`) through the same `ctx` → data-attribute channel as #4. The
      availability RPC returns **only slots** by design and was not widened.
- [x] Required, unchecked checkbox in `CheckoutView`; submit blocked until ticked (native
      `required`, so it works before our JavaScript does); rendered only when the location
      actually has a policy.
- [x] Enforce server-side in `/api/site-reservations/book` too. Placed **after** the rate limit
      so it cannot be used to probe which branches have a policy.

**Verify:** a location with a policy cannot be booked without ticking; one without a policy
shows no checkbox and books as before.

### ☐ #6 — Rest of Phase 5

Ordered by value. All of these are UI over data the API already carries — **the book route
already forwards `occasionTags` and `dietaryTags` to the RPC; the widget simply never collects
them.**

- [x] **Large-party fallback** — over `max_party_size`, shows *"For parties of N or more,
      please call us at {large_party_phone}"* instead of an empty grid. The select offers one
      entry **past** the maximum on purpose: choosing it is how a guest reaches that message,
      rather than finding the control simply stops and learning nothing.
- [x] **Party size clamped** to the branch's range, and re-clamped when the branch changes,
      since two branches may seat different parties.
- [x] **Real booking window** — the date input now caps at the branch's `max_advance_days`
      instead of a flat 365.
- [ ] **Occasion / dietary accordions** — collapsed, so the form still *looks* like four fields.
- [ ] **Birthday** `mm`+`dd`, only when `collect_birthday`.
- [ ] **Two-month date picker**, days past `max_advance_days` disabled but rendered. Today it
      is a bare `<input type="date">` capped at a flat 365 days.
- [ ] **`Other dates with availability`** — next 3 dates as outlined chips. `showOtherDates` is
      already a section prop and currently only changes a sentence.
- [ ] **`.ics` download** on the success view.
- [ ] **Phone country selector.**
- [ ] **`Alert Me`** as the last grid cell — the cell here, the behaviour in #8.

### ☐ #7 — "Change time" on the manage page

- [ ] Release → re-run availability → re-book, **reusing the Phase 5 widget** rather than a
      second implementation. Depends on #4/#5/#6 landing first.
- [ ] The old booking must not be released until the new one is confirmed, or a guest loses
      their table to a failed re-book.

### ☐ #8 — Phase 9

- [ ] `POST /api/site-reservations/alert` + the modal. **Add it to `isPublicApiRoute` in
      `proxy.ts` in the same commit** — this is the fifth public endpoint, and three of the
      first four shipped behind Clerk (§1.1).
- [ ] Notify matching `reservation_alerts` when a cancellation frees a slot.
- [ ] JSON-LD `acceptsReservations` + `ReserveAction` in `json-ld.ts`.
- [ ] Tracking: `reservation_slot_selected`, `reservation_cancelled`,
      `reservation_alert_created` (`reservation_start` and `reservation_complete` exist).
- [ ] Daily cron sweeping stale holds and expired alerts.

---

## 3. Built but never exercised

Verification, not construction. Run with the `playwright-browser-qa-recipe` harness: system
Chrome via `channel: "chrome"`, `domcontentloaded` plus explicit waits.

- [ ] **#9 — the header booking dialog.** Link presence and counts were checked at three
      widths; it was never **clicked**. Prove it opens, traps focus, restores focus to the
      opener on close, locks body scroll, and books. It is the primary booking entry point.
- [ ] **#10 — blackout-dates editor.** Unit-tested only. Set a blackout in the dashboard, then
      confirm the public grid refuses that date.
- [ ] **#11 — archiving a location** cancels its future bookings with `cancelled_by = 'system'`
      **and notifies those guests**. Untested, and it sends mail to real people — gated on #2's
      key so the notification half is actually observable.
- [ ] **#12 — concurrency.** Covered by `phase3-smoke-test.sql` in SQL, never through two
      browsers. Two sessions race the last table → one booking, one clean failure, no double.

**Every one of these runs signed out, where a guest would be.** That single check is what
found §1.1, and it is cheap:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://localhost:3000/api/site-reservations/hold" \
  -H "content-type: application/json" -d '{}'
# 307 = eaten by middleware.  4xx = reaching the handler.
```

---

## 4. Sequencing

1. **#1** first and alone. It is the only item that touches app-wide RLS, and everything else
   is easier to verify once a merchant can actually see their bookings.
2. **#2 + #3** together, the moment the Resend key lands. One booking proves both.
3. **#9–#12** next — verifying code that already exists finds defects before we build more on
   top of it.
4. **#4 → #5 → #6** in that order; #5 and #6 both ride the `ctx` channel #4 establishes.
5. **#7** after #6, because it reuses the widget.
6. **#8** last; it is the only genuinely optional item.

Re-run the full suite (1049 tests / 61 files) plus **`tsc --noEmit`** after each item. The
handoff's `linked` ReferenceError survived a clean build and 938 green tests — this repo sets
`ignoreBuildErrors: true`, so `tsc` is not optional here, it is the only thing that checks.

**Nothing gets committed.** The branch also carries unrelated in-progress work — device
preview, canvas, store.

---

## 5. What I need from you

| # | Need | Blocks |
|---|---|---|
| 1 | Confirm the reversal in §0 — repair `user_location_ids()` rather than shrink the picker | #1 |
| 2 | A valid `RESEND_API_KEY` + `RESEND_FROM_EMAIL` in `.env` | #2, #3, #11 |
| 3 | A routable test phone number | #2 |
| 4 | Whether the #1 migration may be applied to **staging**, or must stay a file for review | #1 |
