# Website Builder — Gap Closure Plan

**Date:** 2026-08-16 · **Owner:** Ali Awdi ·
**Status (2026-08-16):** W0, W1 complete · §0 ratified · **W2 complete except 2.8** (moot until
caching is introduced) and the sitemap/robots/JSON-LD half of 2.9 · the publish → visitor path is
now built end to end and has not yet been walked on a live site — see §3 · then W3
**Source:** [GAPS-2026-08-16-WEBSITE-FEATURE-AUDIT.md](GAPS-2026-08-16-WEBSITE-FEATURE-AUDIT.md)
**Companions:** [PLAN-00-GENERAL.md](PLAN-00-GENERAL.md) (stage map) ·
[PLAN-04](PLAN-04-INFRA-PUBLISH-ROUTING.md) (routing/publish) ·
[PLAN-05](PLAN-05-INFRA-ASSETS-DOMAINS-FORMS.md) (assets)

This plan turns the gap audit into ordered, checkable work. It was written after re-reading the
code, and it **adds two blockers the audit did not find**. Both sit in front of the audit's
"Tier 1 — publishing does not reach the public", and neither is closed by writing the route.

---

## 0. Decisions — **both ratified 2026-08-16**

### 0.1 Blocker — the brand site has no address (**new**)

**What the code says.** `merchant_sites.merchant_id` is `UNIQUE` — one site per *merchant*, per the
2026-08-15 supersession of D4. But the public URL space is `/sites/[slug]`, and `slug` lives on
`online_store_config`, which is **one row per location**.
[proxy.ts](../../../proxy.ts) resolves both subdomains and custom domains to
`online_store_config.slug`. `merchant_sites` has no slug, subdomain, or domain column at all.

**Why it blocks.** [PLAN-04 §2](PLAN-04-INFRA-PUBLISH-ROUTING.md) specifies
`resolveRenderMode(slug, path)`. That signature was written 2026-08-12, three days *before* the
granularity change, and it assumes slug ⇒ site ⇒ one location. Today a three-location merchant has
three slugs and zero brand addresses, so there is no URL the brand home page can be served at. The
route cannot be written until this is answered.

| Option | Shape | Verdict |
|---|---|---|
| **A — `merchant_sites.subdomain`** | Site gets its own address. Locations become paths (`/downtown`). Existing per-location slugs keep serving the ordering storefront untouched. | **Recommended.** One nullable-unique column, ~20 lines in `proxy.ts`. Satisfies D1 byte-for-byte: nothing that exists today changes address. |
| B — reuse one location's slug as canonical | Zero new addressing. | Rejected. The brand's URL becomes one branch's name, and changing the canonical branch later splits SEO authority — the exact failure the D4 supersession existed to fix. |
| C — merchant-level slug on `online_store_config` | Fake row with no location. | Rejected. Breaks `UNIQUE (merchant_id, location_id)` intent and every storefront query's assumptions. |

- [x] **RATIFIED 2026-08-16 — option A.** `merchant_sites.subdomain`, nullable and unique.

**One correction to this plan's own earlier reasoning.** It proposed superseding
`resolveRenderMode(slug, path)` with `(host, path)`. That is not needed and would have been worse.
Because the database now refuses to let a brand subdomain and an `online_store_config.slug`
collide — enforced by trigger **in both directions**, since a merchant answering on another
merchant's storefront address is a tenancy break rather than a clash — the two live in **one flat
namespace**. `proxy.ts` reduces either kind of host to a single key, so the fork keeps its original
`(slug, path)` shape and no host parsing leaks into routing. PLAN-04 §2's signature stands.

### 0.2 Blocker — publishing never flips the routing fork (**new**)

**What the code says.** `render_mode` appears in exactly two places in the entire TypeScript
codebase: a type in [db-types.ts:26](../../../lib/site-builder/db-types.ts#L26) and a *comment* in
[site.ts:45](../../../app/dashboard/website/actions/site.ts#L45). Nothing ever writes it.
[PLAN-04 §3.1 step 7](PLAN-04-INFRA-PUBLISH-ROUTING.md) requires the first successful publish to
flip it to `'builder'`.

**Why it blocks.** `render_mode` defaults to `'template'`, and PLAN-04's rule 2 sends every
`'template'` site to the storefront. So even with the Stage 6 route fully built, every merchant
would serve the template forever and publishing would *still* be a visitor-side no-op. The audit's
1.1 ("no route serves a published page") is therefore necessary but not sufficient — W2.5 below is
the other half.

- [ ] **No decision needed — just build it.** Tracked as W2.5.

### 0.3 Decision — how the public route reads past RLS

The migration does `REVOKE ALL ... FROM PUBLIC, anon` on all three tables
([foundation migration:361-363](../../../supabase/migrations/20260813120000_website_builder_foundation.sql#L361)),
and every policy is `FOR ALL TO authenticated USING (is_merchant_admin(merchant_id))`. A public
route reading with the anon key gets zero rows.

**Recommendation: service-role, in one narrow file** — `lib/site-builder/public-read.ts`, whose
only exported functions select a live version by `(site, path)` and **never** project
`draft_content`. Service role bypasses RLS, so query construction becomes the only guard; confining
it to one tested file is what makes that acceptable. The alternative — an `anon` SELECT policy on
currently-live `site_page_versions` — spreads the same risk across a policy that must stay correct
through every future schema change, and this is the one place a loose policy exposes every
merchant's unpublished drafts.

- [x] **RATIFIED 2026-08-16 — the SECURITY DEFINER function**, which is a third option and a better
      one than the service-role module this plan originally recommended.

`public.get_public_site_page(p_slug, p_path)` is the only door. `anon` keeps **zero** table grants,
so the foundation migration's `REVOKE ALL ... FROM anon` never has to be weakened — a line that is
easy to erode later without anyone noticing. `draft_content` is not in the function's return type,
so the column that must never be public is not reachable through it at all.

The tension this resolves: PLAN-04 wanted the fork in one unit-testable TypeScript function, and
burying that logic in SQL would have traded the tests away. So the two concerns are split — the
function returns **facts**, and `decideRenderMode` in TypeScript renders the **verdict**, with one
test per rule. Postgres guards; TypeScript decides.

---

## 1. Work order

Six waves. Each item is roughly one PR. Estimates assume one developer.

### W0 — Stop telling merchants things that are not true ✅ **done 2026-08-16**

Everything here is copy or a one-line gate. It was first because it was the only work that was
*actively misleading*, and none of it depended on anything else.

At the time, a single constant `BUILT_SITE_IS_PUBLIC` carried the fact that publishing did not reach
visitors, so every surface told one story and W2 could flip one boolean.

**Superseded once W2 landed, and the file deleted.** Reachability stopped being a property of the
build and became a property of *each site* — whether it has claimed a web address — so the editor
now takes a `publicUrl` prop threaded from the site row. A global flag left at `false` would have
made the editor lie in the opposite direction, insisting a site could not be reached at the moment
it could. Same principle, better input: the copy, the external link and the status line all key off
whether this merchant actually has an address.

- [x] **0.1 — Review sheet success state.** Said "Your page is live" with an **Open the live page** link to the ordering storefront. Now titled "Version *N* published", linking to the preview, and saying once and plainly that websites are not served to guests yet. `PublicationTarget` no longer composes a public URL that resolves to something else, and the "never published" and footer copy match.
- [x] **0.2 — Editor page switcher.** **Manage pages** linked to `/dashboard/website`, which counts pages and manages none. Now disabled and labelled "Coming soon" — visible so the capability still reads as planned. W3.1 re-enables it.
- [x] **0.3 — Gallery in the add-section gallery.** Added `unavailable?: string` to the section registry and set it on `gallery`. The gallery card is disabled, badged "Not ready yet", and states the reason; the kind is unchanged everywhere else, so existing gallery sections keep rendering and publishing. Registry-driven rather than a special case in the modal, and covered by a test that fails when Stage 7 lands.
- [x] **0.4 — Point preview at the real draft.** [preview/page.tsx](../../../app/dashboard/website/preview/page.tsx) now loads the merchant's own draft via `GetSite` → `ListPages` → `LoadDraft`, accepts `?page=`, falls back to home, and gates the diagnostics bar behind `NODE_ENV !== "production"`. Uses `GetSite`, not `GetOrCreateSite`: looking at a preview must not be what brings a website into existence.

*Verified:* browser-checked at `/dashboard/website/preview` as Joes Coffee Shop — renders that
merchant's own sections, and Tony's Pizza is gone.

**Found while doing it:** `GetSite` filtered on `merchant_sites.location_id`, a column that has
never existed — the table has been merchant-scoped since the 2026-08-15 supersession of D4. It was
a guaranteed error for any caller and had none, which is the only reason it went unnoticed. Fixed
by dropping the parameter.

### W1 — Prove the foundation before changing it ✅ **done 2026-08-16**

Deliberately ahead of W2, because W2 rewrites `PublishPage` and there was nothing to catch a
regression.

- [x] **1.1 — Ran [`scripts/verify-site-tenancy.ts`](../../../scripts/verify-site-tenancy.ts)** against staging (`dfwqakoyittmrwbqvxgw`), **all 17 assertions PASS, zero skips.** Merchant A `2add44cb` (Joes Coffee Shop) against B `a9aca1d8` (FiDi Appflow Studio Cafe). The authenticated lane needs a Clerk-issued Supabase token: sign in as the merchant and take `await window.Clerk.session.getToken()` — it expires in ~60s, so mint it immediately before the run. Cross-tenant reads return 0 rows, and both write paths are refused by the `WITH CHECK` policy, including reparenting one's own page into another tenant's site.
- [x] **1.2 — Server-action tests.** 52 new tests across `publish`, `draft`, and `pages`, on an in-memory Supabase fake ([`__tests__/fake-supabase.ts`](../../../app/dashboard/website/actions/__tests__/fake-supabase.ts)). A stateful store rather than scripted responses, so the real SHA-256 content hash and the real version numbering decide the outcomes. Covers the `version_number` race via a `beforeInsert` seam, the content-hash no-op (including its insensitivity to property order), the supersede step, version immutability, the publish stamps, `SaveDraft`'s stale-`revision` branch, and the page CRUD guards W3 is about to expose.
- [x] **1.3 — Recorded the result** here rather than in the README, which §4 rewrites wholesale.

*Result:* full suite 490 passing (was 435), same 22 pre-existing failures in `lib/menu`,
`components/dashboard/menu`, and `tests/a11y` — none in this feature. Lint clean; zero type errors
in the touched paths.

**Two things worth knowing:**

1. **The tenancy script was destructive, and had been run before.** It overwrites `draft_content`
   and `title` on a real home page and never restored them. It now snapshots both and restores in a
   `finally`, reporting a failed restore as a failure instead of printing success unconditionally.
   The audit's "has never been run" is wrong: a run on **2026-08-15T12:17Z** left its `sec_probe`
   hero section and a `Home <timestamp>` title on Joes Coffee Shop's draft, where it sat for a day.
   That debris is still there — **a one-off repair is pending approval**, see §4.
2. **`PublishPage` still does not flip `render_mode`,** now asserted by a test that documents
   today's wrong behaviour so the W2.5 fix has to come back and change it deliberately.

### W2 — Make publishing reach the public (≈ 8–10 days, the largest remaining piece)

§0 ratified 2026-08-16. **2.1–2.3 written; the migration is not yet applied.**

- [x] **2.1 — Migration: `merchant_sites.subdomain`** — [20260816140000_website_public_addressing.sql](../../../supabase/migrations/20260816140000_website_public_addressing.sql). Nullable, uniquely indexed, DNS-label format CHECK, plus collision triggers in both directions against `online_store_config.slug`. Backfills nothing: a site without a subdomain has no brand address yet and is simply unreachable, which is the safe default. The reserved-name list lives in [reserved-subdomains.ts](../../../lib/site-builder/reserved-subdomains.ts) rather than the schema, matching `reserved-paths.ts` — the list will change more often than the schema should, and a test keeps the two regexes in step. **That test earned itself immediately, catching a redundant capture group in the SQL on its first run.**
- [x] **2.2 — [`lib/site-builder/resolve-render-mode.ts`](../../../lib/site-builder/resolve-render-mode.ts)** — all five PLAN-04 rules as a pure `decideRenderMode(facts)`, keeping the `(slug, path)` signature per the §0.1 correction. 12 tests, one per rule, including rule 5 and the property that nothing may downgrade a genuinely published page to a template. Adds one rule the brand subdomain requires: a subdomain with nothing published **404s rather than falling back**, because templates are addressed by storefront slug and a fallback would serve one arbitrary branch's ordering page at the brand's address.
- [x] **2.3 — The public read path** — `get_public_site_page()` in the same migration, not a service-role module (§0.3). Returns facts, never `draft_content`. `loadSiteRequestFacts` degrades to "no site" on any read error, which lands on rule 2 and serves the template: a built site that cannot be read must not take the storefront down with it.
- [x] **2.1a — Applied to staging and verified 2026-08-16.** All five objects exist. `anon` has **zero** SELECT on all three website tables while `authenticated` keeps its grants, and `anon` may execute the function — the two halves of decision §0.3's security claim, now checked rather than asserted. The function is `SECURITY DEFINER` with `search_path=public`.
- [x] **2.1b — `verify-site-tenancy.ts` gained Lane 4.** A boundary that is only checked by reading the migration is not checked at all, and this function bypasses RLS by construction, so it is the one place a mistake is unbounded. **26/26 assertions pass, zero skips.** Lane 4 proves anon can call the function, that it exposes no draft column, that anon still cannot read `site_pages` directly, and that an unpublished path resolves to no page rather than to a draft. Lane 4b proves the format CHECK and **both** directions of the collision trigger, restoring the subdomain in a `finally`. Verified afterwards that the run left no probe rows, no stray subdomains, and all five of merchant A's storefronts intact.
- [x] **2.4 — The route.** [built-site.tsx](../../../app/sites/[slug]/built-site.tsx) resolves and renders; the storefront page gains a 4-line branch and is otherwise untouched. **Structure differs from PLAN-04 §2.1 for a concrete reason:** an *optional* catch-all `[[...path]]` also matches the zero-segment case and therefore collides with the sibling `page.tsx`, which Next refuses. A **required** catch-all `[slug]/[...path]` matches only sub-paths, so the home page stays with the storefront route and delegates through the same fork. Reserved paths then need no list at runtime — static segments beat a dynamic catch-all in Next, so `/checkout`, `/info`, `/order/…` and `/t/…` never reach it. `proxy.ts` resolves a brand subdomain when the storefront lookup misses, through `get_public_site_page` rather than a table read, because the website tables are REVOKED from anon by design.
- [x] **2.5 — `render_mode` flips on publish** (§0.2), in `stampSitePublishTimes`. Written on **every** publish rather than only the first: a merchant who unpublishes their last page and later publishes again already has `first_published_at` set, so first-publish-only logic would strand them in `'template'` with live pages nobody can see. `UnpublishPage` is the inverse — it nulls the pointer, supersedes the live version, keeps the history, and returns the site to `'template'` when the last page goes down. 8 new tests.
- [x] **2.6 — The nav renders.** `merchant_sites.nav` had existed and been read by nothing. `readNav` in [public-context.ts](../../../lib/site-builder/public-context.ts) turns it into links, prefixing paths at render time — the same site answers at a subdomain and at `/sites/{slug}`, so a stored absolute href would be right in one and broken in the other. The editing UI is still W3.3.
- [x] **2.7 — `site_pages.location_id` is honoured.** The public context takes the **page's** location, not the storefront's, so a brand page carries NULL and `canShowPrices()` can finally return false. A brand page still has to resolve menu bindings against *some* location — `get_menus_for_location` cannot answer without one — so it borrows the merchant's first active storefront and passes `scoped: false`, which the resolver already anticipated: names, descriptions and photos are merchant-level and identical everywhere, while prices and 86/snooze are not. The visitor-facing location picker remains open.

**Renders as a real anonymous visitor.** [`createAnonSupabaseClient`](../../../lib/supabase/anon.ts), not the service role the existing storefront uses. Every read is either an RLS-protected public policy (`locations`, `online_store_config`) or a SECURITY DEFINER function anon may execute (`get_public_site_page`, `get_menus_for_location` — both confirmed anon-executable on staging). A missing grant now breaks the page in development instead of leaking in production.

- [x] **2.4a — [20260816150000_website_public_page_merchant.sql](../../../supabase/migrations/20260816150000_website_public_page_merchant.sql) applied.** Adds `merchant_id` to the function's return, which the renderer needs and cannot get elsewhere: anon cannot read `merchant_sites`, and a brand subdomain has no storefront slug to derive it from. Verified the function now returns the full fact set for a real slug — merchant id, version 2, 7 sections, nav, theme, and `page_location_id: null`.

- [x] **2.4b — Storefront addresses can no longer be hijacked by a publish. Found while checking what a `render_mode` backfill would touch.**

  The fork resolved a storefront slug to its merchant's site. `online_store_config.slug` is per
  **location** and a site is per **merchant**, so the first `render_mode` flip would have replaced
  *every* branch's ordering page with a single brand home page — five live ordering storefronts down
  on the first publish for the merchant we happened to be testing with. That contradicted §0.1 as
  ratified ("existing per-location slugs keep serving the ordering storefront untouched") and D1;
  the storefront-slug branch was a leftover from the pre-2026-08-15 model where one slug meant one
  site.

  Corrected so a built site serves at its **brand subdomain and nowhere else**. Two things fall out
  of it: rule 5's fail-safe stops being a rule that must hold and becomes a situation that cannot
  arise, and a storefront request now short-circuits before the database round trip — so D1 holds
  for latency as well as output. Tested as a property, across every state of the built site.

  The `render_mode` backfill this started from was **dropped** — the affected rows were dev data,
  and running it before this fix would have caused exactly the outage it exposes.

- [x] **2.9 — Page metadata.** Both routes now emit the page's own `seo` block. Without it a built page inherited the *storefront's* `generateMetadata`, so a merchant's About page would be titled after their ordering storefront, and the sub-path route had no metadata at all. The routing decision is memoised per request with React `cache()`, so `generateMetadata` and the page component share one database round trip rather than asking the same question twice. Sitemap, robots and JSON-LD are still open.

**Also fixed while verifying:** the content-hash no-op returned before touching `render_mode`, so republishing identical content could not rescue a site stuck on the template. The no-op is about not writing a redundant *version*, never about skipping visibility — `ensureSiteIsLive` now runs on that path too, and a test covers the migration case directly.
- [x] **2.11 — The editor tells the truth again.** W0 made it say "websites are not served to guests yet", which stopped being true the moment W2 landed. `publicUrl` now flows from the site row into the toolbar and the review sheet, so a site **with** an address gets "Your page is live" and a working link, and one **without** gets told exactly what is missing and where to fix it — rather than either a false promise or a false denial. `BUILT_SITE_IS_PUBLIC` is deleted; an always-false global would have been the new lie.
- [x] **2.10 — Claiming a web address.** [`ClaimSubdomain`](../../../app/dashboard/website/actions/site.ts) plus a card on the Website overview. **Availability is the database's answer, not a prior SELECT** — checking and then writing is a race, and the losing merchant would be told "available" a moment before being told otherwise. So the write goes ahead and `23505` is translated into "that web address is already taken", which covers a clash with another website *and* with somebody's ordering storefront, because the cross-namespace trigger raises the same code. Changing an existing address confirms first and names what breaks (shared links, printed QR codes, search results); claiming a first one does not interrupt. Readiness checklist now counts the address rather than the storefront URL, since a site without one cannot be reached however finished it is. 9 tests; validation verified live in the browser.

- [ ] **2.8 — Cache invalidation.** Currently *moot rather than done*: the built routes are `force-dynamic`, so a publish is visible on the next request and there is no stale cache to invalidate. That is correct but pays a full render per visit. Wiring `revalidateTag` now would add calls that provably do nothing, so caching and its invalidation should land together — tag per page and per site, verified with a publish → `curl` loop rather than by inspection. **Do not introduce caching without the tags in the same change.**
- [ ] **2.9 — SEO surface.** `generateMetadata` from `doc.seo`, `sitemap.ts`, `robots.ts`, JSON-LD `Restaurant`. Canonicals must account for a page being reachable at both the brand subdomain and a custom domain.

*Acceptance (from PLAN-00 §6):* a published page returns fully-formed HTML to `curl` with JS
disabled; changing a price in the POS changes the live page with no republish; a location with a
template storefront and no built site is byte-for-byte unaffected.

### W3 — Page management (≈ 4–5 days)

Multi-page is modelled end-to-end in the schema and invisible in the product: `CreatePage`,
`RenamePage`, `DeletePage`, and `GetHomePage` all exist in
[pages.ts](../../../app/dashboard/website/actions/pages.ts) and nothing calls them except
`CreateHomePage`.

- [ ] **3.1 — Page list on `/dashboard/website`** — title, `/path`, home indicator, draft dot, row actions (rename, duplicate, set home, delete). Repoint Toolbar's **Manage pages** here and re-enable it (undoes W0.2).
- [ ] **3.2 — Page settings in the editor.** `PageSettings` in [SettingsPanel.tsx](../../../components/site-builder/builder/SettingsPanel.tsx) writes `doc.seo.title` and `.description` and nothing else — a merchant cannot rename a page, change its address, make it the home page, or delete it. Wire the existing actions; `checkPagePath` and `slugifyPagePath` already handle validation.
- [ ] **3.3 — Nav editor** — site-wide, on the design workspace rather than the page, since `merchant_sites.nav` is deliberately not per-page (changing a nav link must not version every page). Consumes W2.6.
- [ ] **3.4 — Location pages** — "create a page for this location", honouring the `uq_site_pages_one_per_location` partial index so running it twice cannot produce two pages both claiming to be Downtown.

### W4 — Publish lifecycle (≈ 3–4 days)

- [ ] **4.1 — `listVersions`, `rollbackToVersion`, `diffVersions`** + a version list in the review sheet. The table is append-only and correct; nothing reads it back, so a merchant who publishes a mistake has no way out but re-editing. `rolled_back_from_version_id` already exists, so a rollback **inserts a new version** rather than reactivating an old row. **The UI must state that prices are not rolled back** — only layout is versioned (D6).
- [ ] **4.2 — Mobile-preview acknowledgement before first publish** (page-editor plan §6.9). Most restaurant traffic is mobile and merchants currently publish desktop-only layouts unwarned.
- [ ] **4.3 — `site_publish_events` ledger** (PLAN-04 §4) — specified, never migrated. Optional for v1; decide explicitly rather than leaving it as silent debt.

### W5 — Assets (≈ 2–3 weeks, largest dependency)

The biggest *content* gap: `resolveAssetUrl` returns `null` for every id, every image field in the
inspector renders "Image uploads arrive with the asset library"
([SettingsPanel.tsx:530](../../../components/site-builder/builder/SettingsPanel.tsx#L530)), and for
a **restaurant** website food photography is the main reason a guest stays on the page.

- [ ] **5.1 — Answer PLAN-05's own upload-API design question first.** That plan warns it assumes an API needing ~2 days of design. Do not start 5.2 before this is written down.
- [ ] **5.2 — `site_assets` + storage bucket + quota + `resolveAssetUrl`.**
- [ ] **5.3 — Turn image fields on**, and un-hide Gallery (undoes W0.3).

### W6 — Settings and measurement (≈ 1 week)

- [ ] **6.1 — Site settings surface.** `merchant_sites.site_seo` and `.integrations` are written by `UpdateSiteSettings` and have no UI: favicon, social image, subdomain (now meaningful after W2.1), visibility, legal pages, analytics. Custom domains stay an explicit v1 cut.
- [ ] **6.2 — Funnel instrumentation** — editor opened → first edit → saved draft → preview → review → published. Without it there is no way to tell whether any of this works for real merchants.

### Deliberately not in this plan

`reviews` and `reservations` sections (cut for lack of a data source — no reviews table,
`lib/reservations/` is a single file); custom domains; quotas; `cards` / `form` / `video` /
`events` / `pdf` / `scrolling-banner` (additive — one schema file and one registry entry each, no
migration). All are v1 scope cuts from 2026-08-13, not oversights.

---

## 2. Dependencies

```text
W0  ──────────────────────────────────────────────  ✅ done 2026-08-16
W1  ──────────────────────────────────────────────  ✅ done 2026-08-16
§0.1 + §0.3 sign-off ──► W2.1 ──► W2.2 ──► W2.4 ──► W2.8 ──► W2.9
                                   W2.3 ──┘
                          W2.5 ──────────┘   (route is inert without the flip)
                          W2.6 ──► W3.3
                          W2.7 (parallel with W2.4)
W3 ──► W3.1 undoes W0.2
W5 ──► W5.3 undoes W0.3
```

**The critical path is §0.1 → W2.1 → W2.2 → W2.4 → W2.5.** Nothing a visitor can see changes until
all five land, which is why W2.5 must not be treated as a footnote to the route.

## 3. The one thing not yet proven end to end

Every piece of `publish → visitor` exists and is unit-tested, and no part of it has been walked on a
real site. The blocker is incidental rather than structural: the only merchant with a published page
is the dev one, whose `render_mode` predates W2.5 and so still says `'template'`. The backfill that
would have fixed it was dropped (dev data), and the review sheet correctly refuses to republish
matching content — so that particular site cannot reach `'builder'` without an edit.

**For any merchant starting from here the order does not matter and no such gap exists:** publishing
flips `render_mode`, claiming an address makes it resolvable, and either can come first.

To walk it once: edit a page, publish (flips the mode), claim an address, then load
`{subdomain}.dexaposai.com` — or `/sites/{subdomain}` in development. Worth doing before W3, because
it is the first time the whole chain runs against real data.

## 4. Verification

Per stage, not at the end:

- `npm run test` green, and no **new** `npx tsc --noEmit` errors in the touched paths. Neither is a
  real gate on its own: builds set `ignoreBuildErrors` and `ignoreDuringBuilds`, the repo carries
  ~2,550 pre-existing type errors (mostly `date-fns` resolution noise), and 22 tests were already
  failing in `lib/menu`, `components/dashboard/menu`, and `tests/a11y`. Compare against that
  baseline rather than expecting zero.
- `verify-site-tenancy.ts` all lanes PASS — ✅ **26/26, staging, 2026-08-16**, including the Lane 4
  public-read and namespace checks. Run it after **any** change to the website policies, the
  `get_public_site_page` function, or the collision triggers. The authenticated lane needs a Clerk
  token (see W1.1); the run is non-destructive but only because it snapshots and restores, so read
  the `↩ restored` lines rather than assuming.
- W2: `curl` a published page with JS disabled and get complete HTML; change a price in the POS and
  see it on the next request with no republish; confirm a template-only location's HTML is
  unchanged before and after.
- W2.5: publish → `render_mode = 'builder'`; unpublish the last page → back to `'template'` and the
  template storefront returns.
- W3/W4: exercised in the browser against a real draft, not a fixture.

## 5. Outstanding — needs a decision

- [ ] **Repair the debris on Joes Coffee Shop's home page draft** (page `2594a8a0…`, staging). It
      carries a `sec_probe` hero titled "revision probe" as its **first** section — ahead of the
      header, which is not a position the zone rules allow — and the title `Home 1786796238939`.
      Both are leftovers from the 2026-08-15 tenancy run described in W1. The fix is to drop the one
      section and reset the title to `Home`; it is a two-column update on one row, but it is a
      write to a real draft, so it is left for explicit approval rather than done quietly. Nothing
      else depends on it — it only makes the preview surface show clean content.
- [ ] **`tsconfig.json` has `"jsx": "react-jsx"`** and is committed that way. A prior note records
      that it must stay `"preserve"` for Next.js and that a stray full-project `tsc` run is what
      changes it. Unrelated to this plan and not touched here, but worth confirming deliberately.

## 6. Documentation to correct alongside the work

- [ ] [README.md](README.md) — replace the progress table with §3 of the gap audit. The Stage 2 "migration NOT applied" banner and the "edits are lost on refresh" note are both false now.
- [ ] [README.md](README.md) — the "See it working now" block recommends `/dashboard/website/preview` as a fixture demo; after W0.4 it is no longer fixture-driven.
- [ ] [PLAN-04](PLAN-04-INFRA-PUBLISH-ROUTING.md) §2 — record the §0.1 decision and the `(host, path)` signature change; the current text predates the 2026-08-15 site-granularity supersession.
- [ ] [PLAN-00-GENERAL.md](PLAN-00-GENERAL.md) §5 — items 21–24 are still accurate; add the `render_mode` flip as an explicit item under Stage 5.
