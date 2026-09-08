# Popular Items — per-item "+" that deep-links into ordering

**Date:** 2026-08-22
**Branch:** `feat/website-owner-ui`
**Prior art:** Owner.com — `docs/research/owner-com-website-tab/screenshots/12-content-section-editor.png`,
and their live menu URL `charcoalgardenia.com/menu?item=<slug>&matchItemName=<name>`

## Goal

A `+` button on each card of the `popular-items` section on a **built marketing site**.
Pressing it lands the visitor on that merchant's **ordering storefront** with the item's
details modal already open, so they can pick modifiers and add to cart.

## Decisions taken (2026-08-22, with the user)

| # | Decision | Rationale |
|---|---|---|
| D1 | `+` **always** opens the item modal. Never adds straight to cart, not even for items with no required modifier groups. | Items carry required modifier groups (`StorefrontModifierGroup.required`, `min_selections`). A straight-to-cart path would either add an invalid line or silently choose for the customer. Two behaviours behind one button is worse than one predictable one. Matches Owner. |
| D2 | **No new `/sites/[slug]/menu` route.** Link to the existing `ctx.site.orderUrl`. | See "Correction" below — the routing fork already guarantees a storefront slug always serves ordering. A new route would add a second address for one page with no gain. |
| D3 | The `+` is an `<a href>`, not an `onClick`. | `popular-items` is a server component and must stay one. Also gives middle-click, and matches Owner's behaviour (their `+` navigates). |
| D4 | URL carries **only** the `menu_item` UUID: `?item=<uuid>`. No name, no price. | Owner's `matchItemName` is a fallback for their slug-based ids; our ids are stable UUIDs so we do not need it. Fewer reflected values on a public URL. |
| D5 | The param is resolved **against already-loaded menu data only**. Never a fetch by arbitrary id. Unknown/86'd id → ignored silently, page renders normally. | The param is untrusted public input. Matching within `menus` means a crafted id cannot address anything the visitor could not already see, and cannot probe for item existence. |

### Correction to an earlier assumption

I previously flagged a routing collision — that `orderUrl` (`/sites/{slug}`) might land back on
the built marketing site. **That was wrong.** `decideRenderMode` returns
`{ mode: "template", reason: "storefront_address" }` for any address that is not a brand
subdomain (`lib/site-builder/resolve-render-mode.ts:158-161`). A storefront slug **always**
serves ordering; the built site only ever answers on a brand subdomain. `orderUrl` is derived
from `online_store_config.slug` (`lib/site-builder/public-context.ts:138`), so it is by
construction a storefront address. No collision exists, and D2 follows.

## What already exists (do not rebuild)

- `AddButton` — the round `+` on ordering menu cards: `app/sites/components/MenuBrowser.tsx:767`
- `ItemDetailsModal` → `addItem(...)`: `app/sites/components/ItemDetailsModal.tsx:291`
- `requestOpenModal(item)` / `pendingModalItem` in `app/sites/hooks/useCart.ts:65-67`,
  **already consumed by all four layouts** (`MenuBrowser`, `HeroLayout`, `MarketLayout`,
  `BoutiqueLayout`). Feeding this one store action is what avoids touching four files.
- `pendingModalItem` is deliberately **not** in `partialize` (`useCart.ts:200`), so it cannot
  leak across navigations. The query param is the handoff, not localStorage.

## Work items

### 1. Schema — `lib/site-builder/sections/schemas/popular-items.ts`
- [x] Add `showAddButton: z.boolean()` to `popularItemsSchema`.
- [x] Default it to `true` in `popularItemsDefaults()`.
- [x] Comment why it is a toggle: a brand page that withholds prices may not want an
      order affordance either.
- No migration: adding an optional-with-default boolean to a section's props is additive,
  and `normalizePage` fills it for documents written before today.

### 2. Href builder — `components/site-builder/section-shell.tsx`
- [x] Add `orderItemHref(itemId, ctx)` next to `resolveHref`: returns
      `${ctx.site.orderUrl}?item=${encodeURIComponent(itemId)}`.
- [x] Return `null` when `ctx.site.orderUrl` is empty, so the button is dropped rather
      than rendering a dead `#`.

### 3. Renderer — `components/site-builder/sections/PopularItemsSection.tsx`
- [x] Render the `+` on each `<li>`, positioned over the image (bottom-right), matching
      the ordering menu's existing `AddButton` shape: round, `var(--site-*)` tokens,
      min 40×40 touch target.
- [x] `aria-label={`Add ${name} to cart`}` — same wording as the storefront's.
- [x] Suppress when `showAddButton` is false, when `ctx.mode === "builder"` (an editor
      click must not navigate away mid-edit — render it inert/`aria-hidden`), or when
      `orderItemHref` returns null.

### 4. Deep-link reader — new `app/sites/components/ItemDeepLink.tsx`
- [x] `"use client"`, renders `null`. Props: `menus`.
- [x] On mount, read `window.location.search` (**not** `useSearchParams` — avoids the
      static-rendering Suspense bailout).
- [x] Find the item by id across `menus[].categories[].items[]`. Not found → do nothing.
- [x] Found and `item.availability` → `requestOpenModal(item)`; all four layouts already
      react. Unavailable → do nothing.
- [x] Strip the param with `history.replaceState` so a refresh or a shared URL does not
      re-pop the modal.
- [x] Run once per id.

### 5. Mount point — `app/sites/components/StorefrontLayout.tsx`
- [x] Render `<ItemDeepLink menus={menus} />` **above** the template fork, so all four
      templates get it from one line.

### 6. Tests
- [x] `popular-items` renders a `+` with the right href when `showAddButton` is true;
      none when false; none in `builder` mode.
- [x] `schema-introspect` classification test still passes with the new boolean field.
- [x] `ItemDeepLink`: known id opens modal; unknown id is a no-op; 86'd id is a no-op;
      param is stripped after handling.

## Out of scope

- Adding the `+` to any other section (`cards`, `gallery`).
- Straight-to-cart (D1).
- A `/sites/[slug]/menu` route (D2).

## Deviations from the plan as written

Two, both taken during implementation:

1. **The `+` reports `order_click`.** Not in the plan. `CtaButton` already fires it for
   "Order Online", and this button is the same conversion moment — a visitor leaving for
   the ordering storefront. Reusing the event rather than adding a second name for it is
   what `TRACKING_EVENTS`' own doc comment asks for.
2. **`ItemDeepLink` was split into pure functions.** The plan had the effect doing the work
   inline. It became `consumeItemDeepLink` / `resolveDeepLinkItem` / `stripItemParam`
   because the trust boundary deserves tests, and this repo's vitest runs in `node` with no
   DOM harness available. See the bug below for the second reason.

## Bug found and fixed during implementation

The first version of the effect called `replaceState` **before** resolving the item.
`history.replaceState` updates `window.location` synchronously, so the resolve step then
read a search string the parameter had already left — every `+` would have stripped the URL
and silently opened nothing. Fixed by reading both off one `href` inside
`consumeItemDeepLink`, which makes the ordering unrepresentable rather than merely correct,
and covered by a named regression test in `item-deep-link.test.ts`.

## Verification

- [x] `npm run test`
      3 site-builder suites green (59 tests). Full suite: 22 failures, all pre-existing
      and in `AffectsTag`, `cascade-labels`, `tests/a11y/storefront`, `tests/orders` —
      verified identical on a stashed tree, so none are caused by this change.
- [x] `tsc --noEmit` and `eslint` clean on every touched file.
- [ ] **Outstanding — browser QA.** Publish a site with a `popular-items` section, click a
      `+`, confirm it lands on the ordering storefront with the right modal open, add to
      cart, confirm the line is correct.
- [ ] **Outstanding — browser QA.** Confirm a crafted `?item=<random-uuid>` renders the
      menu normally, with no modal and the parameter stripped.
