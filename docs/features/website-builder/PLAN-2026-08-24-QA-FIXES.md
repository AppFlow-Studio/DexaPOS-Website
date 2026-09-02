# Fix plan — website builder QA defects

**Source:** [QA-2026-08-24-BROWSER-SWEEP.md](QA-2026-08-24-BROWSER-SWEEP.md) (9 new) +
[QA-2026-08-20-OWNER-UI-DEFECTS.md](QA-2026-08-20-OWNER-UI-DEFECTS.md) (the items its 2026-08-23 re-check left open).
**Branch to work from:** `feat/website-owner-ui` @ `774697ad`.
**Status:** plan only — nothing below has been implemented.

Every root cause here was read at HEAD and, where the symptom is visual, watched in a browser. File and line
references are from `774697ad`; re-grep before editing rather than trusting a line number.

---

## How this is sequenced

Six waves. The ordering is not by severity alone — it is by *what unblocks honest testing*. W1 exists because
until Preview tells the truth, no one can QA anything else by looking at it.

| Wave | Theme | Defects | Rough size |
|---|---|---|---|
| **W1** | Make Preview mean something | N1, N2 | S — 2 files, both small |
| **W2** | Stop shipping broken pixels to visitors | N3, N4, N5 | M — one has a new settings card |
| **W3** | The overlay owns the screen | N6, N7, P1-7, P2-3, P2-4 | M — one shared mechanism, five symptoms |
| **W4** | Never lose merchant work silently | P1-4, N9, P2-5, P2-6 | M |
| **W5** | Responsive | P1-5, P1-6 | M–L — real layout work |
| **W6** | Dead controls, honesty, polish | N8, P2-9, P2-11, the P3 sweep | M |

**Do not batch W1–W4 into one PR.** W3 in particular touches the dashboard shell, which is shared with every
other feature; it wants its own diff and its own review.

---

## W1 · Make Preview mean something

### N1 · 🔴 Preview's nav links all 404

**Root cause.** `buildRenderContext` builds one base path and uses it for everything:

```ts
// lib/site-builder/site-context.ts:295
const basePath = `/sites/${site.slug}`;   // site.slug is the STOREFRONT slug
…
  basePath,
  orderUrl: basePath,
  menuUrl: basePath,
  nav: readNav(site.nav, basePath),
```

The public renderer already gets this right and has for a while — `public-context.ts:138` keeps them apart:

```ts
const orderUrl = branding ? `/sites/${branding.slug}` : basePath || "/";   // storefront
…
  basePath,                       // '' or /sites/{subdomain} — the BRAND address
  nav: readNav(decision.nav, basePath),
```

So this is not a design question. The editor is simply missing the split the public path already makes.
`orderUrl` and `menuUrl` pointing at the storefront is **correct and must stay** — that is where ordering
lives. Only `basePath` (which feeds nav, the logo link, and in-site page links) is wrong.

**The fix.**

1. `fetchWebsiteSettings` (`site-context.ts:193`) already has the full `merchant_sites` row from
   `fetchMerchantSite`. Return `subdomain: site?.subdomain ?? null` from it, and add `subdomain: string | null`
   to the `SiteContext` interface (`site-context.ts:38`). Zero new round trips — `MerchantSiteRow.subdomain`
   is already in `db-types.ts:34`.
2. In `buildRenderContext`:

   ```ts
   const storefrontPath = `/sites/${site.slug}`;
   // The brand address when the merchant has one; the storefront until they do,
   // which is the pre-builder behaviour and the only honest fallback.
   const basePath = site.subdomain ? `/sites/${site.subdomain}` : storefrontPath;
   …
     basePath,
     orderUrl: storefrontPath,
     menuUrl: storefrontPath,
     nav: readNav(site.nav, basePath),
   ```

**Watch out.** A merchant who has never opened the builder has no `merchant_sites` row, so `subdomain` is
null — the fallback above keeps them exactly where they are today. Do not throw.

**Tests.** Extend the existing site-context tests: given a subdomain, `ctx.site.basePath` is
`/sites/{subdomain}` and `ctx.site.orderUrl` is `/sites/{storefront}`; given none, both are the storefront.
Assert the *inequality* explicitly — the whole bug was that one string did two jobs.

**Verify in the browser.** Open the editor, `document.querySelectorAll('a[href^="/sites/"]')` — nav hrefs
should read `joes-coffee-shop`, `Order Now` should still read `downtown-hamra`. Then click a nav link in
Preview and land on a 200.

---

### N2 · 🔴 Preview mode renders builder mode

**Root cause.** Two halves that never met.

- `RenderMode` has had a `"preview"` member all along — *"Merchant-only preview of a draft. Renders exactly
  like public."* (`render-context.ts:18-24`). Nothing ever passes it.
- `renderCanvas` hard-codes the other one: `buildRenderContext(site, "builder", assets)`
  (`app/dashboard/website/pages/render-canvas.tsx`).
- The Build/Preview toggle is therefore chrome only — `Canvas.tsx:65` reduces the whole of it to
  `const building = mode === "build"`, which hides the gutter controls and nothing else.

**The fix.**

1. `renderCanvas(doc, locationId, mode: "build" | "preview" = "build")`, mapping to
   `buildRenderContext(site, mode === "preview" ? "preview" : "builder", assets)`.
   Defaulting the parameter keeps `NewPageOverlay.tsx:162` and `[pageId]/page.tsx:143` compiling untouched —
   though the New Page template preview arguably wants `"preview"` too, since nothing there is editable.
2. `useServerRender` (`BuilderShell.tsx:174`) takes `mode`, passes it to `renderCanvas`, and adds it to the
   effect deps.
3. `setMode` in `store.ts:464` bumps `canvasRefreshRequest` so the switch forces a re-render rather than
   waiting for the next edit. `requestCanvasRefresh` already exists at `store.ts:459` — reuse the same
   increment rather than adding a second mechanism.

**Watch out.**

- `renderCanvas` is a Server Action and its args are a trust boundary. `mode` must be validated against the
  two-value union server-side, not spread into the context. It cannot be allowed to reach `"public"` by way
  of a crafted call — treat anything that is not `"preview"` as `"builder"`.
- There is a known infinite-render hazard here, documented at `BuilderShell.tsx:84-95`. Adding `mode` to the
  deps is safe because it changes only on click; adding anything with a fresh identity per render is not.
- Re-check the 400 ms debounce: a mode flip should feel immediate. Consider bypassing the timer when the
  refresh came from `setMode` rather than from a doc edit.

**Tests.** `render.test.tsx` already renders sections through both paths. Add: a page whose Gallery has no
images renders the placeholder at `mode: "builder"` and renders `null` at `mode: "preview"`. That single
assertion is the whole defect.

**Verify in the browser.** On Joes' Home, Preview should drop from 14 `<h2>` to 10 and lose every
"Add photos to fill this gallery." string — matching `curl` on the live page exactly.

---

## W2 · Stop shipping broken pixels to visitors

### N3 · 🔴 A deleted library photo blanks a cell on the live page

Two halves — the renderer ships the hole, the editor hides it. Fix both; they are independent.

**Root cause A — the renderer.** `SiteImage` returns `null` for an unresolvable id, and its doc comment sells
that as the guarantee. `GallerySection.tsx` defeats it by deciding the wrapper before `SiteImage` decides the
content:

```tsx
{images.map((image, index) => (
  <li key={…}><SiteImage asset={image} ctx={ctx} … /></li>   // <li></li> when the id is dead
))}
```

**Fix A.** Filter before mapping, in the one place that knows: resolve first, render what survives.

```tsx
const resolved = images.filter((image) => ctx.resolveAsset(image.assetId));
```

Then branch the empty state on `resolved.length`, not `images.length`, so a gallery whose photos have *all*
died renders nothing publicly instead of an empty `<ul>` under a heading.

**Do not fix this by styling the empty `<li>`.** The cell must not exist.

**Audit every other list of assets for the same shape** before closing this. `GallerySection`'s masonry branch
maps directly (no wrapper) and is already fine; the hero carousel, `CardsSection` and any repeater with an
image per row need the same read. The general rule worth writing down: *if a section wraps `SiteImage` in an
element, that element is the section's responsibility to omit.*

**Root cause B — the editor.** `AssetListPicker` (`AssetPicker.tsx:530-545`) cannot tell "still loading" from
"gone":

```tsx
{asset?.altText || asset?.originalFilename || "Photo"}
```

The single-asset `AssetPicker` already makes exactly this distinction 350 lines earlier
(`assets === null ? "Loading…" : copy.missing`, with `missing: "This photo is no longer in your library"`
in `KIND_COPY`).

**Fix B.** Mirror it. When `assets !== null` and no match is found, render `copy.missing` in destructive
colour and give the row a destructive border, so the four dead rows in Joes' gallery are the loudest thing in
the drawer rather than the quietest. `KIND_COPY` already holds the string; reuse it rather than writing a
second one.

**Consider (needs a product call, do not just do it):** blocking publish on a dead asset ref, the way an
unconfigured Form blocks. `validate.ts` cannot currently see asset existence — it validates the document, and
resolution happens later. Doing this properly means passing a resolved asset set into `validatePage`, which is
a larger change than the rest of N3 combined. **Recommendation: warn in the drawer now, decide the blocker
separately.**

**Also seen, file separately.** The photo library deletes on one unconfirmed click, shows no filenames, no
indication of which photos are in use, and has visible duplicate uploads. That is how these four ids died. A
confirm dialog plus an "in use on N pages" badge is the actual prevention; N3 is the mitigation.

**Tests.** `render.test.tsx`: a gallery with three refs of which one resolves renders exactly one `<li>` and
zero empty ones. `asset-picker-thumbnails.test.tsx` already exists — extend it for the missing case.

---

### N4 · 🟠 The merchant's public site is branded DEXA POS in its head

**Root cause.** `builtSiteMetadata` (`app/sites/[slug]/built-site.tsx:65`) correctly escapes the root layout's
title template, and the comment at :86-91 explains precisely why — *"it put our brand in their browser tab and
in every link they shared."* Next merges everything else from `app/layout.tsx:23`, and three fields were not
escaped: `icons` (the DexaPOS logo, :45), `applicationName` (:31), `keywords` (:32).

**The fix.** In the object `builtSiteMetadata` returns, set all three explicitly:

- `applicationName: siteName` — the resolved `siteDisplayName`, which `decision` already carries.
- `keywords: undefined` — we have no honest keywords for someone else's restaurant, and the tag is worth
  nothing to Google anyway. Emitting *ours* is the actual harm; emitting none is correct.
- `icons` — the merchant's `logoUrl` where one exists. Where none does, still do **not** fall through to
  `/dexalogolight.png`; ship no icon and let the browser draw its default letter.

Add a comment tying it back to the title escape so the next person adding a root-layout field checks here.

**Watch out.** `metadataBase` is `https://dexaposai.com` (`app/layout.tsx:24`). Canonical is already absolute
via `sitePublicUrl` so it is unaffected, but any *relative* URL in this metadata object will resolve against
our domain. Keep the logo URL absolute — it is a CDN URL already.

**Tests.** A metadata test asserting the returned object carries no `keywords` and no `/dexalogolight.png`,
and that `applicationName` is the merchant's name. Cheap, and it locks the class of bug shut.

---

### N5 · 🟠 `<title>Home</title>`, and nothing can change it

**Root cause.** There is a whole site-level SEO block in the **read** path with no writer anywhere:

```
built-site.tsx:80   siteSeo.titleSuffix   ──┐
built-site.tsx:86   siteSeo.description   ──┤ read from merchant_sites.site_seo
built-site.tsx:254  siteSeo.description   ──┘
resolve-render-mode.ts:276   siteSeo: row.site_seo
```

`grep -rn titleSuffix` across the repo returns those reads and nothing else. No zod schema, no server action,
no field. Result: bare `<title>Home</title>`, no `<meta name="description">`, on the one feature whose entire
SEO rationale is one domain per merchant.

**The fix — two independent halves, ship both.**

1. **A default that works with nobody touching anything.** In `builtSiteMetadata`, when `titleSuffix` is
   unset, fall back to the resolved site display name:

   ```ts
   const suffix = siteSeo.titleSuffix?.trim() ?? siteDisplayName(…);
   ```

   `siteDisplayName` is already the shared precedence function (`site-settings.ts:316`) and `decision`
   already carries `merchantName` — this is the same resolution N4 needs, so do them together. Titles become
   `Home — Joes Coffee Shop` for every existing merchant with no migration and no merchant action.

   *One caveat worth stating:* a merchant whose page title already ends in their name gets it twice
   (`Joes Coffee Shop — Joes Coffee Shop`). Skip the suffix when `pageTitle` already contains it,
   case-insensitively.

2. **The field, so it can be overridden.** Add a `siteSeo` block to `site-settings.ts` alongside
   `siteBrandSchema` — `{ titleSuffix?: string; description?: string }`, free-form jsonb into the existing
   `merchant_sites.site_seo` column, **so no migration is needed**. Then a *Search appearance* card on
   `SettingsScreen.tsx`, between **Business name** (:116) and **Features** (:143):
   - *Site name in search results* — placeholder showing the resolved default, exactly the pattern the
     Business name field already uses at :124 so the default is visible without being typed.
   - *Default description* — the fallback used when a page has no description of its own. `built-site.tsx:86`
     already reads it.

   Reuse `UpdateSiteBrand`'s shape for the action rather than inventing a third settings write path.

**Note for whoever picks this up.** `validate.ts:222-235` *already* warns `seo_missing_title` and
`seo_missing_description` per page. Those warnings have been computed and thrown away this whole time because
nothing renders warnings — see N9. Fixing N9 makes this defect self-reporting.

---

## W3 · The overlay owns the screen

Five separate bug reports, one underlying untruth: `OverlayChrome` claims the screen and does not hold it.
Fix the mechanism once.

**Shared groundwork** — `components/site-builder/shell/OverlayChrome.tsx`:

- **Raise it above the app.** It is `fixed inset-0 z-50` (:66). `MobileBottomNav` is *also* `z-50`
  (`components/dashboard/MobileBottomNav.tsx:48`) and renders later in DOM order from
  `app/dashboard/layout.tsx:1469`, so it wins the tie. Move the overlay to `z-[60]`. **This one token fixes
  N7 outright.**
- **Publish "an overlay is open".** A tiny module-scope store — `useSyncExternalStore` over a counter that
  `OverlayChrome` increments on mount and decrements on unmount. A counter, not a boolean: overlays can
  legitimately stack, and a boolean would let the inner one's unmount clear the outer one's claim.
- **Make the app inert.** While the count is above zero, set `inert` on the dashboard shell element. `inert`
  is one attribute and it does the whole job — untabbable, unclickable, hidden from assistive tech. There are
  zero occurrences of `inert`, `aria-hidden`, `role="dialog"` or a focus trap in this file today.
- **Announce it as a dialog.** `role="dialog"` + `aria-modal="true"` + `aria-labelledby` on the `<h1>` the
  chrome already renders (:88), and move focus into the overlay on mount.

That groundwork closes **P2-3** and **N7** by itself. The rest hang off it:

### P2-4 · 🟠 ⌘K opens the global palette inside the editor

`app/dashboard/layout.tsx:1234-1243` binds ⌘K on `document` with no notion of context. Guard it with the
overlay counter: bail early when an overlay is open. Do not try to solve this with `stopPropagation` from the
overlay — the listener is on `document` and the overlay is not in its ancestor chain for a keypress that
starts at `body`.

### N6 · 🟠 One Escape closes two layers

`useEscapeClosesDrawer` (`BuilderShell.tsx:407`) *has* a guard for this and it is documented at :412-417 —
*"without the guard one keypress dismisses two things and only one of them was asked for."* The selector is
right: I confirmed in the browser that the open picker matches `[role="dialog"][data-state="open"]`.

**The phase is wrong.** The listener is on `window`; Radix closes from a `document` listener; events bubble
target → … → `document` → `window`, so Radix has already unmounted the layer by the time the guard queries
for it. A DOM probe cannot work from this phase.

Two candidate fixes, in order of preference:

1. **Check `event.defaultPrevented`.** Radix calls `preventDefault()` when it handles an Escape. This is one
   line, needs no capture-phase reasoning, and reads as what it means: *someone already answered this key.*
2. **Register with `{ capture: true }`** so the guard runs before Radix. Works, but inverts the ordering the
   comment describes and will confuse the next reader unless the comment is rewritten with it.

Take (1); leave (2) in the comment as the rejected alternative and say why.

**Test it as a unit.** Dispatch a `keydown` with `defaultPrevented` true and assert `closeDrawer` was not
called. Reproduced 3/3 by hand, so a regression test is cheap insurance.

### P1-7 · 🔴 The publish-blocker popover

`EditorTopBar.tsx:181-183` renders `absolute right-0 top-full z-10` whenever `blocked` — always on, no
dismiss, present in Preview, above every scrim, and showing only `validation.errors[0]` (`:162`) while
silently counting the rest as "and 1 more".

**The fix.** Make it an actual popover on the Publish button:

- Use the shadcn `Popover` already in `components/ui/`, anchored on the button. That gets dismissal, escape
  handling and scrim ordering for free instead of hand-rolling them — and puts it *under* modal scrims, which
  is where it belongs.
- Open it on click, and force it open once on a failed publish attempt. Not permanently.
- Gate on `mode === "build"`. A blocker has no business in a mode whose job is to look like the live site.
- **Show every error, not `errors[0]`.** The list is short and already carries `sectionId`, so each row gets
  its own *Fix it*. This is what makes P2-5 go away — see W4.
- Keep the Publish button disabled while blocked. That part is right today and is the honest signal.

---

## W4 · Never lose merchant work silently

### P1-4 · 🔴 Closing Style discards unsaved changes

**Root cause.** `StyleOverlay.tsx:121` computes `dirty` and spends it on one thing — disabling Save (:152).
Close is `closeHref={websiteRoutes.pages(locationId)}` (:150), which `OverlayChrome` turns into a bare
`router.push` (:63). Nothing consults `dirty`. Confirmed by hand: Light → Dark → Close → reopened on Light.

**The fix.** Style is the only write surface in this feature that neither autosaves nor shows a save bar —
and Tracking, three screens away, already has the right pattern (`Discard` / `Save changes` sticky bar, which
the 2026-08-20 doc singled out as the clearest write pattern in the product).

1. **Adopt Tracking's sticky bar on Style.** Same component, same copy shape. That makes the dirty state
   visible before Close is ever reached, which is the real fix — a confirm dialog is a patch over an invisible
   state.
2. **Then** guard Close: pass `onClose` (which `OverlayChrome:57` already prefers over `closeHref`) and, when
   dirty, raise a confirm rather than navigating. Reuse the existing `useUnsavedChangesWarning` hook from
   `BuilderShell` if its shape fits; a second bespoke dialog here would be the third pattern for one idea.

**While in here:** `useUnsavedChangesWarning` should also cover Style's `beforeunload`. Closing the tab
discards silently too.

### N9 · 🟡 Empty sections vanish from the live page, with the merchant's typed words

**This corrects P2-7, which had it backwards.** Empty sections do *not* publish as empty blocks — they render
`null` outside builder mode, and the live markup is clean. Verified by `curl`.

The real defect: `validate.ts:194-206` **already emits exactly the right warnings** —
`"Gallery has no photos yet."`, `"FAQ is empty and will not show anything."` — and **nothing in the UI ever
renders a warning.** `EditorTopBar` reads `validation.errors` only. So a merchant types
*"what is our best drink"* as their FAQ subheading, publishes, and the section and the sentence both vanish
with no signal anywhere.

**The fix.** The rule exists; give it a surface. Once P1-7's popover shows a list, it shows warnings too —
below the errors, in a muted style, not blocking publish. Wording matters here: *"FAQ has no questions yet,
so it will not appear on your live page"* says the consequence, which
`"is empty and will not show anything"` nearly does already.

This is close to free once P1-7 lands, and it retires the never-shown SEO warnings at `validate.ts:222-235`
in the same stroke — which is half of N5.

### P2-5 · 🟠 The blocker cannot say which section

Already handled by P1-7's list — each row names its section and carries its own *Fix it*. Two extras while
there:

- `incompleteSectionMessage` (`validate.ts:246`) writes *"the Form section"* / *"the Integration section"* —
  definite article, singular, and **"Integration" does not match the "Integrations" label** the Add Section
  modal shows. Take the label from `SECTION_REGISTRY[kind].label` instead of hardcoding it, the way the
  repeater message at :175 already does.
- The rule really is inconsistent: `video`, `form`, `pdf` and `integrations` block; nothing else does. That is
  defensible — those four render *nothing at all* without their one required field — but say so in the copy
  rather than leaving the merchant to infer it.

### P2-6 · 🟠 Unpublished forms — **the filed defect is half wrong**

`FormPicker.tsx:87-94` already renders a real explanatory warning when an unpublished form is selected:
*"This form has not been published yet, so guests will not see it until you publish it from the Forms
screen."* The 2026-08-20 note that the `(not published)` suffix "is the only signal" is out of date.

What is actually left is small: the warning is `text-muted-foreground`, so it reads as help text rather than a
warning. Give it the destructive token and an icon. **Do not block selection** — picking a form before
publishing it is a legitimate order of work.

---

## W5 · Responsive

Both of these are real layout work, not tokens. Budget accordingly, and do them together — they share a
decision about what a merchant is allowed to do on a phone.

**Answer that first.** Two coherent positions:

- **(a) Full parity.** Every editing affordance reachable at 420 px.
- **(b) An honest read-only editor.** Preview and page management work on a phone; structural editing says
  "open this on a larger screen" — which is what most page builders in the survey chose.

**Recommend (b).** The gutter-control model (`Canvas.tsx:38` documents it as deliberate) does not have a good
small-screen answer, and a half-working editor on a phone is worse than a clear one. But it is a product call,
not mine — and either way the *current* behaviour, where Add Section works and nothing else does, is
indefensible.

### P1-5 · 🔴 The editor below ~900 px

Root causes, both found:

- Edit/delete/move live in gutters outside the canvas frame (`Canvas.tsx:174`, `px-4 py-6 sm:px-16`). The
  gutters collapse; the controls go with them.
- **Build/Preview is `hidden md:block`** — `OverlayChrome.tsx:96`. That is why `modeButtonsVisible: 0` at
  420 px. Preview is unreachable on a phone, which under **(b)** is exactly backwards: preview is the one
  thing that should work.

Minimum under (b): move the mode switch out of the `hidden md:block` wrapper into the header's flow at narrow
widths, and show a single explanatory banner in Build mode below `sm`. Under (a): an on-section overlay or
bottom sheet replacing the gutters, which is a design task before it is a code one.

### P1-6 · 🔴 Pages list truncates names

**Root cause.** `DataCard` applies one `gridTemplateColumns` string unconditionally, at both
`DataCard.tsx:92` (header) and `:126` (rows). `PagesScreen.tsx:179` passes
`"minmax(0,1fr) 110px 130px"`, so `Updated` and `Status` hold 240 px while the name — the row's identity —
takes what is left. At 420 px that is `Abo…`, `Car…`, `Test…`.

**Fix in `DataCard`, not in `PagesScreen`.** Four screens pass a `gridTemplate` (`EventsScreen.tsx:87`,
`FormsScreen.tsx:68`, `PagesScreen.tsx:179`, `SubmissionsScreen.tsx:133`) and every one has the same problem.
Options, best first:

1. **Emit the template as a CSS custom property** and add a `@media` rule that collapses the metadata columns
   below `sm`. One change, all four screens, no API churn.
2. An optional `gridTemplateNarrow` prop. Explicit, but pushes the decision onto four call sites that will
   drift.

Also in scope: the search input collapses to a bare magnifier with no visible field (P3-31 territory), and
`P3-32` — status dropdowns render left-shifted off their pill and overlap the row beneath. That last one is a
Radix `align`/`side` prop, near-free while the file is open.

---

## W6 · Dead controls, honesty, polish

### N8 · 🟠 Two settings toggles that do nothing

`SITE_FEATURES` is `["reviews", "rewards", "giftCards", "reservations"]` (`site-settings.ts:38`). Consumers:

| Feature | Wired to | Verdict |
|---|---|---|
| `reviews` | `requiresFeature: "reviews"` on the Reviews kind (`registry.ts:323`) | ✅ real |
| `reservations` | `HeaderSection.tsx:26`, plus JSON-LD (`json-ld.ts:160`) | ✅ real |
| `rewards` | — | 🔴 nothing |
| `giftCards` | — | 🔴 nothing |

`grep -rn` for either outside `site-settings.ts` and `db-types.ts` returns zero hits. Both were ON for the
test merchant, promising a loyalty programme and gift-card sales that do not exist. The panel's own copy —
*"Sections you can add to a page follow from these"* — is false for half the list.

**Decide, then do one of:**

- **Hide them** behind the same `unavailable` mechanism the registry already uses for PDF (`registry.ts:383`),
  with a visible reason. Cheapest, honest, reversible.
- **Delete them** from `SITE_FEATURES`. Cleanest, but they are stored on live rows; leave the keys tolerated
  on read so old rows do not fail validation.
- **Build them.** A `rewards` and a `giftCards` section kind. Real work, and out of scope for a QA fix pass.

**Recommend hiding**, and filing the sections as features. A switch that promises a storefront capability and
silently does nothing is worse than an absent one.

### P2-9 · 🟠 The Style preview shows invented content

`ThemePreview.tsx:83` still ships *"Food worth coming back for"*, *"Signature plate / House favourite /
Chef's pick"*, three grey boxes and a fake nav of `Menu · About · Contact` — against a merchant whose real
pages are `Home · About us · Careers`. The 2026-08-20 fix log's §6D corrected this component's *colours*; its
invented *content* is untouched.

**Fix:** feed it the merchant's real facts — the site name (already correct), the real nav from
`merchant_sites.nav`, and the first two or three real Popular Items from the menu catalog the editor already
loads. Where a real photo exists, use it; the grey boxes read as broken images, which is the specific
complaint.

**Related, same file (P2-10):** in dark mode the preview has no frame, so "your website" and "the app" merge
and the panel's own Light/Dark control reads as the app theme toggle. A 1px border and a small caption
("Preview") is the whole fix.

### P2-11 · 🟠 The Form editor preview ignores the site's style

Now **confirmed** — the 2026-08-23 re-check could not locate the component. It renders in the dashboard's
theme with square inputs, and the **Send button has no button styling at all**: grey text on white, which
reads as disabled.

**Fix:** wrap the preview in the same `SiteChrome` / CSS-custom-property shell the canvas uses, so it inherits
`--site-brand`, `--site-radius` and the rest. The Send button should render through the same `CtaButton` the
real `FormSection` uses. One shared component, not a second set of styles — the whole reason
`renderCanvas` returns JSX from the real renderer is to stop exactly this drift.

### The P3 sweep

Grouped so they can be done as sittings rather than 20 tickets. All confirmed in the browser 2026-08-24.

**Drawer chrome** — one sitting, all in `SectionDrawer.tsx` / `schema-introspect.ts`:
- **P3-14** header reads `Form`/`Form`, `Highlights`/`Highlights` — the kind label used as both title and
  subtitle. Fall back to the section's own heading like Hero does; use the kind only as the subtitle.
- **P3-16** the fixed *Done* button clips the last field — SEO panel's *Hide from search engines* helper is
  cut mid-sentence; the Gallery drawer's *Columns* control sits entirely under it. Bottom padding on the
  scroll container equal to the footer height.
- **P3-18** the 150-char heading is an `<input>`. `heading` is absent from `MULTILINE_FIELDS`
  (`schema-introspect.ts:94`) — add it.
- **P3-20** `Search & sharingoptional`, `Description optional` — jammed with no separator.
- **P3-15** the form picker is a raw native `<select>` (`FormPicker.tsx:70`) with no label, in an app that
  uses shadcn `Select` everywhere else.

**Add Section modal** — one sitting:
- **P3-11** `Content` is preselected (`AddSectionModal.tsx:81`), so a stray second click adds an unchosen
  section. Start empty with `Add` disabled.
- **P3-12** `aria-checked` on plain buttons with no `role="radiogroup"` — invalid ARIA as it stands. The Hero
  drawer's Variant control does this correctly; copy it.
- **P3-13** `Add a Events section`, `Add a Integrations section`.
- **P3-10** PDF is greyed with its reason only in `aria-label`.

**Events** — one sitting:
- **P3-23** native `<select>` / `<input type=date>` / `<input type=time>`.
- **P3-24** `Save changes ⊕` — a plus on a save action; should be a check.
- **P3-25** Photo marked *Required* with a *Remove* button directly above the requirement notice.
- **P3-26 / P3-29** bare trash icon, no column header, no confirmation; and no status column — two events read
  *Finished* with nothing saying they are off the site.
- **P3-30** one click on a row fires **6** server-action POSTs. Investigate before styling anything: that is a
  render-loop smell, and `BuilderShell.tsx:84-95` documents a near-identical loop that was already caught once.

**Cross-cutting, cheap:**
- **P3-1** the Website sidebar group opens below the fold — at 1440×900 on the Pages screen it shows *no*
  sub-items at all, only a scroll chevron. Scroll the active child into view on navigation.
- **P3-6** Tracking's sticky save bar spans the full viewport and ghosts over the sidebar.
- **P3-8** four labels for one slot: `Publish`, `Save ✓`, `Create →`, `Publish changes 🚀`.
- **P3-35** `Brand Color` beside `Guest favourites` / `House favourite` / `loyalty programme`. Pick one —
  the product is US-facing, so US.
- **P3-37** the Style logo field renders as two stacked boxes.
- **P3-38** the hero carousel autoplays inside the Build canvas, so the section changes under the merchant
  while they work.

---

## Not defects — recorded so they are not "fixed"

- **Empty sections rendering `null` publicly** is correct. N9 is about *telling* the merchant, not about
  changing the render.
- **`orderUrl` / `menuUrl` pointing at the storefront** is correct and must survive N1.
- **A pinned event that has ended hides its section** rather than promoting another — deliberate, per
  `PLAN-2026-08-21-FEATURED-EVENT-SECTION.md`.
- **The section-delete flow has no confirm dialog** by design; the Undo toast is the trade
  (`delete-section.ts:8-23`). Worth revisiting only that the toast's ~4 s life is thin for "the only way
  back" — consider extending it, not adding a dialog.
- **`sec_probe` as the hero's section id on Joes' Home** is residue from a `verify-site-tenancy.ts` run, not a
  code defect. Harmless; clean up the row if it bothers anyone.

---

## Definition of done for this plan

1. Every 🔴 above closed, each with a test that fails against `774697ad`.
2. A browser pass repeating [QA-2026-08-24](QA-2026-08-24-BROWSER-SWEEP.md) §0 at 1440 and 420, both themes.
3. `curl` on `/sites/joes-coffee-shop` shows: zero `<li></li>`, a title carrying the business name, no
   `keywords` meta, no `dexalogolight.png`.
4. Console still clean — it was at zero errors across the whole sweep, and that is worth not losing.

---

## Implementation status — 2026-08-24

Worked from `feat/website-owner-ui` @ `774697ad`. Every defect below was re-read at HEAD before it was
touched; the ones that turned out not to be defects are recorded as such rather than "fixed".

**A second session was editing this working tree concurrently** (`VideoSection.tsx`, `validate.ts`,
`validate.test.ts`, written 21:56–21:57 — an empty Video now warns instead of blocking). One edit of mine to
`validate.ts` was silently overwritten by it. Those three files were left alone from that point on, which is
the only reason anything in W4/W6 is still open.

### Done

| Wave | Item | What changed |
|---|---|---|
| W1 | **N1** | `SiteContext.subdomain`; `buildRenderContext` splits `basePath` (brand) from `orderUrl`/`menuUrl` (storefront). New `site-context.test.ts` — 2 of its 3 cases fail at `774697ad`. |
| W1 | **N2** | `renderCanvas(doc, locationId, mode)`, validated server-side to `builder`/`preview`; `useServerRender` passes the store's mode and skips the 400 ms debounce on a mode flip. New Page's template preview renders as `preview` too. |
| W2 | **N3** | `GallerySection` resolves before it wraps, so a dead asset id emits no `<li>`; empty state keys off what survived. Hero's dead *primary* frame no longer claims a carousel slot. `AssetListPicker` tells "gone" from "loading" and marks the row destructive. |
| W2 | **N4** | `builtSiteMetadata` sets `applicationName`, `keywords: null`, `icons` (merchant logo or none) and `openGraph.siteName`. **Also found:** with no OG image the page inherited the root layout's `twitter` card — our copy, our logo — so `twitter` is now always emitted. |
| W2 | **N5** | Title falls back to the resolved site name (skipped when the page title already carries it). `siteSeoSchema` + `resolveSiteSeo` + `UpdateSiteSeo` + a *Search appearance* card on Settings. No migration — `merchant_sites.site_seo` already exists. |
| W3 | **P2-3 / N7 / P2-4** | `lib/hooks/overlay-open.ts`: a counted claim published by `OverlayChrome`, read by the dashboard shell, which sets `inert` on the sidebar, header and mobile tab bar (it cannot go on `<main>` — the overlay is inside it). Overlay is `z-[60]`, `role="dialog"`, `aria-modal`, labelled by its `<h1>`, and takes focus on mount. ⌘K bails while a claim is held. |
| W3 | **N6** | The DOM probe is replaced by `event.defaultPrevented`, extracted to `escape-guard.ts` with unit tests. The capture-phase alternative is recorded as rejected, with the reason. |
| W3 | **P1-7** | The always-on `absolute` panel is a real anchored `Popover` on the publish control — every error listed, each with its own *Fix it*, warnings under them in muted style, Build mode only. Publish stays disabled while blocked. |
| W4 | **P1-4** | Style gets Tracking's dirty bar (state + Discard; the single commit stays top-right), a confirm on Close, and `beforeunload`. |
| W4 | **N9** | Warnings have a surface for the first time — they render in P1-7's popover. No renderer change: sections rendering `null` when empty is correct. |
| W4 | **P2-6** | The unpublished-form warning is destructive with an icon and names the form. Selection is still allowed. |
| W5 | **P1-5** | Position **(b)**: the mode switch rides in the action cluster below `md` (labels drop below `sm`), and Build shows one line saying editing needs a wider screen. |
| W5 | **P1-6** | Fixed in `DataCard`, not the four callers: the template applies from `sm` up, rows stack below it, column headings hide. |
| W6 | **N8** | `UNAVAILABLE_FEATURES` + `AVAILABLE_SITE_FEATURES`. Rewards and Gift cards are no longer offered; the keys stay in the schema because live rows carry them. |
| W6 | **P2-9 / P2-10** | `ThemePreview` takes the merchant's real nav labels and up to three real dishes with photos; placeholders only when a site has neither. Neutral `ring-1` frame and a *Preview* caption. |
| W6 | **P2-11** | The form preview is wrapped in the site's resolved theme tokens and loads its fonts, so `PublicForm`'s `var(--site-*)` styling resolves and Send stops looking disabled. Tokens applied directly rather than importing `SiteChrome`, which would pull the section graph into the client bundle. |
| W6 | **P3 sweep** | P3-1 active nav item scrolled into view · P3-6 Tracking bar sticky within its column · P3-10/11/12/13 Add Section: nothing preselected, real `radiogroup`, visible reason on inert rows, option-name labels · P3-14 no more `Form`/`Form` · P3-15 shadcn `Select` · P3-16 footer padding · P3-18 `heading` multiline · P3-20 separator · P3-23 Events dropdowns · P3-24 check not plus · P3-25 requirement shown only while unmet · P3-26/29 confirm + column header · P3-35 US spelling · P3-37 one logo box · P3-38 carousel frozen in Build. |

### Not done, and why

- **P2-5 (wording half)** — `incompleteSectionMessage` should take its label from `SECTION_REGISTRY` so the
  error stops saying "the Integration section" for a kind labelled *Integrations*. Written once and lost to the
  concurrent write; `validate.ts` was then off-limits. **The list half of P2-5 is done** — each row in the
  popover names its section.
- **P3-30** (one row click → 6 server-action POSTs) — needs a browser to attribute; not investigated.
- **P3-7 / P3-8** (two shells, four labels in one slot) — a naming and shell decision, not a bug fix.
- **N3's "consider"** — blocking publish on a dead asset ref still needs `validatePage` to see resolved assets.
  Recommendation stands: warn in the drawer (done), decide the blocker separately.
- **Photo library hardening** (confirm on delete, filenames, "in use on N pages") — filed separately, as the
  plan asks.

### Verification

- `npx vitest run` — 1044 passing. New/changed tests: `site-context.test.ts` (3), `built-site-metadata.test.ts`
  (8), `overlay-open.test.ts` (3), `escape-guard.test.ts` (4), gallery cases in `render.test.tsx` (3),
  `asset-picker-thumbnails.test.tsx` (+1), `site-settings.test.ts` (+7).
- `copy-caps.test.ts` asserted `heading` was single-line — the decision P3-18 reverses. Updated, keeping the
  test's point (the cap and the control are decided separately) with a capped single-line field instead.
- Two failures in `render.test.tsx` are **not from this work**: an uncommitted working-tree edit to
  `PopularItemsSection.tsx` that predates the session **deletes the dual-pricing disclosure**. Stash it and
  those two pass. That deletion needs a decision before it is committed — see below.
- `npx tsc --noEmit` clean for every file touched. ESLint clean; the one error in `app/dashboard/layout.tsx`
  (`setState` in an effect, line 1254) is the pre-existing `isMounted` pattern.
- **Not yet done: the browser pass.** §0 of the sweep at 1440 and 420 in both themes, and the `curl` checks in
  this plan's definition of done, still need running against these changes.

### Follow-up, same day: the FAQ section

Raised from the canvas, not from the sweep. The FAQ rendered as a flat hairline-divided column that ran the
full 6xl width, so a question and its answer read as one continuous block of text with no edge between items.

- **The width was a bug, not a style choice.** `Container` concatenated its `className` instead of merging it,
  so `FaqSection`'s `max-w-3xl` landed beside `max-w-6xl` and lost on source order. It now merges through
  `cn`, which is what makes the section a centred reading column. `FaqSection` is the only caller that passed
  a conflicting width; Header, Hero and Footer pass spacing and layout utilities and are unaffected.
- **One card per question** — border, card background, radius, hover and open shadow — replacing the shared
  divided column.
- **Animated open/close in CSS, still zero JavaScript.** `FAQ_STYLES` in `PageRenderer` transitions
  `::details-content` with `interpolate-size: allow-keywords`, which is what allows a height animation to
  `auto` without measuring. Browsers without `::details-content` get the instant open they had before, so no
  section renderer becomes a client component — the same-document canvas depends on that.
- **A chevron instead of a rotating `+`**, which at 45° read as a close button on an open question.
- **Centred by default**, with an explicit `align: "left"` still honoured so the Style control keeps working.
- The question's edit marker moved from `<summary>` to the span holding only its text, so canvas text
  patching stops falling back to a full server render on every keystroke.

Five cases added to `render.test.tsx`. `prefers-reduced-motion` disables both transitions.
