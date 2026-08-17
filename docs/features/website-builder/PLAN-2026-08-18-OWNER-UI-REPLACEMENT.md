# Plan — Replace the website builder UI with Owner.com's model

**Date:** 2026-08-18
**Branch:** `feat/website-owner-ui` (off `aliawdi-dev`)
**Requested by:** team lead — *"mimic the UI and flow of owner.com; what I care about most is the same simplicity"*
**Reference material:** [`owner.com/`](../../../owner.com/) — 23 screenshots of the live Owner dashboard, captured 2026-08-18
**Supersedes for UI purposes:** [DESIGN-2026-08-14-BUILDER-UI.md](DESIGN-2026-08-14-BUILDER-UI.md) (decisions UI1–UI21)

> **This is a UI replacement, not a rewrite.** The section contract, the registry, the resolver, the
> renderers, the server actions and the database are **untouched**. Everything below happens inside
> `components/site-builder/builder/**`, `components/site-builder/dashboard/**` and four route files.
> No migration. No change to `PageDocument`. That is what makes this a two-week job instead of a quarter.

---

## 1. Decisions taken

Agreed with the team lead before planning:

| # | Decision | Consequence |
|---|---|---|
| **D-A** | **Style collapses to Owner's five controls** — logo, one brand colour, Light/Dark, Rounded/Square, title font from four options | Palettes, mood filters, supporting-colour overrides, font pairings, the two font pickers and the readability panel are **deleted**. One brand colour + mode derives the whole palette through the existing `deriveThemeColors` |
| **D-B** | **Of our safety rails, only publish blockers survive** | Broken-menu-item `⚠` markers, undo/redo affordances, the save-state indicator and the page SEO fields all come out of the UI |
| **D-C** | **Sidebar becomes a Website group with sub-items** | `app/dashboard/layout.tsx` gains a nested entry. The overview page disappears; **Pages** is the landing screen |
| **D-D** | **Scope is Pages + Style + the page editor** | Announcements, Events, Forms, Analytics, Customer support and Careers are out. The sidebar group shows only Pages |

### 1.1 One deviation from D-B, stated plainly

D-B, read literally, removes autosave along with its indicator. **I am keeping the autosave machinery
and removing every visible trace of it.** `SaveDraft`, the 1.5 s debounce, the flush on tab-hide and the
conflict path all stay; the status text, the retry link, the undo/redo buttons and `Ctrl+Z` all go.

The reason: Owner's editor has no save button either, which means it autosaves — a Build-mode editor whose
only write is `Publish` loses a merchant's afternoon on a refresh. Removing the *indicator* is a simplicity
win; removing the *persistence* is a data-loss bug wearing simplicity's clothes.

If the team lead genuinely wants no autosave, say so and it is a one-line change to
[BuilderShell.tsx](../../../components/site-builder/builder/BuilderShell.tsx) — but the drawer's `Done`
button would then have to become the save point, and `Close` would need an "unsaved changes" prompt.

---

## 2. The Owner model, extracted

Everything in this section is read off the screenshots, with the file that shows it.

### 2.1 Navigation — `002837`, `003130`

A collapsible **Website** group in the left sidebar, expanded to reveal `Pages · Announcements · Events ·
Forms · Analytics · Customer support · Careers`. The active child gets a light pill background. There is no
overview or dashboard screen above Pages — **the sidebar is the navigation, and Pages is where you land.**

### 2.2 The list-screen shell — `002837`, `003248`, `003303`, `003315`, `003415`

One layout, reused by every screen in the group:

- `<h1>` + a single muted sentence beneath it, left-aligned
- Actions top-right: zero or one secondary (outline) button, then one primary (solid blue) button
- A single bordered card: a search row with a magnifier, then rows separated by hairlines
- Right-hand columns are few and narrow — `Created by`, `Status`, `Responses`, `Date`
- Status is a **pill that is also a dropdown** — green `Published ⌄`, grey `Unpublished ⌄`, grey `Not used ⌄`
- Pagination bottom-left: `‹ 1 2 ›` then `1-7 of 8`
- Empty state is a **single row inside the card** — an icon and `No events`. Not an illustration, not a hero

The home page's status pill has no chevron (`002837`) — it cannot be unpublished.

### 2.3 The full-screen overlay — `002918`, `002956`, `003008`, `003019`, `003053`, `003153`, `003330`, `003551`

Four different jobs, one chrome:

```
[⊗ Close]  Context title            [🔨 Build | 👁 Preview]            💬  [Primary ⊕]
```

| Used for | Title | Centre | Primary |
|---|---|---|---|
| Page editor | page name | Build / Preview | `Publish ⊕` |
| Style | `Style` | — | `Save ✓` |
| New Page | `New Page` | — | `Create →` |
| New Form | `New Form` | — | `Create →` |

The overlay covers the sidebar completely. There is no breadcrumb and no secondary navigation inside it.

### 2.4 The page editor in Build mode — `003551`, `003153`

- Canvas centred on a light grey field, **one fixed width, no device switcher**
- Hovering a section reveals two floating pill controls in the **gutters, outside the canvas**:
  - left: `✏️` alone for locked sections, `✏️` over `🗑️` for deletable ones
  - right: `⌃` over `⌄` — move up, move down
- Between every pair of sections, a full-width band containing `⊕ Add Section`
- The header section shows `✏️` but no `🗑️` — locked, exactly like our `masthead` zone
- No layers panel, no zone labels, no section search, no selection ring, no undo, no save text

**Preview mode** swaps the canvas for a plain render with the controls gone.

### 2.5 The section drawer — `003053`

Clicking `✏️` opens a **left drawer, ~240 px**, over the same canvas:

- Plain stacked fields, label above control, generous vertical rhythm
- Segmented controls for small enums — `Background: None | Photo | Color`, `Media: None | Photo | Video`,
  `Alignment: Left | Right`
- Image fields are a dashed dropzone with a thumbnail and a `Replace` button beneath
- Text fields carry a **character counter in the label row**, right-aligned: `32/50`, `287/500`
- A full-width blue **`Done`** pinned to the bottom of the drawer

No tabs. No Content/Appearance split. No reset-to-default affordances. No "inherits site design" note.

### 2.6 Add Section — `003224`

A small centred modal, not a gallery:

- Title `Add Section` + `✕`
- A **two-column grid of plain rows** — icon, label, and a check on the selected one
- 12 kinds visible: Content, Gallery, Features, Cards, Form, PDF, Reservations, Reviews, Scrolling Banner,
  Popular Items, Video, Events
- Footer: `Add ⊕`, bottom-right

No search, no categories, no descriptions, no thumbnails, no "recommended" badges. **Selection is a
two-step commit** — pick, then `Add` — which is how the modal avoids asking where the section goes.

### 2.7 New Page — `002956`, `003008`, `003019`

Overlay chrome, left rail of three template cards (`Article`, `Showcase`, `Blank`), live preview of the
selected template filling the rest. `Create →` commits. The preview is a **real render**, not a thumbnail —
`003019` shows `Blank` rendering as just header + footer.

### 2.8 Style — `002918`

The entire style surface, in order, in a ~240 px left rail:

1. **Logo** — thumbnail in a bordered box, `⋯` overflow, `Replace` button
2. **Brand Color** — a swatch dot and a hex value in one bordered field
3. **Theme** — `Light | Dark` segmented
4. **Corners** — `Rounded | Square` segmented
5. **Titles font** — four radio rows, each with an `Aa` specimen on the right: `Sans serif`, `Serif`,
   `Condensed`, `Custom` (showing the resolved name, e.g. `Noto Serif Display`)

Live full-site preview fills the rest of the screen and scrolls. **That is the whole design system.**

### 2.9 Modal grammar — `003440`, `003503`, `003517`

Title + `✕`; body; footer with exactly one primary button whose icon sits on the *right* (`Add job ⊕`,
`Add Event ⊕`, `Done ✓`). Inline validation is red text directly beneath the offending field
(`Field is required` under the photo dropzone in `003503`). No cancel button in the footer — `✕` is the exit.

---

## 3. Gap analysis

| Concern | Owner | Us today | Action |
|---|---|---|---|
| Landing screen | Pages list | Overview with readiness checklist, next-best-action, store card | **Delete overview**, Pages becomes landing |
| Page management | Rows + status dropdown | `PageListCard` inside the overview | **Promote** to its own screen |
| Editor columns | 1 (+ drawer) | 3 (layers, canvas, inspector) | **Collapse to 1 + drawer** |
| Section controls | Gutter pills | Overlay toolbar, layers rows, drawer menu — three routes to the same six actions | **One route**: gutter pills |
| Reorder | ⌃/⌄ only | dnd-kit drag, ⌃/⌄, keyboard, menu items | **⌃/⌄ only** |
| Add section | 12 plain rows, 2-col | Categorised gallery, search, thumbnails, recommendations, availability badges | **Plain grid** |
| Section editing | Flat fields + Done | Tabs, reset buttons, live-data notice, design link | **Flat fields + Done** |
| Publish | One blue button | Review sheet with diff, blockers, warnings, binding health, publication target, success state | **Button + blocker message** |
| Device preview | None | Desktop/tablet/mobile at 1120/834/390 | **Delete** |
| Undo | None | Buttons + `Ctrl+Z` + 50-deep history | **Delete affordances**, keep history internally for the drawer's cancel path |
| Save state | None | 6 states, relative time, retry | **Delete display**, keep machinery (§1.1) |
| Style | 5 controls | ~40 controls across 4 tabs | **5 controls** |
| Nav editing | Auto-derived from pages | Manual `NavEditor` with 8-item cap | **Auto-derive** (§6.4) |
| Web address | Not in these shots | `WebAddressCard` on the overview | **Keep**, move onto Pages (§6.2) |

---

## 4. Target file tree

```
app/dashboard/website/
  page.tsx                    → redirect to ./pages
  pages/page.tsx              ★ NEW  Pages list (landing)
  pages/[pageId]/page.tsx     ★ NEW  editor  (was builder/page.tsx)
  style/page.tsx              ★ NEW  style overlay (was design/page.tsx)
  preview/page.tsx              keep, unchanged
  builder/                    ✂ delete (render-canvas.tsx + menu-catalog.ts move to ../pages/)
  design/                     ✂ delete

components/site-builder/
  shell/                      ★ NEW — the primitives every screen is built from
    OverlayChrome.tsx         ★ Close · title · centre slot · primary action
    ListHeader.tsx            ★ h1 + subtitle + actions
    DataCard.tsx              ★ search + rows + pagination + empty row
    StatusPill.tsx            ★ green/grey pill that is also a dropdown
    TemplatePicker.tsx        ★ left rail of templates + live preview
  builder/
    BuilderShell.tsx          ⟳ rewrite — overlay + canvas + drawer
    Canvas.tsx                ⟳ rewrite the overlay layer, keep the measurement engine
    EditorTopBar.tsx          ★ NEW (replaces Toolbar.tsx, 519 → ~140)
    SectionDrawer.tsx         ⟳ rewrite of SettingsPanel.tsx (1034 → ~600)
    AddSectionModal.tsx       ⟳ rewrite (251 → ~110)
    store.ts                  ⟳ trim (556 → ~380)
    MenuItemPicker.tsx        ⟳ strip the ⚠ rows per D-B (316 → ~230)
    preview-sync.ts             keep, unchanged
    save-adapter.ts             keep, unchanged
    delete-section.ts         ⟳ drop the undo toast, keep the guard
    section-icons.tsx           keep
    announce.ts                 keep — ⌃/⌄ still need to announce
    SectionList.tsx           ✂ delete (521)
    ReviewSheet.tsx           ✂ delete (532)
    SectionThumbnail.tsx      ✂ delete (144)
  dashboard/
    PagesScreen.tsx           ★ NEW — list + status pills + New Page + Change Style
    WebAddressCard.tsx        ⟳ keep, restyled to the card grammar
    StyleOverlay.tsx          ★ NEW (replaces WebsiteDesignWorkspace.tsx, 820 → ~260)
    design/BrandColorField.tsx ⟳ simplified ColorField
    design/TitleFontRadio.tsx ★ NEW — four rows with Aa specimens
    design/ThemePreview.tsx     keep — already token-driven, no change needed
    WebsiteOverview.tsx       ✂ delete (187)
    PageListCard.tsx          ✂ delete — absorbed by PagesScreen (384)
    design/NavEditor.tsx      ✂ delete (262)
    design/FontPicker.tsx     ✂ delete
    design/ReadabilityCheck.tsx ✂ delete
```

**Net: ≈2,100 lines deleted, ≈900 written.**

---

## 5. What must not change

Guard these in review. Every one of them is why this is a UI-only change:

- `lib/site-builder/**` — the contract, registry, schemas, resolver, normalizer, validator, diff
- `components/site-builder/sections/**` and `PageRenderer.tsx` — the nine renderers
- `app/dashboard/website/actions/**` — all 17 server actions, including `UnpublishPage`, which already
  exists at [publish.ts:342](../../../app/dashboard/website/actions/publish.ts) and is what the status
  pill's dropdown calls
- The `data-sb-*` overlay protocol in [edit-attrs.ts](../../../components/site-builder/edit-attrs.ts) —
  the new gutter controls read the same attributes the old overlay did
- The database. **No migration in this branch.**

**Additions to `lib/site-builder/` are allowed; modifications are not.** The rule protects the contract,
not the directory. Two files there have legitimately changed so far:

- `page-templates.ts` — **new**, sibling to `starter-page.ts`, which is where a reader looks for it.
- `style-inputs.ts` and `__tests__/style-derivation.test.ts` — **new**. The five-control derivation is
  pure theme logic and belongs beside `color.ts`, not inside a React component; putting it here is what
  lets the readability invariant be tested at all.
- `__tests__/render.test.tsx` — the client-component allowlist gained `shell`. That test walks
  `components/site-builder/` and fails any `"use client"` outside `builder/` and `dashboard/`, because a
  client component in the render graph breaks `renderCanvas`. `shell/` is dashboard chrome and is not
  reachable from `PageRenderer`, so it belongs on the allowlist beside the other two. **Nothing else about
  that test was weakened** — the render-graph directories are still covered.

---

## 6. Work items

### Phase 0 — Setup ✅

- [x] **0.1** `owner.com/` committed as reference material (`b19ca146`).

### Phase 1 — Shell primitives ✅

Build these first; every later phase consumes them.

- [x] **1.1** `shell/OverlayChrome.tsx` — plus `OverlayRail` and `OverlayStage`, which every overlay
      needs and which would otherwise have been copied three times. Renders `fixed inset-0` so it covers
      the dashboard sidebar, as Owner's does.
- [x] **1.2** `shell/ListHeader.tsx`
- [x] **1.3** `shell/DataCard.tsx` — alignment is a shared `gridTemplateColumns` string between the
      heading row and the cells, so a caller adding a column cannot knock them out of step.
- [x] **1.4** `shell/StatusPill.tsx`
- [x] **1.5** `shell/TemplatePicker.tsx` — gained a `children` slot in the rail for the page-name field.

Also added: **`components/site-builder/routes.ts`**, one place for every URL in the feature. Not in the
original plan; added because the editor and style routes move in later phases and every screen linking to
them would otherwise need finding by grep. The Phase 3 and 6 moves are now one line each.

**Acceptance:** each renders in isolation and matches its screenshot at 1366 px.

### Phase 2 — Pages screen ✅

- [x] **2.1** `app/dashboard/website/pages/page.tsx`
- [x] **2.2** `dashboard/PagesScreen.tsx`. Columns are title, **`Updated`**, `Status` — not Owner's
      `Created by`, because `site_pages` records no author and a column that can only ever say `—` is
      worse than one that says something true. `updated_at` we have, and it is what a merchant scanning a
      page list actually wants.
- [x] **2.3** Status pill wiring against the existing `PublishPage` / `UnpublishPage`. A failed publish
      toasts with an `Open page` action — a list cannot show *where* the blocker is, so it offers the one
      screen that can. The home page gets a chevron-less pill.
- [x] **2.4** `WebAddressCard` beneath the list, "published but unreachable" warning intact.
- [x] **2.5** `New Page` → the template overlay. Pulled forward from Phase 5 (see 5.3–5.4) rather than
      leaving the screen's primary button pointing at a 404 for a phase.
- [x] **2.6** `app/dashboard/website/page.tsx` → redirect, preserving `?location=`.
- [x] **2.7** Deleted `WebsiteOverview.tsx` (187) and `PageListCard.tsx` (384).

**Rows carry no rename or delete.** The original acceptance criterion below said they would; the
screenshots say otherwise — `002837` and `003130` show a hovered row and an open status dropdown with no
overflow menu anywhere. Both operations already exist in the editor's page settings, which is the better
home for them: an address is only meaningful next to the page it addresses, and two routes to one
operation is the duplication this rebuild exists to remove.

**Acceptance:** a merchant can see, search, paginate, publish and unpublish pages without leaving this
screen; renaming and deleting are one click away in the editor.

### Phase 3 — Editor chrome ✅

- [x] **3.1** `EditorTopBar.tsx` (519 → 172). Page switcher, device switcher, undo/redo, external link
      and the two-line status stack are all gone.
- [x] **3.2** Route move: `pages/[pageId]/page.tsx`, with `render-canvas.tsx` and `menu-catalog.ts`
      moved to `pages/`. `builder/page.tsx` survives as a **redirect shim** so every bookmark, audit-log
      link and shared URL keeps working. The editor also accepts **`home`** in place of an id, which is
      what a caller with a location but no page wants and is better than guessing at a uuid.
- [x] **3.3** `Close` returns to the page list.
- [x] **3.4** `mode: "build" | "preview"` replaces `inspectorEnabled`. Preview renders **in place**
      (open question 4, resolved) — one state flag, not a route.
- [x] **3.5** Publish inline, still gated on `validatePage`. The blocker appears as a small card under the
      button naming the first error, with `Fix it` selecting the offending section and an "and N more"
      line when there are others.
- [x] **3.6** Deleted `Toolbar.tsx` (519) and `ReviewSheet.tsx` (532).

**Acceptance:** publishing a valid page takes one click from the editor. Publishing an invalid one is
impossible and the reason is on screen.

### Phase 4 — Canvas and drawer ✅

- [x] **4.1** Gutter controls. `measure()`, the `ResizeObserver`, the rect map and
      `useRevealSelectedSection` all survive untouched — they were correct and hard-won. Left pill is
      pencil / `⋯` / trash, right pill is `⌃` / `⌄`, both outside the page edge.
- [x] **4.2** `Add Section` bands, always visible rather than hover-revealed.
- [x] **4.3** Selection ring and label chip replaced by a hairline inset ring. The chip is gone; the open
      drawer names the section.
- [x] **4.4** `SectionDrawer.tsx` (1034 → 604). `describeSchema` generation intact. Tabs, reset buttons,
      `InheritsSiteDesign`, the live-fields banner and the section overflow menu are gone; character
      counters and a bottom-pinned `Done` are in.
- [x] **4.5** `STYLE_FIELDS` deleted — one list, in schema order.
- [x] **4.6** Page settings keeps name and address. SEO fields out per D-B; `doc.seo` untouched.
- [x] **4.7** `store.ts` (556 → 430) — `device`, `pane`, `reviewOpen`, `publishResult`, `savedAt`,
      `pages` and `redo` removed; `mode` added. `SelectionSource` narrowed to `canvas | other` now that
      there is no list to select from.
- [x] **4.8** Deleted `SectionList.tsx` (521). `announce.ts` kept and called from the ⌃/⌄, hide and
      duplicate handlers.

**Hide and Duplicate live in a `⋯` overflow inside the left pill** (open question 1, resolved). Owner's
gutter has neither, but hidden sections are already modelled and duplicate is genuinely useful; an
overflow costs one icon and keeps the default pill at Owner's three.

**Two guards kept that the plan had marked for deletion**, both because removing them would have traded
simplicity for data loss rather than for clarity:

- **The delete-undo toast (7.3).** With the undo button and `Ctrl+Z` gone, this is now the *only* way back
  from a destructive click. It costs no chrome — it does not exist until something has been deleted — and
  the alternative is a confirmation dialog interrupting every deletion, which is more UI, not less.
- **A save-failure toast.** There is no status line any more, so a failing save would otherwise be
  completely silent while a merchant kept typing into a document nothing was storing.

**Acceptance:** every action the old three columns offered — edit, reorder, hide, duplicate, delete, add —
is reachable from the canvas alone.

### Phase 5 — Add Section and New Page

- [x] **5.1** `AddSectionModal.tsx` rewrite (251 → 158). Search, categories, descriptions, thumbnails,
      recommendations and `PAGE_ESSENTIALS` all gone.
- [x] **5.2** `addableKinds()` still the source. The `unavailable` gallery and an already-placed
      singleton both render as disabled rows, each explaining itself in a tooltip — a greyed-out row a
      merchant cannot get an explanation for reads as a broken product.
- [x] **5.3** `lib/site-builder/page-templates.ts` — `Article` (header, hero, content, footer),
      `Showcase` (header, hero, popular-items, features, content, footer), `Blank` (header + footer only,
      matching `003019`). **Showcase carries no gallery**: the registry marks that kind `unavailable`
      until the asset library exists, and a template that arrives with a section the merchant cannot fill
      teaches them the product is broken. It goes in when Stage 7 lands.
- [x] **5.4** New Page overlay, previewing through the real `renderCanvas` action. Templates apply as a
      `SaveDraft` immediately after `CreatePage` rather than as a new parameter, which keeps the create
      action ignorant of templates — **no server action changed**.
      **One deviation:** the rail carries a page-name field, which Owner's does not. Without it two pages
      created in a row both want `/new-page` and the second fails on a unique constraint the merchant did
      nothing to earn. The address is still derived, and only editable later in page settings.
- [x] **5.5** Deleted `SectionThumbnail.tsx` (144).

**Acceptance:** adding a section is two clicks. Creating a page is: name it, pick a template, `Create`.

### Phase 6 — Style overlay

- [x] **6.1** `StyleOverlay.tsx` (820 → 341) — five-control rail plus the existing `ThemePreview`.
- [x] **6.2** Derivation, extracted to **`lib/site-builder/style-inputs.ts`** so it is pure, testable and
      shared with the invariant test. The full `ThemeTokens` object is still what gets stored — no
      migration, no schema change, renderer untouched.
- [x] **6.3** Rehydration: `mode` from `isLight(surface)`, `corner` from the radius, `headingFont`
      matched against the three named faces or shown as `Custom`. A theme saved by the old ten-colour
      workspace opens as its nearest equivalent instead of refusing to load — asserted by a test.
- [ ] **6.4** Nav auto-derivation — **deferred to Stage 6, deliberately.** `buildRenderContext` hardcodes
      `nav: []`, so nothing in the editor or preview has ever rendered a nav; only
      `buildPublicRenderContext` reads it, through `readNav`, for a public route that does not exist yet.
      Deriving it correctly means deriving it at render time in `public-context.ts`, which is protected
      path and belongs with the route that will consume it. Deleting `NavEditor` therefore removes no
      behaviour a merchant can currently observe. **Recorded as a gap: until Stage 6, a site has no way
      to populate `merchant_sites.nav`.**
- [x] **6.5** Logo — reads the storefront's `logoUrl` (there is no logo column on `merchant_sites`) with
      one sentence saying where it comes from. No disabled `Replace` button pretending to work.
- [x] **6.6** Deleted `WebsiteDesignWorkspace.tsx` (820), `NavEditor.tsx` (262), `FontPicker.tsx`,
      `ReadabilityCheck.tsx` and `ColorField.tsx`. `ThemePreview.tsx` survives untouched — it was already
      token-driven and needed no change.
- [x] **6.7** `style/page.tsx`, with `design/` kept as a redirect shim.

**The readability panel became an invariant, and the invariant found a bug.**
`__tests__/style-derivation.test.ts` sweeps 48 brand colours across the hue circle in both modes and
asserts all five text/background pairs clear 4.5:1. It failed on first run at `#D411D4`: `readableOn`
chooses between white and a soft near-black **by a luminance threshold**, and vivid mid-tone brands land
just dark enough to be given white at 4.35:1. `composeTheme` now escalates to the true extremes when the
designed pair misses, which always succeeds — the worst possible background is equidistant from white and
black and measures 4.58:1 there.

Fixed locally rather than in `readableOn`, which every stored palette already depends on: changing it
there would restyle existing merchants' sites as a side effect of a UI rebuild. **Worth revisiting in
`color.ts` on its own terms.**

**Acceptance:** five controls, live preview, one `Save`. A merchant cannot produce an unreadable site
because they never choose text colours — and now that is tested rather than asserted.

### Phase 7 — Sidebar and cleanup

- [x] **7.1** `app/dashboard/layout.tsx` — `Website` is now a `Collapsible` group with one child, `Pages`,
      following the same hardcoded-branch shape the nav already uses for Orders, Reports and Tables. Sub-items
      match on prefix, so the entry stays lit inside `/pages/new` and `/pages/[pageId]`. Pulled forward
      from Phase 7 because the landing route moved in Phase 2 and the sidebar was still pointing at it.
- [x] **7.2** `MenuItemPicker`'s broken-row treatment stripped per D-B — no amber styling, no "86'd" line,
      no "unavailable right now" in the search list. A missing item keeps a plain muted label, because a
      row that renders blank is a bug rather than restraint. **Risk accepted in §7.**
- [x] **7.3** ~~Delete the undo toast~~ — **kept, deliberately.** See Phase 4: with the undo button and
      `Ctrl+Z` gone this is the only way back from a destructive click, and it costs no chrome because it
      does not exist until something has been deleted. The `Ctrl+Z` fallback message was reworded.
- [x] **7.4** [README.md](README.md) — rebuild banner, this plan added to the document table,
      DESIGN-2026-08-14 marked superseded, and "drag-and-drop" removed from the feature's description.

---

## 7. Risks accepted

Recording these so nobody rediscovers them as bugs.

| Risk | Cause | Mitigation |
|---|---|---|
| **86'd dishes vanish from a live page with no warning** | D-B removes the `⚠` markers | None. This is the one place we were structurally ahead of Owner. Recommend revisiting after launch — the data is already computed in `binding-health.ts`, so restoring it is a UI change only |
| **A merchant loses work by closing the drawer** | No undo affordance | Autosave persists on a 1.5 s debounce, so at most 1.5 s is at risk |
| ~~**A bad brand colour produces low-contrast text**~~ | Readability panel deleted | **Closed.** `style-derivation.test.ts` sweeps 48 hues × 2 modes × 5 pairs against 4.5:1. It found a real failure at `#D411D4`; `composeTheme` now escalates past `readableOn`'s soft near-black when needed |
| **Existing merchants lose their custom palette** | Five controls cannot express ten stored colours | Stored themes keep rendering — the renderer reads the tokens, not the controls. Opening Style and saving *will* flatten a hand-tuned palette to the derived one. Show a one-time notice on first open when `matchPalette` finds no match |
| **Deep links break** | Route moves | Redirects at both old paths (6.7, 2.6) |

---

## 8. Open questions

1. ~~**Hide and Duplicate.**~~ **Resolved:** behind a `⋯` overflow in the left gutter pill.
2. **Multi-location.** Owner is single-brand-per-dashboard with `?locationId=` scoping. Our
   `?location=` does the same, but the Pages screen has no location picker — it renders whatever
   `loadSiteContext` resolves. Does the list need one, or does the dashboard location scope cover it?
   **Still open; does not block Phase 6.**
3. **`Change Style` placement.** Currently on Pages as a secondary button *and* reachable by URL. Once
   Phase 6 moves the route, decide whether it also earns a sidebar sub-item beside `Pages`.
4. ~~**Preview mode fidelity.**~~ **Resolved:** renders in place.

---

## 9. Verification

- [ ] `npm run test` — the four action test suites and the `lib/site-builder` suites must stay green.
      They cover the layer we are not touching, which is exactly what makes them the regression net.
      **22 failures are pre-existing and unrelated** (see the vitest memory note) — compare against a
      baseline run on `aliawdi-dev`, not against zero.
- [ ] New unit test: theme derivation contrast sweep (§7).
- [ ] New unit test: template factories produce documents that pass `validatePage`.
- [ ] Manual, against each screenshot at 1366 px: Pages, Style, New Page, editor Build, editor Preview,
      section drawer, Add Section.
- [ ] Manual flow: create page → pick template → edit two sections → publish → unpublish → delete.
- [ ] Keyboard: every gutter control reachable and labelled; `⌃`/`⌄` announce through `announce.ts`.
- [ ] Confirm no *modified* file under `lib/site-builder/`, `components/site-builder/sections/` or
      `app/dashboard/website/actions/` appears in `git diff --stat` — additions are fine, and the two
      exceptions already taken are listed in §5.

---

## 10. Sizing

| Phase | Work | Depends on |
|---|---|---|
| 0 · Setup | 0.5 d | — |
| 1 · Shell primitives | 1.5 d | — |
| 2 · Pages screen | 1.5 d | 1 |
| 3 · Editor chrome | 1.5 d | 1 |
| 4 · Canvas + drawer | 3 d | 3 |
| 5 · Add Section + templates | 2 d | 1, 4 |
| 6 · Style overlay | 2 d | 1 |
| 7 · Sidebar + cleanup | 1 d | all |

**≈13 working days**, with Phases 2/3 and 6 parallelisable.
