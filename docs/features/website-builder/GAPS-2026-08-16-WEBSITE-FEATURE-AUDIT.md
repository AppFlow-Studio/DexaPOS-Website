# Website Feature — Gap Audit

**Date:** 2026-08-16 · **Scope:** the whole Website tab — overview, design workspace, page
editor, preview, publish, and the public rendering path.

This is a read of the code as it stands after the design-workspace and page-editor work landed
on `aliawdi-dev`, not a read of the plans. Where the two disagree, the code wins and the plan is
flagged as stale.

Companion documents: [PLAN-00-GENERAL.md](PLAN-00-GENERAL.md) for the stage map,
[ANALYSIS-2026-08-11-MOCKBUILDER-GAP.md](ANALYSIS-2026-08-11-MOCKBUILDER-GAP.md) for the decision
register **D1–D6** and blocker register **B1–B12**.

---

## 1. What this feature is

A merchant-operated website builder layered on top of the existing online-ordering storefront.
Restaurants compose multi-section pages from a fixed catalogue of section kinds; pages render
server-side with **live** menu, price, and availability data read straight from the POS.

The product shape, in one loop:

```text
Website overview  →  Design (site-wide colour + type)
                  →  Page editor (sections, canvas, inspector)
                  →  Review & publish
                  →  public site
```

Three surfaces exist in the dashboard today:

| Route | What it is |
|---|---|
| `/dashboard/website` | Overview: status, checklist, entry points |
| `/dashboard/website/design` | Site-wide theme — palette, typography, corner style |
| `/dashboard/website/builder` | The page editor: section list, live canvas, inspector |
| `/dashboard/website/preview` | Full-page preview without editor chrome |

## 2. The decisions that shape it

These are load-bearing. Most of the gaps below are a direct consequence of one of them, and
several "missing features" are deliberate rather than forgotten.

### Product decisions

- **D1 — an addition to online ordering, not an alternative.** The builder reads a storefront's
  location, menu, and branding. A location with a template storefront and no built site must be
  byte-for-byte unaffected.
- **D2 — merchant-operated.** No agency step, no design review. The merchant is assumed to have
  no design experience, which is why the theme is a palette picker rather than colour controls
  per section.
- **D6 — snapshot structure, reference volatile fields live.** A section stores *which* menu item
  it points at, never a copy of its price, photo, or availability. Changing a price in the POS
  changes every live page on the next request, with **no republish**. This is the single most
  distinctive property of the feature and the reason publishing is cheap.
- **Site granularity changed 2026-08-15 — D4 is superseded.** One site per *merchant*, not per
  location. Each location becomes a *page* beneath one brand site
  (`site_pages.location_id`, nullable — NULL means a brand page). Rationale: under D4 a
  five-location merchant maintained five sites, five copies of the About page, and split their
  SEO authority five ways.
- **No prices until the visitor picks a location.** Branches can charge different amounts for the
  same dish, so a price shown before a location is chosen is a guess — and a guess about money is
  a support ticket. Names, photos, and descriptions still show. Enforced by `canShowPrices()`.
- **Never geolocate-redirect the brand home page.** Googlebot crawls from one place; an
  auto-redirect means only one location is ever indexed and the SEO rationale is lost.

### Architectural invariants

- **Draft and published are different tables.** `site_pages.draft_content` is one mutable JSON
  document; publishing *appends* an immutable `site_page_versions` row and repoints the page.
  Saving is not publishing, and nothing ever UPDATEs a version's content.
- **The section registry is the single source of truth.** One entry per kind drives the add
  gallery, form generation, validation, repair, renderer dispatch, binding collection, and
  reorder legality. A new kind is one schema file plus one registry entry.
- **Zones, not free placement.** `masthead` / `body` / `colophon`. Header, hero, and footer are
  locked and non-deletable; only the body reorders. Encoded as data so the server enforces it
  too.
- **Every section is a server component** (blocker **B7**). The canvas re-renders through
  `renderToStaticMarkup` in a route handler, and Next refuses `react-dom/server` in any module
  graph reaching a client component. One `"use client"` under `components/site-builder/`
  (outside `builder/` and `dashboard/`) breaks the canvas — enforced by a test.
- **Theme tokens are CSS custom properties on the page shell.** Changing a brand colour restyles
  every page without re-rendering or republishing any of them.
- **Whole-document saves with optimistic concurrency.** Pages are tens of KB; a save either lands
  completely or not at all. A stale `revision` returns the server's document so the UI can offer
  reload / keep-mine, never auto-merge and never silently clobber.

### v1 scope cuts (2026-08-13)

Taken deliberately, and they explain several gaps below: **9 section kinds not 17**
(`reviews` and `reservations` cut for lack of a data source); subdomains only, no custom domains;
no quotas; no caching; `is_merchant_admin` instead of a dedicated permission code (blocker
**B10**); no SEO panel, forms, promos, or analytics surface; home page only.

## 3. What actually exists today

The README progress table is out of date. Corrected:

| Stage | README says | Reality |
|---|---|---|
| 1 — Section contract | ✅ Built | ✅ Correct |
| 2 — Tenancy & persistence | 🟡 migration **NOT** applied | ✅ **Applied** — the design workspace and page editor both read and write `merchant_sites` / `site_pages` in dev |
| 3 — Binding resolver | ✅ Built | ✅ Correct |
| 4 — Server renderer | ✅ Built | ✅ Correct |
| 5 — Publish pipeline | ⬜ | 🟡 **Mostly built** — `PublishPage` + review sheet done; rollback / version history not |
| 6 — Public routing & SEO | ⬜ | ⬜ Correct — **nothing** serves a published page |
| 7 — Assets, domains, forms | ⬜ Deferred | ⬜ Correct |
| 8 — Builder canvas | 🟡 not persisted | ✅ **Persisted** — real drafts, real autosave, real publish |

Also landed since: site-wide design workspace (14 palettes, 18 typefaces, WCAG readability
panel), page switcher, Draft-vs-Live status, selection sync, undo-able delete, visual add-section
gallery, review & publish sheet.

---

## 4. Gaps

Ordered by severity. Each entry gives the evidence, the consequence, and what closes it.

### Tier 1 — Publishing does not reach the public

#### 1.1 No route serves a published page

- **Evidence:** nothing outside `app/dashboard/website/` references `site_page_versions` or
  `published_version_id`. `app/sites/[slug]` is the ordering storefront. The built-site route is
  Stage 6 item 22 and does not exist.
- **Consequence:** `PublishPage` writes a correct, immutable, versioned snapshot that nothing
  renders. Publishing is currently a no-op from a visitor's point of view.
- **Closes it:** Stage 6 — `resolve-render-mode.ts` (the routing fork, blocker **B3**) plus
  `app/sites/[slug]/(builder)/[[...path]]/page.tsx`.

#### 1.2 RLS forbids anonymous reads

- **Evidence:** [the migration](../../../supabase/migrations/20260813120000_website_builder_foundation.sql)
  does `REVOKE ALL ON ... FROM PUBLIC, anon` on all three tables; every policy is
  `FOR ALL TO authenticated USING (is_merchant_admin(merchant_id))`.
- **Consequence:** adding a public route is not sufficient — with the anon key it would read
  zero rows.
- **Closes it:** either a service-role read path in the public route, or a new policy granting
  `anon` SELECT on `site_page_versions` rows that are currently live. Decide deliberately; this
  is the one place where a loose policy exposes every merchant's unpublished drafts.

#### 1.3 Site navigation never renders

- **Evidence:** [site-context.ts](../../../lib/site-builder/site-context.ts) hardcodes `nav: []`
  in `buildRenderContext`; `HeaderSection` renders its `<nav>` only when `nav.length > 0`.
  `merchant_sites.nav` exists and is never read.
- **Consequence:** even with several pages published, visitors have no way to move between them.
- **Closes it:** read `merchant_sites.nav` into the render context, and give the merchant a way
  to edit it (see 3.1).

#### 1.4 Publishing does not invalidate any cache

- **Evidence:** no `revalidatePath` or `revalidateTag` anywhere under
  `app/dashboard/website/`.
- **Consequence:** latent until 1.1 lands, then immediate — publishes would not appear.
- **Closes it:** Stage 6 item 24, verified with a publish → `curl` loop.

### Tier 2 — Content the merchant cannot create

#### 2.1 There are no images, anywhere

- **Evidence:** `site_assets` is Stage 7 and does not exist. `resolveAssetUrl` returns `null` for
  every id ([render-context.ts](../../../lib/site-builder/render-context.ts)). Every image field
  in the inspector renders a placeholder reading *"Image uploads arrive with the asset library"*
  ([SettingsPanel.tsx:530](../../../components/site-builder/builder/SettingsPanel.tsx#L530)).
- **Consequence:** no hero image, no story image, no photos. For a **restaurant** website this is
  the largest content gap in the feature — food photography is the main reason a guest stays on
  the page.
- **Closes it:** Stage 7 ([PLAN-05](PLAN-05-INFRA-ASSETS-DOMAINS-FORMS.md)). Note that plan's own
  warning: it assumes an upload API that needs two days of design first.

#### 2.2 The Gallery section can never contain a photo

- **Evidence:** `gallery` is offered in the add-section gallery as *"A grid or carousel of
  photos"*, and depends entirely on 2.1.
- **Consequence:** a merchant can add a section that is structurally incapable of doing what its
  own description promises.
- **Closes it:** Stage 7 — or, until then, mark it unavailable in the gallery with the reason.
  This is a one-line change and is listed in §6.

#### 2.3 Nine of seventeen section kinds

- **Evidence:** `SECTION_KINDS` in [kinds.ts](../../../lib/site-builder/sections/kinds.ts).
- **Consequence:** `reviews` and `reservations` are the two merchants ask for most; both were cut
  for lack of a data source (no reviews table; `lib/reservations/` is a single file). `cards`,
  `form`, `video`, `events`, `pdf`, and `scrolling-banner` are additive — a schema file and a
  registry entry each, no migration.
- **Closes it:** per-kind work; deliberate v1 cut, not an oversight.

### Tier 3 — Pages

#### 3.1 Multi-page exists only as server actions

- **Evidence:** `CreatePage`, `RenamePage`, `DeletePage`, `GetHomePage` all exist and work in
  [pages.ts](../../../app/dashboard/website/actions/pages.ts). Nothing in the UI calls any of
  them except the new `CreateHomePage`.
- **Consequence:** the page switcher in the editor toolbar can only ever list one page. Its
  **Manage pages** item links to `/dashboard/website`, which counts pages but offers no create,
  rename, duplicate, or delete. Multi-page is modelled end-to-end in the schema and invisible in
  the product.
- **Closes it:** a page-management surface — the plan's §6.2 page list with title, `/path`,
  home indicator, draft dot, and row actions.

#### 3.2 Page settings edits SEO only

- **Evidence:** `PageSettings` in
  [SettingsPanel.tsx](../../../components/site-builder/builder/SettingsPanel.tsx) writes
  `doc.seo.title` and `doc.seo.description` and nothing else.
- **Consequence:** a merchant cannot rename a page, change its address, set it as the home page,
  hide it, or delete it from the editor.
- **Closes it:** wire the existing `RenamePage` / `DeletePage` actions into a page settings
  panel. `checkPagePath` and `slugifyPagePath` already exist for validation.

#### 3.3 `site_pages.location_id` is never honoured at render time

- **Evidence:** `renderCanvas(doc, locationId)` and `buildRenderContext(site, mode)` both take
  the *storefront's* location, never the page row's `location_id`.
- **Consequence:** a brand page (`location_id = NULL`) renders as though it were scoped to one
  location. `canShowPrices()` can therefore never return `false`, which quietly defeats the
  "no prices until the visitor picks a location" rule agreed on 2026-08-15. The mechanism is
  built and correct; nothing feeds it the right input.
- **Closes it:** thread the page's `location_id` into the render context, and build the location
  picker for unscoped pages (Stage 6).

### Tier 4 — Publish lifecycle

#### 4.1 No rollback or version history

- **Evidence:** Stage 5 item 20 — `rollbackToVersion`, `listVersions`, `diffVersions` — is
  unbuilt. The table is append-only and correct; nothing reads it back.
- **Consequence:** history accumulates and is unreachable. A merchant who publishes a mistake has
  no way back except re-editing.
- **Closes it:** the three actions, plus a version list in the review sheet. The schema already
  supports it: `rolled_back_from_version_id` exists so a rollback inserts a *new* version rather
  than reactivating an old row. **The UI must say that prices are not rolled back** — only the
  layout is versioned (D6).

#### 4.2 No mobile-preview acknowledgement before first publish

- **Evidence:** required by §6.9 and §7 of the page-editor plan; not implemented.
- **Consequence:** merchants publish desktop-only layouts. Most restaurant traffic is mobile.

#### 4.3 No server-action tests

- **Evidence:** all 243 tests are pure-logic. `PublishPage`, `SaveDraft`, `LoadDraft`, and the
  page CRUD actions have no coverage.
- **Consequence:** the version-numbering race, the content-hash no-op path, and the supersede
  step are verified only by one manual browser run.

#### 4.4 Tenancy has never been verified

- **Evidence:** [`scripts/verify-site-tenancy.ts`](../../../scripts/verify-site-tenancy.ts)
  exists and, per the README, has never been run against an environment with the migration
  applied. The migration is now applied in dev.
- **Consequence:** `LoadDraft`, `SaveDraft`, and `PublishPage` all select by `id` alone and rely
  entirely on RLS for isolation. That is the correct design, and it is untested. This is the
  cheapest high-value item on the list — the script is already written.

### Tier 5 — Preview

#### 5.1 The preview route still renders the demo fixture

- **Evidence:** [preview/page.tsx](../../../app/dashboard/website/preview/page.tsx) builds
  `createDemoPage()` and renders a diagnostics bar reading *"fixture-driven — no site tables
  required"*.
- **Consequence:** the design workspace's **Full preview** and the editor's external-link button
  both point here, so a merchant clicking Preview sees Tony's Pizza — a fictional Brooklyn
  pizzeria — instead of their own page. This was defensible while the editor was also
  fixture-driven; now that the editor loads real drafts it is simply wrong.
- **Closes it:** swap the fixture for `LoadDraft(pageId)` and accept `?page=`. The route's own
  header comment calls this a one-line change. Remove the diagnostics bar, or gate it behind a
  dev flag.

### Tier 6 — Settings, docs, and measurement

#### 6.1 No site settings surface

`merchant_sites.site_seo` and `.integrations` are written by `UpdateSiteSettings` and have no UI.
Missing: favicon, social sharing image, subdomain, custom domain, site visibility, legal pages,
analytics. Custom domains are an explicit v1 cut; the rest are not.

#### 6.2 The README progress table is stale

See §3. It understates Stages 2, 5, and 8 and would mislead anyone picking the work up.

#### 6.3 No instrumentation

None of the §12 funnel metrics — editor opened → first edit → saved draft → preview → review →
published — are recorded. There is no way to tell whether any of this works for real merchants.

---

## 5. Affordances that currently mislead

Called out separately because these were introduced by the most recent work and are the only
items on this list that actively tell a merchant something untrue. All three are small.

| Where | What it says | What is true |
|---|---|---|
| Review sheet success state | "Your page is live" / **Open the live page** | The link goes to the ordering storefront. No route serves the published page (1.1). |
| Editor page switcher | **Manage pages** | Links to the overview, which has no page management (3.1). |
| Add-section gallery | **Gallery** — "A grid or carousel of photos" | Cannot contain a photo (2.2). |

## 6. Recommended order

1. **Fix the three misleading affordances** (§5) and **point preview at the real draft** (5.1).
   Hours, not days, and they are the only things currently lying to merchants.
2. **Run `verify-site-tenancy.ts`** (4.4). Everything built assumes RLS nobody has tested, and
   the script already exists.
3. **Stage 6 — public routing** (1.1 → 1.4, and 3.3 alongside it). This is what makes publish
   mean anything, and it is the largest single piece of remaining work.
4. **Page management** (3.1, 3.2). Unlocks the multi-page model that is already fully built
   underneath.
5. **Rollback and version history** (4.1), then **server-action tests** (4.3).
6. **Stage 7 — assets** (2.1, 2.2). The biggest content gap, and the largest dependency: read
   [PLAN-05](PLAN-05-INFRA-ASSETS-DOMAINS-FORMS.md)'s own two-day design question first.

## 7. Corrections to make in existing docs

- [README.md](README.md) — replace the progress table with §3 above; the Stage 2 "migration NOT
  applied" banner and the "edits are lost on refresh" note are both false now.
- [README.md](README.md) — the "See it working now" block recommends `/dashboard/website/preview`
  as the demo surface. Once 5.1 lands it stops being fixture-driven and the wording needs to
  change with it.
