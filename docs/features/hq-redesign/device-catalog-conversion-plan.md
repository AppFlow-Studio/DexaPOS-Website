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
| 2 | ~~"Open inventory", "Open overview" and "Go to registry" were kept~~ **2026-10-03:** at the user's request, the section rail and the "Open inventory" / "Open overview" buttons are removed. The page uses a plain `PageHeader` whose only action is Add device. "Go to registry" in the callout stays, since it was not named. | The rail and the two buttons duplicated the sidebar's Device Registry and Device Catalog entries. The parallel devices session had already removed the search trigger (⌘K still opens the palette) and hidden the rail on the inventory, overview and device pages. |

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

## Follow-up 2026-10-02 — onto D-25–D-29

An audit against the rules added after this conversion (D-25 table height, D-26 one breakpoint, D-27 phone cards, D-29 loading) found the gaps below. Scope stays `app/manage/device-catalog/**`. The shared registry rail and command palette live in `app/manage/devices/components/`, which a parallel session is converting, so they are not touched here.

- [x] Table: `bounded={false}` (no inner scroll), shown from `md` with cards below, `table-fixed` with tiered columns and no `min-w` (§5.3, §5.7)
- [x] Rows one line: model name and manufacturer on one truncating line; the image plate shrinks to `size-8` and joins at `lg` (§5.7)
- [x] Phone card: model, manufacturer and status lead; Category, Unit cost and Monthly fee pairs; SKU and specs dropped (in the edit dialog) (D-27)
- [x] Empty state in the footprint it replaces: a table row from `md`, a card-grid cell below (§4.9)
- [x] Loading: one `CatalogListSkeleton` used in-page and by a new `loading.tsx` page skeleton; no "Loading…" text; a `role="status"` line (§4.10, D-29)
- [x] Delete confirm on the shell `ConfirmDialog` instead of `AlertDialog` (bordered, `slide-in-from-*`) (§12, §13.1)
- [x] Form dialog: "Active in catalog" becomes a status `Select` (C5, as billing-catalog decision 3); spec switches and checkboxes keep their control but fill neutral (`bg-foreground`) when on, since `--primary` is violet in the portal
- [x] Phone touch targets: Add device and the card's Edit are `h-11` below `sm` (§13.6)

### Decisions (follow-up)

| # | Decision | Why |
|---|---|---|
| 3 | ~~Essential columns are Model, Unit cost, Status and actions, and the phone card carries one more pair than the `md` table~~ Superseded the same day by 4 | The tablet table then lacked Category and Monthly fee, which the phone card shows. §5.3 asks for the two to match. |
| 4 | The tablet table shows the phone card's fields by stacking. Below `lg`, the Model cell adds the category as a muted second line, and the price cell (headed "Price") adds the monthly fee. From `lg`, Category and Monthly fee are columns and rows are one line. The image plate joins at `xl` and Specs at `2xl`. Recorded as UI-DESIGN-SYSTEM §14.3 HQ-6. | At `md` the well is about 414px (464px minus the panel's padding). Category, Unit cost, Monthly fee, Status and the actions menu need about 420px as separate columns, so one-line rows cannot carry the card's fields. Two-line rows only below `lg` keep laptops on one line, which is what §5.7 protects. Ten rows come to about 640px. Specs moved from `xl` to `2xl` because at `xl`, with the image plate, Model kept about 120px. Without Category, a phone user could not tell a tablet from a printer, so the card keeps it. SKU and specs drop as secondary fields. |
| 5 | Spec flags keep `Switch`/`Checkbox`, with a neutral checked fill set locally | They are feature flags, not states, so a select would be heavier for no gain. Recolouring the shared primitives would change every page, which is a §11 decision, not this page's. |
| 6 | The catalog has its own `components/skeletons.tsx` | The registry header skeleton in `app/manage/devices/components/skeletons.tsx` is not exported, and that file belonged to the parallel devices session. The two can merge once it is exported. |

### Verification (follow-up)

- ESLint on `app/manage/device-catalog`: the same single pre-existing finding (`set-state-in-effect` in the form reset)
- §3.5, §8, §12 and §4.10 greps clean. §5.5 finds only the `DropdownMenuSeparator` above Delete, kept to match the users and organizations menus
- The shared rail (`useRailAutoScroll`, `no-scrollbar`) and the palette's skeleton search state were fixed by the parallel devices session, so the audit's shared items are closed
- [ ] Browser check not run: the Chrome DevTools MCP failed to connect. To check: two-line rows at 768px and one-line rows from 1024px (does "Price" read clearly with the "/mo" line under it?), then the 768/1024/1280/1536px column tiers with no sideways scroll and no inner scroll; the 375px card; the switch/checkbox fill in dark mode inside the dialog

## Follow-up 2026-10-03 — user review

- [x] Phone card: the Edit button is gone (Edit stays in the actions menu), the menu moves to the top right, and Status becomes the fourth pair beside Monthly fee. This is a user decision that departs from D-27's "identity and status lead": the status still shows on the card as a word, so nothing drops below `sm` (§13.4).
- [x] Add/edit dialog on phones: there was a second vertical scrollbar, with empty space below the buttons. Cause: Radix `Select`, `Switch` and `Checkbox` render hidden native inputs for form submission (`position: absolute`). Their containing block was the dialog, not the scroll body, so they sat at their unscrolled offset (about 1000px down for Status) and stretched the dialog's scroll height. On phones the primitive's `max-sm:overflow-y-auto` let the dialog scroll to them. Fix: the scroll body is `relative`, and the dialog adds `max-sm:overflow-hidden`; `w-screen` became `w-full`.
- [x] Footer buttons centred (`sm:justify-center`) in the add/edit dialog and the delete confirm. `ConfirmDialog` gained an optional `footerClassName` prop for this; its 13 other callers are unchanged.
- [ ] Browser check still not run (Chrome DevTools MCP not connected)
