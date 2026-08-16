# Website Builder — Gap Closure Plan

**Date:** 2026-08-16 · **Owner:** Ali Awdi ·
**Status:** W0 and W1 complete (2026-08-16) · §0 still needs sign-off before W2 starts
**Source:** [GAPS-2026-08-16-WEBSITE-FEATURE-AUDIT.md](GAPS-2026-08-16-WEBSITE-FEATURE-AUDIT.md)
**Companions:** [PLAN-00-GENERAL.md](PLAN-00-GENERAL.md) (stage map) ·
[PLAN-04](PLAN-04-INFRA-PUBLISH-ROUTING.md) (routing/publish) ·
[PLAN-05](PLAN-05-INFRA-ASSETS-DOMAINS-FORMS.md) (assets)

This plan turns the gap audit into ordered, checkable work. It was written after re-reading the
code, and it **adds two blockers the audit did not find**. Both sit in front of the audit's
"Tier 1 — publishing does not reach the public", and neither is closed by writing the route.

---

## 0. Decide these before writing any Stage 6 code

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

- [ ] **Ratify option A in writing** and record it in PLAN-04 §2, superseding the `(slug, path)` signature with `(host, path)`.

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

- [ ] **Ratify the service-role read path**, or reject it in favour of an anon policy, in writing.

---

## 1. Work order

Six waves. Each item is roughly one PR. Estimates assume one developer.

### W0 — Stop telling merchants things that are not true ✅ **done 2026-08-16**

Everything here is copy or a one-line gate. It was first because it was the only work that was
*actively misleading*, and none of it depended on anything else.

A single constant, [`lib/site-builder/public-site.ts`](../../../lib/site-builder/public-site.ts)
`BUILT_SITE_IS_PUBLIC`, now carries the fact that publishing does not reach visitors. Every surface
reads it, so W2.4 flips one boolean instead of hunting for copy. It is annotated `boolean` rather
than inferred `false` so the not-yet-reachable branches do not read as dead code.

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

Gated on §0.1 and §0.3 being ratified.

- [ ] **2.1 — Migration: `merchant_sites.subdomain`** — nullable, `UNIQUE`, format-checked, rejecting the reserved host list. Backfill nothing; a site without a subdomain simply has no brand address yet.
- [ ] **2.2 — `lib/site-builder/resolve-render-mode.ts`** — the fork, all five PLAN-04 rules, signature updated to `(host, path)` per §0.1. Unit tests with a fixture per rule, including rule 5 (nothing published → template; never take a working site down).
- [ ] **2.3 — `lib/site-builder/public-read.ts`** — the service-role read path from §0.3. Never projects `draft_content`. Tested for the "unpublished page is unreachable" case.
- [ ] **2.4 — The route** — `app/sites/[slug]/(builder)/[[...path]]/page.tsx`, plus a branch in the existing storefront page kept under ~15 lines. Reserved paths already enforced by [reserved-paths.ts](../../../lib/site-builder/reserved-paths.ts); assert the catch-all cannot shadow `/checkout`, `/cart`, `/order`, `/t/[token]`, `/track`. Extend `proxy.ts` to resolve a brand subdomain before falling back to `online_store_config.slug`.
- [ ] **2.5 — Flip `render_mode` on first publish** (§0.2). In `PublishPage`, alongside `stampSitePublishTimes`. Add `UnpublishPage`, which nulls `published_version_id` and flips `render_mode` back to `'template'` when it was the last published page — so a merchant can always get their working storefront back.
- [ ] **2.6 — Render the nav.** [site-context.ts:206](../../../lib/site-builder/site-context.ts#L206) hardcodes `nav: []`, and `HeaderSection` renders its `<nav>` only when non-empty, so a multi-page site has no navigation. `merchant_sites.nav` exists and is never read — read it into `buildRenderContext`. The editing UI is W3.3.
- [ ] **2.7 — Honour `site_pages.location_id`.** `renderCanvas(doc, locationId)` and `buildRenderContext(site, mode)` both take the *storefront's* location, never the page row's. Consequence: a brand page (`location_id = NULL`) renders as if scoped to one branch, so `canShowPrices()` ([render-context.ts:181](../../../lib/site-builder/render-context.ts#L181)) can never return `false` and the "no prices until the visitor picks a location" rule is silently defeated. Thread the page's own `location_id` through, and build the location picker a brand page needs.
- [ ] **2.8 — Cache invalidation.** No `revalidatePath` or `revalidateTag` exists anywhere under `app/dashboard/website/`. Latent today, immediate once 2.4 lands. Tag per page and per site; verify with a publish → `curl` loop, not by inspection.
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

## 3. Verification

Per stage, not at the end:

- `npm run test` green, and no **new** `npx tsc --noEmit` errors in the touched paths. Neither is a
  real gate on its own: builds set `ignoreBuildErrors` and `ignoreDuringBuilds`, the repo carries
  ~2,550 pre-existing type errors (mostly `date-fns` resolution noise), and 22 tests were already
  failing in `lib/menu`, `components/dashboard/menu`, and `tests/a11y`. Compare against that
  baseline rather than expecting zero.
- W1: `verify-site-tenancy.ts` all lanes PASS — ✅ 17/17, staging, 2026-08-16.
- W2: `curl` a published page with JS disabled and get complete HTML; change a price in the POS and
  see it on the next request with no republish; confirm a template-only location's HTML is
  unchanged before and after.
- W2.5: publish → `render_mode = 'builder'`; unpublish the last page → back to `'template'` and the
  template storefront returns.
- W3/W4: exercised in the browser against a real draft, not a fixture.

## 4. Outstanding — needs a decision

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

## 5. Documentation to correct alongside the work

- [ ] [README.md](README.md) — replace the progress table with §3 of the gap audit. The Stage 2 "migration NOT applied" banner and the "edits are lost on refresh" note are both false now.
- [ ] [README.md](README.md) — the "See it working now" block recommends `/dashboard/website/preview` as a fixture demo; after W0.4 it is no longer fixture-driven.
- [ ] [PLAN-04](PLAN-04-INFRA-PUBLISH-ROUTING.md) §2 — record the §0.1 decision and the `(host, path)` signature change; the current text predates the 2026-08-15 site-granularity supersession.
- [ ] [PLAN-00-GENERAL.md](PLAN-00-GENERAL.md) §5 — items 21–24 are still accurate; add the `render_mode` flip as an explicit item under Stage 5.
