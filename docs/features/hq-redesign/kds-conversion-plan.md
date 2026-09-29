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

- Timeline lanes still reveal 100 more entries on demand rather than capping length on the server (§5.7 asks for a server cap on feeds). Changing the device-truth query is out of scope for a UI pass.

## Verification

- [x] `tsc --noEmit --incremental false`: 826 project errors before and after, **0 in any changed file**
- [x] ESLint on the route folder: one finding, `react-hooks/set-state-in-effect` on the board's two-step reset effect. It is pre-existing (the `HEAD` version reports the same) and the logic was not touched.
- [x] §3.5, §4.6b, §5.5, §8, §12 greps reviewed for every changed file: the only colour is the HQ-2 send-failure glyphs and figures (decision 3); no dividers, legacy classes, `rounded-lg`/`rounded-md`, dashed wells, sheets, bare badges or hand-written `h1`
- [ ] Browser: light + dark at 1440 / 1024 / 375 — **not run** (the Chrome DevTools MCP failed to connect this session). Worth checking: the board's `lg` switch from one stacked column to tablet columns, the ledger and unsent card grids below `xl`, the divergence cards below `lg`, dark-mode surfaces of the expanded ledger row (`bg-muted/30` cell, `bg-background/70` item rows), and the tab rail centring at 375px.

**Dependency:** the tables import `RecordCard`, `CardField(s)`, `LoadError`, `TableEmptyRow` and `CardGridEmpty` from `app/manage/transactions/components/ledger-primitives.tsx`, which is still uncommitted on this branch; it must ship in the same commit or before.
