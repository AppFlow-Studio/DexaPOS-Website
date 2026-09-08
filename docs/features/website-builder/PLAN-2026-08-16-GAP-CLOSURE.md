# Website Builder — Gap Closure Plan

**Date:** 2026-08-16 · **Owner:** Ali Awdi ·
**Status (2026-08-17):** W0, W1 complete · §0 ratified · **W2 complete except 2.8** (moot until
caching is introduced) and the sitemap/robots/JSON-LD half of 2.9 · **the chain has now been walked
end to end on the real staging site — see §3.** It found three defects, all fixed; one needs a
migration applied before the live page is correct · **W3.1 and W3.2 done** — multi-page is now a
product feature rather than schema · next: 3.3 nav editor, 3.4 location pages, and the two carve-outs
3.1a / 3.1b

**[20260817120000_get_public_locations.sql](../../../supabase/migrations/20260817120000_get_public_locations.sql)
is applied and verified** — the live page now serves its address, phone and hours. **The file and
staging now agree exactly** (all 14 columns, checked against `pg_proc`), so there is nothing
outstanding to run. The `email` removal that briefly lived in a second migration was reversed on
evidence and both files collapsed back into this one — see 2.12a. 3.1a and 2.9a each still need a
migration of their own, neither yet written.
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

- [x] **2.12 — A published page can read its own address.** [20260817120000_get_public_locations.sql](../../../supabase/migrations/20260817120000_get_public_locations.sql) — **written, NOT yet applied.** A SECURITY DEFINER projection rather than an anon SELECT policy on `locations`, for a reason the column list settles on sight: that table carries `ein`, `tax_id`, `luqra_mid`, `sales_tax_rate` and `processor_fee_percentage` beside the address, and RLS is row-level, so a public policy would have published every merchant's tax id. The function names its columns explicitly, which also means **a column added to `locations` later is private by default** — it has to be named here to become public, and that is the safe direction for that mistake to fall. It answers only for a merchant who has already chosen to be public (a built site with an address, or an active storefront), so it is not an enumeration surface over the platform. Same shape as `get_public_site_page`, so §0.3 now covers every public read rather than most of them. The signed-in editor keeps reading the table directly — routing it through the public projection would quietly narrow what a merchant can see about their own restaurant — and a test pins which door each caller uses.
- [x] **2.12a — Applied and verified 2026-08-17.** `anon` calls the function and gets the address, phone and hours; `anon` still gets **zero rows** selecting `id, ein, tax_id` from the table, so the projection is the only door and it stayed shut behind it. The live page went from 40 KB to 50 KB and now carries the street, postal code, phone and every day's opening hours — the PLAN-00 §6 acceptance criterion ("fully-formed HTML to `curl` with JS disabled") is met for the first time. **A follow-up migration to drop `email` was written, then reversed — and the reversal is the lesson.** The verification noted that the projection returned `email` while no built-site section rendered it, and concluded it was public exposure with no feature attached. A second file was written to remove it, then folded back into this one to avoid shipping a migration that publishes a column and another that retracts it.

  **Checking the premise killed it.** Two facts, neither of which had been looked at when the entry was written: [InfoPanel.tsx:200](../../../app/sites/components/InfoPanel.tsx#L200) already renders `location.email` as a `mailto:` link on the **public** storefront info page, so it has been anonymously readable all along; and [email-duplicates.ts:16](../../../app/manage/actions/email-duplicates.ts#L16) classifies `locations.email` as an organizational contact column — "org metadata, not a login identity". It is a restaurant's published contact address, not the account holder's private mailbox, and dropping it would have made a merchant's *website* less capable than the storefront it replaces while guaranteeing another migration the day someone builds a Contact section.

  **`email` therefore stays**, and the reasoning is now a comment in the migration so the argument is not had a third time. The columns this projection must never carry remain `ein`, `tax_id`, `luqra_mid`, `sales_tax_rate` and `processor_fee_percentage`. **Second time in this plan that an entry was written from a name without checking the thing itself** — the first was `sec_probe` in §5. Both were caught by reading the code rather than the label.
- [x] **2.13 — A section that needs a location can be given one.** Two halves of one dead end. The cause: [store.ts](../../../components/site-builder/builder/store.ts) called `addSection` without the defaults context, so a Location & Hours section added from the gallery was born with an empty binding and made the page unpublishable the moment it landed — `restoreRequiredSection`, two functions below, had been threading that context all along. The store now carries the editing location and both paths read it, so they cannot drift. The symptom: the inspector explained that the binding "is already correct", which is true only while it *is* set; an unset one now says what is wrong and offers one button that fixes it. 3 tests.

- [ ] **2.8 — Cache invalidation.** Currently *moot rather than done*: the built routes are `force-dynamic`, so a publish is visible on the next request and there is no stale cache to invalidate. That is correct but pays a full render per visit. Wiring `revalidateTag` now would add calls that provably do nothing, so caching and its invalidation should land together — tag per page and per site, verified with a publish → `curl` loop rather than by inspection. **Do not introduce caching without the tags in the same change.**
- [x] **2.9 — SEO surface, except sitemap/robots.** Three of the four parts are done and verified against the live staging page.

  **The title template no longer says DEXA POS.** The root layout sets `template: "%s — DEXA POS"`, correct for the dashboard and wrong on a restaurant's own website — it put our brand in their browser tab and in every link they shared. A built page now returns `title: { absolute }`, which is what opts out of an inherited template, and uses `site_seo.titleSuffix` if the merchant set one. That field was already read into a local and then never used, so it had never worked.

  **Canonicals point at the brand subdomain**, through the new [public-url.ts](../../../lib/site-builder/public-url.ts). A built page answers at both `{subdomain}.dexaposai.com` and `/sites/{slug}`, and two addresses for one page split its search authority; the subdomain is the address the merchant chose and printed on their menus, so it wins. The domain string had been written out by hand in four places and now has one home.

  **JSON-LD `Restaurant`** in [json-ld.ts](../../../lib/site-builder/json-ld.ts), built from **what the page already resolved** rather than a second query, so the address in the markup and the address in the structured data are the same facts by construction. Every unknown field is omitted rather than emitted empty — `"telephone": ""` is a claim, where absence is not. `soleLocation` picks the address only when the page resolved exactly one, since a brand page covering five branches has no single address to give. The storefront template had emitted this since before the builder existed, so without it, moving to the website builder silently downgraded a merchant's search presence. 14 tests.

  *Verified by `curl` against the live page:* `<title>Home</title>` (was `Home — DEXA POS`), `<link rel="canonical" href="https://joes-coffee-shop.dexaposai.com"/>`, and one valid `ld+json` block carrying the street address, phone and six days of opening hours.

- [ ] **2.9a — `sitemap.xml` and `robots.txt` need one migration first.** Both are *routable*: the matcher in [proxy.ts](../../../proxy.ts) does not exclude `.xml` or `.txt`, so a request to `{subdomain}.dexaposai.com/sitemap.xml` rewrites to `/sites/{slug}/sitemap.xml`, and a route handler under that segment beats the `[...path]` catch-all the same way `/checkout` does. Scoping them there rather than at the app root is what keeps the marketing site's indexing out of a website-builder change.

  **The blocker is data, not routing.** A sitemap must list a site's published paths, and `get_public_site_page(p_slug, p_path)` answers for **one** path at a time while `anon` has zero grants on `site_pages`. So it needs a second SECURITY DEFINER function — `get_public_site_paths(p_slug)`, returning path and `published_at` for live pages only — or a service-role read, which decision §0.3 exists to prevent. Write the function; do not reach for the service role here.

- [ ] **2.9b — A built page's title is bare.** Now that our suffix is gone, a home page titled "Home" produces `<title>Home</title>`, which says nothing about the restaurant in a search result or a shared link. The fix is a default `site_seo.titleSuffix` of the restaurant's name, but `builtSiteMetadata` has no access to it — the fork's decision carries `siteSeo` and `pageTitle`, not the brand name, and getting it means either another read on the metadata path or seeding the field at site creation. **Belongs with 6.1**, which is where a merchant edits `site_seo` anyway.

*Acceptance (from PLAN-00 §6):* a published page returns fully-formed HTML to `curl` with JS
disabled; changing a price in the POS changes the live page with no republish; a location with a
template storefront and no built site is byte-for-byte unaffected.

### W3 — Page management (≈ 4–5 days) — **3.1 and 3.2 done 2026-08-17**

Multi-page is modelled end-to-end in the schema and invisible in the product: `CreatePage`,
`RenamePage`, `DeletePage`, and `GetHomePage` all exist in
[pages.ts](../../../app/dashboard/website/actions/pages.ts) and nothing calls them except
`CreateHomePage`.

- [x] **3.1 — Page list on `/dashboard/website`** — [PageListCard.tsx](../../../components/site-builder/dashboard/PageListCard.tsx). Title, `/path`, home badge, published-or-draft badge, and row actions. A list rather than a grid of cards, because a page's identity is its **address**: two pages called "Menu" at `/menu` and `/menus` is a mistake the merchant needs to see at a glance, and cards hide the one column that shows it. The new-page dialog derives the address from the title until the merchant touches it, then leaves it alone. **Manage pages** in the toolbar is re-enabled and points here (undoes W0.2). *Browser-verified on staging: created a second page, renamed it, removed it.*
- [x] **3.2 — Page settings in the editor.** Name, address and removal now sit above the search-listing fields that used to be the whole panel. Saved **on blur and immediately**, not through the draft autosave, because the row and the document are different stores with different failure modes — "that address is already taken" has to reach the merchant, and a silent autosave has nowhere to put it. A rejected value is put back rather than left in the field, so the box never shows an address that does not exist. The home page shows its address as fixed and explains why instead of offering a control the action would refuse.
- [ ] **3.1a — "Make this the home page"** was scoped into 3.1 and is **not built.** It is not a flag flip: `uq_site_pages_one_home` allows one home per site and the home page owns the empty path, so promoting a page is a two-row, four-column swap that must be atomic — demote-then-promote through PostgREST can strand a site with no home page if the second write fails. That makes it a database function, and the migration could not be applied in this session. Everything else in 3.1 works without it. **Do not implement it as two client-side updates.**
- [ ] **3.1b — Duplicate a page.** Also scoped into 3.1 and not built; `DuplicatePage` does not exist server-side. Smaller than 3.1a and genuinely additive — it needs a new action that copies `draft_content` under a fresh path.
- [x] **3.3 — Nav editor** — a **Navigation** tab on the design workspace, not the page editor, because `merchant_sites.nav` is deliberately not per-page. Consumes W2.6, and needed no migration or server action: the column already existed and `UpdateSiteSettings` already accepted `nav` in its patch type — only the writer was missing. [nav.ts](../../../lib/site-builder/nav.ts) now owns the contract that previously lived only inside `readNav`, and the tests that matter are **round trips** (editor writes → `readNav` reads), because the two halves run in different processes and drift silently: the failure is a link the merchant saved and the header never draws. 15 tests.

  **Targets are picked from the page list, never typed.** A hand-entered path is a 404 the merchant cannot see from the editor — they would have to publish, visit the live site and click it to find out. The page list is loaded server-side in [design/page.tsx](../../../app/dashboard/website/design/page.tsx), so the valid set is known exactly and the mistake becomes unavailable rather than merely discouraged. A link whose page was later renamed is the one case that escapes this, so it is flagged in place instead of being silently repointed.

  *Browser-verified on staging as Joes Coffee Shop:* added an internal and an external link, saved, and confirmed the **public page** rendered `<nav aria-label="Primary">` with the internal href prefixed to `/sites/joes-coffee-shop` and the external one passed through untouched — 51,647 bytes of server-rendered HTML, up from 50,705 without nav. Then removed both and confirmed the column, the theme and the public page all returned to their original state, leaving no debris (the W1.1 lesson).

  **One thing the browser found that the tests could not:** a merchant with a single page got a silently duplicated "Home" row on a second **Add link**, because the suggestion fell back to `pages[0]` once every page was linked. It now offers an external row instead — the only kind of link left to add.
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
W3.1 ✅ undoes W0.2 · W3.2 ✅ · W3.3 ✅ consumes W2.6 · W3.1a blocked on a migration (atomic home swap)
W5 ──► W5.3 undoes W0.3
```

**The critical path is §0.1 → W2.1 → W2.2 → W2.4 → W2.5.** Nothing a visitor can see changes until
all five land, which is why W2.5 must not be treated as a footnote to the route.

## 3. Walked end to end — 2026-08-17

Done on staging as Joes Coffee Shop: edit a page → publish → `render_mode` flips → load
`/sites/joes-coffee-shop` as an anonymous visitor. **The chain works**: `render_mode` went to
`'builder'` on publish, the route returned **HTTP 200 and 40 KB of server-rendered HTML** with the
hero text edited moments earlier, and the editor's own copy ("Your page is live", version 3) matched
what the visitor actually got.

It was worth doing before W3. Three things were only findable this way, because each needs *real*
data and *real* privileges — unit tests had passed on all three.

**1. A published page had no address, phone, hours or map.** The most serious of the three, and
invisible to every test: the built site renders with the anon key (2.7), every SELECT policy on
`locations` is `authenticated`-only, and PostgREST answers an unauthorised read with **zero rows and
no error**. So the resolver silently resolved every location binding to nothing. The restaurant's
name still appeared — it comes from the site context, not the binding — which is exactly what made
it look fine at a glance. Fixed in **2.12**. This is the failure 2.7's anon client was chosen to
catch, and it caught it: the page broke in development instead of leaking in production.

**2. Adding a Location & Hours section made the page unpublishable, with no way out.** Found by
hitting it: the review sheet blocked publishing on "not linked to a location", its **Fix** button
navigated to the field, and the field rendered explanatory prose and no control. Fixed in **2.13**.

**3. `sec_probe` is not debris that can be deleted** — see the correction in §5.

**Confirmed since:** the fix for (1) was applied and verified the same day (2.12a), and the live page
now carries the street, postal code, phone and every day's opening hours. The whole chain is verified
against staging.

**Two smaller things seen while walking, deliberately not fixed here:**

- The public `<title>` came out `Home 1786796238939 — DEXA POS`. Two separate problems: the page
  title debris (§5), and a built site inheriting the dashboard's `— DEXA POS` title template, which
  is the wrong brand on a restaurant's own website. The latter belongs with the rest of the SEO
  surface in 2.9.
- The toolbar says "Live" whenever the site has an address, without consulting `render_mode`. Only
  wrong for pre-W2.5 rows that were published before the flip existed; any publish from here on
  makes it true. Not worth a database read on every editor load.

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

- [x] **The `sec_probe` section is repaired — and this entry's premise was wrong.** It described
      dropping the section. That is impossible and would have been wrong: `sec_probe` is `kind:
      "hero"`, and hero is a non-deletable required singleton, so it *is* the page's hero and the
      tenancy script had overwritten its heading rather than adding a section. Its position ahead
      of the header is legal too — both share the masthead zone. Repaired the way a merchant would:
      the heading was retyped in the editor and published (version 3). Worth keeping as a lesson —
      the entry was written from a section id and a title, without checking the kind against the
      registry.
- [x] **The page title `Home 1786796238939` is fixed**, through the page list W3.1 built rather than
      by hand — which is the better outcome, since it means the repair was a merchant-reachable
      action rather than a database write. Staging's home page is titled `Home` again, and no
      untracked debris remains on that site.
- [ ] **`tsconfig.json` has `"jsx": "react-jsx"`** and is committed that way. A prior note records
      that it must stay `"preserve"` for Next.js and that a stray full-project `tsc` run is what
      changes it. Unrelated to this plan and not touched here, but worth confirming deliberately.

## 6. Documentation to correct alongside the work

- [ ] [README.md](README.md) — replace the progress table with §3 of the gap audit. The Stage 2 "migration NOT applied" banner and the "edits are lost on refresh" note are both false now.
- [ ] [README.md](README.md) — the "See it working now" block recommends `/dashboard/website/preview` as a fixture demo; after W0.4 it is no longer fixture-driven.
- [ ] [PLAN-04](PLAN-04-INFRA-PUBLISH-ROUTING.md) §2 — record the §0.1 decision and the `(host, path)` signature change; the current text predates the 2026-08-15 site-granularity supersession.
- [ ] [PLAN-00-GENERAL.md](PLAN-00-GENERAL.md) §5 — items 21–24 are still accurate; add the `render_mode` flip as an explicit item under Stage 5.
