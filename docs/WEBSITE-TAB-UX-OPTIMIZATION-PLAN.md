# Website Tab UX Optimization Plan

## Scope

This plan optimizes only the **Website** tab: the merchant-facing experience for creating, editing, previewing, and publishing a branded restaurant website.

The **Online Store** remains a separate product. The Website may include an **Order Online** call to action, but it must not configure the menu, cart, checkout, pricing, payments, order status, or fulfillment.

## Product Goal

Enable a restaurant owner with no design experience to publish a credible, mobile-ready website in one focused session, then confidently improve it over time.

The merchant should always be able to answer:

1. What should I do next?
2. What will visitors see?
3. Is my website ready to publish?
4. Where does the Order Online button lead?

## Current Builder Strengths to Preserve

The existing builder already has several strong foundations:

- Section-based editing rather than an overwhelming blank canvas.
- Dedicated content and style controls.
- Desktop, tablet, and mobile preview modes.
- Autosave, save-state feedback, undo/redo, and conflict handling.
- A draft-review surface with page validation.
- An explicit preview/edit mode.

The plan builds around these capabilities rather than replacing the editor.

## Primary Merchant Flow

```text
Website tab
    ↓
Website Overview: status, next action, preview
    ↓
Guided setup for a new or incomplete website
    ↓
Page editor for focused section editing
    ↓
Responsive preview and publish review
    ↓
Publish website
    ↓
Ongoing maintenance from Website Overview
```

## Information Architecture

### Website Overview

This should be the entry screen at `/dashboard/website`, rather than routing merchants straight into the editor.

It should contain:

- Website status: **Not started**, **Draft**, **Published**, or **Needs attention**.
- Website URL and copy-link action.
- A live or draft thumbnail.
- One primary action that reflects the current state:
  - `Create website`
  - `Continue editing`
  - `Review and publish`
  - `Update website`
- A small readiness checklist.
- Secondary actions: `Preview`, `Manage pages`, `Website settings`.

The overview is a merchant's home base. It prevents the common “canvas with no next step” problem and gives returning users a clear re-entry point.

### Pages

Pages are the first-level object, not sections. The Website tab should expose a clear page list:

- Home
- About
- Locations
- Gallery
- FAQ
- Contact
- Add page

Each page card should show its title, draft/published status, thumbnail, and actions for edit, duplicate, hide, delete, and set as home page. Use templates for common restaurant pages rather than an empty page.

### Editor

The builder remains the detailed editing surface for one selected page.

Editor layout:

```text
Top bar: Back to Website · page selector · Saved state · device preview · Preview · Review & publish

Left panel: Page sections and Add section
Center: Live page canvas
Right panel: Selected section controls (Content / Style)
```

The current section, canvas, and settings model fits this structure well. The editor should use clear, task-oriented names:

- `Sections` rather than `Structure`
- `Page preview` rather than `Page`
- `Edit section` rather than `Settings` when a section is selected

## New-Website Guided Setup

Do not send a first-time merchant into the full editor immediately. Begin with a short setup that creates a good first page automatically.

### Step 1: Select starting point

Options:

- Start with a restaurant template
- Start from a simple one-page site
- Use an existing site as a starting point, if available

Templates should be based on restaurant intent, not generic visual labels alone:

- Quick service / takeout
- Cafe / bakery
- Full-service restaurant
- Multi-location restaurant

Show desktop and mobile previews before selection. The merchant selects one template; colors and content remain editable later.

### Step 2: Add essential business information

Collect only information that materially improves the initial site:

- Restaurant name
- Logo (optional)
- Short headline
- One-line description
- Phone and location
- Hero image

Pre-fill known merchant and location data. Never ask the merchant to retype data DexaPOS already has.

### Step 3: Confirm key actions

Choose which actions appear in the header and hero:

- Order Online
- View Menu
- Call
- Get Directions

`Order Online` is a product action, not a manually pasted link. It automatically points to the selected location's active Online Store. If no store is active, show the merchant what must be completed elsewhere without embedding Online Store setup here.

### Step 4: Review mobile and create draft

Show desktop and mobile previews side by side or with an easy toggle. Then create the site as a draft and enter the editor.

## Section-Editing Flow

The editor should make an edit feel like a simple loop:

```text
Select a section on the page or from the section list
    ↓
Edit its content first
    ↓
Make optional visual adjustments
    ↓
Preview the result on mobile
    ↓
Continue or add another section
```

### Default home-page section order

1. Header with brand and primary action
2. Hero: restaurant name, concise promise, Order Online action
3. Featured menu / popular items
4. Story or features
5. Gallery
6. Location and hours summary
7. FAQ
8. Footer

Offer this as a sensible default, but allow the merchant to add, remove, reorder, and hide sections.

### Add-section experience

The add-section dialog should prioritize restaurant-relevant choices:

- Hero
- Featured menu items
- Gallery
- About / story
- Location and hours
- Reviews
- FAQ
- Contact
- Promotion banner

Every option should display a concise purpose statement and a preview. Avoid making the merchant infer the outcome from a component name.

### Content before style

Show **Content** as the default inspector tab. Keep visual customization available but secondary.

For each section, the first controls should be the visitor-facing essentials: heading, description, image, and primary action. Advanced spacing, colors, and layout controls should live under an `Appearance` or `Advanced` disclosure.

## Preview, Review, and Publish

### Preview

Preview must represent the public website, without editing chrome. It should support:

- Desktop, tablet, and mobile modes
- Testing navigation, accordions, and Order Online calls to action
- A return-to-edit action

### Publish review

Replace a generic review action with a clear **Review & publish** flow.

The review screen should group issues by severity:

| Status | Meaning | Example |
| --- | --- | --- |
| Blocker | Cannot publish because a core public experience is broken | Missing home page, broken primary CTA, no page title |
| Recommended | Site can publish, but quality will suffer | No hero image, no contact method, incomplete mobile layout |
| Informational | Optional improvement | Add FAQ, add more photos, connect a custom domain |

The review should show a concise changelog from the currently published version: sections added, removed, or edited.

### Publish outcome

After publishing, show:

- Published URL with copy action
- Open live site
- Share link
- QR code for promotional material, if appropriate
- A non-blocking suggestion for the next improvement

Do not automatically redirect the merchant away from their success state.

## Website Settings

Keep infrequent configuration outside the editor:

- Site title and SEO description
- Favicon and social sharing image
- Domain / subdomain
- Site visibility
- Header and footer defaults
- Legal and analytics settings

This reduces editor complexity and keeps day-to-day edits focused on the page.

## Recommended Website Navigation

```text
Website
├── Overview
├── Pages
├── Design
├── SEO & Settings
└── Preview / Publish
```

`Pages` opens page management. `Design` can open global brand settings and template changes. Editing a page opens the builder, rather than forcing all work into a single permanent canvas.

## Phased Delivery Plan

### Phase 1: Clarify entry and publishing

1. Add a Website Overview route and navigation entry.
2. Add website status, URL, thumbnail, and single primary next action.
3. Rename the builder's return path to `Back to Website`.
4. Replace the generic editor `Review` label with `Review & publish`.
5. Add explicit Draft / Published / Needs attention states.

### Phase 2: Make creation guided

1. Build template selection for new sites.
2. Add a brief essentials form with pre-filled business data.
3. Generate a complete, editable starter homepage.
4. Add automatic Order Online action binding.
5. Require mobile preview acknowledgement before first publish.

### Phase 3: Make ongoing editing scalable

1. Add page management and restaurant page templates.
2. ~~Add global Design and Website Settings surfaces.~~ **Design surface delivered** — see below. Website Settings still outstanding.
3. Improve section discovery, previews, and content-first editing.
4. Add review diagnostics and publish changelog.

#### Delivered: the Design surface (`/dashboard/website/design`)

Three tabs — Colours, Typography, Shape — beside a sticky desktop/mobile live
preview and a WCAG readability panel.

- **14 palettes** across three moods (fresh / warm / bold-dark). A palette
  declares only brand, background, and text; the other seven tokens are derived
  (`lib/site-builder/color.ts`). This removed a whole bug class: the previous
  four presets set four colours and left the remaining six at their light-mode
  defaults, so the dark preset shipped light-grey borders and a near-white
  panel. A test asserts every shipped palette clears 4.5:1 on all text pairs.
- **18 typefaces and 12 pairings** (`lib/site-builder/fonts.ts`), split into a
  heading and a body slot. `headingFont` is a new theme token applied to
  `h1`–`h6` by one rule in `SiteChrome`, so no section changed.
- **Fonts are now actually loaded.** `DEFAULT_THEME` had claimed `"DM Sans"`
  since day one while nothing ever requested the file, so every site silently
  rendered in `system-ui`. `SiteChrome` now emits a Google Fonts link for the
  two families the active theme uses; the workspace loads the full catalogue so
  its specimens are real.
- **Readability panel** grades the five text/background pairs a merchant can
  break. It immediately caught a live defect: a storefront `primary_color` was
  inherited as `brand` while `brandContrast` stayed at the default white —
  1.9:1 button text on every site that inherited a light storefront colour.
  `resolveTheme` now derives `brandContrast` from whichever layer supplied
  `brand` instead of inheriting a stale one.

Client-side dashboard UI for the site builder lives in
`components/site-builder/dashboard/`; the render-graph test treats it like
`builder/` and excludes it, so `PageRenderer`'s server-only invariant still
holds for everything else under `components/site-builder/`.

### Phase 4: Measure and improve

Track:

- Website creation started → first draft created
- First draft created → first publish
- Median time to first publish
- Percentage of published sites with an Order Online action
- Percentage of merchants who preview mobile before publish
- Return rate to edit a published site
- Publish-review blocker and recommendation frequencies

## Acceptance Criteria

The Website tab is successful when:

1. A new merchant can create a credible, mobile-ready homepage without understanding sections or page settings first.
2. A returning merchant lands on a clear overview rather than a blank or ambiguous editor.
3. A merchant can identify the site's published state, URL, and next action in under five seconds.
4. The primary Order Online action cannot be accidentally configured with a stale or invalid manual URL.
5. The editor remains focused on one page, with content editing easier to find than advanced style controls.
6. Publishing makes the distinction between draft and live content unmistakable.
7. The Website tab remains independent from Online Store operations while still routing visitors reliably into the active store.

## Reference Patterns

The plan draws from a few strong website-builder patterns:

- [Squarespace’s template-to-customization flow](https://mobbin.com/flows/504a7a46-a696-4520-80f9-fb7b3fd6090c): choose a visual starting point before editing details.
- [Jobber’s focused preview plus contextual customization panel](https://mobbin.com/flows/855e401b-5920-4358-9115-3c45ac7d310a): keep the site visible while editing a section.
- [Mailchimp’s page-management and review/publish separation](https://mobbin.com/flows/4dd56ff8-9ae1-4c49-b82c-71d750c9b3c4): treat page management and publishing as distinct tasks.
