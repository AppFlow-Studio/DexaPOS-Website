# Handoff — native reservations sprint

**Date:** 2026-08-28 · **Branch:** `feat/website-owner-ui` · **Status:** phases 1–4, 6, 7 and 8 done; phase 5 polish outstanding. **Link mode has been removed and the master switch has moved — see §7.**
**Plan:** [PLAN-2026-08-27-RESERVATIONS-SECTION.md](./PLAN-2026-08-27-RESERVATIONS-SECTION.md)
**Newer:** [HANDOFF-2026-08-29-RESERVATIONS-QA.md](./HANDOFF-2026-08-29-RESERVATIONS-QA.md) —
the browser QA and the UX rework that followed this sprint. **Read it for the current open
bug list**; three findings there change what is true below.
**Design source:** [SevenRooms teardown](../../research/sevenrooms-reservations/TEARDOWN.md)

Nothing here is committed. All five migrations **are applied to dev**.

---

## 1. What this sprint built

A guest on a published merchant site can pick a party size, date and time from a grid of
real availability, hold the slot for five minutes, and book it — landing as an ordinary
`reservations` row with `source='website'`, visible in the existing dashboard and on the POS
floor plan with tables already assigned. A merchant can turn the whole thing on from the
dashboard and set their service times without touching SQL.

It began as a teardown of two SevenRooms booking pages, driven in a real headless browser
(`WebFetch` returns an empty shell for those — they are SPAs). Twelve screenshots and the
field dumps are in [`docs/research/sevenrooms-reservations/`](../../research/sevenrooms-reservations/).

**Verification at the end of the sprint:** 917 tests passing across 46 files in the
reservations + site-builder scope; 1490 passing in the full suite with the same 9
pre-existing failures that were there at the start (`kds-routing-traceability-migration`,
`orders`, `a11y/storefront`, `cascade-labels` — all verified unrelated); `npm run build`
compiles clean.

**Verification after the phases 6–8 pass (below):** **974 passing across 57 files** in the
same scope, and `npm run build` compiles clean with `/sites/[slug]/r/[token]` and all four
`/api/site-reservations/*` routes present in the route tree.

---

## 2. Decisions taken

Six were put to the product owner and answered; the rest were forced by the codebase.

| # | Decision | Answer |
|---|---|---|
| D1 | Auto-confirm or request-to-book? | **Auto-confirm.** A `pending` booking makes the confirmation message a lie. |
| D2 | Deposits / card-on-file? | **Deferred.** `deposit_amount` and `deposit_payment_id` already exist, so it stays additive. |
| D3 | Assign tables at booking, or decrement a counter? | **Assign.** Makes the hold mean something and gives the host a seating plan. |
| D4 | Page or section? | **Both, page-first.** The unit is a section kind; setup auto-creates and publishes a page containing one. |
| D5 | Multi-location? | **One brand page with a location picker**, skipped when only one location is bookable. |
| D6 | Guest cancellation? | **In v1**, ahead of Priority Alert. Booking without cancelling is half a feature. |

### Architectural decisions, and why

**Availability comes from real table inventory.** `floor_plan_objects` already carries
`capacity`, `min_capacity`, `is_reservable`, `is_combinable` and `default_turn_time`, and
`table_sessions` already seats parties against them. A website booking therefore consumes
the same inventory a walk-in does. A standalone covers-per-slot counter would have been
quicker and would double-book the dining room on a busy Friday; it survives only as the
fallback for merchants with no floor plan.

**No anon RLS policy on `reservations`, ever.** Reads go through a `SECURITY DEFINER`
function returning slot times only; writes go through rate-limited route handlers using a
service-role client. This copies [`20260822120000_website_forms.sql`](../../../supabase/migrations/20260822120000_website_forms.sql)
deliberately rather than inventing a second pattern.

**Site level and location level are separate.** `brand.reservationMode` (site) decides
whether the business books on its own site and creates the page and nav link;
`reservation_settings.accepts_reservations` (location) decides whether a branch does. A
merchant whose Downtown books online and whose Airport kiosk does not needs both.

**`brand.reservationMode` rather than a tri-state feature toggle.** `features.reservations`
is stored on live rows and already gates the section catalogue and header button. Splitting
*whether* from *how* means every existing row resolves to `link` — exactly today's behaviour
— with no data migration and no reader relearning a shape. There is a test pinning it.

**Publish before linking; unlink before unpublishing.** `merchant_sites.nav` is read live
through `readNav` with no version gate, while an unpublished page hits `notFound()`. Get the
order wrong in either direction and the header carries a live 404.

---

## 3. The three things most likely to bite whoever picks this up

### The render graph is server-only, and it is enforced

`render.test.tsx` refuses any `"use client"` file under `components/site-builder` outside a
carved-out list. That is **not** a style rule: the builder canvas re-renders through
`renderToStaticMarkup`, and Next refuses `react-dom/server` in any module graph reaching a
client component. A section importing a client widget breaks the canvas for **every merchant
on every page**, whether or not they use the feature. Relocating the file does not help —
the import graph is what matters.

Reservations is the first section that genuinely needs client JavaScript, so it uses the
arrangement `tracking/SiteAnalyticsScripts` already established: the section emits an empty
`<div data-dexa-reservations='{…}'>` and `ReservationRuntime`, mounted by the public route
*beside* the page, portals the widget into it. `reservations/` joined `tracking/` in
`PUBLIC_ROUTE_ONLY_DIRS`, and a sibling test proves the render graph cannot reach it.

> That sibling test greps for the excluded directory path and cannot tell a doc comment from
> an import — mentioning `components/site-builder/reservations/` in a comment inside a
> section fails it.

### A `"use server"` module may export async functions and nothing else

Including types. Turbopack compiles every export into the server-action manifest and cannot
see through `export type`, so a type-only re-export fails with
`Export ServicePeriodInput doesn't exist in target module`.

**`tsc --noEmit` and all 917 tests passed on the broken version.** Only `npm run build`
catches it. Run a build before calling any server-action work done.

Everything that is not an async function lives in
[`lib/site-builder/reservations/service-periods.ts`](../../../lib/site-builder/reservations/service-periods.ts).

### The availability engine exists twice, and a golden-output test keeps them honest

[`lib/reservations/availability.ts`](../../../lib/reservations/availability.ts) is the
reference implementation; `get_public_reservation_availability` is what anon calls. They
answer the fit question **differently on purpose** — TypeScript enumerates valid table
combinations, SQL filters to tables the party meets the minimum for and asks whether the
three largest free ones have enough capacity between them. That is provably the same
question, but "provably equivalent" is not "still agreeing after the next edit", so two
fixtures were run through Postgres and their output pasted into the TS suite as expectations.

If you change either side, those two tests are the tripwire.

---

## 4. Bugs found, and what found them

Worth reading as a list of what actually catches things in this codebase.

| Bug | Consequence if shipped | Found by |
|---|---|---|
| `ADD COLUMN … DEFAULT <volatile>` on `reservations` | Full table rewrite under `ACCESS EXCLUSIVE` — a service outage on any merchant with a year of bookings | Review while writing |
| `array_length(days_of_week,1) BETWEEN 1 AND 7` | Returns NULL for an empty array, a NULL check **passes** — a service running on no days, silently accepted | Review while writing |
| `= ANY(subquery-returning-array)` | Runtime `operator does not exist: uuid = uuid[]` on every hold | Running the SQL |
| `int(null) === 0` | `null`, `""`, `[]` and `false` all become a party of zero | Unit test |
| Section importing a client widget | Builder canvas broken for every merchant | `render.test.tsx` |
| Reservations page had no hero, unbound footer | `PublishPage` refuses an invalid document — the page could never be created | Unit test |
| Values exported from a `"use server"` module | Build failure | `npm run build` |
| `format('…%n')` in the smoke test | `unrecognized format() type specifier "n"` | Running it |
| Smoke test asserting the slot vanishes after one hold | *The test was wrong, not the code* — 15 other tables were still free | Running it |

That last one is the useful one: the first smoke run reported `RESULT: FAIL` against
perfectly correct code. The invariant is about the *tables*, not the slot. Step 10 of the
smoke test is the floor-plan-independent version and is the one worth keeping.

---

## 5. What exists now

### Database — five migrations, all applied to dev

| Migration | Contents |
|---|---|
| `20260828120000_reservation_availability` | `reservation_service_periods`, `_blackouts`, `_holds`, `_settings`, `_alerts`; shared tenancy trigger; RLS with no anon policy |
| `20260828120100_reservations_website_columns` | 7 additive columns on `reservations`, 2 on `merchant_sites`, the manage-token generator |
| `20260828140000_reservation_availability_function` | `get_public_reservation_availability` — `SECURITY DEFINER`, granted to `anon` |
| `20260828150000_reservation_occupancy_function` | `reservation_occupancy` — the single definition of "occupied"; availability rewritten onto it |
| `20260828160000_reservation_public_write` | `create_public_reservation_hold`, `create_public_reservation`, `get_public_reservation_by_token`, `cancel_public_reservation` — all `service_role` only |

Verified on dev: 5 tables with RLS on, zero policies and zero table grants reaching `anon`,
all constraints and triggers present, and `reservation_occupancy` correctly refusing a
non-service-role caller with `permission denied`.

### Application

- **Engine** — `lib/reservations/availability.ts`, plus shared primitives extracted into
  `conflict-detection.ts` so the grid and the booking guard cannot disagree about "occupied"
- **Public API** — `app/api/site-reservations/{availability,hold,book,cancel}`, on shared
  `protocol.ts` and `endpoint.ts`
- **Section** — kind #18: schema, registry entry, server renderer emitting a mount point,
  client widget + runtime
- **Provisioning** — `reservations-page.ts`: `SyncReservationsPage`,
  `EnsureReservationsPage`, `RetireReservationsPage`
- **Configuration** — `reservations-settings.ts` + `/dashboard/website/reservations`, with a
  sidebar entry; mode picker in `SettingsScreen`

### Smoke test

[`phase3-smoke-test.sql`](./phase3-smoke-test.sql) runs the whole guest journey against real
data inside a transaction that rolls itself back, and reports through a deliberate
`RAISE EXCEPTION` because Supabase's editor shows errors reliably and `NOTICE`s unreliably.
Last run: **`RESULT: PASS`, 0 failures**, including holds exhausting a 17:00 slot after
exactly 16 more holds on a 16-table floor plan.

Re-run it after any change to the write path.

---

## 6. Phases 6, 7 and 8 — what the follow-up pass built

Still uncommitted, and it needs **no new migration**: every table and function it uses was
already applied to dev by the original sprint.

### Phase 7 — the guest is finally told

`lib/site-builder/reservations/notify.ts` sends the guest a confirmation SMS and email and
alerts the merchant, and `app/api/site-reservations/{book,cancel}` call it through
**`after()`** — the response is already on the wire before Telnyx or Resend is touched. A
provider outage cannot turn a stored booking into an error page for someone who now has a
table, and a guest does not wait on two third parties to be told they have one.

**It does not call `notify-reservation-guest`, and that is a deliberate reversal of the
plan.** That edge function is `verify_jwt = true` and reads the reservation through an
RLS-scoped *user* client — it is built for a host tapping a button in the dashboard, and
there is no user session anywhere in a public booking. Punching an anon hole through it
would have undone the "no anon access to `reservations`" rule the whole feature is built
on. The website path uses the same service-role Telnyx and Resend helpers that
`app/actions/notifications/reservation.ts` already uses. One provider, one template file,
two entry points.

- Guest SMS respects `sms_opt_in`; the guest email carries a **View or cancel** button
- Merchant alert to `reservation_settings.notify_emails`, deduplicated case-insensitively,
  carrying the *unmasked* phone and email — and deliberately **never** the guest's manage
  token, which is their credential, not a shared reference
- `confirmation_sent_at` is stamped only when something actually reached the guest, so it
  records delivery rather than intent
- Audit rows via the `log_audit_event` RPC with the service-role client. `LogAuditEvent`
  itself could not be used: it builds a Clerk-authenticated client and falls back to
  `auth()`, neither of which exists in a public route. Logged under
  `actionCategory: "website"` rather than the plan's `"reservations"`, matching every other
  action this sprint logs — a merchant filtering by website sees bookings beside the page
  edits that produced the booking page
- **Source badge** in `/dashboard/reservations`, on both the card and the detail sheet, from
  `lib/constants/reservation-source.ts`. Teal, chosen because it is in neither the status nor
  the VIP scale — a website booking beside a blue "Confirmed" pill would read as a second status

### Phase 6 — the guest manage page

`app/sites/[slug]/r/[token]` renders from `get_public_reservation_by_token`, themed with the
merchant's own colours and typefaces (resolved from their home page's decision, falling back
to the platform theme rather than 500-ing). `r` is now in `RESERVED_PATH_SEGMENTS`, with a
test pinning that `reservations` is deliberately **not**.

- Contact details stay masked, because they are masked in Postgres
- `noindex, nofollow` and a title that names nobody — a manage URL is a credential
- Cancel is a client island in the excluded `reservations/` directory, and honours
  `cancellation_cutoff_min`; past the cutoff it shows the venue's phone number rather than a
  disabled button, because a phone number tells a guest what they *can* do
- Already-cancelled is a terminal state with no controls at all, never an error
- The widget's success screen now shows the confirmation number, the four facts and the
  manage link — the one moment a guest is guaranteed to see it, since the email may be
  delayed or mistyped

### Phase 8 — the remaining editors

- **Blackout dates.** `lib/site-builder/reservations/blackouts.ts` (shapes + a validator that
  restates the `reservation_blackouts_window` CHECK in a merchant's words),
  `SaveBlackout`/`DeleteBlackout`, and an editor in `ReservationsScreen`. Whole-day is the
  default; past dates are folded away and dimmed rather than deleted, so a merchant can still
  check whether last year's closure was ever recorded
- **"Book a table" works in `native` mode.** It was gated on `brand.reservationUrl`, which
  native mode does not have — so switching to on-site booking *removed* the header button.
  It now links to the merchant's own booking page and carries a config attribute that the
  reservations runtime upgrades into a dialog. An **anchor**, not a button: without
  JavaScript, or before the island hydrates, the click still navigates and still works
- **Archiving a location cancels its future bookings** and tells each guest, with
  `cancelled_by = 'system'` — the exact case that column's third value exists for. Cancelled
  before the merchant is told the archive succeeded (so the count is true), notified after
  (so a mail provider cannot decide whether a branch may be archived). Never touches the
  past, and "now" is computed in the *location's* timezone

**Two things worth knowing before touching this code.** The booking dialog renders **in
place**, not portalled to `document.body`: every colour and radius in it is a `--site-*`
custom property set as an inline style on `SiteChrome`'s wrapper, and a portal would escape
the element they are declared on and render an unstyled white box on a branded site. And
`RESERVATIONS_PAGE_PATH` had to move into `lib/site-builder/reservations/paths.ts` — the
header needs it and the provisioner is a `"use server"` module, which cannot export a
constant.

---

## 7. One screen, one switch — and link mode is gone

A follow-up change on the merchant's side, driven by a plain observation: there
were **two on/off controls for reservations, on two different screens**, and
nothing on either said which was in charge. For a single-location merchant they
were the same switch twice.

### What changed

**The master switch moved to the top of `/dashboard/website/reservations`,**
directly above the per-branch switches it governs. It used to be a row in the
Features card in Website settings, two screens from the service times and closed
dates that decide whether a booking can actually happen. The hierarchy is now
visible instead of something you have to be told: site-wide on top, branches
underneath, and everything below the master switch is hidden while it is off.

**`link` mode was removed entirely.** Reservations is on or off; on always means
bookings happen on the merchant's own site. The mode had made "do we take
bookings?" a three-way question spread across two screens, and the per-location
switches meant nothing at all for a merchant who had chosen to link out.

### The one behaviour change to be aware of

**A site with `features.reservations = true` and a `reservationUrl` but no mode
now resolves to `off`, and loses its header button.** That is every row written
before native booking existed, and every merchant who had deliberately chosen to
link out to OpenTable or Resy.

It is deliberate, and it fails closed. Such a site has no booking page
provisioned, so the alternatives were a header button pointing at a 404, or a
restaurant silently switched onto a booking system it never configured and whose
grid would be empty. No button is the honest outcome; the merchant turns it back
on from one switch, which provisions the page properly. **If any live merchant
was using a provider link, they need telling** — there is no migration that can
fix this for them, because there is nothing to migrate them *to* until they set
service times.

### How it stayed cheap

**No migration, and no SQL change.** The storage is untouched:
`features.reservations` is still the boolean and `brand.reservationMode` is still
the mode. `SetReservationsEnabled` writes `native` on the way on and leaves it
alone on the way off, so the feature flag is the only field that moves.

**`resolveReservationMode` now matches the SQL gate character for character.**
Both `get_public_reservation_availability` and `create_public_reservation_hold`
require `features->>'reservations' = 'true' AND brand->>'reservationMode' =
'native'`, and so does the TypeScript. While `link` existed the two could
disagree — the page could answer "on" where the database answered no, which is
how a guest gets shown a grid of times the server then refuses to hold. There is
a test that runs both predicates over the same five rows and asserts they agree.

**`RESERVATION_MODES` is an enum of one, not a deleted type.** A stored `"link"`
therefore fails the enum, `resolveBrand` drops it, and the site resolves to off
— the safe direction, for free. Re-adding the mode later is one word.

**`brand.reservationUrl` is kept in the schema and read by nothing.** Deleting
the field would have been worse than useless: zod strips unknown keys, so the
next save of anything else on the brand would have quietly erased every stored
URL. Keeping it costs one line and preserves the merchant's typed value.

### Other pieces that moved with it

- **`SetReservationsEnabled` is one action that stores the decision *and*
  reconciles the page.** Those were separate calls the settings screen had to
  remember to make in the right order; forgetting the second leaves a live
  booking page for a restaurant that has switched bookings off. A caller cannot
  forget a step it does not make.
- **Turning bookings off asks first.** It unpublishes a live page and takes it
  out of the menu — the one control on the screen a merchant can regret. The
  confirmation says plainly that service times, closed dates and policy are kept,
  and that existing bookings are not cancelled.
- **JSON-LD now points at the merchant's own booking page**, and takes a single
  nullable `reservationUrl` instead of an `acceptsReservations` boolean plus a
  separate link. The old pair could hold a contradiction — a merchant who pasted
  a URL and later switched reservations off left a site claiming
  `acceptsReservations: true` from a search result. One nullable URL cannot.
- **`SETTINGS_CARD_FEATURES`** is what the Features card renders;
  `AVAILABLE_SITE_FEATURES` still contains `reservations`, because the capability
  is real — it is just switched on elsewhere. `FEATURES_WITH_OWN_SCREEN` names
  where, and a test asserts anything missing from the card has a home.

### One entry point in the header, not two

Found in local QA straight after the above: a merchant with bookings on saw
**both** a "Reservations" nav item and a "Book a table" button, pointing at the
same page. Both were ours — provisioning appended the nav item, and the Phase 8
header CTA was added on top of it. In link mode they never collided, because
there was no page and no nav item; native mode made them duplicates.

**The button wins and provisioning no longer touches nav.** "Book a table" is an
action, "Reservations" is a filing cabinet, and the nav has five inline slots
before the rest fall into a More menu — spending one on a duplicate of the
button beside it is the most expensive place to put it.

The breakpoints had to be reworked to make that honest. The anchor was
`sm:inline` while the whole navigation collapses into one menu below `lg`, so
between 640 and 1024px *both* were on screen, and below 640px **neither** was —
the anchor hidden, the nav item only reachable through a hamburger. Now the
anchor is `lg:inline` and the booking link is appended to the collapsed menu
below `lg`: one way to book at every width, never two, never none. A test pins
the handover, reading the anchor's own class list rather than the file's, since
the phone number beside it is legitimately `sm:inline`.

**Existing sites keep their stale nav item until reservations are toggled off
and on.** `RetireReservationsPage` still removes it and `EnsureReservationsPage`
never re-adds it, so the off/on cycle is the cleanup — or the merchant deletes it
once in the nav editor. `ProvisionResult.linked` and the "your menu is full"
warning are gone with it.

**Verified:** 938 passing across 56 files, `npm run build` clean.

---

## 8. Browser QA — what a real guest actually hit

Driven headless against the local dev server as the merchant *and* as an
anonymous visitor, per the `playwright-browser-qa-recipe`. Scripts and
screenshots are in the session scratchpad. Zero console errors on every surface.

### The one that mattered: the public API was behind Clerk

**Every one of the four `/api/site-reservations/*` endpoints redirected an
anonymous caller to `/sign-in` with a 307.** `proxy.ts` puts `/api(.*)` in
`isKnownAppRoute`, and `isPublicApiRoute` named only `/api/contact`, `/api/cms`
and `/api/internal` — so the entire public booking flow was unreachable by the
only people it exists for.

Nothing else could have caught this. The endpoints are correct in isolation, the
unit tests pass, the build is clean, and the flow works perfectly *while signed
in* — which is exactly how it gets tested by hand. The first end-to-end run
passed for that reason; it only failed once a script visited as a stranger.

**Two neighbours had the same hole**, found by checking every route that builds a
service-role client or rate-limits:

- `/api/site-forms/submit` — a published site's contact form. Every submission
  from a real visitor was bouncing to a login page.
- `/api/marketing/unsubscribe` — the link at the bottom of a marketing email.
  Broken twice over: it did not work, and one-click unsubscribe is a legal
  requirement.

All three are now in `isPublicApiRoute`, with a comment saying that a new public
endpoint must be added there and that the way to find out is to call it signed
out.

### The reservations page could show a booking form that could never book

The section resolves its branch as `section.locationId ?? page.locationId ??
ctx.site.locationId`, and the last of those is the **pricing** location. A
merchant with *"Never show prices before a branch is chosen"* switched on —
a pricing policy — resolved to no location at all, and the widget, unable to
query, rendered `No tables available for 2 on Fri, Aug 28`.

That is not a degraded answer, it is a false one: it tells a guest the
restaurant is fully booked when nothing was ever asked. The section now renders
the venue's phone number instead, and says so in the builder where the merchant
can act on it. **The real fix is the Phase 5 location picker**; until it ships, a
multi-location merchant whose brand page resolves no branch gets a phone number
rather than a lie.

### What passed, as a stranger

Anonymous, no session, 1440 / 800 / 390:

- Exactly **one** booking entry in the header at every width — the duplicate is
  gone, and 390px is no longer the width with none
- Real availability grid, hold placed with a live countdown
- Booking confirmed — `RES-LNEARC`, Sunday 30 August, 5:00 PM
- Manage page at `/r/{64-hex}` with contacts masked (`q•••••@example.com`,
  `•••• 0188`)
- Cancel offered, confirmed before acting, cancelled, and **still cancelled
  after a reload** — a terminal state, not an error
- The cutoff branch verified too: a booking made for later the same day showed
  the venue's phone number instead of a Cancel button

### Not confirmed

**The website booking did not appear on `/dashboard/reservations`** for its own
branch on its own date, with the location scope set correctly and the page
reloaded. That screen reads through the `get_reservations` RPC under the
merchant's own Clerk session, which is a different permission path from anything
this sprint touched — most likely this test account is not a member of that
location. Worth ten minutes with the RPC before trusting the source badge in
production; the badge itself is unit-tested and renders from `source === 'website'`.

**Verified after the QA fixes:** 1049 passing across 61 files, `npm run build`
clean.

---

## 8. What is left

**Phase 5 polish.** The widget books end to end, but is missing the location picker, the
two-month date picker, "other dates with availability", the large-party phone fallback,
`Alert Me`, the `.ics` download, the collapsed accordions for occasion and dietary tags, the
birthday field behind `collect_birthday`, the required policy checkbox, and the phone
country selector.

**"Change time" on the manage page.** Phase 6's last bullet — release, re-run availability,
re-book, reusing the Phase 5 widget. Cancel-and-rebook works today; changing a time in one
step does not.

**Phase 9.** Priority Alert (`reservation_alerts` exists and is empty), reservations SEO and
booking analytics.

**Browser QA.** Nothing in this pass has been driven in a real browser. Per the
`playwright-browser-qa-recipe` memory: book end to end at 1440 and 390, confirm the header
dialog opens and traps focus, cancel from the emailed link, and confirm the table frees.

### Open, unowned

- **OrderOut types.** Regenerating `database.types.ts` from dev gained 68 objects the
  committed file was missing — the *entire* website builder among them — and dropped
  `orderout_menu_sync_results` and `reconcile_stuck_push_channels_syncs`, which dev does not
  have because that migration was never applied. Four call sites in
  `app/dashboard/actions/orderout.ts` and `app/manage/actions/admin-merchant/orderout.ts`
  lose their types. Deliberately parked; applying that migration to dev and regenerating
  restores both.
- **Nothing is committed.** The branch also carries unrelated in-progress work (device
  preview, canvas, store) that is not from this sprint.
- **`NEXT_PUBLIC_APP_URL` gates one link.** The merchant alert email's "Open reservations"
  button is omitted when it is unset, deliberately: `resolveAppUrl()`'s header fallback would
  build the link against the *guest's* brand subdomain and hand every member of staff a dead
  URL.
