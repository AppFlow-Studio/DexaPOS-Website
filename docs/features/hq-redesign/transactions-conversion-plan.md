# `/manage/transactions` — design-system conversion (Family 4, first route)

**Date:** 2026-09-28 · **Branch:** `Haydar-AdminRestructure` · **Spec:** [`docs/UI-DESIGN-SYSTEM.md`](../../UI-DESIGN-SYSTEM.md)

Converts the Payments & Banking route onto Part A and §14. Presentation only: no query, action, URL-param or
permission behaviour changes, except the decisions and fixes recorded below.

## Decisions (confirmed with the user)

| # | Decision | Rule |
|---|---|---|
| 1 | Three real alarms keep a coloured **glyph** (never a fill), always with words: chargeback deadline overdue / due within 72h, TSYS sync error, batch reconciliation discrepancy. Added to the HQ-2 table. | §3.5 use 4, §14.3 HQ-2 |
| 2 | The main ledger's hand-rolled pager moves onto `PaginationBar` at a fixed 25/page. The rows-per-page select and jump-to-page box are removed. | §5.7, §11 |

## Scope (reachable files)

| File | Consumers |
|---|---|
| `page.tsx`, `loading.tsx` | route |
| `components/ConnectivityStrip.tsx`, `TransactionSearchBar.tsx`, `TransactionFilterDialog.tsx` (was `TransactionFilterSheet.tsx`), `TransactionDetailInlinePanel.tsx`, `MerchantBreakdownSection.tsx`, `PaymentsLedger.tsx`, `AuditLogSection.tsx`, `ManualBatchoutDialog.tsx` | this route only |
| `components/BatchReconciliationSection.tsx` | this route **and** merchant detail → Settlements → "Our batches" |
| `components/ChargebacksSection.tsx` | this route **and** `/manage/disputes` |
| `components/ledger-primitives.tsx`, `TransactionsPageSkeleton.tsx` | new; this route only |
| `components/TransactionDetailSheet.tsx` | **none — unreachable.** Not converted; left in place. |

Shared sections render **no outer chrome**: the host supplies it. On this route each tab is `Panel > PanelSection`;
the merchant Settlements tab renders its siblings bare, so the batch section stays bare there too. `/manage/disputes`
(still unconverted) wraps the chargebacks section in `Panel > PanelSection` so it is not bare on a Card page.

## Work items

- [x] Page shell: `PageShell as="div"`, `PageHeader` (h1, subtitle, Refresh/Export actions), no root `animate-in`
- [x] Summary panel: 6 `StatTile`s in one `StatRow columns={3}` that double as filters (`onClick` + `isActive`); `—` for unknown; honest deltas (nothing on a zero baseline or at 0.0%, glyph + sign + `sr-only` word); averages over nothing read "No card payments", not $0.00; per-tile definitions move into one "How these are calculated" popover (a filtering tile is a `<button>`, so an `InfoIcon` inside it would be nested interactive content)
- [x] Revenue by channel: `PanelSection` + inset tiles; unavailable state is a sentence
- [x] Trend chart: `var(--brand)` (was `hsl(var(--chart-1))`, C2), `CHART_GRID`/`CHART_TICK`, `AnalyticsTooltip`, `isEmptySeries` + `ChartEmpty`; caption says it ignores the filters (kept on phones)
- [x] Merchant breakdown: `Panel > PanelSection`, `variant="data"`, sorted then paged 10, column picker on phones with `min-w` lifted (§5.8); sparkline C2 fix; neutral error sentence; date range kept as a caption on phones (scope)
- [x] Ledger: `variant="data"` table from `xl`, record cards below (§5.3) rendering the same `TransactionDetailInlinePanel`; neutral status pills; `text-right tabular-nums` money; `PaginationBar` 25; expanded row via `data-state="selected"`; neutral error with Retry; filter-aware empty copy; "Clear filters" pill when a filter is set
- [x] Search highlight: neutral `<mark>` (was yellow)
- [x] Filter panel: `Sheet side="right"` → centred `Dialog`, full-screen below `sm` (§12, §13.1); `Separator`s and footer `border-t` removed; trigger is a DS-CTL-03 chip with a neutral count
- [x] Tabs: pill rail (§4.5) with the rail-scroll recipe (§13.2); each tab body in `Panel > PanelSection`
- [x] Payments ledger tab: neutral tiles in a `StatRow`, neutral pills, sentence-case labels, `PaginationBar`, cards below `2xl`
- [x] Settlements tab: `Select` filters, `DatePopover`, neutral status/origin pills, discrepancy alarm glyph, cards below `2xl`, neutral error wells; selected batch as a `bg-muted/60` inset, not a bordered box
- [x] Disputes tab: collapsible removed (the tab is the disclosure), `Select` filters, deadline alarm glyphs, neutral urgent callout, `PaginationBar`, cards below `2xl`; `/manage/disputes` call site updated
- [x] Audit tab: collapsible removed, `Select` filters, `DatePopover`, failure marked by weight (no red row), `PaginationBar`, cards below `2xl`
- [x] Detail panel: no tinted wells (emerald fees, amber reversals, destructive error), no dividers, neutral timeline glyphs, money `tabular-nums`, skeleton in the final shape, inner tables `variant="data" bounded={false}`
- [x] Manual batchout dialog: neutral callout, no amber icon, stays a centred card on phones (a confirmation)
- [x] Connectivity strip: neutral pills; TSYS error glyph red with "Sync failed"; worded fallback instead of `return null`
- [x] `loading.tsx` / Suspense fallback shaped like the converted page
- [x] HQ-2 table, §14.5 adoption row and §11 backlog updated in the design doc

## Behaviour changes beyond presentation

| Where | Change | Why |
|---|---|---|
| Ledger | Rows-per-page select and jump-to-page removed; fixed 25/page | Decision 2 |
| Payments ledger tab | 50 → 25 per page; Next uses the server `total` (it used to stop at any short page) | §5.7 |
| Payments ledger tab | First switch relabelled "Settled only" → **"Unsettled only"** | It drives `unsettledOnly` (`is_settled = false`); the old label said the opposite |
| Payments ledger tab | "Luqra" column → **"TSYS match"** | The page names the processor TSYS everywhere else |
| Detail panel, fees tile | Badge "Net deposit $X" → **"Net fee $X"** | `$X` is the net fee after refunds, not a deposit |
| Filter dialog | Footer "Cancel" → "Close" | Filters auto-apply, so there is nothing to cancel |
| Batch list, breakdown | Paging resets to page 1 when filters or sort change | Otherwise a filter change could strand the view on a later page |
| Chargeback detail | New "View in payments" link | The ID link lives in the table row; a card is a button and cannot hold a link |

## Found, not changed (data or logic, out of scope for a UI pass)

- **Payments ledger:** the "Payments" tile tip says "on this page", but `totals.count` is the server total. "Settled %" divides a pre-filter count by the post-filter row count. "Unmatched only" filters after server paging, so a page can hold fewer than 25 rows.
- **Payments ledger:** dates go to the query via `toISOString()` (UTC) while the fields show local dates; east of UTC a picked day can be sent as the day before. Pre-existing.
- **Merchant breakdown:** 11 comparison columns keep `min-w-[1100px]` from `md`, so between `md` and `2xl` the table scrolls inside its well. The §5.8 picker is phone-only; a desktop picker would need a `< 2xl` breakpoint hook.
- **Items Paid** (detail panel) is a 4-column table in half a grid row — one column over the §5.6 exception. It has no `min-w` and wraps, so it does not overflow.

## Verification

- [x] `tsc --noEmit --incremental false`: 820 project errors (baseline 822), **0 in any changed file**
- [x] ESLint per file against its `HEAD` version (`git show HEAD:… | eslint --stdin`): no new findings; see the handoff
- [x] §3.5, §4.6b, §5.5, §8, §12 greps reviewed for every changed file: the only colour is the five HQ-2 alarm glyphs; no dividers, legacy classes, sheets or bare badges
- [ ] Browser: light + dark at 1440 / 1280 / 1024 / 375 — **not run** (the Chrome DevTools MCP failed to connect this session). Worth checking: the 2xl table/card switch, chargebacks table width at exactly 2xl, the filter dialog full-screen on phones, dark-mode surfaces in the expanded detail panel.
