# Infra Plan 04 — Publish, Routing, Caching & SEO

**Stages 5–6** · Est. 7–9 days · Depends on [PLAN-02](PLAN-02-INFRA-DATA-MODEL.md),
[PLAN-03](PLAN-03-INFRA-RESOLVER-RENDERER.md)
Parent: [PLAN-00-GENERAL.md](PLAN-00-GENERAL.md)

---

## 1. Goal

A merchant's built site is live at their real hostname, server-rendered and indexable. Publish creates a version;
rollback restores one; caches invalidate correctly; and every merchant still on a template storefront is completely
unaffected.

---

## 2. The routing fork — B3/D5, the thing that must exist before the first site goes live

Under **D1/D5** the builder and the four templates coexist. Both render into the same URL space —
[proxy.ts:113-142](../../../proxy.ts) resolves a subdomain or custom domain to `online_store_config.slug` →
`/sites/[slug]`. Once a location has **both**, something must choose.

**The rule, in one function, in one place:**

```ts
// lib/site-builder/resolve-render-mode.ts
export type RenderDecision =
  | { mode: "template"; templateId: string }
  | { mode: "builder"; siteId: string; pageId: string };

export async function resolveRenderMode(slug: string, path: string): Promise<RenderDecision | null>;
```

Decision logic, in order:

1. No `online_store_config` for the slug, or `is_active = false` → **404** (unchanged behavior)
2. No `merchant_sites` row, or `render_mode = 'template'` → **template**, `templateId` from `theme_config`
3. `render_mode = 'builder'` and a `site_pages` row matches `path` **with a non-null `published_version_id`** → **builder**
4. `render_mode = 'builder'` but the requested path has no published page → **404 within the built site** (a built
   404 page, not a fallback to the template — mixing the two on one site is worse than a clean 404)
5. `render_mode = 'builder'` but *nothing* is published → **template** (fail-safe: never take a working site down)

Rule 5 is the one that matters. `render_mode` flips to `'builder'` at the merchant's first successful publish, not
when they open the builder — so a merchant who experiments for a week and never publishes keeps their live template
site the entire time. Flipping the switch is a *consequence* of publishing, never a separate setting the merchant can
break their site with.

**Why one function:** it is unit-testable with a fixture per rule, it is the only place the fork exists, and when
someone later asks "why is this merchant seeing the old site" there is exactly one file to read.

### 2.1 Route structure

```
app/sites/[slug]/                     # existing template storefront — UNTOUCHED
app/sites/[slug]/(builder)/[[...path]]/page.tsx   # new built-site route
```

The existing `app/sites/[slug]/page.tsx` gains a single early branch: call `resolveRenderMode`, and on `builder`
delegate. Keep the diff to the existing storefront under ~15 lines. Any change larger than that is a signal the fork
is in the wrong place.

**Reserved paths.** `/checkout`, `/cart`, `/order`, `/t/[token]` (QR dine-in), `/track` already belong to
online-ordering. The built-site catch-all must not shadow them, and `site_pages.path` must reject them at creation
time with a clear message. Put the reserved list in `lib/site-builder/reserved-paths.ts` and enforce it in both
`CreatePage` and the route.

---

## 3. Publish

### 3.1 The action

```ts
// app/dashboard/website/actions/publish.ts
export async function PublishPage(clerkOrgId: string, pageId: string, label?: string)
```

Steps, in order:

1. **Authorize** — merchant lookup by `clerk_org_id`, then `website.edit` (**B10**)
2. **Load and normalize** the draft (`normalizePage`)
3. **Validate** (§3.2). Errors block; warnings inform
4. **Hash** the normalized content. If it equals the live version's `content_hash`, return "no changes" — do not
   create a duplicate version. This matters more than it sounds: autosave plus an eager publish button otherwise
   fills history with identical rows
5. **Insert** `site_page_versions` — `version_number = max + 1`, content, hash, `schema_version`, `label`,
   `published_by`
6. **Repoint** `site_pages.published_version_id`, `published_at`, `status = 'published'`; mark the prior version
   `superseded_at = now()`
7. **Flip** `merchant_sites.render_mode → 'builder'` if this is the first publish; set `first_published_at`
8. **Insert** a `site_publish_events` row (§4)
9. **Invalidate** caches (§5)
10. **Audit** — `LogAuditEvent({ actionCategory: "website", action: "published_page", … })`

Steps 5–8 in **one transaction** (an RPC, since the Supabase JS client cannot span statements transactionally).
A version row without a repointed page, or a repointed page with no version, are both corrupt states.

### 3.2 The publish validator

Runs against the normalized document plus a resolver dry-run.

| Check | Severity | Rationale |
|---|---|---|
| Required zones present (`header`, `footer`) | **error** | A page with no header is broken, not a style choice |
| Every section validates against its Zod schema | **error** | Should be impossible post-normalize; belt and braces |
| Path not reserved, unique within site | **error** | §2.1 |
| Bindings resolve — no `unavailable/deleted` | **warning** | D6 consequence 1. Warn with item names: *"3 items in 'Guest Favorites' no longer exist"* |
| SEO title present, ≤ 60 chars | **warning** | |
| SEO description present, 50–160 chars | **warning** | |
| Every image has alt text | **warning** | Accessibility + SEO |
| At least one section beyond header/footer | **error** | |
| Total page weight (images) under budget | **warning** | The mock shipped 3 MB PNGs; merchants will too |

Reuse the mock's `seoRating.ts` scoring engine here — it is 345 lines of real, pure logic and it is the one piece of
the mock worth lifting wholesale (ANALYSIS §5.1). Feed it the *published* content, per the ticket's Phase 4.

**Warnings must be dismissible, errors must not.** A merchant who deleted a menu item last month should still be able
to publish a typo fix.

### 3.3 Rollback

```ts
export async function RollbackPage(clerkOrgId: string, pageId: string, versionId: string)
```

Copies the target version's `content` into a **new** version row with `rolled_back_from_version_id` set, then
repoints. Append-only history (see [PLAN-02](PLAN-02-INFRA-DATA-MODEL.md) §3.3).

**The UI copy is part of this deliverable, not a polish item.** D6 consequence 3: merchants will assume rollback
restores prices. It does not — prices are never stored. The confirmation dialog must say so:

> **Restore version 7?**
> This restores the **layout and text** of your page as it was on 4 Aug.
> Menu items, prices, and availability always show your current data and are not affected.

### 3.4 Unpublish

`UnpublishPage` nulls `published_version_id`. If it was the last published page on the site, set `render_mode` back
to `'template'` — the merchant's storefront reappears rather than their domain 404ing. Requires a confirm dialog that
names what will happen.

---

## 4. `site_publish_events` — the ledger

```sql
CREATE TABLE public.site_publish_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.merchant_sites(id) ON DELETE CASCADE,
  page_id uuid REFERENCES public.site_pages(id) ON DELETE SET NULL,
  version_id uuid REFERENCES public.site_page_versions(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('publish','rollback','unpublish','domain_change','settings_change')),
  actor text,
  cache_invalidated_at timestamptz,
  cache_invalidation_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Two jobs. It is the answer to *"the merchant says they published but the site is old"* — you can see whether
invalidation ran and whether it errored. And it is the retry queue: a sweep can find rows with
`cache_invalidated_at IS NULL` older than a minute and re-fire.

---

## 5. Caching — resolving B6

**D6** constrains this: a page has a snapshotted shell and live fields, so the two get different cache lifetimes.
The existing `/sites/[slug]` is fully dynamic, which is the safe behavior to inherit — but "indexable and fast" is an
explicit acceptance criterion, and fully-dynamic-plus-menu-joins will not hit it.

> ⚠️ **Correction (2026-08-13) — this section is written against Next 15 APIs; the repo is on Next 16.2.12.**
> CLAUDE.md says 15. Worse, `revalidateTag` and `unstable_cache` are used **zero times** anywhere in this
> codebase — only `revalidatePath` — so there is no in-repo precedent to copy, and Next 16's idiom (`use cache`,
> `cacheTag`, `cacheLife`) differs from what is described below.
>
> **v1 answer: do not cache at all.** Render fully dynamically, exactly as `/sites/[slug]` already does today.
> That is the behaviour we inherit under D1, it is correct if slower, and it deletes this entire spike from the
> critical path. Revisit when TTFB or Core Web Vitals actually demand it — at which point the shell/bindings split
> below is still the right shape, just expressed in Next 16's API.
>
> **Two-layer model** *(deferred, not v1)***:**

| Layer | Contains | Strategy | Invalidated by |
|---|---|---|---|
| **Shell** | Published `PageDocument`, site theme, nav, SEO | `unstable_cache`, tag `site-page:{pageId}`, long TTL | Publish / rollback / settings change |
| **Bindings** | Menu item names, prices, images, availability | `unstable_cache`, tag `menu:{locationId}`, `revalidate: 60` (availability shorter — [PLAN-03](PLAN-03-INFRA-RESOLVER-RENDERER.md) §2.4) | Menu mutations, snooze/86 |

Tags to define once in `lib/site-builder/cache-tags.ts`:

```ts
export const siteTag     = (siteId: string) => `site:${siteId}`;
export const sitePageTag = (pageId: string) => `site-page:${pageId}`;
export const menuTag     = (locationId: string) => `menu:${locationId}`;
export const hostTag     = (host: string) => `site-host:${host}`;
```

**Publish fires:** `revalidateTag(sitePageTag(pageId))`, `revalidateTag(siteTag(siteId))`,
and `revalidatePath('/sites/[slug]', 'layout')` for the host resolution.

**The part that is easy to forget:** menu mutations must fire `revalidateTag(menuTag(locationId))`. That means
touching existing menu/snooze actions in `app/dashboard/actions/`. Without it, the 60 s TTL is the only thing making
prices fresh, which is *acceptable* but not *correct*. Do it — it is a one-line addition to each mutation, and it is
what makes "86 an item and it disappears" instant rather than eventually.

**Do not use full-route ISR (`export const revalidate`) for built pages.** Route-level ISR caches the *rendered
output* including live prices, which defeats D6. Cache the inputs, render on request. If TTFB later demands it, the
shell/bindings split is exactly what makes a partial-prerender approach possible.

---

## 6. SEO & indexability

The acceptance criterion is *"publicly reachable, server-rendered, and indexable."* Concretely:

### 6.1 Metadata

```tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const decision = await resolveRenderMode(slug, path);
  // title/description/og from page seo, falling back to site_seo, falling back to online_store_config
}
```

Three-level fallback chain: **page → site → `online_store_config`**. A merchant who never touches SEO still gets
their store name and description, because those already exist.

`robots: { index: !page.seo.noindex && site.is_active }` — an inactive store must never be indexed.

### 6.2 Structured data

JSON-LD `Restaurant` on the home page, built from data the platform already owns — name, address, `geo` (locations
carries `latitude`/`longitude`), `telephone`, `openingHoursSpecification` from `business_hours`, `servesCuisine`,
`priceRange`, `acceptsReservations`, and a `hasMenu` link. Plus `Menu` / `MenuItem` on menu pages and `BreadcrumbList`
on sub-pages.

This is a genuine differentiator and it costs almost nothing, because **the data is already structured** — a
generic website builder has to ask the merchant to type their hours into a form; here they come from the POS. See
[VISION-UNBOUNDED.md](VISION-UNBOUNDED.md) §2.

### 6.3 Sitemap & robots

```
app/sites/[slug]/sitemap.ts     # published pages only, lastModified = version published_at
app/sites/[slug]/robots.ts      # allow if active + published; disallow reserved paths; link sitemap
```

Both must be host-aware — a custom domain's sitemap must list custom-domain URLs, not `*.dexaposai.com` ones, or
Google sees duplicate content across two hostnames.

### 6.4 Canonicals and the duplicate-host problem

A built site is reachable at up to three hostnames: `slug.dexaposai.com`, `customdomain.com`, and
`dexaposai.com/sites/slug`. **Pick one canonical per site** — the custom domain if present, else the subdomain — and
emit `<link rel="canonical">` on every page. Additionally, 301 the `/sites/[slug]` path form to the canonical host in
production. Without this, SEO — the entire point of the feature per
[RESEARCH-OWNER-COM.md](RESEARCH-OWNER-COM.md) — is undermined by the platform's own routing.

---

## 7. Files

```
lib/site-builder/
├── resolve-render-mode.ts
├── reserved-paths.ts
├── cache-tags.ts
├── publish/validate.ts
└── seo/{metadata.ts,structured-data.ts}
app/dashboard/website/actions/publish.ts
app/sites/[slug]/(builder)/[[...path]]/page.tsx
app/sites/[slug]/sitemap.ts
app/sites/[slug]/robots.ts
supabase/migrations/…_site_publish_events.sql
supabase/migrations/…_publish_page_rpc.sql
```

---

## 8. Verification

- [ ] Publish → new version row, `published_version_id` repointed, prior version `superseded_at` set — one transaction
- [ ] Publishing unchanged content twice creates **one** version, not two
- [ ] Rollback creates a new version with `rolled_back_from_version_id`; the old row is untouched
- [ ] `curl` the live URL with no JS: full HTML, correct `<title>`, `<meta name="description">`, JSON-LD present
- [ ] Publish → `curl` within 5 s shows the new content (invalidation works)
- [ ] Price change in dashboard → live page updates within 60 s **without** publishing
- [ ] 86 an item → live page updates within its TTL **without** publishing
- [ ] A template-mode merchant's storefront is byte-identical before and after the feature ships — diff the HTML
- [ ] First publish flips `render_mode`; unpublishing the last page flips it back and the template returns
- [ ] Unknown path on a builder site → built 404, not a template page, not a crash
- [ ] `/sites/[slug]/checkout` still reaches online-ordering checkout, not the catch-all
- [ ] Sitemap on a custom domain lists custom-domain URLs; canonical matches
- [ ] `resolve-render-mode.test.ts` covers all five rules

## 9. Open questions

1. **Scheduled publishing** — "go live Monday 6am". Not v1, but `site_page_versions` already supports it: add
   `scheduled_for` and a cron. Leave room.
2. **Publish the whole site or one page?** Recommend **per page** as the primitive with a "Publish all changes"
   convenience action, so a merchant editing three pages does not half-publish.
3. **Preview links for stakeholders** — a signed, expiring token URL that renders a draft. Cheap, and merchants ask
   for it constantly ("let me show my partner"). Consider for Stage 6.
4. **Does HQ need force-unpublish?** Almost certainly yes, for abuse or a broken migration. One action, HQ-gated, with
   a required reason logged to `site_publish_events`.
