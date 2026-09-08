# 15 — Implementation notes for DexaPOS

What to copy, what to skip, and what this teardown says about work already in flight on
`feat/website-owner-ui`.

This is analysis, not a plan. The plan lives in
`docs/features/website-builder/PLAN-2026-08-18-OWNER-FULL-FEATURE-PARITY.md`.

---

## 1. The eight ideas that make Owner's builder work

Ranked by value-per-unit-of-effort.

| # | Idea | Effort | Why it matters |
|---|---|---|---|
| 1 | **Per-section capability flags** (`editable` / `deletable` / `movable`) | Low | The single mechanism that keeps every site structurally valid. Enforced by *omitting* controls, never by disabling or erroring. |
| 2 | **Hard character caps with live counters** (50 / 500 / 150) | Very low | Cheapest quality mechanism in the product. No headline ever wraps to four lines. |
| 3 | **`Add Section` dividers between every pair** | Low | Removes the main reason anyone wants drag-and-drop. Insertion point is explicit. |
| 4 | **Data-driven sections** (Popular Items, Events, Careers, location) | Medium | Never make a merchant maintain the same fact twice. Same principle as our "never write a second price resolver". |
| 5 | **Brand-level feature toggles gating sections** | Low | Two-layer model: brand says *whether*, page says *where and what*. |
| 6 | **Explicit publish, per page** | — | Already our model. Keep it. |
| 7 | **One editor shell reused** (pages / forms / style / new page) | Medium | Learn it once, operate everything. Also halves the code. |
| 8 | **Semantic form field types** | Medium | What makes submissions structured enough to be useful downstream. |

---

## 2. Direct hits on work already in flight

### 🔴 The nav hole — this teardown is the fix spec

Our rebuild deleted `NavEditor`, leaving nothing that writes `merchant_sites.nav` while
`buildPublicRenderContext` still reads it (`public-context.ts:119`). Confirmed live: Joes' public nav shows
**Home, Career** while the published, publicly-reachable **About us** is absent and unreachable.

Owner's model, from [06 — Section types](06-section-types.md):

- Nav is edited **inside the header section's editor**, reached from any page's first block
- Banner warns *"Changes to the navigation affect all pages"*
- An explicit **ordered list** with drag handles — the one place drag-and-drop is used
- Each row: label + type (`Page`), with a `⋯` → Edit / Delete
- Two add buttons: **⊕ Page** (internal) and **⊕ Link** (external)
- **Automatic overflow** into a "More" menu — no breakpoint configuration
- A `Transparent navigation` toggle

Note Owner does **not** derive nav from published pages — it is explicit and hand-ordered, with page-linking as
one of two link types. Worth weighing against the "derive from published pages" fix we sketched: derivation
fixes unreachability automatically, but loses ordering control and external links. A hybrid (derive on create,
allow reorder/remove) gets both.

### The section registry needs capability flags

We have `unavailable?: string` for missing dependencies. That is the *availability* axis. Owner adds an
orthogonal *capability* axis per kind. Both are needed:

```ts
// availability — can it be offered at all?
unavailable?: string          // dependency missing (e.g. asset library)
requiresFeature?: 'reviews' | 'rewards' | 'giftCards'   // brand toggle

// capability — what can the merchant do with a placed instance?
editable: boolean             // false for menu-driven sections
deletable: boolean            // false for structural sections
movable: boolean              // false for header/footer/location
```

### Our 9 kinds vs their 13

Ours: 9. Theirs: 13. The delta is `Cards`, `Video`, `PDF`, `Scrolling Banner`, plus `Reviews` and
`Reservations` (which we cut for lack of a data source — Owner's Reviews turns out to be **manually curated**,
not a live feed, which removes that blocker entirely).

`Reviews` is therefore a cheap win: it is a repeater of quote + attribution, gated by a brand toggle.

### Style: five knobs, and we already agreed

`style-inputs.ts` is the analogue. This capture confirms the target and adds one detail: **a hex text input
next to the swatch**, which real businesses with a brand guide need.

Note also the `Save` vs `Publish` split — style saves globally and immediately; pages publish individually.
If we unify everything under publish, merchants will be surprised that a colour change is not instant.

---

## 3. Build / skip / decide

### Build

- **Analytics (pixels)** — 4 fields, ~1 day, high value. Name it `Tracking`, not `Analytics`.
- **Forms** — reuse the page-builder shell; semantic field types; a `used on N pages` column.
- **Events** — first-class entity + a system page that renders it.
- **Careers** — location-scoped; the only new infra is resume storage and its retention policy.
- **Nav editor** — blocking, see above.

### Skip

- **Announcements.** Owner is retiring it ([07](07-announcements.md)). A `Scrolling Banner` section plus proper
  holiday-hours handling covers the real need.
- **Device/viewport switcher.** Owner's dashboard editor has none; layouts are responsive by construction.
- **Drag-and-drop for sections.** Buttons + insertion dividers, deliberately.

### Decide

- **Custom domains.** Owner — whose whole pitch is restaurant websites — has **no self-serve domain UI** at all;
  it is a support request. Either build DNS/verification/TLS properly, or mirror the request flow. Do not
  half-build it.
- **Autosave.** Owner has none. We kept the machinery and removed the indicator. Defensible, but only if the
  explicit publish step stays — otherwise the safety property disappears.
- **Customer support view.** We have the data; the question is whether to add the workflow Owner lacks
  (link-to-order, resolved state) or ship the same read-only list.

---

## 4. Things Owner does *not* do (and we might)

Absences that look like genuine gaps rather than discipline:

- **No per-page SEO** — no title/description/OG fields anywhere. Surprising for a company selling SEO.
- **No page duplication.**
- **No version history or rollback.** Publish is one-way.
- **No alt text** surfaced on any image control — an accessibility gap, and they ship an
  "Accessibility Statement" footer link.
- **No scheduled publishing.**
- **No workflow on Customer support** — no resolved state, no link back to the order.
- **No draft preview link** to share with a colleague before publishing.

Each is a differentiator if cheap. Per-page SEO and alt text are the two that are both cheap and defensible.

---

## 5. The framing to keep

Owner's own words, quoted in our earlier research:

> *"if you're looking for a lot of design freedom, Owner is not the right fit"*

Everything in this teardown is downstream of that sentence. The single column, the 13 fixed sections, the five
style knobs, the hard character caps, the locked header and footer, the absence of drag-and-drop — none of it is
a limitation they intend to lift.

**The simplicity is removed decisions, not a visual style.** Any parity work that adds a knob "because it's easy"
is moving away from the thing being copied.

---

**Prev:** [14 — Page anatomy](14-page-anatomy.md) · **Index:** [README](../README.md)
