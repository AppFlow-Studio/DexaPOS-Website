# `/manage/support/kds-mirror` — design-system conversion

**Date:** 2026-09-29 · **Branch:** `Haydar-AdminRestructure` · **Spec:** [`docs/UI-DESIGN-SYSTEM.md`](../../UI-DESIGN-SYSTEM.md)

Converts the HQ KDS support page (sidebar "KDS") onto Part A and §14. Presentation only: no query, action,
URL-param, realtime or refresh behaviour changes, except where recorded below. `/manage/support/kds-truth` is a
bare `redirect()` onto the Device truth tab and needs no change.

## Decisions (confirmed with the user)

| # | Decision | Rule |
|---|---|---|
| 1 | **The station board goes neutral.** It is a port of the tablet screen, but it is not treated as a canvas exception: rush, allergens, "No X" modifiers, voids, refunds and special instructions are carried by words and weight, not hues. | §3.5, §4.6b |
| 2 | **All three tables page at 10** (send ledger and unsent items were 100, divergences 25), on `PaginationBar`. | §5.7, D-19 |
| 3 | **Only send failures are alarms** (HQ-2): a partial send, dropped items and a partial fire take a red glyph; "no route recorded" takes an amber glyph. The Partial sends / With dropped items / Partial fires figures turn red only when above zero. Device-truth verdicts, routing health, stale-ticket hints and the realtime state are neutral. | §3.5 use 4, §14.3 |

## Scope (all reachable, this route only)

`page.tsx`, new `loading.tsx`, and in `components/`: `KdsMirrorControls`, `MerchantPicker`, `KdsStationBoard`,
`KdsSendLedger`, `KdsUnsentItems`, `KdsDisplayHealthCards`, `KdsDeviceTruthTimeline`, `KdsDivergenceList`,
`verdictMeta.ts`, new `KdsMirrorSkeleton.tsx`. `TablePagination.tsx` is deleted (replaced by `PaginationBar`).

Reuses `RecordCard`, `CardField(s)`, `LoadError`, `TableEmptyRow`, `CardGridEmpty` from
`app/manage/transactions/components/ledger-primitives.tsx` rather than retyping them. That module is the §11
"shared mobile record card" candidate for promotion to the shell.

## Work items

- [x] Page shell: `PageShell as="div"`, `PageHeader` (h1 + subtitle, connection status + Refresh as actions)
- [x] Scope controls directly on the page: muted pill merchant combobox (popover `rounded-2xl`), location and display selects, stacked full-width on phones, `aria-label`s
- [x] Scope notes (all-displays, `show_all_items`, 7-day routing health) as neutral text; problems marked by weight
- [x] Realtime status: neutral pill with the word ("Connected" / "Polling only" / "Connecting"), no green/amber
- [x] Tabs: pill rail (§4.5) with the rail-scroll recipe (§13.2); each tab body is one `Panel` with `PanelSection`s
- [x] Blind-spot notices: amber banners → neutral `bg-muted/60` callouts. The "server state, not the physical screen" notice moves from the top of the page into the Board tab, which is what it describes; Device truth keeps its own notice.
- [x] "Pick a merchant and location" states: worded neutral wells (§4.9), not dashed boxes
- [x] Station board: status/type filters as pill rails (`aria-pressed`), cards on the record-card material, no divider under the ticket header, highlighted order = selected state + "Linked order" word, stale hint neutral with weight, allergens as uppercase words, empty copy uses the tab's own label ("No served tickets", was "No ready tickets")
- [x] Station board on narrow screens: faithful tablet columns from `lg`; below `lg` one column in the tablet's priority order (round-robin reads row-major, so list order is the kitchen's reading order)
- [x] Send ledger: `StatRow` of `StatTile`s; neutral callouts; `variant="data"` table from `xl` (`min-w-[900px]`), record cards below; row and card render the same `SendItemList`; expand control is a real button with `aria-expanded`; neutral pills; alarm glyphs per decision 3; `LoadError` with Retry; 10/page
- [x] Unsent items: same treatment; table from `xl` (`min-w-[820px]`)
- [x] Display health cards: `bg-muted/45` record-card buttons (`aria-pressed`), neutral glyphs, plain-text figures, worded empty state instead of `return null`
- [x] Timeline: lanes as `bg-muted/45` insets, no header rule, neutral dots with the key events in weight, feed cap `max-h-[min(60vh,32rem)]` (§5.7 chronological feed)
- [x] Divergences: raw `<table>` → `variant="data"` from `lg` (`min-w-[720px]`), cards below; neutral verdict pills; NEVER_SHOWED marked by weight; filter chip toggle; 10/page
- [x] `verdictMeta.ts`: tone/hue classes removed; labels and descriptions kept
- [x] `loading.tsx` + Suspense fallback shaped like the converted page (the route was inheriting `/manage/support`'s inbox skeleton)
- [x] Design doc: HQ-2 row, §14.5 adoption note, §11 pager row

## Behaviour changes beyond presentation

| Where | Change | Why |
|---|---|---|
| All tables | 100 / 100 / 25 → 10 per page | Decision 2 |
| Board | Below `lg`, tickets stack in one column in the tablet's order | Four to eight tablet columns in a phone-width panel were ~80px each |
| Board | Blind-spot notice moved from page top into the Board tab | It describes the board; on Device truth it contradicted that tab's own notice |
| Device truth | The window select renders only once a display is picked (it was shown disabled) | It governs the per-display timeline, so it now sits in that section's heading |

## Found, not changed

- Timeline lanes still reveal 100 more entries on demand rather than capping length on the server (§5.7 asks for a server cap on feeds). Changing the device-truth query is out of scope for a UI pass. *Kept on purpose on 2026-09-30 and recorded as exception HQ-5 (§14.3); see "Follow-up 2" below.*

## Verification

- [x] `tsc --noEmit --incremental false`: 826 project errors before and after, **0 in any changed file**
- [x] ESLint on the route folder: one finding, `react-hooks/set-state-in-effect` on the board's two-step reset effect. It is pre-existing (the `HEAD` version reports the same) and the logic was not touched.
- [x] §3.5, §4.6b, §5.5, §8, §12 greps reviewed for every changed file: the only colour is the HQ-2 send-failure glyphs and figures (decision 3); no dividers, legacy classes, `rounded-lg`/`rounded-md`, dashed wells, sheets, bare badges or hand-written `h1`
- [ ] Browser: light + dark at 1440 / 1024 / 375 — **not run** (the Chrome DevTools MCP failed to connect this session). Worth checking: the board's `lg` switch from one stacked column to tablet columns, the ledger and unsent card grids below `xl`, the divergence cards below `lg`, dark-mode surfaces of the expanded ledger row (`bg-muted/30` cell, `bg-background/70` item rows), and the tab rail centring at 375px.

**Dependency:** the tables import `RecordCard`, `CardField(s)`, `LoadError`, `TableEmptyRow` and `CardGridEmpty` from `app/manage/transactions/components/ledger-primitives.tsx`, which is still uncommitted on this branch; it must ship in the same commit or before.

## Follow-up (2026-09-30)

A re-audit against the 2026-09-30 table rules (D-25–D-28) found two claims above that did not hold. Both are fixed; the
work is recorded in [`support-conversion-plan.md`](support-conversion-plan.md) (steps 1 and 4).

- **The divergence table didn't fit at `lg`.** `min-w-[720px]` inside a `PanelSection` (48px padding plus the panel
  border) scrolled sideways from 1024px to about 1074px. It now shows from `md` as a `table-fixed` table with tiered
  columns, and has no `min-w`.
- **Error handling was only honest on the ledger and unsent tabs.** The board, the truth window and display health
  rendered their empty sentence ("No pending tickets", "No truth timeline", "No KDS displays at this location") under or
  instead of the failure. Scope-picker and merchant-search failures were silent. Each now says what failed and offers
  Retry.
- The dependency note is stale: `ledger-primitives.tsx` is tracked (commit `cf641def`).

## Follow-up 2 (2026-09-30): expanded rows, timeline, touch targets

Decisions confirmed with the user after the D-25–D-28 re-audit:

| # | Decision | Rule |
|---|---|---|
| 4 | **Ledger and unsent rows keep expanding in place**, capped at 5 items with the full list in a centred dialog. Recorded as exception HQ-4. | §5.9, §14.3 |
| 5 | **Timeline lanes keep "Show 100 more"** instead of a 50-event cap. Recorded as exception HQ-5. | §5.7, §14.3 |

Sizes behind decision 4, measured read-only on 2026-09-30: items per send median 1, p90 4, p99 8, max 32 (536 sends);
unsent items per order median 1, p90 2, p99 7, max 25 (3,001 orders, all dates). About 17% of sends and 5% of unsent
orders hold 4+ items. At ~42px per item row, 32 items expanded was ~1,400px on a laptop.

- [x] `CappedItemList` in `kds-primitives.tsx`: the first `EXPANDED_ITEM_CAP` (5) items in place, then "Show all N items"
      opening a centred `Dialog` (full screen below `sm`, §13.1; the body scrolls, §12) and "5 of N shown". Item rows take
      `bg-background/70` in the expanded cell and `bg-muted/45` in the dialog, where the former would vanish
- [x] Send ledger: preview ranked dropped → no route → routed (§5.7 rank before slice), each item keeping its original
      number; "problems first" is said only when the ranking moved an item up. The dialog keeps the POS order
- [x] Unsent items: same cap, list order unchanged (every item on it is unsent)
- [x] §13.6: the merchant, location, display and time-window pickers and the two filter chips (Anomalies only,
      Show all items) are `h-11` below `sm`, `h-9` from `sm`. The selects need `data-[size=default]:h-11
      sm:data-[size=default]:h-9`, because `SelectTrigger`'s own `data-[size=default]:h-9` outranks a plain `h-11`. The
      skeleton's picker bones match
- [x] `components/ui/command.tsx`: the `CommandInput` wrapper's `border-b` rule became the §4.2 muted pill (all 16
      comboboxes, including the merchant picker); recorded in §11

Verification: `tsc --noEmit --incremental false` reports 836 project errors (unchanged), **none** in
`app/manage/support/kds-mirror/**` or `components/ui/command.tsx`; `eslint` on both is clean. §3.5 grep: the only hues
are the HQ-2 send-failure glyphs and figures. **Not browser-checked** (chrome-devtools MCP down). Worth checking: a send
with 6+ items (the "Show all" dialog, full screen at 375px), the combobox search pill in the merchant picker and the
dashboard search palette, and the 44px pickers at 375px in both themes.

## Follow-up 3 (2026-10-03): display health is a table on tablet and laptop

The user asked for tables, not cards, on tablet and laptop for every list on the page, with cards kept on phones. The
send ledger, unsent items and divergences already switched at `md`; Display health was the one list still drawn as
cards at every width. The station board (a port of the tablet's ticket screen) and the timeline lanes (chronological
feeds) are not record lists and keep their layouts.

- [x] `KdsDisplayHealthCards.tsx` → `KdsDisplayHealth.tsx`: a `variant="data"` table from `md` (`bounded={false}`,
      `table-fixed`, one-line rows), cards `md:hidden`. Columns: display, ack rate and render suspect from `md`; routed
      and acked from `lg`; arrived from `xl`. Numeric cells right-aligned `tabular-nums`
- [x] Selecting still works: the row toggles the display, the name is a real `<button aria-pressed>`, the selected row
      takes the `selected` fill and the word "Selected"
- [x] A display that never reported reads "No device data" in the ack-rate cell and "—" for its device-side counts
      (routed stays, it is server-side); one line under the table says why
- [x] Paged at 10 with `PaginationBar`, a "N displays" line when it fits one page; skeleton rows from `md`, card
      skeletons below
- [x] Phone card trimmed to the essentials (D-27): ack rate, routed and render-suspect; acked and arrived are on the
      table from `lg`/`xl`

Verification: a scoped `tsc` (the page and the new component, with their imports) reports 0 errors; `eslint` clean;
§3.5 and §5.5 greps clean. **Not browser-checked** (chrome-devtools MCP down).

## Follow-up 4 (2026-10-03): the ledger's header band stopped short of the table edge

Reported by the user with a screenshot: at `xl` the send ledger's header ended after "Flags" while the well and the
empty-state row ran to the right edge. Cause: the loading, empty and expanded rows pass `colSpan={8}`, but the `2xl`
Device column is hidden at `xl`, so 7 columns show; a span wider than the visible header makes a `table-fixed` table add
an anonymous 8th column with a share of the width and no header cell. Unsent items had the same fault (`colSpan={7}`
with up to three hidden columns).

- [x] Fixed centrally in `components/ui/table.tsx`, not per call site: `Table` counts its visible header cells
      (re-measured on resize and on header class/style/child changes) and `TableCell` clamps a wider `colSpan` to that
      count. Spans that fit are untouched; before the first measurement nothing changes, so server and client HTML match
- [x] `components/ui/__tests__/table-colspan.test.tsx` (happy-dom): clamps to the visible header, keeps the full span
      when all columns show, leaves a fitting span alone, recounts when a header cell hides after mount. Failed before
      the fix (2 of 4), passes after; the existing `table.test.tsx` still passes (17/17 under `components/ui`)
- [x] Same fix reaches the other tiered tables with full-width rows (audit logs, DLQ, users, support inbox,
      transactions, device catalog, discounts); recorded in UI-DESIGN-SYSTEM §5.4 and §11

Verification: scoped `tsc` on `table.tsx`, the test, `KdsSendLedger.tsx` and `KdsUnsentItems.tsx`: 0 errors; `eslint`
clean. **Not browser-checked** (chrome-devtools MCP down): confirm at 1280px that the ledger header band reaches the
right edge, and expand a row to check the detail spans the full width.

## Follow-up 5 (2026-10-03): board as a table; phone trims

User requests, with phone screenshots:

- [x] **Board:** a `variant="data"` table from `md` (`bounded={false}`, `table-fixed`, one-line rows, paged at 10),
      cards below `md`. Columns: ticket, elapsed and flags from `md`; items from `lg`; type/table and server/guest
      from `xl`. Flags say, in words, Linked order, the stale hint ("Never cleared" / "Untouched", full sentence in the
      tooltip), Rush, allergens, Void and Refunded; stale and linked rows are marked by weight. A row expands to the
      full ticket via `TicketDetail`, which the phone card also renders. The tablet's column grid and
      `distributeRoundRobin` are gone; the server's order (rush first, then oldest) is kept and is the paging order
- [x] **Board meta:** "Tablet: N columns" and the type scale removed from every view; "2-step workflow" stays
      (it explains the missing Pending tab)
- [x] **Board, phones:** the server-state disclaimer moves behind ⓘ in the filter row (`MirrorBlindSpotInfo`,
      `max-sm:hidden` on the notice); cards drop item special instructions and the stale-hint sentence, keeping the
      stale word in the card header. The expanded table row keeps both
- [x] **Scope controls, phones:** "Showing every display at this location combined…" hidden below `sm` (the display
      select already says "All displays (location-wide)")
- [x] **Unsent items, phones:** "by order created date" hidden below `sm`; "What unsent means" moves behind ⓘ beside
      the window select (`NoticeInfoButton`, a tap popover, since phones have no hover). The card drops the created
      date and "Nothing sent"; status moves beside the counts (Unsent · Sent · Status) so the order id gets the whole
      line. "Partial fire" stays: it is HQ-2 alarm text (§13.4 never drops it)
- [x] Skeleton: board rows from `md`, cards below; the board caption no longer says "arranged as the tablet arranges it"

Verification: scoped `tsc` on `page.tsx` and its imports: 0 errors in `kds-mirror/**` and `components/ui/table.tsx`;
`eslint app/manage/support/kds-mirror` clean; §3.5/§5.5 greps clean (only the HQ-2 send-failure hues). **Not
browser-checked** (chrome-devtools MCP down).

## Follow-up 6 (2026-10-03): board row and expanded detail

From a user screenshot of an expanded board row:

- [x] The Items cell led with the count of item lines ("3 · 2× salaam soda, …"), which read as a total of 3 while the
      ticket held 5 units. The count is gone; the cell is the item list ("2× Salaam soda, Strawberry shake, …"), and
      the expanded row says "5 items on 3 lines"
- [x] "##0001": `display_number` can already carry its "#"; the label strips leading "#" before adding one
- [x] Elapsed past a day reads "166d 18h", not "4002h 12m" (Elapsed column `w-24`, Flags `w-40`, so the `md`
      essentials fit ~414px)
- [x] Order type in the board's own words ("To Go", "Dine-In", "Delivery"), not the raw `takeout`, in the table and
      the card
- [x] The expanded row has its own layout (`TicketRowDetail`): items as `bg-background/70` rows (quantity, name, Rush /
      To go / Void / Refunded words, modifiers, instructions as quiet muted text) on the left, and the ticket's facts
      (Guest or Server, Order note, the stale hint in full) on the right from `lg`, stacked below. The phone card keeps
      the kitchen-ticket layout (`TicketDetail`); both show the same fields

Verification: scoped `tsc` on `page.tsx`: 0 errors in `kds-mirror/**`; `eslint` clean; §3.5/§5.5 greps clean. **Not
browser-checked** (chrome-devtools MCP down).

## Follow-up 7 (2026-10-03): type-tab counts, ⓘ placement, order-type labels

- [x] **Bug: the board's type tabs did not add up to All.** `matchesTypeFilter` (ported from the tablet) knew only
      `dine_in`, `takeout` and `delivery`; the data also has `qr_dine_in` (counts read-only on 2026-10-03: takeout
      5,350, dine_in 1,744, delivery 45, qr_dine_in 43). QR dine-in tickets showed under All and under no type tab.
      They now count as Dine-In. **Found, not changed:** if the tablet's `kds.tsx` (Dexa-POS repo, not on this
      machine) still has the old check, the kitchen's own Dine-In tab hides QR dine-in tickets too
- [x] ⓘ opens a small centred card (`CENTRED_DIALOG`, the §13.1 short-dialog exception) instead of a popover that hung
      off the button and hugged the screen edge. On the board the ⓘ sits beside the "Station board" title
      (`size="inline"`, 32px); on Unsent items it stays beside the window select (44px)
- [x] One `orderTypeLabel` in `kds-primitives.tsx` ("To Go", "Dine-In", "QR Dine-In", "Delivery") for the board, unsent
      items and the send ledger, in tables and cards; on the unsent and ledger phone cards the type is `text-xs`

Verification: scoped `tsc` on `page.tsx`: 0 errors in `kds-mirror/**`; `eslint` clean. **Not browser-checked**
(chrome-devtools MCP down).

- [x] (2026-10-03) Board phone card: the order type line ("To Go") is removed; the type filter scopes the list, and the table shows the type from `xl`. Table name and course stay.

## Follow-up 8 (2026-10-03): the ⓘ explanation is a floating drop-down

The user rejected both a centred card and a full-screen detail panel for the phone ⓘ, and chose a floating drop-down.

- [x] `NoticeInfoButton` is a `Popover` centred under the icon (`align="center"`, `sideOffset={8}`,
      `collisionPadding={24}`, so it never hugs a screen edge), `w-[min(20rem,calc(100vw-3rem))] rounded-2xl`. The key
      sentence leads in bold; the body's sentences stack as short paragraphs. Props: `title` (accessible name),
      `description` (the key sentence), body children
- [x] Board and Unsent items split their explanations into a lead sentence and a body, so the `sm`+ notice (inline)
      and the phone drop-down (stacked) render the same words from one source
- [x] Found while testing the panel version: the shared dialog and sheet close buttons drew their ring on any focus
      (`focus:`), so Radix's auto-focus on open drew it on every tap, violet inside a portal (C5). Both are now
      `focus-visible:` (`components/ui/dialog.tsx`, `components/ui/sheet.tsx`); keyboard users keep the ring

Verification: scoped `tsc` on `page.tsx`: 0 errors in `kds-mirror/**` and `components/ui/**`; `eslint` clean.
**Not browser-checked** (chrome-devtools MCP down).

## Follow-up 9 (2026-10-03): plain ⓘ; board filters on phones

- [x] ⓘ is a bare icon in every section: no `bg-muted/60` fill; the glyph darkens on hover and while open
- [x] Board filters on phones (user chose "segments + dropdown"): status is a `SegmentedFilter` (new in
      `kds-primitives.tsx`), equal segments that always fit, label over count, each at least 44px tall (§13.6); order
      type is a dropdown (`WindowSelect`, "All order types"). From `sm` the two `PillRail`s stay. Nothing scrolls
      sideways or is cut off on phones any more
- [x] `PillRail` hides its scrollbar (`no-scrollbar`, §13.2: the peeking pill is the affordance), which removes the
      grey line that showed under each rail
- [x] Skeleton: segments and a dropdown on phones, the pill rails from `sm`

Verification: scoped `tsc` on `page.tsx`: 0 errors in `kds-mirror/**`; `eslint` clean; §3.5/§5.5 and radius greps
clean. **Not browser-checked** (chrome-devtools MCP down).

## Follow-up 10 (2026-10-03): tab-rail scrollbar; send ledger on phones

- [x] The main tab rail hides its scrollbar (`no-scrollbar`, §13.2); it still scrolls. Only the vertical lists (timeline
      lanes, the item dialog) keep `thin-scrollbar`
- [x] Send ledger, phones: "How to read this ledger" moves behind the ⓘ drop-down beside the filter chip (lead +
      `LedgerGuideBody`, shared with the `sm`+ notice)
- [x] Send ledger card: the order id gets the whole line (no date); pairs are Station · Status, then Applied ("2 of 2");
      send-failure words stay (HQ-2 alarm text). "Show on board" and the "N items on the order · station · device id"
      line are gone from the card; expanded, it shows the item list alone. The table's expanded row keeps both

Test data (read-only, 2026-10-03): only two locations have both send-ledger and device-truth data. **Joes Coffee ›
Uptown Branch** (543 sends, 989 device events on 3 displays, newest Oct 2) and Appflow Studio Cafe › FiDi (13 / 20,
newest Sep 21, outside every window the page offers). Uptown's newest device event is ~30h old, past the timeline's
24h maximum, so its timeline and divergences read empty until new events arrive.

Verification: scoped `tsc` on `page.tsx`: 0 errors in `kds-mirror/**`; `eslint` clean. **Not browser-checked**.

## Follow-up 11 (2026-10-03): Device truth on phones; ⓘ beside the titles

- [x] Device truth, phones: the "device-attested" notice moves behind ⓘ beside the "Display health" title (lead +
      `DeviceTruthBody`, shared with the `sm`+ notice)
- [x] Send ledger: the ⓘ moves from the filter row to beside the "Send ledger" title (`SendLedgerInfo`). Board, Send
      ledger and Device truth now build their titles the same way (`TitleWithInfo` in `page.tsx`); Unsent items keeps
      its ⓘ beside the window select
- [x] Removed on phones, at the user's request: the Display health caption ("Last 7 days, per display…",
      `showCaptionOnMobile` dropped), the routing-health line under the pickers ("Last 7 days (N items fired): …"),
      and the "N displays" count under the health table. All three still show from `sm`. This overrides §13.4's
      "scope stays" for the "Last 7 days" wording; recorded here as a user decision

Verification: scoped `tsc` on `page.tsx`: 0 errors in `kds-mirror/**`; `eslint` clean. **Not browser-checked**.

- [x] (2026-10-03) Send ledger phone card: expanded items drop their kitchen status ("preparing") and prep-station pill ("Coffee") via `SendItemList compact`; the table's expanded row keeps both.

## Follow-up 12 (2026-10-03): Routed vs seen and Divergences audit

Checked against the rules and this week's patterns (ⓘ beside titles, lean phone views, no repetition):

- [x] **Routed vs seen title:** plain "Routed vs seen" with the heartbeat note behind ⓘ on phones (it was a caption,
      which phones hide, so the note was lost there). The display name moved from the title into the caption from
      `sm`; on phones the display picker already names it. "Pick a health card" wording now says Display health
- [x] **Server lane:** rows no longer repeat "Routed to display" (the lane says so); they lead with the item and
      order. A non-routed entry says "Not routed (…)"
- [x] **Device lane:** rows now name the item and order (joined from the window's items by `order_item_id`), so the
      lanes read against each other. Clock skew shows on a row only when it is 5s or more ("clock 7s off"); the exact
      value is in the tooltip
- [x] **Phones:** one lane at a time behind a `SegmentedFilter` (Server lane · Device lane, with counts), so there is
      one scroll well, not two stacked 60vh wells (§5.7). The lane's own header hides below `md` (the segment says it)
- [x] **Empty:** one sentence for an empty window instead of two empty lanes and a hint that described the layout
      (§4.9); it says how to get data (widen the window, check the display is online)
- [x] **Divergences:** one count line ("3 of 40 items where the server and the device disagree" / "All 40 items in
      this window"); the footer that repeated the hidden count and the chip's label is gone; "(s)" plurals fixed.
      Phone card drops Kitchen status (a wide-screen column) and gives Device the full row

Verification: scoped `tsc` on `page.tsx`: 0 errors in `kds-mirror/**`; `eslint` clean; §3.5/§5.5 greps clean.
**Not browser-checked**.
