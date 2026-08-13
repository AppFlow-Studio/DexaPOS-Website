# Merchant Website Builder — General Plan

**Date:** 2026-08-12
**Status:** Proposed — awaiting sign-off before Stage 0 starts
**Owner:** Ali Awdi
**Inputs:** [ANALYSIS-2026-08-11-MOCKBUILDER-GAP.md](ANALYSIS-2026-08-11-MOCKBUILDER-GAP.md) ·
[FINDING-2026-08-12-EXISTING-CMS-PRIOR-ART.md](FINDING-2026-08-12-EXISTING-CMS-PRIOR-ART.md) ·
[RESEARCH-OWNER-COM.md](RESEARCH-OWNER-COM.md)

---

## 1. The strategy in one paragraph

Build the **backend first and prove it publicly before any builder UI exists.** The section contract, the database,
the live-data resolver, the server renderer, and the publish pipeline are all buildable and demoable without a single
drag handle — you seed a page with a script and it renders at a real URL, server-side, indexable. Only once that is
true does the drag-and-drop canvas get built, and by then it is plugging into a proven, versioned, tenant-isolated
API instead of being the thing that discovers all the hard problems. This ordering is deliberate: **every hard
question in this feature — tenancy, versioning, stale data, cache invalidation, routing collisions — lives in the
backend, and none of them are easier to answer with a canvas on top of them.**

## 2. Architectural spine — four ideas the whole feature hangs off

Everything in the detailed plans is an elaboration of these four. If you only remember four things, remember these.

### Idea 1 — The section is a discriminated union, described by a registry

One `SectionKind` union; one registry entry per kind declaring its Zod schema, defaults, icon, allowed zone, and its
**server** renderer. The registry is the single source of truth that drives editor UI generation, save-time
validation, read-time normalization, and version diffing. Fixes ANALYSIS **F1**, generalizes the proven
`SECTION_META` pattern from `lib/cms`.
→ [PLAN-01](PLAN-01-INFRA-SECTION-CONTRACT.md)

### Idea 2 — A page is one atomic JSONB document; a version is one immutable row

Not one row per section. A page's draft is a JSONB document on `site_pages`; publishing copies it into an immutable
`site_page_versions` row and points `published_version_id` at it. Publish, rollback, and diff become row operations.
Renders are one read.
→ [PLAN-02](PLAN-02-INFRA-DATA-MODEL.md)

### Idea 3 — Live platform data enters through **bindings**, never through copied values

Decision **D6** ("snapshot structure, reference volatile fields live") becomes a concrete mechanism: a section stores
typed references — `{ type: 'menu_item', id }` — and a **resolver** batches every binding on a page into a handful of
queries at render time. Renderers are pure functions of `(section, resolvedData)`. A deleted or 86'd item resolves to
a typed `Unavailable` marker that renderers omit and the publish validator warns about. This single mechanism
delivers all three D6 consequences at once.
→ [PLAN-03](PLAN-03-INFRA-RESOLVER-RENDERER.md)

### Idea 4 — The renderer is server-only; the builder is a client overlay on top of the same render

Copied from the working pattern in `components/cms/SectionRenderer.tsx` + `InlineCmsPreview.tsx`. There is exactly
one set of section components, they are server components, and the builder decorates them via data attributes rather
than re-implementing them. This is how ANALYSIS **B7** / **F6** are avoided instead of being paid for twice.
→ [PLAN-03](PLAN-03-INFRA-RESOLVER-RENDERER.md) §5

---

## 3. The stages

Ten stages. Stages 0–6 are infrastructure and are the priority. Stage 7+ is the frontend.
Each stage names a **demoable outcome** — if you cannot demo it, it is not done.

| # | Stage | Demoable outcome | Plan |
|---|---|---|---|
| **0** | Decisions & pre-work | Blockers closed in writing; `online_store_config` uniqueness fixed | §4 below |
| **1** | Section contract | `npx tsx` script builds, validates, normalizes, and round-trips a page document. Unit tests green. **No DB.** | [01](PLAN-01-INFRA-SECTION-CONTRACT.md) |
| **2** | Tenancy & persistence | Two merchants save drafts; cross-tenant read is denied by RLS, proven with a script | [02](PLAN-02-INFRA-DATA-MODEL.md) |
| **3** | Binding resolver | Resolver turns a page of bindings into live menu/location data in ≤4 queries; 86'd item comes back `Unavailable` | [03](PLAN-03-INFRA-RESOLVER-RENDERER.md) |
| **4** | Server renderer | A seeded page renders at a preview URL, server-side, with real menu prices. **Still no builder.** | [03](PLAN-03-INFRA-RESOLVER-RENDERER.md) |
| **5** | Publish pipeline | Publish → version row created → live URL changes. Rollback → previous version serves. Cache invalidates. | [04](PLAN-04-INFRA-PUBLISH-ROUTING.md) |
| **6** | Public routing & SEO | Built site serves on the merchant's real subdomain/domain; template storefront still serves for everyone else; sitemap + metadata correct | [04](PLAN-04-INFRA-PUBLISH-ROUTING.md) |
| **7** | Assets, domains, forms | Merchant uploads an image inside quota; custom domain self-serves; a form submission is delivered and recorded | [05](PLAN-05-INFRA-ASSETS-DOMAINS-FORMS.md) |
| **8** | Builder canvas | Drag-and-drop, add/delete/reorder, undo/redo, device preview, autosave | [06](PLAN-06-FRONTEND-BUILDER.md) |
| **9** | Surrounding surfaces | SEO panel, forms manager, promos, analytics — scoped by B4 | [06](PLAN-06-FRONTEND-BUILDER.md) §7 |

### The line that matters

**Stages 1 → 6 have zero UI dependency.** You can complete all six with `npx tsx` scripts, SQL seeds, and a
password-gated `/preview` route. At the end of Stage 6 a real merchant site is live on a real domain with live menu
prices, versioned and rollback-able — and the builder has not been started. That is the de-risking.

---

## 4. Stage 0 — what to settle before writing the first migration

These are cheap now and expensive after merchants have data. Three of them **gate the schema**.

### 4.1 Blockers that gate the schema (must answer)

| Blocker | Question | Recommendation to ratify |
|---|---|---|
| **B4** | Which of the mock's 9 surfaces are in scope? | **Ship 5:** Website, SEO, Forms, Promos, Analytics-as-a-link. **Drop:** Storefront + Store Orders (collide with `menu_items` / existing orders; ~3,500 LOC of hardware-distributor model). **Defer:** Support, Careers. This is the ~6-week vs. ~6-month fork. |
| **B10** | Which role may edit the website? | New permission code `website.edit`, granted to merchant owner + admin by default. Do **not** reuse `menu.edit`. Needed as a literal string in Stage 2's RLS policies. |
| **B9** | Plan tiers? | Gate at the **quota** level, not the feature level: every tier gets the builder; tier sets page count, asset MB, and custom-domain eligibility. Tier columns must exist in Stage 2 even if all limits start unlimited — adding limits later to live sites is a migration + a customer conversation. |
| **D6 residual** | For `location` / `reservations`, does an address edit hit the live site instantly or on republish? | **Instantly.** An address is a fact about the business, not page content. Confirm per kind in the PLAN-01 registry. |

### 4.2 Pre-work (small, do it in Stage 0)

- [ ] **Add `UNIQUE (merchant_id, location_id)` to `online_store_config`.** D4's "one site per location" is convention,
      not a constraint ([041_online_store_config.sql:205-208](../../../utils/migrations/041_online_store_config.sql)).
      The builder is about to depend on it. Run a duplicate check on prod first.
- [ ] **Decide the fate of `online_store_pages`** (ANALYSIS §3.4 — 8 section types, RLS on, zero readers, seeded by
      HQ at [online-ordering.ts:1579](../../../app/manage/actions/admin-merchant/online-ordering.ts#L1579)).
      **Recommendation: retire it.** Drop the seeding insert; leave the table for one release, then drop it. Do not
      extend it — its shape (one row per section, columns per field) is the model PLAN-02 argues against.
- [ ] **Commit MockBuilder to git** with a `.gitignore` (**B12**). It is the visual spec and it exists on one machine.
- [ ] **Confirm which Supabase project holds `page_content`** — it is absent from `schema.sql`. Affects nothing in
      the plan, but affects where you look while porting patterns.
- [ ] **Write the routing fork decision down** (**B3/D5) — see [PLAN-04](PLAN-04-INFRA-PUBLISH-ROUTING.md) §2 for the
      proposed rule. It must exist before the first built site goes live, and it is one column plus one function.

### 4.3 Explicitly closing Phase 6 (commerce)

ANALYSIS §6.5 recommends it and **D1** implies it: the builder does not grow its own checkout, cart, tax engine, or
carrier rating. An "Order Now" section links into the existing online-ordering flow. The mock's `weightOz` /
`lengthIn` / nexus-state / Pub-718 commerce types model a hardware distributor shipping boxes and do not apply.
**Ratify this in Stage 0** — it removes an entire phase.

---

## 5. Practical build order — what you actually type, in order

A linear checklist across Stages 1–6. Each numbered item is roughly one PR.

**Stage 1 — contract (no DB, no UI)**
1. `lib/site-builder/sections/kinds.ts` — the `SectionKind` union + zone rules
2. `lib/site-builder/sections/schemas.ts` — one Zod schema per kind, discriminated on `kind`
3. `lib/site-builder/sections/registry.ts` — the registry (schema, defaults, label, icon, zone, singleton flag)
4. `lib/site-builder/page-document.ts` — `PageDocument` type, `createPage`, `normalize`, `migrate`, `validate`
5. `lib/site-builder/__tests__/` — round-trip, unknown-kind survival, forward-migration tests

**Stage 2 — persistence**
6. Migration: `merchant_sites`, `site_pages`, `site_page_versions` (+ enums, indexes, `updated_at` triggers)
7. Migration: RLS policies + `website.edit` permission seed
8. `app/dashboard/website/actions/site.ts` — get/create site, list pages
9. `app/dashboard/website/actions/draft.ts` — `saveDraft` with optimistic concurrency (`revision` check)
10. Cross-tenant isolation test script

**Stage 3 — resolver**
11. `lib/site-builder/bindings/types.ts` — `Binding`, `ResolvedBinding`, `Unavailable`
12. `lib/site-builder/bindings/collect.ts` — walk a document, gather every binding
13. `lib/site-builder/bindings/resolve.ts` — batch fetch (menu items, location, hours, reviews), honor snooze/86
14. Resolver tests incl. deleted-item and snoozed-item paths

**Stage 4 — renderer**
15. `components/site-builder/sections/*.tsx` — one server component per kind (start with `header`, `hero`, `content`, `popular-items`, `footer`; the rest follow)
16. `components/site-builder/PageRenderer.tsx` — registry dispatch, `editAttrs` stamping
17. `app/dashboard/website/preview/[pageId]/page.tsx` — authenticated preview of the draft

**Stage 5 — publish**
18. `app/dashboard/website/actions/publish.ts` — validate → snapshot → version row → repoint → revalidate
19. Publish-time validator (unresolvable bindings, missing SEO, empty required zones)
20. `rollbackToVersion`, `listVersions`, `diffVersions`

**Stage 6 — public**
21. `lib/site-builder/resolve-render-mode.ts` — the single routing-fork function (**B3**)
22. `app/sites/[slug]/(builder)/[[...path]]/page.tsx` — the public built-site route
23. `generateMetadata`, `sitemap.ts`, `robots.ts`, JSON-LD `Restaurant` structured data
24. Cache tags + `revalidateTag` wiring, verified with a publish → curl loop

## 6. Success criteria for the infrastructure half

Borrowed from the ticket's acceptance criteria, restated so they are testable **without the builder UI**:

- [ ] Two merchants each have a seeded site; merchant A's server action cannot read or write merchant B's page — proven by a failing-by-design script, not by inspection
- [ ] A published page is reachable at the merchant's real hostname, returns fully-formed HTML to `curl` with JS disabled, and carries correct `<title>`/`<meta>`/JSON-LD
- [ ] Changing an item's price in the POS changes the live page on the next request, with **no republish**
- [ ] 86'ing an item removes it from the live page, with no republish and no layout break
- [ ] Deleting a bound menu item does not error the page; it disappears and the builder shows a warning
- [ ] Publish creates a version row; rollback restores the previous layout and says in the UI that prices are *not* rolled back
- [ ] A location with a template storefront and no built site is byte-for-byte unaffected
- [ ] `npm run lint` and `npx tsc --noEmit` pass

## 7. Rough sizing

Assumes one developer, the B4 "ship 5 surfaces" scope, and the CMS patterns reused rather than reinvented.

| Stage | Estimate | Notes |
|---|---|---|
| 0 — decisions | 2–3 days | Mostly writing + one migration |
| 1 — contract | 3–4 days | Pure TS; the highest-leverage days in the project |
| 2 — persistence | 4–5 days | Migration + RLS + actions |
| 3 — resolver | 4–5 days | The genuinely novel piece |
| 4 — renderer | 8–10 days | 17 kinds; front-loaded on the first 5 |
| 5 — publish | 4–5 days | Small if Idea 2 holds |
| 6 — routing/SEO | 3–4 days | Routing fork is small; SEO surface is fiddly |
| **Infra subtotal** | **~6 weeks** | |
| 7 — assets/domains/forms | 2–3 weeks | Domain provisioning (**B8**) is the long pole and is vendor-dependent |
| 8 — builder canvas | 3–4 weeks | The mock is the spec, so this is implementation not design |
| 9 — surfaces | 2–3 weeks | Scales directly with the B4 answer |

**Total ≈ 13–16 weeks** at the recommended scope. Keeping Storefront + Store Orders in scope adds roughly a quarter
on its own — which is the argument for closing **B4** the way §4.1 recommends.

## 8. Risks

| Risk | Why it bites | Mitigation |
|---|---|---|
| Section schema churns after merchants have data | Every change becomes a JSONB migration across live sites | `normalize` + `migrate` on read from day one (PLAN-01 §6); store `schema_version` on every document |
| Two systems race for one URL | A merchant ends up with a template site and a built site and the wrong one serves | One resolver function, one column, decided in Stage 0 (**B3**) |
| Live bindings make pages slow | Every render joins to menus | Resolver batches; shell cached by tag, bindings short-TTL (PLAN-04 §5) |
| Merchant-authored HTML | Stored XSS on a public domain | `sanitizeHtml` on **write and read**; no `custom_html` kind in v1 |
| Scope creep from the mock's 9 surfaces | 6 weeks becomes 6 months | **B4** answered in writing before Stage 1 |
| Builder built before the backend | Every hard problem discovered late, with a UI to retrofit | This document's stage order |

---

## 9. Document map

| Document | Covers |
|---|---|
| [PLAN-01-INFRA-SECTION-CONTRACT.md](PLAN-01-INFRA-SECTION-CONTRACT.md) | Section union, registry, Zod, page document, normalization & forward migration |
| [PLAN-02-INFRA-DATA-MODEL.md](PLAN-02-INFRA-DATA-MODEL.md) | Tables, DDL, RLS, permissions, server actions, autosave concurrency |
| [PLAN-03-INFRA-RESOLVER-RENDERER.md](PLAN-03-INFRA-RESOLVER-RENDERER.md) | Bindings, resolver, server renderer, edit-overlay protocol |
| [PLAN-04-INFRA-PUBLISH-ROUTING.md](PLAN-04-INFRA-PUBLISH-ROUTING.md) | Versions, publish/rollback, routing fork, caching, SEO |
| [PLAN-05-INFRA-ASSETS-DOMAINS-FORMS.md](PLAN-05-INFRA-ASSETS-DOMAINS-FORMS.md) | Asset pipeline + quota, custom domains + TLS, form runtime |
| [PLAN-06-FRONTEND-BUILDER.md](PLAN-06-FRONTEND-BUILDER.md) | Drag-and-drop canvas, undo/redo, preview, remaining surfaces |
| [VISION-UNBOUNDED.md](VISION-UNBOUNDED.md) | What this becomes with no constraints — the ceiling to aim at |
| [RESEARCH-OWNER-COM.md](RESEARCH-OWNER-COM.md) | Competitive reference and what to copy vs. deliberately not copy |
