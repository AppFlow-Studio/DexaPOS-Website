# Plan — Group booking slots by service period

**Date:** 2026-08-30
**Branch:** `feat/website-owner-ui`
**Status:** built and unit-tested; browser QA outstanding

Two work streams, both shipped together because they touch the same render path:
grouping the grid by service, and replacing the dead third search segment with a
real time filter.

## Why

The booking grid renders every free time as one flat run of chips. On a busy day
that is thirty-odd near-identical buttons with nothing to navigate by, which is
the single weakest thing on the SevenRooms booking page we looked at today —
they show 33 slots from 12:45 PM to 9:30 PM with no grouping at all, and no
marker where lunch service stops and dinner starts.

We can do better than they can, and cheaply, because **we already have the
merchant's own names for their services.** SevenRooms would have to infer
"Lunch" from a clock threshold. `reservation_service_periods` is a merchant
naming their own services — `DEFAULT_SERVICE_PERIOD` is "Dinner",
`BLANK_SERVICE_PERIOD` is "Lunch" — and `get_public_reservation_availability`
already returns `service_period_id` and `service_name` on every row.
`AvailabilitySlot` already carries both fields across the wire.

So the data has been there since the section shipped. Today it is rendered in
the least useful place available: as a tiny second line **inside every chip**,
so a merchant with one service gets the word "DINNER" stamped twenty times down
the grid, and a merchant with two gets the boundary marked only by that caption
quietly changing partway through.

This moves that label from the chips to a heading over each run.

**No migration, no RPC change, no wire-protocol change.** Rendering only, plus
one pure helper.

## Scope

In:

- A pure grouping helper in `lib/`, with unit tests.
- The widget rendering one labelled group per service period.
- Dropping the now-redundant per-chip service caption.

Out — real gaps, but not this ticket:

- **The "other dates with availability" rail.** Worth flagging loudly:
  `showOtherDates` is in the section schema and its doc comment promises "offer
  the next few dates when the chosen one is full", but the widget only uses it
  to append the sentence `" Try another date."` to the empty state. The feature
  is a prop and a sentence, not a rail. Separate ticket.
- A waitlist / "Alert Me" for a date with no availability.
- Any change to how availability is computed.

## Design

### Group by period id, not by clock time

Bucketing by hour ranges would be guessing at something the merchant has already
told us. Group on `servicePeriodId`.

### Preserve arrival order

`get_public_reservation_availability` ends `ORDER BY 1` — slot time, across all
periods. So slots arrive chronologically and first-appearance order of a period
is the same as ordering periods by their earliest slot. Keep insertion order and
we get the right group order for free, with no second sort.

### Overlapping periods must not merge

Two active periods can cover the same clock time — a "Bar" service running
alongside "Dinner". The same `HH:MM` then appears twice from different ids, and
`ORDER BY slot_time` interleaves them. Grouping by id keeps them in their own
runs; grouping by time would collapse two genuinely different bookable things
into one chip. The existing React key is already `servicePeriodId-time`, so it
survives this unchanged.

### Merge consecutive same-name groups

A merchant can define two periods both named "Dinner" (weekday and weekend rows
are the normal reason). On a single date usually only one matches, but nothing
prevents both — and two identical "Dinner" headings reads as a bug. Merge
adjacent groups whose names are equal.

### One group renders exactly as today

If grouping yields a single group — the common case, since
`DEFAULT_SERVICE_PERIOD` gives every merchant exactly one service — render the
flat grid with **no heading**. A lone "DINNER" bar under a section heading that
already says "Book a table" is noise, and the whole point is to add navigation
only where there is something to navigate.

Same when `serviceName` is blank on every slot.

This keeps the change invisible for most merchants and visible precisely where
it helps.

### Accessibility

The grid sits inside an `aria-live="polite"` region so the repopulate is
announced. Each group's `<ul>` gets `aria-label={name}` — no generated ids, and
the live region keeps working. Headings are styled with the widget's existing
label idiom (`text-[0.7rem] uppercase tracking-wide opacity-60`, as `Segment`
uses) and site theme tokens, never hard-coded colour.

## Work stream 2 — the time filter

The third segment of the search pill rendered `prettyDate(date)` as static text:
the same day the date input beside it already showed. Two thirds of the pill
said "Aug 30" and only one of them did anything. `TEARDOWN.md` §"Time" records
that SevenRooms' third segment is a *filter* — the control was specified and
never built, and a date echo landed in its place.

Replaced with a real filter, decided as follows:

- **Options are the hours that actually have a table**, derived from the loaded
  slots. SevenRooms offers every half hour from 6:00 AM at a venue whose first
  seating is 12:45 PM, so most of their menu leads nowhere. Ours cannot: a
  lunch-only day offers lunch-only hours with nobody configuring it.
- **A window, not "this hour onward".** Picking 7 PM means "around seven".
  Answering with 7:00-to-closing is a truncation — it hides the 6:45 table that
  suited them and keeps the 9:30 one they will never take. ±60 minutes over a
  15-minute grid is about nine times, which reads at a glance.
- **Client-side.** Availability is already re-queried on every picker change, so
  narrowing a list we hold costs no round trip and cannot disagree with what the
  server last said was free.
- **Hidden when there is one hour or fewer** — a filter that cannot change the
  answer is a control that should not be there.

### Two things that changed during the build

**There is no "narrowed to nothing" state, by construction.** The plan had one,
with a "Show all times" escape. Writing its test proved it unreachable: every
hour offered is an hour that HAS a table, so the ±60 window always contains at
least the slot that put that hour in the list. It was removed rather than left
as unreachable code claiming to handle a case that cannot arise. The test that
replaced it walks every offered option and asserts the grid never empties.

**A stale filter resolves during render, not in an effect.** First cut reset the
selection from a `useEffect` on the loaded slots. That lets one render pass
through with an empty grid underneath a picker still naming 7 PM, and only then
corrects it. Deriving `effectiveFilter` in render — and feeding it back into the
`<select>` — means the control and the grid can never disagree, and the guest
sees the choice return to "All Times" rather than losing it silently.

### Deviation from a documented decision

`TEARDOWN.md` records the per-chip service caption as a deliberate copy of
SevenRooms' CUT venue: *"that is how one grid covers Lunch + Dinner without a
separate selector"*. This removes it. The caption solves the same problem a
heading solves, but pays for it on every chip — and with grouping in place the
information is in one place per service instead of repeated down the column.
Noted because it overrides a prior deliberate choice rather than fixing an
oversight.

## Work items

- [x] **1.** `lib/site-builder/reservations/slot-view.ts` — pure, no React import.
      Named `slot-view` rather than `slot-groups` because it ended up holding both
      list operations: `groupSlotsByService`, `availableHours`,
      `filterSlotsNearHour`, `prettyHour`.
- [x] **2.** `lib/site-builder/reservations/__tests__/slot-view.test.ts` — **19 tests**:
  - [x] empty in → empty out
  - [x] one period → one group, name carried
  - [x] two periods → two groups, chronological, correct names
  - [x] overlapping periods at the same `HH:MM` → both slots kept, separate groups
  - [x] two periods sharing a name → merged into one group
  - [x] blank / whitespace `serviceName` → unnamed, and unnamed periods never merge
  - [x] slot order preserved inside each group
  - [x] hours de-duplicated, sorted, and only where a table exists
  - [x] window includes its edges and looks earlier as well as later
- [x] **3.** `ReservationWidget.tsx` — grouped render, heading per group when
      `groups.length > 1`, per-chip `serviceName` caption deleted.
- [x] **4.** Time filter in place of the dead "When" segment.
- [x] **5.** `components/site-builder/reservations/__tests__/slot-grid.test.tsx` —
      **9 tests**, happy-dom + `createRoot`/`act` (no RTL in this repo). Covers
      headings on/off, the caption being gone, hour options, narrowing, a service
      being filtered away entirely, and the stale-filter fallback.
      Gotcha for the next person: assigning `input.value` directly is invisible to
      React's value tracker — drive it through the native setter.
- [x] **6.** Full suite: **1640 passing, 9 failing**, and the 9 are exactly the known
      pre-existing set (8 `tests/a11y/storefront`, 1 `lib/menu/cascade-labels`, plus
      the KDS and orders file-level import errors). Nothing from reservations.
      `tsc` clean on all three touched files.
- [ ] **7.** Browser QA on staging. **Needs setup:** staging locations carry only the
      default single "Dinner" period, so add a "Lunch" period to one bookable
      branch first, otherwise the multi-group path is never exercised. Check both
      390px and desktop.
- [ ] **8.** Update the feature README with what shipped.

## Decisions taken

**Grouping is always on, with no section prop.** A `groupByService` toggle would
be a switch whose "off" position is strictly worse, that every merchant has to
read and decide about, and the single-group rule already covers the only case
where grouping is unwanted. The schema's own doc says these props are
"presentation only… configuration that describes the *restaurant* has to be read
live" — service names are restaurant configuration, so they do not become a page
prop. No change to `reservationsSchema`.

**The time filter replaced the "When" segment** rather than being added beside
it, so the pill stays at three segments and the date stops being shown twice.

## Work stream 3 — the search pill's chrome

Scope chosen deliberately: **restyle the native controls, do not replace them.**
The native `<select>` and `<input type="date">` stay, because the browser's own
date picker and dropdown are what a guest's device already knows how to present
full-screen, with its own scrolling and accessibility. Only the parts showing
through as somebody else's were taken over.

- **Focus was invisible.** Every control set `outline-none` with nothing put
  back, so tabbing through the pill moved a cursor nobody could see. The class
  is gone; the native `:focus-visible` ring is back. Verified in the browser:
  `outline-style: auto` on focus, where it was `none` before.
- **Borders were the dashboard's.** `globals.css` has
  `@layer base { * { @apply border-border } }`, so an unstyled border on a
  merchant's site renders in OUR neutral rather than their palette. The pill now
  sets `borderColor: var(--site-border)` explicitly. **Nine other bordered
  elements in this widget still have the bug** — checkout, confirmation, the
  branch cards. Same one-line fix each; left alone to keep this change to the
  pickers.
- **The dividers had nothing behind them.** `gap-px` showed the page through, so
  the rules between segments were whatever colour the section happened to be and
  vanished on a matching surface. The pill is now painted `--site-border` with
  each segment painted `--site-card` on top, so the gaps read as hairlines in
  both directions with no `divide-*` utilities and no breakpoint variants.
- **`rounded-full` survived wrapping.** On a phone the row wrapped into stacked
  segments still wearing pill ends — a tall lozenge with the "GUESTS" caption cut
  into by the curve. Now `flex-col` + normal radius below `sm`, row + pill above.
- **Segments are `<label>`s**, so the caption and the whole padded area focus the
  control instead of only its line of text.
- **Selects wear the site's clothes**: `appearance-none` with a `▾` matching the
  header's nav menu, and an explicit `color`, because a native select does not
  reliably inherit one — several browsers paint the OS text colour, which on a
  merchant's tinted palette is the one colour it must not be. The date input gets
  `accent-color: var(--site-brand)` so the browser's own calendar tints to brand.

### Tailwind 4 traps hit here, both silent

Neither failed loudly — the classes sat on the element and simply did nothing.

1. **`ring-[var(--site-brand)]` is parsed as a ring WIDTH.** An arbitrary value
   after `ring-` is a width, so the brand colour resolved to nothing and the
   focus indicator did not exist: computed `box-shadow` was five transparent
   zero-width layers. `ring-inset` is also gone in v4 (`inset-ring` now).
2. **`divide-[var(--site-border)]` has the same ambiguity**, and `sm:divide-x`
   never generated either. Replaced wholesale by the gap-background technique
   above, which needs no divide utilities at all.

**Verify computed styles, not class lists.** Both bugs were invisible in the DOM
— the classes were present and correct-looking. Only `getComputedStyle` showed
that nothing had been applied. Grepping the built CSS was actively misleading
here: `.next` serves cached chunks whose mtime predates the running server.

## Work stream 4 — themed pickers (supersedes work stream 3's approach)

Work stream 3 restyled the native controls on the explicit decision to keep
them. Seeing the result side by side with CUT's booking page reversed that: the
native `<select>` dropdown is an OS list in an OS font, and no amount of
restyling the *closed* control changes what opens. All three criteria are now
custom panels.

The trigger keeps the caption-over-value shape; the panel is a card in
`--site-card` with a shadow, and the chosen row is a **filled brand pill** — the
same treatment the time slots get, so "this is the one you picked" looks the same
everywhere in the widget.

- **Guests / Time** — `role="listbox"` panels, scroll-capped at `max-h-64`.
- **Date** — a month grid, arrows to step, past and out-of-window days rendered
  disabled rather than omitted so the shape of the month stays readable. One
  month, not the two SevenRooms shows: two only pay off on a wide screen, and the
  same panel has to work at 390px without shrinking tap targets below a thumb.
- The trigger now reads `Sun, Aug 30` instead of the browser's `08/30/2026`,
  which is the thing a native date input can never be made to say.

Calendar arithmetic lives in `lib/site-builder/reservations/calendar.ts`, pure
and UTC-only — a grid built from local time shifts by a day for anyone west of
the venue and quietly offers them yesterday.

### Three bugs found while building, two by the tests

1. **Two panels could stand open at once.** Each `Picker` owned its own `open`
   state, and clicking a second trigger only dismissed the first because
   `mousedown` happens to fire before `click`. A keyboard user tabbing to the
   next trigger and pressing Enter fired neither, leaving both panels overlapping.
   Fixed by lifting the open panel to one value on the pill, which makes "only
   one open" true by construction rather than by event ordering. **Caught by
   `opens only one panel at a time`.**
2. **The portalled panel rendered transparent.** `--site-*` are declared on the
   storefront's wrapper, not on `:root`, so a panel portalled to `<body>` sits
   outside the scope that defines them and every token resolved to nothing — the
   page showed straight through it. The panel now carries the computed values
   with it. Portalling is still correct: the pill's `overflow-hidden` would
   otherwise cut the calendar off below its first row.
3. **The listener effect re-subscribed on every render**, because callers pass an
   inline arrow for `onOpenChange`. Held in a ref, refreshed in an effect —
   assigning a ref during render is the one thing refs are not for, and the
   linter says so.

## Still open, deliberately not in this change

**`showOtherDates` is a prop and a sentence, not a feature.** The schema promises
it will "offer the next few dates when the chosen one is full", and `TEARDOWN.md`
describes the rail it was modelled on — next three dates, each a horizontally
scrolling row of outlined chips. The widget only appends `" Try another date."`
to the empty state. Worth its own ticket; flagging it because the schema
currently reads as though it were built.

**No waitlist.** SevenRooms' "Alert Me" sits in the last grid cell as a peer of
the times, so "nothing works for me" is as visible as booking. We show nothing at
all on a full day.
