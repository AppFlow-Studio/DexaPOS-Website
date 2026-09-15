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
