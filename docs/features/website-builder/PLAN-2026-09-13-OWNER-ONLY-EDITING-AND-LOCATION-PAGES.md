# Owner-only website editing + per-location pages — 2026-09-13

## Why
Two owner expectations were unmet:
1. **"Only the store owner should change the store's website."** Every website table
   was `FOR ALL` to `is_merchant_admin()` — owner **+ admin + manager** could edit.
   (This was blocker **B10** in `20260813121000_website_builder_foundation.sql`,
   explicitly deferred: *"which role may edit … can be added later by widening
   these three policies."*)
2. **"Each location should have its own site, not one site any location changes."**
   Resolved to: **one brand domain, a page per location** (matches
   `makeitbutter.com/house-of-wings/south-orange`). The schema + public renderer
   already support this (`site_pages.location_id` drives which branch's
   menu/hours/prices render, reached by path); the dashboard just didn't let you
   *pick* a location for a page or *see* which location a page belonged to.

## Decisions
- Owner = Clerk role **exactly `merchant.owner`** (not admin, not manager).
- **Reads stay open** to `is_merchant_admin` (managers/admins can still *view* the
  Website section); only INSERT/UPDATE/DELETE are owner-only.
- **HQ super-admins + impersonation keep edit access** (via `is_dexapos_admin()`
  inside the new predicate — impersonation keeps the HQ org claim).
- Scope of owner-lock = website **content** tables only:
  `merchant_sites, site_pages, site_page_versions, site_forms, site_events, site_assets`.
  Deliberately **not** locked: `site_form_submissions` (public/staff inbox, lead PII)
  and the operational `reservation_settings / reservation_service_periods /
  reservation_blackouts` (floor operations — managers keep these). On the Website
  Reservations screen, only the website-level controls (enable feature, approval
  mode — they write `site_pages`/`merchant_sites`) are owner-gated; per-location
  accept/service-periods/blackouts stay manager-editable.

## What changed

### DB (migration `20260913120000_website_owner_only_editing.sql` + rollback)
- New `is_merchant_owner_strict(merchant_id)` — true only for `merchant.owner`
  (or `is_dexapos_admin()`).
- Split each content table's single `FOR ALL` policy into: `SELECT` (is_merchant_admin)
  + `INSERT/UPDATE/DELETE` (is_merchant_owner_strict). `site_page_versions` keeps
  SELECT/INSERT/UPDATE only (append-only).

### Server actions (defense-in-depth + clean errors)
- New `app/dashboard/website/actions/owner-guard.ts` → `assertMerchantOwner()`
  (delegates to the same RPC, so it can't drift from RLS; gives a clean
  `"Only the store owner can edit the website."` instead of a silent 0-row UPDATE).
- Called at the top of every write action in `pages.ts, site.ts, publish.ts,
  draft.ts, forms.ts, events.ts, assets.ts, reservations-page.ts`. Bootstrap/read
  paths (`GetOrCreateSite`, `EnsureNavSeeded`, all `List/Get/Load`) are left open.
- `ActionErrorCode` gains `"forbidden"`.

### Dashboard UI (read-only for non-owners)
- `app/dashboard/hooks/useMerchantRole.ts` → `useIsMerchantOwner(clerkOrgId)`;
  `lib/site-builder/owner.ts` → `isMerchantOwnerForOrg(orgId)` (server).
- `OwnerOnlyBanner` (in-place) + `OwnerOnlyPage` (full-page) notices.
- Pure-editing routes gated server-side → read-only notice: `style`, `settings`,
  `tracking`, `pages/new`, `forms/[formId]`, and the page editor `pages/[pageId]`.
- Content screens gated in-place (banner + mutating controls hidden, view kept):
  `PagesScreen` (New Page / Change Style / publish-unpublish-delete menu),
  `WebAddressCard` (Change/Claim), `FormsScreen` (New Form), `EventsScreen`
  (New/Edit/Remove), `ReservationsScreen` (enable + approval only).

### Per-location page UX (Phase 2)
- `NewPageOverlay` gains a **"This page is for"** selector (All locations / a branch),
  shown for multi-location merchants; wires the choice to `CreatePage`'s `locationId`
  and to the preview/template render location. Locations sourced from
  `online_store_config` (the set `resolvePricingLocation` accepts).
- Pages list (`pages/page.tsx` + `PagesScreen`) now selects `location_id` and shows
  a **Brand / <location>** badge per row (multi-location only).

## Follow-up (2026-09-13) — location-scope flow (branch `feat/website-location-scope-flow`)
The builder previously resolved location only from `?location=` and fell back to the
first storefront; it ignored the dashboard's location switcher and had no single/
global/location semantics. Now it follows the standard flow (chosen model:
**location-focused + picker on All**):
- `resolveWebsiteLocation(orgId, param)` in `site-context.ts`: `?location=` → the
  switcher's `x-location-id` cookie → single-location gate → else `pick` (returns
  the merchant's branches). Reuses the cached merchant/store-config reads.
- `WebsiteLocationPicker` (client): shown on **entry** routes (pages, events, forms,
  tracking, settings, reservations) when scope is `pick`; selecting a branch sets the
  switcher (store + cookie) and navigates with `?location=`. **Deep** routes (editor,
  new, style, forms/[formId]) `redirect('/dashboard/website/pages')` on `pick`.
- Pages list is filtered to **brand + the active branch** (`.or(location_id.is.null,
  location_id.eq.<active>)`); `NewPageOverlay` is a 2-way scope (This location — <name>
  / All locations) defaulting to the **active branch**.
- Owner gating is unchanged and still merchant-level (location-independent).
- Build-safe: `cookies()` lives in `site-context` (server-only); all importers are
  server components / `use server` actions, so nothing leaks into a client bundle.
- App-layer only — no migration. tsc clean; `vitest app/dashboard/website` 69/69.
  Browser E2E on staging (multi-location switch + picker) still pending.

## Verification
- **Applied to staging** (`dfwqakoyittmrwbqvxgw`) via MCP `apply_migration`.
- Policy wiring confirmed: every content table SELECT→admin, INSERT/UPDATE/DELETE→owner.
- Predicate (Joes Coffee Shop `2add44cb…`): owner→`true`, admin→`false`, HQ org→`true`.
- End-to-end RLS (rolled back, no data changed): **owner UPDATE = 11 rows**,
  **admin UPDATE = 0 rows**, **admin SELECT = 11 rows** (view preserved).
- `npx vitest run app/dashboard/website` → **69/69 pass** (fake supabase gained an
  `rpc()` returning owner-allowed; the three action test setups seed a `merchants`
  row so the guard's lookup resolves). Changed files type-check clean.

## Follow-ups
- Prod promotion is out-of-band (staging/prod migration-slot divergence, see project
  memory). Apply `20260913120000` under a free version on prod.
- Regenerate `database.types.ts` to include `is_merchant_owner_strict` (the guard
  currently casts the rpc name; additive, non-blocking).
- Pre-existing (unrelated) test failures on this branch: valor-vault, subscription-billing,
  storefront a11y, kds, orders, cascade-labels — from other uncommitted work, not this change.
