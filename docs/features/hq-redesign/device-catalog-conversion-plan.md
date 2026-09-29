# `/manage/device-catalog` — design-system conversion (Family 6)

**Date:** 2026-09-29 · **Branch:** `Haydar-AdminRestructure` · **Spec:** [`docs/UI-DESIGN-SYSTEM.md`](../../UI-DESIGN-SYSTEM.md)

The catalog already had the shared registry header and section rail from the [devices conversion](devices-conversion-plan.md). This converts its body onto Part A and §14. Presentation only: no query, action or schema changes.

## Scope

| File | Change |
|---|---|
| `app/manage/device-catalog/page.tsx` | Body, form dialog and delete confirm converted |
| `app/manage/devices/components/DeviceRegistryMetricCard.tsx` | Deleted. The catalog was its last caller. |

Reuses `FilterSelect`, `LoadError`, `RecordCard`, `CardFields`, `CardField` and `RecordCardSkeletons` from `app/manage/transactions/components/ledger-primitives.tsx`, as `/manage/dlq` and `/manage/support` do.

## Work items

- [x] Shell: `PageShell as="div"` replaces the hand-rolled `overflow-x-hidden` wrapper (§14.1)
- [x] KPIs: four `DeviceRegistryMetricCard`s (a `<Card>` with a bordered icon plate) became one `Panel padded > StatRow columns={4}`. A failed load shows `—` with "Catalog unavailable", not `0` (§4.9)
- [x] Registry note: the dashed `<Card>` became a neutral `rounded-2xl bg-muted/60` callout (§3.5)
- [x] Toolbar: muted search field with the `/50` icon; category and status filters as borderless `FilterSelect` pills with `aria-label`s; a "Clear filters" pill only when a filter is set (§5.2)
- [x] List: the collapsible grouped list in a `<Card>` with `max-h-[70vh]` scroll well, `<Separator>`s and a `border-b` sticky group header became `Panel > PanelSection` holding a `variant="data"` table (Model, Category, Specs, Unit cost, Monthly fee, Status). Rows sort in category order, so the grouping survives as order (decision 1)
- [x] Table at `min-w-[900px]` from `xl`; record cards below `xl` (§5.3, D-23); paged at 10 with `PaginationBar`, plus a row-count line when it fits one page (§5.7)
- [x] Status: "Active" and "Discontinued" are words in a neutral pill (table) or plain text (cards). Previously only discontinued rows were marked
- [x] Product image plates: borderless `rounded-2xl bg-muted`, hidden on phone cards (§13.4)
- [x] Money `tabular-nums`, right-aligned; missing values `—` (was `N/A`)
- [x] Empty, error, loading: filter-aware empty sentence with Clear filters / Add device; a neutral error well with Retry (was red text); skeletons shaped like the table and the cards
- [x] Form dialog: full-screen below `sm`, content clips and the body scrolls (§12, §13.1); the three `<Separator>`s, the `border-t bg-muted/30` footer and the uppercase eyebrow labels are gone — sections are `h3`s separated by spacing (§5.5); image preview plate borderless; selects on the muted material
- [x] Delete confirm stays a centred card (§13.1); its destructive button is the page's one colour (§3.5 use 3)

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | The grouped, collapsible list became a flat paged table sorted by category | §5.7 allows a grouped list only with every group closed by default, which would open the catalog on seven headers and no models. The category filter and the category sort already give the grouping; a table matches the converted inventory page next door and pages cleanly at 10. |
| 2 | "Open inventory", "Open overview" and "Go to registry" were kept | They duplicate the section rail, but removing navigation was not requested (lessons: "remove only what was named"). Same call as the devices conversion. |

## Verification

- [x] `tsc --noEmit --incremental false`: 820 project errors (the baseline), **0 in any changed file**
- [x] ESLint on the page, compared with its `HEAD` version: the same single finding, the pre-existing `set-state-in-effect` in the form dialog's reset effect
- [x] §3.5, §5.5, §8 and §12 greps return nothing for the page. No `ui/card`, `rounded-lg`, `rounded-md`, `rounded-xl`, `border-dashed` or `N/A` remains. The only colour is the destructive Delete (§3.5 use 3)
- [ ] Browser check in light and dark at 1440, 1280, 1024 and 375 px was **not run**, because the Chrome DevTools MCP would not connect. Things to look at:
  - the `xl` table/card switch, and the Specs column truncating at 240px
  - the toolbar wrapping at `md`
  - product images in the 40px plate (`next/image` still needs the host in `images.remotePatterns`, as before)
  - the form dialog full-screen on phones, with the footer pinned and the body scrolling
  - dark mode inside the route (C4)
