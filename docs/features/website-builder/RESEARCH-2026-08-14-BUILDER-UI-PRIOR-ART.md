# Research — builder UI prior art

**Date:** 2026-08-14
**Author:** Ali Awdi (with Claude)
**Method:** Mobbin MCP, four `search_screens` sweeps on `platform: web`, `mode: deep`
**Consumed by:** [DESIGN-2026-08-14-BUILDER-UI.md](DESIGN-2026-08-14-BUILDER-UI.md)

A survey of how shipped products solve the four problems the builder has: **structure panel**, **insert affordance**,
**inspector**, and **publish / rollback**. Every row links to the exact screen on Mobbin so it can be inspected
directly.

---

## 1. The finding that matters — two reference classes

The sweep returned two families, and they are not interchangeable.

| Family | Products | Model |
|---|---|---|
| **Free-canvas design tools** | Figma Sites, Framer, Webflow, Readymag | Absolute positioning, arbitrary nesting, a class/style engine, designer audience |
| **Section-based theme editors** | **Shopify**, Squarespace, Uvodo, Salesforce | Fixed section vocabulary, zone-constrained ordering, live commerce data, merchant audience |

**We are in the second family, and it is not close.** Decisions
[A1, A3, A11](HANDOFF-2026-08-13-BUILD-SESSION.md#33-architecture) — one atomic JSON document, a discriminated union
of 9 fixed kinds across 3 zones, drag-and-drop in the layers panel rather than the canvas — are precisely the
constraints that define a theme editor and precisely what a free-canvas tool rejects.

The audience fact settles anything the architecture doesn't: **the user is a restaurant owner, not a designer.** That
alone disqualifies Webflow's and Figma's information architecture, whatever their craft.

> **Practical consequence:** Shopify's theme editor is the closest shipped analogue to what we have built, and should
> be the default answer to "how should this work?" unless there is a specific reason to deviate. `RESEARCH-OWNER-COM.md`
> covers the reference product for the *offering*; this covers the reference products for the *editor*.

---

## 2. Tier 1 — direct peers

Section-based, live commerce data, embedded in a merchant dashboard. **Inspect these first.**

| Product | Screen | What to look at |
|---|---|---|
| **Shopify** theme editor | [screen](https://mobbin.com/screens/0d104579-3bee-41f5-b33f-3eef140f0568) | **Closest match in the entire sweep.** Left rail is a tree grouped by *zone* — `Header` (Announcement bar, Header), `Template` (Image banner → nested blocks, Featured collection), `Footer` — with an inline `+ Add section` **inside each zone group**, and `+ Add block` nested within a section. Section rows are labelled with the merchant's own content, not the kind name. Toolbar carries an inspector on/off toggle (`⌘⇧I`). `Live` badge on the theme name. |
| **Uvodo** | [screen](https://mobbin.com/screens/d941bfd4-f403-4502-89f6-5e7df4c133aa) | Left rail as *drill-in settings groups* (LOGO, BANNER TITLE, PRODUCTS SECTION, … SEO) instead of a persistent third column. This is the narrow-viewport answer. Also: `save` and `publish` as two distinct buttons — note they do **not** autosave. |
| **Salesforce** page designer | [screen](https://mobbin.com/screens/2b50c227-df93-498b-ac15-305c0c20b925) | `Styles` / `Content` tabs splitting one panel — the split needed once per-section settings and site-wide theme tokens both want a home. Toolbar: Exit, Preview, undo/redo, device toggles, Save + **Publish as the primary action**. |
| **Squarespace** pages rail | [screen](https://mobbin.com/screens/8e63e795-8387-4194-8307-5f387a0c261a) | The multi-page structure we have modelled in schema but not built: pages grouped `Main Navigation` / `Not Linked` / `Deleted Pages`, per-page status badges (`Paywalled`), inline `+ ADD PAGE`. Canvas shows the real site with an `EDIT` overlay. |
| **Squarespace** styles panel | [screen](https://mobbin.com/screens/eb4edb72-972b-47f2-b951-b30d39cf99fc) | Theme-token editing, plus the two escape hatches at the bottom: `RESET STYLES TO DEFAULTS`, `SET ALL TO SYSTEM FONTS`. Relevant to `ThemeTokens` and the `--site-*` custom properties. |

---

## 3. Tier 2 — insert affordances

| Product | Screen | What to look at |
|---|---|---|
| **Squarespace** "Add a Section" | [screen](https://mobbin.com/screens/043d9866-d11c-4729-a54e-c86c1b84e3d4) | Left **category rail** (`Introduce`: Intro/About/Contact/Team/FAQs · `Sell`: Products/Services/Scheduling · `Showcase`: Images/Portfolio/Testimonials), search, grid/list toggle, sort, plus `Add Blank` and `Saved`. A flat grid works at 9 kinds and fails at 17. |
| **Flodesk** "Add a block" | [screen](https://mobbin.com/screens/5b916b2f-49a4-44a7-82b7-f938a25a719d) | Category list + **actual rendered layout thumbnails** rather than icons. The strongest argument in the sweep against an icon-and-label grid: a merchant picking "Hero" wants to see a hero. |
| **Confluence** "Browse" | [screen](https://mobbin.com/screens/e2984777-9017-4d3a-a21f-ed53118596b7) | Nearest to what we ship today (icon + name + description grid) but with categories, per-item keyboard-shortcut badges, and a `⏎ Enter` affordance in the search field. |
| **Dribbble** concept "Insert block" | [screen](https://mobbin.com/screens/9eac1d95-8a5a-47c6-b731-03fb78f0998b) | The **`+ Insert Block` divider between sections**. Best insert affordance in the sweep — it states insertion position without a word of UI. |
| **PandaDoc** Content Library | [screen](https://mobbin.com/screens/6b2923d5-6fe0-4968-8c9c-d6ba9b749441) | For an eventual "saved sections" feature: `#tag` search, `My content` / `Shared with me` / `Made by PandaDoc`, thumbnail grid. |

---

## 4. Tier 3 — publish, versioning, rollback

Stage 5 is unbuilt, so this tier is the most directly actionable.

| Product | Screen | What to look at |
|---|---|---|
| **Resend** | [screen](https://mobbin.com/screens/450e76cf-4e4c-420b-9802-9831819df1d4) | **The copy match for decision A2.** Verbatim: *"This will create a new version with the content from the selected one. Your current content will be preserved in Version History."* That is append-only rollback stated in merchant English, and it converts an action that sounds like data loss into one that plainly isn't. |
| **GitBook** | [screen](https://mobbin.com/screens/39a95682-e813-42fa-b7df-fd4db3dcda2e) | Best destructive-revert design: names the exact timestamp being restored to, and offers a **point-in-time preview link before committing**. Version rail grouped Today/Yesterday with author avatars and change summaries ("merged 7 changes from change request #1"). |
| **Relevance AI** | [screen](https://mobbin.com/screens/9df6886a-73d0-4d08-a805-a2b920d71e21) | Handles the draft-vs-published distinction explicitly: *"Restore this version as draft? … Any unpublished changes will be lost."* |
| **Fibery** | [screen](https://mobbin.com/screens/eb05e8be-4a16-47f0-94fe-08ad3da74171) | `Show changes` toggle rendering an inline diff (strikethrough removals) against the version rail, with a `CURRENT` badge. |
| **Confluence** | [screen](https://mobbin.com/screens/b405410d-7a2d-4bd6-b44d-4efa934e0dec) | Version history as a full table (Version / Date / Changed By / Status / Comment / Restore·Delete), compare-two-versions, AI "Summarize differences", and a comment field on revert pre-filled `Reverted from v. 2`. **Right feature set, wrong user** — see §7. |

---

## 5. Tier 4 — wrong reference class, useful craft

Consult for control and panel detail only. Do not copy the information architecture.

| Product | Screen | What to look at |
|---|---|---|
| **Webflow** | [screen](https://mobbin.com/screens/c1498154-f859-4b9e-a7ca-ac3829b70ebd) | The `Add` panel (Elements/Layouts tabs, search, grouped palette) and the canonical nested padding/margin spacing widget. Bounds what [schema-introspect.ts](../../../lib/site-builder/schema-introspect.ts) could ever generate. |
| **Figma Sites** | [screen](https://mobbin.com/screens/b62f7a88-50de-4ef0-bd2f-a238d83dd36a) | Webpages-with-thumbnails list stacked above a Layers tree; per-page Desktop/Tablet/Mobile entries marked `Primary`. |
| **Framer** | [screen](https://mobbin.com/screens/ab923887-5ce7-4236-a9c6-d2bd250c046e) | **The right inspector has been replaced by an AI agent chat** (`Ask Framer…`). This is the shipped form of the idea behind [A6](HANDOFF-2026-08-13-BUILD-SESSION.md#33-architecture) — pure mutation reducers as the API a conversational editor drives. |
| **Retool** | [screen](https://mobbin.com/screens/f211abc2-0f81-4b6f-816c-439ca33feaac) | Component library with search, grouping, visual thumbnails and `New` badges; global `⌘K` across components, queries and actions. |
| **Readymag** | [screen](https://mobbin.com/screens/9727f0c6-e18b-4b1d-b5ed-c987786abb53) | Floating layers panel with per-layer thumbnails and animation labels ("Fade-in on scroll"). Costs keyboard accessibility; noted and rejected. |
| **The Leap** | [screen](https://mobbin.com/screens/65fccf5e-ff8a-406e-aeac-de303f6fb603) | **Starter templates (B11):** preset carousel + layout wireframes + colour swatches, with a live phone preview beside them. |
| **Gamma** | [screen](https://mobbin.com/screens/dd38c0b4-a4bc-44b9-80ca-534ce40d3bc0) | Theme editor with Colors/Fonts/Logo/Design/Images nav, logo dropzone, and a `Test page` / `Current page` preview toggle. |

---

## 6. Patterns that recur across the whole set

Convergent design is evidence. These appeared in nearly every product surveyed:

| Pattern | Seen in | Note |
|---|---|---|
| **Editor chrome is monochrome** | Shopify, Squarespace, Salesforce, Uvodo | Deliberate. The merchant's brand colour must be the only saturated thing on screen, or they cannot judge it. An editor with its own coloured primary buttons beside the canvas poisons that judgment. |
| **Structure is grouped by zone or region** | Shopify, Squarespace, Figma | Nobody ships a flat section list. Grouping makes the ordering constraint visible instead of enforcing it after the fact. |
| **Device switcher, centred in the toolbar** | Shopify, Salesforce, Uvodo, Squarespace | Universal. Resizes the frame; does not reload. |
| **Publish is the primary action, top-right** | Shopify, Salesforce, Uvodo, GitBook | Never a secondary or ghost button. |
| **Sections labelled with user content, not type** | Shopify, Framer, Squarespace | "Guest Favorites", not "Menu Highlights". The difference between a scannable list and nine identical nouns. |
| **Reset-to-default escape hatches** | Squarespace, Gamma | Generated forms let people paint themselves into corners; every mature editor ships an exit. |

---

## 7. What nobody in the sweep does — and it is our whole differentiator

Every product surveyed is an editor for a **static** page. Ours is the only one where the page is a window into a
running POS: prices, 86'd items, hours and phone numbers are live by construction
([A4](HANDOFF-2026-08-13-BUILD-SESSION.md#33-architecture), §4.2 of the handoff).

Not one of the eighteen products shows **where the live data is** or **when a live reference has broken**. They have
no reason to — there is nothing behind their pages. We do, and today we surface none of it either: an
`unavailable` or `not_found` binding is silently dropped at render, which is exactly the class of bug fixed in
handoff §6b.

Four opportunities follow, all unique to this product and none requiring anything the data model doesn't already
carry:

1. **Live-binding indicators in the structure rail** — which sections are wired to the POS, and which have a broken reference.
2. **A binding picker showing real prices and real availability**, in which bound values are conspicuously *not* editable — making [A4](HANDOFF-2026-08-13-BUILD-SESSION.md#33-architecture) self-explaining.
3. **Starter templates pre-filled with the merchant's own menu and brand colour** — Squarespace structurally cannot do this.
4. **An unpublished-change count on the Publish button itself** — free from the immutable-version model (A2). GitBook hints at it in prose; nobody puts it on the button.

These are carried into [DESIGN-2026-08-14-BUILDER-UI.md](DESIGN-2026-08-14-BUILDER-UI.md) §3 as decisions UI7, UI12,
UI15 and UI17.

---

## 8. Rejected outright, with reasons

| Rejected | Source | Why |
|---|---|---|
| Class/style-selector system | Webflow | Designer tool. The merchant has no mental model of a CSS class, and A3 leaves nothing to attach one to. |
| Numeric X/Y/W/H inspector | Figma Sites | No absolute positioning exists in the data model. Shipping the control would be a lie in the UI. |
| AI chat as the inspector | Framer | Real and reachable later via A6, but it replaces a direct-manipulation UI the merchant has not learned yet. Wrong order, not wrong idea. |
| Compare-two-versions + diff | Confluence, Fibery | Too heavy for the audience. A point-in-time **preview** answers the same question at a fraction of the cost. |
| Floating, undocked panels | Readymag | Forfeits the keyboard reordering that a docked dnd-kit rail gives free — the accessibility argument behind A11. |
| Canvas drag-and-drop | Webflow, Framer, Figma | A11 was right the first time; the layers-panel implementation is simultaneously simpler and the accessible one. |

---

## 9. How to re-run this

The Mobbin MCP server is registered at user scope (`https://api.mobbin.com/mcp`, HTTP transport, OAuth). Queries used:

```
search_screens  platform=web  mode=deep
  "website builder editor with left layers panel, center page canvas preview, and right properties sidebar"
  "add block panel with searchable list of section templates to insert into a page"
  "online store theme editor with section reordering sidebar and live storefront preview"
  "publish website changes confirmation with version history and revert to previous version"
```

`search_flows` was **not** run. It returns multi-step journeys rather than single frames and is the obvious next
sweep for the add-section → configure → publish path, and for first-run template selection.
