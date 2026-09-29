# `/manage/devices` (Device Registry) — design-system conversion (Family 6, first routes)

**Date:** 2026-09-29 · **Branch:** `Haydar-AdminRestructure` · **Spec:** [`docs/UI-DESIGN-SYSTEM.md`](../../UI-DESIGN-SYSTEM.md)

This PR converts the Device Registry onto Part A and §14. It covers the inventory list, the overview and the device detail page.
It changes presentation only. The one exception is the activity-feed cap, recorded below.

## Scope

| File | Consumers |
|---|---|
| `app/manage/devices/page.tsx` (inventory), `overview/page.tsx`, `[deviceId]/page.tsx` | these routes |
| `components/DeviceRegistryPageHeader.tsx`, `DeviceRegistrySectionNav.tsx` | these routes **and** `/manage/device-catalog` (header only) |
| `components/DeviceRegistryCommandPalette.tsx` | mounted in `app/manage/layout.tsx`; opens on registry routes |
| `components/DeviceStatusTransitionDialog.tsx` | device detail |
| `lib/device-registry/presentation.ts` | `getDeviceStatusClasses` deleted (no callers left) |
| `app/manage/actions/device-registry.ts` | `getAdminDeviceActivity` capped at 50 events |

**Not converted:** the body of `/manage/device-catalog`. It picks up the new shared header and section rail, but its own
cards still use `DeviceRegistryMetricCard` (a `<Card>` with a bordered icon plate). The catalog is the rest of Family 6.

## Work items

- [x] Shell: `PageShell as="div"` on all three routes; `h1` from `PageHeader` (the uppercase "Device Registry" eyebrow is gone)
- [x] Section rail: the bordered `rounded-2xl` box with `rounded-xl` links became the DS-CTL-05 pill rail. The active state is neutral, and the rail scrolls itself to the active pill (§13.2, D-24)
- [x] Inventory KPIs: four `<Card>`s with bordered icon plates became one `Panel > StatRow columns={4}`. A failed summary shows `—` with "Summary unavailable", not `0`
- [x] Inventory table: a `<Card>` with a `border-b` header became `Panel > PanelSection`. Toolbar: muted search field, borderless filter pills with `aria-label`s, and a "Clear filters" pill that appears only when a filter is set
- [x] Inventory table: `variant="data"` at `min-w-[900px]` from `xl`, record cards below `xl` (§5.3, D-23), paged at 10 with `PaginationBar`, and a row-count line when everything fits on one page
- [x] Status everywhere: per-status hue badges (blue, violet, emerald, amber, rose…) became a neutral `<Badge variant="outline">`. On muted surfaces (cards, feed rows, dialog callouts) the status is a plain word
- [x] Money, dates and versions `tabular-nums`; missing values `—` (was `N/A`); `|` separators became `·`
- [x] Inventory empty, error and loading: filter-aware empty sentence, a neutral error well with Retry, and skeletons shaped like the table and the cards
- [x] Overview KPIs: six `<Card>`s became one `StatRow columns={3}`
- [x] Overview charts: `AnalyticsPanel`, `ResponsiveContainer`, `CHART_GRID`/`CHART_TICK`, `AnalyticsTooltip` and `CategoryTick`. Every bar and the area use `var(--brand)` (§6.1). There is a `ChartEmpty` sentence per chart, and zero-value rows are dropped
- [x] Overview warranty watchlist: bordered tiles and the red `bg-red-50` "Expired" tile became a neutral `StatRow`. Warranty is not on the HQ-2 alarm list
- [x] Overview empty and error: a worded panel, and a neutral well with Retry
- [x] Detail: skeleton C. It has a back pill, the serial as `h1`, and an identity row (status, model, category, POS ID, updated) that stays on phones. Below that, `Panel nested` Overview and Linkage use label/value `dl`s, not bordered boxes
- [x] Detail activity feed: bordered cards became `bg-muted/40` rows, capped at `max-h-[min(60vh,32rem)]`, with a worded empty state, an error with Retry, and skeleton rows
- [x] Status dialog: full-screen below `sm`, with the dialog clipping and the body scrolling (§12, §13.1). Blue, amber and red callouts became neutral `bg-muted/60` wells. The selected state is a ring instead of `border-primary bg-primary/5`. `variant="default"`/`destructive` requirement badges (violet in a portal, C5) became words. A failed target load now has a Retry button
- [x] Command palette: bordered icon plates became bare icons; coloured status pills became neutral ones; the `CommandSeparator` line is gone; the shortcut chip is borderless

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | The status pie became a single-series bar chart | It had 9 statuses and `SERIES` has 5 colours. Grouping the tail into "Other" hides the attention states (repair, lost, RMA), and assigning red/amber/green by rank would suggest alarms that are not there. |
| 2 | "Expired" warranty and "Needs attention" stay neutral | Neither is on the closed HQ-2 list (§14.3). If they should be alarms, add them to HQ-2 first, then colour the figure only. |
| 3 | The "Open overview" and "Open catalog" header buttons were kept | They duplicate the section rail, but removing navigation was not requested (lessons: "remove only what was named"). Worth deciding. |

## Behaviour changes beyond presentation

| Where | Change | Why |
|---|---|---|
| `getAdminDeviceActivity` | Each source is limited to 50 rows, and the merged feed is sliced to 50 | §5.7: a scrolling feed is capped on the server. Each source is ordered newest-first, so the result is the exact newest 50. |
| Inventory | Paged at 10 (was unbounded) | §5.7 |

## Found, not changed

- The hue maps in **`lib/constants/device-status.ts`** (`DEVICE_LIFECYCLE_PRESENTATION` styles and `WARRANTY_STYLES`) no longer have any consumer. The merchant `/dashboard/devices` reads only `warranty.label`. They should be removed or neutralised the next time someone touches that file (§4.6b).
- `DeviceRegistryMetricCard` is now used only by `/manage/device-catalog`. Delete it when the catalog converts.
- The dialog's three `useEffect`s call `setState` synchronously. ESLint flags this (`react-hooks/set-state-in-effect`); the issue predates this change.

## Verification

- [x] `tsc --noEmit --incremental false`: 820 project errors (the baseline), **0 in any changed file**
- [x] ESLint on each file compared with its `HEAD` version: no new findings (two fewer). The five remaining findings are pre-existing `set-state-in-effect` errors in the palette and the dialog
- [x] §3.5, §4.6b, §5.5, §8 and §12 greps, plus the `PageShell as="div"` check, return nothing for any changed file
- [ ] Browser check in light and dark at 1440, 1280, 1024 and 375 px was **not run**, because the Chrome DevTools MCP would not connect. Things to look at:
  - the `xl` table/card switch
  - the inventory toolbar wrapping at `md`
  - the warranty `StatRow` inside the narrow `lg` column
  - the dialog going full-screen on phones
  - dark-mode `var(--brand)` bars
