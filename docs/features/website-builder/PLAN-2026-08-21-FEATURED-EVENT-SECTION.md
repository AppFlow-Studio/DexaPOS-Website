# Featured event section

**Date:** 2026-08-21
**Branch:** `feat/website-owner-ui`
**Status:** superseded — merged into the `events` section, see "Merged into Events" at the end

## What this is

A new section kind, `featured-event`, that shows **one** event large on any page,
with merchant control over where the photograph sits and how big the copy is.

The existing `events` section — the grid of everything upcoming — is untouched.
This is additive.

## Why

The `events` section renders a fixed 3-up grid with a 4:3 cropped photo and no
controls beyond the heading and a count. That is right for a listing. It is
wrong for "our New Year's party is the thing we want on the homepage", which is
a single event that wants the room a hero gets.

We are deliberately walking back the "almost no controls" decision recorded in
`schemas/events.ts` — but only for this new kind. The reasoning there ("the
content is the table, not this section") still holds for the listing, and this
section does not store event content either. It stores *presentation*, which is
the one thing the listing genuinely cannot express.

## Decisions

**D1 — Which event: "next upcoming" is the default, pinning is opt-in.**
`eventId` is optional. Left blank, the section renders whichever event is next.
A merchant places it on the homepage once and it stays correct forever as
Friday's trivia rolls over. Pinning exists for the case where a specific event
is the point.

**D2 — A pinned event that has ended hides the section.**
Not "fall back to the next one". Silently promoting a different event into a
merchant's homepage hero slot without them asking is worse than an empty gap.
On the public site the section renders `null`; in the builder canvas it renders
a placeholder saying the event has ended and to pick another. Same shape as
`GallerySection`'s empty handling.

**D3 — No "show ticket button" control.**
The button renders when the selected event has a ticket link and does not when
it doesn't. A toggle would be inert for every event without a link, and this
codebase has just spent a session removing exactly that (see
`QA-2026-08-20-OWNER-UI-DEFECTS.md` §C, the hero overlay slider).

**D4 — No text-alignment control.**
`section.style.align` already offers left/center on every section. A second
alignment control that could disagree with the first is a bug waiting to be
filed.

**D5 — `usesEvents` becomes a registry flag.**
Both render paths decide whether to fetch the events list with a hard-coded
`section.kind === "events"`. A new event-backed kind would not match, and would
render blank with no error anywhere. The check moves onto the registry, where
the next event-backed kind inherits it for free.

## Schema

`lib/site-builder/sections/schemas/featured-event.ts`

| Field | Type | Default | Notes |
|---|---|---|---|
| `eventId` | `string?` (≤64) | absent | Blank = next upcoming (D1) |
| `photoPosition` | `left \| right \| behind` | `left` | |
| `photoSize` | `small \| medium \| large` | `medium` | Hidden when position is `behind` |
| `textSize` | `small \| medium \| large` | `medium` | |
| `overlayOpacity` | `int 0–90` | `45` | Only shown when position is `behind` |
| `showDescription` | `boolean` | `true` | |

Name, date, description, photo and ticket link all still come from the event
record, so editing the event updates every page showing it.

## Work items

### Phase 1 — contract
- [x] `schemas/featured-event.ts`: schema, props type, defaults
- [x] `kinds.ts`: add `"featured-event"` to `SECTION_KINDS`
- [x] `schemas/index.ts`: re-export + `SectionPropsMap` entry
- [x] `registry.ts`: add `usesEvents?: boolean` to `SectionDefinition` (D5)
- [x] `registry.ts`: `featured-event` entry, `usesEvents: true`, `hiddenFields`
- [x] `registry.ts`: mark existing `events` entry `usesEvents: true`
- [x] `registry.ts`: export `pageNeedsEvents(sections)` helper

### Phase 2 — plumbing
- [x] `built-site.tsx`: `wantsEvents` via `pageNeedsEvents` (D5)
- [x] `render-canvas.tsx`: same
- [x] `schema-introspect.ts`: `ControlKind` gains `"event"`; `eventId` maps to it
- [x] `EventPicker.tsx`: new control, modelled on `FormPicker`
- [x] `SectionDrawer.tsx`: `case "event"`
- [x] `section-icons.tsx`: add the icons the registry already names

### Phase 3 — renderer
- [x] `FeaturedEventSection.tsx`: three positions, sizes, ended-event handling

### Phase 4 — tests
- [x] registry: every `usesEvents` kind is reachable by `pageNeedsEvents`
- [x] registry: both render paths use the helper, not a string literal
- [x] introspect: `eventId` produces an `event` control, not a text box
- [x] render: next-upcoming default picks the soonest event
- [x] render: pinned event renders that event, not the soonest
- [x] render: ended pinned event → `null` on public, placeholder in builder
- [x] render: each `photoPosition` emits exactly one position class
      (the invariant the hero carousel bug broke)
- [x] render: ticket button appears only with a ticket link (D3)

## Out of scope

- Changes to the `events` listing section
- The `/events/{slug}` detail page
- JSON-LD for the featured event (`buildEventJsonLd` exists; worth a follow-up)
- Any migration — there is none, and no new query: the events list is already
  loaded for the page.


## Outcome

All four phases complete. `npx vitest run lib/site-builder components/site-builder`
is **674 passing / 35 files** (was 647 / 34). Full suite: 931 passing, and the
same 22 pre-existing failures in `AffectsTag`, `cascade-labels`,
`a11y/storefront` and `orders` — none of which import anything under
`site-builder`; the a11y file fails on a missing happy-dom pragma.

`tsc --noEmit` is clean across every touched file, and eslint reports nothing.

### The tests were verified to actually fail

Each of the three decisions was deliberately reverted in the source and the
suite re-run, rather than trusting that a passing test proves anything:

| Mutation | Caught by |
|---|---|
| Drop `usesEvents` from the registry entry | "declares that it needs the events list" |
| `absolute relative` on one element | "puts at most one position class on the section in behind" |
| Fall back to next-upcoming when a pin ends (D2 reversed) | "renders nothing publicly when the pinned event is over" + "…has been deleted" |

### Two things found on the way that were not in the plan

**The icon allowlist had drifted.** `section-icons.tsx` resolves registry icon
names against a hand-written allowlist and falls back to a neutral square on a
miss. Every kind added after that file was written — `events`, `form`, `pdf`,
`reviews`, `scrolling-banner`, `video`, and `cards` via `LayoutGrid` — named an
icon that was never added, so seven sections had been quietly drawing the
fallback in the Add Section modal. The fallback worked exactly as designed and
hid the omission perfectly. All seven are now in the allowlist, and the new test
asserts the two lists agree, so kind #19 cannot repeat it.

**`CalendarStar` does not exist in lucide-react.** The plan named it; the icon
is `CalendarHeart`, which keeps `events` and `featured-event` visibly siblings
in the calendar family. Without the allowlist test this would have shipped as a
grey square and nobody would have noticed.

## Still open

- **Not browser-verified.** No dev server was running. Worth a pass over: the
  drawer's event dropdown against real events, all three photo positions, and
  the ended-pin warning.
- JSON-LD for the featured event (`buildEventJsonLd` already exists) — a real
  SEO win on any page carrying this section, and cheap. Deliberately out of
  scope here.


---

## Merged into Events (same day, at the merchant's request)

`featured-event` is **gone as a separate section kind.** Everything it did is now
the `spotlight` layout of the existing `events` section.

**Why.** A merchant thinking "I want my events on this page" should not first
have to work out which of two similarly-named sections they need. The choice
between a grid of everything and one event large is a *layout* decision, and a
layout control is what layout decisions belong in.

### Shape

`eventsSchema` gained `layout: "grid" | "spotlight"` (default `grid`) plus the
five presentation fields the deleted schema carried, and `showDescription`,
which applies to both layouts. `hiddenFields` now gates in two dimensions:

| Layout | Photo position | Panel shows |
|---|---|---|
| grid | — | Title, Subtitle, Layout, Limit, Show description |
| spotlight | left / right | + Event, Photo position, Photo size, Text size (no Limit) |
| spotlight | behind | as above, Photo size swapped for Overlay opacity |

### Stored pages were safe, and this was checked rather than assumed

Both migration paths go through `normalizePage`, which was read before the
change and then verified in the browser on a real draft:

- **Existing `events` sections** fail `safeParse` on the new required fields, so
  normalize falls back to `{...defaults(), ...pickValidFields(stored)}` —
  `title`, `subtitle` and `limit` survive, the new fields take defaults, and the
  section renders as a grid exactly as before.
- **The one stored `featured-event` section** (added to Joes Coffee Shop's Home
  draft during the earlier browser check) is now an unknown kind, and unknown
  kinds are **dropped and reported**, not preserved. It vanished on next load
  with no error, which is the designed behaviour.

### Browser-verified

Against the running dev server on Joes Coffee Shop's Home page:

- The pre-existing Events grid reloaded unchanged — heading, subtitle and the
  *Friday open wings* card all intact.
- The orphaned `featured-event` section was gone.
- Grid mode shows five controls; the five spotlight controls are absent.
- Switching to Spotlight drops Limit and reveals Event, Photo position, Photo
  size, Text size. Switching Photo position to Behind swaps Photo size for the
  Overlay opacity slider.
- The event dropdown populated with the merchant's real events — upcoming ones
  dated, ended ones under "Already happened" — with "Whichever event is next"
  selected by default.
- The spotlight rendered: heading, then photo left, then date / name /
  description.

The draft was set back to Grid afterwards.

### Test suite

`events-layout.test.tsx` replaces `featured-event.test.tsx`: 682 passing across
`lib/site-builder` + `components/site-builder`, `tsc` clean, eslint clean. The
position-clash check was strengthened while moving — it now scans **every**
element's class attribute for two position utilities rather than one known
wrapper, and a new test asserts `hiddenFields` only ever names fields that
actually exist on the schema, since a typo there would silently do nothing.

### Note

The `Featured event` label, its `CalendarHeart` icon and the `usesEvents`
registry flag are the parts that outlived the merge in modified form — the flag
still exists and still guards the events fetch, because the trap it closes is
real regardless of how many event-backed kinds there are.
