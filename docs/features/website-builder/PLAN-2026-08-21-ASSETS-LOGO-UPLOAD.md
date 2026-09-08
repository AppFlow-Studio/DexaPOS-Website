# Logo & image upload — audit and parity plan

**Date:** 2026-08-21 · **Branch:** `feat/website-owner-ui` · **Status:** P0-1 … P0-4 fixed 2026-08-21;
Phases 4–6 not started

Scope: every path by which an image or document enters the Website tab and every place one is
rendered back — the asset library, the section image fields, the site logo, the SEO sharing image,
and the PDF section.

**Read before implementing.** Findings below are code-verified against HEAD, not inferred. Each
carries the file and line that proves it. Three of them are dead features, not rough edges.

---

## 1 · What is already right

Worth stating, because the plan should not "fix" any of it:

- **The registry row is the record, not the URL.** Pages reference `site_assets.id`, so a CDN move
  never rewrites merchant JSONB (`assets.ts` header).
- **The upload gate is genuinely careful.** Declared type, sniffed magic bytes, and agreement
  between the two, all before anything leaves the process (`lib/site-builder/assets.ts:83`). SVG is
  refused with a real reason. Path traversal is impossible — the unique component is ours
  (`safeFileName`).
- **Soft delete is correct.** A published snapshot cannot be rewritten, so a deleted asset resolves
  to null and `SiteImage` renders *nothing* rather than a broken image.
- **Tenancy is RLS, not query hygiene.** `site_assets_merchant_admin` is `FOR ALL USING
  is_merchant_admin(merchant_id)`, so the id-only `.eq("id", assetId)` in the update/delete actions
  is safe.
- **Public reads never touch the table.** `get_public_site_assets` is SECURITY DEFINER over an
  explicit id list and returns four fields — no storage path, no filename, no enumeration.
- **`SiteImage` is a real choke point** with dimensions and lazy-loading in one place.

---

## 2 · Findings

### P0-1 · AVIF is advertised everywhere and rejected every time

`ALLOWED_ASSET_TYPES` includes `image/avif` (`lib/site-builder/assets.ts:28`). The CDN function's
`ALLOWED_IMAGE_TYPES` does **not** — it is `jpeg, png, webp, svg+xml, gif`
(`supabase/functions/cdn-upload/index.ts:69`).

So an AVIF passes the app gate, reaches the edge function, and is refused there. The merchant sees
`"That image could not be uploaded. Try again."` — a *retry* message for something that can never
succeed. The promise is made in three places: the dialog copy ("JPG, PNG, WebP, GIF or AVIF"), the
file input's `accept` attribute, and the validator's own rejection message.

The two allowlists were written against each other and drifted. **One of them must move**; §3 argues
for adding AVIF to the function rather than removing it from the app.

### P0-2 · The PDF section cannot be filled in, by anyone, ever

`pdfSchema.file` is an `assetRefSchema` (`sections/schemas/pdf.ts:20`). The only writer of
`site_assets` is `UploadSiteAsset`, which refuses every non-image. The drawer routes the field
through `case "image"` (`SectionDrawer.tsx:482`) into `AssetPicker` — titled *"Your photos"*,
`accept` set to images, empty state *"Choose a photo"*.

A merchant adds the section, is shown a photo picker, cannot produce a PDF, and the section renders
its builder-only placeholder *"Upload a document to link to it here."* permanently.

**The CDN side is already built:** `cdn-upload` has a `documents` category allowing
`application/pdf` at a 10 MB ceiling (`index.ts:77`, `:167`). The entire gap is app-side — the type
gate, a `category` argument that is currently hardcoded to `"website"` (`actions/assets.ts:97`), and
a picker that knows the difference between a photo and a document.

### P0-3 · The website logo never reaches the builder canvas

`loadSiteContext` sets `logoUrl: nullableString(config.logo_url)` — the **storefront's** logo from
`store_configs` (`lib/site-builder/site-context.ts:230`). It never reads
`merchant_sites.logo_asset_id`, which is what `SetSiteLogo` writes.

The public renderer does the opposite and does it correctly: `get_public_site_page` joins
`site_assets` on `logo_asset_id` and returns `site_logo_url`
(`migrations/20260824120000_website_brand_name.sql:113`), and `public-context.ts:167` prefers it
over the borrowed storefront logo.

Result: **the editor header shows the old storefront logo forever, while the live site shows the new
one.** This is the brand-name defect of QA §A with the sides reversed — there, the editor was right
and the public page was stale.

### P0-4 · The Style overlay previews the wrong logo

Two controls sit in the same `Field label="Logo"` and read different sources:

- the large preview box renders `logoUrl` (`StyleOverlay.tsx:143`), passed in as
  `storefront.logoUrl` (`app/dashboard/website/style/page.tsx:62`);
- the `AssetPicker` beneath it holds `website.logo_asset_id` (`StyleOverlay.tsx:88`).

Choosing a logo updates the picker's own thumbnail and leaves the preview above it unchanged. The
prop's doc comment explains the split with a claim that is now false — *"`merchant_sites` has no
logo column"* (`StyleOverlay.tsx:74`) — it has had `logo_asset_id` since the assets migration.

### P1-5 · Two mutations skip `revalidatePath`

Every mutation in `actions/site.ts` calls `revalidatePath("/dashboard/website", "layout")` on
success — `UpdateSiteNav` (:223), `UpdateSiteFeatures` (:307), `UpdateSiteBrand` (:338),
`UpdateSiteIntegrations` (:385). **`SetSiteLogo` (:404) and `UpdateSiteSettings` (:137) do not.**

`UpdateSiteSettings` is what the Style overlay saves the theme through, so this is why a theme change
does not repaint the canvas behind the overlay. It also means P0-3's fix would still show a stale
logo until a hard reload.

### P1-6 · iPhone's default photo format is refused with no way forward

HEIC/HEIF is not in the allowlist, which is defensible — but the message is
*"Use a JPG, PNG, WebP, GIF or AVIF image."* to a merchant holding a `.heic` off their phone, with
no mention of what to do about it. Browsers convert on iOS; macOS Finder uploads do not.

### P1-7 · Nothing is downscaled, anywhere

No client-side resize, no server-side derivative. A 4.5 MB phone photo is accepted whole, stored
whole, and served whole into a slot that renders it at ~400 px. It is also base64-encoded into a JSON
body for the edge function (`actions/assets.ts:99`), which inflates it ~33% — a 5 MB file becomes a
~6.7 MB request.

`SiteImage`'s header already names the missing half: *"No srcset yet… derivative generation still has
to happen at the CDN."*

### P1-8 · The logo bypasses `SiteImage`, so it shifts layout on every page

`HeaderSection` renders a bare `<img>` with `className="h-9 w-auto"` and no `width`/`height`
(`HeaderSection.tsx:51`). The render test that forbids bare `<img>` in sections carves out an
explicit exemption for this one file (`render.test.tsx:243`).

The logo is above the fold on **every page of the site**, so this is the single worst place in the
product to leak CLS — on a feature partly sold on SEO.

### P1-9 · `readImageSize` cannot read AVIF or extended WebP

It handles PNG, GIF, JPEG, and the `VP8 `/`VP8L` WebP variants (`assets.ts:readImageSize`). `VP8X`
(any WebP with animation, alpha or metadata — what most encoders emit) and AVIF fall through to
`null`, storing null dimensions, which costs those images the anti-CLS attributes. Becomes
load-bearing the moment P0-1 makes AVIF real.

### P1-10 · Deleting an in-use asset is silent

Soft delete is right, but the merchant is told nothing. There is no "used on 3 pages" indicator and
no confirmation step — the tile's trash button deletes on first click (`AssetPicker.tsx:AssetTile`).
The photo then disappears from published pages with no warning that it would.

### P1-11 · Choosing a photo discards its per-placement alt text

`onChange({ assetId: asset.id })` (`AssetPicker.tsx:141`) drops `value.alt`. A merchant who wrote
placement-specific alt text and then hits **Replace** loses it silently.

### P1-12 · Building a 5-photo carousel costs five round trips

`AssetLibraryDialog` calls `onPick` and closes (`AssetPicker.tsx:143`). Filling the hero carousel
means open → scroll → pick → close, five times. The library dialog has no multi-select even though
`AssetListPicker` knows its own remaining capacity.

### P2 — smaller gaps

| # | Gap | Where |
|---|---|---|
| P2-13 | No drag-and-drop, though the component's own doc comment cites Owner's drop zone | `AssetPicker.tsx:32` |
| P2-14 | No search or filter; a hard `.limit(200)` with no pagination | `actions/assets.ts` — `ListSiteAssets` |
| P2-15 | One spinner for a sequential batch — no per-file progress or "3 of 7" | `AssetPicker.tsx` — `upload` |
| P2-16 | The retention sweep is cited in three comments and **does not exist**; soft-deleted bytes are never reclaimed | `20260819120000_website_assets.sql:65,85` |
| P2-17 | Orphaned CDN files when the insert fails after upload (documented, unswept — same missing job as P2-16) | `actions/assets.ts:54` |
| P2-18 | `uploaded_by` stores a Clerk **org** id in a column that reads as a user id | `actions/assets.ts:126` |
| P2-19 | No logo-specific guidance — nothing says transparent PNG, or that it renders at 36 px tall | `StyleOverlay.tsx:141` |

---

## 3 · Plan

Ordered so that each phase is independently shippable and the dead features come back first.
Phases 1–3 are the ones I would merge before touching anything cosmetic.

### Phase 1 — Make the promises true (P0-1, P1-6, P1-9)

- [x] 1.1 Add `image/avif` to `ALLOWED_IMAGE_TYPES` in `cdn-upload`. **Add rather than remove**: AVIF
      is 30–50% smaller than JPEG at equal quality, the app already sniffs its magic bytes, and the
      dialog has been promising it. Removing it instead is the one-line alternative if we would
      rather not redeploy the function — call it explicitly, do not default into it.
- [x] 1.2 Add a test asserting `ALLOWED_ASSET_TYPES ⊆ ALLOWED_IMAGE_TYPES`, so the two lists can
      never drift apart again. This is the actual fix; 1.1 is just today's symptom.
- [ ] 1.3 *(deferred — P1, not part of the P0 sweep)* Teach `readImageSize` the `VP8X` WebP header and the AVIF `ispe` box, so neither format
      stores null dimensions.
- [ ] 1.4 *(deferred — P1)* Name HEIC in the rejection message with the fix, not just the refusal.
- [x] 1.5 Redeploy `cdn-upload`. **← NOT YET DEPLOYED. Code changed; the function must ship
      before AVIF actually works in production.** **Ordering matters: the function ships before the app**, or 1.1
      makes AVIF fail slightly differently rather than working.

### Phase 2 — One logo, read from one place (P0-3, P0-4, P1-5, P1-8)

- [x] 2.1 Resolve `merchant_sites.logo_asset_id → site_assets.cdn_url` in `loadSiteContext`, with
      the storefront's `config.logo_url` kept as the fallback. Same precedence as
      `public-context.ts:167`, so the canvas and the live page cannot disagree.
- [x] 2.2 Feed the Style overlay's preview box from that resolved value instead of
      `storefront.logoUrl`, and correct the stale "no logo column" comment.
- [x] 2.3 Add `revalidatePath("/dashboard/website", "layout")` to `SetSiteLogo` **and**
      `UpdateSiteSettings`, matching the other four mutations. Fixes the theme-does-not-repaint
      behaviour as a side effect.
- [ ] 2.4 *(deferred — needs the logo's dimensions carried through
      `get_public_site_page`, which is a migration; started and reverted rather than land it
      half-done with a height and no width)* Route the header logo through `SiteImage` so it carries width/height, and delete the
      `HeaderSection.tsx` exemption from the bare-`<img>` test rather than leaving a carve-out
      nothing needs.
- [x] 2.5 Test: one assertion that the editor context and the public context resolve the same logo
      for the same site row. That is the invariant; the three bugs above are its violations.

### Phase 3 — Give the PDF section a way to be filled (P0-2)

- [x] 3.1 Add `application/pdf` to a **document** allowlist, kept separate from the image one, with
      the 10 MB ceiling the CDN function already applies to `documents`.
- [x] 3.2 Sniff `%PDF-` and require it to agree with the declared type, exactly as images do.
- [x] 3.3 Give `UploadSiteAsset` a `kind: "image" | "document"` argument that selects the gate and
      the CDN `category` (currently hardcoded `"website"`).
- [x] 3.4 Introduce a `file` control kind in `schema-introspect` so the PDF field stops being
      rendered as `case "image"`, and give it a document-flavoured picker — *"Your documents"*,
      `accept="application/pdf"`, a file-name row instead of a thumbnail grid.
- [x] 3.5 Filter the library by kind so photo fields never offer a PDF and vice versa.
- [x] 3.6 Tests for the document gate and for the drawer routing `pdf.file` to the new control.

**Decision needed before starting 3.4:** whether documents live in `site_assets` alongside images
(one table, a `kind` column, one library) or in their own table. I recommend one table — soft delete,
quota, tenancy and the public resolver are all already correct and would otherwise be duplicated.

### Phase 4 — Make uploading feel finished (P1-7, P1-12, P2-13, P2-15)

- [ ] 4.1 Client-side downscale before upload: cap the long edge at ~2400 px and re-encode to WebP
      when the source is larger. Cuts a 4.5 MB phone photo to a few hundred KB, which also relieves
      the base64 inflation.
- [ ] 4.2 Store the dimensions of the bytes actually uploaded, not the originals — `SiteImage` writes
      `width`/`height` into the markup and they must describe what is served.
- [ ] 4.3 Drag-and-drop onto the library dialog and onto the empty-state tile.
- [ ] 4.4 Multi-select in the library when opened from `AssetListPicker`, bounded by its remaining
      capacity, so a five-photo carousel is one visit.
- [ ] 4.5 Per-file progress — "Uploading 3 of 7" and a failed-file list that does not vanish with
      the toast.

### Phase 5 — Library management (P1-10, P1-11, P2-14, P2-19)

- [ ] 5.1 Preserve `value.alt` across **Replace**.
- [ ] 5.2 A usage count per asset, collected with the existing `collectAssetIds` walk over draft and
      published documents — no new traversal code.
- [ ] 5.3 Confirmation before deleting an asset that is in use, naming the pages. Deleting an unused
      one stays a single click.
- [ ] 5.4 Filename search and pagination past 200.
- [ ] 5.5 Logo guidance in the Style overlay: transparent PNG, and that it renders 36 px tall.

### Phase 6 — Reclaim the bytes (P2-16, P2-17, P2-18)

- [ ] 6.1 Write the retention sweep three comments already promise: hard-delete `site_assets` rows
      soft-deleted more than N days ago **and referenced by no published version**, and delete their
      CDN objects.
- [ ] 6.2 Have the same job collect orphaned CDN files — uploaded, never registered.
- [ ] 6.3 Rename `uploaded_by`, or write the actual user id into it. Decide which; do not leave a
      column whose name disagrees with its contents.

---

### Fixed alongside, same defect class

- [x] **Filled image fields rendered "Loading…" / an empty grey square until the picker was opened
      once.** `AssetPicker` and `AssetListPicker` only fetched the library on `open`, so a field that
      already held a photo had nothing to resolve its own thumbnail against. This is what made the
      hero carousel rows in the 2026-08-21 screenshot look blank. Both now load whenever there is a
      value to draw — and still fetch nothing for an empty field, which is the saving the lazy load
      existed for.
- [x] Tests — 5 in `builder/__tests__/asset-picker-thumbnails.test.tsx`, verified to reproduce the
      stuck `Loading…` state when the fix is reverted.

---

## 4 · Sequencing

Phases 1, 2 and 3 are independent of one another and can go in any order or in parallel. Phase 4's
downscaling (4.1) should land **after** Phase 1, because re-encoding to WebP interacts with the
format allowlist. Phase 6 is unblocked but has no user-visible effect, so it should not jump ahead of
a dead feature.

**Not in scope, deliberately:** CDN derivative generation and `srcset` (`SiteImage`'s documented
Stage 7 item). Phase 4.1 reduces the same pain from the client side and does not conflict with it.
