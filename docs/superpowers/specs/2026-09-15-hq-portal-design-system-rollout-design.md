# HQ Portal — Design-System Rollout

**Date:** 2026-09-15
**Surface:** DEXA HQ Admin portal, `app/manage/**`
**Type:** Frontend presentation refactor
**Status:** Design approved; spec pending review

---

## §0 What this is

Bring `/manage/**` onto the visual system already shipped for the merchant
dashboard and documented in `docs/UI-DESIGN-SYSTEM.md`.

This is a presentation refactor. It changes how HQ pages are composed, not what
they do. The behaviour freeze in §7 is the binding constraint: if a change
cannot be made without altering behaviour, it does not belong in this ticket.

**Non-goal:** retrofitting the merchant dashboard. See §8.

---

## §1 Verified baseline

Measured against `haydarStructure-Dev` at commit `6bdf64cf`, not copied from the
ticket. Every number below reproduces with the commands in §10.1.

| Fact | Value |
|---|---|
| TSX files under `app/manage` | 225 |
| Files importing `@/components/ui/card` | 98 |
| Files importing Sheet panels | 6 |
| Files importing `@/components/dashboard/shell` | **0** |
| Files using `DataPageSkeleton` | 12 |
| HQ `loading.tsx` boundaries | 9 (6 shared, 3 hand-rolled — see §2.3) |
| Distinct hand-rolled `<h1>` class strings | **17** |
| `<main>` elements in a live `/manage` route | **1** |

The 17 header treatments matter more than the 98 card imports. Cards are a
composition problem; 17 different page titles mean there is no page-header
contract at all.

### 1.1 Live-DOM verification

`/manage/merchants` was loaded in a real browser against the dev server:

```json
{ "url": "http://localhost:3000/manage/merchants",
  "hasSidebar": true, "mainCount": 1, "scale": 1,
  "countLine": "6 merchants found", "errorish": false }
```

This establishes three things the plan depends on: HQ renders with real data for
a local session, the evidence pipeline works, and **HQ currently has exactly one
`<main>`**.

---

## §2 The finding that shapes the plan

### 2.1 The HQ shell is already converged

`app/manage/layout.tsx:533-566` and `app/dashboard/layout.tsx:1626-1662` are
structurally identical: same `SidebarProvider` with `dashboard-sidebar-theme`,
same `<main>` wrapper, same scroll container, same `p-4 sm:p-6 pb-20 sm:pb-6`.

Workstream B of the ticket is therefore much smaller than it reads. The HQ
chrome does not need aligning — it is already aligned. **The entire gap lives
inside `{children}`.** Content width, page padding, and canvas treatment are
inherited correctly today.

One incidental difference: the HQ scroll container carries `min-w-0`, the
merchant one does not. HQ's is the more correct of the two. Leave both alone.

### 2.2 `PageShell` cannot be imported into HQ as-is

`PageShell` renders a `<main>`. The HQ layout already renders one. Importing it
directly would nest two `<main>` landmarks — invalid HTML and a screen-reader
regression.

This is not a new discovery; it is an established contract. `DataPageSkeleton`
solved it for loading states, and its own source says why:

```ts
// components/dashboard/loading/DataPageSkeleton.tsx:24-28
 * `page` (default) wraps the skeleton in `PageShell`, matching merchant
 * ... plain `space-y-6` div, so they pass `plain` to avoid a second `<main>`.
shell?: 'page' | 'plain'
```

There is already a test asserting it
(`DataPageSkeleton.test.tsx:211-217`, *"omits `<main>` for HQ routes that own
their layout"*), and every HQ `loading.tsx` that uses `DataPageSkeleton` passes
`shell="plain"` (six of nine — the other three are hand-rolled, see §2.3).

So HQ's **loading** states already follow this rule while HQ's **pages** have no
equivalent. That asymmetry is what this ticket closes.

### 2.3 Three skeletons are shaped to the *un-converted* pages

Six of the nine HQ `loading.tsx` files pass `shell="plain"` to
`DataPageSkeleton`. Three do not, and they are not oversights:

| File | Why |
|---|---|
| `support/loading.tsx` | Hand-rolled; docblock explains the page "is built from raw cards and a bordered tab strip rather than the dashboard shell primitives, so a shared variant would promise panel chrome that never arrives" |
| `support/[ticketId]/loading.tsx` | Delegates to a bespoke `SupportTicketSkeleton` |
| `users/loading.tsx` | Hand-rolled, and itself imports `Card` — it mirrors the card-based page |

This has a direct consequence the rollout must honour: **these skeletons
deliberately mirror the legacy card layout.** Converting `/manage/support` or
`/manage/users` without updating its skeleton in the same PR produces a loading
state that no longer resembles the page it precedes — the exact layout-shift
defect the loader ticket existed to remove.

So the rule is not "preserve `shell="plain"` everywhere". It is:

- Where a route already uses `DataPageSkeleton`, keep `shell="plain"`.
- Where a route has a hand-rolled skeleton, **convert the skeleton in the same
  PR as its page**, and prefer moving it onto `DataPageSkeleton` with
  `shell="plain"` once the page uses panel chrome — which is precisely the
  precondition the `support/loading.tsx` docblock says is missing today.

### 2.4 Family 1 is one unit, not three routes

`/manage`, `/manage/analytics` and `/manage/health` all compose from the 14
shared files in `app/manage/components/` (13 of 14 import `Card`).
`app/manage/page.tsx` is only 124 lines because it is a tab host that mounts
`HealthDashboard` and `AnalyticsContent` directly.

Splitting these into three PRs would mean touching the same shared files three
times with guaranteed conflicts, and would ship intermediate states where one
tab is converted and its sibling is not. They convert together.

---

## §3 Architecture

### 3.1 One new prop, no forked primitive

`PageShell` gains an optional polymorphic tag:

```tsx
// components/dashboard/shell/PageShell.tsx
export function PageShell({
  children,
  className,
  width = 'full',
  as: Tag = 'main',   // <- added
}: {
  children: React.ReactNode
  className?: string
  width?: 'full' | 'narrow'
  /** HQ routes sit inside the layout's <main>; they pass 'div'. */
  as?: 'main' | 'div'
}) {
  return (
    <Tag className={cn('min-w-0 space-y-6', width === 'narrow' && 'mx-auto w-full max-w-5xl', className)}>
      {children}
    </Tag>
  )
}
```

Because `as` defaults to `'main'`, **every existing merchant page renders
byte-identical HTML.** The change is additive.

The union is deliberately closed to `'main' | 'div'` rather than a generic
`ElementType`. HQ has exactly one need, and a closed union keeps the invariant
checkable.

**Why this and not a separate `AdminPageShell`:** a fork creates two components
with one meaning and two import paths, which is the drift the design system
exists to prevent. The ticket explicitly says not to silently fork the system.
The `as` prop follows the precedent `DataPageSkeleton` already set for this
exact problem.

### 3.2 Everything else is reuse

No other new primitives. `PageHeader`, `Panel`, `PanelGrid`, `PanelSection`,
`PanelRow`, `StatRow`, `StatTile`, `InsetTile`, table `variant="data"`, and the
§4 control recipes all apply to HQ unchanged.

`LocationIndicator` was already written to be HQ-safe — its docblock notes it
"deliberately reads no store of its own so it stays usable in the HQ `/manage`
surface."

### 3.3 Server components

Ten HQ pages are server components. The shell primitives are `'use client'`.
This is safe and already precedented in merchant code
(`app/dashboard/locations/[locationId]/settings/page.tsx` is a server component
importing `PageShell`). A client component rendered by a server component is
standard App Router usage; only the props crossing the boundary must be
serializable, and these are strings and nodes.

---

## §4 The conversion pattern

The dominant HQ page shape today, verbatim from `nmi-integration/page.tsx`:

```tsx
<div className="space-y-6">
  <div className="space-y-1">
    <h1 className="text-3xl font-bold tracking-tight">NMI Integration</h1>
    <p className="text-sm text-muted-foreground">Configure the …</p>
  </div>
  <DexaBillingNmiRailCard … />
</div>
```

becomes:

```tsx
<PageShell as="div">
  <PageHeader title="NMI Integration" subtitle="Configure the …" />
  <DexaBillingNmiRailCard … />
</PageShell>
```

This one substitution resolves the 17-way header split and is mechanical enough
to be low-risk. It is the first move on every page.

### 4.1 Structural conversions

Taken from the captured `/manage/merchants` baseline, which nests cards three
levels deep (a bordered stat box row, a `Card`-wrapped filter rail, then
bordered merchant cards each containing a bordered sub-grid):

| Legacy | Replacement | Rule |
|---|---|---|
| Row of bordered stat `Card`s | `Panel` > `StatRow` > `StatTile` | D-02, D-03 |
| `Card` wrapping a filter rail | `PanelRow` toolbar inside the content `Panel` | §2 skeleton A |
| `Card` per section inside a page | `PanelSection` inside one `Panel` | D-02 tier 1 |
| Card grid of records | `Panel` + `variant="data"` table; cards at `<sm` | §5.3 |
| Coloured stat numerals | Neutral text; colour only for real severity | §4.6b |
| Gradient page canvas + gradient title | Flat canvas, standard `PageHeader` | §8 blocklist |

### 4.2 Density is preserved

HQ tables stay dense. `StatRow` is used where a page shows 3-4 headline figures;
it is not a licence to convert an operational table into tiles. Where HQ needs
more density than the merchant recipe assumes, that is recorded as an exception
in §6 rather than resolved by inventing a parallel style.

---

## §5 Route inventory and dispositions

Full tree: 44 `page.tsx`, 9 `layout.tsx`, 9 `loading.tsx`. Per-route numbers are
`L` = lines, `C` = `<Card` occurrences, `T` = `<Table` occurrences.

**7 routes are absent from the ticket's Workstream C** and are folded into their
nearest family, per the DoD requirement that every route has a disposition.
They are marked ★.

### Family 1 — HQ home, analytics, health (one PR)

| Route / file | L | C | T | Disposition |
|---|---|---|---|---|
| `app/manage/components/*` (14 files) | — | 13 files | — | panel/table conversion |
| `/manage` | 124 | 0 | 0 | shell + header; drop gradient canvas/title |
| `/manage/analytics` | 990 | 69 | 36 | panel/table conversion (largest single file) |
| `/manage/health` | 534 | 10 | 0 | panel conversion; severity colour retained |

### Family 2 — Merchant and organization operations

| Route | L | C | T | Disposition |
|---|---|---|---|---|
| `/manage/merchants` | 497 | — | yes | panel/table/filter conversion |
| `/manage/merchants/new` | — | — | — | shell/header + form |
| `/manage/create-merchant` | — | — | — | shell/header + form |
| `/manage/organizations` | 459 | 36 | 25 | panel/table conversion |
| `/manage/organizations/[organizationId]` | — | — | — | detail conversion |
| ★ `/manage/organizations/create-organization` | — | — | — | shell/header + form |

### Family 3 — Merchant detail workspace

`app/manage/merchants/[merchantId]/**` — 99 files, 36 card importers, including
50 files in `components/`, 15 in `components/sections/`, and 16 across
`MenuTab/`. The largest family by far; IA preserved exactly.

Includes billing, menu, orders, devices, terminal routes, and
★ `/manage/merchants/[merchantId]/locations/new`.

**This family is split into sub-PRs by tab** — a single 99-file diff is not
reviewable. Sub-PR boundaries are set during the audit, after the tab structure
is confirmed.

### Family 4 — Money movement and billing

| Route | L | C | T | Disposition |
|---|---|---|---|---|
| `/manage/transactions` | 1439 | 20 | 43 | panel/table conversion |
| `/manage/disputes` | 104 | 16 | 0 | panel conversion |
| `/manage/platform-fees` (+ `[merchantId]`) | 215 | 8 | 0 | panel conversion |
| `/manage/subscriptions` (+ `[merchantId]`) | 104 | 4 | 0 | panel conversion |
| `/manage/cash-drawers` | 7 | 0 | 0 | wrapper only → `components/CashDrawerAnalytics` |
| `/manage/reports/tax` | 289 | 0 | 0 | shell/header conversion |

### Family 5 — Internal operations

| Route | L | C | T | Disposition |
|---|---|---|---|---|
| `/manage/users` (+ `[userId]`) | 980 | 28 | 19 | panel/table conversion **+ rewrite `users/loading.tsx`** (§2.3) |
| `/manage/roles-permissions` | 439 | 0 | 0 | shell/header + panel |
| `/manage/audit-logs` | 851 | 7 | 29 | panel/table conversion |
| ★ `/manage/audit-logs/impersonation` | — | — | — | table conversion |
| `/manage/support` (+ `[ticketId]`, `new`) | 432 | 0 | — | shell/header; 20 files, 0 cards. **+ rewrite `support/loading.tsx` and `SupportTicketSkeleton`** (§2.3) |
| `/manage/dlq` | 29 | 0 | 0 | shell/header only → `DeadLetterQueueTable` |
| ★ `/manage/profile` | 86 | 4 | 0 | panel conversion, `width="narrow"` |

### Family 6 — Devices and configuration

| Route | L | C | T | Disposition |
|---|---|---|---|---|
| `/manage/devices` (+ `[deviceId]`) | 392 | 5 | 21 | panel/table conversion |
| ★ `/manage/devices/overview` | — | — | — | panel conversion |
| `/manage/device-catalog` | 1112 | 3 | 0 | panel conversion |
| `/manage/nmi-integration` | 24 | 0 | 0 | shell/header only |
| ★ `/manage/settings/integrations` | — | — | — | shell/header + panel |
| `/manage/settings` | 5 | 0 | 0 | **no change** — pure `redirect()` |
| `/manage/support/kds-mirror`, `kds-truth` | — | — | — | support tooling, assess in audit |
| ★ `/manage/unauthorized` | — | — | — | assess; likely intentional exception |

---

## §6 HQ exceptions

Recorded in `docs/UI-DESIGN-SYSTEM.md` as a new HQ section — an adoption matrix
plus exceptions — **not** a second copy of the system.

Anticipated exceptions, each requiring written rationale:

1. **Operational density.** HQ tables may run tighter than the merchant recipe.
2. **Severity colour.** `/manage/health` and DLQ encode real alarm states;
   colour is semantic there, not decorative, and is retained.
3. **Command-centre layout.** The `/manage` tab host keeps its dashboard
   composition; only its canvas, header and card nesting change.

Any exception discovered mid-rollout is added here before that PR merges.

---

## §7 Behaviour freeze

No change to: server actions, RPCs, queries, query keys, cache policy,
mutations, realtime subscriptions; schema, migrations, RLS, Edge Functions,
webhooks, crons, env vars; role/permission semantics or nav visibility;
impersonation or audit attribution; financial calculations, status transitions,
billing, device commands, support workflows; URL structure or deep links;
loading/empty/error/success semantics — **presentation only**.

Also frozen, specific to this rollout:

- `app/manage/layout.tsx` chrome — sidebar, permission gates, impersonation
  banner, notification bells, `MobileBottomNav`, command palette.
- The `shell="plain"` contract wherever an HQ `loading.tsx` uses
  `DataPageSkeleton`. The three hand-rolled skeletons are converted alongside
  their pages rather than frozen — see §2.3.
- No second `<main>` anywhere in `/manage`.

A functional defect found during conversion gets its own ticket. It is never
fixed inside a redesign PR.

---

## §8 Known issue, explicitly out of scope

Roughly 30 merchant pages nest a second `<main>`: `app/dashboard/layout.tsx`
renders one, and each page's `PageShell` renders another
(e.g. `app/dashboard/audit-logs/page.tsx:626`).

The `as` prop makes the correct behaviour available, but **this ticket does not
retrofit merchant pages.** That surface is already signed off, and changing it
here would violate the one-route-family-per-PR rule and put merchant regressions
in an HQ diff.

**Action:** file a separate follow-up ticket. Fix is mechanical once the prop
exists (`as="div"` on merchant pages, since their layout also owns a `<main>`).

---

## §9 Sequencing

| PR | Scope | Gate |
|---|---|---|
| **0** | `as` prop + test; audit + matrix; `UI-DESIGN-SYSTEM.md` HQ section; before-screenshots | Merchant HTML unchanged; matrix covers all 44 routes |
| **1** | Family 1 — `app/manage/components/*` + 3 routes | Tabs, health severity, analytics ranges intact |
| **2** | Family 2 — merchants/organizations lists + creation forms | Filters, sort, pagination, creation flows intact |
| **3a…n** | Family 3 — merchant detail, sub-PR per tab | IA unchanged; deep links intact |
| **4** | Family 4 — money movement | No figure or status transition changes |
| **5** | Family 5 — internal ops | Permission gates verified allowed + denied |
| **6** | Family 6 — devices/config | Device commands unchanged |

PR 0 ships no visible change by design: it is the prop, the audit and the
documentation, so every later PR has a contract to conform to.

---

## §10 Verification

### 10.1 Baseline reproduction

```bash
find app/manage -name "*.tsx" | wc -l                          # 225
grep -rl "components/ui/card" app/manage --include=*.tsx | wc -l  # 98
grep -rl "dashboard/shell"    app/manage --include=*.tsx | wc -l  # 0 -> rises per PR
grep -rho '<h1 className="[^"]*"' app/manage --include=*.tsx | sort -u | wc -l  # 17 -> 0
```

### 10.2 Automated

- **`tsc --noEmit`** is the type gate. `next build` compiles but crashes the
  worker (`0xC0000409`) in this environment, so it is not a reliable local gate;
  production build runs in CI before the final rollout PR.
- `npm run lint` on changed files.
- Vitest: a `PageShell` test mirroring `DataPageSkeleton.test.tsx:203-217` —
  asserts `as="main"` (default) emits `<main>` and `as="div"` does not.
- Per-PR: existing route/interaction tests for the converted area.

### 10.3 Invariant checks per PR

```bash
# no page-level <main> may appear under app/manage
grep -rn "PageShell" app/manage --include=*.tsx | grep -v 'as="div"'   # must be empty
# every rendered DataPageSkeleton in app/manage must still pass shell="plain".
# Match `<DataPageSkeleton`, not the bare name: support/loading.tsx mentions it
# in a docblock and a plain-name grep false-positives on it.
grep -rl "<DataPageSkeleton" app/manage --include=*.tsx | xargs grep -L 'shell="plain"'   # must be empty
git diff --name-only main… | grep -E '^(supabase|package|.*lock)'      # must be empty
```

Live-DOM assertion on each converted route: `document.querySelectorAll('main').length === 1`.

### 10.4 Evidence pipeline (proven)

Chrome DevTools MCP against local dev on port 3000:

1. `emulate` with viewport `1440x900x1`, `768x1024x1`, `375x812x2,mobile,touch`
   — **`emulate`, never `resize_page`**.
2. Assert `window.visualViewport.scale === 1` before trusting any capture.
3. Screenshot per route per width, light and dark.
4. Overflow check per width:
   `document.documentElement.scrollWidth <= window.innerWidth`.

Cold Turbopack compiles can exceed a 10s navigation timeout; use 120s on first
hit of a route. Restart the dev server before debugging "inert" pages, and check
`.next/BUILD_ID` freshness before trusting a "still broken" report.

### 10.5 Manual, per route

Permission-gated content verified with one allowed and one denied role.
Impersonation context correct where applicable. Dialogs fit viewport, 44px touch
targets. Focus order, visible focus, labels, contrast, reduced motion. Light and
dark. Loading, empty, error, populated and background-refresh states each
distinct and reachable.

---

## §11 Risks

| Risk | Mitigation |
|---|---|
| Family 3 is 99 files | Split by tab into sub-PRs; boundaries fixed in audit |
| `analytics/page.tsx` is 990 lines / 69 cards | Convert `app/manage/components/*` first; the page is largely a host |
| Shared components span families | Audit records the dependency map before PR 1 |
| Colour removal hides real alarms | §6 exception 2: severity colour is semantic and retained |
| Local build gate is unreliable | `tsc --noEmit` locally, production build in CI |
| Dev-session staleness | Restart dev server; verify `BUILD_ID` before diagnosing |

---

## §12 Definition of done

- [ ] All 44 routes have a disposition in the matrix, including the 7 ★ routes
- [ ] `UI-DESIGN-SYSTEM.md` has an HQ adoption matrix and approved exceptions
- [ ] Every in-scope family has a merged, page-scoped PR
- [ ] `grep -rho '<h1 className=' app/manage` returns zero page-level headers
- [ ] No `/manage` route renders more than one `<main>`
- [ ] `shell="plain"` preserved on every `DataPageSkeleton`-based HQ `loading.tsx`
- [ ] The 3 hand-rolled skeletons (§2.3) match their converted pages
- [ ] No backend, DB, POS, deployment-config or package changes in any PR
- [ ] Responsive, theme, a11y, loading-state and interaction evidence attached
- [ ] Abubeckr signs off visual direction; Temur approves merge
- [ ] Ali Dika verifies HQ workflows and the final route matrix
- [ ] Merchant double-`<main>` follow-up ticket filed (§8)
