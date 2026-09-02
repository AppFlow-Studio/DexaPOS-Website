# Plan — Native reservations on merchant websites

**Status:** phases 1–4, 6, 7, 8 built (uncommitted); phase 5 polish and phase 9 outstanding

> **Superseded, 2026-08-28: `link` mode no longer exists.** Reservations is a single on/off,
> and on always means native booking. The master switch moved from the Features card in
> Website settings to the top of `/dashboard/website/reservations`, above the per-branch
> switches. Everything below that reads `link` / `native` as a merchant-facing choice is
> historical — see §7 of
> [HANDOFF-2026-08-28-RESERVATIONS-SPRINT.md](./HANDOFF-2026-08-28-RESERVATIONS-SPRINT.md)
> for what replaced it and the one behaviour change it carries.
**Created:** 2026-08-27 · **Revised:** 2026-08-28 (decisions taken, page-first setup, guest management)
**Design source:** [`docs/research/sevenrooms-reservations/TEARDOWN.md`](../../research/sevenrooms-reservations/TEARDOWN.md)
**Closes:** the last un-built section kind named in [`lib/site-builder/sections/kinds.ts:15-16`](../../../lib/site-builder/sections/kinds.ts#L15-L16)

---

## 1. What we are building

A guest on a merchant's site picks party size, date and time from a grid of real open
slots, fills four fields, and gets a confirmed reservation that lands in the merchant's
existing `/dashboard/reservations` screen and on the POS floor plan — with a confirmation
SMS and email, in two screens, without an account. They can cancel it themselves from a
link in that confirmation.

Today the builder offers only an outbound link: `SITE_FEATURES.reservations` plus
`brand.reservationUrl` puts a "Book a table" button in the header
([`HeaderSection.tsx:26`](../../../components/site-builder/sections/HeaderSection.tsx#L26)).
That link stays — it is the right answer for a merchant already on OpenTable — but it
stops being the *only* answer.

### Decisions taken

| # | Decision | Resolution |
|---|---|---|
| D1 | Auto-confirm or request-to-book? | **Auto-confirm.** Bookings land as `status='confirmed'`. No approval queue in v1. |
| D2 | Deposits / card-on-file? | **Deferred.** `deposit_amount` and `deposit_payment_id` already exist, so it is additive later. |
| D3 | Assign tables at booking, or decrement capacity? | **Assign at booking**, into `assigned_table_ids`. Makes the hold meaningful and gives the host a seating plan. Host can reassign. |
| D4 | Page or section? | **Both — page-first.** The unit is a section kind; setup auto-creates a page containing one. See §3. |
| D5 | Multi-location? | **One brand page with a location picker**, skipped when only one location is bookable. See §3.2. |
| D6 | Guest cancellation? | **In v1.** A token-authed public page, linked from every confirmation. See §2.8 and Phase 6. |

### Three architectural decisions, with reasons

**A section kind underneath, a page on top.** `reservations` becomes section kind #18, and
setup auto-creates and publishes a page containing one. Building a bespoke reservations
*route* would mean writing the whole widget again the first time a merchant wants booking
on their homepage. Building only a section would mean most merchants never finish setup.
Doing both, in this order, costs nothing extra.

**Availability comes from real table inventory.** `floor_plan_objects` already carries
`capacity`, `min_capacity`, `is_reservable`, `is_combinable` and `default_turn_time`, and
`table_sessions` already seats parties against those tables. Computing availability from
them means a website booking consumes the same inventory a walk-in does. The alternative —
a standalone "N covers per slot" counter — is faster to build and double-books the dining
room on a busy Friday. It survives only as a **fallback for merchants with no floor plan**.

**No anon RLS policy on `reservations`, ever.** Reservations hold strangers' names, phone
numbers and emails. We follow the precedent set by
[`20260822120000_website_forms.sql`](../../../supabase/migrations/20260822120000_website_forms.sql)
exactly: reads go through a `SECURITY DEFINER` function that returns only slot times,
writes go through a rate-limited route handler using a service-role client that has already
validated the payload. `public.reservations` keeps its single `"Admin Write"` policy
untouched.

---

## 2. Data model

Five new tables and four new functions. All idempotent, all RLS-enabled, all with
`update_updated_at_column()` triggers for delta sync to the tablet.

### 2.0 Two levels of configuration

The page and the nav link are **site-wide**; service hours and table inventory are
**per location**. Conflating them breaks a merchant whose Downtown branch takes bookings
and whose Airport kiosk does not.

- **Site level** — `mode` lives beside `SITE_FEATURES.reservations` in site settings:
  `'off' | 'link' | 'native'`. This is what creates the page and the nav link.
- **Location level** — `reservation_settings.accepts_reservations` plus periods, blackouts,
  policy and tags.

A location is **bookable** when `accepts_reservations` is true **and** it has at least one
active service period **and** it has either reservable tables or a `max_covers_per_slot`.
Anything less would put a location in the picker whose grid is permanently empty.

When the last bookable location turns off, site-level `mode` drops to `'off'`, which
unpublishes the page and removes the nav link — the same path as flipping it off by hand.

### 2.1 `reservation_service_periods`

The concept we have no equivalent of today. `locations.business_hours` says when the door
is open; it does not say when we seat, how far apart slots are, or how far ahead the book
opens.

```
id                  uuid pk
merchant_id         uuid not null   -- derived by trigger, never supplied
location_id         uuid not null
name                text not null            -- 'Lunch', 'Dinner' — renders inside the slot button
days_of_week        smallint[] not null      -- 0=Sun … 6=Sat
start_time          time not null
end_time            time not null            -- last seating, not closing time
slot_interval_min   smallint not null default 15
turn_time_min       smallint not null default 90
min_party_size      smallint not null default 1
max_party_size      smallint not null default 8
lead_time_min       integer not null default 60
max_advance_days    smallint not null default 60
max_covers_per_slot smallint                 -- NULL = derive from table inventory
is_active           boolean not null default true
```

`name` is the second line inside a slot button — how one grid covers `12:30 PM / LUNCH`
and `7:00 PM / DINNER` on the same day.

### 2.2 `reservation_blackouts`

```
id, merchant_id, location_id
date        date not null
start_time  time         -- NULL = whole day closed
end_time    time
reason      text
```

### 2.3 `reservation_holds`

The 5-minute hold behind the countdown. **A separate table, not a `reservations` row** —
abandoned checkouts are the common case and must not pollute the reservations table,
litter the dashboard, or need a new enum value.

```
id, merchant_id, location_id
service_period_id uuid not null
reservation_date  date not null
reservation_time  time not null
party_size        integer not null
table_ids         uuid[] not null default '{}'
token             text not null unique
expires_at        timestamptz not null
converted_reservation_id uuid
created_at        timestamptz not null default now()
```

Every availability read subtracts live holds. **Correctness must not depend on the sweeper
running** — expired rows are inert because every read filters on `expires_at`.

### 2.4 `reservation_settings` (per location)

```
location_id           uuid pk
accepts_reservations  boolean not null default false
booking_policy        text                     -- body behind the required policy checkbox
notify_emails         text[] not null default '{}'
collect_birthday      boolean not null default false
occasion_tags         text[] not null default '{}'
dietary_tags          text[] not null default '{}'
cancellation_cutoff_min integer not null default 120
large_party_phone     text                     -- shown when party > max_party_size
```

### 2.5 `reservation_alerts` (Phase 9)

```
id, merchant_id, location_id
reservation_date date not null
window_start     time not null
window_end       time not null
party_size       integer not null
name, email, phone
notify_email     boolean not null default true
notify_sms       boolean not null default false
notified_at      timestamptz
expires_at       timestamptz not null
```

### 2.6 `reservations` — additive changes only

```sql
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS service_period_id uuid REFERENCES public.reservation_service_periods(id),
  ADD COLUMN IF NOT EXISTS occasion_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dietary_tags  text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_in       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS manage_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS cancelled_by text
    CHECK (cancelled_by IS NULL OR cancelled_by IN ('guest','staff','system'));
```

`source` already exists — website bookings write `'website'`. `special_requests` takes
"Anything else we should know?". `party_name` takes `first + ' ' + last`. No column is
dropped or retyped; the POS sync contract is unchanged.

### 2.7 `get_public_reservation_availability(...)`

`SECURITY DEFINER`, `STABLE`, granted to `anon`. Scoped by `site_id` so a `location_id`
harvested from page HTML cannot be queried under another merchant's site.

```
(p_site_id uuid, p_location_id uuid, p_date date, p_party_size int)
  → TABLE (slot_time time, service_period_id uuid, service_name text)
```

Returns **times only**. Never table ids, never remaining capacity — an availability
endpoint that leaks "3 of 12 tables left" is a competitor-intelligence feed.

Algorithm, in order:

1. Zero rows unless site `mode='native'` and the location is bookable per §2.0.
2. Reject dates outside `[today + lead_time, today + max_advance_days]`, evaluated in
   `locations.timezone` via [`lib/reservations/local-time.ts`](../../../lib/reservations/local-time.ts).
3. Generate candidate slots from every active period matching that weekday.
4. Drop slots inside a blackout.
5. Drop slots where no combination of reservable tables fits the party, given existing
   `reservations` in `BLOCKING_STATUSES`, live `table_sessions`, and live
   `reservation_holds`, each occupying `turn_time_min`.
6. Apply `max_covers_per_slot` if set.
7. Drop slots already past in the location's timezone.

**Step 5 is the hard part and the whole feature rests on it.** See Phase 2.

### 2.8 Write and management functions

- **`create_public_reservation(...)`** — `SECURITY DEFINER`, granted to **`service_role`
  only**. Validates the hold token, re-runs step 5 against the held tables, inserts,
  marks the hold converted, generates `manage_token`, and returns the id and confirmation
  number — **all in one transaction**. This is the only reason two simultaneous bookings of
  the last table cannot both succeed. The route handler authenticates; this function writes
  atomically. Splitting them is what closes the race.
- **`get_public_reservation_by_token(p_token)`** — `SECURITY DEFINER`, granted to
  `service_role`. Returns one reservation for the manage page: venue, date, time, party,
  status, confirmation number. **Never** the phone or email in full — masked (`•••• 4821`)
  so a leaked link is not a contact-details leak.
- **`cancel_public_reservation(p_token, p_reason)`** — `SECURITY DEFINER`,
  `service_role`. Enforces `cancellation_cutoff_min`, sets `status='cancelled'`,
  `cancelled_at`, `cancelled_by='guest'`, and frees the tables.

`manage_token` is a 32-byte random value, **not** `confirmation_number` — that is short,
human-readable and guessable, and a guessable cancel endpoint lets anyone cancel a
stranger's dinner.

---

## 3. Page-first setup

### 3.1 What happens on save

When a merchant switches site-level `mode` to `'native'` and saves:

1. Create a `site_pages` row: `path='reservations'`, `title='Reservations'`,
   `location_id=NULL` (a brand page), content = an H1 (`Book a table at {restaurant}`)
   plus one `reservations` section. **Not a bare widget on white** — that reads as broken.
2. Default SEO title and description, and `Restaurant` + `ReserveAction` JSON-LD. Without
   these the page is invisible to Google, which is half the point of a page over a modal.
3. **Publish it immediately.** Justified because there is no merchant-authored content to
   review and the whole point is that setup ends with something that works.
4. Append `{ label: 'Reservations', path: 'reservations' }` to `merchant_sites.nav`.
5. Store the page id on the site so it is never re-derived.

**Step 3 is load-bearing and must not be reordered.** `merchant_sites.nav` is read straight
through `readNav` at render time ([`public-context.ts:215`](../../../lib/site-builder/public-context.ts#L215))
with **no version gate**, while an unpublished page hits `notFound()`
([`app/sites/[slug]/page.tsx:135`](../../../app/sites/%5Bslug%5D/page.tsx#L135)). Adding
the nav link before publishing puts a live 404 in the header of every page on the site.

### 3.2 The location picker

The page is a brand page, so it serves every location. The widget's **first step is a
location chooser** — skipped entirely when exactly one location is bookable, which is the
common case. It lists only bookable locations per §2.0, each with its address, and the
grid is labelled in that location's own timezone, never the visitor's.

This keeps the nav to one item regardless of how many restaurants the merchant runs.

### 3.3 Turning it off

Setting `mode` back to `'off'` or `'link'`:

- removes the nav item,
- **unpublishes** the page — content preserved for later, unreachable now,
- leaves future bookings intact; the merchant is told how many exist and must cancel them
  deliberately rather than having them silently orphaned.

### 3.4 Four edge cases that must be handled, not discovered

| Case | Behaviour |
|---|---|
| Merchant deletes the auto-created page | **Never recreate it.** The stored page id is set once at creation and never re-derived. A page that grows back is worse than no page. |
| Nav already at `MAX_NAV_ITEMS` (8, [`nav.ts:44`](../../../lib/site-builder/nav.ts#L44)) | Create and publish the page, skip the link, and say so in Settings: *"Your menu is full — remove a link to add Reservations."* Silently dropping it is the worst outcome. |
| `/reservations` path already taken | **Adopt the existing page** — append the section to it. Never create `/reservations-2`. |
| Merchant has no floor plan | Block the switch to `'native'` until they set a covers-per-slot cap, or they publish a page with a permanently empty grid. |

`reservations` is **not** in `RESERVED_PATH_SEGMENTS`, so the path is available.

---

## 4. Phases

Each phase is independently verifiable. 1–5 are the critical path.

### Phase 1 — Schema — *code complete, application blocked*

- [x] [`20260828120000_reservation_availability.sql`](../../../supabase/migrations/20260828120000_reservation_availability.sql)
      — tables §2.1–2.5, a shared `reservation_derive_tenancy()` trigger modelled on
      `site_forms_derive_tenancy()`, `updated_at` triggers, RLS with
      `is_merchant_admin(merchant_id)` for `authenticated` and **no anon policy**
- [x] [`20260828120100_reservations_website_columns.sql`](../../../supabase/migrations/20260828120100_reservations_website_columns.sql)
      — the `ALTER TABLE` from §2.6, plus the `merchant_sites` provisioning columns
- [x] Indexes: `reservation_holds` filtered to live rows; `reservations` filtered to
      exactly `BLOCKING_STATUSES`; unique on `reservations.manage_token`
- [x] Site-level mode in [`site-settings.ts`](../../../lib/site-builder/site-settings.ts)
      as `brand.reservationMode` + `resolveReservationMode()`, with 6 tests
- [x] **Applied to dev** and verified read-only over MCP: 5 tables with RLS on; zero policies
      and zero table grants reaching `anon`; all 7 `reservations` columns with
      `manage_token` nullable as designed; all 8 constraints including the `cardinality()`
      day check; 5 tenancy + 3 `updated_at` triggers; token generator returning distinct
      64-char lowercase hex
- [x] Regenerated `database.types.ts` from dev

**Verified.** The one policy the anon sweep returned — `"Admin Write"` on `reservations`,
`TO public` — is pre-existing and safe: it is gated by `USING is_merchant_admin(merchant_id)`,
which is false for anon, and anon holds no table privilege on `reservations` at all, so the
request is refused before RLS is consulted.

**Type regeneration exposed real drift, and one trade-off to settle.** The committed
`database.types.ts` was badly stale — missing the *entire* website builder (`merchant_sites`,
`site_pages`, `site_forms`, `site_assets`, `site_events`, every `get_public_site_*`), plus
KDS snapshots, Valor payments and app notifications: 68 objects present on dev and absent
from the checked-in types. Regenerating gains all of those.

It also **drops two**, because dev does not have them: `orderout_menu_sync_results` and
`reconcile_stuck_push_channels_syncs`, referenced from four call sites in
`app/dashboard/actions/orderout.ts` and `app/manage/actions/admin-merchant/orderout.ts`.
That is the unapplied OrderOut migration showing through. The fix is to apply it to dev and
regenerate, which restores both; until then those four sites lose their types (builds
already ignore TS errors, and the code could not work against dev anyway).

Two decisions worth recording, both made while writing the SQL:

- **`brand.reservationMode` rather than a tri-state `features.reservations`.** The toggle
  is stored on live rows and already gates the section catalogue and the header button.
  Splitting *whether* from *how* means a row written before native booking existed resolves
  to `link` — exactly today's behaviour — with no data migration and no reader relearning a
  shape. `resolveReservationMode()` collapses the two fields into the single three-way
  answer every surface actually wants.
- **`manage_token` is nullable with a default added separately.** A token generator must be
  `VOLATILE`, and `ADD COLUMN … DEFAULT <volatile>` rewrites the entire table under an
  `ACCESS EXCLUSIVE` lock. Adding the column bare and then `ALTER COLUMN … SET DEFAULT` is
  metadata-only, so new rows get tokens and old ones stay NULL — which is also the honest
  shape, since bookings predating the column have no manage page.

### Phase 2 — Availability engine — *TypeScript done, SQL port pending*

The riskiest phase. Pure TypeScript first, so it is testable without a database.

- [x] [`lib/reservations/availability.ts`](../../../lib/reservations/availability.ts) —
      `generateSlots`, `tableCombinations`, `firstFreeCombination`, `isBlackedOut`,
      `computeAvailability` implementing the seven steps of §2.7. No client, no clock:
      "now at the location" is passed in
- [x] Extended [`conflict-detection.ts`](../../../lib/reservations/conflict-detection.ts)
      with shared `minutesFromHHMM` / `hhmmFromMinutes` / `rangesOverlap` rather than
      duplicating overlap logic — so the grid a guest sees and the guard that accepts
      their booking cannot disagree about what "occupied" means
- [x] 40 unit tests in
      [`__tests__/availability.test.ts`](../../../lib/reservations/__tests__/availability.test.ts),
      covering every case the plan listed plus the weekday-parsing and half-open-interval
      traps found while writing it
- [x] Ported to SQL as
      [`20260828140000_reservation_availability_function.sql`](../../../supabase/migrations/20260828140000_reservation_availability_function.sql)
      — `SECURITY DEFINER`, `STABLE`, granted to `anon`, scoped by `site_id`, returning
      slot times and service labels only
- [x] **Parity established as golden output.** Each expectation in the
      `"parity with the SQL port"` block of the availability suite was produced by running
      the SQL fit query against Postgres on that fixture, then asserted against the
      TypeScript engine. Two fixtures: a single table blocked mid-service, and a harder one
      combining a non-combinable table, a minimum-capacity exclusion and a two-table
      combination. Both produce
      `17:00, 17:15, 17:30, 20:30 … 22:00` from both implementations
- [x] 11 contract tests in
      [`tests/reservation-availability-function.test.ts`](../../../tests/reservation-availability-function.test.ts)
      asserting the migration keeps its security properties, and that the SQL status list
      still equals `BLOCKING_STATUSES`
- [ ] **Apply the function to dev** — needs a run in the SQL editor

**Verify:** 876 passing across 44 files, no regressions.

**Why the fit test is written differently in SQL, and why that is still parity.** The
TypeScript engine enumerates valid table combinations and asks whether one is free;
enumerating in SQL would be miserable, so the function filters to tables whose
`min_capacity` the party meets and asks whether the three largest free ones have enough
total capacity between them. Those are the same question: every table in a valid set must
satisfy the minimum, so filtering first loses no set, and among the survivors the k largest
maximise the total, so a set of ≤ k exists exactly when the top k suffice. The golden-output
fixtures exist because "provably equivalent" and "proven to still agree after the next edit"
are different things.

**Performance, measured on a 40-table floor plan with 60 existing bookings** (the risk the
plan flagged). First cut: 6,585 candidate combinations for a party of two, 1.50 ms/query.
Adding one prune to the combination search — *a set that already seats the party is never
extended*, since any superset is dominated by a subset already emitted — took that to 40
combinations and **0.14 ms/query**, roughly a 10× improvement with no change in results.
Worst case measured is a party of eight at 0.62 ms. The 30-second cache in §5 is therefore
about saving database round trips, not CPU.

### Phase 3 — Public API — *built; end-to-end smoke test outstanding*

- [x] SQL write path, applied and verified on dev:
      [`20260828150000`](../../../supabase/migrations/20260828150000_reservation_occupancy_function.sql)
      extracts `reservation_occupancy()` — **one definition of "occupied"**, called by both
      the availability grid and the booking re-check — and rewrites the availability
      function onto it;
      [`20260828160000`](../../../supabase/migrations/20260828160000_reservation_public_write.sql)
      adds `create_public_reservation_hold`, `create_public_reservation`,
      `get_public_reservation_by_token`, `cancel_public_reservation`
- [x] All four writers `service_role` only, with explicit `REVOKE` from `anon` — confirmed
      in `pg_proc`, and confirmed by a non-service-role call to `reservation_occupancy`
      being refused with `permission denied`
- [x] [`availability`](../../../app/api/site-reservations/availability/route.ts),
      [`hold`](../../../app/api/site-reservations/hold/route.ts),
      [`book`](../../../app/api/site-reservations/book/route.ts),
      [`cancel`](../../../app/api/site-reservations/cancel/route.ts) — all four following
      the order in [`site-forms/submit`](../../../app/api/site-forms/submit/route.ts)
- [x] Shared [`protocol.ts`](../../../lib/site-builder/reservations/protocol.ts) and
      [`endpoint.ts`](../../../lib/site-builder/reservations/endpoint.ts), so four endpoints
      cannot implement "the same" security posture four subtly different ways
- [x] Rate limits: availability `60/5min`, hold `10/5min`, book `5/15min`, cancel `10/15min`
- [x] **Uniform failure responses**, and 15 helper tests
- [x] **Smoke tested against dev** —
      [`phase3-smoke-test.sql`](./phase3-smoke-test.sql), a transaction that runs the whole
      guest journey and then rolls itself back. `RESULT: PASS`, 0 failures:
      21 slots → hold → held tables read as occupied → book (`RES-B8F3KT`) → double submit
      returns the same booking → manage page with `s•••••@example.com` / `•••• 4567` →
      cancel → repeat cancel still succeeds → table freed → unknown token reveals nothing →
      **holds exhausted the 17:00 slot after exactly 16 more holds on a 16-table floor
      plan**, and only then did the grid stop offering it

**Verify:** 903 passing across 45 files, plus the smoke test above.

The smoke test's first run failed, and it was the test that was wrong: it asserted the slot
would vanish from the grid after one hold, on a floor plan with sixteen tables. Holding one
two-top leaves fifteen free, so the slot is correctly still bookable. The invariant is about
the *tables*, not the slot — step 10 is the floor-plan-independent version of the same
question, and it is the one worth keeping.

Notes from building it:

- **`create_public_reservation` must exclude its own hold from the re-check.** That hold
  occupies the very tables it is converting, so counting it rejects every booking. There is
  a contract test pinning the line, because it is the easiest way to break the feature while
  every other test still passes.
- **Availability is a POST despite being a read.** A GET would put a merchant's opening
  pattern into browser history, proxy logs and CDN caches, and a cached grid offers tables
  that are already gone.
- **The hold returns an absolute `expiresAt`, never a duration.** A countdown from "5
  minutes from when you got this" drifts by the response time and by whatever the client
  clock believes, and then hits zero at a different moment than the hold actually expires.
- Two bugs were found by running the SQL rather than reading it: `= ANY(subquery)` over an
  array does not typecheck, and `int(null)` returned `0` because `Number(null)` is `0` and
  `0` is an integer.

### Phase 4 — Section and page provisioning

- [x] [`schemas/reservations.ts`](../../../lib/site-builder/sections/schemas/reservations.ts)
      — presentation props only (`title`, `subtitle`, `locationId`, `showDetails`,
      `showOtherDates`). Availability config lives on `reservation_settings`, never in page
      JSON, so changing hours does not require republishing every page
- [x] Registered in [`kinds.ts`](../../../lib/site-builder/sections/kinds.ts) and
      [`registry.ts`](../../../lib/site-builder/sections/registry.ts) as kind #18, gated on
      the feature so `AddSectionModal` picks it up with no modal changes; `CalendarCheck`
      added to the icon allowlist
- [x] [`ReservationsSection.tsx`](../../../components/site-builder/sections/ReservationsSection.tsx)
      — server component, renders a **mount point** rather than the widget
- [x] `reservations/ReservationWidget.tsx` + `ReservationRuntime.tsx` — the client island,
      mounted by the public route
- [x] Renderer binding in `components/site-builder/registry.tsx`
- [x] **Static mock grid in builder and preview** — server-rendered, inert, no mount point
- [x] Page provisioning per §3.1 —
      [`reservations-page.ts`](../../../app/dashboard/website/actions/reservations-page.ts):
      `EnsureReservationsPage` (create → **publish → then link**) and
      `RetireReservationsPage` (**unlink → then unpublish**, never delete), with all four
      edge cases of §3.4 and 13 tests
- [x] `merchant_sites.reservations_page_id` / `…_provisioned_at` added to `MerchantSiteRow`

**Verify:** 906 passing across 45 files.

**The page shape was decided by the document contract, not by taste.** The first version was
header + widget + footer with a short SEO description, on the argument that a hero pushes the
time grid below the fold. `validatePage` rejected it twice over: `hero` is a **required**
section, and an unbound `footer` fails with *"Footer is not linked to a location yet"*. Since
provisioning calls `PublishPage`, and publish refuses an invalid document, that page could
never have been created — the merchant would have seen a failure with nothing to act on.

The footer now binds to `brand.defaultLocationId`, falling back to the merchant's first
active location. The page itself stays a **brand** page (`location_id` NULL) because it books
for any branch; only the footer needs one address to print.

**Verify:** 893 passing across 44 files.

**The architecture had to change, and the tests are why.** The first cut had the section
importing a `"use client"` widget. `render.test.tsx` rejected it, and the rule turned out
not to be stylistic: the builder canvas re-renders through `renderToStaticMarkup`, and Next
refuses `react-dom/server` in any module graph reaching a client component — so a section
importing the widget would have broken the canvas for **every merchant on every page**,
whether or not they use reservations.

The fix is the arrangement `tracking/SiteAnalyticsScripts` already uses: the section emits
an empty `<div data-dexa-reservations='{…}'>`, and a runtime mounted by the public route —
beside the page, never inside it — portals the widget into each one. `reservations/` joins
`tracking/` in `PUBLIC_ROUTE_ONLY_DIRS`, and the sibling test proves the render graph cannot
reach it. Reservations is the first section that genuinely needs client JavaScript: a grid
that repopulates on a party-size change, and a countdown against a real five-minute hold,
cannot be a native form the way `PublicForm` is.

A useful consequence: in builder and preview the section renders a **server-rendered static
mock** with no mount point at all, so there is nothing to hydrate and no way for a merchant
laying out their page to place a real hold on a real table during service.

### Phase 5 — The guest booking flow

Both screens live in the widget; **the second is a client-side step, not a route** — the
section can sit anywhere on a page, so navigating away would lose it.

- [ ] Location picker step, skipped when one location is bookable
- [ ] **Search view**: one pill, three segments, small grey label over large value, active
      segment lifting to a white sub-pill
- [ ] Defaults `2 guests / today / All Times`, results on first paint, **no search button**
- [ ] Guests clamped to the period's party-size range; over the maximum shows
      *"For parties of 9 or more, please call us at {large_party_phone}"* rather than an
      empty grid
- [ ] Two-month date picker; days past `max_advance_days` disabled but rendered
- [ ] Time segment filters the grid; it is not the booking time
- [ ] **Slot grid**: solid filled buttons in the merchant's brand colour, 4 columns desktop
      / 2 mobile, service name as a second line when the day has >1 period
- [ ] `Alert Me` as the last grid cell, outlined, same size (behaviour in Phase 9)
- [ ] `Other dates with availability` — next 3 dates as horizontally scrolling **outlined** chips
- [ ] **Checkout view**: sticky bar `‹ Venue · Fri, Aug 28 · 7:00 PM · 2 guests ⏱ 4:53`
      counting down from the hold's `expiresAt`
- [ ] Back arrow preserves the selection and **releases the hold**
- [ ] Expiry → back to search with "That slot was released" and a refreshed grid. **Never
      fail silently on submit**
- [ ] Fields: First, Last, Email, Phone (country selector) required; Birthday `mm`+`dd` only
      when `collect_birthday`
- [ ] Collapsed accordions for occasion tags, dietary tags, party dietary tags, free text —
      the form must *look* like four fields
- [ ] Consents: policy required-unchecked; two marketing unchecked; transactional SMS
      **pre-checked**
- [ ] Success view: confirmation number, the four facts, `.ics` download, and the manage link
- [ ] Keyboard nav with visible focus on the grid; `aria-live` so the grid repopulating is
      announced

**Verify:** browser QA at 1440 and 390 per the `playwright-browser-qa-recipe` memory. Zero
console errors. End-to-end booking on a seeded merchant.

### Phase 6 — Guest management — *done except "change time"*

Without this, every change is a phone call and no-shows rise, because not showing up is
easier than cancelling.

- [x] Route **`app/sites/[slug]/r/[token]`** — server-rendered from
      `get_public_reservation_by_token`, contact details masked.
      **Not `reservations/[token]`**: the merchant's own page lives at the `reservations`
      path and is served by the `[...path]` catch-all, but a more specific route wins over
      a catch-all in Next — so `reservations/[token]` would silently shadow any sub-page a
      merchant later creates under it (`reservations/private-dining` would be looked up as
      a token and 404). A single reserved segment avoids the whole class of problem and
      matches the existing convention, where QR dine-in already owns `t`
- [x] Shows venue, date, time, party, confirmation number, status, and the booking policy
- [x] **Cancel** with confirmation, honouring `cancellation_cutoff_min`; past the cutoff it
      shows the venue phone number instead
- [ ] **Change time** = release, re-run availability, re-book — reusing the Phase 5 widget
      *(not built — cancel-and-rebook works, one-step change does not)*
      rather than a second implementation
- [x] Already-cancelled shows a terminal state, never an error
- [x] Manage link in every confirmation SMS and email
- [x] Guest cancellation notifies the merchant *(Priority Alert is Phase 9 and unbuilt)*
- [x] Add **`r`** to `RESERVED_PATH_SEGMENTS` alongside `t`, so a merchant cannot create a
      page that shadows the manage route. Leave `reservations` unreserved — that path is
      theirs. A test already asserts this list stays in step with the route tree

**Verify:** book, cancel from the link, confirm the table frees and the merchant is told.
A tampered token is indistinguishable from a valid one for a cancelled booking.

### Phase 7 — Confirmation and the merchant side — *done*

- [x] `reservation.created` SMS via the existing
      [`notify-reservation-guest`](../../../supabase/functions/notify-reservation-guest/index.ts)
      — already built and templated, needs only to be called
- [x] Confirmation email via Resend using `lib/messaging/reservation-templates.ts`
- [x] **Store first, notify second.** A provider outage must never lose a booking
- [x] New-booking notification to `reservation_settings.notify_emails`
- [x] `LogAuditEvent` — `actionCategory: 'reservations'`, `action: 'website_reservation_created'`
- [x] **Source badge** in `/dashboard/reservations` so merchants can see at a glance what
      came from the website
- [ ] Confirm they appear on the POS floor plan via `get_floor_snapshot_v1`

### Phase 8 — Merchant configuration — *done*

- [x] [`SettingsScreen.tsx`](../../../components/site-builder/dashboard/SettingsScreen.tsx):
      Reservations is now `Link to my provider` / `Take bookings on my site`, on top of the
      existing feature toggle that supplies `Off`
- [x] `'link'` keeps `brand.reservationUrl` verbatim — **no regression**, pinned by a test
- [x] [`SyncReservationsPage`](../../../app/dashboard/website/actions/reservations-page.ts) —
      called after the brand write and reconciles the page and nav to the mode that was just
      *stored*, so there is no second source of truth to drift
- [x] Post-save reporting: page live, page adopted, or **menu full so nothing links to it**
- [x] [`reservations-settings.ts`](../../../app/dashboard/website/actions/reservations-settings.ts)
      — `GetReservationConfig`, `SetLocationAcceptsReservations`,
      `UpdateLocationReservationSettings`, `SaveServicePeriod`, `DeleteServicePeriod`
- [x] **Working defaults on first switch** — Dinner, every day but Monday, 5–10 PM, 15 min
      slots, 90 min turn, 1–8 guests, seeded automatically the first time a location is
      switched on
- [x] The no-floor-plan guard from §3.4, as computed `blockers` per location
- [x] `validatePeriod` — the CHECK constraints restated in the merchant's words, with 11
      tests pinning each one to the constraint it mirrors
- [x] The service-periods and policy **editor**:
      [`ReservationsScreen.tsx`](../../../components/site-builder/dashboard/ReservationsScreen.tsx)
      at `/dashboard/website/reservations`, with a sidebar entry. Per-location switch,
      service-times editor, booking policy, cancellation cutoff, large-party phone, notify
      emails, and the computed blockers shown in place
- [x] Shapes, defaults and validation in
      [`lib/site-builder/reservations/service-periods.ts`](../../../lib/site-builder/reservations/service-periods.ts)
- [x] Blackout-dates editor — table and actions exist; no UI yet
- [x] `HeaderSection.tsx` — "Book a table" opens the widget in a dialog when `'native'`,
      still links out when `'link'`
- [x] Deleting a location with future website bookings: cancel and notify, never orphan

**Verify:** 917 passing across 46 files, and `npm run build` compiles clean with all five
new routes present.

**A `"use server"` module may export async functions and nothing else — including types.**
The first cut put `validatePeriod`, `DEFAULT_SERVICE_PERIOD` and the interfaces in the
actions file, which typechecks fine and fails the build: Turbopack compiles every export
into the server-action manifest and cannot see through `export type`, so it emits
`Export ServicePeriodInput doesn't exist in target module`. Everything that is not an async
function now lives in `lib/site-builder/reservations/service-periods.ts`, which the editor
also imports directly — it validates a draft before the round trip, so a merchant is told
the last seating cannot precede the first without waiting for a save.

**Only `npm run build` catches this class of error.** `tsc --noEmit` and the whole vitest
suite passed on the broken version.

**Verify:** all three modes behave on a published site. An existing `reservationUrl` site is
untouched after migration.

### Phase 9 — Priority Alert, SEO, analytics

- [ ] `POST /api/site-reservations/alert` and the modal from teardown §4
- [ ] Notify matching alerts when a cancellation frees a slot
- [ ] JSON-LD in [`json-ld.ts`](../../../lib/site-builder/json-ld.ts): `Restaurant` with
      `acceptsReservations` and a `ReserveAction`
- [ ] Tracking in [`tracking.ts`](../../../lib/site-builder/tracking.ts): `reservation_start`
      exists; add `reservation_slot_selected`, `reservation_complete`,
      `reservation_cancelled`, `reservation_alert_created`
- [ ] Daily cron sweeping stale `reservation_holds` and expired `reservation_alerts`

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| **Double-booking under concurrency** | Availability is advisory; `create_public_reservation` re-checks inside the transaction. Concurrent-booking test in Phase 3. |
| **Availability query too slow** — combination search per slot, on every picker change | Pure-TS engine first so it can be profiled without a DB. Partial indexes. 30s cache per `(location, date, party_size)`, matching the `staleTime` `useReservations` already uses. |
| **Timezones** — naive `time` column, zone on the location | All past/lead-time logic goes through `lib/reservations/local-time.ts`. Explicit DST test. Picker labels each location in its own zone. |
| **Live nav link to an unpublished page** | Publish-before-link, ordered and commented in §3.1. |
| **Preview creating real holds** | Static mock grid in builder *and* preview (Phase 4). |
| **Guessable cancel links** | 32-byte random `manage_token`, never `confirmation_number`. Masked contact details. Uniform responses. |
| **Abuse — fake bookings, phone harvesting, availability scraping** | Rate limits at four tiers, honeypot + timing, uniform failures, times-only availability, salted `ip_hash` only. |
| **Scope creep into a full reservations product** | D2 defers deposits; Experiences is out. Ships when a stranger can book and cancel a table. |

---

## 6. Definition of done

- A stranger books a table on a published merchant site in two screens, no account, on a phone.
- They can cancel it from a link in their confirmation, and the table frees.
- The booking is a `reservations` row with `source='website'`, visible in
  `/dashboard/reservations` with a source badge and on the POS floor plan with tables assigned.
- Guest gets SMS and email; merchant gets a notification on booking and on cancellation.
- Two simultaneous bookings of the last table → one success, one clean failure.
- One save in Settings produces a published, nav-linked, working page.
- Turning it off removes the link and unpublishes the page, preserving content.
- A multi-location merchant gets one nav link and a location picker.
- `mode='link'` merchants are byte-for-byte unaffected.
- No anon role can read a single row of `reservations`.
- Phase 2 unit tests and the TS↔SQL parity test are green; browser QA at 1440 and 390 is clean.

---

## 7. Sequencing note

Phases 1–5 are one continuous piece — schema, engine, API, section and flow are useless
individually. Phase 6 is what makes it honest rather than a trap. Phases 7–8 make it a
product. Phase 9 is optional for a first release, though `Alert Me` has the best return of
anything on the list once the core works.
