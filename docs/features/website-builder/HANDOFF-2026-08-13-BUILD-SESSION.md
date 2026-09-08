# Handoff — Website Builder build session

**Date:** 2026-08-13, updated 2026-08-15
**Author:** Ali Awdi (with Claude)
**Covers:** planning → Stages 1, 2, 3, 4 and the Stage 8 canvas
**State:** ~9,000 LOC · **176 tests passing** · typecheck clean · lint clean

**Two things to know before trusting anything here:**

1. The database migration is written but **has never been executed anywhere**. Everything that depends on it is
   unverified — see §7.
2. **Site granularity changed on 2026-08-15: one site per *merchant*, not per location.** Decision D4 is
   superseded and §§1–10 below were written under it. Where they conflict with **§11**, §11 wins.

---

## 1. Where the feature stands

| Stage | State |
|---|---|
| Planning | ✅ 9 planning documents, [README](README.md) is the index |
| 1 — Section contract | ✅ Built and tested |
| 2 — Tenancy & persistence | 🟡 **Code-complete, migration NOT applied.** DDL, triggers and RLS are unverified |
| 3 — Binding resolver | ✅ Built and tested |
| 4 — Server renderer | ✅ Built, tested, and rendering real merchant data in a browser |
| 5 — Publish & versioning | ⬜ Not started. Genuinely blocked on the migration |
| 6 — Public routing & SEO | ⬜ Not started. Blocked on the migration |
| 7 — Assets, domains, forms | ⬜ Deferred out of v1 |
| 8 — Builder canvas | 🟡 **Built and driven in a browser, but nothing persists.** Edits are lost on refresh |
| 9 — Surrounding surfaces | ⬜ Cut from v1 |

**Two things you can open right now** (`npm run dev`, as a merchant with an online store):

- `/dashboard/website/preview` — a complete restaurant homepage, server-rendered, with live menu prices
- `/dashboard/website/builder` — the editor: select, reorder, add, delete, undo/redo, device preview, live settings

---

## 2. The idea, in one paragraph

A merchant's page is **one JSON document** describing which sections appear and in what order. Sections never
store a price, a dish name, or a photo URL — they store **typed references** (`{ type: 'menu_item', id }`) that a
**resolver** turns into live data from the POS on every single render. Every section is a **server component**, and
the builder is a client overlay on top of that same render, so the public site and the editor are the same code and
cannot drift. A **registry** describes each section kind once, and everything else — the editor's form controls,
validation, rendering, and the Add Section modal — is derived from it.

The practical consequence: **change a price in the POS and the website changes on the next request, with no
republish. 86 an item and it disappears.** That is not a feature anyone remembered to add; it is impossible for it
to work any other way, because there is nowhere in the data model to put a stale price.

---

## 3. Decisions taken this session

### 3.1 Strategy

| # | Decision | Why |
|---|---|---|
| S1 | **Build the backend first; prove it publicly before any builder UI** | Every hard problem in this feature — tenancy, versioning, stale data, cache invalidation, routing collisions — is a backend problem, and none get easier with a canvas on top |
| S2 | **Cut v1 hard, revisit later** | Explicit instruction: "if there is any blocker move on and choose the simplest option we can change later." Applied everywhere in §3.2 |
| S3 | **Fixture-driven verification** | Preview and builder run off a demo `PageDocument` instead of a database row, so Stages 3, 4 and 8 were all completed and verified with the migration unapplied |

### 3.2 Scope cuts (all reversible)

| Area | Planned | Shipped | Reversal cost |
|---|---|---|---|
| Section kinds | 17 | **9** | One schema file + one registry entry each. No migration |
| `reviews` section | In the 17 | **Cut** | No reviews table and no Google Business integration exists — it had no data source |
| `reservations` section | In the 17 | **Cut** | `lib/reservations/` is one file; not enough system to bind to |
| Admin surfaces (**B4**) | 9 | **1 — the builder** | SEO panel, forms, promos, analytics all deferred |
| Permissions (**B10**) | New `website.edit` code | **`is_merchant_admin`** | One line per RLS policy. It already folds in `is_dexapos_admin()`, so HQ support access comes free |
| Plan tiers (**B9**) | Tier gating | **None; quota columns exist, all NULL** | Config change, not a migration |
| Custom domains (**B8**) | Self-serve + TLS | **Cut; subdomains only** | Whole sub-project, deferred |
| Caching | Tag-based shell/bindings split | **No caching at all** | Matches `/sites/[slug]` today. See §5.3 |
| Multi-page | Full | **Modelled in schema, home-page only in UI** | No migration |
| Rich-text editor | TipTap | **Textarea** | TipTap is already in the repo; same sanitizer either way |

### 3.3 Architecture

| # | Decision | Rationale |
|---|---|---|
| A1 | **A page is one atomic JSONB document**, not one row per section | Publish/rollback/diff become row operations; a render is one read. The ticket proposed rows; a GIN index recovers the only thing rows gave up |
| A2 | **A version is one immutable row**; rollback inserts a *new* version copied from an old one | History stays append-only, so "what was live on the 3rd?" is always answerable |
| A3 | **Discriminated union for sections**, not the mock's fat record | The mock carries all 14 settings blobs on every section; porting that bakes the bloat into Postgres and makes version diffs meaningless |
| A4 | **Live data enters through bindings only** | Decision D6 made structural rather than conventional — there is no field to put a price in |
| A5 | **Renderers are server components; the builder is an overlay** | Blocker B7, avoided rather than paid for twice. Enforced by a test |
| A6 | **Pure mutation reducers** in `lib/site-builder/mutations.ts` | Makes undo/redo two lines, enforces zone rules before the server sees a document, and is the API a future AI generator or conversational editor drives |
| A7 | **`render_mode` flips to `builder` on first *successful publish*** | A merchant who experiments for a week and never publishes keeps their live site the whole time. Fail-safe by construction (blocker B3) |
| A8 | **Address, phone and hours propagate live** | The D6 residual question. An address is a fact about the business, not page content; a merchant will not republish to fix their phone number |
| A9 | **Editor forms generated from Zod schemas** | Add a field to a schema, a control appears. Section kind #10 costs a schema and a renderer, not a schema, a renderer *and* a form |
| A10 | **Same-document canvas, not an iframe** | Sections style through `--site-*` custom properties scoped to the shell, so isolation was unnecessary. Removes the entire postMessage geometry protocol |
| A11 | **Drag-and-drop in the layers panel, not the canvas** | dnd-kit's sortable gives keyboard reordering free, so this is simultaneously the simplest implementation and the accessible one |

---

## 4. Discoveries about this codebase

These changed the plan. Each is written up in more detail where cited.

### 4.1 A working section-tree CMS already ships here 🔴 **biggest finding**

[FINDING-2026-08-12-EXISTING-CMS-PRIOR-ART.md](FINDING-2026-08-12-EXISTING-CMS-PRIOR-ART.md)

The gap analysis concluded *"nothing here renders an arbitrary section tree."* True of `/sites/*`, false of the
repo. `components/cms/SectionRenderer.tsx` is **1,739 lines of server component** rendering a `Section[]` from a
`page_content.sections` JSONB column, with an 18-type registry, a publish flag, HTML sanitization, and a
click-to-edit client overlay — and it serves `dexaposai.com` today. It was missed because it lives under
`app/(marketing)/` and never uses the words "website builder".

This reduced the two items rated hardest (arbitrary section rendering, dual-use renderers) from research problems
to porting problems.

### 4.2 The price cascade lives in Postgres, not TypeScript

`get_menus_for_location(p_merchant_id, p_location_id)` resolves the full 5-level override cascade **and** folds
86/snooze into a single `effective_availability` flag, inside the database. It is the same RPC behind
`getStorefrontData()`.

So the resolver calls that RPC and maps the identical `effective_*` fields. **There is no second price calculation
anywhere.** A built page and the ordering page cannot quote different numbers for the same dish — that is
structural, not something a reviewer has to keep checking.

### 4.3 The repo is on Next 16, not Next 15

`CLAUDE.md` says 15; `package.json` says **16.2.12**. Worse, `revalidateTag` and `unstable_cache` are used **zero
times** anywhere — only `revalidatePath`. So the tag-based caching design in PLAN-04 had no in-repo precedent *and*
was written against the wrong API. v1 answer: **don't cache**, matching the existing storefront.

### 4.4 `react-dom/server` is unusable in the app directory

Next refuses it in **any** app-directory module — a page *and* a route handler, regardless of client components.
This killed the planned "POST the document, get HTML back" canvas re-render. The replacement is better: see §5.1.

### 4.5 Three untested copies of the business-hours parser

`locations.business_hours` holds three different shapes and may arrive as a JSON string. `InfoPanel.tsx` and
`OpenClosedIndicator.tsx` each carry their own parser, neither tested. This session added a third —
[business-hours.ts](../../../lib/site-builder/business-hours.ts) — but with tests. **Consolidating all three behind
it is a worthwhile follow-up.**

### 4.6 Vitest was broken, and is now fixed

`@rolldown/binding-win32-x64-msvc` was a **truncated download** — 2.38 MB on disk against a published 20.5 MB —
surfacing as a misleading "not a valid Win32 application". Fixed by removing that one package and re-running
`npm install`. **Tests now run locally for the whole repo.**

Fixing it exposed **22 pre-existing failures across 4 files** (`lib/menu/cascade-labels`, `AffectsTag`, and the
a11y suite which needs `vitest.a11y.config.mts`). None relate to the builder; none were introduced here; **none are
fixed** — that is unrelated scope and your call.

### 4.7 `.env` has a duplicate key ⚠️ **you should fix this**

Two `NEXT_PUBLIC_SUPABASE_URL` lines. The second (prod, `hifouuofcaytijrkbvcy`) wins while every key is staging
(`dfwqakoyittmrwbqvxgw`), so **every Clerk-authed Supabase read fails with `Invalid API key` locally**. Pre-existing
and unrelated to the builder. **Not fixed — it is your env file.** Verification ran with a shell override:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://dfwqakoyittmrwbqvxgw.supabase.co npm run dev
```

### 4.8 There is no typecheck gate

No `npm run check` script exists (only `dev`, `build`, `start`, `test`, `test:a11y`, `lint`), and `next.config.ts`
sets both `ignoreBuildErrors` and `ignoreDuringBuilds`. Nothing stops a type error reaching main. This session
typechecked with an explicit throwaway tsconfig; see §9.

---

## 5. Corrections to the plans

The plans were written before any code existed. These are the places reality disagreed.

### 5.1 Canvas re-render — the biggest one

**Planned** (PLAN-06 §2.2): POST the document to a route handler, `renderToStaticMarkup`, return HTML, inject with
`dangerouslySetInnerHTML`.

**Reality:** impossible (§4.4).

**Built:** a **Server Action that returns JSX**. Its return value is serialized as an RSC payload, so the client
holds a server-rendered React tree in state and drops it into the canvas. The first paint is rendered by the page
as a Server Component and passed down as a prop — *a client component may receive a server tree; it just may not
import one.*

This is better than the plan: no HTML strings, no `dangerouslySetInnerHTML`, no serialization round-trip, and still
exactly one `PageRenderer`.

**The constraint it creates:** the canvas works only while every section renderer is server-only. The FAQ accordion
had been written as a `"use client"` island and turned out to need nothing from the client — `<details>` is
natively interactive — so it was demoted to a server component. **A test now enforces that nothing under
`components/site-builder/` outside `builder/` is a client component.** The first section that genuinely needs
client JS breaks this, at which point the canvas moves to an iframe — a change confined to `Canvas.tsx`.

### 5.2 `Resolved` reasons

**Planned:** `deleted | snoozed | out_of_stock | not_in_location`.
**Built:** `not_found | unavailable` only. The RPC folds 86ing, snoozing and manual hiding into one flag, so the
platform genuinely cannot distinguish them. Shipping reasons that can never be populated is a lie in the type
system.

### 5.3 Caching

**Planned:** tag-based shell/bindings split with `unstable_cache`.
**Built:** nothing. Fully dynamic, matching `/sites/[slug]`. Deletes an entire spike from the critical path;
revisit when TTFB or Core Web Vitals actually demand it.

### 5.4 Link targets

The ordering storefront lives at the **root** of `/sites/[slug]` — exactly where a built site wants to be. Rather
than hardcode a guess, `RenderSite` takes `orderUrl` / `menuUrl` / `basePath` as inputs, so **Stage 6 owns that
collision** and no renderer needs revisiting.

### 5.5 Anon read policy

**Planned** (PLAN-02 §6.2): an RLS policy letting anon read published versions.
**Built:** omitted. A policy's `EXISTS` subquery is itself subject to RLS on the tables it joins, so an anon policy
would silently return nothing. Stage 4 adds a `SECURITY DEFINER` read function instead — the right shape, and
pointless to build before a renderer consumes it.

---

## 6. Bugs caught before they shipped

| Bug | How it was caught | Impact if missed |
|---|---|---|
| **`SectionOf<K>` was not distributive** — collapsed to "any kind paired with any kind's props" when `K` was the whole union | Strict typecheck | Would have type-checked a footer carrying header props, quietly defeating the entire point of the discriminated union |
| **The `site_pages_path_format` CHECK accepted a leading hyphen** — `-lead` was a legal page path, because the leading `[a-z0-9]*` matches empty | `reserved-paths.test.ts` asserting the TS regex and the SQL CHECK agree | Malformed URLs on live sites. **Keep that test** — it is the only thing tying the two copies together |
| **`popular-items` cap of 24 items** | A test that tried to bind 40 | Nothing — the cap worked; the *test* was wrong. Rewritten to span two sections, which is more realistic |
| **`humanize` produced Title Case** | A test asserting sentence case | Every form label shouting |
| **The `"use client"` test matched its own explanatory comment** | The test failing after the FAQ fix | A false green forever after |

---

## 6b. Render cost — measured and reduced (2026-08-14)

The preview route felt slow. `.next/dev/trace` put the server render at **~850–1760 ms**, and timing each
query against staging found why:

```
  913 ms  online_store_config
  493 ms  get_menus_for_location    354 KB  ← 12 menus, 39 categories, 135 item rows
  405 ms  locations (1 id)
```

Two independent problems, both self-inflicted:

1. **Everything was serial.** [resolve.ts](../../../lib/site-builder/bindings/resolve.ts) awaited
   `fetchMenuItems` and *then* `fetchLocations`, though neither needs the other. Now issued together via
   `Promise.allSettled` — `allSettled`, not `all`, to keep the existing property that one source failing
   degrades only its own bindings.
2. **The menu was fetched twice.** `loadSampleMenuItemIds` queried `menu_items` directly, then the resolver
   pulled the whole 354 KB tree. `createSupabaseResolverSources` now memoises per merchant+location for the
   life of the request, and the seed helper draws from that same source.

The seed change also fixed a **correctness** bug, which is the better half of it: `menu_items` holds every item
the merchant has ever created, while the resolver only knows items on a menu serving *this* location. Ids
outside that overlap resolved `not_found` and were silently dropped, so a starter page could show a short or
empty Guest Favorites row through no fault of the merchant's. Seeds now come from the resolvable, currently-
available set.

**Result:** the same trace shows renders at **~45–700 ms**. Guarded by two tests in `resolver.test.ts` under
`describe("query cost")` — one of which *deadlocks* if the fetches are ever made serial again, so the guard
cannot silently rot.

Still outstanding, deliberately: the **builder** page fetches the menu twice on first load, because
`renderCanvas` is a Server Action that constructs its own sources and a memo cannot cross that boundary.
Costs ~500 ms once per builder open; not worth a request-scoped cache yet. And 354 KB to render six dishes
remains the price of never owning a second price cascade — the right trade, but worth revisiting with a
narrower RPC if published pages ever get hot.

---

## 7. Verification status — read this before trusting anything

### ✅ Genuinely proven

- **167 vitest tests**, strict typecheck clean, lint clean
- `scripts/site-builder-smoke.ts` — builds a 9-section page, mutates it, rejects illegal moves, round-trips through JSON losslessly, and recovers a deliberately corrupted document without throwing
- **The renderer, in a browser**, against merchant *Joes Coffee Shop / Downtown Hamra* — real store name, real phone, their brand colour, real menu
- **The builder, in a browser** — section selected, schema-generated settings panel rendered, heading edited, canvas re-rendered with the change
- Query budget: a 44-binding page resolves in **one** menu query (asserted, not assumed)

### ⚠️ Written but NEVER executed

- **[20260813120000_website_builder_foundation.sql](../../../supabase/migrations/20260813120000_website_builder_foundation.sql)** — three tables, six triggers, RLS policies. **Never run against any database.** No Docker, no local Postgres, and the migration was deliberately deferred
- **[scripts/verify-site-tenancy.ts](../../../scripts/verify-site-tenancy.ts)** — the cross-tenant denial proof. Written, never run
- **[app/dashboard/website/actions/](../../../app/dashboard/website/actions/)** — `site.ts`, `pages.ts`, `draft.ts` typecheck but have never touched a database

**Treat all DDL, triggers, and RLS policies as unverified.** PLAN-02's definition of done is not met until
`verify-site-tenancy.ts` runs green on staging.

### ❌ Not built

Publish, versioning, rollback, the public route, SEO metadata, sitemap, assets, domains, forms, and **persistence**
— the builder's save adapter is a no-op, so edits are lost on refresh.

---

## 8. File inventory

### `lib/site-builder/` — the contract, pure TypeScript

```
sections/kinds.ts              9 section kinds, 3 zones
sections/primitives.ts         link targets, style tokens, text constraints
sections/types.ts              the Section discriminated union
sections/schemas/*.ts          9 Zod schemas + defaults factories
sections/registry.ts           SECTION_REGISTRY — the single source of truth
bindings/types.ts              Binding<T>, AssetRef
bindings/resolved.ts           Resolved<T>, ResolvedMenuItem, ResolvedLocation
bindings/collect.ts            walks a document for bindings
bindings/resolve.ts            batches them; injectable sources
bindings/supabase-sources.ts   the real sources, via get_menus_for_location
page-document.ts               PageDocument, createStarterPage, id generation
normalize.ts                   never-throws repair + forward migration
validate.ts                    the publish gate (errors vs warnings)
mutations.ts                   pure (doc, args) => doc reducers
migrations/index.ts            versioned, empty by design
schema-introspect.ts           Zod → editor form controls
business-hours.ts              tested hours parser
render-context.ts              RenderContext, ThemeTokens
site-context.ts                shared site loading for every render surface
reserved-paths.ts              paths a merchant page may not claim
db-types.ts                    hand-written row shapes
fixtures/demo-page.ts          the demo homepage
__tests__/                     8 files, 167 tests
```

### `components/site-builder/` — the renderer

```
PageRenderer.tsx      registry dispatch + SiteChrome (theme tokens)
SectionBoundary.tsx   containment + the data-sb-* overlay protocol
registry.tsx          binds kinds to renderers (compile-error if one is missing)
section-shell.tsx     spacing, background tones, link resolution, money
SiteImage.tsx         the only way a section may render an image
edit-attrs.ts         the builder-overlay protocol
sections/*.tsx        9 server components
sections/shared/      BusinessHours, FaqAccordion
builder/              store, BuilderShell, Canvas, SectionList,
                      SettingsPanel, Toolbar — the only client components
```

### `app/dashboard/website/`

```
preview/page.tsx            Stage 4 acceptance surface
builder/page.tsx            the canvas entry
builder/render-canvas.tsx   Server Action returning rendered JSX
actions/{site,pages,draft}.ts   Stage 2 — never executed
```

### Documentation

`README.md` (index) · `PLAN-00`…`PLAN-06` · `VISION-UNBOUNDED.md` · `RESEARCH-OWNER-COM.md` ·
`FINDING-2026-08-12-EXISTING-CMS-PRIOR-ART.md` · `ANALYSIS-2026-08-11-MOCKBUILDER-GAP.md` · this file

---

## 9. Gotchas for whoever picks this up

**Typechecking.** There is no `check` script and builds ignore type errors. To check one module without loading or
corrupting `tsconfig.json`:

```bash
npx tsc --noEmit --ignoreConfig --skipLibCheck --strict --target es2022 --lib es2022,dom \
  --module esnext --moduleResolution bundler --types node $(find lib/site-builder -name "*.ts")
```

Or write a throwaway `tsconfig.*.tmp.json` that `extends` the real one — which is what this session used for the
`.tsx` files.

**Never make a section a client component.** It breaks the builder canvas, not just the public render. Prefer a
CSS/native-HTML solution; `<details>` already replaced one island.

**Never write a second price resolver.** Always go through `get_menus_for_location`.

**Keep `reserved-paths.test.ts`.** It is the only thing keeping the TypeScript path regex and the SQL CHECK
constraint in agreement, and it already caught one real bug.

**`.env` is broken locally** — see §4.7 — so every Clerk-authed Supabase read fails until you delete the duplicate
URL line.

---

## 10. What to do next

Two paths, and the choice is a product one:

### Path A — apply the migration to staging *(unblocks the most)*

1. Check production for duplicate `(merchant_id, location_id)` in `online_store_config` (the migration guards this
   and warns rather than failing, but you want to know)
2. Apply `20260813120000_website_builder_foundation.sql` to **staging** (`dfwqakoyittmrwbqvxgw`)
3. Run `scripts/verify-site-tenancy.ts` — **this is the acceptance criterion**, not reading the policies
4. Swap the builder's `noopSaveAdapter` for `SaveDraft` — edits start persisting
5. Then Stage 5: publish, versions, rollback

### Path B — keep the database untouched

Little of substance remains. Options: consolidate the three business-hours parsers (§4.5), fix the 22 pre-existing
test failures (§4.6), or build the remaining 8 section kinds — each is one schema file plus one renderer, and the
registry picks them up automatically.

### Decisions still genuinely open

| # | Question | Note |
|---|---|---|
| **B4** | Which admin surfaces are in scope long-term? | Cut to just the builder for v1. Still the largest scope lever |
| — | Where do reviews come from? | Google Business integration or a native table. Blocks the `reviews` section |
| **B8** | Which host serves production? | Gates the whole custom-domain design. Has vendor lead time — worth starting early |
| **B11** | Starter templates + licensed imagery | Needs a designer and a budget; on the critical path for launch quality |
| — | Acceptable-use policy for merchant-published content | Nobody owns this. Merchants will publish arbitrary content on `*.dexaposai.com`; there is no takedown process and no HQ force-unpublish |

---

## 11. Site granularity changed — one site per merchant (2026-08-15)

Decided with the team. **Decision D4 ("one site per location") is superseded.** This is the largest architectural
change since the foundation was built, and it was made while the migration was still unapplied — which is the only
reason it was cheap.

### 11.1 The model

```
yourcafe.com                      brand page      site_pages.location_id = NULL
yourcafe.com/locations/downtown   location page   site_pages.location_id = downtown
yourcafe.com/locations/westside   location page   site_pages.location_id = westside
```

One website per merchant. Locations are **pages beneath it**, not separate sites. Online ordering is untouched
and stays per location: a location page's "Order Now" links into that location's existing `/sites/{slug}`
storefront. The builder never grows its own checkout — that ratification still stands.

**Why:** under D4 a five-location merchant maintained five separate websites and five copies of the same About
page. The deciding argument was SEO — five sites split domain authority five ways instead of accumulating it on
one domain, and per-location pages under one domain are exactly what makes "coffee near me downtown" resolve to
the right branch.

### 11.2 The product rule: no prices until the visitor picks a location

Branches can charge different amounts for the same dish (cascade levels L2/L4/L5 are location-scoped), so a price
shown before a location is chosen is a guess — and a guess about money is a support ticket.

| Page | Location from | Prices | Hides 86'd |
|---|---|---|---|
| Brand page, no choice yet | borrowed, for names/photos only | **no** | **no** |
| Brand page, choice stored | the visitor's choice | yes | yes |
| Location page | the URL | yes | yes |
| Single-location merchant | auto-selected | yes | yes |

**"No prices" does not mean "no food."** `menu_items.name/description/image` are merchant-level and identical at
every branch; only price and availability are location-scoped. So a brand page still shows the dishes — it just
borrows a location internally to read them. That borrowing is an implementation detail, not something merchants
configure, which is why the choice **removed** a column (`default_location_id`) rather than adding one.

Availability follows the same rule: on an unscoped page there is no single kitchen to be out of something, so
nothing is filtered. This also resolves §6b's open question in the same direction.

### 11.3 What changed in code

| File | Change |
|---|---|
| `20260813120000_..._foundation.sql` | `merchant_sites`: `merchant_id` gained UNIQUE; dropped `location_id` and `store_config_id NOT NULL UNIQUE` ← *that line was what enforced one-site-per-location*. `site_pages`: gained nullable `location_id` + a partial unique index so location-page generation is idempotent |
| `render-context.ts` | `RenderSite.locationId` is now `string \| null`; new `canShowPrices(ctx)` — one predicate so nine renderers do not each invent the rule |
| `bindings/resolve.ts` | new `ResolverContext.scoped` (default true). False = "this location is a stand-in"; prices still resolve, 86/snooze is not applied |
| `PopularItemsSection.tsx` | the only renderer that shows money; price **and** the dual-pricing disclosure gate on `showMoney = showPrices && canShowPrices(ctx)` |

**Tests 169 → 176.** The load-bearing one: a brand page shows no price *even though the section's `showPrices` is
true* — the context withholds it, not the configuration. Typecheck clean.

### 11.4 Two rules that will cost you if forgotten

**Never redirect the brand homepage on geolocation.** Googlebot crawls from one datacenter. An auto-redirect means
Google only ever indexes one location, which throws away the entire SEO rationale for this design. Location choice
is **in-page state**; `/locations/{slug}` must render fully with no geolocation involved.

**Single-location merchants never see a picker.** Six of the eight merchants in staging have one location — for
them "choose your store" is a choice with one option. Auto-select and hide the picker entirely below 2 locations.

Also: "nearest" is usually the wrong ranking. Order by *open now* → *delivers to this address* → *nearest*. A
visitor sent to a closed branch 200 m away, when an open one is 1 km away, concludes you are closed.

### 11.5 Not built — this is the honest part

The picker, `/locations/{slug}` routing, and location-page auto-generation are **Stage 6 and do not exist**.

Consequently **nothing in the app currently passes `scoped: false` or a null location.** The capability is built
and unit-tested, but no route exercises it, because brand pages have nowhere to live until routing exists. Treat
§11.2's table as specified-and-tested, not as observed behaviour.

`loadSiteContext` also still loads a per-location storefront from `online_store_config` and never touches
`merchant_sites` — unaffected while the migration is unapplied, but it needs rework when real sites load from the
new tables. That rework is the natural first task of Stage 6.
