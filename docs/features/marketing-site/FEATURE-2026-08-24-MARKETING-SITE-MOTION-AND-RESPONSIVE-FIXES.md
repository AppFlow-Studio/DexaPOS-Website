# Marketing Site — Motion, Responsive & Color Fixes

**Ticket source:** `Haidar Saleh 1on1 Feedback Aug 17 2026.docx` (1:1 with Abubeckr Elcharfa, Aug 17 2026 — walkthrough of live `dexaposai.com`)
**Owner:** Haidar Saleh
**Created:** 2026-08-24
**Scope:** Feedback Sections 1–3 (bugs, motion polish, color consistency) + Haidar's video/handoff action items.
**Explicitly out of scope:** Section 6 Online Ordering Storefront work — blocked pending Abubeckr's dedicated video and Notion ticket.

> The feedback doc itself is gitignored (personal 1:1 notes). This file is the tracked, canonical plan derived from it.

---

## Codebase Findings (read before implementing)

The plan was built from the feedback document plus a read of the marketing code. Several requested items are **already partly built** — the work is mostly wiring, not net-new components. This materially changes the shape of the work, so read this first.

| # | Finding | Evidence |
|---|---------|----------|
| F1 | **30 elements hardcode `reveal in`**, shipping pre-revealed so they never animate on scroll. | `grep -rn 'reveal in' "app/(marketing)/" --include=*.tsx` → 30 hits |
| F2 | `.reveal` is `opacity: 0`; `.reveal.in` sets `opacity: 1`. So `reveal` **without** `in` and without a `Reveal` wrapper = permanently invisible. | `app/(marketing)/marketing.css:406-410` |
| F3 | `Reveal` observer component exists and works, but is **never used on the homepage**. | `components/marketing/Reveal.tsx`; used only in `demo/`, `features/`, `industries/` |
| F4 | `AnimatedCounter` exists and **already animates** "Active restaurants → 1,284" — the exact example in the feedback. | `components/marketing/AnimatedCounter.tsx`; `app/(marketing)/page.tsx:179` |
| F5 | Nav is **already** `position: sticky; top: 0; z-index: 100`. | `app/(marketing)/marketing.css:131-132` |
| F6 | Hover transitions are already `0.2s`–`0.3s`, not ~1s. | `marketing.css:162,182,197,214` |

**Consequence:** F1+F2 is the single root cause behind *both* the "nothing fades in" complaint **and** the "invisible text" bug. Fixing it correctly resolves the largest share of this ticket.

**Reconciling F4/F5/F6 with the feedback:** the counters, sticky nav, and fast hovers exist in code but were reported as broken on the live site. The document is the source of truth for *what was observed*; the code says the cause is not the obvious one. These three items are therefore marked **`NEEDS LIVE REPRO`** below — do not "fix" them blind, because the code-level fix is already present. Reproduce on the running site first, then fix the actual cause (likely candidates noted per task).

### Findings added during implementation (2026-08-24)

| # | Finding | Evidence |
|---|---------|----------|
| F7 | **The homepage JSX is dead code.** `/` always renders through `SectionRenderer` because `DEFAULT_PAGE_SECTIONS["/"]` guarantees `cms.sections.length` is truthy. The inline markup in `app/(marketing)/page.tsx` is fallback that never runs in practice. | `app/(marketing)/page.tsx:18-20`; `lib/cms/default-page-content.ts:4` |
| F8 | Because of F7, the real count was **75 hardcoded `reveal in`, not 30** — 45 of them inside `components/cms/SectionRenderer.tsx`, the file that actually renders the live site. | `grep -c 'reveal in' components/cms/SectionRenderer.tsx` → 45 |
| F9 | **T10 root cause (confirmed live):** `.mk-site` sets `overflow-x: hidden`, which per spec forces `overflow-y` to `auto`, making the wrapper a scroll container and preventing the already-`sticky` nav from sticking. Fixed with `overflow-x: clip`. | measured `navTop: -890` at `scrollY: 890` before; `navTop: 0` after |
| F10 | **T8 was two separate accordions.** `FaqAccordion.tsx` (used on some pages) *and* a native `<details>/<summary>` implementation inside `SectionRenderer` (used on `/pricing`). Native `<details>` cannot be transitioned, which is the actual "abrupt open/close" reported. Both fixed. | `SectionRenderer.tsx:632,1321` |
| F11 | The `Reveal` reference pattern put `transitionDelay` on an inner child while the transition lives on the outer `.reveal`, so those delays were inert. Delay now sits on the Reveal element. | `app/(marketing)/features/page.tsx:26-32` |

---

## Task List

### Section 1 — Bugs

- [x] **T1. Invisible/white text bug** *(root cause identified — F1/F2)*
  - Audit every `reveal` / `reveal-stagger` usage in `app/(marketing)/`. Any element with the class that never receives `in` renders at `opacity: 0` — invisible, exactly as reported.
  - Fix by adopting the T4 wiring (a real `Reveal` wrapper), not by deleting the class.
  - **Regression guard (explicitly requested — "understand why it happened so it doesn't regress"):** add a `prefers-reduced-motion` fallback and a CSS safety net so a missing `in` degrades to *visible*, never invisible. This inverts the failure mode permanently.

- [x] **T2. Responsive header overlap at laptop/mid-width** *(confirmed plausible)*
  - `components/marketing/Nav.tsx` — "Live demo" / "Sign In" / "Request a Demo" overlap at mid widths; fine at full width and fine when narrow.
  - The CTA row is an inline-styled flex (`display:flex; gap:10px`) with no wrap/shrink allowance, and `.nav-cta` uses `white-space: nowrap` (`marketing.css:214`).
  - Fix across the whole breakpoint range — verify at 1024/1180/1280px, not just the two endpoints that already look fine.

- [x] **T3. Center misaligned header elements**
  - Same nav area; align per feedback. Fold into T2's verification pass.

### Section 2 — Animation & Motion Polish

- [x] **T4. Wire scroll fade-in properly (the core fix — F1/F2/F3)**
  - Replace the 30 hardcoded `reveal in` occurrences so elements start un-revealed and receive `in` from the `Reveal` IntersectionObserver.
  - `Reveal` currently renders a `<div>` wrapper — confirm this doesn't break grid/flex layouts (e.g. `value-grid`, `explore-grid`, `proof-grid` rely on being direct children). Prefer extending `Reveal` to apply the class to an existing element over injecting wrapper divs into grids. **This is the main regression risk in the ticket.**
  - Covers the general "fade-in on scroll for components" request.

- [x] **T5. Features section — spacing + fade-in**
  - Elements "spaced too tightly"; fix spacing, then apply T4 treatment.

- [x] **T6. Industries section — fade-in**
  - Apply T4 treatment. Feedback says layout/structure is already good → **animation and spacing only, no redesign.**

- [x] **T7. "Request a Demo" section — fade-in**
  - Apply T4 treatment.

- [x] **T8. Accordion smooth open/close**
  - `components/marketing/FaqAccordion.tsx` (36 lines) — replace abrupt toggle with an animated height transition.

- [x] **T9. Count-up on comparison / dual-pricing numbers** — `NEEDS LIVE REPRO` (F4)
  - `AnimatedCounter` already works on the homepage proof stats. Confirm which specific figures lack it in the comparison/dual-pricing section and apply the existing component — do not build a second counter.

- [x] **T10. Sticky navigation** — `NEEDS LIVE REPRO` (F5)
  - CSS already has `position: sticky`. If it genuinely doesn't stick live, the cause is almost certainly an **ancestor with `overflow` set** (`overflow-x: hidden` on a parent kills sticky) or a transformed ancestor. Find that ancestor; do not re-add `position: sticky`.

- [ ] **T11. Hover response feels delayed (~1s)** — **profiled; no code defect found. Needs confirmation against production.**
  - Every candidate from the original plan was measured on the running site and ruled out:
    - **Transition timing:** audited all 44 interactive elements — **0** have a duration ≥0.5s or any `transition-delay`.
    - **Real hover response:** driving actual mouse input over `.nav-cta` (not synthetic events, which cannot trigger `:hover`) shows the state changing at `0.2s` with `transition-delay: 0s`. The hover itself is instant.
    - **`transition: all`:** 20 occurrences, so worth checking — but across all 47 `:hover` rules, **none** change a layout-affecting property (width/height/padding/margin/font-size/gap). It is only animating cheap properties.
    - **Main thread:** no `longtask` entries recorded while scrolling and interacting.
    - **Images:** no oversized images (0 above 2MP).
  - What *is* slow locally is page load — `domInteractive` ≈ 3.7s, `load` ≈ 6.1s. That is the **Turbopack dev server compiling routes on demand**, not a property of the shipped site, and it plausibly explains a laggy *feel* during a dev walkthrough.
  - **Next step (needs the real site, not localhost):** reproduce on production `dexaposai.com`. If it reproduces there, profile hydration/TBT on the deployed bundle — the cause is not in the CSS. If it does not reproduce, close this item as a dev-server artifact and confirm with Abubeckr on the review video.

### Section 3 — Color Consistency

- [x] **T12. Normalize percentage figure colors**
  - Comparison/pricing section: some percentages render black, others don't. Unify to one token-driven treatment.

### Handoff / Process (Haidar's action items)

- [ ] **T13.** Record and send review video of completed fixes → for Abubeckr's review **before merge**.
- [ ] **T14.** Finish recording and sending the remaining outstanding page videos (separate from this fix list — covers other dashboard pages).

---

## Suggested Order

1. **T1 + T4 together** — one shared root cause; doing them separately means touching the same 30 sites twice.
2. **T2 + T3** — same nav component, one verification pass.
3. **T5, T6, T7, T8, T12** — independent, parallelizable.
4. **T9, T10, T11** — after `npm run dev`, diagnose live, then fix.
5. **T13** once 1–4 are verified.

## Verification

- [x] `npx tsc --noEmit` shows no *new* errors (baseline already has pre-existing failures in `AdminCreateLocationWizard.tsx`, `types/order-management.ts`, `valor-smoke.ts` — unrelated to this work).
- [x] `npm run lint`.
- [x] Manual pass at 390 / 768 / 1024 / 1180 / 1280 / 1440px — T2 specifically breaks *between* the endpoints.
- [x] Every section fades in on scroll; no element is stuck invisible (T1 regression guard).
- [x] `prefers-reduced-motion: reduce` renders all content visible with motion suppressed.
- [ ] Build note: `next.config.ts` sets `ignoreBuildErrors` / `ignoreDuringBuilds`, so **a green build does not prove type safety** — `tsc --noEmit` is the real gate.

## Constraints

- Nav content is CMS-driven (`data-cms-*` attributes, `lib/cms/site-settings-data`). Preserve every editable attribute when restructuring markup in T2/T3.
- Keep the existing hover animations that were called out as already good — consistency pass only, no rebuild.
- Overall direction: *"bring life into the website"* — calm and professional, purposeful motion, not busy.
