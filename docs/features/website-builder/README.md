# Merchant Website Builder

Merchant-operated drag-and-drop website builder layered on top of the existing online-ordering storefront.
Merchants build and publish their own multi-section sites; pages render server-side with **live** menu, price, and
availability data drawn straight from the POS.

**Ticket:** [Merchant Website Builder — productionize the MockBuilder foundation](https://app.notion.com/p/Merchant-Website-Builder-productionize-the-MockBuilder-foundation-3b98280c1b1d810ab700d23393f8da56)
**Start here:** [PLAN-00-GENERAL.md](PLAN-00-GENERAL.md)

## Progress

| Stage | Status |
|---|---|
| 1 — Section contract | ✅ **Built 2026-08-13** — [lib/site-builder/](../../../lib/site-builder/) |
| 2 — Tenancy & persistence | 🟡 **Code-complete 2026-08-13, migration NOT applied** — see [PLAN-02](PLAN-02-INFRA-DATA-MODEL.md) status block |
| 3 — Binding resolver | ✅ **Built 2026-08-13** — reuses `get_menus_for_location`, so prices cannot drift from the storefront |
| 4 — Server renderer | ✅ **Built 2026-08-13** — 9 server sections + fixture-driven preview at `/dashboard/website/preview` |
| 5 — Publish pipeline | ⬜ |
| 6 — Public routing & SEO | ⬜ |
| 7 — Assets, domains, forms | ⬜ Deferred out of v1 |
| 8 — Builder canvas | 🟡 **Built 2026-08-13, not persisted** — `/dashboard/website/builder`, verified in a browser; edits are lost on refresh until the migration lands |

> **See it working now** — no migration needed:
> `npm run dev`, then open **`/dashboard/website/preview`** as a merchant with an online store. A complete
> restaurant homepage renders server-side with that merchant's real menu, real prices, real address and real
> hours. Add `?mode=builder` to see the overlay attributes. It is fixture-driven, so it touches none of the new
> tables.
>
> **Still outstanding:** apply
> [20260813120000_website_builder_foundation.sql](../../../supabase/migrations/20260813120000_website_builder_foundation.sql)
> to staging, then run `npx tsx scripts/verify-site-tenancy.ts --list` and the `--a/--b` form. No SQL in Stage 2 has
> been executed — the DDL, triggers, and RLS policies remain unverified until that passes.

> ## ⚠️ Site granularity changed on 2026-08-15 — **D4 is superseded**
>
> **One site per merchant**, not one per location. A merchant gets a single brand website; each location is a
> *page* beneath it (`site_pages.location_id`, nullable — NULL = brand page). Online ordering is untouched and
> stays per location: a location page's "Order Now" links into that location's existing `/sites/{slug}`
> storefront.
>
> *Why:* under D4 a five-location merchant maintained five separate websites, five copies of the same About
> page, and — the part that costs money — SEO authority split five ways instead of accumulating on one domain.
>
> **Product rule agreed with the team: no prices until the visitor picks a location.** Branches can charge
> different amounts for the same dish, so a price shown before a location is chosen is a guess. Names, photos and
> descriptions still show (they are merchant-level on `menu_items`); only money and 86/snooze wait for a choice.
> Single-location merchants auto-select and never see a picker. Enforced by `canShowPrices()` in
> [render-context.ts](../../../lib/site-builder/render-context.ts) and `ResolverContext.scoped`.
>
> **Never redirect the brand home page based on geolocation.** Googlebot crawls from one place; an auto-redirect
> means Google only ever indexes one location and the whole SEO rationale is lost. Location choice is in-page
> state; `/locations/{slug}` must render fully with no geolocation involved.
>
> Still to build: the location picker, `/locations/{slug}` routing, and location-page auto-generation (Stage 6).

**v1 scope was cut hard on 2026-08-13** — take the simplest option everywhere and revisit later. Builder surface
only (no SEO panel, forms, promos, or analytics surface); 9 section kinds not 17; `reviews` and `reservations` cut
for lack of a data source; subdomains only, no custom domains; no quotas; no caching; `is_merchant_admin` instead
of a new permission code; home page only. See [PLAN-01](PLAN-01-INFRA-SECTION-CONTRACT.md) for what that meant in
practice.

---

## Documents

### Plans

| Document | Stage | Covers |
|---|---|---|
| [PLAN-00-GENERAL.md](PLAN-00-GENERAL.md) | — | **The master plan.** Strategy, the four architectural ideas, ten stages, build order, sizing, risks |
| [PLAN-01-INFRA-SECTION-CONTRACT.md](PLAN-01-INFRA-SECTION-CONTRACT.md) | 1 | Section union, registry, Zod schemas, page document, normalization & forward migration |
| [PLAN-02-INFRA-DATA-MODEL.md](PLAN-02-INFRA-DATA-MODEL.md) | 2 | Tables, DDL, RLS, permissions, server actions, autosave concurrency |
| [PLAN-03-INFRA-RESOLVER-RENDERER.md](PLAN-03-INFRA-RESOLVER-RENDERER.md) | 3–4 | Bindings, live-data resolver, server renderer, builder-overlay protocol |
| [PLAN-04-INFRA-PUBLISH-ROUTING.md](PLAN-04-INFRA-PUBLISH-ROUTING.md) | 5–6 | Versions, publish/rollback, the routing fork, caching, SEO |
| [PLAN-05-INFRA-ASSETS-DOMAINS-FORMS.md](PLAN-05-INFRA-ASSETS-DOMAINS-FORMS.md) | 7 | Asset pipeline + quota, custom domains + TLS, form runtime |
| [PLAN-06-FRONTEND-BUILDER.md](PLAN-06-FRONTEND-BUILDER.md) | 8–9 | Drag-and-drop canvas, undo/redo, starter templates, remaining surfaces |

### Analysis & reference

| Document | Covers |
|---|---|
| [HANDOFF-2026-08-13-BUILD-SESSION.md](HANDOFF-2026-08-13-BUILD-SESSION.md) | **Start here to pick the work up.** Everything built, every decision taken, corrections to the plans, what is proven vs unverified, gotchas, and what to do next |
| [BUGS-2026-08-14-BUILDER-AUDIT.md](BUGS-2026-08-14-BUILDER-AUDIT.md) | 16 open defects in the builder, with trace evidence for why the route is slow. **C1 (autosave drops edits) must be fixed before `SaveDraft` replaces the no-op adapter** |
| [DESIGN-2026-08-14-BUILDER-UI.md](DESIGN-2026-08-14-BUILDER-UI.md) | 🟢 **Built 2026-08-15.** The builder interface redrawn from first principles. Decision register **UI1–UI21** with build status, region-by-region spec, flows, and §8's build report — what shipped, five deviations, what is deferred and why. No migration, no change to the section contract |
| [RESEARCH-2026-08-14-BUILDER-UI-PRIOR-ART.md](RESEARCH-2026-08-14-BUILDER-UI-PRIOR-ART.md) | 18 shipped editors surveyed via Mobbin, with a link to every screen. Establishes that **Shopify's theme editor — not Webflow or Figma — is our reference class**, and that no surveyed product surfaces live data because none has a POS behind the page |
| [ANALYSIS-2026-08-11-MOCKBUILDER-GAP.md](ANALYSIS-2026-08-11-MOCKBUILDER-GAP.md) | Gap analysis, decisions **D1–D6**, blocker register **B1–B12**, MockBuilder source review |
| [FINDING-2026-08-12-EXISTING-CMS-PRIOR-ART.md](FINDING-2026-08-12-EXISTING-CMS-PRIOR-ART.md) | This repo already ships a section-tree CMS with a **server-side renderer**. Reduces the two hardest unknowns to porting problems |
| [RESEARCH-OWNER-COM.md](RESEARCH-OWNER-COM.md) | The reference product — what to copy, what not to, and where they are structurally beatable |
| [VISION-UNBOUNDED.md](VISION-UNBOUNDED.md) | The ceiling. No constraints. Tags every idea **[COMPATIBLE]** or **[REQUIRES CHANGE]** against the v1 architecture |

---

## The plan in four sentences

1. **Build the backend first and prove it publicly before any builder UI exists** — a seeded page rendering live on a
   real domain, versioned and rollback-able, with no drag handles anywhere.
2. **Sections are a discriminated union described by a registry**, which drives validation, editor generation,
   rendering, and diffing from one source of truth.
3. **A page is one atomic JSONB document; a version is one immutable row** — so publish, rollback, and diff are row
   operations.
4. **Live platform data enters through typed bindings, never copied values** — so a price on a published page can
   never go stale, and the renderer stays server-only with the builder as a client overlay on the same render.

## Stage 0 — blocked on these

The schema cannot be finalized until they are answered in writing. See [PLAN-00](PLAN-00-GENERAL.md) §4.

| # | Question | Recommendation |
|---|---|---|
| **B4** | Which of the mock's 9 admin surfaces are in scope? | Ship 5 (Website, SEO, Forms, Promos, Analytics-as-link); drop Storefront + Store Orders; defer Support + Careers. **The ~6-week vs. ~6-month fork** |
| **B10** | Which role may edit the website? | New `website.edit` permission; owner + admin by default |
| **B9** | Plan tiers? | Every tier gets the builder; tiers set quotas, not features |
| **B3** | Which system serves a URL when a location has both a template storefront and a built site? | `render_mode` flips to `builder` on first successful publish; one resolver function ([PLAN-04](PLAN-04-INFRA-PUBLISH-ROUTING.md) §2) |
| **D6 residual** | Does an address/hours edit hit the live site instantly? | Yes — it is a fact about the business, not page content |
| **Phase 6** | Does the builder grow its own checkout? | No. Ratify closing it — an "Order Now" section links into existing online-ordering |

Plus the small pre-work: add `UNIQUE (merchant_id, location_id)` to `online_store_config`, retire the dormant
`online_store_pages` table, and get MockBuilder into version control (**B12**).

## Maintenance

Update the canonical document in place rather than adding a new dated file. Every change to this feature must record
its contracts, dependencies, verification, manual QA, and remaining work here.
