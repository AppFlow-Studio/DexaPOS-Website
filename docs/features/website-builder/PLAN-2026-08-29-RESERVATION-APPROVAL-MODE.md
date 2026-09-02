# Plan — a merchant decides whether a website booking is accepted or reviewed

**Date:** 2026-08-29 · **Branch:** `feat/website-owner-ui` · **Nothing committed.**
**Scope, as set by the user:** *the merchant's two choices for reservations.* One setting, and
the two end-to-end journeys that follow from it. §10 is deliberately separable.

> **Sequencing (decided 2026-08-30): this plan runs before
> [PLAN-2026-08-29-WEBSITE-INBOX.md](./PLAN-2026-08-29-WEBSITE-INBOX.md).** Approval mode changes
> what the booking path writes; the inbox is a read surface over it. Their migrations touch
> different objects and do not collide, so the constraint is design, not schema — see §8.
> Two changes came out of comparing them: **§4.9 now carries the in-app bell and moved up the
> order of work**, and §8 records a permission mismatch that only appears once both exist.

---

## 1. What the merchant gets

One control, on the Reservations screen, with two positions:

| | **Accept automatically** (default, today's behaviour) | **Review each request** |
|---|---|---|
| Guest submits | Table is booked | Table is **requested** |
| Stored status | `confirmed` | `pending` |
| Guest is told | "Confirmed. Your table at Uptown Branch." | "Request sent. Nothing is confirmed yet." |
| Merchant does | Nothing. Gets an alert. | **Confirms or declines.** |
| Guest hears again | — | "Confirmed" or "We couldn't fit you" |

**It is one rule for the whole business, not per branch** — as asked. §2 explains where that
forces it to be stored.

---

## 2. Where the setting lives, and why not the obvious place

**`merchant_sites.brand.reservationApproval`**, a string, `"auto"` or `"manual"`, absent meaning
`"auto"`.

The obvious home is `reservation_settings`, which already holds `accepts_reservations`,
`booking_policy`, `cancellation_cutoff_min` and the rest. **It is the wrong home here**, because
that table is keyed **per location**:

- A merchant-wide rule stored per location is *N* rows that can disagree. Nothing would stop
  them drifting, and a support conversation would start with "which branch are you looking at".
- The screen would have to fan every write out to every branch, and that write is not atomic.
- **A branch created next month would silently get the column default**, disagreeing with the
  four the merchant actually set. That is a false-zero-shaped bug: the merchant answered the
  question once and the system quietly stopped applying the answer.

`brand` is one jsonb column on one row per merchant. It is already where `reservationMode` lives
— the *other* site-wide reservations decision — and `create_public_reservation` **already reads
`ms.brand` in a query it already runs**, so the write path gets the value for free.

**No migration for the setting.** That is the point of the jsonb columns, and `site-settings.ts`
says so in its own header.

### ⚠ The gotcha that will silently eat this

`resolveBrand` is an **allowlist**, not a merge
([site-settings.ts:333](../../../lib/site-builder/site-settings.ts#L333)). It rebuilds the brand
object key by key and discards anything it does not recognise:

```ts
const reservationMode = RESERVATION_MODES.find((mode) => mode === source.reservationMode);
...
...(reservationMode ? { reservationMode } : {}),
```

So adding `reservationApproval` to `siteBrandSchema` **is not enough**. If it is not also added
to `resolveBrand`, the value stores correctly, reads back once, and is then **wiped by the next
unrelated brand write** — a merchant editing their Instagram handle would silently switch their
restaurant back to auto-accept. Both edits, or neither.

---

## 3. What is already true, and needs no work at all

Four things that look like work and are not. **Re-verified against staging 2026-08-30** — every
row below was checked in the live database, not only in the repo.

| Re-checked on staging | Result |
|---|---|
| `reservation_status` enum | `{pending, confirmed, reminded, arrived, seated, completed, no_show, cancelled}` — `pending` is there |
| `create_public_reservation` | Exists; **hardcodes `'confirmed', 'website'`**; **already joins `merchant_sites`** (so §4.3's "costs nothing" is real); has the `already_booked` branch |
| `reservation_occupancy` | Exists |
| `merchant_sites.brand` | The test site carries **7 keys including `reservationMode`**, and no `reservationApproval` — §2's home is confirmed and the key is genuinely new |
| `respond_to_reservation_request` | **Does not exist** — as expected, it is this plan's to build |

And the same four facts with their sources in the repo, for whoever needs the code rather than the
confirmation:

| Already true | Where |
|---|---|
| **`pending` exists** as a first-class status | `reservation_status` enum, [remote_schema.sql:184](../../../supabase/migrations/20260413215901_remote_schema.sql#L184) |
| **A pending booking already blocks its table.** Nobody else can take it while the merchant decides | `reservation_occupancy` selects `status IN ('pending', 'confirmed', 'reminded', 'arrived', 'seated')` — [20260828150000](../../../supabase/migrations/20260828150000_reservation_occupancy_function.sql) |
| **The day view already has a Confirm button** on pending reservations | `STATUS_TRANSITIONS.pending` — [ReservationDetailSheet.tsx:45](../../../app/dashboard/reservations/components/ReservationDetailSheet.tsx#L45) |
| **A pending booking can already be cancelled by the guest**, and the manage page already knows the status | `can_cancel` and the `status` field in `get_public_reservation_by_token` |

The middle one is the most valuable. It means **manual review cannot oversell a dining room** —
the table is held from the moment the guest asks, exactly as it is for an auto-accepted booking.
The only difference between the two modes is who says yes and when.

### And the one thing that is quietly broken

**Confirming a reservation tells the guest nothing.** `UpdateReservationStatusAction` calls
`update_reservation_status`, which writes the column and returns
([floor-plan-actions.ts:1043](../../../app/dashboard/actions/floor-plan-actions.ts#L1043)). No
SMS, no email. Its sibling `CancelReservationAction` *does* notify.

So the Confirm button that already exists cannot carry this feature: a guest told "we will
confirm shortly" would be confirmed in silence and never learn it. **This is the real work.**

---

## 4. The design

### 4.1 The setting itself — `lib/site-builder/site-settings.ts`

- [x] `export const RESERVATION_APPROVAL_MODES = ["auto", "manual"] as const;` and its type.
- [x] `reservationApproval: z.enum(RESERVATION_APPROVAL_MODES).optional()` on `siteBrandSchema`.
- [x] **Add it to `resolveBrand`** — §2's gotcha. Same `.find()` + conditional-spread shape as
      `reservationMode`, so an unparseable stored value falls back rather than throwing.
- [x] `resolveReservationApproval({ brand })` → `"auto" | "manual"`, mirroring
      `resolveReservationMode`. **Absent resolves to `"auto"`.** Every live row predates this
      key, and those merchants did not ask for manual review — defaulting the other way would
      change the behaviour of every existing site on deploy.

### 4.2 The merchant's control — the Reservations screen

The user's constraint: *"it should be placed in the reservation page not anywhere else."*

- [x] Two selectable cards inside the master-switch `<section>`, directly below it, rendered
      **only when `enabled`** — the choice is meaningless for a site that takes no bookings, and
      the screen already establishes that everything under the switch is governed by it.
- [x] Each card says what the *guest* sees, not what the database stores. "Guests are booked
      straight away" / "Guests send a request and wait for your answer." A merchant is choosing
      between two experiences, not two enum values.
- [x] `SetReservationApproval(clerkOrgId, siteId, mode)` in
      [reservations-page.ts](../../../app/dashboard/website/actions/reservations-page.ts),
      beside `SetReservationsEnabled` and built the same way: read `brand`, write through
      `UpdateSiteBrand`. Audit-logged, `revalidatePath`.
- [x] The screen's `run()` helper returns `LocationReservationConfig[]`, which this does not —
      so it gets its own `startTransition` handler, exactly as `toggleEnabled` does.
- [x] **Changing the mode does not touch bookings that already exist.** A merchant switching to
      manual does not un-confirm tonight's tables. Say so on the screen, in one line.

### 4.3 The write path — migration 1

`create_public_reservation` hardcodes the status, with a comment recording the decision this
plan reverses:

```sql
    -- Auto-confirm (plan decision D1). A "pending" booking would make the
    -- confirmation message the guest immediately receives a lie.
    'confirmed', 'website', v_merchant_id
```

That reasoning was right and stays right — which is why §4.5 changes the message in step with the
status. The two must move together or the comment becomes true again.

- [x] Fold the lookup into the site-scoping `SELECT` that **already joins `merchant_sites`**, so
      it costs nothing:

```sql
  SELECT l.merchant_id,
         CASE WHEN ms.brand->>'reservationApproval' = 'manual'
              THEN 'pending' ELSE 'confirmed' END::reservation_status
    INTO v_merchant_id, v_status
  FROM merchant_sites ms
  JOIN locations l ON l.merchant_id = ms.merchant_id
  WHERE ms.id = p_site_id AND l.id = v_hold.location_id;
```

- [x] **Only the exact string `'manual'` means manual.** Absent, null, or anything unrecognised
      is `confirmed` — the same fail-toward-today's-behaviour rule as §4.1, enforced in SQL as
      well as in TypeScript because these two are the pair that must not disagree.
- [x] `v_status` replaces the literal in the `INSERT`.
- [x] Return `'status', v_status` in the result JSON.
- [x] **The `already_booked` early-return must return `v_existing.status`.** A guest who
      double-submits a request must see the request screen again, not a confirmation. This is the
      branch that is easy to forget, because it is the one nobody tests by hand.
- [x] Signature unchanged → **no grant churn**, the existing `REVOKE`/`GRANT` block still
      applies. Idempotent `CREATE OR REPLACE`, plus a rollback file, matching the convention of
      every reservations migration on this branch.

### 4.4 Telling the guest **before** they commit

The user's words: *"the customer will know that his table should wait for confirmation."*
**Before**, not after. A guest who finds out on the success screen was misled by the button they
pressed.

- [x] `ReservationsConfig` gains `approvalMode: "auto" | "manual"`.
      `EMPTY_RESERVATIONS_CONFIG` gets `"auto"`.
- [x] Set in `buildPublicRenderContext`, **not** in the config RPC. It is one site-wide value and
      the RPC returns one row per branch — putting it there would duplicate it *N* times and
      invite the two to disagree. `buildPublicRenderContext` already has `brand` in scope on the
      line above the `loadReservationsConfig` call
      ([public-context.ts:114](../../../lib/site-builder/public-context.ts#L114)), so this is
      one argument and **no SQL change**.
- [x] `ReservationsSection` serialises it alongside `locations` and `multiBranch`.
- [x] Checkout submit button: **"Complete reservation" → "Request a table"**
      ([ReservationWidget.tsx:768](../../../components/site-builder/reservations/ReservationWidget.tsx#L768)).
      The in-flight label follows: "Booking…" → "Sending…".
- [x] One line above the button: *"{Branch} confirms each booking. We'll hold your table while
      they do, and text you as soon as they answer."* — **"hold" is literally true** (§3), and it
      is the sentence that stops the guest assuming the worst.

### 4.5 Telling the guest **after** they commit

- [x] `BookResponse` gains `status: "confirmed" | "pending"`; the route passes it through from
      the RPC result.
- [x] `SuccessView` branches on it. The pending variant changes **the eyebrow, the headline, and
      the promise**, not just a word:

  | | confirmed (today) | pending (new) |
  |---|---|---|
  | Eyebrow | `Confirmed` | `Request sent` |
  | Headline | Your table at {branch} | We've asked {branch} for a table |
  | Body | — | **Nothing is confirmed yet.** |
  | Closing line | We have sent the details to your email and phone | The restaurant will answer shortly. We'll text and email you either way. |
  | Link | View or cancel your reservation | View or **withdraw** your request |

- [x] The `alreadyBooked` branch gets its own pending wording ("Request already sent"), for the
      same reason §4.3 carries the status through it.
- [x] Keep the confirmation number on both. It is what the guest quotes on the phone, and it
      exists either way.

### 4.6 The guest's own messages — `lib/messaging/reservation-templates.ts`

Three template pairs, `Text` (SMS) and `Html` (email), following the existing signatures exactly.

- [x] **`renderReservationRequested*`** — sent immediately on a `pending` booking, *instead of*
      the confirmed pair. Says what was asked for, that it is not yet confirmed, and that an
      answer is coming.
- [x] **Confirmed — reuse `renderReservationConfirmed*` unchanged.** It already says precisely
      the right thing when the merchant accepts. Nothing to write.
- [x] **`renderReservationDeclined*`** — new. Not the cancellation pair: *"we can't fit you at
      7:00 PM"* and *"your reservation was cancelled"* are different sentences to someone who was
      told they had no reservation yet. Carries the merchant's optional reason when one is given,
      and the branch phone number, which is the only useful next step.
- [x] `notifyWebsiteReservationBooked` picks the requested pair when the row is `pending`. It
      already loads `status`? — **it does not**: add `status` to `RESERVATION_COLUMNS`.

### 4.7 The merchant's answer — migration 2 + one action

**A new RPC rather than reusing `update_reservation_status`,** for three reasons that each
matter: that function cannot set `cancelled_by`, it cannot tell a first Confirm from a second
one, and it is granted to `anon`.

- [x] `respond_to_reservation_request(p_reservation_id uuid, p_accept boolean, p_reason text)`:
  - Same gate as its sibling — `merchant_id = user_merchant_id() AND location_id =
    ANY(user_location_ids())` — so it **inherits the repair** from
    `20260829120000_user_location_ids_merchant_admin_branch.sql`. Without that migration applied
    this function rejects the owner it exists to serve, which is worth knowing before debugging
    it.
  - **Acts only on `pending`.** Any other status returns `{acted: false, already: true, status}`
    rather than erroring. Two managers both clicking Confirm is a real Friday-night event, and
    the second must see success, not a red toast. Same idempotence rule
    `cancel_public_reservation` already applies to a double cancel.
  - Accept → `status = 'confirmed'`.
  - Decline → `status = 'cancelled'`, `cancelled_at = now()`,
    **`cancelled_by = 'staff'`**, `cancellation_reason = p_reason`.

    > ⚠ **Corrected 2026-08-30 — this said `'merchant'`, which would have failed outright.**
    > The column carries a CHECK, verified on staging:
    > `CHECK (cancelled_by IS NULL OR cancelled_by = ANY (ARRAY['guest','staff','system']))`.
    > `'merchant'` is not in that set, so the first decline would have raised a constraint
    > violation. `'staff'` is already the value meaning "someone at the restaurant did this",
    > which is exactly what a decline is, and it needs no DDL. The three legal values already
    > separate the cases a guest cares about: they cancelled, the restaurant declined, or the
    > system expired it. (Only `'guest'` appears in the data today.)
  - `GRANT` to `authenticated, service_role`. **Not `anon`** — `update_reservation_status` is,
    and that is not a precedent worth copying.
- [x] `RespondToReservationRequestAction(clerkOrgId, locationId, reservationId, accept, reason?)`
      in `floor-plan-actions.ts`, beside the sibling it replaces for this transition. Audit-logs,
      then fires the notification **without awaiting it** — the pattern
      `CancelReservationAction` already uses, so a Resend outage cannot fail a confirmation the
      database has already committed.
- [x] `notifyReservationRequestAnswered({ reservationId, accepted, reason })` in
      [notify.ts](../../../lib/site-builder/reservations/notify.ts), reusing `load()` and
      `sendAndLogEmail()` as they stand. **One new helper:** the existing `resolveManageUrl`
      takes a `siteId`, which the dashboard does not have — a merchant-side variant resolves the
      site by `merchant_id` instead. It already returns `null` when there is no token, so a
      booking without one degrades to a message with no link rather than a link to nowhere.
- [x] Audit actions `website_reservation_confirmed` / `website_reservation_declined`, through the
      existing `logBookingAudit`.

### 4.8 The day view

Where the merchant actually answers, this milestone. The screen already lists pending bookings
with an amber `Pending` badge and already opens the detail sheet.

- [x] `STATUS_TRANSITIONS.pending` gains **`Decline`**, and Confirm/Decline route through the new
      action rather than `useUpdateReservationStatus`.
- [x] **Remove `Mark No-Show` from `pending`.** A guest cannot fail to show up to a table nobody
      granted them. It is there today because the map was written before requests existed.
- [x] Decline opens a small reason prompt — optional, skippable, and the text goes to the guest.
      Say that on the prompt, so nobody types a note meant for staff.
- [x] A pending count on the screen header, so a merchant in manual mode can see at a glance that
      something is waiting. **This is the piece the inbox will do properly** (across branches,
      across days); the day view can only answer for the branch and day it is showing, and the
      count must not pretend otherwise.

### 4.9 Telling the merchant a request is waiting

**Not polish. This is what makes manual mode safe to switch on**, and it moved up the order of
work (§9) because of what follows.

Manual mode creates an obligation the product did not have before: a guest is sitting on *"we'll
answer shortly"*. Auto-accept has no such deadline — nobody is waiting on a human. So the question
"how does the merchant find out" changes from *nice* to *load-bearing* the moment this ships.

**And the email path does not work.** Verified 2026-08-29
([HANDOFF-2026-08-29-RESERVATIONS-INBOX.md §1](./HANDOFF-2026-08-29-RESERVATIONS-INBOX.md)):
`reservation_settings.notify_emails` is empty on the test location and the Resend key is invalid,
so the merchant alert **has never fired, once**. Changing its subject line improves a message
nobody receives.

Without something else, a manual-mode merchant is told a guest is waiting by exactly one thing:
opening the day view, one branch, one day. §4.8's pending count is per-branch-per-day by
construction and cannot be more.

#### The channel that does work — the in-app bell

The merchant dashboard already has a notification bell:
[`ReadOnlyNotificationBell`](../../../components/notifications/ReadOnlyNotificationBell.tsx),
mounted at [`app/dashboard/layout.tsx:1605`](../../../app/dashboard/layout.tsx#L1605), backed by
`app_notifications` + `app_notification_reads` (**per-user** read state), with a realtime
`INSERT` subscription, an unread badge and an `href` deep-link per row
([migration `20260824120000`](../../../supabase/migrations/20260824120000_subscription_plan_requests_and_app_notifications.sql),
shipped in `2ef68f06`). It is fed by subscription billing today and nothing else. It does not
touch Resend.

- [x] Emit from the **existing `after()` block** in
      [`book/route.ts:158`](../../../app/api/site-reservations/book/route.ts#L158) — already
      guarded by `if (!booked.already_booked)`, already holding a service-role client, already
      sitting beside `notifyWebsiteReservationBooked`. The double-submit guard is why the emit
      belongs there and not inside the RPC.

```ts
await createAppNotification({
  audience: "merchant",
  merchantId,
  notificationType: booked.status === "pending"
    ? "website_reservation_requested"
    : "website_reservation_created",
  title: booked.status === "pending"
    ? `Booking request — ${branchName}`
    : `New website booking — ${branchName}`,
  body: `${firstName} ${lastName}, party of ${booked.party_size}, ${booked.reservation_date} at ${booked.reservation_time}`,
  href: "/dashboard/reservations",
});
```

- [x] **Both statuses emit**, with different wording. A confirmed booking is news; a pending one
      is a task. Same channel, different sentence.
- [x] `href` points at the day view for this milestone. It becomes
      `/dashboard/website/inbox` when that ships — see
      [PLAN-2026-08-29-WEBSITE-INBOX.md](./PLAN-2026-08-29-WEBSITE-INBOX.md).
- [x] Fire it **without awaiting**, inside `after()`, for the same reason §4.7 does: a
      notification failure must not fail a booking the database has committed.

#### The email, for when it is fixed

- [x] Subject on a pending booking: **`Booking request · {n} on {date}`**, not
      `New website booking`. The current subject would tell a manual-mode merchant they had a
      booking when they have a decision to make.
- [x] One line in the body — *"This is a request. It is not confirmed until you accept it"* —
      and keep the existing dashboard link, which already lands on the day view.
- [x] Do this, but **do not count it as the answer.** It is correct code on a dead channel until
      `notify_emails` is populated and the Resend key is valid. Neither is in this plan's scope.

### 4.10 The guest's manage page — `/sites/[slug]/r/[token]`

`get_public_reservation_by_token` already returns `status`, and `can_cancel` already includes
`pending`. **No SQL change.**

- [x] A pending state on the page: *"Awaiting confirmation"*, with the same "nothing is confirmed
      yet" honesty as the success screen. Today it renders the neutral "Your reservation" for
      every non-terminal status, which reads as confirmed.
- [x] The cancel control reads **"Withdraw request"** while pending.
- [x] A guest who withdraws gets the existing cancelled message, which is correct for an action
      they took themselves.

---

## 5. Files touched

| File | Change |
|---|---|
| `lib/site-builder/site-settings.ts` | The mode, the schema, **`resolveBrand`**, the resolver |
| `app/dashboard/website/actions/reservations-page.ts` | `SetReservationApproval` |
| `components/site-builder/dashboard/ReservationsScreen.tsx` | The two cards, under the master switch |
| `lib/site-builder/public-context.ts` | Pass the mode into the reservations config |
| `lib/site-builder/reservations/protocol.ts` | `approvalMode`, `BookResponse.status` |
| `components/site-builder/sections/ReservationsSection.tsx` | Serialise it |
| `components/site-builder/reservations/ReservationWidget.tsx` | Button copy, pre-commit line, `SuccessView` |
| `app/api/site-reservations/book/route.ts` | Carry `status` through; **emit the merchant bell notification** (§4.9) |
| `lib/notifications/app-notifications.ts` | Nothing — `createAppNotification` is used as it stands |
| `lib/messaging/reservation-templates.ts` | Requested + declined pairs |
| `lib/site-builder/reservations/notify.ts` | `status` column, requested branch, `notifyReservationRequestAnswered` |
| `app/dashboard/actions/floor-plan-actions.ts` | `RespondToReservationRequestAction` |
| `app/dashboard/reservations/components/ReservationDetailSheet.tsx` | Decline, no-show removal, new action |
| `app/sites/[slug]/r/[token]/page.tsx` | Pending state |

**Two migrations, both idempotent, both with a rollback:**

1. `create_public_reservation` — read the mode, return the status.
2. `respond_to_reservation_request` — new function + grants.

---

## 6. Tests

- [ ] `resolveReservationApproval`: absent → `auto`; `"manual"` → `manual`; `"MANUAL"`, `""`,
      `null`, a number → `auto`.
- [ ] **`resolveBrand` round-trips `reservationApproval`** — the §2 gotcha, as a test rather than
      a comment. Brand in, brand out, value intact.
- [ ] The section serialises `approvalMode`, and a site with no reservations config still
      produces `"auto"`.
- [ ] `renderReservationRequested*` and `renderReservationDeclined*`, extending the existing
      [confirmation-templates.test.ts](../../../lib/site-builder/reservations/__tests__/confirmation-templates.test.ts).
      The declined template with and without a reason.
- [ ] SQL, by hand on staging, both modes: book → assert the stored status; **double-submit the
      same hold and assert the status comes back unchanged** (§4.3); confirm → assert
      `confirmed`; confirm again → assert `already: true` and no second message; decline → assert
      `cancelled` + `cancelled_by = 'merchant'` + the reason.
- [ ] **Seed first.** Staging has 5 website reservations, all on **one** of the test merchant's
      five branches, and 1 form submission in the whole database (checked 2026-08-30). Manual-mode
      QA needs bookings on more than one branch or the multi-branch behaviour is untested.
- [ ] Browser, manual mode, as an anonymous guest: the button says *Request*, the pre-commit line
      is there, the success screen says nothing is confirmed, the manage page says awaiting.
      Then, as the merchant: Confirm → the guest's status changes and a message is logged to
      `message_log`.
- [ ] **The bell fires (§4.9).** Book as a guest in manual mode; the merchant's bell badge
      increments without a reload — it is a realtime `INSERT` subscription — and the notification
      reads *request*, not *booking*. Repeat in auto mode and assert the wording flips. Then
      double-submit the same hold and assert **only one** notification exists: the emit sits
      inside the `already_booked` guard, and telling a restaurant twice is the failure this
      guards against.

---

## 7. Risks

| Risk | Handling |
|---|---|
| **`resolveBrand` drops the key** and a later brand edit silently reverts the merchant to auto | §2. Covered by a test, not just a comment |
| The SQL default and the TypeScript default disagree | Both fail to `auto`, both keyed on the exact string `'manual'`, and both stated in §4.1/§4.3 as the same rule |
| A merchant switches to manual and does not notice requests piling up | **The in-app bell (§4.9)** — the only merchant channel that works today; the alert email has never fired. Plus the day view count (§4.8). Cross-branch awareness is the inbox's job; the expiry bound is §10 |
| A **manager** can see a pending request they cannot answer | Cross-plan, and only visible once the inbox exists. `respond_to_reservation_request` gates on `user_location_ids()`, which after `20260829120000` widens for `is_merchant_owner` (owner + admin) — **not** `is_merchant_admin`, which also admits `merchant.manager` and is what the `reservations` RLS listing policy uses. The day view hides this because it is single-branch. See §8 |
| Existing sites change behaviour on deploy | They do not. Absent = `auto` = exactly today |
| Confirming still notifies nobody, if §4.7 is skipped | It is the centre of the plan, not an extra. A manual mode without it is worse than no manual mode |
| A pending request holds a table indefinitely | True by design (§3) and correct in the short term. §10 bounds it |

---

## 8. What this deliberately does not do

- **No identity verification.** Confirmed as not wanted: the guarantee asked for — *this table is
  theirs and nobody else's* — is `pg_advisory_xact_lock` on `(location, date)` plus the re-check
  inside it, and that is already built and already working.
- **No inbox.** Confirm and decline ship on the day view. The inbox
  ([PLAN-2026-08-29-WEBSITE-INBOX.md](./PLAN-2026-08-29-WEBSITE-INBOX.md)) picks both up for free
  later — same server action, same RPC — because §4.7 puts the logic behind an action rather than
  in a component.

  **This plan runs first, and the inbox is designed around its output.** Approval mode changes
  what the booking path *writes*; the inbox is a read surface over whatever it writes. Build the
  viewer first and its primary axis is *unread* — correct only in a world where no booking needs
  a decision — and it gets rebuilt around *pending* the moment this ships.

  **One thing the inbox must fix, and cannot fix before it exists.** The two paths gate on
  different helpers:

  | Path | Gate | Admits |
  |---|---|---|
  | Inbox listing | `reservations` RLS → `is_merchant_admin` | owner, admin, **manager** |
  | `respond_to_reservation_request` (§4.7) | `user_location_ids()` | own memberships ∪ all branches if `is_merchant_owner` (owner, admin) |

  So a `merchant.manager` will see cross-branch pending requests in the inbox and be silently
  rejected answering the ones outside their own membership. Invisible here, because the day view
  is single-branch. The inbox owns the fix — gate the Confirm/Decline affordance on answerable
  branches, or align the two helpers — but the decision is recorded here so it is not discovered
  in production.
- **No per-branch override.** One rule for the business, as asked. §2 is written so that adding
  a per-branch exception later means adding a column to `reservation_settings` and a fallback,
  not undoing anything here.

---

## 9. Order of work

Each step leaves the tree working.

**0. ~~Apply `20260829120000_user_location_ids_merchant_admin_branch.sql`.~~ ✅ Already applied —
   verified on staging 2026-08-30.** `user_location_ids()` carries the repaired
   `is_merchant_owner(user_merchant_id())` branch verbatim. **Note the ledger lies:**
   `supabase_migrations.schema_migrations` stops at `20260827170000`, so every `20260828*` /
   `20260829*` object was applied out of band. Check `pg_proc`, not the ledger.

   ⚠ **One latent precondition this repair does not cover.** Both branches of
   `user_location_ids()` gate on `user_merchant_id()`, which resolves through **`staff_profiles`,
   not the Clerk `members` table**:

   ```sql
   select sp.merchant_id from public.staff_profiles sp
   where sp.user_id = public.get_my_claim('sub') limit 1;
   ```

   A merchant owner or admin with **no `staff_profiles` row gets NULL**, both branches match
   nothing, and §4.7 rejects them — the repair notwithstanding. On staging today this is safe:
   **0 of all `merchant.%` members lack a staff profile**, and all 8 owner/admins on the test
   merchant have one. But it is an invariant nobody is enforcing, and it is the failure mode to
   check first if Confirm ever returns "access denied" for a legitimate owner.

1. §4.1 + §4.2 — the setting and its control. Stores and reads; nothing else changes yet.
2. §4.3 — migration 1. Manual mode now stores `pending`; the guest is still told "confirmed",
   which is wrong, so **3 must follow in the same sitting.**
3. §4.4 + §4.5 + §4.6 — the guest hears the truth, before and after.
4. §4.7 + §4.8 — the merchant can answer, and the guest is told when they do.
5. **§4.9 — the bell.** Moved up from polish. Manual mode is not safe to switch on until the
   merchant is actually told a guest is waiting, and the email channel has never fired.
   **Feature complete here.**
6. §4.10 — the manage page. Polish, separately shippable.

### Progress — 2026-08-30

| Step | State |
|---|---|
| 0 · `user_location_ids` repair | ✅ was already applied; verified on staging |
| 1 · §4.1 + §4.2 — the setting and its control | ✅ built, tested |
| 2 · §4.3 — migration 1 | ✅ **applied to staging** |
| 3 · §4.4 + §4.5 + §4.6 — the guest hears the truth | ✅ built, tested |
| 4 · §4.7 + §4.8 — the merchant answers | ✅ built, tested |
| 5 · §4.9 — the bell | ✅ built, tested |
| 6 · §4.10 — the manage page | ✅ built, tested |

**The plan is fully built.** A merchant can switch to manual review; a guest is told the truth
before committing, on the success screen, in their messages and on the manage page they come back
to; the merchant is alerted in the dashboard; and they can confirm or decline with the guest
hearing about it either way.

**Only §10 remains, and it was always separable** — nothing expires a request that is never
answered. Until it exists, the honest mitigation is the one §4.8 and §4.9 already provide: make a
waiting request loud enough that a merchant does not miss it.

### Corrections made while building

| What the plan said | What it had to be | Why |
|---|---|---|
| `cancelled_by = 'merchant'` | **`'staff'`** | The CHECK allows only `guest`/`staff`/`system`. Every decline would have raised a constraint violation |
| `RespondToReservationRequestAction(clerkOrgId, locationId, …)` | **No `locationId` parameter** | It was only ever used for the audit row, and callers would hand it the *selected* location. The branch is a property of the reservation, so the action reads it from the reservation. A caller cannot get it wrong if it cannot pass it — which also removes the cross-branch hazard §8 warns the inbox about |
| Emit the bell from the book route's `after()` | **Emit from `notifyWebsiteReservationBooked`** | That function is *already* called only inside the route's `!already_booked` guard, so it inherits the double-submit protection — and it has already loaded `merchant_id` and the branch name, so there is no second query |
| — | `loadReservationsConfig` now returns `Omit<ReservationsConfig, "approvalMode">` | Stops a site-wide setting being sourced from a per-branch RPC |

### Verified

`tsc` clean on every touched file. **1590 tests passing**; the 9 failures are pre-existing and
were confirmed by stashing this work and re-running — 8 storefront a11y, 1 menu cascade-labels,
and a KDS file with an import error. None are in anything this plan touches.

### Browser QA — 2026-08-30, end to end on staging

Driven through the real app against staging, as an anonymous guest and then as the merchant.
**Every step of the plan passed.** Test data now spans **two branches**, which is what the
handover said was missing.

| Step | Result |
|---|---|
| The two cards render, defaulting to `auto` | ✅ |
| Switch to manual → `brand.reservationApproval = "manual"`, brand keys 7 → 8, `reservationMode` intact | ✅ the §2 `resolveBrand` gotcha holds in production, not only in a unit test |
| `approvalMode: "manual"` reaches the widget payload | ✅ |
| Button reads **Request a table**, with the hold line above it | ✅ |
| Success screen: `REQUEST SENT` / "We've asked Uptown Branch for a table" / "Nothing is confirmed yet." / "View or withdraw your request" | ✅ |
| Stored `pending`, one table held, `confirmation_sent_at` null | ✅ the hold promise is literally true |
| Bell fires `website_reservation_requested` — "Booking request — Uptown Branch … waiting for your answer" | ✅ the first reservation notification the product has ever sent |
| Guest gets the **requested** pair, not the confirmed pair | ✅ logged: "Not confirmed yet - we're holding your table" |
| Manage page: "Awaiting confirmation", "Nothing is confirmed yet.", **Withdraw request** | ✅ |
| Day view: "Awaiting your answer" tile, Website badge, Pending | ✅ |
| Sheet: Confirm booking + Decline, **no Mark No-Show** | ✅ |
| Confirm → `confirmed`, guest sent the confirmed pair | ✅ |
| Decline with a reason → `cancelled`, **`cancelled_by = 'staff'`**, reason stored | ✅ the `'merchant'` correction was load-bearing; this is the call that would have thrown |
| Declined message is not the cancellation copy — reason verbatim, branch phone as the next step | ✅ |
| Tile stops counting a request once answered | ✅ 1 awaiting while Active = 2 |
| Console errors across every screen | ✅ **zero** |

Both channels report `failed` in `message_log` — the Resend key is invalid and the phone numbers
are fake. That is the pre-existing environment gap, not this feature: the point is that the
**correct template was selected and attempted**, and `confirmation_sent_at` correctly stayed null
because nothing was delivered. Delivery state remains a record of delivery, not of intent.

### Defects found and fixed during QA

1. **An expression followed by text containing an HTML entity loses the space between them** —
   rendered "Uptown Br*anchconfirms*", "Omar Decl*inedwill* be told". Three occurrences, all in
   copy interpolating somebody's *name*. The source has the space and esbuild preserves it;
   Turbopack/SWC splits the JSXText at the entity and trims. Fixed with an explicit `{" "}`.
   Written up in `docs/engineering/developer-experience/lessons.md`, because `tsc` and unit tests
   are both blind to it and only a browser catches it.
2. **"Guests waiting, this branch today"** — the date picker can show any day, so "today" was a
   false claim on every other date. Now "this branch and day".

### Second QA pass — the edge cases, 2026-08-30

The first pass covered the happy paths. These are the five things it left unverified, including
the one real regression risk. All now tested.

| # | Case | Result |
|---|---|---|
| 1 | **Auto mode still confirms** — the booking path changed for every merchant | ✅ with `approval = auto`, a booking stores `confirmed`. No regression |
| 2 | **Double submit** — §4.3 called this "the branch nobody tests by hand" | ✅ replaying a hold token in **manual** mode returns `status: "pending"` from `v_existing.status`, same confirmation number. One reservation row, **one** bell notification, **one** email — the `!already_booked` guard holds |
| 3 | **Two managers both click Confirm** | ✅ manager B confirms; manager A's stale sheet resolves to Confirmed with no error, and the guest gets **no second message**. Exactly one `confirmed_reservation_request` in the audit log |
| 4 | **Guest withdraws a request** | ✅ wording correct end to end — but surfaced a defect, below |
| 5 | **`resolveBrand` survives an unrelated write** | ✅ **the important one.** Changing the business name on the *Settings* screen preserved `reservationApproval: manual` (brand keys 8 → 9). Without the `resolveBrand` line this exact save would have silently reverted the restaurant to auto-accept — §2's stated failure mode, proven not to happen |

Audit rows also carry the **correct `location_id`**, confirming the server-side branch lookup that
replaced the caller-supplied parameter.

#### Defect found in pass two, and fixed

**Withdrawing left a false promise on screen.** After a successful withdraw the panel said "Your
request has been withdrawn" while the page above it still read *"Your table is held while they
decide, and we'll email and text you as soon as they answer"* — everything outside the client
panel is server-rendered from the status at page load.

The staleness pre-dates this work (a cancelled booking kept the neutral "Your reservation"
heading). **§4.10 made it materially worse** by putting a strong, now-false *promise* in that
region. Fixed with `router.refresh()` on success, which re-renders the server component and
repairs the ordinary cancellation case too.

### Known, not fixed

The manage page's **browser tab title still reads "Your reservation"** for a pending request —
static metadata, while the page body correctly says "Awaiting confirmation". The same drift the
body was fixed for, one layer up. Needs `generateMetadata` reading the reservation. Deferred as
cosmetic.

### Still true, and worth saying

Nothing has changed for any existing merchant. All three sites on staging resolve to `auto`,
which is byte-for-byte today's behaviour. Manual review does nothing until a merchant chooses it
on their Reservations screen.

---

## 10. Separable: nothing should sit pending forever

**BUILT 2026-08-30.** Was out of scope above; picked up straight after the second QA pass, since
it was the only open item that could hurt a real restaurant. Implementation notes at the end of
this section. The original reasoning is kept as written.

A guest requests tonight at 19:00. The merchant does not open the dashboard. Today that request
stays `pending` for ever, keeps holding a table, and the guest is left reading "we'll answer
shortly" until they turn up or give up.

**The agreed answer: expire it and tell the guest.** A `pending` website booking is auto-declined
once it is within *N* hours of the sitting, `cancelled_by = 'system'` — the value
[location-closure.ts](../../../lib/site-builder/reservations/location-closure.ts) already uses
for exactly this class of event — and the guest gets a message pointing them at the phone number.

It needs a scheduled job, which is why it is separate. The repo has both patterns already: a
guarded `cron.schedule` inside a `DO $$` block
([20260530113000](../../../supabase/migrations/20260530113000_qr_pii_retention_policy.sql#L235)),
and a scheduled edge function (`process-abandoned-carts`). **The edge function is the right one
here**, because the guest has to be *told*, and pg_cron cannot send an email.

Until it exists, the honest mitigation is the one §4.8 and §4.9 already give: make a waiting
request loud enough that a merchant does not miss it.

---

### 10.1 How it was actually built

- [x] `expire_stale_reservation_requests(p_grace_minutes, p_lookback_hours, p_reason)` —
      `20260830130000`. Selects and cancels in one statement, returns the ids.
- [x] `lib/site-builder/reservations/expiry.ts` — the sweep, structured like `location-closure.ts`
      (cancel a set, return ids, notify sequentially).
- [x] `app/api/internal/expire-reservation-requests/route.ts` — secret-guarded entry point.
- [x] `poke_reservation_request_expiry()` + a `*/15` cron job — `20260830130100`.
- [x] 14 contract tests in `lib/site-builder/reservations/__tests__/expiry.test.ts`.

**Two deviations from this section as written, both forced by what staging actually contained.**

**1. A route handler, not an edge function.** The reasoning above is right that the guest has to
be told and pg_cron cannot send an email — but the conclusion does not follow. Every piece of
telling a guest already lives in the Next app: the declined template pair, the branded wrapper,
the Telnyx and Resend helpers, `message_log`, the audit trail. None of it can be imported into
Deno, so an edge function would have had to reimplement the guest's message — and the expiry
email would drift from the decline email the first time anyone edited one. The repo already runs
three jobs through `INTERNAL_NOTIFICATION_SECRET` + `app/api/internal/*`, driven by pg_net from
pg_cron. That pattern loses nothing here and duplicates nothing.

**2. Three guards, not one — and two of them exist because staging proved they had to.**

Querying before writing any SQL turned up **10 `pending` reservations that are not website
bookings** (5 `pos`, 5 `web_dashboard`). For staff, `pending` does not mean "awaiting the
restaurant's answer" at all — it means a host wrote a booking down and has not firmed it up.
And **every one of those ten is in the past**, the oldest from April.

So the obvious one-line version of this sweep — *cancel pending rows whose sitting has passed* —
would have cancelled ten historical staff bookings on its first run and emailed those guests an
apology about dinners four months gone. In production it would have done that to staff bookings
at every restaurant on the platform, including the ones that never turned manual review on.

The guards, each with its own failure mode:

| Guard | Stops |
|---|---|
| `source = 'website'` | Cancelling staff bookings, where `pending` is a different word |
| Lookback floor (24h) | Rewriting the past — the rule `location-closure.ts` already states |
| Branch-local sitting time | Expiring tonight in Auckland while this afternoon in LA stands |

A dry run of the predicate against staging confirms all ten rows pass the grace check and **all
ten are stopped** — independently by the source guard *and* by the lookback guard. First run
touches nothing.

**Deliberately not scoped to merchants currently in manual review.** A merchant who switches back
to auto with requests outstanding still has guests owed an answer; scoping by mode would strand
them permanently.

**The guest gets the decline, not a fourth voice.** An expiry is a decline from where they stand.
What differs is the reason (printed verbatim, plus the venue's phone) and the audit action —
`website_reservation_expired` rather than `website_reservation_declined`, because "we turned
guests away" and "we left guests unanswered until the platform stepped in" are different facts
about a business and a report that merges them hides the second one.

**Deploy order is safe by construction.** `poke_reservation_request_expiry()` no-ops until the
`reservation_expiry_url` vault secret is set, so both migrations can be applied on their own and
nothing expires until someone deliberately points the job at a running app.

### 10.2 End-to-end verification on staging, 2026-08-30

All three migrations applied. Booked a real request through the public API at Uptown Branch for
today 12:00 (68 minutes out, inside the two-hour window), then fired the route.

| Check | Result |
|---|---|
| Booking stores `pending` in manual mode | `RES-GDSFQ6`, `status: "pending"` |
| Route refuses no secret / wrong secret | 401 both |
| Sweep with the right secret | `{ ok: true, expired: 1 }` |
| Row after | `cancelled`, `cancelled_by = 'system'`, system reason |
| **The 10 staff `pending` rows** | **Untouched** — still 5 `pos` + 5 `web_dashboard` |
| Audit action | `website_reservation_expired`, correct branch |
| Guest message | Declined template, system reason verbatim, venue phone |
| Manage page | `Reservation cancelled`, no surviving "table is held" promise |
| Tab title, pending | `Awaiting confirmation` (was always "Your reservation") |
| **Negative control** — a 19:00 request, 4h out | **`expired: 0`**, still `pending` |
| Re-run against an already-cancelled row | `expired: 0` — no double send |

`notify_failures: 1` on the first run is staging's invalid Resend key and a fake phone number.
Both sends were attempted with the correct content, which is what was under test.

**A grant bug was found in this pass and is worth recording.** The two migrations shipped with
`REVOKE ALL ... FROM PUBLIC`, which is not enough on Supabase: default privileges GRANT EXECUTE to
`anon` and `authenticated` explicitly at creation, and revoking from PUBLIC does not remove an
explicit grant. Applied, `proacl` read `{postgres, anon, authenticated, service_role}` — making a
SECURITY DEFINER bulk-cancel function, which takes its own lookback as an argument, callable by
anyone holding the publishable key. Closed by `20260830130200`; both sources back-ported to
`FROM PUBLIC, anon, authenticated`, the form `20260828160000` already used.

The contract test that should have caught it **passed**, because it asserted
`not.toMatch(/TO anon/)` — trivially true of a file that never mentions anon, i.e. the broken file.
Rewritten to assert the REVOKE line is present. Recorded in
`docs/engineering/developer-experience/lessons.md`.

**Left on staging:** one pending request `RES-ACDK5S` (Later Tonight, Uptown, today 19:00) as seed
data, and `RES-GDSFQ6` cancelled by the sweep. The cron job is registered and active but **inert** —
`reservation_expiry_url` is not in the vault, so nothing expires automatically yet.

**Still open:** the guest manage page's tab title renders as `... — DEXA POS` on a merchant's own
site. Pre-existing platform-branding leak, already logged in the 2026-08-24 QA; more visible now
that the title is correct.
