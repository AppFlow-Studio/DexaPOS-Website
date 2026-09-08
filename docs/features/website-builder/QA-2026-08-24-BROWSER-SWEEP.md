# QA — Website builder, end-to-end browser sweep 2026-08-24

**Branch:** `feat/website-owner-ui` @ `774697ad` · **Build:** local dev (Next 16.2.12, Turbopack) · **Driver:** Playwright MCP
**Account:** merchant `mikedoe+clerk_test@gmail.com` — *Joes Coffee Shop*, brand site `joes-coffee-shop.dexaposai.com`
**Viewports:** 1920×945, 1440×900, 420×860 · **Themes:** light + dark
**Screenshots:** [`qa-2026-08-24/`](qa-2026-08-24/) — 22 captures

**Method:** a real browser this time. This closes the "code unchanged, not browser-verified" gap left by the
[2026-08-23 code re-check](QA-2026-08-20-OWNER-UI-DEFECTS.md#0a-status-re-check--2026-08-23), and adds nine
defects that only a driven browser could find.

**Lifecycle exercised, all passing:** create page (Article template) → edit → autosave (survives reload) →
publish → anonymous fetch → nav auto-sync → unpublish/delete (type-`confirm` dialog) → nav auto-cleanup.
Public form submission → response row → response detail also passes end to end.

**Console: zero errors on every surface.** The 3 warnings are pre-existing (Clerk dev keys, `next/image`
`objectFit`/`sizes` on the org logo) and unrelated to this feature.

---

## 0. New defects — not in the 2026-08-20 document

| # | Severity | One line |
|---|---|---|
| N1 | 🔴 P1 | Every nav link in **Preview** opens a new tab on a **404** |
| N2 | 🔴 P1 | **Preview mode is not a preview** — it renders builder placeholders, and shows 4 sections the live page does not have |
| N3 | 🔴 P1 | A gallery photo deleted from the library leaves a **blank grid cell on the live page**, with no warning anywhere |
| N4 | 🟠 P2 | The merchant's public site carries **DEXA POS's favicon, `keywords` and `application-name`** |
| N5 | 🟠 P2 | Public `<title>` is the bare page name (`Home`) — and the field that would fix it has **no UI** |
| N6 | 🟠 P2 | One **Escape closes two layers** — the photo picker *and* the section drawer |
| N7 | 🟠 P2 | At 420 px the drawer's **Done button is fully covered** by the dashboard's mobile tab bar |
| N8 | 🟠 P2 | **Rewards** and **Gift cards** toggles on Website settings have **zero consumers** — dead controls that make a promise |
| N9 | 🟡 P3 | Sections whose content is empty **vanish from the live page**, heading and subheading included, with no warning |

---

### N1 · 🔴 Every nav link in Preview opens a new tab on a 404

**Where:** page editor → Preview → site header

`loadSiteContext` sets `basePath = /sites/${site.slug}` where `site.slug` is the **ordering storefront's**
slug, not the brand subdomain (`site-context.ts:295`). So the canvas renders the storefront address while the
public page renders the brand one. Measured in the DOM:

```
canvas   href="/sites/downtown-hamra"            href="/sites/downtown-hamra/about-us"
public   href="/sites/joes-coffee-shop"          href="/sites/joes-coffee-shop/about-us"
```

Clicking *About us* in Preview opened a second tab at `/sites/downtown-hamra/about-us`, which returns:

```
200  /sites/downtown-hamra              <-- the ordering storefront, a different website
404  /sites/downtown-hamra/about-us     <-- every built page under the storefront slug
```

Logo link, *Home*, *About us*, *Order Now* and *See full menu* are all affected. The code comment at
`site-context.ts:307-311` knows about the collision and defers it to Stage 6 — but the consequence is that
Preview's navigation is 100 % broken today, not merely provisional.

**Wanted:** resolve `basePath` from `merchant_sites.subdomain` when the page is builder-rendered, the same
source `sitePublicUrl` already uses.

---

### N2 · 🔴 Preview mode is not a preview

**Where:** page editor, Build/Preview toggle

`renderCanvas` hard-codes `buildRenderContext(site, "builder", assets)` (`render-canvas.tsx`). The
Build/Preview toggle is client-side chrome only — `Canvas.tsx:65` reduces to `const building = mode === "build"`,
which hides the gutter controls and nothing else. The server never re-renders in public mode.

Measured on Home, same draft, same moment:

```
Preview mode   14 <h2>   includes "Gallery", "Frequently asked questions", "Guest Favorites" (empty)
live page      10 <h2>   those three sections are absent from the markup entirely
```

Preview also still prints the builder-only placeholders — *"Add photos to fill this gallery."*, *"Add the
questions guests ask most."*, *"No items to show yet."* — none of which a visitor can ever see.

A merchant checking their work before publishing is shown four sections that will not exist, and is never
shown the layout they will actually ship.

---

### N3 · 🔴 A deleted library photo leaves a blank cell on the live page

**Where:** Gallery section · Home ([03](qa-2026-08-24/qa-03-gallery.png), [04](qa-2026-08-24/qa-04-picker.png))

`SiteImage` documents the guarantee: *"A missing asset renders nothing… so a merchant removing a photo from
their library can never produce a broken-image icon on a live page."* True of the `<img>`. **Not true of the
`<li>` that wraps it** — `GallerySection.tsx` maps every entry to a `<li>` before `SiteImage` gets to decide,
so a dead id produces a real, empty grid track.

Joes' *Visit Us and taste our food* gallery holds 6 entries, of which 4 no longer resolve. On the live page,
after publishing:

```
$ curl -s .../sites/joes-coffee-shop | grep -c '<li></li>'
4
```

In a `sm:grid-cols-2 lg:grid-cols-3` grid that puts the two surviving photos in column 3 of rows 1 and 2, with
everything else blank — it reads as a broken page, not a sparse one.

The editor gives no warning either: the four dead rows are labelled the generic **"Photo"** with a grey
placeholder square, while live ones show their filename. `binding-health.ts` already computes this class of
verdict; nothing surfaces it for assets.

**Also seen while confirming this:** the photo library has visible duplicate uploads (two 924 KB, two 794 KB,
two identical logos), shows sizes but no filenames, no indicator of which photos are in use, and deletes on one
unconfirmed click — which is the most likely way these four ids died.

---

### N4 · 🟠 The merchant's public site is branded DEXA POS in its head

**Where:** `/sites/joes-coffee-shop` and every built page

`builtSiteMetadata` correctly uses `title: { absolute: … }` to escape the root layout's `"%s — DEXA POS"`
template, and the comment says exactly why: *"it put our brand in their browser tab and in every link they
shared."* The same inheritance carries three more fields that were not escaped:

```html
<link rel="icon"             href="/dexalogolight.png"/>      <!-- the DexaPOS logo, in the merchant's tab -->
<link rel="shortcut icon"    href="/dexalogolight.png"/>
<link rel="apple-touch-icon" href="/dexalogolight.png"/>
<meta name="application-name" content="DEXA POS"/>
<meta name="keywords" content="DEXA POS,restaurant POS,point of sale,restaurant software,…"/>
```

A restaurant's own website is tagged with our product keywords and shows our logo in the browser tab and on
the home screen when saved. Fix in the same place as the title: set `icons`, `applicationName` and `keywords`
explicitly in `builtSiteMetadata` — from the merchant's own logo where one exists.

---

### N5 · 🟠 The public title is `Home`, and nothing can change it

**Where:** `/sites/joes-coffee-shop`, `/sites/joes-coffee-shop/about-us`

```html
<title>Home</title>          <meta property="og:title" content="Home"/>
<title>About us</title>
```

No business name, and **no `<meta name="description">` at all**. `builtSiteMetadata` builds the title as
`pageTitle — siteSeo.titleSuffix`, defaulting to no suffix. That default is wrong for the one feature whose
whole SEO rationale is one domain per merchant — a search result titled "Home" is worth very little.

Worse, `siteSeo.titleSuffix` **has no field on the Website settings screen** ([15](qa-2026-08-24/qa-15-settings.png)),
so a merchant cannot set it even knowing it exists. `siteDisplayName` already exists and already resolves the
right name; default the suffix to it.

---

### N6 · 🟠 One Escape closes two layers

**Where:** any section drawer with the photo picker open. Reproduced 3/3.

With the Gallery drawer open and *Your photos* on top, one Escape closes **both**, dropping the merchant back
to the bare canvas.

`useEscapeClosesDrawer` (`BuilderShell.tsx:407`) has a guard for exactly this and it does not fire. The guard
queries `[role="dialog"][data-state="open"]` from a **`window`** listener; Radix closes the dialog from a
**`document`** listener, and events reach `document` before `window`, so by the time the guard runs the layer
it is looking for is gone. The element does match the selector while open — verified — so the selector is
right and the phase is wrong.

**Wanted:** register on `window` with `{ capture: true }`, or gate on a store flag rather than a DOM probe.

---

### N7 · 🟠 On mobile, the drawer's Done button is unreachable

**Where:** page editor at 420 × 860 ([18](qa-2026-08-24/qa-18-editor-420.png))

The dashboard's mobile tab bar renders **over** the full-screen editor overlay and lands exactly on the
drawer's footer:

```
Done button     y 812 → 848   z-index auto
mobile tab bar  y 795 → 860   z-index 50
document.elementFromPoint(210, 830)  ->  <span>Menu</span>     // the tab bar, not Done
```

Tapping where *Done* appears navigates to **Menus** and abandons the editor. With no keyboard there is no
Escape either, so an opened drawer on a phone is a one-way door.

This is the same root cause as P2-3 — the overlay does not actually own the screen — but it is a functional
dead end rather than an accessibility complaint.

Also re-confirmed at 420 px: Build/Preview exist in the DOM but render at zero size, so **Preview cannot be
reached on mobile at all**; 15 *Add Section* buttons stay clickable, so a merchant can add sections they then
cannot edit, reorder or delete.

---

### N8 · 🟠 Two Website-settings toggles do nothing

**Where:** Website settings → Features ([15](qa-2026-08-24/qa-15-settings.png))

The panel offers four toggles and explains them: *"Turn on what your restaurant actually does. Sections you
can add to a page follow from these."*

| Toggle | Promise | Actually wired to |
|---|---|---|
| Customer reviews | "Show what guests have said about you" | ✅ `requiresFeature: "reviews"` gates the Reviews kind |
| Reservations | "add a Book a table button to your header" | ✅ `HeaderSection.tsx:26`, plus JSON-LD |
| **Rewards** | "Tell guests about your loyalty programme." | 🔴 **nothing** |
| **Gift cards** | "Let guests buy a gift card from your website." | 🔴 **nothing** |

`grep` for consumers of `rewards` / `giftCards` outside `site-settings.ts` and `db-types.ts` returns zero
hits. Both were ON for this merchant. Either wire them or drop them — a switch that promises a storefront
feature and silently does nothing is worse than an absent one.

---

### N9 · 🟡 Empty sections vanish from the live page, typed content included

**Where:** Home — Gallery, FAQ and the second Popular Items

This corrects [P2-7](QA-2026-08-20-OWNER-UI-DEFECTS.md), which predicted these "will publish as empty
blocks". They do not: `GallerySection` returns `null` outside builder mode and its siblings do the same, so
the live page is clean. Verified — the live markup contains none of the three placeholder strings.

The real problem is the opposite one. The merchant typed **"what is our best drink"** as the FAQ subheading
and it is gone from the live page along with the whole section, with nothing in the editor saying so. The
publish blocker flags an unconfigured Form but says nothing about three sections that are about to disappear.

---

## 1. Confirmed still open, from the 2026-08-20 document

Each verified in the browser at the stated viewport, not read from source.

| # | Verdict | Evidence |
|---|---|---|
| **P1-4** Style discards silently | 🔴 confirmed | Light → **Dark**, then Close → straight to `/pages`, no dialog, no toast. Reopened Style: back to Light. |
| **P1-5** Editor unusable on mobile | 🔴 confirmed | 420 px: `modeButtonsVisible: 0`; gutter controls gone; and now N7 on top. |
| **P1-6** Pages names truncated | 🔴 confirmed | 420 px: `Abo…`, `Car…`, `Test…`; search collapses to a bare magnifier ([19](qa-2026-08-24/qa-19-pages-420.png)). |
| **P1-7** Blocker popover | 🔴 confirmed | Reproduced by adding an unconfigured Form. `x 1136→1424, y 51→158`, no dismiss, **still shown in Preview mode** ([20](qa-2026-08-24/qa-20-blocker.png)). |
| **P2-3** No focus trap | 🟠 confirmed | 35 `/dashboard/*` links behind the Style overlay: `tabIndex 0`, no `inert`, no `aria-hidden`, no `role="dialog"`. |
| **P2-4** ⌘K escapes the editor | 🟠 confirmed | Ctrl+K over Style opens *Command Palette — Dashboard, Orders, Menus, Staff*, with unsaved style changes pending (see P1-4). |
| **P2-5** Blocker cannot name the section | 🟠 partial | Now names the *kind* ("the Integration section") but not *which one*, and still singular; a second blocker hides behind "and 1 more". |
| **P2-9** Style preview is invented | 🟠 confirmed | *"Food worth coming back for"*, *Signature plate / House favourite / Chef's pick*, fake nav *Menu · About · Contact* vs the real *Home · About us · Careers*; three grey boxes still read as broken images ([09](qa-2026-08-24/qa-09-style.png)). |
| **P2-11** Form preview ignores site style | 🟠 **confirmed** — was "not verified" | Dashboard theme, square inputs, and a **Send button with no button styling at all** ([13](qa-2026-08-24/qa-13-form-editor.png)). |
| **P3-1** Website group below the fold | 🟡 worse than filed | At 1440×900 on the Pages screen the group shows **no sub-items at all**, only a scroll chevron ([21](qa-2026-08-24/qa-21-status-dropdown.png)). |
| **P3-11** Content preselected | 🟡 confirmed | Modal opens with Content checked; a second click adds it ([05](qa-2026-08-24/qa-05-addsection.png)). |
| **P3-14** `Form` / `Form` header | 🟡 confirmed | Also `Highlights` / `Highlights` on a newly added section. |
| **P3-15** Raw native `<select>` | 🟡 confirmed | Form picker, unlabelled ([20](qa-2026-08-24/qa-20-blocker.png)). |
| **P3-16** Done clips the last field | 🟡 confirmed | SEO panel: *Hide from search engines* helper text cut mid-sentence ([08](qa-2026-08-24/qa-08-seo.png)). Gallery drawer: Columns entirely below it. |
| **P3-18** 150-char heading is single-line | 🟡 confirmed | `headingTag: "INPUT"` for the 65-char hero heading. |
| **P3-20** `optional` jammed on labels | 🟡 confirmed | `Search & sharingoptional` as the accessible name; `Description optional` in the event modal. |
| **P3-23** Native date/time/select | 🟡 confirmed | Edit event: OS calendar and clock chrome ([11](qa-2026-08-24/qa-11-event-edit.png)). |
| **P3-24** `Save changes ⊕` | 🟡 confirmed | Plus icon on a save action. |
| **P3-25** Required photo with Remove | 🟡 confirmed | *Remove* sits directly above *"Required — an event with no photo looks unfinished…"*. |
| **P3-26/29** Events rows | 🟡 confirmed | Bare trash icon, no column header; no status column — two events read *Finished* with nothing saying they are off the site ([10](qa-2026-08-24/qa-10-events.png)). |
| **P3-30** Modal fires many POSTs | 🟡 confirmed | One click on an event row → **6** server-action POSTs. |
| **P3-32** Status dropdown misaligned | 🟡 confirmed | Pill `x 1180→1298`, menu `x 1138→1296`, overlapping the row beneath. |
| **P3-35** US/UK spelling mix | 🟡 confirmed | *Brand Color* and *Guest favourites* / *House favourite* in one viewport; *loyalty programme* in settings. |
| **P3-37** Logo field is two boxes | 🟡 confirmed | A bordered preview card and a second, larger unbordered render below it ([09](qa-2026-08-24/qa-09-style.png)). |
| **P3-38** Hero carousel autoplays in Build | 🟡 confirmed | The hero image differs between consecutive screenshots of an untouched canvas. |
| **P3-6** Tracking save bar bleeds | 🟡 confirmed | Bar spans `x 0→1920`; sidebar avatar and items ghost through ([16](qa-2026-08-24/qa-16-tracking.png)). |
| **P3-7/8** Two shells, four labels | 🟡 confirmed | Events/Forms centred modals vs full-screen overlays; `Publish` / `Save ✓` / `Create →` / `Publish changes 🚀` in one slot. |

---

## 2. Confirmed **fixed** in the browser

| # | Evidence |
|---|---|
| **P1-1** dead nav links | Nav is clean (*Home*, *About us*); the ⊕ Page picker marks all three unpublished pages **"Not live"** ([17](qa-2026-08-24/qa-17-nav-picker.png)). `syncNavForPage` also verified live: publishing a new page **added** it to the public nav and deleting it **removed** it. |
| **P1-2** brand name (editor) | Canvas header and `© 2026 Joes Coffee Shop`. Public page: 8 × "Joes Coffee Shop", 2 × "Downtown Hamra" — both inside Location & Hours, which is correct. |
| **P1-3** silent create failure | `A page already uses that address` toast on a duplicate slug. |
| **P2-1** image previews | Gallery and event photo thumbnails resolve without opening the picker. |
| **P2-8** Forms status | Real coloured pills: grey *Not used*, green *1 page* ([12](qa-2026-08-24/qa-12-forms.png)). |
| **P3-9** icon reuse | 14 kinds, 14 distinct glyphs ([05](qa-2026-08-24/qa-05-addsection.png)). |
| **P3-33** no overflow menu on Pages | Status pill now opens Publish/Unpublish + **Delete**. |
| **P3-36** three typefaces | Category buttons plus a full family dropdown (Oswald). |
| Section delete undo | Toast with **Undo** does fire (~4 s). It does not survive long for "the only way back", but it exists. |

---

## 3. Working well — keep intact

- Full lifecycle: create → template → edit → autosave-through-reload → publish → anonymous fetch →
  unpublish → delete, with nav auto-syncing in both directions.
- **Page delete is the best destructive flow in the product**: names the page, states it is live, states the
  consequence for existing links, and requires typing `confirm`.
- **Forms are end-to-end sound.** A submission from the anonymous public page landed in the dashboard with the
  free-text answer readable in the detail view.
- Empty bound sections drop out of the live markup rather than shipping empty blocks (see N9 for the flip side).
- Zero console errors on every surface, at three viewports, in both themes.

---

## 4. Suggested order of work

1. **N1** — one line in `site-context.ts`, and it makes Preview navigable at all.
2. **N2** — Preview must render in public mode; it is the only surface that answers "what will visitors see",
   and today it answers wrongly. N1 and N2 together are what "Preview" is supposed to mean.
3. **N3** — wrap `<li>` rendering in the same null check `SiteImage` already makes, and surface dead asset ids
   in the drawer. It reaches visitors right now.
4. **N4, N5** — head-tag hygiene, both small, both directly against the feature's SEO rationale.
5. **P1-4 + P2-4** — silent discard and the palette that invites it are one bug.
6. **P1-7 + P2-3 + N6 + N7** — the overlay-ownership pass, unchanged from the last document's advice, now with
   two more members.
7. **N8** — decide: wire or delete.
8. **P1-5, P1-6** — the responsive pass.
