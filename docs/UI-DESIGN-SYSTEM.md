# Dexa Dashboards — UI Design System

One standard for both dashboards: the **merchant dashboard** (`/dashboard/*`) and the **HQ admin portal** (`/manage/*`). One set of rules, one section per surface.

## §0 Read me first

- **Part A (§1–§13) is the rule set, and both surfaces share it word for word.** There is no merchant copy and no HQ copy.
- **Part B holds only what differs per surface:** §14 Admin (HQ) and §15 Merchant. That covers adoption tables, reference pages to copy, the few recorded exceptions, and the known gaps.
- **If this doc and a shipped page disagree, the doc wins.** Many pages predate it, so copying a neighbour is the likeliest way to go wrong. Check your surface's adoption table first.
- **Section numbers never change.** Code comments cite them (`§5.3`, `§5.5`, `§13.2`, `§14.3 HQ-2` …). New rules get new numbers; nothing is renumbered.

**The language in one line:**
- flat, **neutral** surfaces, with one rounded container per page section
- **no dividing lines**, and muted borderless controls
- **no decorative colour.** Colour appears only for the brand-blue section heading, chart data, destructive actions and real alarms.
- centred rounded pop-ups
- large `tabular-nums` figures carry the emphasis
- **tables are bounded:** own row, capped height, paged
- **every empty state says so in words**
- **phones get the essentials only**

| Working on | Read first |
|---|---|
| Any page | §3.5 colour · §4.9 empty states · §5 tables (§5.6–§5.8) · §13 mobile · §9 checklist |
| An HQ page (`/manage/*`) | §14: `PageShell as="div"`, exceptions, reference pages, known gaps |
| A merchant page (`/dashboard/*`) | §15: adoption table, converted slices, known gaps |

**Prefer components over class strings.** `import { PageShell, PageHeader, Panel, PanelSection, StatTile, StatRow } from '@/components/dashboard/shell'`. A copy-pasted class string in 60 files makes the next design change a 60-file edit; an import makes it one.

---

# Part A: Shared rules (§1–§13)

Everything in this part applies to both surfaces as written.

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

*As of 2026-09-28: **37 lines across 12 files** (down from 90 across 21). Two of those are comments explaining the bug. Every other one is a chart rendering in a fallback colour rather than the intended token.*

Worst offenders:
- `manage/cash-drawers/components/CashDrawerAnalytics.tsx` (11)
- `components/scheduling/reports/VarianceChart.tsx` (7)
- `components/billing/HqSubscriptionsWorkspace.tsx` (4)
- `manage/merchants/[merchantId]/components/subscription/BillingInsightsSection.tsx` (4)
- merchant-detail `OverviewTab.tsx` `chartConfig` (3)

Also live in [`lib/orderout/platform.ts`](../lib/orderout/platform.ts) (`SLUG_COLORS.other`, `PLATFORM_COLORS.default`).

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

In **light** mode it sets no surface tokens (only `--primary`, `--ring` and the sidebar tokens; see C5), so the divergence doesn't exist there. **An engineer testing in light mode will never reproduce this class of bug.** Always check dark mode inside a real dashboard route.

### C5 — `--primary` is violet; the brand is blue
Never use `text-primary` expecting the brand blue. The accent is `text-[#0C4FD1] dark:text-[#6CA0FF]`: dark blue in light mode, and lightened in dark mode because `#0C4FD1` fails contrast on the dark card. A matching `--brand` token exists in `globals.css` for CSS-level use (it switches `#0C4FD1` → `#6CA0FF` in dark mode). The utility class, though, must be written literally in a `.tsx` (see C7).

**Why `--primary` is a trap:** it resolves three different ways depending on where the element renders.

| Where the element renders | `--primary` resolves to |
|---|---|
| On the page, light mode | `#0c4fd1` blue, because `.dashboard-sidebar-theme` overrides it |
| On the page, dark mode | Still `#0c4fd1`, which fails contrast on the dark card |
| In a Radix portal (Dialog, Popover, Select, DropdownMenu) | **Violet**. Portals mount under `<body>`, outside the class. |

That is why `bg-primary/10` chips, `text-primary` icons and a bare `<Badge>` (default variant `bg-primary`) look blue on a page and violet in a dialog. All of them are banned as decoration anyway (§3.5).

`--chart-1…5` are not overridden at all. They are five lightness steps of the violet (§6.1).

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

### C8 — Tailwind *does* scan Markdown and comments — never write a placeholder class
Tailwind v4 scans every file git doesn't ignore, **including `.md` docs and code comments**, and emits CSS for anything that looks like a class. A placeholder such as `w-[var(` + `…)]` (with a literal ellipsis) becomes `width: var(…)`, which fails to parse. That **breaks the build for the whole app**: "Parsing CSS source code failed … Unexpected token Ident("…")" in `app/globals.css`.

In docs and comments, write the real class (`w-[var(--radix-popover-trigger-width)]`), or describe it in words ("a `min-w-*` width"). Never put `…` inside square brackets.

**Grep:** `grep -rnE '[a-z]-\[[^] ]*…' app components docs`

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
    {/* toolbar, then the table well: full row (§5.6), capped height (§5.7) */}
    <Table variant="data">…</Table>   {/* caps its own height and pins its header */}
    <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="orders" />
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
  <PageHeader title="Location Tax & Banking" subtitle={location.name} showSubtitleOnMobile
              backHref="/dashboard/locations" backLabel="Back to Locations" />
  {/* stacked cards */}
</PageShell>
```

Live example: [`app/dashboard/locations/[locationId]/settings/page.tsx`](../app/dashboard/locations/[locationId]/settings/page.tsx).

### E — Sectioned dashboard (analytics, command centre)

```tsx
<PageShell>   {/* as="div" on HQ — §14.1 */}
  <PageHeader title="Analytics" subtitle="…" />   {/* the subtitle drops below sm by itself */}

  <Panel>{/* headline figures: StatRow > StatTile */}</Panel>

  {/* Charts may pair. `items-start` keeps each panel at its own height. */}
  <div className="grid min-w-0 items-start gap-6 md:grid-cols-2">
    <Panel><PanelSection label="Orders">{/* chart, or its §4.9 empty sentence */}</PanelSection></Panel>
    <Panel><PanelSection label="Revenue">{/* … */}</PanelSection></Panel>
  </div>

  {/* A table never pairs. It gets its own row (§5.6) and is capped and paged (§5.7). */}
  <Panel>
    <PanelSection label="Top merchants" action={<MobileColumnsButton … />}>
      <Table variant="data" …>…</Table>
      <PaginationBar … />
    </PanelSection>
  </Panel>
</PageShell>
```

- **Rows keep their own heights.** Grid items stretch by default, so a short chart beside a long list gets padded out to the list's height. Put `items-start` on every row of panels.
- **A panel with nothing to show still says so** (§4.9). The one exception: when two panels share a row, the *secondary* one may collapse to a one-line note and let the other span the row.
- **Phones reorder instead of rendering a second layout.** Put the most urgent block first on phones with `order-*` classes, and restore the desktop order at `md:`. Reorder one set of blocks. Two branches would remount and refetch.

Live examples: [`app/manage/page.tsx`](../app/manage/page.tsx) (command centre), [`app/manage/analytics/page.tsx`](../app/manage/analytics/page.tsx).

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
| — | ~~Section separator~~ | ~~`HAIRLINE`~~ | **Retired — see §5.5** |

The tier-1/tier-2 difference is the nesting cue. A card inside a panel must be smaller than the panel containing it.

> **`HAIRLINE` is no longer a separator.** §5.5 bans horizontal dividers outright. Sections are
> separated by spacing and a change of surface. `border-border/60` survives only as the edge of
> an element that genuinely has a border (a tier-1/tier-2 panel), never as a line drawn between
> two things.

### 3.2 Typography

| Role | Class |
|------|-------|
| Page `h1` <sup>D-01</sup> | `text-[1.75rem] font-semibold tracking-[-0.02em]` |
| Subtitle | `mt-1 text-sm text-muted-foreground`; hidden below `sm` (§13.4) |
| Section heading | `flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]` |
| Section figure | `mt-1 text-[2rem] font-medium leading-tight tracking-[-0.02em] tabular-nums` |
| Stat label <sup>D-03</sup> | `text-sm text-muted-foreground` |
| Stat figure | `mt-1 text-2xl font-medium leading-tight tracking-[-0.02em] tabular-nums sm:text-[1.75rem]`; one step smaller on phones (as `StatTile` ships) |
| Stat meta | `mt-0.5 text-[0.8125rem] text-muted-foreground`; hidden below `sm` (§13.4) |
| Sub-label | `mb-3 text-sm text-muted-foreground` |

### 3.3 Numerals

**Any figure that can change, or that aligns in a column, gets `tabular-nums`.** Without it, digits jitter as values update and columns fail to line up. This includes currency, counts, percentages, durations, and order numbers.

### 3.4 Spacing

| Role | Value |
|------|-------|
| Between top-level blocks | `space-y-6` |
| Section inside a panel | `px-4 py-8 sm:px-6` (`PanelSection`) |
| Panel with free-form content | `px-4 py-6 sm:px-6` (`<Panel padded>`) |
| Narrow page cap | `mx-auto max-w-5xl` (`<PageShell width="narrow">`) |

### 3.5 Colour — neutral by default <sup>D-17</sup>

**Colour is not decoration.** Tinted icon chips, pastel card washes and green or red numbers make a page look generated rather than designed. They also teach the eye to ignore colour, so the one alarm that matters gets lost.
- Surfaces are `bg-card` and `bg-muted/*`.
- Text is `text-foreground` and `text-muted-foreground`.
- Emphasis comes from **size, weight, position and words**.

#### Where colour is allowed — a closed list

| # | Use | Treatment |
|---|---|---|
| 1 | **Section heading** | The one brand accent, `text-[#0C4FD1] dark:text-[#6CA0FF]`, on section headings (`PanelSection` labels). See C5, C7 and D-03. Not on active tabs, links, icons, stat labels or selected controls. |
| 2 | **Chart data** | Series, heatmap ramps, legend swatches, the floor-plan canvas (§6.1). The colour *is* the data. |
| 3 | **Destructive actions** | `text-destructive` / `variant="destructive"` on delete and deactivate, the Danger Zone, and a field that is actually invalid (`aria-invalid`, §4.2). |
| 4 | **Real alarms** | A threshold breach or failure an operator must act on: a health tier, a dead-letter failure, a platform alert, a KPI past its alarm line, low battery. Rules below. |

Anything else is neutral. "It looks nicer in blue" is not on the list.

#### Alarms: colour the glyph or the figure, never the surface

- **Words first.** The alarm must read without colour: the label, meta or message says "Critical", "Above 5% threshold" or "12% battery". Colour is the second channel, never the only one.
- **Glyph or figure only:** `text-red-600 dark:text-red-400` for critical, `text-amber-600 dark:text-amber-400` for warning. Never a fill, tinted row, tinted pill, tinted banner or coloured border.
- **Healthy stays neutral.** No green for OK, online, paid, active or "up". The absence of an alarm is the signal.
- **A state is not an alarm.** Active/inactive, paid/pending, online/offline, a category, a tier and a trend are words in a neutral pill (§4.6b), never hues. Mark a row that needs attention by **weight, not colour**: `font-medium text-foreground` on that row, `text-muted-foreground` on the rest.

#### Banned — the "generated dashboard" patterns

| Pattern | Looks like | Instead |
|---|---|---|
| Tinted icon chip | `rounded-lg bg-blue-100 p-2 text-blue-600` · `bg-primary/10 text-primary` · `bg-emerald-500/10` | The bare icon in `text-muted-foreground`. Where a plate is structural (a record's identity), use `bg-muted text-muted-foreground`. Plates drop on phones (§13.4). |
| Gradient | `bg-gradient-to-br from-slate-50 via-white to-cyan-50/60` on a dialog header · `from-primary/20 to-primary/5` plates · `bg-clip-text` titles | Flat `bg-card`; the standard `PageHeader` title |
| Coloured surface | `bg-{hue}-50`, `bg-{hue}-500/10` or `dark:bg-{hue}-950` on cards, callouts, banners and table rows · `border-l-4 border-{hue}-500` accents | `bg-muted/60`. For a callout: `rounded-2xl bg-muted/60 px-4 py-3` |
| Decorative coloured text | Green/red KPI numerals · blue labels, links and icons · coloured trend arrows · red required-field asterisks | `text-foreground` / `text-muted-foreground`. Show direction with an arrow glyph, the sign and an `sr-only` word (§6.2). A required marker takes the label's colour; red appears only once the field is invalid. |
| Per-status or per-category hue | Status dots, category colour maps, severity pills, rank medals, `<Badge className="bg-green-600">` | One neutral pill (§4.6b); the word carries the meaning |
| Brand fill on a selected control | `bg-[#0C4FD1] text-white` segment, brand-blue active-tab text | The pill-rail active state: `bg-background text-foreground shadow-sm ring-1 ring-border` (§4.5) |
| `--primary` in the UI | `text-primary`, `bg-primary/10`, a bare `<Badge>` (its default variant is a `bg-primary` fill), `var(--primary)` as a chart stroke | Neutral tokens. `<Badge variant="outline">` is the neutral pill (C5). |

**On a muted card (`bg-muted/45`), values are plain text, not pills.** A tinted badge on a tinted surface reads as a box inside a box.

```diff
- <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
+ <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">

- <Badge className="bg-green-600 hover:bg-green-600">Connected</Badge>
+ <Badge variant="outline">Connected</Badge>

- <span className={trend >= 0 ? 'text-green-600' : 'text-red-600'}>{arrow} {pct}</span>
+ <span className="text-muted-foreground">{arrow} {pct}</span>   {/* glyph + sign carry direction */}
```

**Grep — review every hit:**

```bash
rg -n -e '-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}' \
      -e 'bg-(gradient|linear)-to-|bg-clip-text' \
      -e '(text|bg)-primary(/[0-9]+)?["'\''` ]' \
      -e '\[#0C4FD1\]' <your-file>
```

Every hit must be one of the four allowed uses: a heading, chart data, a destructive action, or an alarm glyph or figure. If any hit is something else, the file is not done. This grep covers every hue; the §4.6b grep covers only seven.

---

## §4 Component recipes

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

This means **new code does not need `rounded-full` on buttons or inputs** — it is the
default. Existing per-call-site overrides are redundant but harmless.

### 4.1 Pill control — `DS-CTL-01`
**Canonical:** `h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm`
**Use when:** date trigger, export button, select trigger, pagination. Pair with `variant="outline"`.
**Never:** a squared `rounded-md` button in a converted page.

### 4.2 Inputs — `DS-CTL-02`

**Every input is muted, rounded, and borderless.** Not just search — text, number, email,
password, date, select triggers, textareas, and combobox triggers all share one material:

**Canonical:** `rounded-full border-0 bg-muted/60 shadow-none focus-visible:bg-background`

**This is already the default** in `components/ui/input.tsx` and on the `SelectTrigger`, so a
plain `<Input />` or `<SelectTrigger>` is correct as written — do **not** re-declare the
classes at the call site.

| Field | Shape |
|-------|-------|
| Single-line input, select trigger | `rounded-full` |
| Textarea | `rounded-2xl` — a pill reads wrong on a multi-line box |
| Toolbar-height field | add `h-9 text-[0.8125rem]` (or `h-10` for a primary search) |
| Search | add `pl-9`/`pl-10` for the icon |

**Never:** a bordered input (`border`, `border-input`, `variant="outline"` chrome on a
field), a squared `rounded-md` field, a white/`bg-background` field at rest, or a raw
`<input>` for a text/number/date field (see §11.1). Focus is signalled by the fill turning
`bg-background`, not by a border appearing.

**The one exception is the error state:** an invalid field re-gains a destructive border via
`aria-invalid:border aria-invalid:border-destructive`. The fill alone cannot carry it.

**Grep (redundant classes):** `grep -rn '<Input' <file> | grep -E 'border-0|bg-muted/60|shadow-none'`
**Grep (violations):** `rg -n '<Input[^>]*(border-input|rounded-md|bg-background)' <file>`

#### 4.2a Search field specifics

**Canonical (search only):** `pl-9` for the icon, plus `h-9 text-[0.8125rem]` if the
field sits in a toolbar. Everything else comes from the base.
**Icon:** `pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50` — note `text-muted-foreground/50`, not `/100`.

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
**Active state is neutral:** `bg-background text-foreground shadow-sm ring-1 ring-border`. It is never brand-blue text and never a brand fill (§3.5). A trigger whose label is hidden on phones keeps an `aria-label` (§13.6).

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

### 4.6b Status badge — `DS-CTL-09` <sup>D-11, D-12</sup>
**Canonical:** `inline-flex shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium` — one neutral badge, for every state.

**Status is never colour-coded.** No green for active/paid/online, no red for
inactive/failed/critical, no amber for pending/warning, no per-location colour. Every status
badge is the same muted pill; the **word** carries the meaning.

This applies wherever a state is displayed, not only to badges — status text in a table cell,
an icon beside a toggle, a row highlight, a dropdown item, a card label. `text-green-600`
next to an "Active" switch is the same violation as a green badge.

```diff
- <span className={cn('text-sm font-medium', isActive ? 'text-green-600' : 'text-muted-foreground')}>
-   {isActive ? 'Active' : 'Inactive'}
- </span>
+ <span className="text-sm text-muted-foreground">
+   {isActive ? 'Active' : 'Inactive'}
+ </span>
```

**Why:** a dashboard where paid, pending, active, inactive, warning, and each location all
carry their own hue turns every screen into a colour key the user has to learn. Flat surfaces
plus one accent (§C5) means colour still means something when it does appear.

**Grep:** `rg -n 'text-(green|red|amber|orange|yellow|emerald|rose)-[0-9]|bg-(green|red|amber|orange|yellow|emerald|rose)-[0-9]' <your-file>`. This covers only seven "status" hues; run the §3.5 sweep for everything else.

**Which neutral pill:**
- **`<Badge variant="outline">`** renders exactly this material (`bg-muted/60 text-muted-foreground`). Use it.
- **A bare `<Badge>` is never right for status.** It renders the `default` variant, a `bg-primary` fill: blue on the page and violet in a dialog (C5).
- **Two other spellings read the same:** `bg-muted text-foreground` (`LOCATION_STATUS_BADGE`, `SEVERITY_BADGE`) and `Badge variant="secondary" … border-0`. Move them onto the canonical class when you touch the file.
- **On a muted card, write the word as plain text instead of a pill.** A pill on a tinted surface is a box inside a box.

**Three exceptions, all narrow:**

1. **Destructive actions** — a delete/deactivate item in a menu or a `variant="destructive"`
   button keeps `text-destructive`. That is an *action's* consequence, not a record's state.
2. **Functional colour encoding** — a floor-plan canvas, a heatmap, or a chart series legend.
   Those must read at a glance across a dense layout, and the colour *is* the data. The rule
   governs status display, not data visualisation.
3. **Real alarms**, meaning a threshold breach or failure (§3.5, use 4). The glyph or the
   figure takes red or amber, and the words say it too. The pill itself stays neutral.

> The per-domain `BadgeStyle` modules ([`lib/constants/payment-status.ts`](../lib/constants/payment-status.ts),
> [`lib/constants/table-status.ts`](../lib/constants/table-status.ts),
> [`lib/constants/menu-item-badges.ts`](../lib/constants/menu-item-badges.ts)) predate this rule.
> As of 2026-09-28, `payment-status.ts`, `menu-item-badges.ts` and `cascade-labels.ts`
> (`scopeColor()`) return neutral styles for every value. **Only `table-status.ts` still
> carries hues**, rendered by `TableStatusBadge`. Retiring it is a §11 item, not a per-page
> job.

### 4.7 Close button — `DS-CTL-08` <sup>D-10</sup>
**Canonical:** `inline-flex size-8 shrink-0 items-center justify-center rounded-full border-0 bg-muted/60 text-muted-foreground shadow-none transition-colors hover:bg-muted hover:text-foreground`

**Use when:** the ✕ that dismisses a dialog, sheet, or banner.

The same material as the search field (§4.2) — borderless `bg-muted/60`, no shadow — but **circular rather than pill**, because the content is a single square glyph. Visible at rest, not on hover: a close affordance you have to discover by hovering is one users may never find. `size-8` gives a 32px hit target around a 16px icon.

**Already applied centrally.** [`dialog.tsx`](../components/ui/dialog.tsx) and [`sheet.tsx`](../components/ui/sheet.tsx) carry it, so every modal and slide-over in the app already has it — do not restyle their close buttons per page.

**Never:** the old `rounded-xs opacity-70` treatment, or a dismiss that only appears on `group-hover`.

**Exception:** a labelled `✕ Close` button in a footer action row is a regular button, not this recipe (see `ReceiptModal`). Banners are neutral (§3.5), so the close button keeps this material on them. *Superseded by D-17: "tinted banners may swap `bg-muted/60` for their own tint". The amber PIN banner in [`app/dashboard/page.tsx`](../app/dashboard/page.tsx) predates the change and is listed in §15.4.*

### 4.8 Stat tile — `DS-CTL-07` <sup>D-03</sup>
**Canonical:** `<StatTile label value meta />` inside `<StatRow columns={n}>`.
**Label is muted, never brand blue.** Blue marks a section heading; if every tile label carries it, the accent stops signalling anything.
**Figure:**
- A figure that cannot be computed renders `—`, never `0` (§4.9).
- A delta with no baseline renders nothing (§6.2).
- A figure is coloured only when it is a real alarm (§3.5).

**Meta:** the meta line hides below `sm` via `metaClassName="hidden sm:block"` (§13.4). `StatRow` accepts only `columns={2|3|4}`; stack rows for more figures.

### 4.9 Empty state — `DS-CTL-12` <sup>D-20</sup>

**Every container that can be empty says so in words.** That covers panels, stat tiles, charts, tables, card grids, lists and feeds. When there is nothing to show, render a sentence. Never leave an empty box, bare chart axes or an empty pie ring, and never let a section silently disappear.

**Shape:** centred text in the footprint of whatever it replaces, so the layout does not jump when data arrives.

| Replaces | Recipe |
|---|---|
| Chart | `ChartEmpty`: `flex flex-col items-center justify-center gap-1 text-center` at the chart's own height. Title `text-sm font-medium`, hint `text-xs text-muted-foreground`. Import `ChartEmpty` and `isEmptySeries` from `@/components/dashboard/shell` ([`ChartEmpty.tsx`](../components/dashboard/shell/ChartEmpty.tsx)). |
| Table | One `TableCell colSpan={columns.length}` at `h-24 text-center` (§5.4) |
| Card grid | `col-span-full flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl bg-muted/30 px-4 text-center text-muted-foreground`, as in [`StaffDataTable`](../components/dashboard/staff/StaffDataTable.tsx) |
| Panel, list, page | `<Empty icon title description action />` from [`components/ui/empty.tsx`](../components/ui/empty.tsx) |
| Feed or short list | One line, e.g. "No activity yet — orders and device events will appear here." |
| Stat figure | `—` (em dash), with a meta line that says why, e.g. "Needs 10+ merchants with sales" |

**Copy**
- **Title:** "No {things} {in this period | yet | match these filters}". For example, "No transactions in this period" or "No terminals reporting". Never a bare "No data" or "No data available". The merchant `ChartCard` defaults to the latter, so always pass it a real `emptyMessage`.
- **Hint:** say what will make data appear ("Volume will appear here once merchants start taking orders."). If filters caused the empty state, say how to recover instead ("Clear the search or filters to widen the results.").
- **State good news as good news.** An empty alarm list reads "All clear — no active alerts", not "No alerts found".

**Rules**
- **All-zero counts as empty.** A series whose every bucket is `0` draws the same bare frame as no rows at all. Test with `isEmptySeries(rows, …measures)`, not `rows.length === 0`.
- **Unknown is not zero.** A value that cannot be computed renders `—`; a real zero renders `0`. Never show "0 days" for a null.
- **Sparse data needs a caption, not an empty state.** For example: "Median per day · 4 of 30 days have measurable data."
- **Never `return null` from a section that has a place in the layout.** Render its empty text instead. The one exception: when two panels share a row, the *secondary* one may collapse to a one-line note while the other spans the row.
- **Never hide the empty text on phones.** Stripping detail below `sm` (§13.4) never removes the sentence that explains a blank.
- **Loading is not empty.** While fetching, show a skeleton in the final shape (§5.4). The empty sentence appears only once the data comes back empty.
- **Errors are sentences too.** Use a neutral well that says what failed and offers Retry, e.g. `rounded-2xl bg-muted/30 px-4 py-20` with "We hit a snag loading organizations". Do not use red text (§3.5).

---

## §5 Tables

**The staff table is the reference.** [`components/dashboard/staff/StaffDataTable.tsx`](../components/dashboard/staff/StaffDataTable.tsx) is what every dashboard table should look like. It is built on `<Table variant="data">` — the variant already carries the whole treatment, so **you get it by passing the prop, not by copying class strings**.

```tsx
<Table variant="data" containerClassName="hidden xl:block" className="min-w-[900px]">
```

| Path | Status | Action |
|------|--------|--------|
| [`staff/StaffDataTable.tsx`](../components/dashboard/staff/StaffDataTable.tsx) | **Canonical** | Copy this structure |
| [`reports/ReportDataTable.tsx`](../components/dashboard/orders/reports/ReportDataTable.tsx) | Superseded | Hairline-row era; convert to `variant="data"` when touched |
| [`orders/OrdersDataTable.tsx`](../components/dashboard/orders/OrdersDataTable.tsx) | Superseded | Feature-rich; tokens drift |
| [`components/ui/data-table.tsx`](../components/ui/data-table.tsx) | **Deprecated** | Legacy boxed frame — do not use |

### 5.1 What `variant="data"` gives you

Defined in [`components/ui/table.tsx`](../components/ui/table.tsx) and applied through context — do not restate these at the call site:

| Part | Treatment |
|------|-----------|
| Container | `overflow-x-auto overflow-y-hidden rounded-2xl bg-muted/20` — a rounded tinted well, **no border and no frame**. From `md` up it also caps its height and scrolls (§5.7). |
| Header | `bg-muted/50` band, row border cleared; pinned with an opaque `bg-card` while the table is capped (§5.7) |
| Body rows | `[&_tr]:border-0 [&_tr]:bg-card/70 [&_tr:hover]:bg-muted/40` — **borderless**; separation comes from the card tint against the well, not from lines |
| Cells | `[&_td]:px-3 [&_td]:py-3 [&_th]:px-3` |

Call sites no longer need `<TableHeader className="[&_tr]:border-0">`. Since 2026-09-28 the variant clears the header row's border itself: it sets `[&_tr]:border-0`, because every `TableRow` carries its own `border-b`. The ~80 existing overrides are redundant but harmless.

### 5.2 Table rules

- **No horizontal lines.** No `border-b` on rows, no rule under the header, no divider between the header and the body. Rows are separated by the `bg-card/70` fill sitting on the `bg-muted/20` well. See §5.5.
- **Nothing frames the well.** The `rounded-2xl bg-muted/20` container *is* the table's surface. It sits in one of two places:
  - **In the page's content panel**, together with its toolbar and pager: a `PanelSection` (the staff page, report sections) or a `<Panel padded>` (skeleton A).
  - **Directly on the page**, under its toolbar (the HQ list pages).

  What is banned is a box whose only job is to frame the well: a `Card`, a bordered `div`, or a `Panel` around the table alone. That is a box inside a box.
- **Sortable headers are ghost pills**, not bare text: `variant="ghost"` + `h-8 rounded-full px-2` with `<ArrowUpDown className="ml-2 h-3 w-3" />`.
- **Row actions are a `rounded-full` ghost icon button** — `h-8 w-8 rounded-full p-0` with `MoreHorizontal` — opening a `DropdownMenu align="end"`.
- **Cell badges are borderless pills**: `w-fit rounded-full border-0 px-2.5 text-xs font-medium` on `variant="secondary"`. Never a bordered or outlined badge in a cell.
- **Numeric cells** get `text-right tabular-nums`.
- **Toolbar above the table**: search `<Input>` on the left (`h-10 w-full rounded-full pl-10` with the `text-muted-foreground/50` icon), filter `Select`s on the right as borderless muted pills — `h-9 rounded-full border-0 bg-muted/60 px-3 shadow-none`. A "Clear filters" ghost pill appears only when a filter is off its default.
- **Bulk-action bar** (when rows are selected): `rounded-2xl border-0 bg-muted/60 px-3 py-3`, ghost pill buttons inside, count rendered `tabular-nums`.
- **Every table is paged and height-capped** (§5.7). `PaginationBar` <sup>D-08</sup> renders labelled outline pills with the count ("Showing 11–20 of 29 staff"), and renders nothing when everything fits on one page. In that case show a row-count line below the table instead: `text-xs text-muted-foreground sm:text-sm`.
- **A wide table gets its own row** (§5.6). **On phones it becomes cards** (§5.3) **or gets a column picker** (§5.8).

### 5.3 Mobile: cards, never a scrolling table

The staff table renders **two trees** off one `useReactTable` instance:

- the `<Table variant="data">` at `hidden xl:block`
- a card grid at `grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden`, iterating `table.getRowModel().rows`

Each card is `rounded-2xl border-0 bg-muted/45 p-4`, with the selected state as `bg-muted ring-1 ring-border` — a ring, not a border. Secondary fields sit in a `grid-cols-2` block; the row's primary action is a ghost pill in the footer of the card.

Do not solve mobile with a horizontally scrolling table. Build the card grid, and **switch at the table's fit breakpoint** <sup>D-23</sup>: the first width at which the table's `min-w-*` width fits the content column without scrolling. The content column is the viewport minus the 16rem sidebar and 3rem of page padding:

| Breakpoint | Content column | Table `min-w` that fits |
|---|---|---|
| `lg` (1024px) | 720px | ≤ 720px, e.g. `min-w-[640px]` (HQ roles, members, audit) |
| `xl` (1280px) | 976px | ≤ 976px, e.g. `min-w-[900px]` (staff, org merchants) |
| `2xl` (1536px) | 1232px | ≤ 1232px |

So a 640px table uses `hidden lg:block` + `lg:hidden`, and a 900px one uses `hidden xl:block` + `xl:hidden`. Switching below the fit width brings back the sideways scroll this rule exists to prevent; the HQ merchants list, which shows a 1060px table from `md`, does exactly that. If a table cannot fit at any sensible width, it has too many columns. Default some of them off with the column picker (§5.8) rather than letting it scroll.

**The card:** `rounded-2xl border-0 bg-muted/45 p-4`.
- **Identity and status lead.** The remaining columns drop into `mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm` label/value pairs: label `text-xs text-muted-foreground`, value `truncate font-medium tabular-nums`. No column is lost; it is only re-laid-out.
- **Values are plain text, not pills** (§3.5). A tinted badge on a tinted card is a box inside a box.
- **A clickable card is a real `<button>`**, or carries a stretched overlay button as the HQ health cards do. Never a `div` with `onClick`.
- **When a row expands into detail, the row and the card render the same detail component** (HQ `AuditLogDetail`), so the two views cannot drift apart.
- **Cards page along with the table** (§5.7). They never get an inner scroll well.

### 5.4 Loading and empty states

- **Loading (table):** a single full-width `TableCell colSpan={columns.length}` at `h-24 text-center`.
- **Loading (cards):** `Skeleton` blocks inside the same `rounded-2xl bg-muted/45 p-4` shell, so the skeleton has the card's shape.
- **Empty:** a sentence, never a blank (§4.9). Centred icon + message in `text-muted-foreground`; on mobile, `rounded-2xl bg-muted/30` filling the grid via `col-span-full`.
- **Skeletons match the breakpoint.** A skeleton mirrors what renders at that width. It reserves no logo or avatar slot on phones when the card drops them (§13.4).

### 5.5 No horizontal lines — anywhere

This is a table rule and a component rule. **Do not use horizontal rules to divide content.** That means no `border-b` / `border-t` dividers, no `<Separator />` used as a section break, no `divide-y`, and no hairline under a heading, panel header, dialog header, or dialog footer.

Separation is carried by **surface and spacing**: a change of fill (`bg-card/70` on `bg-muted/20`, `bg-muted/60` inset), a radius change, or simply `space-y-*`. A line drawn across a flat surface reads as a seam.

This supersedes the earlier hairline table tokens and the `HAIRLINE` separator use in §3.1 — `border-border/60` remains valid only as the edge of an element that genuinely has a border, never as a divider. It is also why the overlay scroll structure (see "Overlay scroll structure") drops `border-b`/`border-t` from dialog headers and footers.

As of 2026-09-28, no shell primitive draws a line:
- `PaginationBar` lost its default `border-t`.
- `PanelDivider` is deleted, and so is `PanelSection`'s `divider` prop.
- A `variant="data"` header clears its row border itself.

The lines that remain are in page code; they are listed in §14.8 and §15.4.

**Grep for regressions in the file you converted:**

```bash
rg -n 'border-b|border-t|divide-y|<Separator' <your-file>
```

### 5.6 Wide tables get their own row — `DS-RESP-02` <sup>D-18</sup>

**A table never shares a row.** Give it a full-width row, either outside the grid or `col-span-full` inside it. Squeezed into half of a `md:grid-cols-2` row, or into three sevenths beside a chart, a table either scrolls sideways or crushes its columns.

The arithmetic: at `lg` the content column is 720px, so half a row is about 348px. A table with `min-w-[620px]` in that half scrolls sideways at every width below `2xl`.

- **Charts may pair; tables may not.** Two charts side by side is fine (`grid min-w-0 items-start gap-6 md:grid-cols-2`). A chart beside a table is not: move the table to its own row below.
- **The one exception** is a compact list-table of **≤ 3 short columns with no `min-w-*` width**, such as a "top 5" with name, count and share. It may sit in half a row because it cannot overflow.
- Lists that are not tables (feeds, alert lists, station tiles) size themselves; this rule does not apply to them.

### 5.7 Tables are bounded — paged, with a capped height — `DS-CTL-13` <sup>D-19</sup>

A table is bounded in two ways: **pagination limits the rows, and the well limits the height.** Neither is enough alone. A paged table can still be 50 tall rows, and a capped well without paging hides how much data there is.

**1 — Page every table.**

```tsx
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { useClientPagination } from '@/lib/hooks/useClientPagination'

const { pageRows, pagination, setPage } = useClientPagination(rows, 10)
// …render pageRows…
<PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="merchants" />
```

- **Page size: 10 rows, for every table.** That covers panel tables, a page's primary list, and server-paged lists alike. The mobile card grid of the same data pages at the same 10.
- **The only exception is a drag-to-reorder list** (menus, categories). Paging would stop a row being dragged onto another page, so those stay whole.
- **Server-paged data uses the same `PaginationBar`.** Pass it a `PaginationMeta`, as `AuditLogActivityMonitor.tsx` does. Do not hand-roll another pager.
- `PaginationBar` renders nothing when everything fits on one page. Otherwise it always shows the count, e.g. "Showing 11–20 of 29 merchants".
- **Rank before you slice.** Sort a ranked or actionable list first, so page 1 always holds the most urgent rows. HQ alerts are sorted by severity before paging.
- **Clamp the page.** If a list shrinks while the user is on it (for example, they dismiss an alert), they must not be left on an empty page. `useClientPagination` clamps for you.

**2 — The height cap is built in.** Since 2026-09-28, every `<Table variant="data">` caps itself; there is nothing to write:

| Part | What the table does |
|---|---|
| Container, from `md` up | `thin-scrollbar md:max-h-[min(70vh,40rem)] md:overflow-y-auto`. The table's own container is the scroller, so its header can stick to it. |
| Header | `sticky top-0 z-10 bg-card`, with the `bg-muted/50` band moved onto its row. A sticky header needs an opaque fill or rows show through it; this keeps the look of an unpinned header. |
| Print | `print:max-h-none print:overflow-visible` and `print:static`, so "Export Report" prints every row |

- **The cap holds about a dozen rows, so a 10-row page does not scroll.** It kicks in only for tall rows, an expanded row, or a drag-to-reorder list. This answers the objection in 4efe8504 that a scroll well hides how much data there is: the pager shows the count, and the well rarely scrolls.
- **No cap below `md`.** Phone tables are paged or become cards, and a nested scroll area on touch traps the thumb.
- **Opt out with `bounded={false}`** only when something else already owns the scroll: a dialog body that scrolls, a table nested in another table's expanded row, or a legacy wrapper well that has not been converted yet.
- **A different height** goes on `containerClassName` with the same prefix, `md:max-h-80`. tailwind-merge replaces the default.
- **Never override the header's fill.** A `bg-*` on `<TableHeader>` beats the sticky `bg-card` and makes the pinned header see-through.

**Never:**
- **An inner scroll well without a pager and count.** It gives two stacked scrollbars and no idea how many rows there are. This was the AlertsPanel bug fixed in 4efe8504.
- **A scroll well on a wrapper `div`**, such as `max-h-96 overflow-auto` around a `<Table>`. The header scrolls away, and with the built-in cap you get two scroll areas nested inside each other.
- **A "Show all N" toggle that unrolls the table.** Page it instead.
- **An inner scroll well on a phone card grid.** Page it instead; a nested scroll area on touch traps the thumb.

**Two lists that follow different rules:**
- **Grouped list:** collapse the groups, all closed by default, as the HQ device fleet does. Auto-opening the "problem" groups re-creates the long list the grouping was meant to fix.
- **Chronological feed:** the one list that may scroll without paging, because there is no "most important" item to page to. Cap its height relative to the viewport and cap its length on the server: `max-h-[min(60vh,32rem)] overflow-y-auto` with a 50-event limit, as in HQ `LiveActivityFeed`.

### 5.8 Column picker — `DS-CTL-14` <sup>D-22</sup>

Some tables cannot become cards, because the columns *are* the point: reports and comparisons. Give those a **column picker** instead of a sideways scroll. On phones it starts with only the 2–3 key columns visible, and the user adds the rest.

**Canonical:** [`MobileColumnsButton`](../components/dashboard/reports/MobileColumnsButton.tsx), already used in 14 HQ analytics components and 14 merchant report files.

```tsx
const COLUMNS: ReportColumn[] = [
  { id: 'merchant', label: 'Merchant', locked: true },          // identity never hides
  { id: 'orders',   label: 'Orders' },
  { id: 'voids',    label: 'Voids',     defaultHidden: true },
  { id: 'rate',     label: 'Void rate' },
  { id: 'trend',    label: 'Trend',     defaultHidden: true },
]
const isMobile = useIsMobile()
const [hidden, setHidden] = useState(() => initialHiddenColumns(COLUMNS))
const showCol = (id: string) => !isMobile || !hidden.has(id)

<PanelSection label="Voids by merchant"
  action={<MobileColumnsButton columns={COLUMNS} hidden={hidden} onChange={setHidden} />}>
  <Table variant="data" className={cn(!isMobile && 'min-w-[640px]')}>
```

- **Lift the `min-w-*` width on mobile.** The min-width is what forces the sideways scroll. If it stays, hiding columns changes nothing.
- Mark the identity column `locked`. Mark every column beyond the 2–3 a phone user needs `defaultHidden`.
- The button is `md:hidden`, so desktop shows every column. Put it in the `PanelSection` `action` slot or in the table toolbar.
- TanStack tables use their own menu built from `getAllColumns().filter(c => c.getCanHide())`, as in `OrdersDataTable` (saved via `useColumnPreferences`). Same idea, at every width.
- A picker is not a filter. It controls which **columns** show; the toolbar filters rows (§5.2).

Worked example: [`VoidRefundIntelligence.tsx`](../app/manage/analytics/components/VoidRefundIntelligence.tsx).

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

There are only `--chart-1` … `--chart-5`. A series needing more than five colours must supply its own palette. All five are lightness steps of one violet, so read §6.1 before using them for categories.

### 6.1 Colour in charts

Colour is allowed inside a chart (§3.5, use 2), but it has to *encode* something.

- **Single series:** use `var(--brand)`. It follows the theme: `#0C4FD1` in light mode, `#6CA0FF` in dark.
  - Not `var(--primary)`: it renders blue on the page, violet inside a portal, and is not lightened in dark mode (C5).
  - Not `--chart-1`: it is violet.
- **`--chart-1…5` are five lightness steps of the same violet as `--primary`.** That is not a categorical palette: neighbouring slices read as one colour. Use them only for a sequential ramp, and only once §11 has re-pointed them.
- **Categorical series:** give each visible category its own hue from one declared palette. HQ uses `SERIES` in [`analytics-primitives.tsx`](../app/manage/components/analytics-primitives.tsx).
  - **Filter out zero-value slices before assigning colours**, so only the slices that are drawn use up the palette.
  - Never cycle a palette that is shorter than the slice count. With a two-colour pie of three slices, the first and last slices touch and share a colour. Group the tail into "Other" instead.
- **Sequential (heatmaps, intensity):** one hue that varies in lightness, or a declared ramp such as the orders heatmap.
- **Red, amber and green inside a chart are data** (a health distribution, a utilisation ramp). They are not a licence to colour the text around the chart.
- **Chart chrome stays neutral:**
  - `CHART_GRID` and `CHART_TICK` for the grid and ticks.
  - Reference lines: `stroke="var(--muted-foreground)" strokeDasharray="5 5"`.
  - Legend labels: `text-xs text-muted-foreground`.
  - One themed tooltip (`ChartTooltipPanel`, or `AnalyticsTooltip` on HQ).

### 6.2 Honest charts

- **Empty:** a chart with no data, or only zeros, renders the §4.9 `ChartEmpty` sentence at the chart's height. Never a bare frame.
- **Deltas:**
  - A change against a zero baseline is `null`, not `+∞%` or `+100%`.
  - A delta that would show as `0.0%` renders nothing.
  - A tile with no comparison passes `change={null}`, not `0`.
  - Direction is carried by an arrow glyph plus an `sr-only` "increase" or "decrease". No green or red (§3.5).
- **Unknown values:** show `—`, with the reason in the meta.
- **Too few samples:** say so ("Needs 10+ merchants with sales") instead of plotting noise.
- **Sparse series:** use `fillDateGaps` and `IsolatedPointDot` so a lone day still shows, and add a coverage caption.
- **On phones:** chart captions hide below `sm` (§13.4). The chart itself and its empty sentence never do.

### 6.3 HQ chart helpers

[`app/manage/components/analytics-primitives.tsx`](../app/manage/components/analytics-primitives.tsx) is HQ-only today. Promote it to the shell before merchant pages reuse it (§11).

| Export | Use |
|---|---|
| `AnalyticsPanel({title, caption?, showCaptionOnMobile?, icon?, action?})` | `Panel` + `PanelSection`. The caption hides below `sm` unless `showCaptionOnMobile` is set. |
| `AnalyticsTooltip` | The themed tooltip. Swapping a bare `<Tooltip />` for it also clears a Recharts `Formatter` type error. |
| `monthAwareDateTick(rows, key)` + `DATE_AXIS_TICK_GAP` | Date axes that name the month on its first drawn tick (`Jun 26`) |
| `fillDateGaps`, `IsolatedPointDot` | Sparse daily series |
| `CHART_MARGIN`, `valueAxisWidthMobile(chars)`, `CategoryTick` + `CATEGORY_AXIS_WIDTH` | Axis sizing that still fits at 375px |
| `SERIES` | The HQ categorical palette |

---

## §7 Motion

| Element | Class |
|---------|-------|
| Page entrance <sup>D-05</sup> | `animate-in fade-in duration-500` — **on the header block only** |
| Hover / colour | `transition-colors` |
| Opacity | `transition-opacity` |

**No hover-reveal and no slide-in on expand** (2d3b91d2).
- **Controls are visible at rest.** A chevron or action that only appears on `group-hover` is one users may never find.
- **An expanding row or group opens in place.** No `animate-in slide-in-from-*` on the revealed content; rotating the chevron (`transition-transform`) is enough.
- **Programmatic smooth scrolling respects `prefers-reduced-motion`.** That covers tab rails and anchor jumps.

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
| Tinted icon chip: `bg-{hue}-100 text-{hue}-600`, `bg-primary/10 text-primary` | Bare icon in `text-muted-foreground` | §3.5 |
| `bg-gradient-to-*`, `bg-clip-text text-transparent` | Flat `bg-card`, `PageHeader` title | §3.5 |
| `bg-{hue}-50`, `bg-{hue}-500/10`, `border-l-4 border-{hue}-*` | `bg-muted/60` | §3.5 |
| Green/red figures and trend arrows | `text-foreground`, plus arrow glyph and sign | §3.5, §6.2 |
| `bg-[#0C4FD1] text-white` on a selected control | `bg-background text-foreground shadow-sm ring-1 ring-border` | §3.5 |
| A bare `<Badge>` for a status | `<Badge variant="outline">` | §4.6b |
| `max-h-* overflow-auto` wrapper around a `<Table>` | Delete it. The table caps itself; add `PaginationBar`. | §5.7 |
| `rounded-xl` / `rounded-lg` on a popover | `rounded-2xl` | §4.6 |
| `divide-y`, `border-t` between sections, `OverviewSection`'s default `divider` | Spacing (`PanelDivider` and `PanelSection`'s `divider` prop are deleted) | §5.5 |

Audit the file you just converted, then run the §3.5 colour sweep, which this audit does not cover:

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
- [ ] One `Panel` per page section
- [ ] No new `.*-flat` `<style>` block
- [ ] HQ only: `PageShell as="div"`, and exactly one `<main>` on the route (§14.1)

**No lines** (§5.5)
- [ ] No `border-b` / `border-t` / `divide-y` / `<Separator>` used as a divider
- [ ] Dialog header and footer carry no rule
- [ ] `rg -n 'border-b|border-t|divide-y|<Separator' <file>` reviewed

**Tables** (§5)
- [ ] `<Table variant="data">`, not hand-rolled hairline rows
- [ ] Nothing framing the well: no `Card` or bordered `div` around it (§5.2)
- [ ] Own full-width row, not in a grid cell beside a chart or panel (§5.6)
- [ ] Paged at 10 rows per page, table and card grid alike (§5.7)
- [ ] Height cap left on. `bounded={false}` only inside a dialog body or a nested table, and no `bg-*` on `<TableHeader>` (§5.7)
- [ ] Card grid below the table's **fit** breakpoint (§5.3), or a column picker when the columns are the point (§5.8). No horizontally scrolling table on mobile.

**Controls**
- [ ] Every input muted, rounded, borderless — no bordered or `rounded-md` field (§4.2)
- [ ] Textareas `rounded-2xl`, everything else `rounded-full`
- [ ] Controls use `PILL_CONTROL`

**Colour** (§3.5, §4.6b)
- [ ] §3.5 sweep reviewed: every hit is a section heading, chart data, a destructive action or a real alarm
- [ ] No tinted icon chips, gradients, or tinted cards, rows, callouts or banners
- [ ] No coloured figures or arrows, and no brand blue on icons, links or active states
- [ ] Status shown as a neutral pill with a word; no bare `<Badge>`
- [ ] Alarm colour only on a glyph or figure, with words; healthy is neutral

**Empty states** (§4.9)
- [ ] Every chart, table, grid, panel and tile has a sentence for empty. Tested with all-zero data too.
- [ ] Unknown values render `—`, not `0`
- [ ] No section `return null`s itself out of the layout
- [ ] Empty text still visible at 375px

**Mobile** (§13.4–§13.6)
- [ ] Below `sm`: no logos, avatars, page subtitle, panel or card captions, chart captions or stat metas
- [ ] Still visible: title, figures, status words, scope (location, date range), primary action, empty text
- [ ] Records are cards; report tables have a column picker
- [ ] Icon-only controls have an `aria-label`; primary controls are ≥ 44px tall

**Panels** (§12)
- [ ] Centred `Dialog`, not a `Sheet` or bottom drawer
- [ ] `rounded-3xl`; no `slide-in-from-*`
- [ ] Dialog clips, inner element scrolls

**Tokens**
- [ ] `h1` comes from `PageHeader` (not hand-written)
- [ ] Section headings use the literal `text-[#0C4FD1] dark:text-[#6CA0FF]` in the `.tsx` (C7)
- [ ] Every figure has `tabular-nums`
- [ ] Radii come from §3.1
- [ ] All colours are tokens (no raw hex except documented brand)
- [ ] No `hsl(var(...))`
- [ ] §8 grep is clean for this file

**Verify**
- [ ] Light mode
- [ ] **Dark mode inside the dashboard route** (C4)
- [ ] Data-heavy state (more than one page) and empty state
- [ ] 375px wide — no horizontal body scroll
- [ ] Panels full-screen on mobile; confirmations still centred cards (§13.1)
- [ ] Section rail scrolls the active pill into view (§13.2)
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
| **D-06** | Table implementation | ~~`ReportDataTable` tokens canonical~~ — **superseded by D-16** | `components/ui/data-table.tsx` | §5 status table |
| **D-07** | Brand accent | One accent pair, literal in `.tsx` (C7) | `text-brand` utility — not generated | tokens.ts is reference-only |
| **D-08** | Pagination | Labelled outline pills | Ghost icon squares | `OrdersDataTable` (pending) |
| **D-09** | Search field | `FILLED_INPUT` everywhere | Bordered `<Input>` | locations |
| **D-10** | Close (✕) button | Search-field material, circular, visible at rest | `rounded-xs opacity-70`; hover-only reveal | `dialog.tsx`, `sheet.tsx`, PIN banner, deposit banner |
| **D-11** | Status badge | ~~Soft tint + dot~~ — **superseded by D-12** | Solid saturated fill (`bg-green-500 text-white`) | `TableStatusBadge`; new `lib/constants/table-status.ts` |
| **D-12** | Status colour-coding | **None.** One neutral `bg-muted/60` pill; the word carries the meaning | Per-status hues (green/red/amber), incl. the D-11 soft tints | Payment and menu badge modules ✅. **Still open:** the staff table's `text-green-600` and `table-status.ts` (§15.4) |
| **D-13** | Panel presentation | Centred rounded pop-up (`Dialog`) for every panel | Bottom sheets, side drawers (`Sheet side=…`) | Every `Sheet`-based panel (`StaffDetailSheet`, `LocationAssignmentSheet`, …) |
| **D-14** | Mobile panels | Full-screen below `sm` — **except confirmations**, which stay centred cards | Full-screen everything (makes a 2-line confirm a destination) | — |
| **D-15** | Section rail on mobile | Bar stays visible; active pill `scrollIntoView({inline:'center'})` | `overflow-x-hidden` (truncates), wrapping to two lines, collapsing to a dropdown | — |
| **D-16** | Table implementation | `<Table variant="data">` — staff table canonical; borderless rows on a tinted well | Hairline `border-b` rows (the former D-06 answer) | `ReportDataTable`, `OrdersDataTable` |
| **D-17** | Decorative colour | **None.** Colour only for a section heading, chart data, destructive actions and real alarms (§3.5) | Tinted icon chips; gradients; pastel cards and banners; green/red numerals and arrows; brand-fill selection; red required-field markers | HQ home, organizations, analytics, merchants (§14.6). Remaining hits: §14.8, §15.4 |
| **D-18** | Wide tables in grids | Own full-width row. Only a ≤ 3-column table without `min-w` may share a row (§5.6) | Tables in a `md:grid-cols-2` or 3-of-7 cell that scroll sideways | Already full-row: the Terminal merchant list, KDS, staff-labour and order-type tables on `/manage/analytics`. 4 remain (§14.8) |
| **D-19** | Table length | Paged at **10 rows per page for every table**, server-paged lists included, **and** height-capped. Every `variant="data"` table caps itself from `md` (`min(70vh,40rem)`) with a pinned header; opt out with `bounded={false}` (§5.7). | Unbounded tables; "Show all N"; a scroll well with no pager or count (4efe8504); a scroll well on a wrapper `div` | 12 `/manage/analytics` tables now paged with `PaginationBar`, most of them former `max-h` scroll wells |
| **D-20** | Empty visuals | A sentence in the footprint of the missing content; `—` for unknown values; never `return null`; never hidden on phones (§4.9) | Bare axes, empty pies, generic "No data", sections that silently vanish | `OrdersHeatmap`, `PaymentsSection` (`ChartEmpty`) |
| **D-21** | Mobile detail | Below `sm`, via CSS, drop logos, avatars, page subtitles, panel/card/chart captions and stat metas (§13.4) | `useIsMobile` for visibility (breaks at 768px, flashes on hydrate); stripping titles, figures, status, scope or empty text | `/manage`, organizations, merchant cards |
| **D-22** | Tables on phones | Card grid first. A column picker (2–3 key columns on, `min-w` lifted) when the columns are the point (§5.8, §13.5) | Sideways-scrolling tables; per-column value filters | `/manage/analytics` (`MobileColumnsButton`) |
| **D-23** | Card-grid breakpoint | The table's fit breakpoint: `lg` for ≤ 720px, `xl` for ≤ 976px (§5.3) | One global breakpoint (`xl` wastes `lg`; `md` lets a 1060px table scroll) | HQ tables at `lg`; staff table at `xl` |
| **D-24** | Tab-rail centring | Scroll the rail itself with `rail.scrollTo`, clamped, and re-measure with `ResizeObserver` (§13.2) | `scrollIntoView` on the tab, which walks every scrollable ancestor | Org detail rail, `/manage` analytics rails |

**Retracted during implementation.** Two findings from the initial audit did not survive verification:

1. *"`dialog.tsx` has no open/close animation."* False — it animates via `@keyframes panel-in`/`overlay-in` in `globals.css`, which a grep of the component file cannot see. See §7.
2. *"The Orders date popover is missing `overflow: hidden`."* False — `DateRangePicker` ships `rounded-2xl overflow-hidden` on its own content, so every caller gets the clip.

---

## §11 Central fixes backlog

Fix-once items. **Do not** re-solve these per page.

| Item | Files | Status |
|------|-------|--------|
| Strip `[&_tr]:border-b` from `TableHeader` under `variant="data"` so call sites stop re-declaring `[&_tr]:border-0` (§5.1) | `table.tsx` | ✅ Done 2026-09-28. The variant sets `[&_tr]:border-0`; 9 tables with no override lost their header line. |
| Retire status colour from the `BadgeStyle` modules — drop the `dot`/`text`/`bg` hues, keep the labels (D-12) | `table-status.ts` + `TableStatusBadge` (payment, menu and cascade are done) | Open, 1 of 4 left |
| Convert `Sheet`-based panels to centred `Dialog`s (D-13) | `StaffDetailSheet`, `LocationAssignmentSheet`, `NewEditItemFormSheet`, + others | Open |
| Add the mobile full-screen sizing to `DialogContent` as a variant, so it isn't retyped per call site (§13.1) | `dialog.tsx` | Open |
| Extract the section-rail auto-scroll (§13.2) into one component rather than an effect per page. Start from the org-detail rail (D-24) and add `relative` to the rail. | new — `components/dashboard/shell` | Open |
| Add `data-slot="popover-content"` to `popover.tsx` so the global overlay-radius rule can reach it | `popover.tsx` | Open — select/dropdown already done in `globals.css` |
| Table consolidation | 3 implementations | Open |
| `hsl(var(...))` bug (C2) | `lib/orderout/platform.ts` + 9 more files | Open |
| Move day-cell pill radius into `DateRangePicker`; delete both page `<style>` blocks | `DateRangePicker.tsx`, reports + analytics pages | Open |
| `FILTER_TRIGGER` inlined instead of imported | `OrdersDataTable.tsx:625` | Open |
| Three currency formatters | `lib/utils.ts` (canonical), `tips/lib/constants.ts`, `device-registry/presentation.ts` | Open |
| `STATUS_CONFIG` has no dark variants | `tips/lib/constants.ts` | ✅ Done: `STATUS_CONFIG` removed, labels only |
| Raw `<input>` elements bypass `ui/input` — see §11.1 | 12 text/number/date fields | Open |
| Hide page subtitles, panel and chart captions and stat metas below `sm` **by default** in the primitives, with an opt-out for a subtitle that carries scope (§13.4) | `PageHeader.tsx`, `PanelSection.tsx`, `StatTile.tsx` (+ a hook on `InsetTile`), `ChartCard.tsx` | ✅ Done 2026-09-28, plus `AnalyticsPanel` and `DataPageSkeleton`. 72 call sites opted back in: 32 captions, 28 metas, 12 subtitles. |
| Bounded mode on `<Table variant="data">`: one prop sets the container cap and the sticky, opaque header (§5.7), so call sites stop spelling it out | `table.tsx` | ✅ Done 2026-09-28, **on by default**. 10 tables pass `bounded={false}`. |
| Drop `PaginationBar`'s default `border-t pt-4` (§5.5), then delete the 12 HQ `border-t-0 pt-0` overrides | `PaginationBar.tsx` + 8 files | ✅ Done 2026-09-28 |
| Move hand-rolled pagers onto `PaginationBar` (§5.7) | HQ merchants list, `OrganizationAuditLogs`, `AlertsPanel`, `AuditLogsTab`, `OrdersDataTable` | Open. `/manage/transactions` done 2026-09-28 (all five of its pagers). kds-mirror's `TablePagination` deleted 2026-09-29; its three tables use `PaginationBar`. |
| `SelectTrigger` is not muted by default, though §4.2 says it is. It still ships `border bg-transparent shadow-xs` (and `dark:bg-input/30`), so a bare trigger renders bordered. Move the §5.2 material into `select.tsx`, then drop the call-site overrides. | `select.tsx` | Open. Found 2026-09-28; `/manage/transactions` spells the classes out in `FilterSelect`. |
| Promote `ChartEmpty` + `isEmptySeries` to the shell. Fix `Empty`'s root: `rounded-lg` → `rounded-2xl`, and drop the inert `border-dashed` (§4.9) | `PaymentsSection.tsx`, `empty.tsx` | Half done. `ChartEmpty` is in the shell ✅; the `Empty` root is still open. |
| A shared mobile record card + `CardField` (§5.3). The card class is typed out 36 times in 28 files. | new — `components/dashboard/shell` | Open |
| Delete `PanelDivider` (0 uses) and retire `PanelSection`'s `divider` prop (§5.5) | `components/dashboard/shell` | ✅ Done 2026-09-28. Removed the 6 HQ usages. |
| Promote `analytics-primitives` to the shell before merchant pages reuse it, and fix its stale docblocks (§6.3) | `app/manage/components/analytics-primitives.tsx` | Open |
| Decide a brand-led categorical chart palette and re-point `--chart-1…5` at it (§6.1). Today there are 35 local palettes in 32 files. | `globals.css` + palette constants | Open; needs a design decision |
| Make the default `Badge` variant neutral, or catch bare `<Badge>` used for status (§4.6b) | `badge.tsx` | Open. Behaviour change: audit the ~100 default-variant call sites first |
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

## §12 Panels are centred pop-ups — `DS-CTL-11` <sup>D-13</sup>

**Every panel opens as a centred, rounded modal.** Not a drawer sliding up from the bottom,
not a sheet sliding in from the left or right. Detail views, editors, wizards, filters,
assignment pickers, confirmations — all of them are a `Dialog` centred in the viewport.

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="…">   {/* rounded-3xl is the default — see below */}
```

**Never:** `<Sheet side="right">` / `side="left"` / `side="bottom"`, a hand-rolled
`fixed inset-x-0 bottom-0` bottom sheet, or a `slide-in-from-*` animation on a panel. If a
file imports `@/components/ui/sheet` for a panel, that is the thing to convert.

**Shape:** `rounded-3xl` — already the `DialogContent` default (see "Base control radius is
now set globally"). Nested panels inside a dialog are `rounded-2xl` per §3.1.

**Motion:** the centred fade/scale from the `panel-in` / `overlay-in` `@keyframes` in
`globals.css` (§7). Do not add `slide-in-from-bottom` or `data-[state=open]:animate-in`.

**Structure:** the dialog clips, an inner element scrolls. See "Overlay scroll structure"
below — and remember §5.5: the header and footer take **no** `border-b`/`border-t`.

**Grep:** `rg -n 'from "@/components/ui/sheet"|<Sheet|side="(bottom|left|right)"|slide-in-from' <your-file>`

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

HQ spells the same structure as a grid: `DialogContent className="… grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0"`, with the header, a `min-h-0 overflow-y-auto` body and the footer as its three rows. It is equally correct.

---

## §13 Mobile — `DS-RESP-01` <sup>D-14</sup>

### 13.1 Panels go full-screen

Below the `sm` breakpoint a panel fills the viewport **horizontally and vertically** — no
margin, no visible overlay gutter, and no rounded corners against the screen edge:

```tsx
<DialogContent className="h-dvh max-h-dvh w-screen max-w-none rounded-none
                          sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded-3xl">
```

Use `h-dvh`, not `h-screen` — `100vh` on mobile browsers sits behind the address bar and the
footer ends up below the fold.

**The exception is confirmation dialogs.** A short confirm/cancel prompt stays a small centred
card on mobile: blowing a two-line question up to full screen makes a trivial decision look
like a destination. Keep those at their `sm:max-w-[425px]`-class sizing at every width, and
keep the `rounded-3xl`.

The dividing line is content, not component: **does the panel contain fields or a list the
user works through?** Full screen. **Is it a question with two buttons?** Centred card.

| Panel | Mobile |
|-------|--------|
| Detail sheet, editor, wizard, filter panel, results table | Full screen |
| "Deactivate 3 staff?", "Discard changes?", "Delete this item?" | Centred card |

### 13.2 The section selector bar auto-scrolls

A horizontal tab/section rail (§4.5) must never hide the active section off-screen.

- **The bar itself stays visible** — it scrolls horizontally within its own
  `overflow-x-auto` container; it does not wrap to two lines, collapse into a dropdown, or
  scroll out of the page on mobile. If the page scrolls under it, the rail is `sticky top-0`
  with a `bg-background` so content does not show through.
- **The selected pill scrolls itself into view**, on mount and on every change, so the
  active section is always the one you can see. Scroll **the rail**, not the tab (D-24):

```tsx
const railRef = React.useRef<HTMLDivElement>(null)   // <div ref={railRef} className="relative … overflow-x-auto">
const positioned = React.useRef(false)

React.useEffect(() => {
  const rail = railRef.current
  if (!rail) return
  let done = false
  const align = () => {
    const max = rail.scrollWidth - rail.clientWidth
    const tab = rail.querySelector<HTMLElement>('[data-state="active"]')
    if (done || !tab || max <= 0) return
    const left = tab.offsetLeft - (rail.clientWidth - tab.offsetWidth) / 2
    const smooth = positioned.current && !matchMedia('(prefers-reduced-motion: reduce)').matches
    rail.scrollTo({ left: Math.max(0, Math.min(left, max)), behavior: smooth ? 'smooth' : 'auto' })
    positioned.current = done = true
  }
  align()
  const observer = new ResizeObserver(align)   // a cold rail has no width on the first run
  observer.observe(rail)
  return () => observer.disconnect()
}, [activeTab])
```

What the recipe does:
- **Centres the active pill.** That reveals the sections on either side, which is the cue that tells the user the rail scrolls at all.
- **Clamps the scroll**, so the first and last pills rest flush against the ends.
- **Places the first positioning instantly**, so a deep-linked tab is already in place when the page appears.

- **The rail must be `relative`.** `offsetLeft` is measured from the nearest positioned ancestor, so a static rail measures from somewhere further out.
- **Why not `scrollIntoView`:** it walks every scrollable ancestor, not just the rail.
  - `block: "nearest"` stops the vertical jump.
  - But `inline: "center"` can still shift `#main-content` sideways when the page has clipped horizontal overflow, because an `overflow-x-hidden` element can still be scrolled by script.
  - The older `scrollIntoView({ inline: "center", block: "nearest" })` recipe is still in several merchant pages. It is acceptable where it has already shipped; new code scrolls the rail.
  - Reference implementation: [`organizations/[organizationId]/page.tsx`](../app/manage/organizations/[organizationId]/page.tsx).

- **Never** hide the overflow. `overflow-x-hidden` on a rail silently truncates the section
  list, and the sections past the cut become unreachable.
- Scrollbar itself stays hidden (`.thin-scrollbar` or `scrollbar-none`) — the peeking pill is
  the affordance, not a scrollbar.

### 13.3 Layout basics

- Rows of panels take `items-start`. On phones, blocks reorder with `order-*` instead of rendering a second layout (§2 E).
- Tables become card grids below their fit breakpoint (§5.3), or get a column picker (§5.8).
- 375px wide, no horizontal body scroll — already on the §9 checklist.
- Grid tracks need `min-w-0`, or a wide child forces the whole row past the viewport.

### 13.4 Phones get the essentials — `DS-RESP-03` <sup>D-21</sup>

Below `sm` (640px), a page drops detail that takes up space without changing what the user does next. **This is a closed list.** Strip exactly these and nothing else; the lesson "Declutter requests: remove only what was named" applies.

| Drop below `sm` | How |
|---|---|
| Logos and brand marks: merchant logo plates, org logos, a platform logo beside its name | `hidden sm:flex` on the plate |
| Avatars and profile images beside a name | `hidden sm:flex` on the `Avatar` |
| Page subtitle | **Automatic** in `PageHeader` |
| Panel and card captions and descriptions | **Automatic** in `PanelSection` and `AnalyticsPanel` |
| Chart captions and subtitles | **Automatic** in `PanelSection` and `ChartCard`. The chart itself stays. |
| A stat tile's meta line, including its delta (the tile's "subtitle") | **Automatic** in `StatTile` and `InsetTile` |

**The primitives do it by default.** Since 2026-09-28, `PageHeader`, `PanelSection`, `AnalyticsPanel`, `ChartCard`, `StatTile`, `InsetTile` and `DataPageSkeleton` put `max-sm:hidden` on those lines. A line that must stay opts back in:

| Component | Opt-in prop |
|---|---|
| `PageHeader`, `ChartCard`, `DataPageSkeleton` | `showSubtitleOnMobile` |
| `PanelSection`, `AnalyticsPanel` | `showCaptionOnMobile` |
| `StatTile`, `InsetTile` | `showMetaOnMobile` |

The props take a condition when only one branch matters. For example, `showMetaOnMobile={isError}` keeps "Failed to load" beside a "—" but drops the normal comparison line.

Why `max-sm:hidden` and not `hidden sm:block`: it sets no display from `sm` up, so it cannot fight a caller's own `max-md:hidden` at 640–767px. Older `hidden sm:block` overrides at call sites are now redundant but harmless. `StatTile` also hides its own icon below `sm`.

**Never dropped:**
- the page title
- figures
- status words
- scope: location, date range, record id
- the primary action
- alarm text
- empty-state text (§4.9)

- **A subtitle that carries scope is not decoration.** `subtitle={location.name}` (skeleton D) stays, via `showSubtitleOnMobile`. Alternatively, move the scope into `indicator`.
- **Move, don't delete, an explanation the user needs.** On phones, a legend or methodology note becomes a popover behind a small info trigger. Examples: the HQ health score legend moves into "How scoring works"; analytics notes move behind an `AlertCircle` trigger.
- **Use CSS, not `useIsMobile`.** Visibility is `hidden sm:block` or `max-sm:hidden`. `useIsMobile` breaks at 768px and flashes the desktop layout on hydrate. Keep it for behaviour CSS cannot express, such as column-picker state or swapping a table for cards inside an expanded row.
- **`hidden` loses to a display utility in a shared class constant.** Adding `hidden sm:inline-flex` to a `BADGE_SHELL` that already sets `inline-flex` is decided by CSS source order, not class order. Wrap it instead: `<div className="hidden sm:block">{badge}</div>`.
- **Trim a whole tab at once.** Captions and metas carry `data-slot="panel-caption"` and `data-slot="stat-meta"`, so one class on a `TabsContent` covers the tab: `max-sm:[&_[data-slot=panel-caption]]:hidden max-sm:[&_[data-slot=stat-meta]]:hidden`.
- **Skeletons match what renders.** If the card drops its logo or avatar on phones, the skeleton must not reserve a slot for it; otherwise the layout shifts when data lands.

### 13.5 Grids before tables — `DS-RESP-04` <sup>D-22</sup>

On a phone, a list of records is a **card grid** (§5.3), not a table. Use a table below `sm` only when the columns are the point, i.e. a comparison or report where reading across a row is the task. Then give it a column picker (§5.8) with the 2–3 key columns on by default.

| Content | Phone layout |
|---|---|
| Records (merchants, staff, orders, devices, audit entries) | Card grid, `grid-cols-1`, then `sm:grid-cols-2` |
| KPIs | `StatRow`, two across (one across for `columns={2}`), figure `text-2xl` |
| Report or comparison table | The table, with a column picker and the `min-w` lifted |
| Charts | Full width, one per row |

**Never** a sideways-scrolling table at phone width, and never page-level horizontal scroll (§13.3).

### 13.6 Touch targets and labels

- Primary controls on phones are at least 44px tall (`h-11`), like the HQ date presets. Icon buttons are at least `size-8` (32px).
- A control whose text label is hidden on phones (tab triggers, pager buttons) keeps an `aria-label`. An icon alone has no accessible name.

---

# Part B: Surface sections

Each surface follows Part A as written. These sections record only what is specific to one surface.

## §14 Admin (HQ) portal — `/manage/*`

HQ converts onto **this** document. It is not a second design system, and there is no HQ copy of these rules. Where HQ genuinely needs to differ, the difference is recorded in §14.3 with a reason.

- Design spec for the rollout: [`docs/superpowers/specs/2026-09-15-hq-portal-design-system-rollout-design.md`](superpowers/specs/2026-09-15-hq-portal-design-system-rollout-design.md)
- Route-by-route record: [`docs/features/hq-redesign/route-audit-matrix.md`](features/hq-redesign/route-audit-matrix.md)
- **What to copy:** §14.6
- **What is still wrong:** §14.8

### 14.1 The one structural difference — `PageShell as="div"`

**HQ pages must pass `as="div"`.**

```tsx
<PageShell as="div">
  <PageHeader title="Merchants" subtitle="Manage and monitor merchant accounts" />
  …
</PageShell>
```

`app/manage/layout.tsx` already renders the surface's `<main>` (`<main aria-label="Admin content">`).
`PageShell` defaults to `<main>`, so importing it bare would nest two landmarks
and confuse assistive navigation. Verified in a live browser: a `/manage` route
contains exactly one `<main>` today, and it must stay that way.

This mirrors the rule HQ loading states have followed since the loader ticket —
`DataPageSkeleton` takes `shell="plain"` for the same reason. A converted route
and its skeleton now follow one rule instead of two.

> The prop is a closed `'main' | 'div'` union, not `React.ElementType`. HQ has
> exactly one need, and a closed set keeps the invariant greppable:
> `grep -rn "PageShell" app/manage --include=*.tsx | grep -v 'as="div"'` must
> return nothing.

**Merchant pages are unaffected.** `as` defaults to `'main'`, and the rendered
HTML is byte-identical to the pre-prop component — asserted directly in
`components/dashboard/shell/__tests__/PageShell.test.tsx`.

> ⚠️ Merchant pages currently nest a second `<main>` themselves (the layout has
> one, and each page's `PageShell` adds another). That is a pre-existing issue
> on an already-signed-off surface, out of scope for the HQ rollout, and tracked
> separately. Do not "fix" it inside an HQ PR.

### 14.2 What HQ reuses unchanged

Everything else. `PageHeader`, `Panel`, `PanelGrid`, `PanelSection`, `PanelRow`,
`StatRow`, `StatTile`, `InsetTile`, table `variant="data"`, the §4 control
recipes, the §12 centred pop-up rules and the §13 mobile rules all apply to HQ
as written. HQ additionally has chart helpers in
`app/manage/components/analytics-primitives.tsx` (§6.3). They are HQ-only until
they are promoted to the shell.

`LocationIndicator` is already HQ-safe: it reads no store of its own, so it can
be driven by whatever scoping a `/manage` page has.

The starting move on every HQ page is the same substitution. HQ has **17
distinct hand-rolled `<h1>` class strings**; all of them become `PageHeader`:

```tsx
// before — one of seventeen variants
<div className="space-y-6">
  <div className="space-y-1">
    <h1 className="text-3xl font-bold tracking-tight">NMI Integration</h1>
    <p className="text-sm text-muted-foreground">Configure the …</p>
  </div>

// after
<PageShell as="div">
  <PageHeader title="NMI Integration" subtitle="Configure the …" />
```

### 14.3 HQ exceptions

| # | Exception | Rationale |
|---|---|---|
| HQ-1 | **Operational density.** HQ tables may run tighter than the merchant recipe. | HQ is a command centre, and operators scan far more rows per session than a merchant does. Density is the feature. It is still bounded: every HQ table is paged and height-capped (§5.7). |
| HQ-2 | **HQ alarms keep their colour** (§3.5, use 4), exactly where HQ raises alarms. The places are listed below. | These encode a real alarm state, so the colour is semantic, not decoration. Everywhere else in HQ, status is text-led and a row that needs attention is marked by weight. |
| HQ-3 | **`/manage` keeps its command-centre composition:** status line, tabs, then a dashboard of paired panels (§14.6.1). | This preserves the information hierarchy of the Admin HQ Dashboard Overhaul. Only the canvas, header and card nesting changed. |

**Where HQ-2 applies.** The list is closed. Add to it before the PR that relies on the addition merges.

| Surface | What is coloured |
|---|---|
| `/manage/health` and the Health tab on `/manage` (both render [`HealthDashboard`](../app/manage/components/HealthDashboard.tsx)) | The Healthy / Needs attention / Critical score tiers, in text and bars. The legend is a scale, so it is the one place where "healthy" keeps its green. |
| `/manage/dlq` | Dead-letter failures: the Pending count figure when above 0 (meta "Failed, awaiting retry or triage"); the retry figure when retries are exhausted on a live entry (word "Exhausted" beneath); and the glyph beside "Failed — error message" in the detail panel. Resolved and abandoned entries stay neutral. |
| `/manage` alerts panel | The severity **icon**: red for high, amber for medium ([`AlertsPanel`](../app/manage/components/AlertsPanel.tsx)) |
| `/manage` platform pulse | The payment success rate figure, when below 95% |
| `/manage` Analytics tab | The failure rate figure, when above 5%, with the meta line "Above 5% threshold" |
| Device figures (fleet, analytics) | Battery at or below 20%, and RAM or storage past their limits, on the glyph or figure |
| `/manage/transactions` and its shared sections (Chargebacks on `/manage/disputes`, batch reconciliation on merchant Settlements) | Chargeback defense deadline: a red glyph with "Overdue", an amber glyph with "{n}h left" / "{n}d left" inside 72 hours, and a red glyph on the "due within 72 hours" callout. Batch reconciliation discrepancy: an amber glyph beside the amount. TSYS sync failure: a red glyph with "Sync failed" in the connectivity line. Added 2026-09-28. |
| `/manage/settings/integrations`, OrderOut menu-push panel | Unprocessed push_menu dead-letter entries: a red glyph beside "{n} unprocessed" when the live (pending or retrying) count is above 0, with a "Review in the dead-letter queue" link. Zero reads "None unprocessed · All clear"; a failed count reads "—". Added 2026-09-29. |
| `/manage/support/kds-mirror` (KDS), send failures only | Send ledger: a red glyph with "Partial send" or "Dropped", an amber glyph with "No route" / "No route recorded". Unsent items: a red glyph with "Partial fire". The Partial sends, With dropped items and Partial fires figures turn red only above zero. Device-truth verdicts, routing health, stale-ticket hints and the realtime state stay neutral. Added 2026-09-29. |

HQ-2 never extends to a fill, a tinted row, a tinted pill, or a status that is not an alarm.

Anything not on these tables follows Part A. A new exception is added here **before** the PR that relies on it merges.

### 14.4 Skeletons convert with their pages

Six of the nine HQ `loading.tsx` files use `DataPageSkeleton` with
`shell="plain"`. Three are hand-rolled and deliberately mirror the *legacy*
card layout:

- `app/manage/support/loading.tsx`
- `app/manage/support/[ticketId]/loading.tsx` (via `SupportTicketSkeleton`)
- ~~`app/manage/users/loading.tsx`~~ — converted 2026-09-29 with its page; now `DataPageSkeleton variant="report"` (3 stats, 2 tabs, table body)

`support/loading.tsx` says so in its own docblock: the page "is built from raw
cards and a bordered tab strip rather than the dashboard shell primitives, so a
shared variant would promise panel chrome that never arrives."

**So converting `/manage/support` or `/manage/users` without rewriting its
skeleton in the same PR reintroduces the layout shift the loader ticket
removed.** Once the page uses panel chrome, the precondition those docblocks
describe is satisfied and the skeleton should move onto `DataPageSkeleton` with
`shell="plain"`.

### 14.5 Adoption table

Updated as each route family lands.

| Route family | Routes | Status |
|---|---|---|
| 1 — HQ home, analytics, health | `/manage`, `/manage/analytics`, `/manage/health` | ✅ Converted. Covers `app/manage/components/**` and all 15 files in `app/manage/analytics/components/**` (484 → 0 `<Card>`), plus follow-up passes up to `b0618dc2`. Reference: §14.6.1, §14.6.3. |
| 2 — Merchant and org operations | `/manage/merchants`, `…/new`, `/manage/organizations`, `…/[organizationId]`, `…/create-organization` | ✅ Converted, including the org-detail dialog components (PR 2b). Reference: §14.6.2, §14.6.4. `/manage/create-merchant` is a bare `redirect()` and needs no change. |
| 3 — Merchant detail workspace | `/manage/merchants/[merchantId]/**` | ✅ Converted in 3a–3g: all 51 reachable files. The 56 unreachable files are excluded; scope them with `scripts/hq-reachability.js`. |
| 4 — Money movement | `/manage/transactions`, `/manage/disputes`, `/manage/platform-fees`, `/manage/subscriptions`, `/manage/cash-drawers`, `/manage/reports/tax` | `/manage/transactions` ✅ converted 2026-09-28 against the rules as they stand today, including §3.5, §4.9, §5.6–§5.8 and §13.4 ([plan and record](features/hq-redesign/transactions-conversion-plan.md)). Its Chargebacks section also renders on `/manage/disputes`. `/manage/disputes` and `/manage/platform-fees` (+ `…/[merchantId]`, and all of `components/platform-fees/**`) ✅ converted 2026-09-29 ([record](features/hq-redesign/disputes-platform-fees-conversion-plan.md)); no HQ-2 additions. The rest are pending PR 4. |
| 5 — Internal operations | `/manage/users`, `/manage/roles-permissions`, `/manage/audit-logs`, `…/impersonation`, `/manage/support`, `/manage/dlq`, `/manage/profile` | `/manage/audit-logs/impersonation` ✅ converted 2026-09-29 against the current rules (§3.5, §4.9, §5.3, §5.7, §13.4): server-paged at 10 with `PaginationBar`, a card grid below `xl`, and end reasons as neutral words. `/manage/users` (list) ✅ converted 2026-09-29 with its skeleton ([record](features/hq-redesign/users-conversion-plan.md)); its `[userId]` detail page is still pending. `/manage/audit-logs` ✅ converted 2026-09-29 ([record](features/hq-redesign/audit-logs-conversion-plan.md)): pill-rail tabs, a muted toolbar, `variant="data"` from `2xl` with record cards below sharing one detail component, paged at 10, anomalies and failures marked by words and weight. `/manage/support/kds-mirror` (KDS) ✅ converted 2026-09-29 with its own `loading.tsx` ([record](features/hq-redesign/kds-conversion-plan.md)): one `Panel` per tab, a neutral station board, tables paged at 10 with record cards below their fit breakpoint, send failures the only colour (HQ-2); `/manage/support/kds-truth` is a bare `redirect()`. `/manage/dlq` ✅ converted 2026-09-29: a status `StatRow` that doubles as the filter, a §5.2 toolbar, a `variant="data"` table server-paged at 10 with record cards below `lg`, and the detail `Sheet` became a centred `Dialog`. It reuses the `/manage/transactions` `ledger-primitives`, and its alarms are listed under HQ-2. `/manage/support` (the inbox list) ✅ converted 2026-09-29 with its `loading.tsx`: a KPI `StatRow`, a pill status rail, a `FilterSelect` toolbar, `variant="data"` with record cards below `lg`, server-paged at 10 (it previously loaded 50 and dropped the rest), neutral status and priority pills, with unread, urgent and unassigned marked by weight. It also reuses `ledger-primitives`. Its `[ticketId]` thread (amber internal-note surfaces, green/red/amber action buttons, `<Separator>` and `border-t` dividers) and `support/new` (a blue callout) are still pending. `/manage/profile` ✅ converted 2026-09-29 with a new `loading.tsx` ([record](features/hq-redesign/profile-conversion-plan.md)): it now shares `ProfileIdentityPanel` and `ClerkAccountPanel` (`components/profile/AccountProfile.tsx`) with `/dashboard/profile`, so the Clerk theming exists once; the HQ role is a neutral pill. The rest are pending PR 5. Rewrite the hand-rolled skeletons in the same PR (§14.4). |
| 6 — Devices and configuration | `/manage/devices`, `…/overview`, `/manage/device-catalog`, `/manage/nmi-integration`, `/manage/settings/integrations`, `/manage/settings/billing-catalog` | `/manage/devices`, `…/overview` and `…/[deviceId]` ✅ converted 2026-09-29 against the current rules ([plan and record](features/hq-redesign/devices-conversion-plan.md)). `/manage/device-catalog` ✅ converted 2026-09-29 ([record](features/hq-redesign/device-catalog-conversion-plan.md)): a `StatRow` panel, a neutral callout, a §5.2 toolbar on the `ledger-primitives` `FilterSelect`, and the collapsible grouped list became a `variant="data"` table sorted in category order, with record cards below `xl`, paged at 10. The form dialog goes full-screen on phones and carries no rules. `DeviceRegistryMetricCard` is deleted. The rest of PR 6 is pending. `/manage/nmi-integration` ✅ converted 2026-09-29: skeleton D (`width="narrow"`), one `Panel` with a status well (saved/not-set as words, no pills on the muted surface) and a credentials form, save feedback via toasts. `/manage/settings/integrations` ✅ converted 2026-09-29: skeleton D, one `Panel` per integration (Valor central SaaS rail, NMI billing, OrderOut menu-push), sharing `StatusWell` / `StatusItem` / `Field` from `settings/integrations/IntegrationPrimitives.tsx` with `/manage/nmi-integration`. The Valor cutover became its own `PanelSection` (the `border-t` rule is gone) with a `Checkbox` confirm, labelled dry-run vs live figures and a capped plan list; its only colour is the destructive button. The OrderOut dead-letter count is on HQ-2 and now counts only live entries. `/manage/settings/billing-catalog` ✅ converted 2026-09-29 ([record](features/hq-redesign/billing-catalog-conversion-plan.md)): the one `<Card>` of three inline forms became a read view. The station plan is a `StatRow`; services (inactive ones included) and device mappings (every category, with "Not mapped" said in words) are `variant="data"` tables paged at 10, with record cards below `xl` and `lg`. Every record opens a centred editor from `components/billing/catalog/`. Active and inactive are a status select, not a `Checkbox`, because a checked control fills with `--primary` and turns violet in a portal (C5). `/manage/website-editor` (+ `…/pages/[route]`, `…/categories`, `…/blocks`) ✅ moved from `/admin` and converted 2026-09-29 ([record](features/hq-redesign/website-editor-conversion-plan.md)): the marketing CMS left its own shell and ~1,430 lines of bespoke CSS for `PageShell as="div"` with a route pill rail; the pages list is a `variant="data"` table with record cards below `lg`, paged at 10; the section editor and TipTap were rebuilt on `Input` / `Select` / `Textarea` with tier-2 section cards and one shared `ImageLibraryDialog`; categories and blocks edit in centred dialogs. `/admin/**` redirects in `next.config.ts`. |

`/manage/settings` is a bare `redirect()` and `/manage/unauthorized` is a minimal error surface. Neither needs any change.

> **"Converted" means the page matched Part A as it stood when its family landed.** Most of that work predates the rules added on 2026-09-28: §3.5 colour, §4.9 empty states, §5.6–§5.8 tables and §13.4–§13.6 mobile. The gaps those rules open in converted pages are listed in §14.8. Fix them the next time you touch the file.

**How the conversions were verified**
- **Types:** `tsc --noEmit` shows zero errors in changed files. The project total fell from 822 to 805, because each `AnalyticsTooltip` swap retires a pre-existing Recharts `Formatter` error.
- **Lint:** ESLint matches the baseline.
- **Known type errors:** two pre-existing errors remain under `analytics/components/`. They are `AuditLogActivityMonitor`'s `PlatformAuditLogRow[]` mismatch and `DeviceStabilityIndex`'s `SetStateAction` argument. Both are untouched by the conversion and worth fixing separately.
- **Live DOM, Family 2 routes:** checked with a real HQ session at 1440px and 375px. Each had one `<main>`, `visualViewport.scale === 1`, and no page-level horizontal overflow.
- **`/manage/analytics` has not been checked in a browser.** The case most worth looking at: `StatRow` panels that stack two rows (3+2, 4+3, 3+3) to show 5–7 figures, because `StatRow` places its dividers by `nth-child`.

### 14.6 Reference implementations — what the HQ redesign established

These four areas are the HQ patterns to copy. Each bullet below is a decision the code already makes. Where one of them breaks a Part A rule added later, it is listed in §14.8, not here.

#### 14.6.1 HQ home — `/manage` (Mission Control)

**Files:** [`app/manage/page.tsx`](../app/manage/page.tsx) and, in [`app/manage/components/`](../app/manage/components/): `PlatformStatusLine`, `PlatformPulseSection`, `AlertsPanel`, `LiveActivityFeed`, `DeviceFleetMap`, `OrdersHeatmap`, `MerchantSpotlightSection`, `HealthDashboard`.

**Page order and layout**
- The page runs `PageHeader`, then the platform status line (shown on every tab), then the tabs. "Invite Admin" renders only on the Dashboard tab.
- **Status-line links switch tab before they scroll.** Radix unmounts inactive tabs, so `#alerts` and `#fleet` do not exist until the Dashboard tab is active. The link switches tab, then calls `scrollIntoView` on the next frame; the targets carry `scroll-mt-24`.
- **Rows keep their own height:** `grid items-start gap-6 md:grid-cols-12`. Without `items-start`, the Order Volume chart was padded out to the height of the alerts list.
- **Phone order:** alerts lead on phones, and `md:` restores the desktop order. It is one set of blocks reordered with `order-*`, not two branches.
- **Adaptive split:**
  - With events: the feed takes `md:col-span-5` beside the fleet at `md:col-span-7`.
  - With none: the fleet leads at full width and the feed collapses to its one-line empty state.

**The panels**
- **Alerts:** severity-sorted, then paged 10 at a time, with the page clamped and an "11–20 of 29" count (§5.7). This replaced a `max-h-[500px]` scroll well.
- **Fleet:**
  - Grouped by merchant, **with every group collapsed by default**.
  - Group headers show state by weight: `font-medium text-foreground` for groups with problems.
  - Tiles are `md:grid-cols-2`; three columns left about 130px per tile.
  - Station state is a neutral glyph plus `sr-only` text, not a coloured dot.
- **Live activity feed:** the one list that scrolls internally (`max-h-[min(60vh,32rem)]`, 50 events). See §5.7.
- **Spotlight:** 10 cards, then "Showing 10 of N merchants" and "Browse all merchants". The grid is never unbounded.
- **KPI deltas are honest** (§6.2), and on phones they hide along with the meta line.
- **Orders heatmap:** tests for empty with `every(d => d.count === 0)`, because the feed always returns 24 buckets. When empty it shows "No orders in the last 24 hours" at the chart's 300px height.

**Health tab**
- Opens on the **Critical** filter. When nothing matches: "No merchants need attention right now."
- On phones, count chips and a fixed sort replace the two selects.
- The score legend moves into a "How scoring works" popover.
- The 64px score disc becomes a small pill. A separate word badge was removed because "Critical 48" said the same thing twice.
- The whole card is one stretched overlay button, with real actions stacked above it.

#### 14.6.2 Organizations — `/manage/organizations`, `…/[organizationId]`

**Files:** [`organizations/page.tsx`](../app/manage/organizations/page.tsx), [`[organizationId]/page.tsx`](../app/manage/organizations/[organizationId]/page.tsx), and in `components/`: `OrganizationAuditLogs.tsx`, `MerchantsTable.tsx`.

**List page**
- A KPI `StatRow` sits in a `Panel`, with metas hidden below `sm`.
- The toolbar (brand-blue `h2`, gloss hidden below `sm`) and the table sit **directly on the page**. The well is the surface (§5.2).
- Record cards appear below `lg`, with a mobile **"Fields"** picker that chooses which fields a card shows.
- There is an honest error state: a neutral well with "We hit a snag loading organizations", Retry and Go Back. The list skeleton is shaped like the page, including the phone-width trims.

**Detail page**
- A back pill, then an identity row: mono id, domain, and "Created …". The logo was dropped.
- The DS-CTL-05 tab rail is centred by scrolling the rail itself (§13.2, D-24). `?tab=` deep-links a tab.
- Roles, Members and Merchants tables sit on the page. Audit and Settings sit in `Panel > PanelSection`.
- **On record cards, values are plain text, not pills.** On Roles: "a tinted badge on a tinted surface reads as a box inside a box".

**Audit tab** (`OrganizationAuditLogs`)
- It queries by the org's merchant ids. With no merchants it says so instead of querying, because an empty filter would return the whole platform's log.
- Action names are humanised ("Created menu item").
- Severity is neutral; failures are marked by weight.
- Times are relative, with the absolute time in `title`.
- Server-paged at 10.

**Danger Zone:** the family's one use of colour (§3.5, use 3).
- `rounded-2xl border-0 bg-destructive/5 p-4` with a destructive button.
- Its heading keeps the standard brand-blue `PanelSection` treatment. Recolouring it needed a descendant selector that silently stopped matching. The destructive signal belongs on the action row, which already carries it.

#### 14.6.3 Analytics — the Analytics tab on `/manage` and `/manage/analytics`

These are two surfaces that share nothing (§14.7):
- **The tab:** `AnalyticsContent`, plus `GrowthSection`, `RevenueSection`, `OperationsSection` and `PaymentsSection`.
- **The route:** [`analytics/page.tsx`](../app/manage/analytics/page.tsx), plus 15 components in `analytics/components/`.

**Controls**
- **Sticky range bar (tab):** placed at the top level, opaque, no rule, left-aligned: `sticky -top-4 z-20 -mx-4 -mt-4 bg-background px-4 pb-2 pt-4 sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6`.
  - A sticky element only travels within its parent, so this bar cannot live inside a panel.
  - It was briefly centred; that left the controls floating mid-row.
- **No title panel** that repeats the page header. It cost a third of the screen.
- **One period control per tab (route):** a `SelectTrigger aria-label="Period"` pill. It sits left on phones and right from `md`.

**Layout**
- **Adaptive grids:** a panel renders only when it has content, and its sibling spans the gap. For example, Lorenz + whale list at `lg:grid-cols-7`. An empty half collapses to a one-line note (§4.9).
- **ChurnRadar:** one summary sentence replaced three tiles that "spent a full row saying '1 / 0 / 0'".

**Tables**
- `Table variant="data"` inside `Panel > PanelSection`.
- Paged 10 at a time with `useClientPagination` + `PaginationBar`, which replaced the `max-h-80` / `max-h-96` scroll wells.
- On phones, a column picker with the `min-w` lifted (§5.8). Expandable merchant rows swap to cards.

**Charts**
- The `analytics-primitives` helpers (§6.3).
- Honest empties (`ChartEmpty`, `isEmptySeries`) and `—` for unknown values.
- Minimum-sample thresholds ("Needs 10+ merchants with sales") and coverage captions for sparse series.

**Colour removed:** tinted table rows, green/red month-over-month figures, slate icon plates, tier colours, and severity and category pills. All became words, or weight.

#### 14.6.4 Merchants — list, card, wizard, detail workspace

**Files:** [`merchants/page.tsx`](../app/manage/merchants/page.tsx), [`components/admin/MerchantCard.tsx`](../components/admin/MerchantCard.tsx), [`merchants/new/wizard.tsx`](../app/manage/merchants/new/wizard.tsx), `merchants/[merchantId]/components/**`.

**List**
- Grid view is the default, and the only view on phones: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`.
- List view is a table with a card fallback.
- Server-paged at 10, with a row-count line ("N merchants found").
- Empty and "No Merchant Access" states are written out in words.

**`MerchantCard`**
- A `bg-muted/45` record card with a neutral status `Badge`.
- The logo plate is hidden below `sm`.
- The footer has no rule, and "View as merchant" is centred.

**New-merchant wizard**
- `PageShell width="narrow"`. Back and Continue sit outside the panel.
- Neutral step pills: complete is `bg-muted`, active is `ring-1 ring-border`. The green was removed.
- Phones show step numbers only, with the full title in `title`.
- Date of birth uses `DatePopover captionLayout="dropdown"`. `calendar.tsx` renders that dropdown as a Radix `Select` rather than a native `<select>`.

**Detail workspace (Family 3)**
- Card fallbacks below `lg` for locations, devices and audit. Row and card render the same `AuditLogDetail`.
- **Audit changes appear as a diff.** Each key gets one row: the old value struck through, `→`, then the new value. This replaced two value lists.
- **Humanised metadata:** "Chrome 152 on Windows", "Internal network". The raw value sits underneath in `font-mono text-xs text-muted-foreground`.
- **No hover-reveal and no slide-in on expand** (§7).
- **One `h1` per page:** a tab's own title is a `PanelSection` label.
- **Neutral status badges.** As one commit put it, "the status word already says 'Past Due'".
- **Skeletons instead of spinners.** The Overview skeleton mirrors its 4 + 3 tiles over a two-up chart row.
- **Filter selects:** no leading icons (the placeholder already says what the filter is), and `w-full min-w-0` triggers so labels clamp instead of overflowing.
- **Pie colours:** zero-value slices are filtered out *before* colours are assigned (§6.1).

### 14.7 Traps

1. **A controlled `Tabs` ignores a synthetic `click()`.** These pages wire `value={activeTab}` + `onValueChange`, so an injected `element.click()` does not switch tabs. It silently reports *empty* tab panels, which reads as "the tab is broken". Drive tab content with a real, trusted click, or the evidence is wrong.
2. **Radix unmounts inactive tabs.** A link to `#alerts` on another tab has nothing to scroll to. Switch the tab first, then scroll on the next frame (`requestAnimationFrame`), and give the target `scroll-mt-24`.
3. **These files are CRLF.** A multi-line search/replace built with `\n` joins misses every time. Normalise to `\n`, edit, then write back `\r\n`.
4. **The route audit matrix undercounts.** It counts route `page.tsx` files only, so co-located `components/` directories are invisible to it.
   - `/manage/analytics` was really 16 files and 484 cards, not 1 file and 69.
   - Scope work with `scripts/hq-reachability.js`, not file or `<Card>` counts.
5. **`/manage/analytics` and the Analytics tab on `/manage` are not duplicates.** They share zero components and zero query hooks.
   - `AnalyticsContent` reads `use-platform-analytics-layer2` (4 aggregate hooks).
   - The route reads `use-platform-analytics` (31 granular hooks) and has its own 15 components.
   - Their three same-named tabs render different content.
   - Collapsing one onto the other would delete live surfaces. Which metrics survive is a product decision.
6. **`StatRow` takes only `columns={2|3|4}`.** To show 5–6 figures, stack rows.
7. **`StatTile`'s `meta` already renders a `<p>`.** A `meta` value that returns another `<p>` is invalid nested HTML.
8. **Some commit messages describe states that a later commit reversed.**
   - The range bar was centred, then left-aligned again.
   - The fleet status went from dot to pill to glyph.
   - Trust the code, not the log.

### 14.8 Known gaps in converted HQ pages

Found by the 2026-09-28 audit. Each row is a Part A rule that the converted page predates. Fix a row when you next touch its file; one PR per row is not the plan.

Unless a path says otherwise, it is under `app/manage/`. Line numbers are as of the audit.

**Colour (§3.5)**

| Where | What | Fix |
|---|---|---|
| `components/admin/MerchantCard.tsx:44,48` · `organizations/[organizationId]/components/MerchantsTable.tsx:23,32` · `merchants/[merchantId]/components/BusinessInfoTab.tsx` | Logo plates in `bg-primary/10 text-primary` | `bg-muted text-muted-foreground` |
| `components/AnalyticsContent.tsx:31` | Active tab text is brand blue | Neutral active state (§4.5) |
| `components/DateRangePicker.tsx:146,182` | The selected preset has a solid brand fill; the custom field has a brand border. It also introduces three new blues. | Neutral selected segment |
| `components/AlertsPanel.tsx:237` | Brand-blue "Show devices" link | `text-foreground`, underline on hover |
| `analytics/page.tsx:652` | Whale trend coloured green/red | Glyph and sign, neutral |
| `analytics/page.tsx:117` | `bg-destructive` count pill on the Revenue & Risk tab | Neutral count pill |
| `analytics/page.tsx:461` | GPV trend stroke is `var(--primary)` | `var(--brand)` (§6.1) |
| `analytics/components/TerminalUtilizationHeatmap.tsx:399` · `MultiLocationComparison.tsx:180` | Amber idle-share meter; gold and blue rank medals | Neutral. Row order already shows rank. |
| `organizations/page.tsx:355` | Green "Directory Sync: Enabled" icon, plus a dead green dot in a comment at `:348` | Neutral icon; delete the comment |
| `organizations/[organizationId]/components/**` | About 34 decorative lines, listed below | Neutral; delete the illustration |
| `merchants/new/wizard.tsx` (13 markers) | Red required-field asterisks | The label's colour; red only once a field is invalid |
| `components/LiveActivityFeed.tsx:42` · `components/AlertsPanel.tsx:154` · `CreateMerchantsButtons.tsx:244` | Load errors shown as raw red text | Neutral error sentence with Retry (§4.9) |
| `CreateMerchantsButtons.tsx:574` · `AddMerchantButtons.tsx:414` | `from-white` scroll fade, which is wrong in dark mode | `from-card` |

Decorative colour in `organizations/[organizationId]/components/**`:
- `SendOrganizationMembersInviteButton:227-236`: a `bg-primary` circle with red and yellow avatars. This is the most "generated" illustration in the codebase.
- `AdminInviteWizard`: step fills, selected rings, emerald success text and a yellow note.
- `bg-primary/10` initials avatars in `ResendAdminInvitePopup`, `RemoveUserPopup` and `RevokeAdminInvitePopup`.
- Tinted chips and blue buttons in `CreateMerchantsButtons` and `AddMerchantButtons`.

**Tables (§5.3, §5.6–§5.8)**

| Where | What | Fix |
|---|---|---|
| `analytics/page.tsx:566-686` (whale merchants, 6 columns, `min-w-[620px]`) · `LocationDensityInsights.tsx:483-568` (state breakdown) · `PaymentMethodMix.tsx:96-178` (fee exposure) | The table shares a grid row with a chart | Give it its own row (§5.6) |
| `FleetHealthDashboard.tsx:335-384` (hardware census) | 3 columns, but with `min-w-[380px]`, in a `md:grid-cols-2` cell | Drop the `min-w`; the table then qualifies for the §5.6 exception |
| `analytics/page.tsx:628` · `LocationDensityInsights.tsx:498,555` · `DeviceStabilityIndex.tsx:361,450` | A scroll well on a wrapper, with no sticky header and no pager. These now pass `bounded={false}`, which keeps today's behaviour rather than nesting two scroll areas. | Page them, then delete the wrapper and the opt-out (§5.7) |
| `ChurnRadar` (`PREVIEW_ROWS`) · `MultiLocationComparison` (`TABLE_PREVIEW_ROWS`) | "Show all N" unrolls the table | Page it |
| `merchants/page.tsx` · `OrganizationAuditLogs.tsx` · `components/AlertsPanel.tsx` · `merchants/[merchantId]/components/AuditLogsTab.tsx` | Hand-rolled pagers. All now page at 10 (2026-09-29), but they still use their own controls. | `PaginationBar` |
| `app/manage/transactions/**` (`PAGE_SIZE = 25` in the page, `ChargebacksSection`, `AuditLogSection`; `BATCH_PAGE_SIZE = 25`) | Still pages at 25. It is being converted in a parallel Family 4 change, so it was left to that work. | 10 per page (§5.7) |
| `merchants/page.tsx:415-419` | The 1060px list table shows from `md`, so it scrolls inside its well until `2xl` | Cards until the table fits, or fewer columns (§5.3) |
| `organizations/page.tsx:320` | A `min-w-[900px]` table switches at `lg`, where the column is 720px | Switch at `xl` |

**Empty states (§4.9)**

| Where | What |
|---|---|
| `components/RevenueSection.tsx` (8 charts) · `GrowthSection.tsx:96,138` · `OperationsSection.tsx:242,271` | No empty check, so they draw bare axes or an empty pie |
| 11 analytics components: `ChurnRadar:91`, `DiscountAbuseDetection:87`, `FleetHealthDashboard:306`, `MerchantActivationTimeline:32`, `MerchantOnboardingFunnel:83`, `OrderTypeIntelligence:99`, `PaymentMethodMix:77`, `PaymentTerminalHealthMonitor:190`, `StaffLaborAnalytics:112`, `VoidRefundIntelligence:70`, `ConnectivityStrip:36` | `return null` when data is missing, so the section silently disappears |
| `MerchantActivationTimeline.tsx:79` · `VoidRefundIntelligence.tsx:96` · `analytics/page.tsx:556` · `TerminalUtilizationHeatmap.tsx:717,729` · `DeviceStabilityIndex.tsx:128` | The empty text is hidden on phones by `max-md:hidden` |
| `PaymentMethodMix.tsx:170` · `FleetHealthDashboard.tsx:377` · merchant-detail `OverviewTab.tsx:256,284` | Generic "No data" copy |

**Mobile (§13.4–§13.6)**

| Where | What |
|---|---|
| `components/RevenueSection.tsx`, `OperationsSection.tsx`, `GrowthSection.tsx` (the Analytics tab on `/manage`) · the tab-wide trims on `/manage/analytics` | About 20 captions and metas that carry scope are hidden on phones, e.g. "Top 10 merchants", "N of M days have measurable data", "Last 30 days", "Needs 10+ merchants with sales". §13.4 says scope stays, but these were hidden deliberately in the earlier analytics declutter. **Decision pending:** opt them in with `showCaptionOnMobile` / `showMetaOnMobile`, and narrow the route's `max-md` trims to descriptive lines. |
| `organizations/[organizationId]/page.tsx:431, 493-496` · `merchants/[merchantId]/components/StaffTab.tsx:326` | The Members subtitle and member avatars still show on phones |
| `components/admin/MerchantCard.tsx:53-55` · `merchants/page.tsx:549-551` | The card subtitle line still shows on phones |
| `merchants/page.tsx:365` (`MerchantGridSkeleton`) · the org-detail skeleton | Skeletons reserve a logo slot the cards no longer render |
| `/manage/analytics` | Detail is stripped at `max-md` via `useIsMobile`, not at `sm` via CSS |
| `page.tsx:70-84` | Tab triggers hide their label on phones and have no `aria-label` |
| `HealthDashboard` filter chips | The chips are bordered, unlike the borderless DS-CTL-03 chip |

**Other rules**

| Where | What | Rule |
|---|---|---|
| `PlatformPulseSection` (tier rule) · `AuditLogsTab.tsx:268` (`divide-y`), `:1056` (`border-t`) · `RiskStrip` | Horizontal lines | §5.5 |
| `AuditLogsTab.tsx:508` · the org skeleton and error `PageShell` | `animate-in` on the page root, which breaks `sticky` | D-05 |
| `components/DateRangePicker.tsx:202` · `AuditLogsTab.tsx:601` | Popovers are `rounded-xl border shadow-lg`, not `rounded-2xl` | §4.6 |
| `AuditLogsTab.tsx` | A field at rest is `bg-background/50` | §4.2 |
| `MerchantCard`, the merchant list cards, the org list cards, `MerchantsTable` cards | Clickable `div`s, not `<button>`s | §5.3 |
| `organizations/[organizationId]/page.tsx:265` | The tab rail centres using `offsetLeft`, but the rail is not `relative`. Not checked in a browser; the centring is probably off by the page padding on phones. | §13.2 |
| `DeviceFleetMap.tsx:70-74` (says problem groups open by default) · `MerchantCard` (calls its hover a ring) · `analytics-primitives.tsx:135-165, 421-423` | Stale comments | — |

---

## §15 Merchant dashboard — `/dashboard/*`

Merchant pages follow Part A as written. This section holds the merchant adoption record, the converted slices to copy, and the known gaps.

### 15.1 Shell adoption — copy the ✅ pages when converting

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

> ⚠️ **Not yet verified in a browser.** The three ✅ pages are confirmed by compiled-CSS inspection, HTTP 200, and `tsc` — not by looking at them. When this was written, the local dev Clerk user was an HQ admin, so `/dashboard/*` redirected to `/manage`. Give them a visual check in both themes before merging.

> **The "Tokens ✅" column predates §3.5.** Three of those pages still carry decorative colour: home (13 lines), `locations` (17 lines) and `orders/[orderId]` (35 lines). See §15.4.

### 15.2 Merchant-specific notes

- **Every merchant page renders a second `<main>`.** The layout renders one, and each page's `PageShell` adds another (58 pages). The fix is mechanical: pass `as="div"` as HQ does (§14.1). It is tracked in [`merchant-double-main-followup-ticket.md`](features/hq-redesign/merchant-double-main-followup-ticket.md). Do not fix it inside an HQ PR.
- **`app/dashboard/menu/**` is in scope.** It was once a separate epic. The menu tree converts like any other page, and the Item Library slice below is done.
- **The 277-file `<Card>` migration is not a mandate** (C6). Leave unconverted pages alone until you convert them.

### 15.3 Converted slices

#### Converted: the Item Library slice

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

#### Converted: `ReceiptModal`

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

> **Since D-12, both modules return neutral styles.** `menu-item-badges.ts` exports `NEUTRAL`,
> and `scopeColor()` ignores the level. Their value now is the labels, and being the single
> place to change them, not the colours.

> ⚠️ **Both files are `.ts`, which Tailwind does not scan (C7).** Their classes generate CSS
> only because each one is *also* written literally in some `.tsx`. Before adding a new class
> to either, grep the `.tsx` files for it — an unmatched class reaches the DOM with no rule
> behind it and the element silently falls back to inherited styling.
- **`lib/messaging/notification-shared.ts` `COLORS`** — email-template palette, deliberately different from the UI accent. Do not unify.

### 15.4 Known gaps against the 2026-09-28 rules

The 2026-09-28 audit found decorative colour on about 695 text lines and 315 tinted-background lines across more than 150 merchant files. Most are on unconverted pages and get fixed as each page converts.

The rows below are the exceptions: gaps on or under the reference pages, where copying a neighbour would spread them.

| Where | What | Rule |
|---|---|---|
| [`StaffDataTable.tsx`](../components/dashboard/staff/StaffDataTable.tsx): green at `:541, :561, :670`, orange at `:658`, emerald at `:1008` | The reference table still colours "Active", "PIN Set", "Activate" and "Demote". D-12 recorded this as fixed; it is not. | §3.5, §4.6b |
| [`lib/constants/table-status.ts`](../lib/constants/table-status.ts) → `TableStatusBadge` | The last `BadgeStyle` module that still carries colour | §4.6b |
| `app/dashboard/page.tsx` | The amber PIN banner, and a delta coloured with `growth > 0 ? emerald : rose` | §3.5, §4.7 |
| `ChartCard` | The default empty copy is "No data available" | §4.9 |
| `OverviewSection` on `app/dashboard/page.tsx:477` | `divider` defaults to `true` and draws a rule | §5.5 |
| `components/dashboard/orderout/OrderOutTab.tsx` ("Delivery channels connected") | A panel tinted `border-green-200 bg-green-50/40` | §3.5 |
| `components/scheduling/reports/ScheduleReports.tsx` | The overtime meta is red, and "No overtime" is green | §3.5 |
| `TimesheetsView.tsx:330` | Avatars still show on phones | §13.4 |
| Brand blue away from headings: 84 lines of icons, chips, links and active states | e.g. `ReportTable.tsx:115,117` sort arrows, `SettingsSectionNav.tsx:74` | §3.5 |
