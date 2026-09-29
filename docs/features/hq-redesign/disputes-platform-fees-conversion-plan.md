# `/manage/disputes` + `/manage/platform-fees` — design-system conversion (Family 4)

**Date:** 2026-09-29 · **Branch:** `Haydar-AdminRestructure` · **Spec:** [`docs/UI-DESIGN-SYSTEM.md`](../../UI-DESIGN-SYSTEM.md)

Converts the TSYS Disputes route and both Platform Fees routes onto Part A and §14, following the
[`/manage/transactions` record](transactions-conversion-plan.md). The work only changes how the pages
look. Queries, actions, URL params and permissions behave as before, except for the fixes listed below.

## Scope (reachable files)

| File | Consumers |
|---|---|
| `app/manage/disputes/page.tsx` | route (renders the already-converted `ChargebacksSection`) |
| `app/manage/platform-fees/page.tsx` | route |
| `app/manage/platform-fees/[merchantId]/page.tsx` | route |
| `components/platform-fees/*` | these two routes only (grep-verified). `kpi-strip.tsx` deleted; `StatRow`/`StatTile` replace it. |

Reuses the `/manage/transactions` `ledger-primitives` (`LoadError`, `CardField(s)`, `TableEmptyRow`,
`CardGridEmpty`, `RecordCardSkeletons`) rather than a third copy of the record-card recipe (§11).

## Work items

**Disputes**
- [x] `PageShell as="div"` + `PageHeader`; drop root `animate-in` / `overflow-x-hidden`
- [x] 4 `<Card>` KPIs → one `Panel` with `StatRow columns={4}`; no tinted icons, no red figure; `—` + "Couldn’t load" on error
- [x] Urgent meta "Deadline within 7 days" → "Deadline within 72 hours" (the server cutoff is 72h, `transactions.ts:2501`)
- [x] "Total in dispute" says when it only covers the first 200 disputes (the query is capped at 200)

**Platform Fees overview**
- [x] `PageShell as="div"` + `PageHeader` (Export CSV as a pill action); breadcrumb dropped
- [x] Range presets: neutral pill rail (§4.5), `aria-pressed` + full-name `aria-label`, 44px on phones; date range stays visible on phones (scope)
- [x] `KpiStrip` (`Card` + `divide-y/x`, red Refunded figure) → `StatRow columns={3}` of 5 `StatTile`s
- [x] Real zero shows `$0.00`; only unknown (avg with no payments, no data) shows `—` (§4.9)
- [x] Error: neutral `LoadError` well with Retry, not a destructive-tinted box
- [x] Fee trend: `var(--brand)` not `var(--primary)`; `CHART_GRID`/`CHART_TICK`/`AnalyticsTooltip` (clears a Recharts `Formatter` TS error); month-aware date ticks; zero-filled days; `isEmptySeries` + `ChartEmpty`
- [x] Composition: `Panel > PanelSection`; bar and swatches in chart colours (brand / muted), no `bg-primary`, no red figure, legend swatches now match their segments; worded empty
- [x] Merchants table: `Panel > PanelSection`, `variant="data"`, paged 10, record cards (links) below `xl`, avatar hidden below `sm`, no `border-b/t`, filter-aware empty copy
- [x] Dead footer link (`href="#"` repeating the KPI) removed

**Platform Fees merchant detail**
- [x] `PageHeader` with back pill; identity line (id · locations · type · status) as a subtitle kept on phones; avatar dropped from the header
- [x] "View merchant" → `/manage/merchants/{id}`; `Button asChild`, not a `<button>` inside an `<a>`
- [x] Tabs → pill rail with the §13.2 rail-scroll recipe; counts are plain `tabular-nums` text
- [x] Overview: trend + top locations pair (chart and list, `items-start`); top-location bars in the brand series colour; recent activity feed with neutral dots and no rail
- [x] Locations table: `variant="data"`, paged 10, cards below `xl`, all-location totals as a line under the table instead of a tinted row
- [x] Payments table: `PaginationBar` (server-paged, 10/page), status filter as a pill rail, cards below `xl`, neutral card-network and status pills, `LoadError` with Retry
- [x] Fee configuration: `Panel > PanelSection` ×2, neutral status pills, no `border-b/t`, paged 10 (3 short columns, no `min-w`, so it may share a row — §5.6)

**Docs**
- [x] §14.5 adoption row updated; this record completed. No HQ-2 additions: nothing on these pages is coloured as an alarm (the 72-hour chargeback callout inside `ChargebacksSection` was already listed).

## Behaviour changes beyond presentation

| Where | Change | Why |
|---|---|---|
| Payments table | 25 → 10 per page; `PaginationBar`; the page resets when the date range changes | §5.7; previously a shorter range could leave the view past the last page |
| Merchant detail | "View merchant" goes to `/manage/merchants/{id}` | The old `/manage/merchants?id=` landed on the list: that page never reads `id` |
| `Money` | Rounds to whole cents before splitting | An unrounded value (the per-payment average) of `2.996` rendered as `$2.100` |
| `Money` callers | Zero amounts show `$0.00`, not `—` | §4.9: a real zero is `0`; `—` is kept for unknown |
| Disputes, Urgent tile | Meta says 72 hours, not 7 days | It is the same `urgentCount` the 72-hour callout uses |
| Overview footer | Removed | Its link was `href="#"` and it repeated the Net platform fee tile |
| Merchants table | The whole row opens the merchant, not only the name | The row already showed a pointer cursor and chevron |

## Found, not changed (data or logic, out of scope for a UI pass)

- **`fetchFeeRows` swallows query errors** and returns `[]`, so a database failure renders as "No fee activity in this period" instead of the error well. The error well only shows for thrown errors (e.g. permissions).
- **Composition "Net collected" ≠ "Net platform fee".** Composition subtracts all refunds (card + tip) from the card surcharge only; the Net tile is card + tip fees − refunds. They differ whenever tip fees exist.
- **"Total in dispute"** sums at most 200 rows client-side. It is now labelled when partial; a server-side SUM would make it exact.
- **`PLATFORM_DEFAULT_DUAL_PRICING_PCT = 3.5`** is hard-coded in the merchant page rather than read from settings.
- **Range presets** are computed in local time while the server buckets days in UTC, so the first and last day of a range can be partial for users away from UTC. Pre-existing.

## Verification

- [x] `tsc` scoped to the 13 changed files (project `tsconfig` via `extends`, exact `files` list): **0 errors in changed files**. The only error in the closure is the pre-existing `app/dashboard/actions/audit-logs.ts:482`, which is in the baseline.
- [x] Full `tsc --noEmit --incremental false`: 833 against a baseline of 822. **This change is net −1** (the `fee-trend-chart` `Formatter` error is gone), with 0 errors in changed files. The other +12 comes from files outside this change that were edited in parallel in the same tree: `app/manage/dlq/DeadLetterQueueTable.tsx` (+4, an in-progress DLQ conversion) and the root `valor-*.ts` scripts (+8).
- [x] ESLint on every changed file: no findings. One `react-hooks/set-state-in-effect` finding was fixed by deriving the page from the range instead of resetting it in an effect.
- [x] §3.5, §4.6b, §5.5, §8, §12 greps reviewed for every changed file. The only colour is the brand series colour on two data bars (composition, top locations) and their legend swatch (§3.5 use 2). No dividers, legacy classes, sheets, bare badges or root `animate-in`. All three routes use `PageShell as="div"`.
- [ ] Browser: light + dark at 1440 / 1280 / 1024 / 375. **Not run**, because the Chrome DevTools MCP failed to connect this session. Worth checking: the `xl` table/card switch on all three tables, the range rail and date text at 375px, and the composition bar in dark mode.
