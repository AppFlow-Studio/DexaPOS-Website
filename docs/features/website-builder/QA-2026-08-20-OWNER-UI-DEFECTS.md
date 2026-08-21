# QA — Website section (Owner UI), browser sweep 2026-08-20

**Branch:** `feat/website-owner-ui` · **Build:** local dev (Next 16.2.12, Turbopack) · **Driver:** Playwright MCP
**Account:** merchant `mikedoe+clerk_test@gmail.com` — *Joes Coffee Shop*, brand site `joes-coffee-shop.dexaposai.com`
**Viewports:** 1440×900 (primary), 820×900, 420×860 · **Themes:** light + dark
**Screenshots:** [`qa-2026-08-20/`](qa-2026-08-20/) — 41 captures, referenced per finding

**Scope covered:** Pages list · page editor (Build + Preview) · section drawers (Hero, Header/Navigation, Form) ·
Add Section modal · Page settings + SEO panel · New Page · Style · Events · Forms · Tracking · Website settings ·
public site at `/sites/joes-coffee-shop`.

> **This document is findings only. No code was changed.**

---

## 0. Summary

| Severity | Count | What they are |
|---|---|---|
| 🔴 P1 — broken / data loss / reaches visitors | 7 | Published nav 404s, wrong brand name on the live site, silent Create failure, silent Style discard, editor unusable on mobile, page names unreadable on mobile, blocker popover covers the canvas |
| 🟠 P2 — feature works but visibly wrong | 11 | Image previews never load, duplicated image controls, no focus trap, ⌘K escapes the editor, blocker popover z-order, Forms status opacity, others |
| 🟡 P3 — polish / consistency | 14 | Icon reuse, native `<select>`/`<input type=date>`, US/UK spelling mix, drawer clipping, label glitches, preselected modal state |

Console is **clean of errors** on every surface visited (0 errors; the 3 warnings are pre-existing Clerk dev-key
and `next/image` `objectFit`/`sizes` notices on the org logo, unrelated to this feature).

---

## 1. 🔴 P1 — must fix

### P1-1 · The published site's own navigation links to a page that 404s
**Where:** header nav on every published page · Navigation drawer ([13](qa-2026-08-20/13-header-hover.png), [14](qa-2026-08-20/14-nav-row-menu.png))

The nav contains **Career**, whose page status is **Unpublished**. Verified anonymously against the running app:

```
200  /sites/joes-coffee-shop
200  /sites/joes-coffee-shop/about-us
404  /sites/joes-coffee-shop/career      <-- linked from the live header
404  /sites/joes-coffee-shop/careers
```

`curl` on the live home page confirms the dead link is really in the shipped markup:
`href="/sites/joes-coffee-shop/career"`.

The Navigation drawer's link rows show only `Career · Page · /career` — **no status, no warning, nothing that
tells the merchant this link is dead.** Nav is also explicitly outside the draft/publish cycle ("Changes to the
navigation … go live as soon as you save them"), so a dead link goes live instantly with no publish gate.

**Wanted:** show publish status on each nav link row; warn (or block) on saving a link to an unpublished page;
optionally auto-drop unpublished targets at render time.

---

### P1-2 · The merchant brand site is branded with a single location's name
**Where:** canvas header + footer, everywhere ([07](qa-2026-08-20/07-editor-build.png), [12](qa-2026-08-20/12-fixit-drawer.png), [19](qa-2026-08-20/19-new-page.png), [23](qa-2026-08-20/23-style.png))

The site is **merchant-scoped** (`joes-coffee-shop`), but every surface renders **"Downtown Hamra"** — one of the
merchant's five storefronts. On the live public page the merchant's own name never appears once:

```
$ curl -s .../sites/joes-coffee-shop | grep -oE '(Downtown Hamra|Joes Coffee Shop)' | sort | uniq -c
     10 Downtown Hamra
```

Header brand, footer address block and the `© 2026 …` line all carry the location name. For a multi-location
merchant this is the wrong brand on the one page the whole "one site per merchant" SEO rationale is built around.

---

### P1-3 · Creating a page with an address that already exists fails silently
**Where:** New Page ([20](qa-2026-08-20/20-new-page-dup.png), [21](qa-2026-08-20/21-create-duplicate-error.png))

Typing `About us` (a page that already exists) enables **Create**. Clicking it fires the server action
(`POST /dashboard/website/pages/new → 200`) and then **nothing happens**: no toast, no inline error, no loading
state, no navigation. The user is left staring at an unchanged form with no idea it failed.

Format validation *is* wired up — typing `!!!` gives a proper inline
*"That name cannot be turned into a page address."* and disables Create ([22](qa-2026-08-20/22-invalid-name.png)).
Only the uniqueness/server-error path is swallowed.

**Wanted:** surface the returned `{ error }` (inline under the field, matching the existing validation style),
and ideally pre-check the slug against existing pages so Create is disabled before submit.

---

### P1-4 · Closing Style discards unsaved changes with no warning
**Where:** Style ([24](qa-2026-08-20/24-style-color.png))

Style has no autosave — it has an explicit **Save**. Changing the brand colour to `#D411D4`, then pressing
**Close**, navigates straight back to Pages and **throws the change away silently**. No confirm dialog, no
"unsaved changes" toast, no dirty-state marker on the Close button.

Every other write surface in this feature either autosaves (page editor) or shows a sticky Discard/Save bar
(Tracking). Style is the odd one out and is the one where loss is silent.

---

### P1-5 · The section editor is unusable below ~900 px; unusable at all on mobile
**Where:** page editor ([37](qa-2026-08-20/37-editor-820-dark.png), [38](qa-2026-08-20/38-editor-420.png))

The edit / delete / move-up / move-down controls live in the **gutters outside the canvas**. As the viewport
narrows the gutters vanish and the controls go with them. Measured in the DOM at 420 px:

```
editControls: []          // zero Edit/Delete/Move buttons exist in the document
modeButtons: 2            // Build/Preview exist but are visually hidden
```

At 420 px a merchant can open the editor, scroll the canvas, and do **nothing else** — no section can be edited,
deleted or reordered, and Preview cannot be reached. At 820 px the controls survive but are jammed into a ~55 px
gutter. There is no fallback affordance (no on-section overlay, no bottom sheet, no long-press menu).

---

### P1-6 · The Pages list truncates page names to 2–3 characters on mobile
**Where:** Pages at 420 px ([39](qa-2026-08-20/39-pages-420.png))

The rows render as `Ho…`, `Ab…`, `Ca…`, `Ca…` — the two Career/Careers rows are literally indistinguishable —
while the `Updated` and `Status` columns keep their full width. The search input collapses to ~30 px showing
`Se`. The table gives secondary metadata priority over the row's identity and never collapses columns.

---

### P1-7 · The publish-blocker popover permanently covers the canvas, in every mode, above every scrim
**Where:** page editor, all screenshots from [07](qa-2026-08-20/07-editor-build.png) onward

The blocker (*"Choose a form or hide the Form section before publishing."*) is an always-on
`absolute right-0 top-full z-10` panel under the Publish button. Measured:

```
popover   x 1136 → 1424,  y  51.5 → 141.5
headerCTA x 1120 → 1240,  y 112   → 156     // "Order Now" — overlapped
```

Consequences observed:
- It **obscures the site header's CTA button** at every viewport; at 420 px it covers the entire header ([38](qa-2026-08-20/38-editor-420.png)).
- It **persists in Preview mode** ([15](qa-2026-08-20/15-preview-mode.png)), which is supposed to be a clean render.
- It **floats above the Add Section modal's dimmed scrim** ([16](qa-2026-08-20/16-add-section-modal.png)) and above the ⌘K command palette ([41](qa-2026-08-20/41-cmdk-in-editor.png)) — it is the brightest thing on a dimmed screen.
- It has **no dismiss control**.

It should be a Publish-button popover (opened on hover/click or on a failed publish attempt), hidden in Preview,
and below any modal scrim.

---

## 2. 🟠 P2 — works, but visibly wrong

### P2-1 · Image previews never load until the photo picker is opened
**Where:** Events edit modal ([26](qa-2026-08-20/26-event-edit.png), [27](qa-2026-08-20/27-event-edit-loaded.png), [28](qa-2026-08-20/28-photo-picker.png)); Hero drawer carousel ([40](qa-2026-08-20/40-hero-drawer.png))

The Edit-event **Photo** field sits on `Loading…` indefinitely — still stuck after a 3 s wait, with no `<img>` in
the DOM at all:

```html
<button …><span class="flex h-28 items-center justify-center …">Loading…</span></button>
```

The same image renders fine as the row thumbnail one layer up. Opening **Replace** → *Your photos* makes the
preview resolve immediately, which points at the asset list being fetched only on picker-open while the preview
resolves its asset id against that list.

The Hero drawer's **Carousel** list has the same root cause and is worse: three rows, all labelled `Photo`, all
grey placeholder squares, `document.querySelectorAll('aside img').length === 0`. Reordering or deleting a
carousel photo is pure guesswork.

### P2-2 · Hero has two competing image controls with no explanation
**Where:** Hero drawer ([40](qa-2026-08-20/40-hero-drawer.png))

A single **Image** dropzone (*"Choose a photo"*) sits directly above a **Carousel 3/5** list. The canvas renders
the carousel; the single Image field appears inert. Nothing tells the merchant which one wins or that setting one
disables the other.

### P2-3 · The "full-screen" overlay is not a focus trap and does not hide the app from assistive tech
**Where:** page editor, Style, New Page, Form editor

The entire dashboard chrome stays reachable behind the overlay. Measured inside the open editor:

```
Orders, Menus, Get Help, Toggle Sidebar, All Locations ×2, Toggle theme, Search (⌘K)
→ every one:  tabIndex 0 · NOT inert · visible to AT
```

Keyboard and screen-reader users tab straight out of the editor into hidden navigation. Needs `inert` /
`aria-hidden` on the app shell (or a real `role="dialog"` + focus trap) while an overlay is open.

### P2-4 · ⌘K opens the global command palette inside the editor and offers to navigate away
**Where:** page editor ([41](qa-2026-08-20/41-cmdk-in-editor.png))

Pressing `Ctrl/⌘+K` with a section drawer open pops the dashboard palette over the canvas, listing *Dashboard,
Orders, Menus, Staff*. Direct consequence of P2-3. The editor should suppress global hotkeys.

### P2-5 · Two Form sections on one page, and the blocker cannot say which
**Where:** Home page ([11](qa-2026-08-20/11-form-section.png), [12](qa-2026-08-20/12-fixit-drawer.png))

The page has a fully configured Form section *and* a second, unconfigured one. The blocker copy reads
*"Choose a form or hide the Form section"* (singular, unqualified), so it directly contradicts the visible,
working form the merchant is looking at. **Fix it** does jump to the right section — but only after the merchant
has already been told something untrue. Name or count the offending section in the message.

### P2-6 · The form picker lets you select an unpublished form, with no consequence shown
**Where:** Form section drawer ([12](qa-2026-08-20/12-fixit-drawer.png))

```
options: "Choose a form…" | "Revwing our food" | "What is your opinion in our food (not published)"
```

The "(not published)" suffix is the only signal, it is not a warning, and selecting it is not blocked. Compare
P1-1 — the same class of "publish something that points at nothing".

### P2-7 · Empty bound sections publish silently; only Form is a blocker
**Where:** Home canvas ([10](qa-2026-08-20/10-mid-hover.png), [12](qa-2026-08-20/12-fixit-drawer.png))

*Guest Favorites* renders **"No items to show yet. Pick some from your menu."** and the FAQ section renders
**"Add the questions guests ask most."** — both dashed empty-state boxes that will publish as empty blocks. The
empty Form section blocks publishing; these do not. The rule is inconsistent and undocumented in the UI.

### P2-8 · Forms status is unstyled, unexplained, and inconsistent with Pages
**Where:** Forms ([29](qa-2026-08-20/29-forms.png))

Statuses read **"Not used"** and **"Not published"** as plain grey text — no pill, no colour, no dropdown, no
tooltip, and nothing that explains the difference between them. Pages renders the same concept as a coloured
pill-with-chevron ([01](qa-2026-08-20/01-pages-list.png)). Same feature, two visual languages.

### P2-9 · The Style preview shows invented content, not the merchant's site
**Where:** Style ([23](qa-2026-08-20/23-style.png), [24](qa-2026-08-20/24-style-color.png))

The preview shows *"Food worth coming back for"*, *"Signature plate / House favourite / Chef's pick"*, three grey
empty image boxes and a fake nav (`Menu · About · Contact`) — none of which matches the merchant's real pages
(`Home · About us · Career`) or real sections. A merchant changing brand colour cannot see the effect on anything
they actually published. The grey boxes also read as broken images.

### P2-10 · In dark mode the Style preview merges into the dashboard
**Where:** Style, dark ([36](qa-2026-08-20/36-style-dark.png))

The site's own theme is Dark and the dashboard is dark, and the preview has no frame or device chrome — so the
boundary between "your website" and "the app" disappears. The panel's own **Light / Dark** control then reads as
if it were the app theme toggle.

### P2-11 · The Form editor preview ignores the site's style entirely
**Where:** Form editor ([30](qa-2026-08-20/30-form-editor.png))

The preview renders in the **dashboard's light theme** with default square inputs, while the same form on the
actual site is dark with brand-red controls ([11](qa-2026-08-20/11-form-section.png)). The **Send** button in the
preview has no button styling at all — grey text on white, which reads as disabled/broken.

---

## 3. 🟡 P3 — polish and consistency

### Navigation & shell
1. **The Website sidebar group opens below the fold.** It expands correctly on navigation (`data-state="open"`,
   sub-list 160 px tall) but sits at `y 721 → 913` in a 900 px viewport, so the active child is invisible until
   you scroll. Nothing scrolls it into view. ([01](qa-2026-08-20/01-pages-list.png) vs [02](qa-2026-08-20/02-sidebar-website-group.png))
2. **Style has no sidebar entry.** Sub-items are `Pages · Events · Forms · Tracking · Settings`; Style is only
   reachable via a button on the Pages screen, so from inside Events or Forms it is unreachable without going back.
3. **The dashboard top bar still says "Merchant Dashboard"** on every Website screen — no page context.
4. **Content container widths differ per screen** — Pages card `369→1327`, Tracking card `489→1193`. Same group,
   three different measures. ([01](qa-2026-08-20/01-pages-list.png), [31](qa-2026-08-20/31-tracking.png))
5. **On Tracking the app header scrolls away** while the sidebar stays fixed. ([33](qa-2026-08-20/33-tracking-typed.png))
6. **The Tracking sticky save bar bleeds over the sidebar** — it spans the full viewport with a translucent
   background, so sidebar content ghosts through behind *"These go live on your website…"*. ([33](qa-2026-08-20/33-tracking-typed.png))
7. **Events/Forms use centred modals** while Pages/Style/New Page use the full-screen overlay chrome — two
   different shells inside one feature. ([26](qa-2026-08-20/26-event-edit.png))
8. **Overlay top bars use three different primary labels** for the same slot: `Publish ⊕`, `Save ✓`,
   `Create →`, `Publish changes 🚀`. The Form editor also drops the Build/Preview control with no substitute.

### Add Section modal ([16](qa-2026-08-20/16-add-section-modal.png))
9. **Seven of fourteen kinds share one generic `layout-grid` icon** — Cards, Reviews, Scrolling Banner, Video,
   PDF, Form, Events are visually identical. Only Content, Gallery, Popular Items, Highlights, Integrations, FAQ
   and Location & Hours have real glyphs. Scannability is the whole point of an icon grid.
10. **PDF is disabled with the reason hidden in `aria-label` only** (*"Document uploads are not available yet."*)
    — nothing visible explains the grey row.
11. **`Content` is preselected on open**, so a stray second click adds a section the merchant never chose. Owner's
    two-step commit assumes an empty start with `Add` disabled.
12. **Selection has no ARIA state** — the grid is plain buttons with a check icon, no `role="radiogroup"` /
    `aria-checked`. (The Hero drawer's Variant control *does* do this correctly — copy that.)
13. **Article grammar in labels:** *"Add a Events section"*, *"Add a Integrations section"*, *"Add a FAQ section"*.

### Drawers
14. **The Form drawer's header reads `Form` / `Form`** — the kind label is used as both title and subtitle. Hero
    does this properly (`Great coffee, right around th…` / `Hero`). ([12](qa-2026-08-20/12-fixit-drawer.png))
15. **The form picker is a raw native `<select>`** with no label above it, while every sibling field has a label
    and the app uses the shadcn `Select` everywhere else.
16. **Fixed `Done` button clips the last field.** Seen on the Header drawer (`Order button label 9/40` cut off,
    [13](qa-2026-08-20/13-header-hover.png)), the SEO panel (`Hide from search` toggle cut off,
    [18](qa-2026-08-20/18-seo-panel.png)) and the Hero drawer (`Add a photo 3/5` half-hidden,
    [40](qa-2026-08-20/40-hero-drawer.png)).
17. **Drawer scrollbar appearance re-wraps the text beside it** — the Web-address help text reflows when the
    Search & sharing panel expands. ([17](qa-2026-08-20/17-page-settings.png) → [18](qa-2026-08-20/18-seo-panel.png))
18. **The 150-char Heading field is a single-line input** that truncates mid-word at ~29 characters
    (`Great coffee, right around tl`) with no way to see the whole value. ([40](qa-2026-08-20/40-hero-drawer.png))
19. **Variant options `Classic | Bistro | Spotlight` are three unexplained words** — no preview, no description.
20. **`optional` is jammed onto labels** with no separator — `Search & sharing optional`, `Description optional`.
21. **The edited section's hover pencil stays visible in the seam** beside the open drawer.
22. **Clicking `Close` while a drawer is open exits the whole editor**, not the drawer.

### Events & photos
23. **Native `<select>` and `<input type=date>` / `<input type=time>`** in the Edit-event modal — browser-default
    chrome inside an otherwise designed app. ([26](qa-2026-08-20/26-event-edit.png))
24. **"Save changes ⊕"** — a plus icon on a save action; should be a check.
25. **Photo is marked *Required* yet offers a *Remove* button** directly beneath the requirement notice.
26. **Row delete is a bare trash icon with no confirmation** and no column header. ([25](qa-2026-08-20/25-events.png))
27. **The photo library deletes assets with one unconfirmed click**, and shows no indicator of which photo the
    event is currently using, no filenames, and empty *"Describe this photo"* alt-text on all three assets.
    ([28](qa-2026-08-20/28-photo-picker.png))
28. **The library is a modal stacked on a modal**, both scrims visible.
29. **Events has no status column** — nothing says whether an event is showing on the site.
30. **Opening the Edit-event modal fires 5 server-action POSTs** (`153, 155, 156, 157, 161`), 11 on the screen in
    total. Worth checking for a render loop.

### Pages list & misc
31. **The no-results state is a tall empty band with centred text and no icon** and the search box has no clear
    (✕) affordance. ([04](qa-2026-08-20/04-search-empty.png))
32. **Status dropdowns are left-shifted off their pill** and overlap the row beneath.
    ([05](qa-2026-08-20/05-status-dropdown.png), [06](qa-2026-08-20/06-unpublished-dropdown.png))
33. **The Pages rows have no overflow menu** — rename and delete are only reachable by opening the editor and
    clicking the title, which is not a discoverable location.
34. **`?location=…` is silently dropped** from the editor URL after an Escape keypress.
35. **Mixed US/UK spelling across the feature** — `programme` and `Guest favourites` and `aria-label="Brand
    colour"` sit beside `Brand Color`, `Customer reviews`, `Popular Items`.
36. **Titles font offers three options** (Sans serif · Serif · Condensed) where the plan's D-A specifies four.
37. **Style's Logo field is two stacked boxes** — a *"No logo yet"* placeholder card *and* a *"Choose a photo"*
    dropzone below it. One control, please. ([23](qa-2026-08-20/23-style.png))
38. **The hero carousel autoplays inside the Build canvas**, so the section changes under the merchant while they
    work (and makes any before/after comparison unreliable).

---

## 4. Things that are working well

Worth keeping intact through any rework:

- **Nav editing exists again** and works (add Page / add Link, reorder, delete, and an honest warning that nav
  changes bypass the draft). The `NAV IS A LIVE HOLE` note in project memory is now out of date — the hole is no
  longer *missing UI*, it is P1-1's *missing validation*.
- Search, empty state, and status dropdowns on Pages all behave.
- Inline slug validation on New Page, with a live `/about-us` preview and a live-updating template preview.
- Character counters (`38/150`, `0/500`) throughout the drawers.
- The readability guarantee holds — `#D411D4` produced black-on-magenta button labels, not the 4.35:1 white.
- Tracking's Discard/Save sticky bar is the clearest write pattern in the feature; Style should adopt it.
- Home's status pill correctly has no chevron (cannot be unpublished); home's web address is correctly locked.
- Dark mode is honest on Pages, Style and the editor — semantic tokens are holding.
- **Zero console errors** on every surface exercised.

---

## 5. Suggested order of work

1. **P1-1 and P1-2** first — they are the two defects a real visitor sees on a real published site.
2. **P1-3, P1-4** — silent failure and silent loss; both small, both erode trust fastest.
3. **P1-7 + P2-3 + P2-4** as one "overlay correctness" pass — the popover, the focus trap and the hotkey leak are
   the same underlying problem (the overlay does not actually own the screen).
4. **P2-1** — one fix (resolve asset previews without opening the picker) repairs both Events and the Hero carousel.
5. **P1-5, P1-6** as one responsive pass.
6. P3 as a sweep, starting with the Add Section icon set (P3-9) since it is the most-seen screen.

---

## 6. Fix log

Started 2026-08-21. Two design forks were put to the team lead and answered:

- **Brand name** → an editable field, defaulting to the merchant name.
- **Nav safety** → **editor warnings only**, no render-time filter. Accepted consequence, stated plainly:
  a dead link already stored on a live site stays live until a merchant opens the NavEditor. The editor is
  therefore built to make that link impossible to miss and one click to remove, rather than a passive badge.

### A · P1-2 — the brand site's own name

| # | Item | State |
|---|---|---|
| A1 | `brand.name` on `siteBrandSchema` + `resolveBrand` (free-form jsonb; **no migration**) | ✅ |
| A2 | Migration `20260824120000_website_brand_name.sql` — `get_public_site_page` also returns `merchant_name` | ✅ written, ⬜ **not applied** |
| A3 | Carry `merchantName` through `PublicSitePageRow` → `SiteRequestFacts` → `RenderDecision` | ✅ |
| A4 | `public-context.ts` — resolved through the shared `siteDisplayName` | ✅ |
| A5 | `site-context.ts` — same function, so the editor matches the public page | ✅ |
| A6 | "Business name" field in Website settings | ✅ |
| A7 | Tests — 15 new, in `site-settings.test.ts` | ✅ |

**Precedence, decided once in `siteDisplayName`:** merchant's own setting → `merchants.name` →
a borrowed storefront's `store_name` → `"Our restaurant"`. Logo, hero and phone still borrow from a branch;
the name no longer does.

**Verified in the browser 2026-08-21.** The editor canvas now reads *Joes Coffee Shop* in the header and
`© 2026 Joes Coffee Shop` in the footer ([fix-05](qa-2026-08-20/fix-05-brand-name-editor.png)); the settings
field shows the merchant name as its placeholder so the default is visible
([fix-06](qa-2026-08-20/fix-06-business-name-field.png)). One "Downtown Hamra" remains on the page, inside a
**Location & Hours** section beside that branch's street address and phone — which is correct and deliberately
untouched.

🔴 **The public page still shows the old name until the migration is applied.** The editor reads `merchants`
directly, so it was fixed the moment the code shipped; the public renderer cannot, because `anon` has no grant
on `merchants` and must not get one. Confirmed the pre-migration path degrades rather than breaks:
`/sites/joes-coffee-shop` still returns HTTP 200, `merchant_name` reads as null and the resolver falls through
to the storefront name — exactly today's behaviour.

### B · P1-1 — nav links to unpublished pages

| # | Item | State |
|---|---|---|
| B1 | Per-row dead-link warning in `NavEditor` (the picker already warned; saved rows never did) | ✅ |
| B2 | Summary banner + one-click remove for every dead link | ✅ |
| B3 | Tests — 9 new, in `nav-sync.test.ts` | ✅ |

**The QA note was half wrong and the code is better for it.** `syncNavForPage` *does* already append on publish
and remove on unpublish (`publish.ts:266`), so "nothing keeps nav true" was not the bug. Three real gaps let a
dead link survive anyway: the ⊕ Page picker offers unpublished pages on purpose, the sync is best-effort inside
a `try`/`catch` so a failed write is silent, and any site built before the sync carries whatever it carried.
`navLinkStatus` and `deadNavLinks` in `lib/site-builder/nav.ts` now answer the question the editor was never
asking.

**Verified in the browser 2026-08-21** against Joes' real dead link: the drawer names *Career* in a destructive
banner, marks the row `⚠ Not published · /career` — status first, so the drawer's 256px truncation can never eat
the warning — and **Remove this link** drops it, taking the count `3/8 → 2/8` and flipping the footer to *Save
navigation* ([fix-03](qa-2026-08-20/fix-03-nav-row.png), [fix-04](qa-2026-08-20/fix-04-nav-repaired.png)).
Left unsaved: it is the merchant's live data, and per the decision above the repair is theirs to commit.

### C · P2-1 — Hero "Overlay opacity" slider is inert in the `bistro` variant

Found 2026-08-21 while answering a question about hero carousel width. The width was correct;
the slider next to it was not.

| # | Item | State |
|---|---|---|
| C1 | `hero.hiddenFields` drops `overlayOpacity` when `variant === "bistro"` | ✅ |
| C2 | Tests — 2 new, in `capabilities.test.ts` | ✅ |

`HeroSection` renders the darkening scrim — and so reads `overlayOpacity` — only in the
`classic`/`spotlight` branch (`HeroSection.tsx:101`). `bistro` sets the copy *beside* the photo in a
`md:grid-cols-2` split, so it has no text over the image to protect and draws no scrim. The drawer is
generated from the Zod schema, so it showed the slider for every variant regardless: a merchant on
`bistro` could drag it to 51 and watch the preview not move.

**Hidden, not disabled,** matching the `content` section's background/media controls and the gutter
principle already recorded above. The stored value is deliberately left intact, so switching back to
`classic` restores the merchant's setting rather than silently resetting it to the 35 default.

Fixed with the `hiddenFields` hook that already existed for `content` and `video` — the drawer's
consumption path (`SectionDrawer.tsx:127-130`) recomputes on every prop change, so the slider
appears and disappears in the same interaction as the variant switch, no new wiring.

**Not browser-verified.** The registry contract is covered by a test proven to fail without the fix;
the drawer half of the path is shared, already-QA'd code exercised by the `content` section.

**Also noted, not fixed:** with `Image` empty and `Carousel` populated, `hasPrimary` falls back to
`ctx.site.heroImageUrl` (`HeroSection.tsx:150`), so frame 1 of the rotation is the storefront's
legacy hero and the merchant's chosen photos are frames 2–n. Defensible as the never-blank
guarantee, but likely surprising. Needs a product call before changing.

### D · P1-2 — Style preview's footer does not change with Light/Dark

Reported 2026-08-21: *"the footer color is not changing when I'm changing the theme."*

| # | Item | State |
|---|---|---|
| D1 | `ThemePreview` footer repainted with `surfaceMuted`/`text` + `border`, matching `FooterSection` | ✅ |
| D2 | `ThemePreview` hero repainted with `surfaceDark`/`textOnDark`, matching the `classic` hero | ✅ |
| D3 | Preview CTAs matched to `CtaButton` (brand primary, `currentColor` outline secondary) | ✅ |
| D4 | Stale "the footer band" comments on `surfaceDark` corrected in `color.ts` | ✅ |
| D5 | Tests — 3 new, in `render.test.tsx` | ✅ |

**The real footer was never broken.** `FooterSection` paints `--site-surface-muted` over `--site-text`,
which inverts correctly: `#F3F3F4` on near-black in light mode, `#1C1E22` on near-white in dark. The bug
was in the *picture* — `ThemePreview` painted its footer band with `surfaceDark`, and `surfaceDark` is
**deliberately dark in both modes** (`#0F1522` light → `#08090C` dark; it is the `classic`/`spotlight`
hero band, the scrolling banner, and the `dark` section background). Toggling Light/Dark moved it by an
imperceptible amount, so the only footer the merchant could see while choosing a theme appeared frozen.

The drift was seeded by a comment: `deriveThemeColors` still described `surfaceDark` as "the footer band",
which is what the footer used before it moved to the muted band. The comment outlived the code and the
preview was written against it. Both comments now say what the token is actually for.

Fixing the footer alone would have left `surfaceDark`/`textOnDark` unexercised by the preview, defeating
its stated purpose of showing every derived colour before publish. So the hero band took over that job —
which is also *more* truthful, since the starter page ships a `classic` hero and that is exactly the
token it renders.

**Not browser-verified** (no dev server this session). Verified by rendering `ThemePreview` through
`renderToStaticMarkup` in both modes and asserting the footer band carries `FooterSection`'s tokens and
differs between modes; confirmed the test fails against the pre-fix component.
