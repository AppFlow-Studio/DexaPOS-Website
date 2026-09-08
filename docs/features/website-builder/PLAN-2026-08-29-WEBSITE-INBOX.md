# Plan — the website inbox

**Date:** 2026-08-29 · **Revised:** 2026-08-30 · **Branch:** `feat/website-owner-ui` ·
**Status: planned, not started.**

Supersedes the open decisions in
[`HANDOFF-2026-08-29-RESERVATIONS-INBOX.md`](./HANDOFF-2026-08-29-RESERVATIONS-INBOX.md).
That document's research still stands — this one records what was decided on top of it.

> **Sequencing (decided 2026-08-30): this runs *after*
> [PLAN-2026-08-29-RESERVATION-APPROVAL-MODE.md](./PLAN-2026-08-29-RESERVATION-APPROVAL-MODE.md).**
> Approval mode changes what the booking path writes; this is a read surface over it. The
> migrations touch different objects and do not collide, so the constraint is design, not
> schema — see §2.3. The in-app bell that earlier drafts of this plan deferred has **moved into
> that plan's §4.9**, where it is load-bearing rather than optional.

---

## 1. What the research found that the handover missed

### 1.1 Forms submissions are already merchant-scoped in the data

`site_form_submissions` carries denormalized `merchant_id` and `site_id`, written by a trigger from
`form_id` ([migration:167](../../../supabase/migrations/20260822120000_website_forms.sql#L167)).
`ListSubmissions` filters by `form_id` only because that is what the per-form route needed — not
because the data is shaped that way. A cross-form, merchant-wide list is a change of predicate.

### 1.2 The column derivation is already reusable

`submissionColumns` lives in
[`lib/site-builder/forms/submission.ts:217`](../../../lib/site-builder/forms/submission.ts#L217) —
already exported, pure, and unit-tested. The inbox calls it **per row** instead of once per screen.
**No change to that function, and none to `SubmissionsScreen`.** Only `toSubmissionRow`
([`forms.ts:390`](../../../app/dashboard/website/actions/forms.ts#L390)) is private and needs
exporting, which is additive.

---

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Where does it live? | **`/dashboard/website/inbox`**, one new sub-nav item under Website called **Inbox** |
| 2 | Replace / beside / tab? | **Neither** — one screen, two tabs: `Reservations` and `Forms` |
| 3 | Read state per-merchant or per-user? | **Per-merchant `read_at`**, matching `site_form_submissions` |
| 4 | Website-only or every source? | **Website only** — `source = 'website'` |
| 5 | Sidebar count? | **Yes** — one combined **attention** count, §2.3 |
| 6 | CSV export? | **Yes**, primary action, exporting the active tab |
| 7 | Forms and reservations together? | **Yes**, one inbox — §2.1 |
| 8 | *(new)* What is the Reservations tab organised around? | **Pending first, unread second** — §2.3 |

### 2.1 Why one inbox, and why two tabs inside it

Every item under `Website` today — Pages, Events, Forms, Reservations, Tracking, Settings — is a
**configuration** screen. Nothing there shows what the website *produced*. `Inbox` is the only
output screen, which is why it is one item rather than two, and why it sidesteps §3.4 of the
handover: it is not a third thing named "Reservations".

It is **not** one merged row list. The two record types diverge where it matters:

| | Form submission | Website reservation |
|---|---|---|
| Identity | Form name, contact | **Branch**, guest |
| Payload | N arbitrary answers | Party size, service date + time |
| State | Notification delivery state | Reservation status, confirmation number |

A single table forces a lowest-common-denominator — Received / Type / Who / summary — and the
first column lost is **Branch**, which is the whole reason the handover argues an inbox is needed.
It also makes CSV incoherent: one file cannot carry two schemas. So the tabs share chrome, unread
treatment, mark-read, date-range filter and the export button; each owns its columns, its filters,
its row action and its CSV shape.

### 2.2 Why per-merchant read state

Not because it is simpler. Because `site_form_submissions.read_at` is already per-merchant, and
two tabs in one inbox with **different** read semantics would be worse than one coarse semantic
applied consistently. One manager reading clears it for everyone, on both tabs, predictably.

If per-user read state is ever wanted, `app_notification_reads` is the pattern to copy — but it
must then be applied to both halves at once.

### 2.3 ⚠ Pending is not unread, and this is the plan's load-bearing distinction

Once approval mode ships, a website reservation carries **two independent states**, and conflating
them is the one mistake that would make this screen lie.

| | What it means | Cleared by |
|---|---|---|
| `read_at IS NULL` | Nobody has looked at it | **Looking at it** |
| `status = 'pending'` | A guest is waiting for an answer | **Answering it** |

**Reading a pending request does not discharge it.** A manager who opens a booking request, reads
it, and closes the sheet has done nothing for the guest. If the badge counts only unread, that
request silently disappears from the merchant's attention the moment someone glances at it — while
the guest is still sitting on *"we'll answer shortly"*. That is the exact false-zero shape this
codebase keeps finding.

So:

- **The sidebar count is an *attention* count, not an unread count.** Unread form submissions,
  plus website reservations that are **unread OR pending** — a union, not a sum, so an unread
  pending request counts once.
- **Marking a row read never clears its pending state**, in the query or in the UI.
- The Reservations tab surfaces **Needs answer** as a filter with its own count, distinct from
  unread styling.

In auto-accept mode `pending` is always zero and the whole thing degrades to a plain unread
count — which is why this had to be designed now rather than retrofitted. Building this screen
before approval mode would have made *unread* the primary axis and required rebuilding it.

### 2.4 ⚠ A manager can see requests they cannot answer

Cross-plan, and invisible in either plan alone. The listing and the action gate on different
helpers:

| Path | Gate | Admits |
|---|---|---|
| Inbox listing | `reservations` RLS → `is_merchant_admin` | owner, admin, **manager** |
| `respond_to_reservation_request` | `user_location_ids()` | own memberships ∪ all branches if `is_merchant_owner` (owner, admin) |

[`20260829120000_user_location_ids_merchant_admin_branch.sql`](../../../supabase/migrations/20260829120000_user_location_ids_merchant_admin_branch.sql)
widens the helper deliberately to `is_merchant_owner` and **not** `is_merchant_admin`, and its own
header explains why: matching `is_merchant_admin` "would make this helper BROADER than the picker
and grant access nobody asked for."

The day view never exposes this because it is single-branch. **The inbox does**, the moment a
manager sees a pending request from a branch they hold no membership on. Left alone it is a
silent RPC rejection behind a red toast.

**Decision: gate the affordance, not the row.** A manager still *sees* every branch's bookings —
that is the feature, and `is_merchant_admin` is the right listing gate. But Confirm/Decline is
hidden, with one line saying who can answer, on rows outside `user_location_ids()`. Hiding the
row would be worse: it would reintroduce the single-branch blindness this screen exists to remove.

- [ ] `GetAnswerableLocationIds(clerkOrgId)` — one call, returns `user_location_ids()` for the
      caller, so the screen can decide per row without guessing.

---

## 3. Migration

One column and three indexes. Nothing else.

```sql
-- Reservations gain the one timestamp they lack: "a human has seen this".
-- Deliberately NOT a substitute for status: read_at answers "was it seen",
-- status answers "was it answered". See plan §2.3.
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

COMMENT ON COLUMN public.reservations.read_at IS
  'When a merchant user first opened this booking in the website inbox. Per-merchant, not
   per-user, matching site_form_submissions.read_at. NULL means unread. Independent of status:
   reading a pending request does not answer it.';

-- The listing query: this merchant, every branch, newest arrival first.
CREATE INDEX IF NOT EXISTS reservations_website_arrival_idx
  ON public.reservations (merchant_id, created_at DESC)
  WHERE source = 'website';

-- The sidebar attention count (§2.3). Unread OR unanswered, never one without the other.
CREATE INDEX IF NOT EXISTS reservations_website_attention_idx
  ON public.reservations (merchant_id)
  WHERE source = 'website' AND (read_at IS NULL OR status = 'pending');

-- Cross-form listing has no index today: every site_form_submissions index is form_id-scoped.
CREATE INDEX IF NOT EXISTS site_form_submissions_merchant_idx
  ON public.site_form_submissions (merchant_id, created_at DESC);
```

**Why these indexes exist at all.** Confirmed against staging 2026-08-30 — `pg_indexes` on
`reservations` returns exactly: `idx_reservations_confirmation`, `idx_reservations_customer`,
`idx_reservations_date`, `idx_reservations_location`, `idx_reservations_phone`,
`idx_reservations_today`, `idx_reservations_upcoming`, `reservations_blocking_by_date_idx`,
`reservations_manage_token_idx`, `reservations_pkey`. **Every one is keyed on `location_id`,
`reservation_date` or a lookup value. Not one is keyed on `merchant_id`, and not one orders by
`created_at`.** They were built for the day view: *this branch, this date*. The inbox queries the
opposite axis: *this merchant, every branch, by arrival*. Same story on the forms side — all four
`site_form_submissions` indexes are `form_id`-scoped.

**On `CONCURRENTLY` — don't.** `CREATE INDEX` takes a lock that blocks writes for its duration, so
the reflex is `CONCURRENTLY`. It **cannot run inside a transaction block**, and migrations are
applied in one, so it would fail outright. It is also pointless here: staging holds **48
reservations (5 of them website) and 1 form submission**. The plain form is instantaneous. Keep
`IF NOT EXISTS` so that if production has grown by the time this ships, the indexes can be built by
hand with `CONCURRENTLY` in a separate session and the migration becomes a no-op.

**No RLS work.** The `reservations` "Admin Write" policy is already merchant-wide via
`is_merchant_admin(merchant_id)`
([`20260414000002_policies_and_indexes.sql:24`](../../../supabase/migrations/20260414000002_policies_and_indexes.sql#L24)),
so a plain `select` through `createServerSupabaseClient()` returns every branch — no new RPC, no
`user_location_ids()` involvement in the *listing*. §2.4 is about the action, not the read.

**No `updated_at` trigger work** — see §7.2.

---

## 4. Work items

### 4.1 Migration
- [ ] `supabase/migrations/<ts>_website_inbox_read_state.sql` with the SQL in §3
- [ ] Apply to staging; regenerate `database.types.ts`
- [ ] Confirm `reservations.read_at` is present on the live table before building against it

### 4.2 Server actions — `app/dashboard/website/actions/inbox.ts` (new file)
- [ ] `ListInboxReservations(clerkOrgId, { limit = 200, locationId?, status?, needsAnswer?, from?, to? })`
      — `source = 'website'`, `.order("created_at", { ascending: false })`, `limit` capped at 500.
      Merchant-wide; **no location filter unless one is passed**
- [ ] `ListInboxSubmissions(clerkOrgId, { limit = 200, formId?, from?, to? })` — cross-form,
      scoped by `merchant_id`, same ordering and cap. Calls the already-exported
      `submissionColumns` **per row** (§1.2)
- [ ] Export `toSubmissionRow` from
      [`forms.ts`](../../../app/dashboard/website/actions/forms.ts) — additive, no behaviour change
- [ ] `MarkReservationRead(clerkOrgId, reservationId, read)` — mirrors `MarkSubmissionRead`
      ([`forms.ts:426`](../../../app/dashboard/website/actions/forms.ts#L426)), two-way.
      **Writes `read_at` only. Never touches `status`** (§2.3)
- [ ] `GetInboxAttentionCounts(clerkOrgId)` → `{ formsUnread, reservationsUnread, reservationsPending, total }`
      — `total` is the union described in §2.3, computed in SQL, not by adding in TypeScript
- [ ] `GetAnswerableLocationIds(clerkOrgId)` (§2.4)
- [ ] `LogAuditEvent` on both mark-read actions, category `website`

### 4.3 Route — `app/dashboard/website/inbox/page.tsx`
- [ ] `export const dynamic = "force-dynamic"`, `auth()` → `orgId`, `loadSiteContext(orgId, location)`
- [ ] Load both tabs server-side, hand to the client screen — same shape as
      [`forms/[formId]/submissions/page.tsx`](../../../app/dashboard/website/forms/%5BformId%5D/submissions/page.tsx)
- [ ] `?tab=` in the URL so a tab is linkable and survives reload. This is the `href` target
      approval-mode §4.9's bell points at once this ships

### 4.4 Screen — `components/site-builder/dashboard/InboxScreen.tsx`
- [ ] Two tabs, `Reservations` default, attention count on each tab label
- [ ] **Reservations columns:** Received (`created_at`, relative), **Branch**, Guest, Party,
      Service date + time, Status, Confirmation number
- [ ] **Forms columns:** Received, Form name, then the derived contact columns
- [ ] Sort **newest-first by `created_at`**, always. Unread rows styled; pending rows styled more
      strongly. **Never reorder by read or pending state** — a list that rearranges as you work
      down it loses your place (handover §3.3)
- [ ] A **Needs answer** filter chip with its own count, sitting above the table. This is the
      cross-branch, cross-day view approval-mode §4.8 explicitly defers to this screen
- [ ] Row action: open the existing
      [`ReservationDetailSheet`](../../../app/dashboard/reservations/components/ReservationDetailSheet.tsx).
      Do not build a second detail view
- [ ] **Thread the row's own `location_id` into the sheet** — see §7.1. Do not let it read the
      location store
- [ ] Confirm/Decline hidden on rows outside `GetAnswerableLocationIds`, with one line of
      explanation (§2.4)
- [ ] Opening a row marks it read, optimistically, as `SubmissionsScreen` already does — **and
      leaves a pending row still counted** (§2.3)
- [ ] Filters: branch, status, needs-answer, date range (Reservations); form, date range (Forms)
- [ ] CSV export exports the **active tab**; reuse
      [`lib/site-builder/forms/export.ts`](../../../lib/site-builder/forms/export.ts) and add a
      reservations CSV shape beside it
- [ ] Show `confirmation_sent_at` as delivery state on the Reservations tab — it is `null` on
      every website booking so far, and surfacing that honestly is the point (handover §6)

### 4.5 Navigation — `app/dashboard/layout.tsx`
- [ ] Add `{ title: "Inbox", url: "/dashboard/website/inbox" }` to the Website sub-nav,
      **first in the list**, above Pages — it is the only screen there a merchant returns to daily
- [ ] Add an optional `badge?: number` to the sub-item shape and render it in the Website branch at
      [`layout.tsx:645-660`](../../../app/dashboard/layout.tsx#L645) — the icon-less
      `SidebarMenuSubButton` map guarded by `isWebsiteOpen`. The other two sub-item maps are
      untouched
- [ ] Feed it from `GetInboxAttentionCounts` via React Query, key
      `["website-inbox-attention", clerkOrgId]`, following the `merchant-unread-ticket-counts`
      precedent at [`layout.tsx:1603`](../../../app/dashboard/layout.tsx#L1603)
- [ ] **Decide the mobile gap.** `dashboardMoreItems` carries the comment *"a page added there
      needs a row here or it becomes unreachable on a phone"* — but it has **zero** Website rows
      today. Pre-existing, not caused by this work; Inbox would be as unreachable as the rest of
      the Website tab. Either add a row or record that Website is desktop-only on purpose

### 4.6 Leave alone
- [ ] `/dashboard/website/forms/[formId]/submissions` stays as the per-form drill-down. It is still
      the right destination *from* a form; removing it is risk for no gain
- [ ] `/dashboard/reservations` day view is untouched. It answers "who is coming tonight"; the
      inbox answers "what has arrived, and what still needs an answer"
- [ ] `submissionColumns` and `SubmissionsScreen` — neither changes (§1.2)

---

## 5. Blast radius — verified 2026-08-30

Checked rather than assumed, because the column lands on a table the POS depends on.

| Checked | Result |
|---|---|
| Any function returning `SETOF reservations`? | **None.** No RPC's return shape can change |
| Any `select("*")` on reservations? | **None.** All nine call sites name columns or use `RESERVATION_COLUMNS` ([notify.ts:99](../../../lib/site-builder/reservations/notify.ts#L99)) |
| `update_updated_at_column()` trigger on `reservations`? | **No such trigger.** Marking read will not bump `updated_at`, so the POS tablet's delta sync will **not** re-pull the row. Reading is not a data change |
| Does `GlobalSearch` index nav? | No — no website or reservation references in it |
| Does the forms half change? | No (§1.2) |
| `reservations.read_at` on staging? | **Absent.** The migration is genuinely needed |
| `app_notifications` / `site_form_submissions` on staging? | Both present |

**Not verified:** the React Native POS tablet is a separate repo. A nullable column plus no
`updated_at` churn should mean no impact, but it cannot be proven from here.

**⚠ The migration ledger is not the source of truth on this project.**
`supabase_migrations.schema_migrations` stops at `20260827170000`, yet `create_public_reservation`,
`reservation_occupancy` and the repaired `user_location_ids()` are all live — applied out of band
via the combined `.sql` files in this folder. **Check `pg_proc` / `information_schema`, never the
ledger**, when deciding whether something is applied.

---

## 6. Verification

- [ ] `npm run test` and a targeted `tsc` pass

### ⚠ 6.1 The test data does not exist yet. Seed it first.

The handover said "four `source='website'` reservations across **two branches**." **That is no
longer true, and it may never have been.** Staging on 2026-08-30:

| Branch | Status | Count |
|---|---|---|
| Joes Downtown Brooklyn Updated | cancelled | 3 |
| Joes Downtown Brooklyn Updated | confirmed | 2 |

**Five bookings, one branch.** Merchant `2add44cb-f498-4653-aca3-a8f0ca258e70` has **5 locations**
and website bookings on exactly one of them. And `site_form_submissions` holds **one row in the
entire database**.

So the single verification that matters cannot be run as things stand — a Branch column fed by one
branch proves nothing, and a Forms tab with one row proves less.

- [ ] **Seed before QA:** website reservations on at least **three** of the merchant's five
      branches, spanning read/unread and — once approval mode ships — `pending`/`confirmed`.
      Several form submissions across **more than one form**, so the cross-form listing (§1.1) is
      actually exercised.
- [ ] Book through the public widget rather than inserting rows, so `assigned_table_ids`, the hold
      path and `confirmation_sent_at` are populated the way production populates them.

### 6.2 Then

- [ ] **The Branch column shows three different branches.** This is the feature; if it does not,
      nothing else matters
- [ ] **Open a pending request, close it, and assert the attention count is unchanged** (§2.3).
      This is the regression that would make the screen lie
- [ ] Attention count increments on a fresh booking; the unread half decrements on open; the
      pending half decrements only on answer
- [ ] Marking read in one browser session is visible in another — proving the per-merchant
      semantic is real and not accidentally per-session
- [ ] As a `merchant.manager` with membership on one branch: rows from every branch are visible,
      and Confirm/Decline is absent — not present-and-failing — on the others (§2.4)
- [ ] Answering from the inbox invalidates the right branch's day view (§7.1)
- [ ] CSV opens in a spreadsheet with correct headers, on both tabs
- [ ] Zero console errors (the standing bar — see the 2026-08-24 QA sweep)

---

## 7. Known couplings

### 7.1 `ReservationDetailSheet` is bound to the day view's location scope

The sheet's mutations read the **selected** location, not the row's.
[`useUpdateReservationStatus(date)`](../../../app/dashboard/hooks/useReservations.ts#L63) calls
`useGatedLocationId()` — the Zustand store — and passes it to the action and to the invalidation
key. In the day view that is correct, because the screen is single-branch. **In the inbox a row
can belong to any branch.**

The RPC itself takes only `p_reservation_id`, so the write succeeds. Two things go wrong quietly:

- `LogAuditEvent` records the **wrong branch**
  ([floor-plan-actions.ts:1058](../../../app/dashboard/actions/floor-plan-actions.ts#L1058))
- `reservationKeys.byDate(org, locationId, date)` invalidates the **wrong branch's** day view

And for a multi-location merchant sitting on "All Locations", `useGatedLocationId()` is null → `''`
→ an empty string into both.

- [ ] Thread the row's own `location_id` as a prop rather than reading the store. Additive; the
      day view keeps passing exactly what it passes today
- [ ] Also invalidate the inbox's own query key, or answering a request leaves the list stale

Approval mode's `RespondToReservationRequestAction` takes `locationId` explicitly, so it inherits
this fix rather than needing its own — provided the inbox passes the row's value.

### 7.2 No `updated_at` trigger on `reservations`

Confirmed absent. Good for the tablet (§5), but it also means a `read_at` write is invisible to
anything watching `updated_at`. That is the intended behaviour, not an oversight.

---

## 8. Out of scope

- **The in-app bell.** Moved to
  [approval mode §4.9](./PLAN-2026-08-29-RESERVATION-APPROVAL-MODE.md), where manual mode makes it
  load-bearing. Its `href` should be repointed from `/dashboard/reservations` to
  `/dashboard/website/inbox` when this ships — a one-line change, and the only thing this plan
  owes that one.
- **A merchant SMS alert.** Telnyx works, Resend does not; the existing email alert path has never
  fired. Neither is in scope here.
- **Any change to `reservation_settings.notify_emails`.**
- **Non-website reservations.** `source = 'website'` only, as decided.
