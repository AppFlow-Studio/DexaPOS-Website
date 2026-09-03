# Merchant Website Builder — Gap Analysis

**Date:** 2026-08-11
**Ticket:** [Merchant Website Builder — productionize the MockBuilder foundation](https://app.notion.com/p/Merchant-Website-Builder-productionize-the-MockBuilder-foundation-3b98280c1b1d810ab700d23393f8da56)
**Purpose:** Establish what the ticket asks for, what this repo already has, and what is genuinely new work.

## Codebases referenced

| Codebase | Path | Role |
|---|---|---|
| **DexaPOS Web Dashboard** | `C:\Users\HP i5\Desktop\mdptech\DexaPOS-website\DexaPOS-Website` | This repo. Hosts the existing online-ordering storefront (§3). |
| **MockBuilder** (the mock) | `C:\Users\HP i5\Desktop\mdptech\DexaPOS-website\Mock Builder\MockBuilder` | The prototype the ticket is about (§2, §5). Reviewed directly — findings in §5. Not under version control. |
| `mtech-portal-react` | *(not available locally)* | MTech Distributors portal named in the mock's `README.md` as the origin. See §5.4. |

Section §5 records a direct source review of the MockBuilder checkout at the path above, performed
2026-08-11. Where it contradicts the ticket, §5 is the observed behavior.

---

## 0. Decisions taken

Recorded 2026-08-12. Each entry keeps the original concern so a decision can be revisited without
re-deriving why it was raised.

### D1 — This is an **addition to** online-ordering, not an alternative

The builder is layered **on top of** the existing online-ordering storefront and **inherits its
rules**. It does not replace it, does not fork its data model, and does not introduce a parallel
tenancy or hosting scheme.

*Consequence:* everywhere this document previously framed the builder as a possible replacement for
`/sites/[slug]`, read it instead as an added capability on the same foundation. §3 stops being
"the thing we might replace" and becomes "the platform we build on."

### D2 — Merchant-operated

Merchants build and run their own sites. This closes the ticket's open question #2 and, with it,
question #1: **the work lands in this repo** (`DexaPOS-Website`), because auth, merchant tenancy,
RLS, location scoping, storefront hosting, and the payments path already work here.

*Retained concern:* the mock's `website-storefront` / `website-orders` / `website-support` /
`website-careers` surfaces were authored for MTech Distributors' own hardware business, not a
restaurant merchant. See §5.4 and blocker **B4** — the identity question is settled, the
**surface-scope** question it exposed is not.

### D3 — The mock is a **specification, not a codebase**

MockBuilder is treated as a visual and behavioral spec — proof of what is wanted and a basic
reference to build above. Its source is **not** being ported.

*Consequence:* findings **F1, F4, F5, F6, F7, F8** in §5.3 are objections to *porting* and are moot
under a rebuild. They are retained, marked `MOOT (rebuild)`, because they become live again if
anyone proposes lifting the mock's code. Two lessons survive regardless — see **B7** (dual-use
renderers) and F1's note on discriminated unions.

*Retained risk:* the spec exists on one machine and is not in version control — see **B12**.

### D4 — Site granularity follows online-ordering: **one site per location**

> ## ❌ SUPERSEDED 2026-08-15 — it is now **one site per merchant**
>
> Decided with the team. A merchant gets one brand website; each location is a *page* beneath it
> (`site_pages.location_id`, nullable). Online ordering is unchanged and stays per location.
>
> D4's reasoning below is still worth reading — it was a defensible inheritance of an existing rule, and it is
> correct that location-dependent sections need no new resolution rule. What it missed is that a five-location
> merchant then maintains five separate websites with five copies of the same About page, and that SEO authority
> splits five ways instead of accumulating on one domain. The SEO consequence is what settled it.
>
> See [README](README.md) and [HANDOFF §11](HANDOFF-2026-08-13-BUILD-SESSION.md) for the replacement model.

Resolves blocker **B1** by inheriting the existing rule rather than inventing one.
[schema.sql:2270+](../../../schema.sql) — `online_store_config` is `merchant_id NOT NULL` +
`location_id NOT NULL`, with `slug UNIQUE` and `custom_domain UNIQUE`. One store, one slug, one
domain **per location**.

The builder adopts this exactly: a `site` row hangs off an `online_store_config` row, so a merchant
with five locations gets five sites, each already carrying its own address, hours, menu, and domain.
Location-dependent sections (`location`, `reservations`, hours) resolve against that config's
`location_id` — no new resolution rule needed.

*Retained concerns:*
- **No `UNIQUE (merchant_id, location_id)` constraint exists** — only non-unique indexes
  ([041_online_store_config.sql:205-208](../../../utils/migrations/041_online_store_config.sql)).
  "One store per location" is convention, not enforced. Worth adding before the builder depends on it.
- Merchants who want **one brand site spanning all locations** are not served by this model. If that
  is ever requested it is a schema change, not a feature toggle.

### D5 — The four existing templates stay; convergence deferred

Blocker **B3** is parked, not closed. Classic / Hero / Market / Boutique keep serving live merchants
and are not migrated, retired, or converted into builder presets for now.

*Retained concern — this is deferred, not resolved.* Both systems will render into the same URL
space: [proxy.ts:113-142](../../../proxy.ts) routes a subdomain or custom domain to
`online_store_config.slug` → `/sites/[slug]`. Once a location has **both** a template storefront and
a built site, something must decide which one serves that URL. Options remain: replace, run both
behind a per-location switch, or convert the templates into builder starter presets. Deciding late
is acceptable; deciding never is not — **the routing fork has to exist before the first built site
goes live.**

### D6 — Section data: **split per field** — snapshot structure, reference volatile fields live

Resolves blocker **B2**. Rather than choosing snapshot *or* live reference for a whole section,
the line is drawn by **how often a field changes and who owns it**.

| Stored in the section row (snapshot) | Resolved live at render |
|---|---|
| Which records — item / location IDs | `name`, `description` |
| Their order | `price` |
| Section heading and subtitle | `image` |
| Layout / style variant | availability, 86 / snooze state |
| Merchant-authored override copy (e.g. a custom caption) | anything else the source record owns |

So a `popular-items` section stores *"items 4471, 4472, 4488, 4491, in this order, under the heading
'Guest Favorites'"* — and price and availability are fetched fresh on every render.

**Why:** publish, version history, and rollback stay meaningful because they govern the *layout*,
which is the thing the merchant actually edits. Prices and availability can never go stale, because
they are never copied. It also matches what the platform already does — `getStorefrontData()`
([app/sites/actions.ts:122](../../../app/sites/actions.ts)) resolves config and menus fresh per
request with no ISR directive, so the builder inherits existing behavior rather than inventing a
second one (**D1**).

**Consequences to build for:**

1. **Deleted / renamed source records.** Because sections reference by ID, a deleted menu item must
   not break a live page. Required behavior: skip the record silently at render, and surface it as a
   warning in the builder plus a publish-time validation notice. This is a real requirement that
   falls directly out of D6 — it does not exist in the mock.
2. **86 / snooze must be honored.** This repo already models item and category snoozing
   ([app/dashboard/actions/item-snooze.ts](../../../app/dashboard/actions/item-snooze.ts),
   `20260720180000_category_86_snooze.sql`). A snoozed item should not render as orderable on a
   built page. Define whether it hides or greys out.
3. **Rollback semantics need stating in the UI.** "Restore this version" brings back the *layout*,
   not old prices. Merchants will assume otherwise unless the copy says so.
4. **Caching is constrained, not blocked** — see **B6**. Live fields mean a published page cannot be
   cached indefinitely. The existing storefront is fully dynamic, which is the safe default to
   inherit; if SEO or TTFB later demands ISR, the split makes it possible to cache the snapshotted
   shell and fetch volatile fields separately.

*Retained concern — one sub-decision is still open.* The line above is clearly right for
`popular-items`. It is less obvious for `location` and `reservations`: if a merchant edits their
address or hours, should the published site change immediately, or wait for a republish?
**Recommendation: immediately** — an address is a fact about the business, not page content, and a
stale address on a live site is worse than an unexpected update. Confirm per section kind before the
schema is cut.

### Still open

| Ticket question | Status |
|---|---|
| #1 Where does this live | ✅ Closed by D2 — this repo |
| #2 Merchant vs. Mtech-operated | ✅ Closed by D2 — merchant-operated |
| #3 Plan tiers | ⬜ Open — blocker **B9** |
| #4 Payments processor | ✅ Effectively closed by D1 — inherits online-ordering's path |
| #5 Template library | 🟡 Partly — D2 sets direction (restaurant), assets still unscoped (**B11**) |
| #6 Repo state | ⬜ Open — **B12** |
| — Section data: snapshot vs. live | ✅ Closed by **D6** — split per field |

---

## 1. The one-line difference

> **Today:** the merchant customizes *our* website.
> **The ticket:** the merchant builds *their own* website.

Both produce "a public website for a merchant," at a public URL, with a logo and brand colors.
The difference is **who controls the page structure** — today that is us, hardcoded. The ticket
moves that control to the merchant.

### Concrete example

A coffee shop owner wants to add *"Our Story — we roast our own beans since 1998"* with three
photos, placed under the hero.

- **Today:** impossible. Not a field in the settings form. Requires us to write custom code.
- **After the ticket:** click `+`, pick "Content", type the story, drop in photos, drag it into
  position, hit Publish. Two minutes, no developer.

---

## 2. What the ticket asks for

**Source of truth:** the `MockBuilder` prototype (Next.js 16 / React 19 / Tailwind 4, ~17.5k LOC).
A fully designed, design-QA'd, **zero-backend** mock. Its `design-qa.md` records a pixel-comparison
pass with no open P0/P1/P2 findings.

The ticket is explicit: this is **not** "design and build a website builder." It is
**"put a backend, a tenant model, and a render/publish pipeline underneath a builder that already exists."**

### 2.1 What the mock already provides

**The builder canvas** — `Website2StandaloneBuilderClient.tsx`, ~5,100 lines:

- **17 section kinds:** `header`, `hero`, `content`, `gallery`, `popular-items`, `features`,
  `cards`, `faq`, `location`, `form`, `pdf`, `reservations`, `reviews`, `scrolling-banner`,
  `video`, `events`, `footer`
- Locked `header` / `hero` / `footer` boundaries that reordering cannot cross
- Per-section action panels, an Add Section insertion bar with a 12-option modal, floating
  edit / delete / move-up / move-down controls
- Device preview modes: `desktop`, `tablet`, `mobile`
- Form section ships four tailored templates (event planning · 12 fields, contact · 7,
  table reservation · 9, hosted event · 14)
- No Puck or other third-party builder dependency

**Nine merchant admin surfaces**, wired into `MockShell.tsx`:

| Surface | Route | State of the mock |
|---|---|---|
| Website | `/website-2` | Full builder canvas |
| Storefront | `/website-storefront` | Product settings + nested category tree manager |
| Store Orders | `/website-orders` | ~2,500 lines incl. a NYS Pub 718 tax-import panel |
| Promo Popups | `/website-promos` | Popup authoring + scheduling |
| Forms | `/website-forms` | Template-driven form builder |
| Analytics | `/website-analytics` | GA service **stub** |
| SEO | `/website-seo` | Backed by a **real** scoring engine, `seoRating.ts` |
| Customer Support | `/website-support` | Ticket surface |
| Careers | `/website-careers` | Job posting surface |

**Commerce domain types already production-shaped** — `src/lib/website2/store/types.ts`, written as
pure types with no server imports so order math and tax stay unit-testable:

- `StoreSettings` — currency, `taxProvider` (`flat` | `taxjar` | `us-table`), nexus states,
  pickup, unpaid-order expiry, order-number prefix, low-stock threshold
- `ValidatedLine` — a cart line validated against a live `website_products` view
- `ShippingRateQuote` — a carrier rate snapshotted at checkout and **never re-rated**
- `OrderTotals` with a `taxBreakdown` and a `taxCalculationRef` audit handle
- `WebsiteOrderStatus`: `pending_payment` → `paid` → `fulfilled` | `cancelled` | `expired` | `refunded`
- `StockState`: `reserved` | `finalized` | `released` | `restocked`
- Names real Postgres tables (`website_product_settings`, `website_product_categories`) and carries
  migration-guard error constants so a screen can say *"apply the migration"* rather than failing opaquely

### 2.2 The gap the ticket names

Every item is a **deliberate** omission documented in the mock's `README.md` — missing
infrastructure to build, not broken code to fix.

1. **No tenancy** — single-site; no merchant/site concept, no isolation, no RLS
2. **No persistence** — sections live in `localStorage` under `mockbuilder.website2.sections.v12`,
   versioned by a `STORAGE_SCHEMA` constant. Clearing the browser wipes the site.
3. **No real actions** — every `actions.ts` mutates in-memory arrays in `mockData.ts` and returns `{ ok: true }`
4. **No auth** — no gate, no session, no roles
5. **No asset pipeline** — static PNGs in `public/`, several 2–3 MB and unoptimized
6. **No renderer** — nothing turns a saved section tree into a public, indexable website
7. **No publish** — no draft/live split, no versioning, no rollback
8. **No domains** — no custom-domain mapping or TLS

### 2.3 Proposed phasing (from the ticket)

- **Phase 1 — Tenancy & persistence** *(unblocks everything else)*
  `merchant → site → page → section` in Postgres; sections as ordered JSONB rows keyed by the
  existing `SectionKind` union so the TypeScript types port over unchanged. Carry `STORAGE_SCHEMA`
  into the DB as a migration marker. RLS per merchant. Auth + roles (owner / staff / read-only).
  Replace `localStorage` with autosaving server actions, keeping local storage as an offline draft cache.
- **Phase 2 — Real server actions**
  Convert each `actions.ts` to real `'use server'` DB calls, one surface at a time. Signatures and
  the `{ ok, error, detail }` shape stay identical so clients need no changes.
  Order: storefront → orders → forms → promos → support → careers → analytics.
  Keep the migration-guard error constants.
- **Phase 3 — Asset pipeline**
  Per-merchant object storage with upload, crop, alt-text. Automatic resize / WebP / AVIF + CDN.
  Quota per plan tier.
- **Phase 4 — Public renderer & publish**
  Public route rendering a published section tree server-side with real SSR/SSG and metadata.
  Draft vs. live, publish action, version history, one-click rollback. Feed `seoRating.ts` off
  published content. Sitemap, `robots.txt`, structured data.
- **Phase 5 — Domains & go-live**
  Subdomain per merchant day one; custom domain mapping with automated TLS. Wire
  `googleAnalyticsService.ts` to real per-merchant GA properties. Form submissions actually deliver.
- **Phase 6 — Commerce activation**
  Checkout against the defined `StoreSettings` / `OrderTotals` / `ValidatedLine` types. Real tax
  provider behind the `flat` | `taxjar` | `us-table` switch. Live carrier rating honoring
  snapshot-never-re-rate. Payment capture with `pending_payment` expiry. Inventory reservation
  following the `StockState` transitions.

### 2.4 Explicitly out of scope

- Redesigning any builder UI — design QA is closed, treat the mock as the visual spec
- Adding new section kinds beyond the 17
- Rebuilding the storefront category tree or the Pub 718 import — port as-is

### 2.5 Acceptance criteria

- [ ] Two merchants can each build, save, and publish a distinct site with zero data bleed
- [ ] A published site is publicly reachable, server-rendered, and indexable
- [ ] A merchant can reload the builder on a different device and see their saved work
- [ ] Every one of the nine admin surfaces reads and writes real data
- [ ] A form submission on a live site is delivered and recorded
- [ ] `npm run check` (lint + typecheck) passes throughout

---

## 3. What already exists in this repo

**The MockBuilder website builder does not exist here.** Verified: no `/website-2` route, no
`SectionKind`, no `website_products` / `website_product_settings` / `website_product_categories`,
no `MockBuilder`, zero hits on "website builder" anywhere including `docs/`.

What *does* exist is an adjacent, fully productionized feature — the **online-ordering storefront**.

### 3.1 The online-ordering storefront (built, live, multi-tenant)

**Public surface** — [app/sites/](../../../app/sites/) — 71 files, ~18,000 LOC:

- Public site per merchant at `/sites/[slug]`, plus `subdomain` and `custom_domain` fields on the record
- Menu browsing, cart, checkout, payments, tipping, promo codes, delivery zones, order tracking
- QR dine-in table sessions ([app/sites/[slug]/t/[token]/](../../../app/sites/[slug]/t/[token]/))
- SEO fields (meta title/description, OG image), Google Analytics + Facebook Pixel IDs

**Merchant control panel** — [app/dashboard/online-ordering/page.tsx](../../../app/dashboard/online-ordering/page.tsx)
(1,606 lines) backed by [actions.ts](../../../app/dashboard/online-ordering/actions.ts) (2,247 lines).
Real `'use server'` actions, real Postgres, real Clerk auth, real merchant tenancy with RLS.

**Four fixed templates** — [app/sites/components/templates/](../../../app/sites/components/templates/):

| Template | File | LOC |
|---|---|---|
| Classic | inline in `StorefrontLayout.tsx` | — |
| Hero | `HeroLayout.tsx` | 562 |
| Market | `MarketLayout.tsx` | 783 |
| Boutique | `BoutiqueLayout.tsx` | 782 |

Selection happens at [StorefrontLayout.tsx:63-110](../../../app/sites/components/StorefrontLayout.tsx#L63-L110) —
a `templateId` switch reading `site.theme_config.templateId`.

**What a merchant can configure** ([types/site.ts](../../../types/site.ts)):

- `SiteThemeConfig` — template ID, primary/secondary/accent/background/text/border/card colors,
  font family, hero image, hero video, favicon, header style
- `OnlineOrderingConfig` — hours, pickup/delivery, lead time, future orders, minimum order,
  payment methods, tipping presets, delivery fees and zones, convenience fee, menu card layout,
  notifications, auto-accept, Onfleet/Shipday integrations

### 3.2 The critical limitation

The merchant fills in a **form**. We decided the **layout**.

Pick "Boutique" and the site is: header → hero → menu → footer. Always, in that order. They can
make the header purple. They cannot move it, delete it, put a gallery under it, add an FAQ, or
create a second page.

### 3.3 Side-by-side

| | Built here today | The ticket |
|---|---|---|
| Layout control | 4 fixed templates | Drag-and-drop canvas |
| Sections | Hardcoded per template file | 17 kinds, add / delete / reorder |
| Pages | One | Multiple |
| Merchant role | Fills in a settings form | Designs the page |
| Admin surfaces | 1 settings page | 9 |
| Publish | Live immediately on save | Draft → publish, versions, rollback |
| Renderer | Fixed React templates | Renders an arbitrary saved section tree |
| Tenancy / auth / RLS | ✅ Built | Needs building on the new tables |
| Domains + TLS | ✅ Built | Reusable |
| Checkout / payments / tax | ✅ Built | Reusable (different type surface) |

### 3.4 Dormant asset: a half-started section model

[types/site.ts:223-253](../../../types/site.ts#L223-L253) defines `OnlineStorePage` with a
`StoreSectionType` union — `hero`, `announcement`, `about`, `gallery`, `hours`, `location_map`,
`reviews`, `custom_html` — plus `display_order`, `is_visible`, and `style_overrides`.

The table is real: [schema.sql:2341](../../../schema.sql#L2341), created in
[utils/migrations/041_online_store_config.sql:92](../../../utils/migrations/041_online_store_config.sql#L92),
with RLS enabled and an `updated_at` trigger.

**It is dead code.** The only reference in the entire codebase is a single `.insert()` at
[app/manage/actions/admin-merchant/online-ordering.ts:1579](../../../app/manage/actions/admin-merchant/online-ordering.ts#L1579),
where HQ seeds default rows during store provisioning. Nothing reads it. Nothing renders it.
No UI edits it.

Someone started down exactly this road — 8 section types, ordering, visibility, style overrides —
and stopped. Worth reviewing during Phase 1 scoping: either extend it or explicitly retire it.

---

## 4. What is actually required

Mapping the ticket's phases against what this repo already has.

| Phase | Status here | Work required |
|---|---|---|
| **1 — Tenancy & persistence** | 🟡 Partly solved | Merchant tenancy, Clerk auth, RLS helpers (`is_merchant_admin`, `user_has_location_permission`), and the server-action pattern all exist and are reusable. **New:** the `site → page → section` tables, JSONB section storage, autosave. |
| **2 — Real server actions** | 🔴 New | Nine surfaces to wire. Storefront/orders/forms overlap conceptually with existing online-ordering actions but target different tables. |
| **3 — Asset pipeline** | 🟡 Partly solved | Bunny CDN storage work already exists (`docs/features/cdn-assets/`). **New:** per-merchant quota, crop/alt-text UI, automatic WebP/AVIF resize. |
| **4 — Renderer & publish** | 🔴 New — **the core of the ticket** | Nothing here renders an arbitrary section tree. No draft/live split anywhere. Version history and rollback are entirely new. |
| **5 — Domains & go-live** | 🟡 Routing solved, provisioning **not** | Subdomain + custom-domain *routing* serves today ([proxy.ts:113-142](../../../proxy.ts)); GA/Pixel wired. **New:** automated domain registration + TLS issuance (**none exists** — see §6.8), and form submission delivery. |
| **6 — Commerce activation** | 🟢 Solved — likely out of scope | Checkout, payments, tipping, delivery zones, order lifecycle all live. Under **D1** the builder links into these rather than growing its own. See §6.5 — recommend closing this phase. |

### 4.1 The real new work

**Phases 2–4.** Specifically:

1. The section-tree data model (`site → page → section`, ordered JSONB, versioned)
2. The drag-and-drop builder wired to autosaving server actions
3. Nine admin surfaces converted from mock arrays to real DB calls
4. The asset optimization pipeline
5. **The public renderer + draft/publish/rollback pipeline** — the single largest genuinely-new piece

### 4.2 Open questions

> **Superseded by §0.** Questions #1, #2 and #4 are closed by decisions **D1/D2**; the live status
> of all six is in §0 "Still open". The reasoning below is kept as the record of how they were
> answered. Where it says "unanswered," read §0 first.

From the ticket, with what this analysis can answer:

1. **Where does this live?** — *(Closed by **D2**: this repo.)* **Genuinely a three-way choice, and it depends on #2.**
   *(Revised after the §5 source review — an earlier draft of this doc answered "here" outright.
   That is only correct if this is a merchant-facing DexaPOS feature.)*
   The mock's `README.md` traces the source to `mtech-portal-react`, and its `design-qa.md` is full
   of `D:\Antigravity\Mtech Distributors\` paths — this is **MTech Distributors' portal**, not the
   DexaPOS dashboard. So:
   - If merchant-facing → **this repo.** Auth, tenancy, RLS, server actions, asset storage,
     subdomains, custom domains, and the full commerce path already work here. A separate service
     would duplicate all of it.
   - If it is MTech's own hardware store → **the MTech portal**, and most of §4's "already solved"
     column does not apply.
2. **Merchant-operated vs. Mtech-operated?** — **Unanswered, and the hard blocker.** This decides
   the entire roles/permissions model and therefore the Phase 1 schema. Do not start Phase 1 without it.
   **§5.4 raises the stakes on this:** the mock does not currently know which product it is.
3. **Plan tiers?** — Unanswered. Note this repo already has subscription tiers
   (`app/dashboard/subscriptions/`), so gating is feasible if wanted.
4. **Payments processor?** — Partly answered: this repo already runs online-store payments.
   Reusing that path is the obvious default unless there's a reason not to.
5. **Blank canvas or industry templates?** — Unanswered. Ticket flags a mismatch: MockBuilder demo
   content is restaurant-themed, but its storefront categories are POS/ATM hardware.
6. **Repo state** — MockBuilder is not under version control. Commit it before any work starts.

### 4.3 Question not in the ticket — raised, now deferred

**What happens to the four existing templates and the merchants already using them?**

Live merchants are running Classic / Hero / Market / Boutique today. If the builder ships:

- Are those sites migrated into section trees?
- Do both systems run side by side indefinitely?
- Do the templates become *starter presets* for the builder (answering open question #5 at the same time)?

This is a migration and product decision with real scope attached, and the ticket does not address it.

> **Deferred by D5 (2026-08-12):** the templates stay, and this is decided later. Under **D1** the
> builder is an addition to online-ordering rather than a replacement, so the two coexist by design.
> **The residual item is routing:** once a location has both a template storefront and a built site,
> [proxy.ts](../../../proxy.ts) needs a rule for which one serves the URL. That fork must exist
> before the first built site goes live — see §0 D5 and blocker **B3**.

---

## 5. Direct source review of MockBuilder

**Reviewed:** `C:\Users\HP i5\Desktop\mdptech\DexaPOS-website\Mock Builder\MockBuilder`
**Date:** 2026-08-11 · 50 source files · 17,536 LOC · 632 MB on disk incl. `.next` + `node_modules`

### 5.1 Ticket claims verified against source

Everything below was checked in the actual checkout and holds:

| Claim | Verified |
|---|---|
| ~17.5k LOC | **17,536** across 50 `.ts`/`.tsx` files — exact |
| Builder is the largest asset | `website-2/Website2StandaloneBuilderClient.tsx` = **5,051 lines** |
| 17 section kinds | Exact union at `Website2StandaloneBuilderClient.tsx:55-72` |
| Nine admin surfaces | All present under `src/app/(crm)/website-*`, routes as listed |
| No Puck or third-party builder | Confirmed. **Four runtime deps total:** next, react, react-dom, tailwind (+ lucide-react) |
| `localStorage` key + `STORAGE_SCHEMA` | `mockbuilder.website2.sections.v12` / `standalone-pizza-site-curated-2026-08-07` at lines 335–336 — verbatim |
| No `'use server'` anywhere | Confirmed, zero occurrences |
| 2–3 MB PNGs | **Understated** — actual: 3.27 MB, 2.96 MB, 2.43 MB, 2.31 MB in `public/` |
| Commerce types are pure | `src/lib/website2/store/types.ts`, 100 lines, no imports — as described |
| `seoRating.ts` is a real engine | Confirmed — 345 lines, weighted 0–100 score, 8 checks, per-check remediation text |
| Design QA is genuine | `design-qa.md` records 12 comparison passes with fixes tracked between them |

### 5.2 Assets the ticket undersells

- **The RSC boundary is already drawn correctly.** Every `page.tsx` is a server component that
  awaits the actions and passes props into a `'use client'` child. `website-orders/page.tsx`
  already wraps loads in the migration-guard try/catch, with **separate catches per migration**.
  Phase 2 is closer to drop-in than "convert each `actions.ts`" implies — for 8 of the 9 surfaces.
- **Multi-page exists** — a `BuilderPage` type, a pages nav panel, and nav-item→page mapping
  (`pageIdForNavItem`). Not mentioned in the ticket. See §5.3 for the catch.
- **Undo/redo exists** — a 50-step history stack (`pastSections` / `futureSections`).
- **Hero has three sub-templates** — classic / bistro / spotlight, added across QA passes 5–12.

### 5.3 Findings — issues not in the ticket

> **Read under D3.** The mock is a spec, not a codebase to port. Findings marked `MOOT (rebuild)`
> are objections to *porting* and do not apply while D3 holds — they are kept because they become
> live again the moment anyone proposes lifting the mock's source. Findings marked **LIVE** carry a
> lesson that applies to the rebuild regardless.

Ordered by impact on Phase 1 schema design.

#### F1 — `BuilderSection` is a fat record, not a discriminated union · `MOOT (rebuild)` — lesson **LIVE**

`Website2StandaloneBuilderClient.tsx:269-288`. Every section object carries **all 14 settings
blobs** — `hero`, `content`, `gallery`, `features`, `cards`, `faq`, `location`, `video`,
`reservations`, `scrolling`, `events`, `form`, `reviews`, `footer` — regardless of its `kind`.
An FAQ section still hauls an unused hero config and an empty events array.

The ticket says *"sections stored as ordered JSONB rows keyed by the existing `SectionKind` union
so the current TypeScript types port over unchanged."* Porting unchanged bakes that bloat into
Postgres permanently and makes version diffing meaningless — every row touches every field.

**Action:** refactor to a discriminated union **before** the DB schema is written. Mechanical now,
a data migration later.

#### F2 — Multi-page persistence is fake · **LIVE** — spec gap

`Website2StandaloneBuilderClient.tsx:1823` — `if (activePageId !== HOME_PAGE_ID) return`.
Only the home page is ever written to storage. Edit the Menu page, refresh, it is gone;
`defaultPages(stored)` regenerates the others from seeds.

Neither the ticket nor the mock's `README.md` says this. **Anyone estimating from a live demo will
assume multi-page works.**

#### F3 — Uploaded images are deliberately discarded on save · **LIVE** — spec gap

`prepareSectionsForStorage` (line 1682) strips every `data:` and `blob:` URL via `storageImage` /
`storageImageList` and substitutes the seed image. Upload a photo, refresh, it reverts.

Sensible for a mock, but it means the **entire upload → persist → render path has never run end to
end** — a stronger statement than "no asset pipeline."

#### F4 — Zero tests, despite the code advertising testability · `MOOT (rebuild)`

`store/types.ts` is commented *"pure types — no server imports — so orderMath/tax stay
unit-testable."* `seoRating.ts` says *"pure functions so the rules stay unit-testable."*

There is **not one test file** and `package.json` has **no test script**. "Unit-testable" is an
aspiration, not a fact. Order math, tax, and SEO scoring are all unverified.

#### F5 — A dev crash log sits next to the "no findings" QA doc · `MOOT (rebuild)` — caveat **LIVE**

`dev-20260806174300.err` (228 KB) contains repeated runtime failures:

```
ReferenceError: ShoppingBag is not defined         ×10
Error: FEATURE_ICONS is not defined                ×10
Error: FeaturesSectionView is not defined          ×6
Error: Hydration failed because the server rendered text didn't match
```

These are hoisting / TDZ errors — symbols referenced above their definition, which is what happens
in a 5,000-line module. The log is dated 2026-08-06 and may be stale.

**The design QA was visual only.** It reports "no open P0/P1/P2" while sitting beside a log full of
`ReferenceError`. Reproduce or clear these before calling the mock stable.

#### F6 — The 5,051-line single file blocks Phase 4 · `MOOT (rebuild)` — lesson **LIVE** (see B7)

Not a style complaint. Every section renderer, every settings panel, every seed, the storage layer,
the undo stack, and the preview chrome live in one `'use client'` module.

- Phase 1 replaces the persistence **inside** it.
- Phase 4 renders the same sections **server-side from a different entry point**.

Both require either splitting the file or duplicating all 17 renderers. **Phase 4 is not possible
until the renderers are extracted into standalone server-renderable components — and that task
appears nowhere in the ticket.**

#### F7 — `npm run check` does not currently pass · `MOOT (rebuild)`

`tsc --noEmit` fails with `TS7016` on `lucide-react` in two files. Cause is an incomplete install —
`node_modules/lucide-react/dist/` contains `cjs/` and `esm/` but **no `.d.ts` files**, while
`package.json` points `typings` at `dist/lucide-react.d.ts`.

Almost certainly an environment artifact, not a code defect. But the acceptance criteria require
check to pass "throughout," and **as this checkout stands that cannot be verified.** Reinstall and
re-run before trusting the claim.

#### F8 — Not in version control · `MOOT (rebuild)` — but see **B12**

`git status` → `fatal: not a git repository`. Twelve QA passes of history exist only as prose in
`design-qa.md`; there are no commits behind 17,500 lines. The 632 MB includes `.next`,
`node_modules`, `tsconfig.tsbuildinfo`, four screenshot PNGs, and 339 KB of dev logs — all of which
need a `.gitignore` before the first commit.

*(This confirms the ticket's own open question #6.)*

#### F9 — Minor · `MOOT (rebuild)`

- `website-2/page.tsx` begins with a UTF-8 BOM.
- The Add Section modal offers **12 options** against 17 kinds — 3 are locked (header/hero/footer)
  and `popular-items` hides its action panel. Worth confirming which of the 17 a merchant can
  actually add.

### 5.4 The mock has not decided what product it is · ✅ resolved by D2, with a residue

> **Resolved 2026-08-12 — merchant-operated (D2).** The *identity* question below is closed.
> What it exposed is not: four of the nine surfaces were authored for a hardware distributor and
> still need a scope decision. That moved to blocker **B4** / §6.4. The analysis is kept because it
> is the evidence behind B4.

Two different products share one sidebar:

| Surface | Demo content | Implies |
|---|---|---|
| Builder (`/website-2`) | **"Mtech Pizza"** — hero, menu, reservations, events, reviews | A restaurant builds its own site |
| Storefront / Orders | **POS Systems, ATM, Accessories, "Dexa POS Station"** (`mockData.ts:45-60`) | MTech Distributors runs its own hardware ecommerce store |

These are not the same customer. The ticket's open question #5 spots the symptom — *"those imply
very different starter templates"* — but files it as a template question.

It is not. It means **open question #2 is a product-identity decision, not a permissions one**, and
it determines whether `website-storefront` / `website-orders` become per-merchant tables or a
single-tenant admin console. It also decides open question #1 (§4.2).

**Phase 1's schema cannot be designed until this is answered.**

### 5.5 Recommended Phase 0 (~1 week) — before Phase 1

Each item is cheap now and expensive once production data and a live renderer depend on the current
shape.

- [ ] **Commit MockBuilder to git** with a real `.gitignore` (`.next`, `node_modules`, `*.tsbuildinfo`, dev logs) — F8
- [ ] **Reinstall deps, get `npm run check` green** — F7
- [ ] **Reproduce or clear the runtime `ReferenceError`s**; add a functional smoke pass to sit alongside the visual QA — F5
- [ ] **Refactor `BuilderSection` to a discriminated union** — F1
- [ ] **Extract the 17 section renderers into standalone server-renderable modules** — F6
- [ ] **Get a written answer on merchant-operated vs. MTech-operated** — §5.4
- [ ] *(optional, cheap)* Add unit tests for `seoRating`, order math, and tax — the code is already pure — F4

### 5.6 Overall assessment

It is real work and better than most design mocks: a clean dependency tree, correct server/client
boundaries, thoughtful domain types, and a visual QA record more rigorous than most *shipped*
features receive. The ticket's central claim — *"the UI is solved, go put a backend under it"* —
is fair.

Three ticket claims are optimistic:

1. *"types port over unchanged"* — they should not; fix the fat-record shape first (F1)
2. *"no open P0/P1/P2 findings"* — true of **visual** QA only. No functional QA, no tests, and a crash log (F4, F5)
3. The phasing hides that Phase 4 depends on extracting renderers from a 5,000-line client file — unlisted and uncosted (F6)

And one item is a blocker rather than a question: **the mock has not decided whether it is a
merchant website builder or MTech's own hardware store** (§5.4).

---

## 6. Blocker register

Status after the §0 decisions. **Gating** = Phase 1 schema cannot be finalized without it.

| # | Blocker | Status |
|---|---|---|
| B1 | Site granularity — one site per merchant or per location | ✅ Closed by **D4** — per location |
| B2 | Sections: snapshot data or reference it live | ✅ Closed by **D6** — split per field; 3 consequences to build |
| B3 | Fate of the four existing templates | 🟡 Deferred by **D5** — routing fork still required |
| B4 | Surface scope — 4 of 9 surfaces target the wrong business | 🔴 Open — decides project size |
| B5 | Phase 6 commerce may not apply | 🟠 Likely closed by **D1** — confirm |
| B6 | Publish → cache invalidation contract | 🟠 Open — narrowed by **D6**; needed before Phase 4 |
| B7 | Renderers must be dual-use (client + server) | 🟠 Open — architectural, decide day one |
| B8 | Custom domains routed but **not provisioned** | 🟠 Open — correction, see §6.8 |
| B9 | Plan tiers | ⬜ Open |
| B10 | Which role may edit the website | ⬜ Open — narrowed by D4 |
| B11 | Starter templates + licensed imagery | ⬜ Open — unscoped design work |
| B12 | Mock is not in version control | ⬜ Open — single point of failure |

### 6.2 Sections: snapshot vs. live reference · ✅ resolved by D6

Three of the 17 section kinds display data this platform already owns:

| Section | Reads from |
|---|---|
| `popular-items` | `menu_items` |
| `reservations` | reservation settings |
| `location` | `locations` (address, hours) |

When a merchant drops a `popular-items` section and picks four dishes, **what gets written into the
section row?**

**Option A — snapshot.** Store the resolved values: name, price, image URL, description.
- Publish and rollback are meaningful — a published version is genuinely frozen
- Public page renders with no joins; fast and cacheable
- A price change in the POS does **not** reach the live site until the merchant republishes
- A deleted menu item leaves a stale card that still renders

**Option B — live reference.** Store only IDs; resolve at render time.
- The site is always correct — POS price change appears immediately
- "Publish" and "version history" mean nothing for this content; rollback cannot restore an old price
- A deleted or 86'd menu item breaks or blanks a section on a live page
- Every public render needs a join, complicating caching (ties into **B6**)

**Why it gates Phase 1:** the two produce different `section` table shapes and different publish
semantics. Retrofitting after merchants have built pages means migrating live site data.

> **Resolved 2026-08-12 — split per field (D6).** Snapshot structure and copy; resolve
> `name` / `price` / `image` / availability live. See §0 D6 for the field split and the three
> consequences it creates (deleted-record handling, 86/snooze, rollback copy). The analysis below is
> kept as the reasoning behind that choice.

**The answer taken — a split, decided per section kind:** snapshot the *layout and copy* (which items,
what order, headings), reference the *volatile fields* live (price, availability, 86 status). That
keeps publish/rollback meaningful for structure while prices stay honest. It is a defensible default
under **D1**, since the existing storefront already renders live menu data — but it must be written
down per section kind before the schema is cut.

### 6.4 Surface scope — the sizing decision

**D2** settled *who operates* the surfaces. It did not settle *which surfaces belong*. The mock's
nine were authored for a hardware distributor:

| Surface | Under D1/D2 | Note |
|---|---|---|
| Website (builder) | ✅ Core | The feature |
| SEO | ✅ Keep | `seoRating.ts` is genuinely reusable |
| Forms | ✅ Keep | Contact / reservations / events |
| Promo Popups | ✅ Likely keep | |
| Analytics | 🟡 Overlaps `app/dashboard/reports/` | Reuse, don't rebuild |
| **Storefront** | 🔴 Collides with `menu_items` | SKU / weight / dimensions model |
| **Store Orders** | 🔴 Collides with existing orders + online-ordering | FedEx rating, NYS Pub 718 county tax |
| **Support** | ⬜ Merchant tool or Dexa's? | |
| **Careers** | ⬜ Do restaurants want job postings? | |

The four red/grey surfaces are ~6,300 LOC of the mock (orders 2,506 + storefront 1,013 + support
940 + careers 829) built for a business model that is not this one. Under **D1** the answer is
probably "drop or defer most of them and lean on online-ordering," but it needs to be stated —
it is the difference between a ~6-week and a ~6-month project.

### 6.5 Phase 6 commerce · likely closed by D1

The mock's commerce types model **shipping physical goods**: `weightOz`, `lengthIn`/`widthIn`/
`heightIn`, carrier rate snapshots, nexus states, county-level tax tables. This platform's merchants
sell food for pickup and delivery, already priced, taxed, and routed by the POS and the existing
checkout.

Under **D1** the builder should not grow its own checkout. An "Order Now" section links into the
existing online-ordering flow. **Recommend closing Phase 6 as out of scope** and confirming.

### 6.6 Publish → cache invalidation

Published pages must be server-rendered and indexable; today's `/sites/[slug]` is heavily
client-side. If published pages are ISR-cached, the publish action must trigger revalidation and so
must rollback. Small, but it is part of the publish API's contract and interacts with **B2** —
live-referenced fields cannot be cached as aggressively as snapshotted ones.

### 6.7 Renderers must be dual-use

Each section must render in the builder (client, interactive, selectable) **and** on the public site
(server, no JS). Building them client-first forces a rewrite of all 17 at Phase 4.

This is the one architectural lesson that survives **D3**: it is exactly what went wrong in the
mock, where all renderers are trapped inside one 5,051-line `'use client'` module (F6).

### 6.8 Custom domains are routed, not provisioned · **correction**

An earlier revision of this document marked domains "✅ Built". That is right for **routing** and
wrong for **provisioning**.

- **Built:** [proxy.ts:113-142](../../../proxy.ts) resolves a hostname against
  `online_store_config.custom_domain` and rewrites to the store; subdomain routing on
  `*.dexaposai.com` works; `slug` and `custom_domain` are both `UNIQUE`
- **Not built:** no host-platform API calls, no certificate issuance, no domain-verification flow.
  A merchant types a domain into a field and **someone adds it to the hosting platform by hand.**

Workable at ten merchants; not at five hundred. If self-serve custom domains are expected, that is
real Phase 5 work the ticket assumes away. The §4 status table is corrected accordingly.

---

## 7. Provenance

Storefront + online-ordering commit authorship (git handles):

- **RohanPrasad007** — original author, Jan 2026 (`feat: Implement comprehensive online ordering
  system with storefront customizations, and mobile app integration`)
- Ongoing work by **Haydar Saleh** (22 commits), **Temur662** (21), **dika-protel** (17),
  **AppFlow-Studio** (12)
- The dormant `online_store_pages` schema traces to **Temur662**, April 2026
- The MockBuilder ticket also appears to originate with Temur662 — the local path in the ticket is
  under `temurbeksayfutdinov`

---

## 8. Running the mock locally

*(Reference only — under **D3** the mock is a spec, not a codebase to build from. F7's incomplete
install is not worth fixing unless someone needs to demo it.)*

**Local checkout reviewed for this document:**

```
C:\Users\HP i5\Desktop\mdptech\DexaPOS-website\Mock Builder\MockBuilder
```

```bash
cd "C:\Users\HP i5\Desktop\mdptech\DexaPOS-website\Mock Builder\MockBuilder"
npm install     # see F7 — current node_modules is incomplete
npm run dev     # builder at /website-2
```

Key files:

| Path (relative to the checkout) | Notes |
|---|---|
| `src/app/(crm)/website-2/Website2StandaloneBuilderClient.tsx` | The builder — 5,051 lines. F1, F2, F3, F6 all live here. |
| `src/app/(crm)/mockData.ts` | 721 lines of in-memory fixtures every `actions.ts` mutates. §5.4 evidence. |
| `src/lib/website2/store/types.ts` | The 100-line commerce type surface the ticket praises. |
| `src/lib/website2/store/seoRating.ts` | Real 345-line scoring engine. |
| `src/app/(crm)/website-orders/page.tsx` | Best example of the already-correct RSC + migration-guard pattern (§5.2). |
| `design-qa.md` | 12-pass visual QA record. Visual only — see F5. |
| `dev-20260806174300.err` | 228 KB runtime crash log. See F5. |

Ticket-stated origin path (author's machine, not available here):
`/Users/temurbeksayfutdinov/Downloads/MockBuilder`
