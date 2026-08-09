# Merchant Dashboard — UI Design System

## §0 Read me first

- This is the standard for converting merchant-dashboard pages. Keep it open while you work.
- **If this doc and a shipped page disagree, the doc wins.** Seven pages follow the design language; ~60 do not. Copying a neighbour is the most likely way to go wrong — check the adoption table below first.
- The language in one line: flat surfaces, one rounded container per page section, hairlines instead of boxes, brand-blue section headings, and large `tabular-nums` figures carrying the emphasis.

**Shell adoption — copy the ✅ pages when converting.**

| Page | Layout components | Tokens |
|------|-------------------|--------|
| [`orders/reports`](../app/dashboard/orders/reports/page.tsx) | ✅ `PageShell` `PageHeader` `LocationIndicator` `Panel` | ✅ |
| [`orders/analytics`](../app/dashboard/orders/analytics/page.tsx) | ✅ `PageShell` `PageHeader` `LocationIndicator` | ✅ |
| [`locations/[id]/settings`](../app/dashboard/locations/[locationId]/settings/page.tsx) | ✅ `PageShell` `PageHeader` (server component) | ✅ |
| [`tables`](../app/dashboard/tables/page.tsx) | ✅ `PageShell` `PageHeader` `Panel` | ✅ |
| [`dashboard`](../app/dashboard/page.tsx) (home) | ❌ hand-rolled | ✅ |
| [`locations`](../app/dashboard/locations/page.tsx) | ❌ hand-rolled | ✅ |
| [`orders`](../app/dashboard/orders/page.tsx) | ❌ hand-rolled | ✅ |
| [`orders/[orderId]`](../app/dashboard/orders/[orderId]/page.tsx) | ❌ hand-rolled | ✅ |

The four ❌ pages conform on **tokens** (h1, accent, radii, muted stat labels) but still hand-write their layout, so a change to `PageHeader` will not reach them. Each carries header furniture that needs its own conversion PR rather than a mechanical swap:

- **`orders`** — sparkline KPI tiles, preset range pills, two `OverviewLinkButton`s
- **`orders/[orderId]`** — 1,214 lines; back control is the icon-only D-04 exception, not the default pill
- **`dashboard`** (home) — no `h1` at all (greeting hero), and a sticky range bar that D-05 exists to protect
- **`locations`** — separate single-location and multi-location header branches

`orders/reports` and `orders/analytics` were safe to convert because their headers were already an exact structural match for `PageHeader`.

> ⚠️ **Not yet verified in a browser.** The three ✅ pages are confirmed by compiled-CSS inspection, HTTP 200, and `tsc` — not by looking at them. The local dev Clerk user is an HQ admin, so `/dashboard/*` redirects to `/manage`. Give them a visual check in both themes before merging.

**Prefer components over class strings.** `import { PageShell, PageHeader, Panel, PanelSection, StatTile, StatRow } from '@/components/dashboard/shell'`. A copy-pasted class string in 60 files makes the next design change a 60-file edit; an import makes it one.

---

## §1 Hard constraints

These fail **silently**. Nothing in review or CI catches them.

### C1 — There is no `tailwind.config.js`
Tailwind v4, CSS-first. All tokens live in [`app/globals.css`](../app/globals.css) under `:root`, `.dark`, and `@theme inline`. Creating a config file does nothing at all.

### C2 — Never wrap a token in `hsl()`
Tokens are `oklch()` and hex. `hsl(var(--border))` is invalid CSS, and Recharts **silently falls back to its own defaults** rather than erroring — this is what once made axis labels render dark red.

```diff
- stroke: "hsl(var(--border))"
+ stroke: "var(--border)"
```

**Detect:** `grep -rn "hsl(var(--" app components lib`

*Currently **90 occurrences across 21 files** — every one is a chart rendering in a fallback colour rather than the intended token.* Worst offenders: `manage/cash-drawers/components/CashDrawerAnalytics.tsx` (11), `dashboard/reports/cash-drawers/page.tsx` (11), `manage/analytics/page.tsx` (10). Also live in [`lib/orderout/platform.ts`](../lib/orderout/platform.ts) (`SLUG_COLORS.other`, `PLATFORM_COLORS.default`).

Fix these as you convert each page — the replacement is always just dropping the `hsl(...)` wrapper.

### C3 — `useTheme()` does not work
`next-themes` is installed but not wired. Theme is class-based, set by an inline anti-FOUC script in [`app/layout.tsx`](../app/layout.tsx) reading `localStorage.theme`. Read the `dark` class on `<html>`; never `useTheme()`.

### C4 — `bg-card` resolves differently inside the dashboard — in dark mode only
`.dashboard-sidebar-theme` (on `SidebarProvider` in both the dashboard and manage layouts) overrides `--background` and `--card` under `.dark`, producing a three-surface ladder:

| Surface | Dark value |
|---------|-----------|
| Sidebar rail | `#0f1115` |
| Content canvas | `#16181d` |
| Card | `#1c1f26` |

In **light** mode it only sets sidebar tokens, so the divergence doesn't exist there. **An engineer testing in light mode will never reproduce this class of bug.** Always check dark mode inside a real dashboard route.

### C5 — `--primary` is violet; the brand is blue
Never use `text-primary` expecting the brand blue. The accent is `text-[#0C4FD1] dark:text-[#6CA0FF]` — dark blue in light mode, lightened in dark mode because `#0C4FD1` fails contrast on the dark card. A matching `--brand` token exists in `globals.css` for CSS-level use, but the utility class must be written literally in a `.tsx` (see C7).

### C6 — `<Card>` is a coexistence rule, not a ban
`@/components/ui/card` is imported in **277 files** (159 under dashboard). New and converted pages use `Panel` instead. This is **not** a mandate to migrate 277 files — leave unconverted pages alone.

Related: the `.analytics-flat` / `.dashboard-flat` `<style>` blocks de-chrome Cards with `!important`. They are a workaround for pages that predate `Panel`. **Do not add new ones.**

### C7 — Tailwind does not scan `.ts` files — write classes as literals in `.tsx`
A class name that exists **only** inside a `.ts` file (a constants module, a helper) never gets a CSS rule generated. The class still lands in the DOM; nothing defines it; the element silently inherits. A blue heading renders black.

```diff
- // tokens.ts
- export const SECTION_HEADING = 'text-[#0C4FD1] dark:text-[#6CA0FF]'
- // PanelSection.tsx
- <div className={SECTION_HEADING}>

+ // PanelSection.tsx — literal, in the .tsx
+ <div className="text-[#0C4FD1] dark:text-[#6CA0FF]">
```

[`tokens.ts`](../components/dashboard/shell/tokens.ts) is therefore a **reference sheet, not a rendering mechanism** — look up the canonical value there and copy it into your `.tsx`. Referencing a token programmatically is only safe when some `.tsx` also spells the class out literally.

This is also why the brand accent stays as the literal pair `text-[#0C4FD1] dark:text-[#6CA0FF]` rather than a `text-brand` utility: the `--brand` token exists in `globals.css` and is available for CSS-level use, but the class must be written out to be generated.

**Symptom to recognise:** an element that should be styled renders with inherited defaults, and the class is visible in DevTools with no matching rule.

---

## §2 Page skeletons

Four archetypes. Bending one into the wrong shape is how the current drift started.

### A — List + filters + table

```tsx
import { PageShell, PageHeader, Panel, StatRow, StatTile, LocationIndicator }
  from '@/components/dashboard/shell'

<PageShell>
  <PageHeader
    title="Orders"
    subtitle="Track and manage every order across your locations"
    indicator={<LocationIndicator isAllLocations={isAllLocations} locationName={location?.name} />}
  />

  <Panel>
    <div className="px-6 py-6">
      <StatRow columns={4}>
        <StatTile label="Net Sales" value={formatCurrency(net)} meta="vs last week" />
        {/* … */}
      </StatRow>
    </div>
  </Panel>

  <Panel padded>
    {/* toolbar + table */}
  </Panel>
</PageShell>
```

### B — Metrics / report (tabbed)

```tsx
<PageShell>
  <PageHeader title="Reports" subtitle="…" backHref="/dashboard/orders" backLabel="Back to Orders" />

  <Tabs value={tab} onValueChange={setTab}>
    {/* Classes are literal, not {TOKEN} — see C7. */}
    <div className="w-full min-w-0 overflow-x-auto pb-1">
      <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
        {TABS.map(t => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
          >
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>

    {/* one control row governing every tab */}
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <DateRangePicker
        triggerClassName="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
        /* … */
      />
    </div>

    <TabsContent value="…" className="mt-6">
      <Panel padded><SomeReport /></Panel>
    </TabsContent>
  </Tabs>
</PageShell>
```

### C — Detail record

```tsx
<PageShell>
  <PageHeader title={`Order #${order.number}`} backHref="/dashboard/orders"
              backLabel="Back to Orders" actions={<>…</>} />

  <div className="grid gap-6 md:grid-cols-3">
    <div className="space-y-6 md:col-span-2">
      <Panel nested>{/* tier 2 — nested in the grid */}</Panel>
    </div>
    <div className="space-y-6">
      <Panel nested>{/* … */}</Panel>
    </div>
  </div>
</PageShell>
```

### D — Settings / form

```tsx
<PageShell width="narrow">
  <PageHeader title="Location Tax & Banking" subtitle={location.name}
              backHref="/dashboard/locations" backLabel="Back to Locations" />
  {/* stacked cards */}
</PageShell>
```

Live example: [`app/dashboard/locations/[locationId]/settings/page.tsx`](../app/dashboard/locations/[locationId]/settings/page.tsx).

---

## §3 Token reference

⚠️ **Copy these values into your `.tsx` as literal strings.** Do not `className={SOME_TOKEN}` — Tailwind does not scan `.ts` files, so a class sourced only from [`tokens.ts`](../components/dashboard/shell/tokens.ts) generates no CSS rule and the element renders unstyled (C7). The constants exist so there is one place to look up the canonical value, not to be referenced at runtime.

Better still: use the shell **components**, which already have these baked in as literals.

### 3.1 Surfaces — the radius scale (closed set) <sup>D-02</sup>

| Tier | Use | Token | Class |
|------|-----|-------|-------|
| 1 | Top-level page panel | `PANEL` | `rounded-3xl border bg-card` |
| 2 | Nested / detail card | `PANEL_NESTED` | `rounded-2xl border bg-card` |
| 2 | Overlay (dropdown, select, popover) | `OVERLAY` | `rounded-2xl` |
| 3 | Inset well inside a panel | `INSET` | `rounded-2xl border-0 bg-muted/60 shadow-none` |
| — | Section separator | `HAIRLINE` | `border-border/60` |

The tier-1/tier-2 difference is the nesting cue. A card inside a panel must be smaller than the panel containing it.

### 3.2 Typography

| Role | Class |
|------|-------|
| Page `h1` <sup>D-01</sup> | `text-[1.75rem] font-semibold tracking-[-0.02em]` |
| Subtitle | `mt-1 text-sm text-muted-foreground` |
| Section heading | `flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]` |
| Section figure | `mt-1 text-[2rem] font-medium leading-tight tracking-[-0.02em] tabular-nums` |
| Stat label <sup>D-03</sup> | `text-sm text-muted-foreground` |
| Stat figure | `mt-1 text-[1.75rem] font-medium leading-tight tracking-[-0.02em] tabular-nums` |
| Stat meta | `mt-0.5 text-[0.8125rem] text-muted-foreground` |
| Sub-label | `mb-3 text-sm text-muted-foreground` |

### 3.3 Numerals

**Any figure that can change, or that aligns in a column, gets `tabular-nums`.** Without it, digits jitter as values update and columns fail to line up. This includes currency, counts, percentages, durations, and order numbers.

### 3.4 Spacing

| Role | Value |
|------|-------|
| Between top-level blocks | `space-y-6` |
| Section inside a panel | `px-6 py-8` (`SECTION_PADDING`) |
| Panel with free-form content | `px-6 py-6` (`<Panel padded>`) |
| Narrow page cap | `mx-auto max-w-5xl` (`<PageShell width="narrow">`) |

---

## §4 Component recipes

### 4.1 Pill control — `DS-CTL-01`
**Canonical:** `h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm`
**Use when:** date trigger, export button, select trigger, pagination. Pair with `variant="outline"`.
**Never:** a squared `rounded-md` button in a converted page.

### 4.2 Search input — `DS-CTL-02`
**Now in the base component.** `border-0 bg-muted/60 shadow-none focus-visible:bg-background`
plus `rounded-full` are the **defaults** in `components/ui/input.tsx`. A plain `<Input />`
is already correct — do **not** re-declare them at the call site.

**Canonical (search only):** `pl-9` for the icon, plus `h-9 text-[0.8125rem]` if the
field sits in a toolbar. Everything else comes from the base.
**Icon:** `pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50` — note `text-muted-foreground/50`, not `/100`.
**Never:** re-adding `border-0 bg-muted/60 shadow-none` to an `<Input>`; a raw `<input>`
for a text/number/date field (see §11.1).
**Error state:** an invalid field re-gains a destructive border via
`aria-invalid:border aria-invalid:border-destructive` — the fill alone cannot carry it.
**Grep (redundant classes):** `grep -rn '<Input' <file> | grep -E 'border-0|bg-muted/60|shadow-none'`

### 4.3 Filter chip — `DS-CTL-03`
**Canonical:** `rounded-full border-0 bg-muted/60 text-muted-foreground shadow-none hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground` — tinted, borderless, quieter than a pill control.
**Why:** outlined or dashed chips add a second competing set of boxes beside the panel edge.

### 4.4 Back control — `DS-CTL-04` <sup>D-04</sup>
Decision tree:

| Situation | Control |
|-----------|---------|
| There is a parent list page | Ghost pill with label — `<PageHeader backHref=… />` |
| Detail header is crowded with actions | Icon-only ghost `variant="ghost" size="icon"` |
| — | **Never bordered.** |

### 4.5 Tabs — `DS-CTL-05`
**Rail:** `TAB_SCROLLER` wrapping `TAB_RAIL`. **Pill:** `TAB_PILL` (Radix) or `TAB_PILL_BUTTON` + `TAB_PILL_ACTIVE`/`TAB_PILL_INACTIVE` (plain buttons).
**Never:** the underline style (`border-b-4`). It is fully retired — zero occurrences remain.

### 4.6 Overlay content — `DS-CTL-06`
**Canonical:** `rounded-2xl` on `DropdownMenuContent` / `SelectContent` / `PopoverContent`.

**Already applied centrally for Select and DropdownMenu.** Radix portals overlay content to `<body>`, so no ancestor class can reach it — [`app/globals.css`](../app/globals.css) targets the slots directly:

```css
[data-slot="select-content"],
[data-slot="dropdown-menu-content"] { border-radius: 1rem; }

[data-slot="select-content"] [data-slot="select-item"],
[data-slot="dropdown-menu-content"] [data-slot="dropdown-menu-item"] { border-radius: 9999px; }
```

You no longer need `className="rounded-2xl"` on a `SelectContent` or `DropdownMenuContent` — existing ones are harmless, just redundant.

> ⚠️ **`popover.tsx` is not covered.** It ships `rounded-md` and carries **no `data-slot` attribute**, so there is nothing to target. Popover content still needs `rounded-2xl` at the call site until the primitive gains a slot — tracked in §11.

### 4.5b Scoped pill controls — `DS-CTL-10`
For a **dense toolbar app** (the floor-plan editor) built from dozens of small shadcn `Button`s and `Select`s, appending `rounded-full` to every call site is error-prone and always misses some. Apply the shape once with a scoped class instead:

```tsx
<div className="tables-pill-controls …">   {/* editor root, dialog root */}
```

The rule lives in [`app/globals.css`](../app/globals.css) and is **scoped to the class**, so it cannot leak into the rest of the app. Children opt out with `rounded-none`, and containers keep their tier radius via `:not([class*="rounded-2xl"]):not([class*="rounded-3xl"])` guards.

**Use this only when a whole subtree needs it.** For one or two buttons, write `rounded-full` on the button — a scoped class for two elements is indirection without benefit. Never add a page-level `<style>` block for this (C6): the rule belongs in `globals.css` where it is shared and greppable.

### 4.6b Status badge — `DS-CTL-09` <sup>D-11</sup>
**Canonical:** `inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium` + a `BadgeStyle` triple (`dot` / `text` / `bg`).

**Use when:** conveying a record's state — payment status, table status, order status.

Soft tint carries the grouping, a 6px dot carries the colour coding, and the label stays readable in both themes. A saturated `bg-green-500` block at badge size shouts over the flat surfaces around it.

**Colours come from a constants module, never inline.** One `Record<Status, BadgeStyle>` per domain, so a status can't render an unmapped colour:
- [`lib/constants/payment-status.ts`](../lib/constants/payment-status.ts) — `PAYMENT_STATUS_STYLES`
- [`lib/constants/table-status.ts`](../lib/constants/table-status.ts) — `TABLE_STATUS_STYLES`

```tsx
const style = tableStatusStyle(status)
<span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', style.bg, style.text)}>
  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
  {tableStatusLabel(status)}
</span>
```

**Never:** a solid saturated fill (`bg-green-500 text-white`) for a badge, or status colours written inline at the call site.

**Exception — functional colour encoding.** A floor-plan canvas, a heatmap, or a chart legend may use solid fills: those must read at a glance across a dense layout, which a soft tint cannot do. The rule governs *badges*, not data visualisation.

### 4.7 Close button — `DS-CTL-08` <sup>D-10</sup>
**Canonical:** `inline-flex size-8 shrink-0 items-center justify-center rounded-full border-0 bg-muted/60 text-muted-foreground shadow-none transition-colors hover:bg-muted hover:text-foreground`

**Use when:** the ✕ that dismisses a dialog, sheet, or banner.

The same material as the search field (§4.2) — borderless `bg-muted/60`, no shadow — but **circular rather than pill**, because the content is a single square glyph. Visible at rest, not on hover: a close affordance you have to discover by hovering is one users may never find. `size-8` gives a 32px hit target around a 16px icon.

**Already applied centrally.** [`dialog.tsx`](../components/ui/dialog.tsx) and [`sheet.tsx`](../components/ui/sheet.tsx) carry it, so every modal and slide-over in the app already has it — do not restyle their close buttons per page.

**Never:** the old `rounded-xs opacity-70` treatment, or a dismiss that only appears on `group-hover`.

**Exception:** a labelled `✕ Close` button in a footer action row is a regular button, not this recipe (see `ReceiptModal`). Tinted banners may swap `bg-muted/60` for their own tint at the same opacity — see the amber PIN banner in [`app/dashboard/page.tsx`](../app/dashboard/page.tsx).

### 4.8 Stat tile — `DS-CTL-07` <sup>D-03</sup>
**Canonical:** `<StatTile label value meta />` inside `<StatRow columns={n}>`.
**Label is muted, never brand blue.** Blue marks a section heading; if every tile label carries it, the accent stops signalling anything.

---

## §5 Tables

Three implementations exist. Pick deliberately.

| Path | Status | Action |
|------|--------|--------|
| [`reports/ReportDataTable.tsx`](../components/dashboard/orders/reports/ReportDataTable.tsx) | **Canonical** | Copy these tokens |
| [`orders/OrdersDataTable.tsx`](../components/dashboard/orders/OrdersDataTable.tsx) | Acceptable | Feature-rich; tokens drift slightly |
| [`components/ui/data-table.tsx`](../components/ui/data-table.tsx) | **Deprecated** | Legacy boxed frame — do not use in converted pages |

Canonical hairline tokens:

| Part | Class |
|------|-------|
| Wrapper | `-mx-2 overflow-x-auto px-2` (no border, no frame) |
| Header row | `border-b border-border/60 hover:bg-transparent` |
| Header cell | `h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground` |
| Body row | `border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50` |
| Body cell | `py-3 text-sm` (+ `text-right tabular-nums` when numeric) |
| Empty / loading | `h-24 text-center text-sm text-muted-foreground` |

**Pagination** <sup>D-08</sup>: labelled outline pills using `PILL_CONTROL`, hidden entirely when `pageCount <= 1`. Not ghost icon squares.

---

## §6 Charts (Recharts)

```ts
import { CHART_GRID, CHART_TICK, CHART_CURSOR_FILL, ChartTooltipPanel }
  from '@/components/dashboard/shell'
```

- `CHART_GRID` — `{ stroke: "var(--border)", strokeDasharray: "3 3" }`
- `CHART_TICK` — `{ fontSize: 12, fill: "var(--muted-foreground)" }`
- `ChartTooltipPanel` — the one themed tooltip. Do not hand-roll another from slate/gray pairs.

> ⚠️ **C2 again, because this is where it bites.** These read raw `oklch()`/hex custom properties. Wrapping any of them in `hsl(...)` yields invalid CSS and Recharts silently reverts to its defaults. If your axis labels render an unexpected colour, this is why.

There are only `--chart-1` … `--chart-5`. A series needing more than five colours must supply its own palette.

---

## §7 Motion

| Element | Class |
|---------|-------|
| Page entrance <sup>D-05</sup> | `animate-in fade-in duration-500` — **on the header block only** |
| Hover / colour | `transition-colors` |
| Opacity | `transition-opacity` |

> **Why the header block and not the page root:** `animate-in` animates `transform`, which makes the element a containing block and **breaks every `sticky` descendant**. The dashboard Overview's sticky range bar is the casualty. `PageHeader` already scopes this correctly — use it and the problem cannot occur.

Dialogs and sheets animate via real `@keyframes` (`panel-in`, `overlay-in`) in `globals.css`, not utility classes. **This is deliberate** — tailwind-merge cannot resolve the primitive's hardcoded `slide-in-from-top-[48%]`. Do not "fix" it by adding `data-[state=open]:animate-in`.

---

## §8 Legacy blocklist

> **This applies to the page you are currently converting — not repo-wide.**

| Banned | Replacement | Note |
|--------|-------------|------|
| `bg-gray-50`, `bg-slate-*` | `bg-muted/60` — or delete | Flat design often removes the well entirely |
| `bg-white dark:bg-slate-900` | `bg-card` | |
| `border-blue-200`, `border-gray-*` | `border-border/60` | |
| `shadow-lg`, `shadow-md` on cards | *(remove)* | Panels have no shadow |
| `text-gray-*`, `text-slate-*` | `text-muted-foreground` | |
| `#0A5C9E`, `#0A7AB8` | `text-[#0C4FD1] dark:text-[#6CA0FF]` | Old Dexa blue |
| `hsl(var(--*))` | `var(--*)` | **C2 — silently breaks charts** |
| `rounded-lg` on a panel | `rounded-3xl` / `rounded-2xl` | §3.1 |

Audit the file you just converted:

```bash
rg -n 'bg-gray-|bg-slate-|dark:bg-slate-|bg-white dark:|border-blue-|border-gray-|shadow-lg|shadow-md|text-gray-|text-slate-|#0A5C9E|#0A7AB8|hsl\(var\(' <your-file>
```

Baseline when this doc was written: `bg-slate-*` 68 files · `bg-white` 69 · `border-blue-200` 67 · `shadow-lg` 55 · `bg-gray-50` 28 · `hsl(var(` 21.

**No lint rule, deliberately.** `next.config.ts` sets `ignoreDuringBuilds: true`, so lint gates nothing today; and `bg-white` is legitimate in `app/(marketing)`, `app/sites`, and receipt/print views, so a global rule would fire ~69 false positives on day one and be disabled within a week.

---

## §9 Per-page migration checklist

Paste into your PR.

```markdown
**Structure**
- [ ] Uses a §2 skeleton (`PageShell` + `PageHeader`)
- [ ] No `@/components/ui/card` import
- [ ] One `Panel` per page section; hairlines, not boxes
- [ ] No new `.*-flat` `<style>` block

**Tokens**
- [ ] `h1` comes from `PageHeader` (not hand-written)
- [ ] Section headings use the literal `text-[#0C4FD1] dark:text-[#6CA0FF]` in the `.tsx` (C7)
- [ ] Every figure has `tabular-nums`
- [ ] Radii come from §3.1
- [ ] Controls use `PILL_CONTROL`; search uses `FILLED_INPUT`

**Semantics**
- [ ] All colours are tokens (no raw hex except documented brand)
- [ ] No `hsl(var(...))`
- [ ] §8 grep is clean for this file

**Verify**
- [ ] Light mode
- [ ] **Dark mode inside the dashboard route** (C4)
- [ ] Data-heavy state and empty state
- [ ] 375px wide — no horizontal body scroll
- [ ] Charts render with correct axis colours
```

---

## §10 Decision log

| ID | Question | Decision | Rejected | Non-conforming (now fixed) |
|----|----------|----------|----------|---------------------------|
| **D-01** | Page `h1` | `text-[1.75rem] font-semibold tracking-[-0.02em]` | `font-medium` + `md:text-[2rem]`; `text-xl tracking-tight` | orders, orders/[orderId], locations ×2, locations settings |
| **D-02** | Panel radius | Two-tier: `rounded-3xl` page / `rounded-2xl` nested | One radius everywhere | — (tier assignment confirmed) |
| **D-03** | Stat-tile label | `text-muted-foreground`; blue = headings only | Blue on every tile | reports `SummaryCard` |
| **D-04** | Back control | Ghost pill, or icon-only when crowded. Never bordered | Bordered pill | locations settings |
| **D-05** | Entrance animation scope | Header block only | Page root | Constraint, not preference — root `animate-in` breaks `sticky` |
| **D-06** | Table implementation | `ReportDataTable` tokens canonical | `components/ui/data-table.tsx` | §5 status table |
| **D-07** | Brand accent | One accent pair, literal in `.tsx` (C7) | `text-brand` utility — not generated | tokens.ts is reference-only |
| **D-08** | Pagination | Labelled outline pills | Ghost icon squares | `OrdersDataTable` (pending) |
| **D-09** | Search field | `FILLED_INPUT` everywhere | Bordered `<Input>` | locations |
| **D-10** | Close (✕) button | Search-field material, circular, visible at rest | `rounded-xs opacity-70`; hover-only reveal | `dialog.tsx`, `sheet.tsx`, PIN banner, deposit banner |
| **D-11** | Status badge | Soft tint + dot, colours from a constants module | Solid saturated fill (`bg-green-500 text-white`) | `TableStatusBadge`; new `lib/constants/table-status.ts` |

**Retracted during implementation.** Two findings from the initial audit did not survive verification:

1. *"`dialog.tsx` has no open/close animation."* False — it animates via `@keyframes panel-in`/`overlay-in` in `globals.css`, which a grep of the component file cannot see. See §7.
2. *"The Orders date popover is missing `overflow: hidden`."* False — `DateRangePicker` ships `rounded-2xl overflow-hidden` on its own content, so every caller gets the clip.

---

## §11 Central fixes backlog

Fix-once items. **Do not** re-solve these per page.

| Item | Files | Status |
|------|-------|--------|
| Add `data-slot="popover-content"` to `popover.tsx` so the global overlay-radius rule can reach it | `popover.tsx` | Open — select/dropdown already done in `globals.css` |
| Table consolidation | 3 implementations | Open |
| `hsl(var(...))` bug | `lib/orderout/platform.ts` | Open |
| Move day-cell pill radius into `DateRangePicker`; delete both page `<style>` blocks | `DateRangePicker.tsx`, reports + analytics pages | Open |
| `FILTER_TRIGGER` inlined instead of imported | `OrdersDataTable.tsx:625` | Open |
| Three currency formatters | `lib/utils.ts` (canonical), `tips/lib/constants.ts`, `device-registry/presentation.ts` | Open |
| `STATUS_CONFIG` has no dark variants | `tips/lib/constants.ts` | Open |
| Raw `<input>` elements bypass `ui/input` — see §11.1 | 12 text/number/date fields | Open |
| `--brand` token + accent dedupe | `globals.css` + 10 files | ✅ Done |
| Delete dead 160-line token block | `globals.css` | ✅ Done |
| `DS-CTL-02` fill moved into base `input.tsx`; 41 redundant call-site classNames stripped | `input.tsx` + 25 files | ✅ Done |

### §11.1 Raw `<input>` elements that bypass the primitive

`DS-CTL-02` now lives in the base `components/ui/input.tsx` (muted fill, borderless,
`rounded-full`), so anything rendering a bare `<input>` **no longer matches the rest of
the dashboard** — it falls back to browser-default chrome.

34 raw `<input>` elements remain under `app/dashboard` + `components/dashboard`. Most are
**legitimate and must stay** — the primitive cannot style them:

- `type="color"` (7), `type="checkbox"` (5), `type="file"` (4), `type="radio"` (1)
- `type="datetime-local"` (2) in the snooze controls

These are the **real gaps** — plain fields that should be `<Input>`:

| File | Field |
|------|-------|
| `app/dashboard/payments/page.tsx:228,238` | `date` ×2 |
| `app/dashboard/payments/disputes/page.tsx:469,479` | `date` ×2 |
| `app/dashboard/invoices/components/InvoiceForm.tsx:588` | `number` |
| `app/dashboard/orders/analytics/page.tsx:371` | text/date |
| `app/dashboard/customers/components/tabs/DetailsTab.tsx:455` | text |
| `app/dashboard/customers/components/tabs/MarketingTab.tsx:161,188,208,218` | text ×4 |
| `app/dashboard/online-ordering/page.tsx:743,758,776,792,807` | mixed |
| `app/dashboard/kiosk/[locationId]/KioskEditor.tsx:211,219,323,417,519` | mixed |

**Why this was not swept with the className cleanup:** converting a raw `<input>` to
`<Input>` is a behaviour change, not a styling one. Several are `type="date"`, and the
primitive applies `isNativeDateLike` → `[color-scheme:light]`/`dark:[color-scheme:dark]`,
which changes how the native picker renders. Each needs an eyeball, so treat this as a
per-file pass rather than a codemod.

**Grep:** `grep -rn '<input' --include=*.tsx app/dashboard components/dashboard | grep -v 'type="\(checkbox\|color\|file\|radio\)"'`

---

## Out of scope

- ~~**`app/dashboard/menu/**`** — separate epic.~~ **No longer out of scope.** This
  document is the standard for *every* merchant-dashboard page, menu included. The
  menu tree is being converted like any other; see the slice table below.
- **`app/manage/*`** — shares `.dashboard-sidebar-theme`; the shell will apply later.
- **The 277-file `<Card>` migration** — see C6.

### Base control radius is now set globally

`components/ui/button.tsx` and `components/ui/input.tsx` were `rounded-md`, which is
why call sites all over the app hand-wrote `rounded-full` to get the pill shape this
document asks for. The radius now lives in the base components:

- **Button** — `rounded-full` in the base `cva` string. The `sm` and `lg` size variants
  previously re-declared `rounded-md`; a size-level radius **wins over the base string**,
  so those declarations were removed. Don't reintroduce a `rounded-*` in a size variant.
- **Input** — `rounded-full`, horizontal padding bumped `px-3` → `px-4` so text isn't
  crowded by the round ends. Grouped/affixed fields still override locally (see the
  store-slug field in `OnlineStoreTab.tsx`, which pairs `rounded-l-full` on the affix
  with `rounded-l-none` on the input).
- **Select** — trigger matches Input (`rounded-full`, `px-4`); the dropdown panel is
  `rounded-2xl` and its items `rounded-full`.
- **Badge** — `rounded-full` **and `border-0`**. The `outline` variant lost its border,
  so it now carries `bg-muted/60` instead — without that it would have become invisible
  text. Call sites that pass their own `bg-*` (there are ~400) override the tint and are
  unaffected; any `border-*` they also pass is now inert but harmless.

- **Textarea** — `rounded-2xl` (not `full`; a pill reads wrong on a multi-line box).
- **Alert** — `rounded-2xl`.
- **Dialog** — `rounded-3xl`, matching the large overlay panels.

> Only **Badge** dropped its border. `variant="outline"` on **Button** still has one —
> that's the intended outline-button look.

### Overlay scroll structure

A `DialogContent` that owns the rounded corner **must not be the scroll container**.
A scrollbar renders inside the element's padding box, so on a rounded element it
appears to sit outside the corner — the bug visible on the New Menu Item sheet.

The correct structure, used by `CreateItemWizard` and `NewEditItemFormSheet`:

```
DialogContent   flex flex-col overflow-hidden rounded-3xl   ← clips, never scrolls
├─ DialogHeader shrink-0                                     ← no `sticky` needed
├─ body         thin-scrollbar flex-1 min-h-0 overflow-y-auto ← the only scroller
└─ DialogFooter shrink-0
```

Because header and footer are flex-fixed siblings of the scroll area, they no longer
need `sticky` + `border-b`/`border-t` to separate themselves from scrolling content —
which is how those hairlines got there in the first place. Don't reintroduce them.

This means **new code does not need `rounded-full` on buttons or inputs** — it is the
default. Existing per-call-site overrides are redundant but harmless.

### Converted: the Item Library slice

These files are done and conform to this document. Treat them as reference examples
rather than pending work — and keep them conforming if you edit them:

| File | Notes |
|---|---|
| `app/dashboard/menu/items/page.tsx` | `PageShell`/`PageHeader`/`Panel`/`StatRow`; 4 stat cards → one panel |
| `components/dashboard/menu/NewEditItemFormSheet.tsx` | Retired underline tabs → pill rail |
| `components/dashboard/menu/items/CreateItemWizard.tsx` | Retired underline tabs → pill rail |
| `components/dashboard/menu/items/BulkPriceAdjustDialog.tsx` | Segmented controls → pill rails |
| `components/dashboard/menu/items/BulkDeliveryPriceAdjustDialog.tsx` | Same |
| `components/dashboard/menu/PriceSourcePopover.tsx` | Popover `rounded-2xl` per §4.6 |
| `components/dashboard/menu/ScopeContextStrip.tsx` | Tier-3 inset treatment |
| `app/dashboard/menu/items/[itemId]/page.tsx` | Item detail — 11 `<Card>` → `Panel`; `border-b`/`border-t` dividers removed |
| `app/dashboard/menu/items/[itemId]/edit/**` | Edit panel shell + section nav |
| `components/dashboard/menu/item-edit/**` (11 files) | All 8 section panels → `rounded-2xl … p-6` |

### Converted: `ReceiptModal`

`components/dashboard/orders/ReceiptModal.tsx` — shared by 5 call sites (order detail,
transactions, financials report, HQ merchant transactions, orders table), so all five
inherit the fix. Three deviations closed; no call-site changes were needed.

- **Hand-rolled scrollbar → `.thin-scrollbar`.** It carried eight chained
  `[&::-webkit-scrollbar-*]` arbitrary variants — one of the three drifted copies the
  utility in `globals.css` was written to replace. It is now the last of those three.
- **Scroll container split from padding.** The scroller previously owned the horizontal
  padding around floating paper, so the bar ran the full modal width with dead space
  either side of the receipt. Padding moved to an inner wrapper; the scroller is now a
  bare `flex-1 min-h-0 overflow-y-auto` and the bar tracks the panel edge.
- **`bg-transparent border-none shadow-none` → a real panel.** The paper floated on the
  overlay and the action row floated below it as bare white pills. The dialog now owns
  the surface per §"Overlay scroll structure": visible header (title + mono order
  number), one scroller, `shrink-0` footer. The footer buttons dropped their
  `bg-white dark:bg-zinc-800` — that override only existed to fake a surface under a
  floating button.

> **This panel is deliberately not `bg-background`.** It carries the paper's own
> `bg-[#faf9f6] dark:bg-zinc-900`, so panel and receipt are one continuous surface and
> the modal reads as a single sheet rather than a card containing a card. Two
> consequences: the footer takes **no `border-t` and no `bg-muted/30`** — on one surface a
> divider or tinted band reads as a seam — and the paper's `shadow-lg` plus its torn
> edges become the only things separating receipt from panel, so don't remove them. The
> receipt is the one place in the dashboard where a modal opts out of the neutral panel
> colour; it is not a precedent for other dialogs.

> **The print stylesheet is coupled to this DOM.** `@media print` in that file collapses
> everything outside the dialog portal and un-clips `.receipt-scroll` so the paper prints
> at natural height. Because the panel is now opaque, the `dialog-content` print rule also
> has to strip `background`/`border`/`box-shadow`/`border-radius` and restore
> `display: block`, or the card chrome prints as a grey box around the receipt. Anything
> added to the panel that is not the paper needs `no-print`.

Two shared modules came out of this slice — prefer them over new inline colour triples:

- **`lib/constants/menu-item-badges.ts`** — badge styles (price source, category scope,
  availability, tax) in the `BadgeStyle` `{dot,text,bg}` shape used by `table-status.ts`.
- **`lib/menu/cascade-labels.ts` → `scopeColor()`** — now carries `dark:` variants for all
  5 cascade levels. It previously returned light-only tints, so every consumer
  (`CascadeLadder`, `AffectsTag`, `PriceMatrixGrid`, …) rendered near-white blocks on dark
  cards. Fixing it at the source fixed all of them.

> ⚠️ **Both files are `.ts`, which Tailwind does not scan (C7).** Their classes generate CSS
> only because each one is *also* written literally in some `.tsx`. Before adding a new class
> to either, grep the `.tsx` files for it — an unmatched class reaches the DOM with no rule
> behind it and the element silently falls back to inherited styling.
- **`lib/messaging/notification-shared.ts` `COLORS`** — email-template palette, deliberately different from the UI accent. Do not unify.
