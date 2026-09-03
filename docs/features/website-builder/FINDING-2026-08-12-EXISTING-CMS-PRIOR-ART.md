# Finding — this repo already contains a working section-tree CMS

**Date:** 2026-08-12
**Status:** Verified by direct source read
**Impact:** Changes the Phase 1 / Phase 4 estimate materially. Supersedes the "🔴 New — the core of the ticket" row in
[ANALYSIS §4](ANALYSIS-2026-08-11-MOCKBUILDER-GAP.md).

---

## 1. Summary

[ANALYSIS §3](ANALYSIS-2026-08-11-MOCKBUILDER-GAP.md) concluded:

> **The MockBuilder website builder does not exist here.** … Nothing here renders an arbitrary section tree.
> No draft/live split anywhere.

That is true of `/sites/*` (the merchant storefront) and true of the *merchant-facing* product. It is **not** true
of the repo. A complete, production, section-tree CMS with a **server-side renderer** and a **draft/publish split**
ships here today and serves `dexaposai.com` itself.

It was missed because it lives under `app/(marketing)/` and `app/admin/` — nowhere near `/sites/` or `/dashboard/`,
and it never uses the words "website builder".

## 2. What exists, file by file

| File | LOC | What it is |
|---|---|---|
| [components/cms/SectionRenderer.tsx](../../../components/cms/SectionRenderer.tsx) | 1,739 | **Server component.** Takes `Section[]`, renders the page. No `"use client"`. |
| [components/cms/SectionEditor.tsx](../../../components/cms/SectionEditor.tsx) | 677 | Editor panel, driven by a field schema |
| [components/cms/InlineCmsPreview.tsx](../../../components/cms/InlineCmsPreview.tsx) | 408 | Click-to-edit overlay mounted **onto the server-rendered page** |
| [components/cms/TipTapEditor.tsx](../../../components/cms/TipTapEditor.tsx) | 132 | Rich-text field |
| [components/cms/CmsImageActions.tsx](../../../components/cms/CmsImageActions.tsx) | 132 | Image picking / replacement |
| [lib/cms/cms-sections.ts](../../../lib/cms/cms-sections.ts) | 371 | **The section contract.** 18-member `SectionType` union, `SECTION_META` field registry, `createSection`, `normalizeSection(s)`, `mergeCanonicalSections` |
| [lib/cms/get-cms-page.ts](../../../lib/cms/get-cms-page.ts) | 46 | `getCmsPage(route)` — reads `published = true`, React-`cache`d, falls back to canonical defaults |
| [lib/cms/sanitize.ts](../../../lib/cms/sanitize.ts) | 35 | `sanitizeHtml` / `sanitizeText` — allowlisted tags, safe URL schemes |
| [lib/cms/cms-auth.ts](../../../lib/cms/cms-auth.ts) | 26 | `requireHqUser()` — Clerk org gate + service-role client |
| [lib/cms/form-security.ts](../../../lib/cms/form-security.ts) | 179 | Contact-form spam / abuse handling |
| [lib/cms/default-page-content.ts](../../../lib/cms/default-page-content.ts) | 193 | Canonical starter content per route |
| [app/admin/pages/[route]/AdminPageEditorClient.tsx](../../../app/admin/pages/[route]/AdminPageEditorClient.tsx) | — | The editing surface |
| `app/api/cms/{pages,blocks,categories,images,upload}` | ~300 | REST layer incl. page duplication |

**Tables:** `page_content` (`route`, `title`, `description`, `sections` JSONB, `published`, `updated_at`),
`content_blocks`, `page_categories`.

**Consumers:** every marketing route — `/`, `/pricing`, `/features`, `/industries`, `/hardware`, `/demo`,
`/contact`, `/why`, and a catch-all `app/(marketing)/[...slug]/page.tsx`.

## 3. Why this matters — the three hardest unknowns are already solved once

### 3.1 B7 "renderers must be dual-use" — solved, and the technique is in-repo

[ANALYSIS §6.7](ANALYSIS-2026-08-11-MOCKBUILDER-GAP.md) calls dual-use renderers *"architectural, decide day one"*,
and F6 says Phase 4 is impossible until the mock's renderers are extracted from its 5,051-line `"use client"` module.

The CMS solved this with a pattern worth copying verbatim: **the renderer is server-only and stays server-only.**
Editability is layered on top as *data attributes* — `SectionRenderer` calls an `editAttrs(section, path, label, kind)`
helper that stamps `data-cms-*` onto rendered nodes, and `InlineCmsPreview` (a `"use client"` island, mounted in a
`<Suspense>`) reads those attributes to build the edit affordances.

There is no second renderer. There is no duplicated markup. The public page and the editable page are the **same
server render**, and the editor is a client overlay. That is exactly the property Phase 4 needs, and it is
demonstrably achievable in this codebase because it already runs in production.

### 3.2 A schema-driven section registry — the right shape, already proven

`SECTION_META: Record<SectionType, { label, icon, fields: SectionField[] }>` drives the editor UI generically:
add a field to the registry and the editor grows a control. `createSection(type)` produces defaults;
`normalizeSection` repairs malformed rows on read; `mergeCanonicalSections` reconciles saved content against
updated canonical defaults — which is a **forward-migration strategy for stored JSONB**, the thing that usually
gets invented too late.

The builder should generalize this registry rather than invent one. See
[PLAN-01-INFRA-SECTION-CONTRACT.md](PLAN-01-INFRA-SECTION-CONTRACT.md).

### 3.3 Draft/publish, stored-XSS defense, and asset upload

- `published` boolean + "read latest published row" is a working, if minimal, publish split.
- `sanitize.ts` is a real answer to the stored-XSS problem that **any** merchant-authored HTML creates. Merchant
  content is lower-trust than HQ content, so the builder needs this *more* than the CMS does.
- `app/api/cms/upload` + [lib/cdn/server.ts](../../../lib/cdn/server.ts) already do validated upload → CDN URL.

## 4. What the CMS does **not** give you

Being precise, so nobody over-claims from this finding:

| Missing | Consequence for the builder |
|---|---|
| **No tenancy.** `page_content` has no `merchant_id`; reads use the anon key against a global `route` key | The multi-tenant table is genuinely new work |
| **No version history / rollback.** `published` is one boolean; the previous content is gone | Version table is genuinely new work |
| **No drag-and-drop.** The editor is a form + reorder list | The canvas is genuinely new work |
| **No live-data bindings.** Every field is a literal; nothing resolves a `menu_item` at render | The resolver layer (D6) is genuinely new work |
| **No multi-page-per-tenant model.** Pages are global routes | New |
| **HQ-only auth.** `requireHqUser` is an org-equality check, then service-role — RLS is bypassed entirely | Merchant content **must** be RLS-enforced; do not copy this gate |
| Section types are marketing-shaped (`pricing_calculator`, `demo_frame`, `compare_strip`) | Different union, same mechanism |

## 5. Recommendation — reuse the patterns, not the tables

**Do not** retro-fit `merchant_id` onto `page_content`. It is a live, anon-readable, single-tenant table serving the
company's own marketing site; adding tenancy to it puts merchant data and corporate content in one blast radius for
no benefit.

**Do** lift these five things into `lib/site-builder/`:

1. The **server-renderer + client-overlay** split (§3.1) — this is the single most valuable takeaway
2. The **registry-driven section contract** (§3.2), upgraded to a discriminated union + Zod (fixes ANALYSIS F1)
3. `sanitizeHtml` / `sanitizeText` — import directly from `lib/cms/sanitize.ts`, do not fork
4. `normalizeSection` + `mergeCanonicalSections` as the stored-JSONB forward-migration strategy
5. The upload path in `lib/cdn/server.ts`

**Cost impact:** the two items the analysis rated hardest — *"nothing here renders an arbitrary section tree"* and
B7 dual-use renderers — are reduced from research problems to porting problems. The genuinely-new infrastructure
narrows to: **tenancy, versioning, live-data bindings, and the publish/cache contract.**

## 6. Follow-ups

- [ ] Read `SectionRenderer.tsx`'s `editAttrs` + `InlineCmsPreview.tsx` end-to-end and write up the overlay
      protocol before designing the builder canvas — it may remove the need for an iframe entirely
- [ ] Confirm whether `page_content` lives in the same Supabase project as `merchants` (it is absent from
      `schema.sql`, which is a dump of the app schema — check before assuming)
- [ ] Decide whether `lib/cms` and `lib/site-builder` eventually share a `lib/sections-core` package, or stay
      deliberately forked. **Recommendation: fork now, extract later** — premature sharing across a trust boundary
      (HQ content vs. merchant content) is how sanitization bugs happen
