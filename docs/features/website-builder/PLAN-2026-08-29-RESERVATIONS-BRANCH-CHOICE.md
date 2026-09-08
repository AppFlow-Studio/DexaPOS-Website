# Plan — a guest must know which restaurant they are booking

**Date:** 2026-08-29 · **Branch:** `feat/website-owner-ui` · **Nothing committed.**
**Follows:** [PLAN-2026-08-29-RESERVATIONS-QA-FIXES.md](./PLAN-2026-08-29-RESERVATIONS-QA-FIXES.md) §#4,
which built the picker. This fixes the case that plan did not reach.

---

## 1. The defect, as observed

Site config as a merchant would normally leave it — `defaultLocationId = Joes Downtown`,
`forceLocationChoice = off` — with **two branches taking bookings**. Walked in the browser:

| Step | What the guest sees |
|---|---|
| Clicks **Book a table** | Lands on `/reservations` |
| Grid | **No picker.** Resolved to Joes Downtown. Nothing on the page names the branch |
| Picks 5:00 PM | Checkout. Sticky bar: `Sat, Aug 29 · 5:00 PM · 2 guests` — **no branch** |
| Books | Success screen says **"Joes Coffee Shop"** — the brand, not the branch |

**A guest who lives beside Uptown is silently booked into Downtown and never told.**

The only surface that gets it right is the confirmation message: `notify.ts` builds
`brand.businessName` from `location.name`, so the SMS and email do name the branch. That
arrives *after* they commit — and today it does not send at all.

### Root cause

`ctx.site.locationId` is the **pricing** location. `buildPublicRenderContext` computes it as
`resolvePricingLocation({ pageLocationId, brand, availableLocationIds })`, which collapses two
different questions into one field:

- *"this page is about branch X"* — a legitimate booking signal
- *"the brand's default branch for showing prices"* — **not** a booking signal

The booking surfaces read the collapsed value, so a merchant answering a question about
**prices** silently answered a question about **which restaurant the guest eats at**.

---

## 2. Decisions taken

1. **A pinned section and a branch page both pin.** Each is a deliberate merchant act. The
   brand-wide pricing default stops acting as a booking selector.
2. **The guest's choice is remembered for the browser session only.** Picked once, reused while
   they browse; gone when they close the browser, so it can never silently route a later visit.
3. **The branch is named above the time grid, in the checkout sticky bar, and on the success
   screen.**
4. **Scope is branch choice and naming.** The reservations inbox and the remaining Phase 5 items
   are out.

**Deliberately excluded:** naming the branch in the header booking dialog. It is the surface with
the *least* context — it opens over whatever page the guest was reading — so this is worth
revisiting, but it is not in this plan.

---

## Status — built and verified, 2026-08-29

All of §3 is implemented and all of §4 passed. **1026 tests across 61 files** (up from 1010);
`tsc --noEmit` clean in every file touched. Nothing committed.

### What the browser showed, as a fresh anonymous visitor

Site left in its normal config — `defaultLocationId = Joes Downtown`, `forceLocationChoice`
**off** — with two branches bookable. This is the exact setup that used to route silently.

```
locationId  : null                                  <- pricing default no longer pins
locations   : [ Joes Downtown Brooklyn Updated, Uptown Branch ]
multiBranch : true

first paint : 2 branch buttons, each with its address; 0 time slots
choose Uptown Branch
  grid      : "Uptown Branch" named, with a "Change" affordance
  memory    : sessionStorage = 8835e749…  (Uptown)
  checkout  : "Uptown Branch · Sat, Aug 29 · 2:15 PM · 2 guests"
reload, same session   -> not asked again, goes straight to Uptown
brand-new context      -> asked again
0 console errors
```

The checkout bar is the line worth reading twice. It used to be
`Sat, Aug 29 · 5:00 PM · 2 guests` — the last screen before committing, naming everything
except the restaurant.

### The test that inverted

`reservations-section-branch.test.tsx` asserted that a brand page with a pricing default
resolved to that branch. It now asserts the opposite, under the name
**"does NOT let the pricing default pin a booking"**, with the reasoning in the test body so the
inversion reads as a decision rather than a broken expectation.

### One deviation

§3.5 planned to keep a back-link. The bare `‹ Branch name` became a **named branch with a
separate "Change" button**, and `Change` renders only when there is somewhere to change to — a
guest on a page built about one restaurant is not offered a way out of it. Naming and navigating
are two jobs, and the old control did both badly.

---

## 3. The design

### 3.1 Carry the page's own location, separately

`decision.locationId` **is** the page's own `site_pages.location_id`
([resolve-render-mode.ts:186](../../../lib/site-builder/resolve-render-mode.ts#L186)).
`buildPublicRenderContext` already receives it, feeds it to the pricing resolver, and then
throws it away. Nothing needs to be fetched.

- [x] Add `pageLocationId: string | null` to `RenderSite`, defaulted `null` in
      `createRenderContext` so the ~400 existing fixtures are untouched.
- [x] Set it from `decision.locationId` in `buildPublicRenderContext`.
- [x] Document on the field that it is **the page's own branch**, and that `locationId` remains
      the pricing scope — the two must never be conflated again.

### 3.2 Feed booking the pin, not the pricing default

`resolveBookingTarget` already returns `resolved: null` when nothing valid is pinned and more
than one branch is bookable. **The rule does not change — only its input does.**

- [x] `ReservationsSection`: preferred becomes
      `section.props.locationId ?? ctx.site.pageLocationId ?? null`
      (was `?? ctx.site.locationId`, the pricing value).
- [x] `HeaderSection`: same substitution, so the dialog agrees with the page.
- [x] A pin naming a branch that is not bookable is still ignored, as now.

That is the whole of the routing fix. It is small because §#4 put the rule in one place.

### 3.3 Tell the widget the merchant is multi-branch

**The subtlety that makes naming correct.** The section serialises
`locations: offered`, and `offered` is `[resolved]` once a branch is settled. So a widget on a
*pinned* page sees a one-entry list and cannot tell a single-restaurant merchant from a
multi-branch one — which is exactly the case where naming matters most.

- [x] Serialise `multiBranch: bookable.length > 1` alongside `locations`.
- [x] The widget names the branch when `multiBranch` is true, whether it was pinned, remembered
      or chosen. A genuine single-restaurant site stays uncluttered.

### 3.4 Remember the choice, on the client only

- [x] Key: `dexa-reservation-branch:{siteId}`, in **`sessionStorage`**.
- [x] Read on mount, and only when nothing is pinned and more than one branch is bookable.
- [x] **A remembered branch that is no longer in the offered list is discarded**, falling back to
      the picker. Otherwise a branch that stopped taking bookings would silently route again —
      the bug this plan exists to remove, reintroduced through the back door.
- [x] Written when the guest picks, cleared never (the session ending is the clearing).
- [x] Wrapped in `try/catch`: private modes and blocked site data throw on access, and a booking
      widget must not die because storage is unavailable.

**Why the client and not the server.** The server render must stay identical for every visitor —
a per-guest branch baked into HTML would poison any shared cache and leak one guest's choice to
the next. So when there is a real choice, the section always sends `locationId: null` plus **all**
bookable branches, and the widget resolves from `sessionStorage` after mount.

### 3.5 Name the branch

- [x] **Above the grid** — branch name, and its address when there is one. Doubles as the
      affordance for changing branch, replacing today's bare `‹` back-link.
- [x] **Checkout sticky bar** — prepend the branch:
      `Joes Downtown · Sat, Aug 29 · 5:00 PM · 2 guests`. This is the last screen before they
      commit, and today it names everything except the restaurant.
- [x] **Success screen** — use the branch name where it currently uses `ctx.site.name`. This
      makes the screen agree with the confirmation message, which already says the branch.
      `venueName` becomes a fallback for when no branch is resolved.

---

## 4. Tests

- [x] `resolve-branch.test.ts` — new. The rule in isolation: pinned-and-bookable wins;
      pinned-but-not-bookable falls through; exactly one auto-resolves; two-or-more with no pin
      asks; none is `missing`.
- [x] `reservations-section-branch.test.tsx` — extend. **The regression that matters:** a brand
      page with a pricing default and two bookable branches must now serialise
      `locationId: null` and both branches. There is an existing case asserting the old
      behaviour — it inverts, deliberately, and the comment must say so.
- [x] A page-pinned case and a section-pinned case each resolve without a picker.
- [x] `multiBranch` is true for a pinned page on a two-branch merchant — the case §3.3 exists for.
- [x] Browser: two branches, no pin → picker → choose → branch named on grid, in the sticky bar
      and on the success screen. Reopen the header dialog → not asked again (session memory).
      New browser context → asked again.

---

## 5. Risks

| Risk | Handling |
|---|---|
| **Behaviour change for live multi-branch sites** — they start seeing a picker where they did not | Intended, and the point of the plan. Worth telling merchants, since their guests will notice |
| A merchant reads the picker as a regression on a page they meant for one branch | §3.2 honours both pin kinds, so the fix is to set the page's location — which they likely already did |
| `sessionStorage` unavailable | Wrapped; falls back to asking, which is always safe |
| `forceLocationChoice` becomes irrelevant to booking | Correct — it returns to meaning only what it says, a **pricing** rule |

**No migration. No schema change. No new endpoint.** `get_public_reservation_config` already
returns every bookable branch.

---

## 6. What this does not fix

- The **header dialog** still will not name the branch (§2, excluded by decision).
- The **merchant** still learns of a booking only by looking — the inbox is a separate plan.
- Confirmation **delivery** is still blocked on a valid `RESEND_API_KEY`; SMS works.
