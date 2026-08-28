# Menu → Categories UI Restructure — Design

**Date:** 2026-08-07
**Scope:** `/dashboard/menu/categories` and the shared popups it owns
**Standard:** [`docs/UI-DESIGN-SYSTEM.md`](../../UI-DESIGN-SYSTEM.md)

---

## 0. Scope override — read this first

`UI-DESIGN-SYSTEM.md` §"Out of scope" line 507 states:

> **`app/dashboard/menu/**`** — separate epic (11.6k LOC). Do not touch.

**The user explicitly overrode this exclusion.** This spec proceeds under that
instruction. Anyone picking this up should confirm with the menu-epic owner
that no in-flight work collides before merging.

When this work lands, `UI-DESIGN-SYSTEM.md` must be updated in two places:

1. The out-of-scope line — `menu/categories` is now converted; the rest of
   `menu/**` is not.
2. §4.5 claims the underline tab style is "fully retired — zero occurrences
   remain." **That claim is false today**: `AddItemToCategoryWizard` has five
   `data-[state=active]:border-b-2` triggers. This spec retires them; the doc's
   claim becomes true again only after that.

### Files in scope

| File | LOC | Legacy §8 hits |
|------|-----|----------------|
| `app/dashboard/menu/categories/page.tsx` | 2147 | 9 |
| `components/dashboard/menu/CategoryFormSheet.tsx` | 969 | 7 |
| `components/dashboard/menu/categories/AddItemToCategoryWizard.tsx` | 1117 | 1 |
| `components/dashboard/menu/LevelIndicator.tsx` | 261 | 3 |
| `components/dashboard/menu/items/BulkPriceAdjustDialog.tsx` | 391 | 0 |
| `components/dashboard/menu/items/BulkDeliveryPriceAdjustDialog.tsx` | 542 | 0 |
| `components/dashboard/menu/ScopeContextStrip.tsx` | 133 | 0 |
| `lib/constants/category-badge.ts` | new | — |

### Explicitly out of scope

- **`NewEditItemFormSheet`** — user-scoped out. It is rendered by this page but
  keeps its current styling.
- **`components/ui/*` primitives** — `dialog.tsx` and `sheet.tsx` already carry
  the correct close button (§4.7). Do not restyle them per page.
- **Any other `menu/**` page.**

### Blast radius

`CategoryFormSheet`, `AddItemToCategoryWizard`, the bulk-price dialogs,
`LevelIndicator`, and `ScopeContextStrip` are shared. Other menu pages that
import them inherit the new look. This was accepted deliberately: a converted
page that opens an unconverted sheet reads as half-finished.

---

## 1. Hard constraints that govern every edit

Restating the four that bite here, because they fail silently:

- **C5** — `--primary` is violet; the brand is blue. This page uses
  `text-primary` for prices and headings throughout, which renders violet. The
  accent is the literal pair `text-[#0C4FD1] dark:text-[#6CA0FF]`.
- **C7** — Tailwind does not scan `.ts`. Every class must be written as a
  literal string in the `.tsx`. `tokens.ts` is a lookup sheet, not a runtime
  mechanism. **This applies to the new `category-badge.ts` module**: it stores
  colour classes, so some `.tsx` must also spell them out — see §6 for how this
  is handled safely.
- **C4** — `bg-card` diverges in dark mode inside the dashboard shell. Dark-mode
  verification must happen inside a real dashboard route.
- **D-05** — `animate-in` on a page root creates a containing block and breaks
  every `sticky` descendant.

---

## 2. Page shell and header

**Archetype §2-A** (list + filters + table). Structural match, no bending.

Current root, `page.tsx:661`:

```tsx
<div className="space-y-6 animate-in fade-in duration-500 w-full min-w-0">
```

This is the D-05 violation, and it is **not theoretical here**. The page has a
sticky selection bar at `page.tsx:867` (`sticky top-0 z-20`) that is currently
dead — the root `animate-in` makes the root a containing block, so the bar
never sticks. Moving the fade into `PageHeader` repairs real behaviour.

| Element | Current | Target |
|---------|---------|--------|
| Root | `div` + root `animate-in` | `<PageShell>` (no animation; D-05) |
| Title | `h2 text-2xl font-bold tracking-tight` (`:666`) | `<PageHeader title="Categories">` → `h1 text-[1.75rem] font-semibold tracking-[-0.02em]` (D-01) |
| Location chip | `<Badge>` with `bg-blue-500/10 text-blue-600 border-blue-200` (`:674`) | `<LocationIndicator isAllLocations locationName>` |
| Subtitle | `<p className="text-muted-foreground">` (`:688`) | `PageHeader subtitle` → `mt-1 text-sm text-muted-foreground` |
| Create CTA | `<Button className="gap-2">` (`:717`) | `PageHeader actions`, `h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm` |

**Conditional copy is preserved verbatim.** The title/subtitle/CTA label all
branch on `isSingleLocation` / `isAllLocations`. That logic is load-bearing
(see the single-location scope work) and must survive the refactor unchanged —
only the container and typography change.

`LocationIndicator` already renders the `isSingleLocation` case correctly by
being omitted; keep the existing `!isSingleLocation &&` guard around it.

`ScopeContextStrip` stays above the header. `EditingContextBanner` stays below
it, keeping its `animate-in fade-in slide-in-from-top-2` — that is a
*component-level* entrance on a non-sticky element, which D-05 permits.

---

## 3. Stat row

`page.tsx:742-811` — four `<Card className="transition-all hover:shadow-md">`,
each with a saturated figure and `text-2xl font-bold`.

Target: **one** `<Panel>` wrapping `<StatRow columns={4}>` with four
`<StatTile>`. Four boxes collapse to one panel with hairline dividers — the
central "hairlines instead of boxes" move.

| Tile | Value | Icon | Meta |
|------|-------|------|------|
| Total Categories | `categoriesList.length` | `Tag` | "All categories" |
| Total Items | `totalItems` | `Utensils` | "Items across categories" |
| Active | `activeCategories` | `Eye` | `isAllLocations ? "Globally active" : "Active at location"` |
| In Menus / With Overrides | conditional | `Sparkles` / `Settings2` | conditional |

Changes beyond the container:

- Figures lose `text-blue-600` / `text-green-600` / `text-purple-600` /
  `text-amber-600`. `StatTile` renders `text-[1.75rem] font-medium
  tracking-[-0.02em] tabular-nums` in foreground colour. **D-03**: emphasis is
  size, not hue.
- Icons move into `StatTile`'s `icon` slot and become muted — they currently
  carry `text-blue-500` / `text-green-500` / `text-purple-500` / `text-amber-500`.
- `tabular-nums` arrives on all four counts (§3.3) — these are live counts that
  change as categories are toggled, so digit jitter is a real artifact.
- Removes 4 × `shadow-md` (§8).

---

## 4. List panel, toolbar, selection bar

`page.tsx:814-1678`: `<Card>` + `CardHeader` + `CardContent` → `<Panel padded>`.
The `CardTitle`/`CardDescription` pair ("All Categories" / "Click a category to
see its items") becomes a section heading + sub-label, not a nested card header.

| Control | Current | Target |
|---------|---------|--------|
| Search (`:826`) | bordered `<Input className="pl-8 w-full sm:w-64">` | `h-9 rounded-full border-0 bg-muted/60 pl-9 text-[0.8125rem] shadow-none focus-visible:bg-background` (DS-CTL-02) |
| Search icon (`:825`) | `left-2 top-2.5 text-muted-foreground` | `pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50` |
| Sort A–Z (`:833`) | `variant="outline" size="sm"` | pill control |
| Select toggle (`:842`) | `variant={isSelectionMode ? "secondary" : "outline"} size="sm"` | pill control; active state keeps `secondary` |
| Bulk-edit trigger (`:897`) | default solid `size="sm"` | pill control |

### Sticky selection bar (`:867`)

```tsx
sticky top-0 z-20 … rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 backdrop-blur
```

- `rounded-xl` → `rounded-2xl` (§3.1 closed set; `xl` is not in it).
- `border-primary/20 bg-primary/5` → inset material `border-0 bg-muted/60`
  plus `backdrop-blur`, so it does not introduce a violet box (C5).
- **Keeps `sticky top-0 z-20`.** It now functions, because §2 removed the root
  `animate-in`. This must be verified by scrolling, not assumed.
- Inner ghost buttons (`Select all`, `Clear`, `Done`) stay ghost — they are
  inside a tinted bar and adding pills there would double the chrome.

The `DropdownMenuContent` needs no `rounded-2xl`: `globals.css` targets
`[data-slot="dropdown-menu-content"]` centrally (§4.6).

---

## 5. Category rows and expanded item list

The largest visual change: today a `<Card>` inside `CardContent` inside a
`<Card>`, with item rows as bordered boxes inside that — four levels of box.

### Category row (`:962`)

| State | Current | Target |
|-------|---------|--------|
| Container | `<Card>` | `<Panel nested>` — tier-2 `rounded-2xl` (D-02 nesting cue) |
| Resting | `hover:shadow-md hover:border-primary/30` | `transition-colors hover:bg-muted/30`; no shadow |
| Expanded | `ring-2 ring-primary shadow-lg` | `bg-muted/30` + hairline above the item list; no ring, no shadow |
| Title (`:1038`) | `font-semibold`, `text-primary` when expanded | `font-semibold`; expanded uses `text-[#0C4FD1] dark:text-[#6CA0FF]` (C5) |
| Chevron chip (`:1308`) | `bg-primary text-primary-foreground` when expanded | `bg-muted/60 text-foreground`; the row tint already signals state |

Removes 2 × `shadow-md`/`shadow-lg` (§8).

Icon tile (`:1023`) keeps `h-16 w-16` but moves `rounded-lg` → `rounded-2xl`
and `bg-primary/10` → `bg-muted/60` (C5 — the violet tint is not the brand).

The `animate-in fade-in slide-in-from-bottom-4` with
`style={{ animationDelay: index * 50 }}` staggered entrance is **removed**. At
50ms per row a merchant with 30 categories waits 1.5s for the list to finish
appearing, and it re-runs on every filter keystroke. This is not a D-05 issue
(no sticky descendant inside a row) — it is removed because it is slow, not
because it is illegal.

### Expanded item rows — `SortableCategoryItemRow` (`:1949`)

Current: `rounded-lg bg-background border` + `hover:shadow-sm
hover:border-primary/30`, dragging = `shadow-lg z-50 ring-2 ring-primary`.

Target — §5 hairline rows:

| Part | Class |
|------|-------|
| Row | `flex items-center gap-1.5 sm:gap-3 border-b border-border/60 px-2 py-3 transition-colors last:border-0 hover:bg-muted/50 sm:px-3` |
| Selected | `bg-muted/50` (not `bg-primary/5`) |
| Dragging | `opacity-30` + `bg-card shadow-sm` — a lifted row needs *some* elevation to read as detached; this is the documented exception, not a stray shadow |
| Price (`:2023`) | `text-sm font-semibold tabular-nums` — drops `text-primary` (C5), gains `tabular-nums` (§3.3) |

`DragOverlayCategoryItemContent` (`:2119`) keeps `shadow-xl` — it is a floating
drag proxy over the page, the one place elevation is doing real work. Its
`ring-2 ring-primary` becomes `border border-border/60`, and its price loses
`text-primary`.

The `max-h-[500px] overflow-y-auto` scroll container (`:1611`) stays — it caps
a genuinely unbounded list.

### Item-order save banner (`:1542`)

`rounded-lg bg-primary/5 border-primary/20 border-dashed` → `rounded-2xl` inset
material. `text-primary` label → `text-[#0C4FD1] dark:text-[#6CA0FF]`. Buttons
become pills.

---

## 6. Badge constants module

`lib/constants/category-badge.ts`, following the shape of the existing
`lib/constants/table-status.ts` and `payment-status.ts` (§4.6b, D-11).

### The bug this fixes

Six badge treatments are written inline with **no `dark:` variant**:

| Location | Class | Dark-mode result |
|----------|-------|------------------|
| `page.tsx:1358` | `text-purple-600 border-purple-200` | low contrast |
| `page.tsx:1369` | `bg-amber-50 text-amber-600 border-amber-200` | near-white fill on dark card |
| `page.tsx:1378` | `bg-green-50 text-green-600 border-green-200` | near-white fill on dark card |
| `page.tsx:1387` | `bg-purple-50 text-purple-600 border-purple-200` | near-white fill on dark card |
| `page.tsx:2031-2036` | `text-green-600 border-green-200` etc. (price source) | low contrast |
| `Wizard:791` | `bg-red-600 hover:bg-red-700` (allergen) | saturated fill — D-11 violation |

`bg-green-50` on `#1c1f26` is a light block on a dark surface. These are broken
today, not merely off-style.

### Shape

```ts
// lib/constants/category-badge.ts
export interface BadgeStyle { dot: string; text: string; bg: string }

export type CategoryScope = 'global' | 'location'
export type CategoryState = 'active' | 'inactive'
export type PriceSource = 'category' | 'location_item' | 'location_category'

export const CATEGORY_SCOPE_STYLES: Record<CategoryScope, BadgeStyle> = { … }
export const CATEGORY_STATE_STYLES: Record<CategoryState, BadgeStyle> = { … }
export const PRICE_SOURCE_STYLES:   Record<PriceSource, BadgeStyle> = { … }

export function priceSourceLabel(s: PriceSource): string  // 'Cat' | 'Loc' | 'L+C'
```

Every value carries both light and dark, e.g.
`bg: 'bg-amber-500/10 dark:bg-amber-400/10'`,
`text: 'text-amber-700 dark:text-amber-300'`.

### C7 — follow the precedent, and verify

`UI-DESIGN-SYSTEM.md` C7 warns that a class living only in a `.ts` file gets no
CSS rule. **The precedent contradicts the general form of that claim**:
`lib/constants/table-status.ts` holds `bg-emerald-50 dark:bg-emerald-900/20`
and friends in a `.ts` file, and those badges render correctly in production
today. `app/globals.css` uses bare `@import "tailwindcss"` (Tailwind v4
auto-source-detection), which does scan `.ts` under the project root.

So the new module follows `table-status.ts` exactly — same file shape, same
`BadgeStyle` interface, same directory. No safelist component is needed, and
inventing one here would depart from a working precedent for no reason.

C7 remains true for the *brand accent literal* — `text-[#0C4FD1]
dark:text-[#6CA0FF]` is an arbitrary-value class and stays written out in each
`.tsx`, exactly as the doc requires. Do not route it through a constant.

**Still verify.** After implementing, confirm each badge class has a matching
rule in compiled CSS. A missing rule is invisible in the DOM — the class is
present and nothing defines it. If any badge does render unstyled, the fallback
is the literal-safelist component, but do not build it pre-emptively.

### Badge markup

```tsx
<span className={cn(
  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
  style.bg, style.text
)}>
  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
  {label}
</span>
```

The `item_count` badge stays a plain `<Badge variant="outline">` — it is a
count, not a status, and gains `tabular-nums`.

---

## 7. `AddItemToCategoryWizard`

Driven by the four screenshots the user supplied. These revealed problems not
visible from reading the file.

### 7.1 Scroll containment — a layout bug, not a token bug

Screenshots 1 and 2 show **four scrollbar tracks**: the left form column
(`:658` `overflow-y-auto`) and the right POS Preview column each scroll
independently, inside a dialog already capped at
`max-h-[min(92vh,960px)]` (`:490`). Screenshot 1 shows the consequence — the
form is cut mid-field at "Description", and the preview pane occupies half the
dialog width to display one placeholder icon.

**Resolution (user-selected): single scroll region, sticky preview.**

- The dialog body becomes **one** `overflow-y-auto` scroll context.
- The left form column drops its own `overflow-y-auto` and grows naturally.
- The POS Preview becomes `position: sticky` with a `top` offset inside that
  single scroll context, so it tracks the form without owning a scrollport.
- On `lg:` and below, the existing stacked (`flex-col`) behaviour is retained;
  sticky only applies at `lg:` and up where the two-column split exists.

**Constraint:** the sticky preview must not be nested inside any element that
gains a `transform` — same containing-block hazard as D-05. No `animate-in` may
be added to the wizard's column wrappers.

### 7.2 Retiring the underline tabs

`:673-688` — five triggers with
`data-[state=active]:border-b-2 data-[state=active]:border-primary`, in a
`TabsList` with `rounded-none border-b bg-transparent`. Visible under "General"
in screenshot 1. §4.5: the underline style is retired.

Target — the literal pill rail (written out, C7):

```tsx
<div className="w-full min-w-0 overflow-x-auto pb-1">
  <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
    <TabsTrigger className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border">
```

Five tabs (General, Pricing, Modifiers, Tax & Fees, Availability) in a
constrained dialog is exactly why `TAB_SCROLLER` exists — the rail scrolls
rather than wrapping.

The **top-level** tabs (`:509`, `grid w-full max-w-sm grid-cols-2`, seen in all
four screenshots) get the same rail treatment.

### 7.3 Dialog shell

`:488` is hand-rolled and violates three rules at once:

```
rounded-[28px]                          → not in the §3.1 closed set
border-slate-200/80                     → §8 banned
shadow-[0_30px_100px_rgba(15,23,42,.26)] → panels have no shadow
overlayClassName="bg-slate-950/40"      → hardcoded slate scrim, no dark variant
```

Target: `rounded-3xl border bg-card`, no custom shadow, and **drop
`overlayClassName` entirely** so `dialog.tsx`'s themed overlay applies.

The close button needs no work — `dialog.tsx` carries DS-CTL-08 centrally
(§4.7), which the screenshots confirm is already rendering correctly.

### 7.4 Remaining wizard surfaces

| Element | Current | Target |
|---------|---------|--------|
| "Creating New Item" banner (`:660`) | `border-emerald-200 bg-emerald-50 dark:…` | `rounded-2xl border-0 bg-muted/60 shadow-none`; heading in brand blue |
| "Adding to:" banner (`:534`) | `rounded-lg border-primary/20 bg-primary/5` | same inset material |
| Search (`:545`) | bordered `<Input className="pl-9">` | `FILLED_INPUT` + `/50` icon |
| Item rows (`:593`) | `rounded-lg border`; selected `ring-1 ring-primary` | hairline rows; selected `bg-muted/50`; keep the `CheckCircle2` |
| `BASIC INFORMATION` (`:695`) | `<Badge variant="outline">` used as a heading | real heading: `text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]` |
| Allergen chips (`:791`) | selected = `bg-red-600` solid | filter-chip recipe, soft tint (D-11) |
| Meal-type chips | outline toggles | same filter-chip recipe |
| Prices (`:620`) | `text-sm font-semibold text-primary` | drop `text-primary` (C5); add `tabular-nums` |
| Footer buttons (`:635`,`:638`) | `sm:min-w-[140px]` squared | pill controls; keep min-widths |
| Colour swatch (`:757`) | `h-9 w-12 rounded border` | `rounded-full border border-border/60` |

Screenshot 3 shows the price column and the "Add 0 Items" button rendering
**violet** — C5 in the wild.

---

## 8. `CategoryFormSheet`

Seven §8 hits.

**Note the name is misleading**: despite "Sheet", this renders a `<Dialog>` /
`<DialogContent>` (`:363`), not a `<Sheet>`. That matters because
`overlayClassName` is a prop on `dialog.tsx` only — `sheet.tsx` has no such
prop. Dropping it here is valid and falls back to `DialogOverlay`'s themed
default.

Its shell at `:366` is the **same hand-rolled string** as the wizard's (§7.3) —
`rounded-[28px] border-slate-200/80 bg-background/95
shadow-[0_30px_100px_rgba(15,23,42,0.26)]`. Apply the identical fix:
`rounded-3xl border bg-card`, no custom shadow.

| Line | Current | Target |
|------|---------|--------|
| `:365` | `overlayClassName="bg-slate-950/40 backdrop-blur-md"` | drop; use `DialogOverlay` default |
| `:366` | `rounded-[28px] border-slate-200/80 shadow-[0_30px_100px…]` | `rounded-3xl border bg-card`, no shadow |
| `:448`, `:464` | `bg-primary text-primary-foreground border-primary shadow-md` | selected state without shadow; brand blue not violet |
| `:570` | `hover:shadow-md` | `hover:bg-muted/50` |
| `:729` | `bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-950/30` | `rounded-2xl border-0 bg-muted/60` |
| `:749` | `text-gray-500` | `text-muted-foreground` |
| `:852` | `rounded-xl border-2 border-border/50 p-4 shadow-lg hover:shadow-xl` | `rounded-2xl border bg-card`; no shadow, no `border-2` |

Plus: inputs → filled where they are searches, footer buttons → pills, section
headings → brand blue.

---

## 9. Remaining shared components

**`LevelIndicator.tsx`** — 3 hits: `text-slate-600` (`:28`),
`bg-slate-100 dark:bg-slate-800` (`:29`), `border-blue-200 dark:border-blue-800`
(`:40`) → `text-muted-foreground`, `bg-muted/60`, `border-border/60`. This is a
shared level/scope indicator; the colour semantics (L1…L5) are preserved by
keeping distinct hues, only re-expressed as dark-safe tints.

**`ScopeContextStrip.tsx`** — token-clean already. Align radius to `rounded-2xl`
and use hairline separation.

**`BulkPriceAdjustDialog` / `BulkDeliveryPriceAdjustDialog`** — token-clean.
Radii to §3.1, inputs to filled where appropriate, footer buttons to pills,
amount figures gain `tabular-nums`.

---

## 10. Behaviour that must not change

The restructure is presentational. These must survive byte-for-byte in logic:

- Every scoping predicate — `isAllLocations`, `isSingleLocation`,
  `canDelete`, `canAddItems`, `prepLocationId` gating.
- All conditional copy branching on location scope.
- dnd-kit wiring: sensors, `SortableContext` ids, `handleDragEnd`,
  `reorderedItemsMap`, `itemOrderChanges`.
- Selection-mode state, including the indeterminate category checkbox.
- Every server action call, `queryClient.invalidateQueries` key, and
  `invalidateOrderOutSync`.
- Prep-station popover mutations.

Two deliberate behavioural changes, both stated above:
1. The sticky selection bar starts working (D-05 fix).
2. The staggered row entrance animation is removed.

---

## 11. Verification

Per user selection: static verification here; the user does the visual pass.

```bash
npx tsc --noEmit
```

Then §8 grep, which must return **zero** for every file in scope:

```bash
rg -n 'bg-gray-|bg-slate-|dark:bg-slate-|bg-white dark:|border-blue-|border-gray-|shadow-lg|shadow-md|text-gray-|text-slate-|#0A5C9E|#0A7AB8|hsl\(var\(' \
  app/dashboard/menu/categories/page.tsx \
  components/dashboard/menu/CategoryFormSheet.tsx \
  components/dashboard/menu/LevelIndicator.tsx \
  components/dashboard/menu/ScopeContextStrip.tsx \
  components/dashboard/menu/categories/AddItemToCategoryWizard.tsx \
  components/dashboard/menu/items/BulkPriceAdjustDialog.tsx \
  components/dashboard/menu/items/BulkDeliveryPriceAdjustDialog.tsx
```

Documented exceptions to that grep, to be justified in the PR rather than
silently left: `DragOverlayCategoryItemContent`'s `shadow-xl` (floating drag
proxy) and the dragging row's `shadow-sm`.

Additional checks:

```bash
# The underline style must be gone
rg -n 'border-b-2' components/dashboard/menu/categories/AddItemToCategoryWizard.tsx

# No violet-as-brand left in scope
rg -n 'text-primary\b' app/dashboard/menu/categories/page.tsx

# C7: badge classes must have real CSS rules — inspect compiled output,
# not just the DOM
```

**Cannot be verified here:** per project notes the local dev Clerk user is an
HQ admin, so `/dashboard/*` redirects to `/manage`. Dark mode inside a real
dashboard route (C4) and the 375px pass are the user's.

### User's visual checklist

- [ ] Light and **dark** mode, inside a real `/dashboard` route (C4)
- [ ] Sticky selection bar actually sticks while scrolling
- [ ] Wizard "Create New" tab: one scrollbar, preview tracks the form, no field cut off
- [ ] Badges legible in dark mode (the `bg-green-50`/`bg-amber-50` cases)
- [ ] 375px — no horizontal body scroll
- [ ] Empty state, loading state, and a category with 50+ items
- [ ] Drag-to-reorder still works and saves

---

## 12. Open risk

`page.tsx` is 2147 lines and the item row / drag overlay sub-components live at
the bottom of the same file. This spec does **not** split the file — that is
structural refactoring beyond a UI restructure, and mixing it with a visual
change makes the diff unreviewable. Worth a follow-up.
