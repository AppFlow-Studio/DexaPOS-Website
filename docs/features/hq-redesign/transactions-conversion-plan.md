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

---

# Round 2 — tables on tablet/laptop, record detail pages, 10 per page (2026-09-30)

**Asked for:** the four tabs (Payments ledger, Settlements, Disputes, Audit) show tables on tablet and laptop, not
cards. A click on a row opens a separate detail page. Every list pages at 10 with no inner vertical scroll, and phone
cards carry only the essential fields. "All transactions" moves to 10/page, unbounded, in the same pass.

## Decisions

| # | Decision | Rule |
|---|---|---|
| 3 | Tables from `md` (was `2xl`); secondary columns join at `xl` (`hidden xl:table-cell`), so a tablet width does not need a sideways scroll. Cards only below `md`. | §5.3 |
| 4 | Every ledger list is `bounded={false}` at 10/page: the table grows with the page, with no scroll well of its own. Supersedes Decision 2's 25/page for this route. | §5.7 |
| 5 | Each record opens its own page instead of expanding inline. Phone cards are one link with identity · key figure · status · date, and nothing else. | §5.3 |
| 6 | Merchant detail → Settlements ("Our batches") keeps its inline select-and-expand: `BatchReconciliationSection` navigates only when no `renderBatchPayments` is passed. | — |

## Work items

- [x] Server: `getPlatformPaymentById` (payments.ts; select + mapper lifted into `PAYMENT_SELECT`/`mapPaymentRow`), `getPlatformSettlementBatchById` (the batch RPC narrowed to the batch's merchant + business date), `getPlatformChargebackById` (enrichment lifted into `enrichChargebackRows`), `getPlatformPaymentAuditLogById`. All use the list's permission, and out-of-scope records read as not found.
- [x] Hooks: `usePlatformPayment`, `usePlatformSettlementBatch`, `usePlatformChargeback`, `usePlatformPaymentAuditEvent`
- [x] `routes.ts`: tab + detail hrefs in one place; `page.tsx` keeps the tab in `?tab=` so Back lands on it
- [x] Primitives: `RecordLinkCard` (link, or toggle button for in-place hosts), `RowLink` (the row's keyboard focus stop), `detail-primitives.tsx` (`DetailRow`, `DetailUnavailable`, `DetailPageSkeleton`)
- [x] Payments ledger / Settlements / Disputes / Audit lists converted (tables `md`+, `xl` columns, 10/page, unbounded, row → detail, minimal phone cards)
- [x] `SettlementBatchPanel.tsx`: the selected-batch block (export, manual batchout, linked payments at 10/page) extracted; used by the batch detail page and the merchant page's inline mode
- [x] Detail pages: `payments/[paymentId]` (ledger facts + the existing `TransactionDetailInlinePanel`), `settlements/[batchId]` (tiles, facts, linked payments), `disputes/[chargebackId]` (facts + the three existing tiles; `?from=disputes` sends Back to `/manage/disputes`), `audit/[eventId]` (all fields incl. request path + error message). Each has a `loading.tsx`, so the list skeleton does not flash.

## Behaviour changes

| Where | Change |
|---|---|
| All four tabs + All transactions | 25 → 10 per page; no inner vertical scroll |
| Settlements tab | "Export selected" moved from the toolbar onto the batch page ("Export CSV"); the phone "Info" field picker removed (cards no longer carry optional fields) |
| Disputes | Rows no longer expand; "View in payments" (a `?search=` link) → "Open payment" (the payment's page) |
| Payments ledger | Merchant/order/TSYS-match cell links removed from the row (the row itself is the link); merchant and batch links are on the payment page |
| Batch linked payments | Rows open the payment's page |

## Known limitation
A tab's page number and filters live in React state. Coming back from a detail page keeps the tab (via `?tab=`) but
resets that tab to page 1 with default filters.

## Verification

- [x] `tsc --noEmit --incremental false`: 820 project errors (baseline 820), **0 in any changed or new file**
- [x] ESLint on every changed/new file: only the 8 `react-hooks/set-state-in-effect` findings already in the `HEAD` versions of these files; none new
- [ ] Browser at 375 / 768 / 1024 / 1440, light + dark — **not run** (Chrome DevTools MCP failed to connect). To check: table from 768 without a sideways scroll at 1024; 10 rows with no inner scroll; row → detail → Back to the same tab; `/manage/disputes` row → detail → back to disputes; merchant → Settlements still expands in place; batch detail Export CSV and Manual batchout.

### Round 2 follow-ups (same day)

- [x] Tab toolbars: new `LedgerToolbar` primitive. Filters wrap on the left; Refresh stays pinned top-right and is icon-only on phones (it used to wrap onto a line of its own on Disputes and Audit).
- [x] Detail pages on phones: the inner `sm:grid-cols-2` grids had an auto track below `sm`, so non-wrapping values widened the track and the panel clipped them. Fixed with `grid-cols-1` (`minmax(0,1fr)`) on every detail-page grid and `min-w-0` on `DetailList`.
- [x] Detail page header on phones: subtitle and status badge hidden (status stays in the facts; a Status row was added to the payment and batch pages).
- [x] Settlements table: border and card fill removed (it now matches the other `data` tables); batch payment phone cards show the order number without the word "Order".

---

# Round 3 — payment detail page: one record, said once (2026-09-30)

**Asked for:** `/manage/transactions/payments/[paymentId]` repeated most facts two or three times (the top panels,
then the embedded `TransactionDetailInlinePanel` badges, "Payment Segments", "Transaction Details", "Adjustments &
Reversals"). Remove the repetition; make it organised and clearer.

## Decisions

| # | Decision |
|---|---|
| 7 | The page stops embedding `TransactionDetailInlinePanel` (the "All transactions" expanded row keeps it unchanged). It reads `usePlatformTransactionDetails` itself, still only after the payment row resolves, so the payment-detail access audit fires exactly as before. |
| 8 | Each fact appears once. Status/method/auth/transaction ID/reference → **Payment**; money and platform fee (with % and fee basis) → **Payment › Amounts / Platform fee**; batch/TSYS → **Settlement**; every timestamp and reversal → **Activity**; merchant/location/order/items/totals → **Order**; terminal/processor/EMV/raw responses → **Terminal and processor**. |
| 9 | Only what happened is shown: Activity lists events that have a timestamp or flag (no "Voided: No" boxes); split-payment parts appear only for a split order; technical rows with no value are dropped, and a group with none left says so in words. |

## Work items

- [x] `payment-format.ts`: `entryModeLabel` (moved from the inline panel, which now imports it) and `buildPaymentActivity` (chronological lifecycle + reversals, undated last), with unit tests
- [x] `detail-primitives.tsx`: `DetailRow` gains `copyable` (32px copy button, §13.6) and `emphasis`
- [x] `PaymentDetailSections.tsx`: `PaymentActivitySection`, `PaymentOrderSection`, `PaymentTerminalSection`, loading and failed states
- [x] `payments/[paymentId]/page.tsx`: Payment (2/3) beside Settlement + Activity (1/3); Order; Terminal and processor
- [x] Tests: `payment-format.test.ts` (entry mode, activity order and filtering) and `PaymentDetailSections.test.tsx` (server-rendered sections from the staging refund in the bug screenshots)

## What moved where

| Was | Now |
|---|---|
| Badges "Order / Payment / Method" | Removed; Order and Payment panels already state them |
| "Payment Segments" (one card, repeating method/amounts/card/auth/ref/txn) | Removed for a single payment; a split order lists its parts under Order › "Split across N payments", plus the items this payment covered |
| "Transaction Details" (auth, txn, ref, method, batch, entry, settled, timestamps) | Auth / transaction ID / reference / entry → Payment › Method (copy buttons kept); batch → Settlement; timestamps → Activity; response code → Terminal and processor |
| "Terminal Info" incl. raw Settlement Batch UUID | Terminal and processor › Terminal, unrecorded rows dropped; the UUID is gone (Settlement links the batch) |
| "Items Paid" (identical to the order for a single payment) | Only for a split order |
| "Order Breakdown" + "Order-level Discounts: none recorded" | Order: context facts, a 10-per-page items table (Size folded into the item; Discount column only when used), receipt-style totals with zero discount/service rows dropped |
| "Fees & Surcharges" | Payment › Fees, with the rate and fee basis folded into the ledger fee rows |
| "Adjustments & Reversals" (four boxes, mostly "—") and top-panel Initiated/Captured | Activity: only events that happened, chronological, with reason and who |
| "Payment Timeline" | Terminal and processor › Processor responses (message, code, status change, raw JSON) |

## Found, not changed

- A fully refunded payment still reads **Net deposit $0.01** — `net_deposit` is gross − net fee and ignores refunds (payments.ts mapper). Data, not presentation.
- ~~Void/return "by" is a raw user id~~ — resolved in Round 3b.

## Verification (Round 3)

- [x] `tsc --noEmit --incremental false`: 820 (baseline 820), 0 in changed or new files
- [x] ESLint on every changed/new file: clean
- [x] Vitest `app/manage/transactions`: 9/9
- [ ] Browser at 375 / 1024 / 1440, light + dark — **not run** (Chrome DevTools MCP failed to connect). To check: the 2/3 + 1/3 row with Settlement over Activity; the items table at 375 (Qty + Amount only); copy buttons; a split-payment order.

### Round 3b — no white space, clearer activity (same day)

**Asked for:** "far better but can be better", then "remove the white space" — the Payment panel beside Settlement +
Activity left an empty block under it, IDs truncated, and a refund read as three separate events.

- [x] **Layout:** every panel is full width and splits into columns inside, so no panel sits beside one of different
  height. Order: header → summary strip → Payment → Activity → Order → Terminal and processor.
- [x] **Summary strip** (`Fact`/`FactGrid`, new label-over-value primitives): Merchant · Location · Date · Order · Method · Entry. Replaces
  the header subtitle, so it also shows on phones; the status badge now shows at every width.
- [x] **Payment:** identifiers row (Auth code, Transaction ID, Reference #; full phone width for the long ones) above
  three even columns — Amounts | Fees | Settlement (Settlement panel merged in).
- [x] **Activity:** horizontal track from `lg`, vertical below; times read "Sep 29, 7:34 PM" (full timestamp on hover).
  A refund's return and void (within 2 min) fold into one "Refunded" entry with "Also recorded as a return and a void".
- [x] **Staff names:** `getPlatformTransactionDetails` resolves `voided_by`/`returned_by`/`tip_adjusted_by` against
  `staff_profiles` (`staff_names` map); an unresolved id still shows shortened.
- [x] **Order:** facts (type, table, staff, customer) sit beside the totals instead of above the table.
- [x] **Terminal and processor:** facts left, processor responses right (raw response JSON removed at the user's request); groups with nothing recorded collapse into one
  sentence ("No processor or chip (EMV) data was recorded.").
- [x] Verification: tsc 820 (baseline), 0 in changed files; ESLint clean (transactions.ts 0 = HEAD); Vitest 12/12.
  Browser not run (Chrome DevTools MCP down).

---

# Round 4 — All transactions opens a transaction page (2026-09-30)

**Asked for:** a separate page for transaction details, instead of the All transactions row expanding in place.

## Decisions

| # | Decision |
|---|---|
| 10 | No second detail page. An All transactions row is an `order_payments` row, which `getPlatformPaymentById` loads for any method, so the row opens `payments/[paymentId]?from=transactions` (`paymentDetailHref(id, 'transactions')`). `from=transactions` sends Back to `/manage/transactions` ("Back to transactions"); without it Back stays "Back to payments ledger". Same pattern as `chargebackDetailHref(…, 'disputes')`. |
| 11 | The page adapts to non-card payments (`isCardPayment`): no Entry fact, no processor references/fees/settlement (Payment is one row of Amount · Tip · Charged · Refunded), no Terminal and processor panel. |

## Work items

- [x] `routes.ts`: `TRANSACTIONS_LEDGER_HREF`; `paymentDetailHref(id, from?)`
- [x] Payment page: Suspense wrapper for `useSearchParams`; Back by `from`; card/non-card layouts
- [x] All transactions (`page.tsx`): row click → page (order # is the `RowLink` focus stop); phone card's stretched button → stretched `Link`; "View details"/"Hide details" menu item → "View details" link; expansion state, its reset effect and both inline panels removed
- [x] `TransactionDetailInlinePanel.tsx` is now **unreachable** (no consumers). Left in place like `TransactionDetailSheet.tsx`: it carries uncommitted Round 1 edits, so deleting it is the user's call.

## Verification

- [x] tsc 820 (baseline), 0 under `app/manage/transactions/`
- [x] ESLint: `page.tsx` down from 3 findings at `HEAD` to 1 (pre-existing `setPage` deps warning); other changed files clean
- [x] Vitest `app/manage/transactions`: 12/12
- [ ] Browser — not run (Chrome DevTools MCP down). To check: row click and the order-number link open the page; Back returns to All transactions; a cash payment's page; the Payments tab still says "Back to payments ledger".

---

# Round 5 — one ledger: Payments tab merged into All transactions (2026-09-30)

**Asked for:** "the transactions and payments ledger are the same?" → merge them (option 1: one ledger, a Sales /
Settlement column preset, the two reconciliation filters, Payments tab removed).

Both lists were `order_payments` rows. All transactions was the sales lens (RPC `get_admin_transactions`, hides
pending/failed unless asked); the Payments tab was the processor lens (fees, net deposit, batch, settled, TSYS match).

## Decisions

| # | Decision |
|---|---|
| 12 | **No migration.** Settlement facts are attached per page: `fetchPaymentRowsByIds` (one `order_payments` query for ≤ 10 ids, service role, merchant scope already applied) sets `PlatformTransaction.ledger`. The Payments tab's `PAYMENT_SELECT` + `mapPaymentRow` move to `hq-platform/payment-rows.ts` (`server-only`, since a `'use server'` file may export only async functions). |
| 13 | **Reconciliation filters** (`?unsettled=1`, `?unmatched=1`) skip the RPC (it has no settlement parameters) and use the direct `order_payments` query path: `is_settled = false`, and an anti-join on `luqra_transactions` (`.is('luqra_match', null)`). Both are limited to card methods (enum values listed; the enum takes no `LIKE`). This filters **before** paging, which also fixes the old tab's "Unmatched only filters after paging, so a page can hold fewer rows". |
| 14 | **View preset** `?view=settlement` (default Sales) on the DS-CTL-05 pill rail in the ledger header. A preset only sets the starting columns; the Columns menu toggles all 19. Phone cards show Status · Net deposit · Settled · TSYS match · Batch · Net fee in Settlement. Non-card rows read "—" for every settlement fact. |
| 15 | The two filters show as DS-CTL-03 chips in Settlement view, and in Sales while one is applied (an active filter is never hidden). Clear filters removes them. |
| 16 | **Export is disabled while a reconciliation filter is on** (the export RPC can't apply them); the menu says so. |
| 17 | Payment page Back is always "Back to transactions" → `/manage/transactions`; `?from=` (Round 4) removed. Pending and Failed added to the status filter, and the direct query path now shows them when asked, as the RPC does. |

## Work items

- [x] `payment-rows.ts` (select, mapper, `fetchPaymentRowsByIds`); `payments.ts` imports them
- [x] `transactions.ts`: `ledger` on rows; `unsettledOnly`/`unmatchedOnly` filters; `loadPlatformTransactionPage` (RPC → view → direct query; reconciliation straight to the direct query); pending/failed exclusion only without a status filter
- [x] `page.tsx`: view preset + 5 settlement columns + chips + phone-card fields + export guard; Payments tab and `PaymentsLedger` import removed
- [x] `routes.ts`: `payments` dropped from `TRANSACTION_TABS`; `paymentDetailHref(id)` only
- [x] `TransactionFilterDialog.tsx`: Pending, Failed

## Dropped with the tab (not carried over)

- The tab's own tiles (count, gross, settled %, unmatched count). The ledger's summary tiles remain; they do **not** react to the two reconciliation chips (the summary RPC has no such filter).
- The tab's 30-day default date range (the ledger has no default range).

## Now unreachable (left in place — the user's call)

- `components/PaymentsLedger.tsx`, `getPlatformPayments` (payments.ts): no consumers. Uncommitted Round 1–2 edits.
- `components/TransactionDetailInlinePanel.tsx` (Round 4).

## Verification

- [x] tsc 820 (baseline), 0 under `app/manage/transactions/` or `app/manage/actions/hq-platform/`
- [x] ESLint: `page.tsx` 3 → 1 (pre-existing), `transactions.ts`/`payments.ts` 0 = HEAD, dialog 6 = HEAD, new files clean
- [x] Vitest `app/manage/transactions`: 12/12
- [x] Live read-only queries (service role, the exact select + filters): unsettled 1,082 / unmatched 1,248 / both 1,082; every row card, filtered correctly, 10 per page; enrichment 10/10; the first attempt caught `LIKE` on the enum
- [ ] Browser — not run (Chrome DevTools MCP down; the dev server was also stopped to free disk)
