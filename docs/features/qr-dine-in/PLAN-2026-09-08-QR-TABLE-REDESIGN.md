# Table QR manager — row list → canonical data table

**Date:** 2026-09-08
**Branch:** `feat/table-qr-under-tables`
**Scope:** `app/dashboard/tables/qr-codes/components/QrTableManager.tsx`,
`components/dashboard/shell/StatTile.tsx`
**Migration / RPC / RLS:** none.

Proposal and before/after mockup: <https://claude.ai/code/artifact/10934b46-ee78-4609-950d-20f028e85aa1>

---

## Why

`/dashboard/tables/qr-codes` rendered 233 tables as 233 hand-built flex rows. At that
scale the screen broke nine rules in [`docs/UI-DESIGN-SYSTEM.md`](../../UI-DESIGN-SYSTEM.md):

| # | Defect | Rule |
|---|--------|------|
| 01 | Four labelled buttons per row (932 total), 208px of every row | §5.2 |
| 02 | `bg-emerald-600` "Active" badge | DS-CTL-09 |
| 03 | `divide-y divide-border/60` between rows | §5.5 |
| 04 | Four field labels repeated on all 233 rows (932 labels) | §5 |
| 05 | No columns, so no alignment and nothing scannable | §3.3 |
| 06 | Timestamps to the second (`9/6/2026, 3:40:02 PM`) | — |
| 07 | Three badge materials in one row (solid / outline / secondary) | §5.2 |
| 08 | `max-h-[32rem] overflow-y-auto` nested inside the page scroll | — |
| 09 | No bulk action, though 113 tables needed a code | §5.2 |

## What changed

### Phase 1 — the table
- `<Table variant="data">` replaces the flex list, modelled on `StaffDataTable`
  (the design system's named canonical table). Row height ~90px → ~44px.
- Seven columns: ☐ · Table · Status · Scans · Generated · Last scan · ⋯
- `getStatusBadge` returns one neutral pill for every state.
- `formatRelative()` renders "3 weeks ago"; the exact stamp stays in the cell `title`.
- All four row buttons collapse into one `MoreHorizontal` ghost icon opening a
  dropdown grouped by muted `DropdownMenuLabel`s (Code / Guest link / Download) —
  labels rather than separators, because §5.5 bans horizontal rules.
- **Hazard fixed:** Reprint and Regenerate were two identical outline buttons, but
  Regenerate mints a new token and invalidates every code already printed for that
  table. Regenerate and Revoke now carry `text-destructive` — DS-CTL-09's explicit
  carve-out for an *action's* consequence, as distinct from a *record's* state.

### Phase 2 — the frame
- The table now sits **outside** the `Panel` (§5.2: its own `bg-muted/20` well is the
  surface; nesting produced a box in a box). The panel keeps the stats, the branding
  preview and the banners.
- Zone headings render only when there is more than one zone (`showZoneHeadings`).
- The nested scroller is gone; paging is the DS pager, hidden when `pageCount <= 1`.
- Card grid below `xl` (§5.3), never a sideways-scrolling table.

### Phase 3 — bulk
- Selection `Set<string>`, cleared whenever a filter changes so the count always
  describes what is on screen and nothing off-screen can be revoked.
- Bulk bar per §5.2: ghost pills on `bg-muted/60`, count in `tabular-nums`.
- `buildPdfBlob` split into `renderTentAssets` + `drawTentSheet` + `createTentDoc`, so
  `buildBatchPdfBlob` lays every selected table into **one** PDF, one table per sheet.
  Warnings are de-duplicated across the run; a table whose code is not ready is skipped
  and named in the summary rather than aborting the batch.

### Phase 4 — stat tiles as filters
- `StatTile` gains optional `onClick` / `isActive` (purely additive; existing call
  sites render exactly as before). An applied filter reads as **weight, not colour**.
- The third tile is now **Missing** rather than Generated — the actionable figure, and
  one that was previously not on screen at all (it is total − generated). Generated
  survives as the meta line under Tables.

## Verification (2026-09-08)

- `tsc --noEmit`: **918 errors, 0 in the changed files** — identical to the count on
  the unmodified tree.
- `npx eslint` on both changed files: clean.
- `npm run build`: exit 0, no errors or warnings; `/dashboard/tables/qr-codes` compiled.
- DS audit greps on the changed file — `divide-y|border-b|border-t|<Separator`: clean;
  legacy blocklist: clean. The two `bg-amber-50` hits are the pre-existing storefront
  and billing-gate **banners**, which §4.7 explicitly permits.
- Browser (Chrome, `localhost:3000`, merchant *Joes Coffee Shop* / Uptown Branch, 233 tables):
  - **0 console errors** (2 warnings pre-existing: Clerk dev keys, an org-logo `sizes` prop).
  - Stat-tile filter: clicking **Active** set `aria-pressed=true` on it and `false` on
    the others; the count line moved to "231 of 233 tables", matching the figure.
  - Selection: 26 checkboxes (1 header + 25 rows at `ROWS_PER_PAGE`); selecting three
    raised the bulk bar reading "3 selected" with all four actions.
  - Row menu: 12 items under the three group labels; `Regenerate` computes to a red
    `color`, `Reprint` to the neutral foreground.
  - **Batch PDF: 3 selected → `uptown-branch-table-tents.pdf`, 637 KB, 3 pages.**
  - Mobile at 420px: data table hidden, 25 cards rendered, `scrollWidth === clientWidth`
    (no horizontal overflow).
  - Dark mode checked inside the real dashboard route (C4).

### Side effect during QA

A mis-targeted selector (`getByRole('button', {name: /Missing/})`) matched the header's
**Generate Missing** button before the stat tile and fired it, generating the 113
missing codes on the *dev* Uptown Branch (Missing 113 → 0, Active 118 → 231). The
operation is additive and idempotent and the account is a throwaway dev merchant, but
it was unintended — the dev data no longer matches the pre-change screenshots.

## Not done

- No confirmation dialog on Regenerate. The destructive styling makes the two apart,
  but a token that invalidates printed codes arguably deserves a confirm step.
- Bulk actions run one request per table. Fine for tens, slow for hundreds; a
  server-side batch action would be the follow-up if merchants use it at full-floor scale.
- Removed a stale developer note that had been rendering to merchants beneath the list
  ("…still need end-to-end staging scan validation before the related ticket items are
  safe to close").

---

## Follow-up, same day — merchant-legibility fixes

Three changes after review, all display-only in `QrTableManager.tsx`:

1. **Token version removed from the UI.** `v1` / `v3` rendered beside the status pill on
   both the desktop row and the mobile card. It is an internal rotation counter and means
   nothing to a merchant. `tokenVersion` stays in `QrTableManagerRow` and in the snapshot
   query — only the two render sites are gone.

2. **`Scans` split into two labelled columns.** One cell reading `0 / 0` gave the reader no
   way to know which figure was which. Now `Scans (7d)` and `Scans (all)`, each
   right-aligned `tabular-nums`. The mobile card gets the same two labelled fields.

3. **`Seats` promoted to its own column.** It had been trailing the table label as
   `1 · 2 seats`, which did not align (so it could not be read down) and read twice on a
   table genuinely named "2-Person Booth". The header carries the unit, so the cell is just
   the figure, with an em-dash when capacity is null. The Table cell is now the label alone.

Table min-width 860px → 980px for the two added columns; still `hidden xl:block`, so it
never forces a horizontal scroll.

### Verification

- `tsc`: 918 / **0 in changed files** (unchanged baseline). `eslint`: clean.
- Browser (Chrome headless, merchant Uptown Branch, 233 tables):
  - Headers read `Table · Seats · Status · Scans (7d) · Scans (all) · Generated · Last scan`.
  - Rows: `1 | 2 | Active | 0 | 0 | 2 days ago | Never`.
  - `/\bv\d+\b/` in the table: **no matches** — no version tokens left.
  - `/\d+\s\/\s\d+/` in the table: **no matches** — no `0 / 0` pairs left.
  - `scrollWidth === clientWidth` — no horizontal overflow.
  - One console error, **not from this code**: Clerk's "Component renderer did not mount
    within 10s" dev-server warning, from cold chunk loading in headless. Absent in the
    earlier warm-browser run of the same page.

### Browser-QA gotcha worth keeping

A fresh browser profile has no location in `location-storage` (the store defaults to
`"all"`), and this route renders `LocationListView` rather than the manager until a
specific location is chosen. Any headless check of `/dashboard/tables/qr-codes` must click
through the picker first — the location cards are plain elements, not buttons, so target
them by text. Filter candidates with `isVisible()`: the header carries an `md:hidden`
location switcher that otherwise swallows the click.

---

## Follow-up 2 — sortable columns and column order

### Column order

Was: `Table · Seats · Status · Scans (7d) · Scans (all) · Generated · Last scan`
Now: `Table · Seats · Status · Generated · Scans (7d) · Scans (all) · Last scan`

`Generated` had been sitting between the scan counts and `Last scan`, splitting the usage
group in half with a lifecycle field. The order now reads as three groups — **which table**
(Table, Seats) · **what state its code is in** (Status, Generated) · **how it is being
used** (Scans 7d, Scans all, Last scan) — so `Last scan` lands beside the counts it belongs
with. The mobile card grid follows the same order, so the two layouts teach one reading.

Fixed widths (`w-24`/`w-28`/`w-40`) on the short columns stop `table-auto` spreading them
across the dead zone that had opened between Status and the numerics.

### Sorting

Every data column sorts: Table, Seats, Status, Generated, Scans (7d), Scans (all), Last scan.

- Headers are the design system's ghost pill (§5.2) rather than bare text, so a header that
  responds to a click looks like it will. The arrow is direction-bearing once active
  (`ArrowUp`/`ArrowDown`) and the neutral `ArrowUpDown` at 50% opacity when not.
- **asc → desc → off.** The third click restores the server's own floor order (zone, then
  numeric-aware table label), so there is always a way back to the order that matches the
  floor plan. `sort === null` is that resting state and the default on load.
- Sorting runs *before* grouping, so each zone lands already ordered.
- Re-sorting clears the page cursors, exactly as a filter change does — page 3 of one
  ordering is not page 3 of another. Selection is by id, so it survives a re-sort intact.
- `Status` sorts by attention rather than alphabetically (`not_generated` → `revoked` →
  `active`): a merchant sorting that column is asking what still needs doing.
- **Empty values sort last in both directions.** `compareNullsLast` applies the direction
  *inside* itself rather than to its result — multiplying outside would flip nulls to the
  top on a descending sort, putting 200 "Never" rows above the answer.
- `aria-sort` is set on the active `<th>`.

### Verification

- `tsc`: 918 / **0 in changed files**. `eslint`: clean.
- Browser (Chrome headless, Uptown Branch, 233 tables), **0 console errors**:
  - Headers read in the new order.
  - Seats asc → `2,2,2,2,2,2`; desc → `8,8,8,8,8,8`; third click → back to natural
    `1,1,1,1,2,2`.
  - Scans (all) desc → `2,1,1,0,0,0`.
  - **Nulls-last confirmed in both directions** — Last scan asc:
    `3 weeks ago, 3 weeks ago, last week, Never, Never`; desc:
    `last week, 3 weeks ago, 3 weeks ago, Never, Never`. "Never" stays at the bottom either way.
  - `aria-sort="descending"` on the active header.

---

## Follow-up 3 — header/value alignment

The three right-aligned numeric headers (Seats, Scans (7d), Scans (all)) did not sit over
their own figures. Two causes, both in `SortableHead`:

- The sort arrow trailed the label, so the label's right edge stopped ~20px short of the
  column of numbers underneath it — the heading read as belonging to the column on its left.
- `-mx-2` cancelled the button's padding on *both* sides, so the edge that had to line up
  was off by the padding on whichever side mattered.

Fixed by leading with the arrow on right-aligned columns (`mr-2` on the icon instead of
`ml-2`) and using a one-sided negative margin — `-mr-2` when right-aligned, `-ml-2` when
left — so the label's text edge lands exactly on the cell's text edge, which is the edge the
values are aligned to.

### Verification

Measured in the browser with `Range.getBoundingClientRect()`, comparing each header label's
text edge against the first row's value edge in the same column:

| Column | Align | Header edge | Value edge | Offset |
|---|---|---|---|---|
| Table | left | 332 | 332 | **0** |
| Seats | right | 732 | 732 | **0** |
| Status | left | 756 | 756 | **0** |
| Generated | left | 916 | 916 | **0** |
| Scans (7d) | right | 1181 | 1181 | **0** |
| Scans (all) | right | 1308 | 1308 | **0** |
| Last scan | left | 1332 | 1332 | **0** |

All seven columns flush. 0 console errors. `tsc` 918 / 0 in changed files; `eslint` clean.
