# [WEB-A11Y] Merchant dashboard — nested `<main>` landmarks on 58 pages

**Surface:** Merchant dashboard, `app/dashboard/**`
**Type:** Accessibility defect / mechanical fix
**Priority:** Low-medium — real but not user-blocking
**Found during:** HQ portal design-system rollout (as a side finding; deliberately **not** fixed there)

---

## Summary

58 merchant dashboard pages render two nested `<main>` landmarks: one from the
dashboard layout, and a second from each page's `PageShell`.

The HTML spec allows only one `<main>` per document that is not `hidden`.
Screen-reader landmark navigation ("jump to main") becomes ambiguous, and
"skip to content" targeting is unreliable.

## Evidence

The layout renders the outer landmark:

```tsx
// app/dashboard/layout.tsx:1633
<main aria-label="Dashboard content" className="h-svh max-h-svh min-h-0 flex-1 …">
```

`PageShell` defaults to `<main>`:

```tsx
// components/dashboard/shell/PageShell.tsx
as: Tag = 'main',
```

And every consuming page renders it bare — verified, no merchant page passes
`as`:

```bash
grep -rn '<PageShell[^>]*as=' app/dashboard --include=*.tsx   # returns nothing
```

So e.g. `app/dashboard/tables/page.tsx:32` renders `<PageShell>` → a second
`<main>` inside the layout's.

Affected file count:

```bash
grep -rln "<PageShell" app/dashboard --include=*.tsx | wc -l   # 58
```

> Verified structurally rather than in a browser: the local dev Clerk user is an
> HQ admin, so `/dashboard/*` redirects to `/manage`. Confirm in a browser with
> a merchant login before closing.

## Why this was not fixed in the HQ rollout

The HQ redesign ticket freezes behaviour and requires one route family per PR on
the `/manage` surface. The merchant dashboard is a separate, already-signed-off
surface; editing 58 merchant pages inside an HQ PR would put merchant
regressions in an HQ diff and break that rule.

The enabling change already shipped with HQ PR 0: `PageShell` now takes
`as?: 'main' | 'div'`. Merchant output is unchanged (`as` defaults to `'main'`,
and byte-identity with the pre-prop component is asserted in
`components/dashboard/shell/__tests__/PageShell.test.tsx`).

## Proposed fix

Mechanical, one line per page:

```diff
- <PageShell>
+ <PageShell as="div">
```

The layout already provides the page's `<main>`, so the page-level shell should
be a `div` — exactly the rule HQ now follows
(`docs/UI-DESIGN-SYSTEM.md` §14.1).

### Decide first

`PageShell`'s default is `'main'` because merchant pages are its original
consumers. If all 58 pages pass `as="div"`, the default becomes wrong for every
caller and should probably flip to `'div'`, with the layout owning `<main>`
everywhere. Two options:

1. **Pass `as="div"` on all 58, keep the default.** Smallest conceptual change;
   leaves a default nothing uses.
2. **Flip the default to `'div'` and delete the prop from call sites.** Cleaner
   end state, but a larger blast radius — any future `PageShell` consumer
   silently gets a `div`, which is right inside these layouts and wrong in a
   standalone page.

Recommend (1) first as the safe mechanical pass, then (2) as a follow-up once
no caller depends on the `main` default.

`app/dashboard/settings/layout.tsx` is a layout, not a page — check whether it
should keep `<main>` or become a `div` depending on nesting.

## Acceptance criteria

- [ ] No merchant dashboard route renders more than one `<main>`
- [ ] `document.querySelectorAll('main').length === 1` on a representative
      sample (list, detail, settings, report) with a **merchant** login
- [ ] No visual change at 1440 / 768 / 375 — `PageShell`'s classes are identical
      for both elements (asserted in its test)
- [ ] Skip-to-content still lands correctly
- [ ] `grep -rn '<PageShell' app/dashboard --include=*.tsx | grep -v 'as="div"'`
      returns nothing (if option 1 is chosen)

## Out of scope

- HQ `/manage` pages — already correct; they pass `as="div"` as they convert.
- Any visual or behavioural change to merchant pages. This is landmark
  semantics only.

---

# Appendix — other defects found during the HQ rollout

Recorded here rather than fixed, per the redesign ticket's behaviour freeze
(§7: "If a functional defect is discovered, create or link a separate ticket.
Do not hide behaviour changes inside a redesign PR."). Each needs its own
ticket.

## A. `AlertsPanel` — React purity / cascading-render lint errors

`app/manage/components/AlertsPanel.tsx` fails three `react-hooks` rules, all
pre-existing (verified by linting the pre-conversion file from git, which
reports the same three):

| Line | Rule | Issue |
|---|---|---|
| ~67 | `react-hooks/set-state-in-effect` | `setState` called synchronously in an effect |
| ~77 | `react-hooks/set-state-in-effect` | same, in the filter/sort effect |
| ~99 | `react-hooks/purity` | `Date.now()` called during render |

The alert list is derived state (`allAlerts` filtered by `dismissedAlerts`,
then sorted) held in `useState` and synced by an effect. It should be computed
with `useMemo` during render instead, which removes the cascading render and
both effects.

Not fixed in the HQ rollout because it changes render behaviour and dismissal
timing — exactly what the freeze excludes. The conversion preserved the logic
verbatim.

## B. Chart colours may be falling back to Recharts defaults

The GPV chart on `/manage/analytics` renders grey rather than brand-blue. That
is the signature of constraint C2 — a theme token wrapped in `hsl(...)` yields
invalid CSS and Recharts silently falls back to its own defaults. Worth
confirming across HQ charts and fixing at the source.

## C. Every HQ route renders two `<h1>`s — the second is in the layout chrome

Found while verifying Family 2's converted routes in a browser. Measured on
`/manage/merchants` at 1440px with a real HQ session:

```json
{ "mainCount": 1,
  "h1Text": ["Dashboard", "Merchants"] }
```

The page's own `<h1>` is correct — it comes from `PageHeader`
(`text-[1.75rem] font-semibold tracking-[-0.02em]`). The **other** one is the
sticky header in `app/manage/layout.tsx`:

```tsx
<h1 className="text-base sm:text-lg font-semibold truncate">Dashboard</h1>
```

Both sit inside the layout's single `<main>`, so this is not a landmark bug —
it is a heading-hierarchy bug. Two `<h1>`s per document means a screen reader
announces two top-level headings, and the real page title is the second one.
The chrome label ("Dashboard") is also wrong on every route except the home
tab: it says "Dashboard" while the page is Merchants.

This affects **all** of `/manage`, not just Family 2, and
`app/manage/layout.tsx` chrome is explicitly frozen by the rollout ticket (§7),
so it was not touched. The DoD check
(`grep -rho '<h1 className=' app/manage`) still passes for converted pages
because it counts page-level headers, and this one is in a layout.

**Likely fix:** demote the chrome label to a `<p>` or `<span>` (it is a
breadcrumb/wordmark, not a heading), leaving `PageHeader`'s as the document's
only `<h1>`. Verify skip-to-content still lands correctly afterwards.

## D. `PaymentsTab` renders a raw `<main>` inside the HQ layout's `<main>`

`app/manage/merchants/[merchantId]/components/PaymentsTab.tsx:199` opens with:

```tsx
<main className="space-y-6">
```

`app/manage/layout.tsx:551` already renders the surface's `<main>`, so this
nests landmarks — the same defect as the merchant-dashboard issue this ticket
covers, but on the HQ side and hand-rolled rather than via `PageShell`.

```bash
grep -rn "<main" app/manage --include=*.tsx   # layout.tsx:551 + PaymentsTab.tsx:199
```

It is a Family 3 file (merchant detail workspace), so it was left alone by
Family 2. Fix is one word — `<main>` → `<div>` — and it should be folded into
whichever Family 3 sub-PR converts the Payments tab, where the change is in
scope and reviewable alongside its page.
