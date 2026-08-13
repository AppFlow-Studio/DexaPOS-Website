# Infra Plan 03 — Binding Resolver & Server Renderer

**Stages 3–4** · ✅ **BUILT 2026-08-13** · Depends on [PLAN-01](PLAN-01-INFRA-SECTION-CONTRACT.md)
Parent: [PLAN-00-GENERAL.md](PLAN-00-GENERAL.md)

> ### Status — built, and verified **without** the Stage 2 migration
>
> **137 tests passing, strict typecheck clean, lint clean.** Both stages were completed against the *existing*
> schema, so the unapplied migration blocked nothing: the resolver reads `menu_items` and `locations`, and the
> preview route renders a **fixture** document rather than a `site_pages` row.
>
> | Artifact | |
> |---|---|
> | [bindings/collect.ts](../../../lib/site-builder/bindings/collect.ts) · [resolve.ts](../../../lib/site-builder/bindings/resolve.ts) · [resolved.ts](../../../lib/site-builder/bindings/resolved.ts) | Collector + resolver + `Resolved<T>` |
> | [bindings/supabase-sources.ts](../../../lib/site-builder/bindings/supabase-sources.ts) | Real sources, via `get_menus_for_location` |
> | [business-hours.ts](../../../lib/site-builder/business-hours.ts) | Tested hours parser |
> | [components/site-builder/](../../../components/site-builder/) | 9 server sections, 1 client island, `PageRenderer`, `SiteChrome`, `SectionBoundary`, `SiteImage`, renderer registry |
> | [fixtures/demo-page.ts](../../../lib/site-builder/fixtures/demo-page.ts) | A complete demo homepage as a `PageDocument` |
> | [app/dashboard/website/preview/](../../../app/dashboard/website/preview/page.tsx) | The acceptance surface |
>
> #### Price parity is structural, not careful
>
> §2.2 says "reuse, do not reimplement, the price cascade". It turned out better than hoped: the 5-level cascade
> and 86/snooze resolution both happen **inside Postgres**, in `get_menus_for_location` — the same RPC behind
> `getStorefrontData()`. `supabase-sources.ts` calls it and maps the identical `effective_*` fields, including the
> `applyDeliveryPricingPolicy` collapse. There is no second price calculation anywhere, so the built page and the
> ordering page cannot drift.
>
> #### Corrections to the plan below
>
> | Plan said | Reality |
> |---|---|
> | `Resolved` reasons `deleted \| snoozed \| out_of_stock \| not_in_location` | **Only `not_found` and `unavailable` exist.** The RPC folds 86ing, snoozing and manual hiding into one `effective_availability` flag, so the platform genuinely cannot distinguish them. Inventing reasons we cannot detect would be a lie in the type system |
> | §2.4 `unstable_cache` with tags | **No caching at all.** Fully dynamic, matching `/sites/[slug]` today — see the Next 16 correction in [PLAN-04](PLAN-04-INFRA-PUBLISH-ROUTING.md) §5 |
> | Preview loads a draft from `site_pages` | Loads a **fixture**, so Stage 4 could be verified before the migration. Swapping in `LoadDraft(pageId)` is one line |
>
> #### Where a routing decision surfaced early
>
> The ordering storefront lives at the **root** of `/sites/[slug]` — exactly where a built site wants to be. Rather
> than hardcode a guess, `RenderSite` carries `orderUrl` / `menuUrl` / `basePath` as inputs, so Stage 6 decides the
> collision (§2 of PLAN-04) and no renderer needs revisiting.
>
> #### Added beyond the plan
>
> - **`business-hours.ts`.** `locations.business_hours` holds three different shapes and may arrive as a JSON
>   string. This is the *third* parser in the codebase — `InfoPanel.tsx` and `OpenClosedIndicator.tsx` each carry
>   their own, neither tested. Consolidating all three behind this one is a worthwhile follow-up.
> - **Architecture invariants as tests.** `render.test.tsx` fails the build if any section file contains
>   `"use client"`, if a kind lacks a renderer, or if a section reaches for a bare `<img>`. Blocker **B7** is now
>   enforced rather than intended.
> - **Sanitization on render**, not only on write — content can reach the database through a migration or a support
>   fix that skips the write-side check, and this is the last gate before a public browser.

---

## 1. Goal

A seeded page document renders as real HTML, server-side, with live menu prices and live availability, at an
authenticated preview URL. **No builder UI exists yet.** This is the stage that proves the whole architecture works.

---

## 2. The resolver — how D6 actually happens

**D6** says: snapshot the structure, resolve volatile fields live. [PLAN-01](PLAN-01-INFRA-SECTION-CONTRACT.md) §5
made that structural — props can hold a `Binding<'menu_item'>` but have nowhere to put a price. This stage builds the
thing that turns bindings into data.

Three passes, once per page render:

```
PageDocument
   │
   ├─ 1. collect()   walk every section, gather every Binding → BindingRequest[]
   │
   ├─ 2. resolve()   group by type, ONE batched query per type → ResolvedMap
   │
   └─ 3. render()    each section gets (props, resolved) and is a pure function of them
```

### 2.1 Collect

```ts
// lib/site-builder/bindings/collect.ts
export function collectBindings(doc: PageDocument): BindingRequest[] {
  const out: BindingRequest[] = [];
  for (const section of doc.sections) {
    if (section.hidden) continue;                  // hidden sections cost nothing
    const def = SECTION_REGISTRY[section.kind];
    for (const type of def.bindingTypes) {
      out.push(...extractBindings(section.props, type));
    }
  }
  return dedupe(out);                              // 3 sections referencing item X → 1 fetch
}
```

`bindingTypes` on the registry entry is what makes this generic — the collector never switches on kind, so section
kind #18 needs no collector change.

### 2.2 Resolve — the query budget

**Hard rule: the number of queries is a function of the number of distinct binding *types* on the page, not the
number of bindings.** A page with 40 menu items issues one menu query.

```ts
// lib/site-builder/bindings/resolve.ts
export async function resolveBindings(
  requests: BindingRequest[],
  ctx: { merchantId: string; locationId: string },
): Promise<ResolvedMap> { … }
```

| Binding type | Source | Query |
|---|---|---|
| `menu_item` | `menu_items` + location overrides + snooze | 1 batched `.in('id', ids)`, reusing the pricing cascade |
| `menu_category` | `menu_categories` | 1 batched |
| `location` | `locations` | 1 (usually the site's own location — often already loaded) |
| `hours` | `locations.business_hours` | folded into the `location` query |
| `reservation_config` | reservation settings | 1 |
| `review` | reviews source | 1 |

**Reuse, do not reimplement, the price cascade.** Items carry a 5-level override cascade (CLAUDE.md — L1 global → L5
location+menu+category) and the storefront already resolves it in
[app/sites/actions.ts](../../../app/sites/actions.ts) via `fetchMenus` + `applyDeliveryPricingPolicy`. A built page
showing a different price than the ordering page for the same item is a support ticket and possibly a legal problem.
Extract the existing resolution into a shared helper and have both call it; do not write a second price resolver.

Same for `pricing_disclosure_text` and `deliveryPricingEnabled` — if the storefront shows a disclosure, so must the
built page.

### 2.3 The three D6 consequences, all handled here

**Consequence 1 — deleted records must not break a live page.** Every binding resolves to a discriminated result:

```ts
export type Resolved<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable"; reason: "deleted" | "snoozed" | "out_of_stock" | "not_in_location" };
```

Renderers receive `Resolved<T>`, never a nullable. `status: 'unavailable'` is a **normal render path**, not an error
path — which is what stops "merchant deleted an item" from becoming a 500 on their public homepage. The renderer
decides per kind: `popular-items` omits the card and re-flows the grid; a `location` that fails to resolve renders
the section's static heading with no map rather than disappearing.

**Consequence 2 — 86/snooze must be honored.** This repo already models item and category snoozing
([app/dashboard/actions/item-snooze.ts](../../../app/dashboard/actions/item-snooze.ts),
`20260720180000_category_86_snooze.sql`). The resolver checks it and returns `reason: 'snoozed'`.

*Decision needed:* hide or grey out? **Recommendation: hide from `popular-items`** (a "Guest Favorites" section
advertising something unavailable is worse than a shorter section) but **grey out with "Unavailable today" in a
full-menu section** where the absence would look like a missing menu. Set this per kind in the registry.

**Consequence 3 — rollback restores layout, not prices.** Nothing to build in the resolver; it is a copy problem —
see [PLAN-04](PLAN-04-INFRA-PUBLISH-ROUTING.md) §3.3. Noted here because it is the same decision viewed from the
other end.

### 2.4 Caching the resolver

```ts
const resolveMenuItems = unstable_cache(
  async (ids: string[], locationId: string) => { … },
  ["site-builder-menu-items"],
  { tags: [`menu:${locationId}`], revalidate: 60 },
);
```

Tag by location so an existing menu mutation can invalidate it. 60 s is a deliberate compromise: a price edit shows
within a minute even if the invalidation hook is missed, and a burst of traffic does not hammer Postgres. Snooze
state may warrant a shorter TTL — 86'ing an item is an urgent, in-service action. **Consider `revalidate: 10` for
availability specifically**, split from the item body.

---

## 3. Renderer architecture

### 3.1 One server component per kind

```
components/site-builder/
├── PageRenderer.tsx            # server. registry dispatch.
├── SiteChrome.tsx              # server. html shell, theme tokens → CSS vars, fonts, analytics
├── sections/
│   ├── HeroSection.tsx         # server
│   ├── PopularItemsSection.tsx # server
│   ├── FaqSection.tsx          # server shell + <FaqAccordion> client island
│   └── … 17 total
└── islands/                    # the ONLY "use client" files
    ├── FaqAccordion.tsx
    ├── GalleryLightbox.tsx
    ├── ReservationForm.tsx
    └── ContactForm.tsx
```

**Every section component is a server component.** Interactivity is a client *island* imported into it — never a
`"use client"` at the top of a section file. This is the discipline that makes ANALYSIS **B7** a non-issue, and it is
exactly the pattern already working in [components/cms/SectionRenderer.tsx](../../../components/cms/SectionRenderer.tsx)
(1,739 lines, server, with `<FaqAccordion>` / `<ContactForm>` islands inside).

The mock failed this test — all 17 renderers are trapped inside one 5,051-line `"use client"` module (ANALYSIS
**F6**), which is why the analysis rates Phase 4 impossible without extracting them first. Building server-first from
day one means that extraction never has to happen.

### 3.2 Uniform props

```ts
export interface SectionRenderProps<K extends SectionKind> {
  section: SectionOf<K>;
  resolved: ResolvedMap;       // pre-fetched — a section NEVER queries
  ctx: RenderContext;          // site, location, theme tokens, mode, locale
}
export type RenderMode = "public" | "preview" | "builder";
```

**A section component may not perform I/O.** No `await supabase…` inside a section. All data arrives resolved. This
keeps the query budget knowable, makes every renderer unit-testable with a fixture, and prevents the N+1 that a
5-section page with per-section fetching produces.

### 3.3 Dispatch

```tsx
// components/site-builder/PageRenderer.tsx  (server component)
export default function PageRenderer({ doc, resolved, ctx }: PageRendererProps) {
  return (
    <>
      {doc.sections.filter(s => !s.hidden || ctx.mode === "builder").map(section => {
        const def = SECTION_REGISTRY[section.kind];
        if (!def) return null;                  // unknown kind — never throw on a public page
        const Component = def.render;
        return (
          <SectionBoundary key={section.id} section={section} mode={ctx.mode}>
            <Component section={section} resolved={resolved} ctx={ctx} />
          </SectionBoundary>
        );
      })}
    </>
  );
}
```

`SectionBoundary` does two jobs: an error boundary so one broken section cannot take down the page, and the
`data-section-*` attribute stamping that the builder overlay reads (§5).

### 3.4 Theme

Site theme tokens (`merchant_sites.theme`, merged over `online_store_config` colors) become CSS custom properties on
the shell:

```tsx
<div style={{ "--site-brand": theme.brand, "--site-surface": theme.surface, … }}>
```

Sections consume `var(--site-brand)`. Never inline computed colors into section markup — otherwise a brand-color
change requires re-rendering and re-publishing every page, instead of being a single value on the shell.

---

## 4. The preview route — Stage 4's deliverable

```
app/dashboard/website/preview/[pageId]/page.tsx     # server component, Clerk-gated
```

```tsx
export default async function PreviewPage({ params }) {
  const { pageId } = await params;
  const doc = normalizePage(await loadDraft(pageId));           // PLAN-01 normalize
  const requests = collectBindings(doc);
  const resolved = await resolveBindings(requests, ctx);
  return <SiteChrome ctx={ctx}><PageRenderer doc={doc} resolved={resolved} ctx={{...ctx, mode:"preview"}} /></SiteChrome>;
}
```

**This route is the acceptance test for Stages 3–4.** Seed a document with a script, open the URL, see a real
restaurant page with real prices. Change a price in the dashboard, reload, see it change. 86 an item, reload, see it
gone. All before a single drag handle exists.

Build the first five kinds in this order — they cover every architectural case:

| Kind | Proves |
|---|---|
| `hero` | Literals, images, theme tokens |
| `content` | Rich text + `sanitizeHtml` on the render path |
| `popular-items` | **Bindings, batching, unavailable handling** — the hard one |
| `faq` | Server shell + client island |
| `footer` | Site-level data (nav, hours) on a page-level render |

The remaining twelve are variations on these and go faster.

---

## 5. The builder-overlay protocol — decide it now, use it in Stage 8

This is the design that lets the canvas reuse the server render instead of re-implementing it. Copied from
`SectionRenderer.tsx`'s `editAttrs` + `InlineCmsPreview.tsx` (see
[FINDING §3.1](FINDING-2026-08-12-EXISTING-CMS-PRIOR-ART.md)).

`SectionBoundary` stamps, when `mode === "builder"`:

```html
<div data-sb-section-id="s_a1b2" data-sb-kind="hero" data-sb-zone="masthead" data-sb-locked="true">
```

and individual editable fields get, from a small `editAttrs(section, path, kind)` helper:

```html
<h1 data-sb-field="props.heading" data-sb-field-kind="text">
```

A single `"use client"` overlay component then owns hover outlines, the selection ring, the floating
edit/delete/move controls, and drop targets — reading positions from the DOM, writing nothing. Selecting a section
posts its `id` to the settings panel; the panel edits the document; the document round-trips to the server; the
server re-renders.

**Consequences worth stating out loud:**

- There is exactly **one** implementation of every section's markup. Public and builder cannot drift, because they
  are the same render.
- The canvas can be an iframe (isolates merchant styles, gives free device-preview sizing) or same-document (simpler
  DnD, faster). **Recommend iframe** for the builder, because merchant themes will otherwise leak into dashboard
  chrome — but this is now a Stage 8 decision, not an architectural one, precisely because the renderer does not care.
- Re-rendering on every keystroke is too slow over the network. Stage 8's answer: optimistic local re-render of the
  *edited section only* against the same component tree, with the full server render on debounce.

---

## 6. Files to create

```
lib/site-builder/bindings/
├── types.ts        # BindingRequest, Resolved<T>, ResolvedMap
├── collect.ts      # collectBindings, extractBindings, dedupe
├── resolve.ts      # resolveBindings + per-type resolvers
└── __tests__/
components/site-builder/
├── PageRenderer.tsx
├── SiteChrome.tsx
├── SectionBoundary.tsx
├── edit-attrs.ts
├── registry.tsx    # binds SECTION_REGISTRY.render to the components (PLAN-01 §8)
├── sections/*.tsx  # 17
└── islands/*.tsx
app/dashboard/website/preview/[pageId]/page.tsx
scripts/seed-site-page.ts
```

---

## 7. Verification

- [ ] `collectBindings` on a 20-section page with 60 item references dedupes to the distinct set
- [ ] `resolveBindings` issues **≤ 4 queries** for that page — asserted by counting, not by eyeballing
- [ ] A deleted `menu_item` resolves `unavailable/deleted`; the page renders 200 with that card absent
- [ ] A snoozed item resolves `unavailable/snoozed` and is hidden per §2.3
- [ ] Prices on a built page byte-match the same item on `/sites/[slug]` — including override cascade and delivery pricing
- [ ] Preview renders with **JavaScript disabled** (proves the server-only claim)
- [ ] `grep -rn "use client" components/site-builder/sections/` returns **nothing**
- [ ] A section that throws is contained by `SectionBoundary`; the rest of the page still renders
- [ ] Rich text from `content` is sanitized — inject `<script>` into a draft and confirm it does not reach the DOM
- [ ] Render time for a 15-section page < 300 ms server-side on staging data

## 8. Open questions

1. **Should the resolver also power the existing storefront?** It is a better abstraction than `getStorefrontData`'s
   monolith. Tempting, but out of scope — note it as a candidate for later consolidation.
2. **Locale/i18n.** `RenderContext` carries `locale` from day one even though v1 is English-only; retrofitting a
   locale parameter through 17 renderers later is miserable.
3. **`popular-items` ordering when an item is unavailable** — hold the slot or re-flow? Recommend re-flow, with a
   minimum-count guard (if fewer than 2 resolve, hide the whole section rather than show a lonely card).
4. **Do reviews come from Google, or a native table?** Affects whether `review` is a binding type or a literal in v1.
   If Google, it is an integration with a rate limit and a cache, not a query — size it separately.
