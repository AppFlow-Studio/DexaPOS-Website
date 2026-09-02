# Handoff — reservations: browser QA, and the UX rework that preceded it

**Date:** 2026-08-29 · **Branch:** `feat/website-owner-ui` · **Nothing is committed.**
**Verified at close:** 1049 tests passing across 61 files (site-builder + reservations +
website actions); `npm run build` compiles clean.

**Read first:** [HANDOFF-2026-08-28-RESERVATIONS-SPRINT.md](./HANDOFF-2026-08-28-RESERVATIONS-SPRINT.md)
is the record of the feature itself. This document covers what happened *after* it: three
rounds of change, and then the first time any of it was driven in a real browser.

---

## 0. The one thing to take away

**The public booking API was behind Clerk authentication, and every other form of
verification said it was fine.** Unit tests passed. `tsc` passed. `npm run build` passed. A
full end-to-end booking passed — because the script was signed in, which is also how a human
would test it by hand.

It failed the moment a script visited the site as a stranger, which is the only state a real
guest is ever in.

> A public endpoint must be exercised **signed out**. `curl -X POST` is enough: a `307` means
> the middleware ate it, a `4xx` means it reached the handler.

Two neighbouring features had the identical hole and had presumably had it for weeks.

---

# Part 1 — The browser QA

Run headless against the local dev server with the harness in
[`playwright-browser-qa-recipe`](#5-how-to-re-run-this): system Chrome via `channel: "chrome"`,
`domcontentloaded` plus explicit waits. Driven both as the merchant (Clerk session) and as an
anonymous visitor. **Zero console errors on every surface, in every run.**

## 1.1 · 🔴 CRITICAL — the public API was unreachable by the public

All four `/api/site-reservations/*` endpoints returned **307 → `/sign-in`** to an anonymous
caller.

`proxy.ts` puts `/api(.*)` in `isKnownAppRoute`, so every API route is gated unless it is
named in `isPublicApiRoute` — which listed only `/api/contact`, `/api/cms` and
`/api/internal`. The four reservation endpoints authenticate by rate limit, honeypot and a
service-role `SECURITY DEFINER` call. None of them wants a Clerk session. A restaurant guest
does not have one.

Evidence, signed out:

```
/api/site-forms/submit      -> 307
/api/site-reservations/hold -> 307
/api/marketing/unsubscribe  -> 307
/api/contact                -> 400     <- reaches its handler, so the matcher is the difference
```

**Two other public endpoints had the same bug**, found by checking every route that builds a
service-role client or rate-limits:

| Endpoint | Who calls it | Consequence |
|---|---|---|
| `/api/site-forms/submit` | Visitors on a published site's contact form | Every submission bounced to a login page |
| `/api/marketing/unsubscribe` | Recipients of a marketing email | Broken, and one-click unsubscribe is a legal requirement |

**Fixed** in [`proxy.ts`](../../../proxy.ts): all three added to `isPublicApiRoute`, with a
comment recording that a new public endpoint must be added there and that the way to find out
is to call it signed out. Re-verified: `400`, `200`, `405` respectively — all reaching their
handlers.

## 1.2 · 🟠 The booking page could show a form that could never book

The reservations section resolves its branch as
`section.locationId ?? page.locationId ?? ctx.site.locationId`. That last one is the
**pricing** location, and it is `null` whenever `brand.forceLocationChoice` is on — the
merchant-facing setting *"Never show prices before a branch is chosen"*.

So a pricing policy silently disabled bookings. With no location the widget cannot query, and
it rendered:

> No tables available for 2 on Fri, Aug 28.

That is not a degraded answer, it is a **false** one. It tells a guest the restaurant is
fully booked when nothing was ever asked.

**Fixed** in [`ReservationsSection.tsx`](../../../components/site-builder/sections/ReservationsSection.tsx):
with no resolvable branch the section renders the venue's phone number instead of a mount
point, and in the builder it tells the merchant why and how to fix it. Verified live:

> To book a table, please call us on (192) 391-0320.

**The real fix is the Phase 5 location picker, which is still unbuilt.** Until it ships, a
multi-location merchant whose brand page resolves no branch gets a phone number, not a booking
form. That is honest, but it is not the feature.

## 1.3 · 🔴 Confirmation messages have never been delivered

The dev-server log proves the notification path **runs** on every booking and cancellation,
catches its own failures, and never breaks the booking — the "store first, notify second"
design working exactly as intended:

```
[site-reservations] confirmation partly failed: "RES-C5MLQQ"
  "SMS: 400 {"errors":[{"code":"10002","title":"Invalid phone number", ...}]};
   Email: API key is invalid"
```

But **both providers rejected every attempt**:

- **Resend: `API key is invalid`.** The `RESEND_API_KEY` in the local `.env` is not valid.
  No guest has ever received a confirmation email. `confirmation_sent_at` was therefore never
  stamped, which is correct behaviour — it records delivery, not intent.
- **Telnyx: `Invalid destination number`.** My own fault: the QA booked with `5555550123`,
  which is a well-formed but non-routable test number. Not a code defect.

**The merchant alert has never executed at all.** The log shows exactly one `[sendEmail]` per
booking — the guest's. `reservation_settings.notify_emails` is empty for the test location, so
that branch was skipped entirely. Templates and wiring are unit-tested; the path is unproven.

**Nothing here is a code bug that has been identified.** It is an untested surface, and the
first thing to fix is the environment.

## 1.4 · ✅ What passed, as an anonymous stranger

Viewports 1440 / 800 / 390, no session:

| Check | Result |
|---|---|
| Booking entries in the header | **Exactly one** at every width — `Book a table` |
| Availability grid | Real times rendered from the API |
| Hold | Placed, with a live countdown in the sticky bar |
| Booking | Confirmed — `RES-LNEARC`, Sunday 30 August, 5:00 PM |
| Manage page | `/sites/joes-coffee-shop/r/{64-hex}` renders |
| Contact masking | `q•••••@example.com` and `•••• 0188` — masked in Postgres |
| Cancel | Offered, confirmed before acting, cancelled |
| Cancel persistence | **Still cancelled after a reload** — terminal state, not an error |
| Cutoff branch | A same-day booking correctly offered the venue phone instead of Cancel |
| Console errors | 0 |

The header count is worth dwelling on. Before this session's fix it was **two** entries at
1440 and 800, and **none** at 390 — the anchor was `sm:inline` while the nav collapses below
`lg`, so the phone width had the anchor hidden and the nav item buried. Now:

| Width | Booking entry |
|---|---|
| < 640px | inside the collapsed menu |
| 640–1024px | inside the collapsed menu |
| ≥ 1024px | the `Book a table` anchor |

## 1.5 · Merchant-side checks

| Check | Result |
|---|---|
| Master switch on `/dashboard/website/reservations` | ✅ present, above the branch list |
| Features card in Website settings | ✅ shows only `Customer reviews` + a pointer line |
| Turning bookings on | ✅ provisions and publishes the page; screen confirms it is live |
| Turning bookings off | ✅ asks first; removes the page and its nav link |
| Off state | ✅ nothing on the public site points at reservations |

## 1.6 · ⚠️ Could not be confirmed

**Website bookings did not appear on `/dashboard/reservations`.** With the location scope set
to the correct branch (`Joes Downtown Brooklyn Updated`), on the correct date, after a reload:
Active `0`, History `0`.

That screen reads through the **`get_reservations` RPC under the merchant's own Clerk
session** — a different permission path from anything this work touched. The most likely
explanation is that this test account is not a member of that location. It has **not** been
proven either way.

**This is the highest-value next investigation.** If it is a real defect rather than a test
account quirk, merchants never see the bookings they are taking, which would make the feature
worse than not having it.

## 1.7 · Bugs the QA scripts themselves hit, worth knowing

- Clerk's sign-in renders **email and password on one form**, and `Continue with Google`
  precedes the real submit in the DOM. Any `has-text("Continue")` selector clicks OAuth and
  leaves for `accounts.google.com`. Press **Enter in the password field** instead.
- The dashboard location scope is persisted to an `x-location-id` cookie the server reads, so
  changing it needs a **page reload** to re-scope the day view.
- Selecting the default location by its label breaks on the second run, because the label is
  no longer "No default". Target it positionally (it is the last `combobox` on the settings
  screen).

---

# Part 2 — What was built before the QA

Three rounds, in order.

## 2.1 · Round A — finishing phases 6, 7 and 8

Recorded in full in §6 of the
[sprint handoff](./HANDOFF-2026-08-28-RESERVATIONS-SPRINT.md). In brief:

- **Phase 7 — notifications.** `lib/site-builder/reservations/notify.ts`, called from the
  book and cancel routes through **`after()`** so the response is on the wire before any
  provider is touched. Deliberately does **not** use the `notify-reservation-guest` edge
  function: it is `verify_jwt = true` and reads through an RLS-scoped *user* client, and there
  is no user session in a public booking. Audit rows go through the `log_audit_event` RPC with
  a service-role client, because `LogAuditEvent` builds a Clerk client and falls back to
  `auth()`.
- **Phase 6 — the guest manage page.** `app/sites/[slug]/r/[token]`, themed from the
  merchant's own palette, `noindex`, contacts masked in Postgres, cancel honouring
  `cancellation_cutoff_min`. `r` added to `RESERVED_PATH_SEGMENTS`.
- **Phase 8 — the remaining editors.** Blackout dates, the native-mode header button, and
  archiving a location cancelling its future bookings with `cancelled_by = 'system'`.

## 2.2 · Round B — one screen, one switch; link mode removed

**The problem:** two on/off controls for reservations on two different screens, with nothing
saying which was in charge. For a single-location merchant they were the same switch twice.

**The change:** the master switch moved to the top of `/dashboard/website/reservations`,
directly above the branch switches it governs. `link` mode — sending guests out to OpenTable
or Resy — was removed entirely, so reservations is now on or off and on always means native.

**It cost no migration and no SQL change.** Storage is untouched: `features.reservations` is
still the boolean and `brand.reservationMode` still the mode.

Three things worth knowing:

- **`resolveReservationMode` now matches the SQL gate character for character.** Both
  `get_public_reservation_availability` and `create_public_reservation_hold` require
  `features->>'reservations' = 'true' AND brand->>'reservationMode' = 'native'`, and so does
  the TypeScript. While `link` existed the two could disagree — the page could answer "on"
  where the database answered no, which is how a guest gets shown times the server refuses to
  hold. A test runs both predicates over the same rows.
- **`RESERVATION_MODES` is an enum of one, not a deleted type.** A stored `"link"` fails the
  enum, `resolveBrand` drops it, the site resolves to `off`. Restoring the mode is one word.
- **`brand.reservationUrl` stays in the schema, read by nothing.** Deleting it would erase
  every stored URL on the next brand save, because zod strips unknown keys.

🔴 **Behaviour change:** a site with `features.reservations = true`, a `reservationUrl` and no
mode now resolves to `off` and loses its header button. That is every pre-native row and every
merchant who chose to link out. It fails closed on purpose — the alternative was a button
pointing at an unprovisioned 404, or a restaurant silently switched onto a booking system it
never configured. **There is no migration that fixes this for them**; they re-enable from one
switch, which provisions the page properly.

## 2.3 · Round C — the duplicate header entry

**Reported from local use:** two nav entries, `Reservations` and `Book a table`, both pointing
at `/reservations`.

Both were ours. The first diagnosis — that the provisioner appended the nav item — was
**wrong**. Removing that append changed nothing, because the real source is
**`PublishPage`**: `syncNavForPage` appends a nav item for *every* non-home page it publishes,
and `EnsureReservationsPage` publishes the reservations page.

Fixed in three places so the rule holds however a site is built:

1. [`publish.ts`](../../../app/dashboard/website/actions/publish.ts) — skips the nav *append*
   for the reservations path. Unpublishing still **removes** it, which is what cleans up sites
   provisioned by the older code.
2. [`nav.ts`](../../../lib/site-builder/nav.ts) — `deriveNavFromPages` excludes it, so a
   backfilled site and an incrementally-built one agree.
3. [`reservations-page.ts`](../../../app/dashboard/website/actions/reservations-page.ts) —
   stopped appending, and `ProvisionResult.linked` plus the "your menu is full" warning were
   removed with it.

> **A bug this introduced, caught by a user question.** Deleting the nav block removed the
> line declaring `linked`, but the `return` statement two hundred lines below still referenced
> it — a `ReferenceError` at runtime on turning bookings on. It survived `npm run build`
> (this repo sets `ignoreBuildErrors: true`) and 938 passing tests, because no test executes
> that function. Only `tsc --noEmit` caught it.

---

# Part 3 — Open bugs and gaps

Ordered by what would hurt most.

### Blocking

| # | Issue | Notes |
|---|---|---|
| 1 | **Website bookings not visible on `/dashboard/reservations`** | §1.6. Unproven whether defect or test-account permissions. Start at the `get_reservations` RPC. |
| 2 | **No confirmation has ever been delivered** | §1.3. Local `RESEND_API_KEY` is invalid; the QA used a non-routable phone. Needs a valid key and a real number to prove. |
| 3 | **Merchant alert never executed** | `notify_emails` empty for the test location. Populate it and re-book. |

### Functional gaps — known, unbuilt

| # | Issue | Notes |
|---|---|---|
| 4 | **No location picker (Phase 5)** | A brand page that resolves no branch shows a phone number instead of a booking form. |
| 5 | **No cancellation-policy checkbox at checkout** | `booking_policy` is stored and shown on the manage page, but the guest never agrees to it. The plan specified it required-and-unchecked. Arguably compliance, not polish. |
| 6 | **Rest of Phase 5** | `.ics`, two-month date picker, "other dates with availability", large-party phone fallback, `Alert Me`, occasion/dietary tag accordions, birthday field. |
| 7 | **"Change time" on the manage page** | Cancel-and-rebook works; one-step change does not. |
| 8 | **Phase 9** | Priority Alert (`reservation_alerts` exists and is empty), reservations SEO, booking analytics. |

### Built but never exercised in a browser

| # | Surface |
|---|---|
| 9 | The header **booking dialog** — link presence and counts were verified at three widths; it was never clicked. Whether it opens, traps focus and books is unproven. |
| 10 | **Blackout-dates editor** — unit-tested only. |
| 11 | **Archiving a location** cancelling future bookings and notifying those guests. |
| 12 | Concurrency — covered by `phase3-smoke-test.sql` in SQL, never through two browsers. |

### Housekeeping

| # | Item |
|---|---|
| 13 | **Nothing is committed.** The branch also carries unrelated in-progress work (device preview, canvas, store) that is not from this effort. |
| 14 | Any site provisioned before Round C still carries a stale `Reservations` nav item until bookings are toggled off and on. |
| 15 | **No typecheck in CI.** `ignoreBuildErrors: true` is why the `linked` ReferenceError survived a clean build and a full green suite. Adding `tsc --noEmit` would have caught it in seconds. |
| 16 | `database.types.ts` drift — pre-existing and unowned, see the sprint handoff. |

---

# Part 4 — Files changed by this work

Separated from the pre-existing branch work (device preview, canvas, store, hero/popular-items
sections) which is **not** from this effort.

### New

```
app/sites/[slug]/r/[token]/page.tsx                       guest manage page
components/site-builder/reservations/ReservationManageActions.tsx
lib/site-builder/reservations/notify.ts                   guest + merchant notifications
lib/site-builder/reservations/manage.ts                   token -> reservation loader
lib/site-builder/reservations/paths.ts                    shared page/segment constants
lib/site-builder/reservations/blackouts.ts                shapes + validator
lib/site-builder/reservations/location-closure.ts         archive -> cancel + notify
lib/constants/reservation-source.ts                       the Website badge
lib/site-builder/reservations/__tests__/confirmation-templates.test.ts
lib/site-builder/reservations/__tests__/blackouts.test.ts
```

### Modified

```
proxy.ts                                                  public API matcher  (§1.1)
components/site-builder/sections/ReservationsSection.tsx   phone fallback      (§1.2)
components/site-builder/sections/HeaderSection.tsx         one entry, lg/collapsed split
components/site-builder/dashboard/ReservationsScreen.tsx   master switch + blackouts editor
components/site-builder/dashboard/SettingsScreen.tsx       reservations card removed
components/site-builder/reservations/ReservationWidget.tsx success view + venueName
components/site-builder/reservations/ReservationRuntime.tsx booking dialog + trigger
app/dashboard/website/actions/reservations-page.ts         SetReservationsEnabled; no nav append
app/dashboard/website/actions/reservations-settings.ts     blackout read/write
app/dashboard/website/actions/publish.ts                   skip nav append for reservations
app/dashboard/website/reservations/page.tsx                siteId + initialEnabled
app/dashboard/actions/locations.ts                         ArchiveLocation -> closure
app/api/site-reservations/book/route.ts                    after() notify
app/api/site-reservations/cancel/route.ts                  after() notify
app/dashboard/reservations/components/ReservationCard.tsx  Website badge
app/dashboard/reservations/components/ReservationDetailSheet.tsx
app/sites/[slug]/built-site.tsx                            json-ld reservationUrl
lib/site-builder/site-settings.ts                          mode collapse + feature split
lib/site-builder/nav.ts                                    derive excludes reservations
lib/site-builder/reserved-paths.ts                         "r"
lib/site-builder/json-ld.ts                                reservationUrl replaces the boolean
lib/site-builder/reservations/service-periods.ts           blackouts on the config
lib/messaging/reservation-templates.ts                     manage link + merchant templates
```

Tests updated: `site-settings.test.ts`, `reserved-paths.test.ts`, `reservations-page.test.ts`.

---

# Part 5 — How to re-run this

No playwright dependency in the repo. Use the globally installed `@playwright/mcp` copy, and
**`channel: "chrome"`** — the bundled chromium build is not installed and a bare launch fails.

```js
const PW = "C:/Users/HP i5/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright";
const { chromium } = require(PW);
const browser = await chromium.launch({ headless: true, channel: "chrome" });
```

Sign in (see the `test-login-credentials` memory for the dev accounts — do **not** put them in
the repo):

```js
await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
await page.locator('input[type="email"]').first().fill(process.env.QA_EMAIL);
const pw = page.locator('input[type="password"]').first();
await pw.fill(process.env.QA_PASSWORD);
await pw.press("Enter");            // NOT a Continue button — that is Google OAuth
```

The single most valuable check, and the one that found §1.1 — **run it signed out**:

```bash
for r in site-forms/submit site-reservations/hold marketing/unsubscribe contact; do
  curl -s -o /dev/null -w "  /api/$r -> %{http_code}\n" \
    -X POST "http://localhost:3000/api/$r" -H "content-type: application/json" -d '{}'
done
# 307 = eaten by middleware.  4xx = reaching the handler.
```

---

# Part 6 — Dev-environment state left behind

Changed on the **Joes Coffee Shop** test merchant to unblock the QA. Revert if they matter:

1. **Default location** set (Website settings → Prices and locations).
2. **"Never show prices before a branch is chosen"** turned **off**. Turning it back on
   returns the booking page to the phone-number fallback until the Phase 5 picker ships.
3. Reservations switched **on** site-wide, and on one branch, which provisioned and published
   the Reservations page.
4. Two test bookings exist: `RES-C5MLQQ` (28 Aug 17:00, still confirmed) and `RES-LNEARC`
   (30 Aug 17:00, cancelled by the guest during the QA).
