# Infra Plan 02 — Tenancy, Schema & Persistence

**Stage 2** · 🟡 **CODE-COMPLETE 2026-08-13 — MIGRATION NOT APPLIED** · Depends on [PLAN-01](PLAN-01-INFRA-SECTION-CONTRACT.md)
Parent: [PLAN-00-GENERAL.md](PLAN-00-GENERAL.md)

> ### Status
>
> **Written and statically verified. Never executed against a database.**
>
> | Artifact | State |
> |---|---|
> | [supabase/migrations/20260813120000_website_builder_foundation.sql](../../../supabase/migrations/20260813120000_website_builder_foundation.sql) | ⚠️ **Not applied anywhere.** Never run — no Docker, no local Postgres, and the Supabase MCP is disconnected |
> | [lib/site-builder/db-types.ts](../../../lib/site-builder/db-types.ts) | ✅ Hand-written row shapes |
> | [lib/site-builder/reserved-paths.ts](../../../lib/site-builder/reserved-paths.ts) | ✅ + 36 tests |
> | [app/dashboard/website/actions/](../../../app/dashboard/website/actions/) | ✅ `site.ts`, `pages.ts`, `draft.ts` — typecheck clean |
> | [scripts/verify-site-tenancy.ts](../../../scripts/verify-site-tenancy.ts) | ⚠️ Written, **never run** — needs the migration applied |
>
> **91 vitest tests pass, strict typecheck clean, lint clean** — but every one of those covers pure logic. No SQL
> in this stage has been executed, so treat the DDL, the triggers, and the RLS policies as *unverified*. The
> definition of done in §9 is not met until `verify-site-tenancy.ts` runs green on staging.
>
> **`database.types.ts` was not regenerated** (it is generated from a live database). It did not block anything:
> `createServerSupabaseClient()` is constructed without a `Database` generic, so queries are untyped at the client
> and `db-types.ts` re-introduces the types at the boundary. Regenerating later is additive.
>
> #### A real defect the tests caught
>
> The `site_pages_path_format` CHECK in the first draft of this migration —
> `^[a-z0-9]*(?:-[a-z0-9]+)*…` — **accepted a leading hyphen**, so `-lead` was a legal page path. The leading
> `[a-z0-9]*` matches empty, letting `(?:-[a-z0-9]+)*` consume the whole string. Caught only because
> `reserved-paths.test.ts` asserts the TypeScript regex and the SQL CHECK agree. Both now require every segment to
> start and end with an alphanumeric. **Keep that test** — it is the only thing tying the two copies together.
>
> #### Deviations from the plan below
>
> | Planned | Built | Why |
> |---|---|---|
> | `website.edit` permission code (**B10**) | `is_merchant_admin` only | Simplest option; it already folds in `is_dexapos_admin()`, so HQ support access comes free. Widening the three policies later is a one-line change per policy |
> | Anon read policy for published versions (§6.2) | **Omitted** | A policy's `EXISTS` subquery is itself subject to RLS on the tables it joins, so an anon policy here would silently return nothing. Stage 4 adds a `SECURITY DEFINER` read function instead — the right shape, and pointless to build before a renderer consumes it |
> | `site_publish_events`, `site_assets`, `site_domains` | Deferred | Stages 5 and 7 |
>
> #### Added beyond the plan
>
> - **`site_page_versions_block_mutation` trigger.** §3.3 says versions are append-only; a comment does not enforce
>   that. The trigger rejects any UPDATE that touches `content`, `content_hash`, `version_number`, `page_id` or
>   `merchant_id`, while still allowing publish/rollback to stamp `superseded_at`.
> - **`site_pages_bump_revision` trigger.** Autosave concurrency (§5) depends on `revision` advancing. Doing it in a
>   trigger rather than in the action means it holds for every writer, including SQL run by hand. It bumps only when
>   `draft_content` actually changes, so renaming a page does not invalidate an open editor.
> - **The `online_store_config` unique constraint is guarded.** §4.1 assumes it can just be added. Production has not
>   been checked for duplicate `(merchant_id, location_id)` pairs and a hard failure would block the whole migration,
>   so it is wrapped in a `DO` block that adds the constraint when clean and `RAISE WARNING`s otherwise.
>   `merchant_sites.store_config_id UNIQUE` protects the builder either way.

---

## 1. Goal

Two merchants can save and load draft pages. Merchant A's server action cannot read or write merchant B's data, and
that is proven by a script that expects a denial — not by reading policy SQL and believing it.

---

## 2. The central schema decision — document, not rows

The ticket says *"sections as ordered JSONB rows."* **Recommend against.** One JSONB **document per page**, plus an
immutable version table.

| | One row per section | **One document per page** ✅ |
|---|---|---|
| Publish | Snapshot N rows transactionally; partial publish is representable (bad) | One row copy. Atomic by construction |
| Version history | A version is a set of N rows; storage grows N× per publish | A version *is* a row |
| Rollback | Delete-and-reinsert N rows | Repoint one FK |
| Render read | Ordered fetch + assembly | One `select` |
| Reorder | Rewrite `display_order` on N rows, needs gap management | Array splice |
| Autosave write cost | One small row | Whole doc (~5–50 KB) — irrelevant at this size |
| Concurrent editors | Row-level merge possible | Needs optimistic concurrency (§5) |
| Query "which sites use item X" | SQL `WHERE` | JSONB GIN index (§4.3) — solved, see below |

The row-per-section model's only real advantage is per-section SQL querying, and a GIN index over the document
recovers that. Everything else favors the document — and atomicity is precisely what makes "publish" and "rollback"
mean something. This is also the shape the existing marketing CMS uses (`page_content.sections` JSONB), which is
working evidence rather than theory.

`online_store_pages` (ANALYSIS §3.4) is the row-per-section model, half-built and unread. **Retire it** rather than
extend it — see [PLAN-00](PLAN-00-GENERAL.md) §4.2.

---

## 3. Tables

### 3.1 `merchant_sites` — one per storefront, per **D4**

Hangs off `online_store_config`, inheriting slug, custom domain, `is_active`, brand colors, SEO, and GA for free.

```sql
CREATE TABLE public.merchant_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  -- D4: one site per storefront. UNIQUE enforces it at the DB, not by convention.
  store_config_id uuid NOT NULL UNIQUE
    REFERENCES public.online_store_config(id) ON DELETE CASCADE,

  -- B3/D5 routing fork. 'template' = existing 4 templates serve. 'builder' = built site serves.
  render_mode text NOT NULL DEFAULT 'template'
    CHECK (render_mode IN ('template', 'builder')),

  -- Site-wide content that must NOT live on a page (see PLAN-01 §7)
  nav          jsonb NOT NULL DEFAULT '{"items":[]}'::jsonb,
  theme        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- design tokens; overlays online_store_config colors
  site_seo     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- defaults inherited by pages
  integrations jsonb NOT NULL DEFAULT '{}'::jsonb,   -- GA4/GTM/Pixel overrides

  schema_version integer NOT NULL DEFAULT 1,

  -- B9 quotas. Present from day one even while unlimited; adding limits later is a customer conversation.
  max_pages          integer,      -- NULL = unlimited
  max_asset_bytes    bigint,
  custom_domain_allowed boolean NOT NULL DEFAULT false,

  first_published_at timestamptz,
  last_published_at  timestamptz,
  created_by text,                 -- clerk user id
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_merchant_sites_merchant ON public.merchant_sites(merchant_id);
CREATE INDEX idx_merchant_sites_location ON public.merchant_sites(location_id);
```

`merchant_id` and `location_id` are denormalized from `online_store_config` deliberately: **RLS policies must not
join**, or every public read pays for the join and every policy becomes harder to reason about. Keep them consistent
with a trigger (§4.4).

### 3.2 `site_pages` — the draft

```sql
CREATE TABLE public.site_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.merchant_sites(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,  -- denormalized for RLS

  -- '' is the home page. Not NULL, so the unique index actually constrains it.
  path text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT 'Home',

  is_home boolean NOT NULL DEFAULT false,
  status  text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),

  -- The working copy. PLAN-01 PageDocument.
  draft_content jsonb NOT NULL DEFAULT '{"schemaVersion":1,"sections":[],"seo":{},"settings":{}}'::jsonb,

  -- Optimistic concurrency for autosave (§5). Bumped by trigger on every draft_content write.
  revision integer NOT NULL DEFAULT 0,

  published_version_id uuid REFERENCES public.site_page_versions(id) ON DELETE SET NULL,
  published_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT site_pages_path_format CHECK (path ~ '^[a-z0-9]*(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*$')
);

CREATE UNIQUE INDEX uq_site_pages_site_path ON public.site_pages(site_id, path);
CREATE UNIQUE INDEX uq_site_pages_one_home  ON public.site_pages(site_id) WHERE is_home;
CREATE INDEX idx_site_pages_merchant ON public.site_pages(merchant_id);
```

The FK to `site_page_versions` is circular with §3.3 — create both tables, then `ALTER TABLE … ADD CONSTRAINT`.

### 3.3 `site_page_versions` — immutable history

```sql
CREATE TABLE public.site_page_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.site_pages(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.merchant_sites(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,

  version_number integer NOT NULL,          -- monotonic per page
  content jsonb NOT NULL,                   -- frozen PageDocument
  content_hash text NOT NULL,               -- sha256; skip no-op publishes
  schema_version integer NOT NULL,

  label text,                               -- merchant-supplied "Summer menu launch"
  published_by text,                        -- clerk user id
  published_at timestamptz NOT NULL DEFAULT now(),

  -- Set when this version stops being live. NULL = currently live (or never was).
  superseded_at timestamptz,
  /* Provenance: a rollback creates a NEW version whose content is copied from an old one.
     History stays append-only and the timeline stays truthful. */
  rolled_back_from_version_id uuid REFERENCES public.site_page_versions(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX uq_site_page_versions_number ON public.site_page_versions(page_id, version_number);
CREATE INDEX idx_site_page_versions_page ON public.site_page_versions(page_id, published_at DESC);
```

**Rollback creates a new version.** It never deletes or reactivates an old row. History is append-only, which means
"what was live on the 3rd?" is always answerable and an audit log entry always has a row to point at.

### 3.4 Supporting tables

Full DDL belongs with its own plan; the shapes are fixed here so the migration is one file.

| Table | Purpose | Plan |
|---|---|---|
| `site_assets` | Per-merchant asset registry, byte accounting for quota, alt text, variant URLs | [05](PLAN-05-INFRA-ASSETS-DOMAINS-FORMS.md) §2 |
| `site_forms` | Form definitions (fields, recipients, notification prefs) | [05](PLAN-05-INFRA-ASSETS-DOMAINS-FORMS.md) §4 |
| `site_form_submissions` | Captured submissions + delivery state | [05](PLAN-05-INFRA-ASSETS-DOMAINS-FORMS.md) §4 |
| `site_domains` | Custom-domain verification + TLS state machine (**B8**) | [05](PLAN-05-INFRA-ASSETS-DOMAINS-FORMS.md) §3 |
| `site_publish_events` | Publish/rollback ledger; drives cache invalidation + audit | [04](PLAN-04-INFRA-PUBLISH-ROUTING.md) §4 |

---

## 4. Constraints, triggers, indexes

### 4.1 Prerequisite fix on `online_store_config`

**D4** assumes one store per location. It is not enforced ([041_online_store_config.sql:205-208](../../../utils/migrations/041_online_store_config.sql)).
`merchant_sites.store_config_id UNIQUE` makes the builder safe regardless, but fix the root:

```sql
-- Run the duplicate check on production FIRST. Do not apply blind.
--   SELECT merchant_id, location_id, count(*) FROM public.online_store_config
--   GROUP BY 1,2 HAVING count(*) > 1;
ALTER TABLE public.online_store_config
  ADD CONSTRAINT uq_online_store_config_merchant_location UNIQUE (merchant_id, location_id);
```

### 4.2 `updated_at`

Use the existing `update_updated_at_column()` trigger function on `merchant_sites` and `site_pages` — the tablet's
delta sync depends on this convention (CLAUDE.md, "Offline-Ready Design"). `site_page_versions` is immutable and gets
no trigger.

### 4.3 The GIN index that recovers row-per-section querying

The one thing the document model gives up is "which pages reference menu item X" — needed by the builder's
broken-binding warning and by a future "you deleted an item that 3 pages use" guard.

```sql
CREATE INDEX idx_site_pages_draft_content_gin
  ON public.site_pages USING gin (draft_content jsonb_path_ops);
```

Query with a containment predicate so the index is used:

```sql
SELECT id, title FROM public.site_pages
WHERE merchant_id = $1
  AND draft_content @> jsonb_build_object(
        'sections', jsonb_build_array(
          jsonb_build_object('props', jsonb_build_object(
            'items', jsonb_build_array(jsonb_build_object('id', $2))))));
```

If that proves awkward in practice, the fallback is a materialized `site_page_bindings(page_id, binding_type,
binding_id)` table maintained by a trigger on `draft_content`. **Do not build it up front** — add it when a real
query needs it.

### 4.4 Tenancy consistency trigger

Denormalized `merchant_id` must never drift. A `BEFORE INSERT OR UPDATE` trigger derives `merchant_id`/`site_id` from
the parent rather than trusting the client:

```sql
CREATE OR REPLACE FUNCTION public.site_pages_derive_tenancy() RETURNS trigger AS $$
BEGIN
  SELECT s.merchant_id INTO NEW.merchant_id FROM public.merchant_sites s WHERE s.id = NEW.site_id;
  IF NEW.merchant_id IS NULL THEN RAISE EXCEPTION 'site_pages.site_id % has no site', NEW.site_id; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
```

This is worth more than it looks: it means a compromised or buggy client **cannot** write a row into another
merchant's tenancy even if RLS were misconfigured. Defense in depth.

---

## 5. Autosave & optimistic concurrency

Autosave plus two open browser tabs is a lost-update bug waiting to happen. The document model needs an explicit
answer.

**Mechanism:** the client sends the `revision` it loaded. The server updates only if it still matches.

```sql
UPDATE public.site_pages
   SET draft_content = $content, revision = revision + 1, updated_at = now()
 WHERE id = $page_id AND revision = $expected_revision
RETURNING revision;
```

Zero rows back → someone else saved first. The action returns `{ error: 'stale', currentRevision, currentContent }`
and the builder shows *"This page was changed in another window"* with reload / overwrite. Never silently clobber;
never silently merge.

**Autosave policy:**
- Debounce 1.5 s after the last edit, hard flush every 20 s and on blur/unload
- The document is the unit; no partial-section patches in v1
- Keep `localStorage` as an **offline draft cache** keyed by `pageId + revision` — restore-on-reconnect only, never
  the source of truth (the mock's fatal flaw: `localStorage` *was* the database)

---

## 6. RLS

All five helper functions referenced by CLAUDE.md are confirmed present
(`supabase/migrations/20260413215901_remote_schema.sql`). Use them; do not write bespoke tenancy SQL.

### 6.1 Merchant write access

```sql
ALTER TABLE public.merchant_sites      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_pages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_page_versions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY site_pages_merchant_rw ON public.site_pages
  FOR ALL TO authenticated
  USING (
    public.is_merchant_admin(merchant_id)
    OR public.user_has_location_permission(
         (SELECT location_id FROM public.merchant_sites WHERE id = site_id), 'website.edit')
  )
  WITH CHECK (
    public.is_merchant_admin(merchant_id)
    OR public.user_has_location_permission(
         (SELECT location_id FROM public.merchant_sites WHERE id = site_id), 'website.edit')
  );
```

**`WITH CHECK` is not optional.** `USING` alone lets a caller *move* a row into another tenant. This is the most
common RLS mistake and it is exactly the "zero data bleed" acceptance criterion.

### 6.2 Public read of published content

The public renderer should **not** need service-role. Grant anon a narrow read of published versions only:

```sql
CREATE POLICY site_page_versions_public_read ON public.site_page_versions
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.site_pages p
        JOIN public.merchant_sites s ON s.id = p.site_id
        JOIN public.online_store_config c ON c.id = s.store_config_id
       WHERE p.published_version_id = site_page_versions.id
         AND s.render_mode = 'builder'
         AND c.is_active
    )
  );
```

Anon can read a page's content **only** when it is the currently-live version of an active, builder-mode site. Draft
content is never anon-readable. This is a meaningful improvement on `getStorefrontData()`, which uses service-role
and filters in application code — a pattern where one forgotten `.eq()` leaks everything.

### 6.3 HQ access

Follow the existing impersonation model rather than inventing an HQ bypass; HQ support needs read access to diagnose
"my site looks wrong" tickets. Mirror the grant rules already used for merchant impersonation.

### 6.4 The isolation test — Stage 2's definition of done

`scripts/verify-site-tenancy.ts`: authenticate as merchant A, attempt six operations against merchant B's site and
page (select draft, update draft, insert page, update `site_id` to B's, select B's unpublished version, delete B's
page). **All six must fail.** Then repeat as anon. Commit the script; it is the artifact that proves the acceptance
criterion, and it is the regression test for every future policy edit.

---

## 7. Server actions

Location: `app/dashboard/website/actions/`, following the repo's established pattern (CLAUDE.md — merchant lookup by
`clerk_org_id`, operation, `LogAuditEvent`, `{ data?, error? }`).

| File | Exports |
|---|---|
| `site.ts` | `GetOrCreateSite(clerkOrgId, locationId)`, `UpdateSiteSettings`, `UpdateSiteNav`, `UpdateSiteTheme` |
| `pages.ts` | `ListPages`, `CreatePage`, `RenamePage`, `DeletePage`, `SetHomePage` |
| `draft.ts` | `LoadDraft(pageId)`, `SaveDraft(pageId, content, expectedRevision)` |
| `publish.ts` | [PLAN-04](PLAN-04-INFRA-PUBLISH-ROUTING.md) |

**Every action validates through `normalizePage` + the registry before writing.** The DB stores what the contract
says is valid, never raw client input — otherwise Stage 1's guarantees stop at the network boundary.

**Audit logging** — `LogAuditEvent` with `actionCategory: "website"`. Log page create/delete/rename, publish,
rollback, domain changes, and settings changes. Do **not** log every autosave; log a session-collapsed
`edited_page` at publish time with the version diff summary instead, or the audit table becomes noise.

---

## 8. Migration file

One file: `supabase/migrations/2026MMDDHHMMSS_website_builder_foundation.sql`, in this order:

1. `online_store_config` unique constraint (§4.1) — with the duplicate check documented in a comment
2. `merchant_sites`
3. `site_page_versions` (without the `site_pages` FK)
4. `site_pages`
5. `ALTER TABLE site_pages ADD CONSTRAINT … FOREIGN KEY (published_version_id)`
6. `ALTER TABLE site_page_versions ADD CONSTRAINT … FOREIGN KEY (page_id)`
7. Indexes incl. the GIN index
8. `updated_at` + tenancy triggers
9. `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL … FROM PUBLIC, anon, authenticated` + explicit `GRANT`s
10. Policies
11. `website.edit` permission seed row (**B10**)

Then regenerate `database.types.ts` and update `schema.sql`.

**Apply to staging (`dfwqakoyittmrwbqvxgw`) first.** Do not apply to prod until Stage 5 has run end-to-end on
staging — this is additive and low-risk, but §4.1's constraint can fail on real duplicate data and that is exactly
the kind of thing to discover on staging.

---

## 9. Verification checklist

- [ ] Migration applies cleanly to a fresh local Supabase and to staging
- [ ] `npx supabase db diff` is empty afterwards
- [ ] `scripts/verify-site-tenancy.ts` — all 12 cross-tenant attempts denied (6 as merchant A, 6 as anon)
- [ ] Anon **can** read a published version of an active builder-mode site
- [ ] Anon **cannot** read `draft_content`, or any version of an inactive or template-mode site
- [ ] Concurrent-save test: two clients at the same `revision`; second gets `stale`, no data lost
- [ ] `updated_at` moves on draft save; `site_page_versions` rows are never updated after insert
- [ ] Deleting a location cascades to site → pages → versions with no orphans
- [ ] `database.types.ts` regenerated; `npx tsc --noEmit` passes

## 10. Open questions

1. **Does a merchant with 5 locations edit 5 sites separately?** D4 says yes. Realistically they will want
   "copy this page to my other locations" almost immediately. It is not a schema change — a `CopyPageToSites` action
   over the same tables — but design the pages UI expecting it.
2. **Version retention.** Unbounded history on a busy merchant is unbounded storage. Suggest: keep all versions for
   90 days, then thin to one per day, always keeping the live one and any labeled one. Decide before prod, implement
   later.
3. **Should `merchant_sites.theme` supersede `online_store_config`'s colors, or merge?** Recommend merge with site
   theme winning, so a merchant who already themed their storefront does not start from grey.
4. **Soft delete for pages?** `status = 'archived'` covers it. Confirm no hard delete is exposed to merchants —
   deleting a page that has a published version breaks live URLs.
