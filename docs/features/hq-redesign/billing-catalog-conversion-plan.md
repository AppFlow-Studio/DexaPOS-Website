# `/manage/settings/billing-catalog` — design-system conversion (Family 6)

**Date:** 2026-09-29 · **Branch:** `Haydar-AdminRestructure` · **Spec:** [`docs/UI-DESIGN-SYSTEM.md`](../../UI-DESIGN-SYSTEM.md)

The page was one `<Card>` holding three inline editors: the station plan, billable services, and device→service mappings. Lines divided them (`border-t` / `xl:border-l`), and status was a bare `<Badge>` (a `bg-primary` fill). The only way to see a service's price was to pick it from a dropdown. This converts the page onto Part A and §14 as a **read view with dialog editors**, the structure chosen with the user. No server action, RPC or schema changes.

## Scope

| File | Change |
|---|---|
| `app/manage/settings/billing-catalog/page.tsx` | `PageShell as="div"` + `PageHeader` replace the hand-rolled `h1` (§14.1, §14.2) |
| `components/billing/SubscriptionCatalogAdmin.tsx` | Rewritten as the read view (three `Panel > PanelSection` blocks) |
| `components/billing/catalog/CatalogFormDialog.tsx` | New. Shared editor shell (§12, §13.1), form group and field, `$`/`%` affixed number input, `MutedSelectTrigger`, `StatusSelect` |
| `components/billing/catalog/PlanPricingDialog.tsx` | New. Create or edit the station plan |
| `components/billing/catalog/BillableServiceDialog.tsx` | New. Create or edit a service |
| `components/billing/catalog/DeviceMappingDialog.tsx` | New. Map a device category to a service |
| `components/billing/catalog/catalog-format.ts` | New. Labels and input parsing (logic only, no classes, C7) |

Reuses `CardField`, `CardFields`, `CardGridEmpty`, `LoadError`, `RecordCardSkeletons` and `TableEmptyRow` from `app/manage/transactions/components/ledger-primitives.tsx`.

## Work items

- [x] Shell: `PageShell as="div"`, `PageHeader` (subtitle drops below `sm` by itself)
- [x] Station plan: `Panel > PanelSection` with a four-tile `StatRow` (base price, included stations, each extra station, card surcharge). The plan name, code and Inactive word are the caption, kept on phones because they are scope (§13.4). A plan picker appears only when there is more than one plan. The empty state says "No station plan yet" and offers Create plan, which seeds the same defaults as before
- [x] Services: a `variant="data"` table (Service + mono code, Category, Pricing, Monthly, Included, Extra unit, Card surcharge, Status) at `min-w-[900px]` from `xl`, record cards below (§5.3, D-23), paged at 10 with `PaginationBar`, and a count line when it fits one page (§5.7)
- [x] Services now load with `getBillableServices(true)`, so an inactive service stays listed instead of vanishing when it is switched off (decision 2)
- [x] Device billing: one row per known device category plus any extra mapped category. "Not mapped" is said in words, and a mapping to a code no longer in the catalog reads "· not in catalog". Table from `lg`, cards below
- [x] Status: "Active" / "Inactive" as `Badge variant="outline"` in tables and plain text on cards (§4.6b, §3.5)
- [x] Editors: centred `Dialog`, full-screen below `sm`. The content clips and the body scrolls, with no header or footer rules (§5.5, §12). Groups are `h3`s separated by spacing. Every editor says "Invoices already issued keep their prices", which the old card description said and phones no longer see in the subtitle
- [x] Controls: muted borderless inputs and selects (§4.2). `SelectTrigger` is still bordered (§11), so `MutedSelectTrigger` spells out the material
- [x] Loading: `StatTile isLoading`, a single loading row in each table, card skeletons below the breakpoint. Error: a neutral `LoadError` well with Retry (§4.9)
- [x] Data: `useQuery(['hq-billing-catalog'])` replaces the `useTransition` + `useEffect` loader. Editors remount per open (a `key`) instead of resetting in an effect. ESLint on the files is at 0 findings, down from 3 `set-state-in-effect` errors at `HEAD`

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Read view + dialog editors instead of restyled inline forms | Chosen by the user. Prices are visible side by side, and editing follows §12. |
| 2 | Inactive services are listed | A table with a Status column where switching a service off makes its row disappear is misleading. The RPC already supports `p_include_inactive`. The device-mapping picker labels inactive services "· Inactive". |
| 3 | Active/Inactive is a `Select`, not a `Checkbox` or `Switch` | Both primitives fill their checked state with `--primary`, which is violet inside a dialog portal (C5). A state is a word (§4.6b). |
| 4 | Plan labels are "Base price" / "Each extra station" (was "First Station Price" / "Additional Station Price") | The SQL charges `base_price_monthly + overage × per_extra_station_price`, where overage is stations beyond `included_stations`. With more than one included station, "first station" was wrong. |

## Verification

- [x] ESLint on changed files: 0 problems (`HEAD`: 3 errors)
- [x] §3.5, §4.6b, §5.5, §8, §12 and C8 greps: no hits in changed files
- [ ] `tsc --noEmit --incremental false`: see the handoff note
- [ ] Browser check (light/dark, 1440/1280/1024/375). Not done: the chrome-devtools MCP failed to connect this session

## Re-audit 2026-10-02: D-25 to D-29

The page, its dialogs and every view were audited again against the rules added after the conversion. Colour, lines, legacy classes, panels and `PageShell as="div"` still conformed. The gaps came from the newer table, card, loading and phone rules.

| Rule | Gap | Fix |
|---|---|---|
| D-25, §5.7 | Both tables used the default `bounded` cap (an inner scroll well with a sticky header). Service rows were two lines tall (name over code). | `bounded={false}`, `table-fixed`, one line per row. The code has its own column from `2xl` and sits in the name's tooltip below that. |
| D-26, §5.3 | Services switched to cards below `xl` and devices below `lg`, both with an unprefixed `min-w-*`. | The table shows from `md` and the cards below `md`. Columns are tiered: service, monthly and status are essential, pricing and extra unit join at `lg`, included and card surcharge at `xl`, category and code at `2xl`. Every device column is essential. |
| D-27, §5.3 | The service card carried the code and six pairs. | Name and status, then Monthly, the same set as the essential columns. The editor shows the rest. |
| D-29, §4.10 | No `loading.tsx`. Tables showed "Loading services…" text, and the cards reused a four-pair skeleton. The save button spun a `Loader2`. | `CatalogPanelsSkeleton` (in the new `catalog/CatalogTable.tsx`) draws the three panels in their final shape from the same column tiers as the tables. The route's new `loading.tsx` and the in-page loading state both render it. A busy save reads "Saving…". |
| §13.4 | The "Per month" unit on Base price and Each extra station was hidden on phones. | `showMetaOnMobile`. The base-price meta is now "Per month", since the Included stations tile already says what it covers. |
| §13.6 | The phone actions (Edit pricing, New service, Create plan, the plan picker, the dialog footer) were 32–36px. | `max-sm:h-11`, or `max-sm:min-h-11` on the select trigger (§14.7 trap 9). Its inert `h-9` was removed. |

**Found, not changed (central):**
- A default `Button` in a dialog renders violet, because portals sit outside `.dashboard-sidebar-theme` (C5). This affects every dialog in the app, so it belongs in `button.tsx` or `globals.css`, not in this page.
- `SelectTrigger` is still bordered (§11), so `MutedSelectTrigger` stays.

**Verification:** ESLint 0 problems. The §3.5, §5.5, §8, §4.10, §5.7 and C8 greps are clean. The one `max-h` hit is the dialog's own height. `tsc` results are in the handoff. The browser check is still open: the chrome-devtools MCP failed to connect.
