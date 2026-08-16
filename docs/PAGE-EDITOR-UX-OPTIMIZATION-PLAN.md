# Page Editor UX Optimization Plan

## 1. Scope

This plan covers the **page-editing screen inside the Website tab**. It begins when a merchant chooses a page to edit and ends when they save, preview, or publish that page.

It does not redesign the Website overview, global theme workspace, Online Store settings, menu administration, checkout, or order fulfillment.

## 2. Product Goal

The editor should let a restaurant merchant update a page without needing to understand web-design terminology.

The merchant should always understand:

1. Which page they are editing.
2. Which section is selected.
3. Whether their work is saved.
4. Whether saved changes are live or still a draft.
5. What they need to fix before publishing.
6. How the page looks and behaves on mobile.

The target interaction should feel like:

```text
Choose page
    ↓
See the real page
    ↓
Select a section directly on the page or in the section list
    ↓
Edit its content in a contextual panel
    ↓
Preview visitor behavior and mobile layout
    ↓
Review changes
    ↓
Publish
```

## 3. Current Implementation Audit

### What is already strong and should be preserved

The implemented editor has a good technical and interaction foundation:

- A three-surface model: section list, rendered canvas, and contextual inspector.
- The inspector opens only after selection, preserving canvas width during review.
- The canvas uses the same server-rendered markup as the public page.
- Clicking a rendered section selects it and opens its controls.
- Selected and hovered sections receive clear canvas overlays.
- Section actions are available on the canvas: move, hide, duplicate, and delete.
- Add-section controls appear at valid insertion points, so position is chosen in context.
- The section list is grouped into locked top, reorderable body, and locked bottom zones.
- Reordering supports pointer and keyboard input.
- Sections use merchant-authored headings as their names when possible.
- Live POS-backed content and broken bindings are surfaced rather than silently hidden.
- The inspector separates Content from Style.
- Fields have individual reset actions.
- Desktop, tablet, and mobile canvas sizes already exist.
- Preview mode lets merchants test links and interactive components.
- Autosave states, undo/redo, conflict handling, validation, and draft differences already exist.
- Small screens switch between Sections, Page, and Settings instead of hiding editor capabilities.

These behaviors are the core of the optimized editor. They should be refined rather than replaced.

### Current flow gaps

#### 3.1 The route does not yet represent a real selected page

The builder currently loads a demo page document. It accepts a location but not a page ID, and edits are described in the code as memory-only until persistence is connected.

This creates the largest product gap: a merchant cannot reliably understand which stored page is being edited, switch pages, refresh safely, or return to the exact draft.

#### 3.2 Page identity is visually weak

The toolbar shows the document SEO title and optional site name, but does not provide a proper page selector or communicate page path, home-page status, draft/live status, and last publication state together.

#### 3.3 Editing mode and preview mode rely too heavily on an icon

Preview mode is functionally thoughtful, but the toolbar control is icon-led. A merchant may not immediately understand why clicking a link selects a section in one mode and opens the link in another.

#### 3.4 Draft saving and publishing are not yet one coherent mental model

The toolbar shows autosave status and a Review popover, but publishing is explicitly not connected. “Saved” could therefore be misread as “live.” The draft/live distinction must be visible before the merchant opens Review.

#### 3.5 Review is compressed into a small popover

The existing popover contains changes, errors, warnings, and broken bindings. That is useful for quick checks, but it is too constrained for a confident publishing decision, especially when issues need navigation and mobile review.

#### 3.6 Inspector fields are schema-driven but not fully task-ordered

Automatic form generation is scalable, but schema order alone may not match merchant priorities. Important fields such as heading, description, image, and action should appear before secondary or advanced controls consistently.

#### 3.7 Adding sections is text-rich but visually abstract

The add-section command palette has good grouping and descriptions, but merchants cannot see what a section will look like before adding it.

#### 3.8 Destructive actions need stronger recovery

Undo exists, but deleting a section should still communicate what happened and offer an immediate Undo action. Reliance on the toolbar alone makes recovery less discoverable.

## 4. Reference Patterns From Mobbin

The recommended direction combines the best parts of several editing patterns:

- [Jobber's live canvas with a focused content inspector](https://mobbin.com/flows/855e401b-5920-4358-9115-3c45ac7d310a) keeps the page visible while presenting only controls for the selected content.
- [Squarespace's inline section selection and contextual actions](https://mobbin.com/flows/81579f9b-b149-4a32-90b2-ff050a26abb8) makes the relationship between page content and editing actions immediate.
- [Mailchimp's dedicated preview flow](https://mobbin.com/flows/cc673ce3-16b8-472b-8930-c0dc282d713a) separates editing chrome from visitor testing and makes device switching explicit.
- [Polywork's block list and canvas pairing](https://mobbin.com/flows/353ea415-8cff-4f22-80b6-f0008b556037) supports scanning, selecting, and adding blocks without losing the page context.
- [Squarespace's page tree alongside the canvas](https://mobbin.com/screens/8e63e795-8387-4194-8307-5f387a0c261a) demonstrates clear page identity and navigation without replacing the editor canvas.
- [GoDaddy's persistent page preview with grouped configuration](https://mobbin.com/screens/c0047eda-bff8-4d3a-820d-dff82b2f7733) keeps the outcome dominant while configuration remains secondary.
- [Canva's publish panel](https://mobbin.com/screens/baf8316f-76a4-4bf1-95fe-88640176648b) makes URL and final publication action visible in the same decision surface.
- [Webflow's publish warning dialog](https://mobbin.com/screens/707264db-6cd2-4b4d-be69-a585d3b09280) distinguishes blocking issues from the merchant's ability to continue publishing.

DexaPOS should retain its simpler restaurant-focused vocabulary and avoid adopting the complexity of general-purpose design tools.

## 5. Recommended Desktop Layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Website │ Home ▾  /home  [Home page] │ Draft saved │ Edit | Preview       │
│           │                              Desktop Tablet Mobile │ Publish       │
├───────────────┬──────────────────────────────────────┬───────────────────────┤
│ PAGE SECTIONS │              CANVAS                  │ EDIT SECTION          │
│               │                                      │                       │
│ Top of page   │   Hover → identify section           │ Content | Appearance  │
│  Header       │   Click → select and edit            │                       │
│  Hero         │                                      │ Task-ordered fields   │
│               │   + Add section at this position     │                       │
│ Page sections │                                      │ Section actions       │
│  Our story    │                                      │                       │
│  Gallery      │                                      │                       │
│  Location     │                                      │                       │
│  + Add section│                                      │                       │
│               │                                      │                       │
│ Bottom        │                                      │                       │
│  Footer       │                                      │                       │
└───────────────┴──────────────────────────────────────┴───────────────────────┘
```

### Layout behavior

- At wide desktop widths, show section list and canvas by default. Open the inspector after a section is selected.
- At narrower laptop widths, preserve the existing focused-pane system instead of compressing three unusable columns.
- On mobile/tablet, rename bottom navigation to `Sections`, `Preview`, and `Edit`.
- Returning to the canvas from Edit must preserve the selected section and scroll position.

## 6. Optimized Editor Flow

### 6.1 Entering the editor

The canonical route should include both location and page identity:

```text
/dashboard/website/builder?location={locationId}&page={pageId}
```

On entry:

1. Load the stored page draft, its revision, and its published baseline.
2. Load the page list for the same website.
3. Load the selected location's live menu catalog for bound sections.
4. Render the draft on the canvas.
5. Restore a safe editor preference such as the last device mode, but do not restore an old selected section if it no longer exists.

If no page is specified, open the home page. If the website has no page, route through page creation rather than silently loading a demo document.

### 6.2 Page selector

Replace the current identity dropdown with a true page switcher.

Each page item should show:

- Page title.
- `/path`.
- Home-page indicator.
- Draft-changes dot when applicable.
- Published, draft-only, or hidden state.

Actions inside the selector:

- Switch page.
- Manage pages.
- Add page.
- Open page settings.

When switching pages during an active autosave, wait for the current save to finish or visibly carry the save operation through. Never discard the current document during route transition.

### 6.3 Selecting and editing a section

Support two equivalent paths:

1. Click a section directly on the canvas.
2. Select it from the section list.

Both paths must:

- Highlight the same section on the canvas and in the list.
- Scroll the selected section into view when selection originates from the list.
- Scroll the matching list row into view when selection originates from the canvas.
- Open the inspector.
- Place keyboard focus on the inspector heading without unexpectedly moving focus for pointer users.

Closing the inspector should return to a review state while preserving selection. Pressing Escape should close only the topmost open layer, then the inspector.

### 6.4 Editing content

Rename the inspector tabs:

- `Content`
- `Appearance`

Order Content controls consistently:

1. Section visibility when useful.
2. Eyebrow or label.
3. Heading.
4. Description/body.
5. Images or media.
6. Primary action.
7. Secondary action.
8. Repeated items or POS bindings.
9. Advanced content options.

Recommended field behavior:

- Update simple text in the canvas immediately.
- Debounce server rendering for structural, rich-text, media, and layout changes.
- Show image preview, crop guidance, recommended dimensions, replace, and remove actions.
- Use plain-language action destinations: `Order Online`, `Page`, `Section`, `Phone`, `Email`, `External link`, and `None`.
- For Order Online, use the product-bound destination and do not expose a raw URL.
- Explain POS-backed content beside the affected field, not only once at the top of the inspector.
- Put reset controls behind a clear tooltip and offer `Reset section appearance` for multi-field recovery.

### 6.5 Editing appearance

Keep global brand decisions out of page sections. The section Appearance tab should contain only local presentation options such as:

- Layout variant.
- Image position.
- Column count.
- Alignment.
- Background treatment.
- Overlay strength.
- Spacing density.

Colors, typography, button style, corner style, and global spacing scale should link to the global Design workspace instead of being repeatedly configured per section.

Show a small `Uses website design` explanation when a section inherits global values.

### 6.6 Adding a section

Keep both current entry points:

- `Add section` in the section list.
- Inline plus controls between valid canvas sections.

Upgrade the selection experience from a command-only list to a searchable section gallery:

- Group by merchant task: `Promote`, `Menu`, `Tell your story`, `Build trust`, `Visit us`.
- Show a small visual preview for every section type.
- Show a one-sentence purpose.
- Mark POS-connected sections.
- Show whether a section can be added more than once.
- Add `Recommended` labels based on missing page essentials, not generic popularity.

After addition:

1. Insert at the chosen position.
2. Scroll the new section into view.
3. Select it automatically.
4. Open Content settings.
5. Focus the first useful empty field.
6. Announce the addition to assistive technology.

### 6.7 Reordering sections

Preserve accessible drag-and-drop in the section list.

Enhance it with:

- A clearer drag handle that appears on hover and focus.
- A visible insertion line while dragging.
- Automatic canvas scrolling to the moved section after drop.
- An accessible live announcement: “Gallery moved after Our Story.”
- Move up/down actions in the row menu for merchants who do not drag.

Do not support freeform canvas dragging. A structured restaurant-site builder benefits from predictable, valid layouts.

### 6.8 Hide, duplicate, and delete

- Hidden sections remain visible in the editor with a muted overlay and `Hidden` badge.
- Duplicating inserts immediately after the source and selects the copy.
- Deleting shows a toast with `Undo`.
- If a section is required or singleton-locked, explain why the action is unavailable.
- Avoid confirmation dialogs for normal section deletion because undo makes the action recoverable.

### 6.9 Edit and Preview modes

Replace the ambiguous icon-only mode control with a labeled segmented control:

```text
[ Edit ] [ Preview ]
```

Edit mode:

- Clicking page content selects its section.
- Links and buttons do not navigate.
- Section overlays and insertion points are visible.

Preview mode:

- Hide selection overlays, insertion points, and side panels.
- Let accordions, anchors, navigation, and buttons behave like the live site.
- Open external or cross-product destinations safely in a new tab.
- Keep a persistent `Back to editing` control.
- Preserve the selected device mode.

Device controls should use labels or strong tooltips and display the actual preview width. On first publish, require the merchant to visit mobile preview or explicitly acknowledge that it has not been reviewed.

### 6.10 Saving

Keep autosave and the existing conflict-safe approach.

The top bar should communicate two separate states:

```text
Draft: Saving… / Saved just now / Not saved / Conflict
Live: Published 2 days ago / Never published
```

Never use `Saved` alone near a Publish action. “Draft saved” is the correct phrase.

On save error:

- Keep the merchant's local edits.
- Show a persistent error state, not only a disappearing toast.
- Offer Retry.
- Warn before leaving if unsaved changes remain.

### 6.11 Review and publish

Keep the toolbar's compact issue count, but open a dedicated review sheet or modal rather than placing the full publishing decision inside a small popover.

Review should include:

1. Draft-versus-live change summary.
2. Blocking issues with `Fix` actions that select the owning section.
3. Warnings that may be ignored.
4. POS binding health.
5. Desktop and mobile preview thumbnails.
6. Page URL and publication destination.
7. Primary `Publish page` action.

Issue severity:

| Severity | Behavior | Examples |
| --- | --- | --- |
| Blocker | Disable Publish until fixed | Invalid document, missing required action destination, no valid visible body content |
| Warning | Allow Publish | Missing SEO description, no image alt text, unavailable menu item omitted |
| Information | No action required | Live POS content updates without republishing |

After publishing:

- Mark the current document as the new published baseline.
- Update the Live status immediately.
- Show the public URL with `Open live page` and `Copy link`.
- Keep the merchant in context with `Continue editing`.

## 7. Empty, Loading, and Error States

### No page exists

Show `Create your first page`, with restaurant page templates. Do not render a demo page as if it were the merchant's draft.

### Page fails to load

Show the page title if known, explain that the draft could not be loaded, and provide Retry and Back to Website actions.

### Canvas render fails

Keep the last successful canvas visible with a stale-preview warning. Do not replace it with an empty surface while merchant edits remain intact.

### Menu catalog fails

Allow unrelated editing. POS-bound controls should show their own error and Retry action.

### No body sections

Keep the header and footer visible and present a canvas-level `Add your first page section` action.

## 8. Accessibility Requirements

- Preserve keyboard reorder support.
- Provide visible focus states for every canvas and panel action.
- Announce add, move, hide, duplicate, delete, save, and publish outcomes.
- Ensure tooltips are supplementary; essential action meaning must exist in accessible labels or visible text.
- Maintain focus inside dialogs and sheets.
- Return focus to the invoking control after closing a layer.
- Do not rely on color alone for draft state, selection, warnings, or hidden state.
- Make canvas zoom and device preview usable at 200% browser zoom.
- Respect reduced-motion preferences for width transitions and auto-scroll.

## 9. Technical Implementation Map

### Builder route

Update `app/dashboard/website/builder/page.tsx` to:

- Accept `page` in search parameters.
- Load the actual page draft and revision.
- Load the published version as the comparison baseline.
- Create a first real page only through an explicit creation flow.
- Supply page summaries to the toolbar page selector.
- Supply a real save adapter and publish capability.

### Builder state

Extend `components/site-builder/builder/store.ts` with:

- Page identity and page metadata.
- Published timestamp/status.
- Persistent save error details and retry.
- Review-panel state.
- Section focus/scroll request state.
- Publish-in-progress and publish-result state.

Keep the document mutation history separate per page. Page switching should remount or explicitly replace the page store after the current save completes.

### Toolbar

Update `Toolbar.tsx` to provide:

- Page selector with status and path.
- Explicit Draft and Live status.
- Labeled Edit/Preview control.
- Responsive device selector.
- `Review & publish` primary action.
- A compact issue/change badge that opens the full review surface.

### Section list

Update `SectionList.tsx` to:

- Synchronize scrolling with canvas selection.
- Add non-drag move actions.
- Announce reorder results.
- Show a stronger empty state.
- Preserve search only when it adds value; automatically clear it when a newly added section would otherwise be hidden.

### Canvas

Update `Canvas.tsx` to:

- Synchronize selected section scrolling with the list and inspector.
- Hide all editor chrome in Preview mode.
- Preserve the last successful render after render errors.
- Improve responsive preview labels and zoom behavior.
- Add undo feedback after destructive actions.

### Inspector

Update `SettingsPanel.tsx` and schema metadata to:

- Replace field-name heuristics with explicit metadata for group, order, help, and advanced status.
- Rename Style to Appearance.
- Support image previews and action-destination controls.
- Show field-level live-data explanations.
- Link global design controls to the Design workspace.

### Add-section experience

Update `AddSectionModal.tsx` and the section registry to support:

- Preview thumbnails.
- Recommended status.
- Singleton/availability explanations.
- Post-add focus and scroll behavior.

### Publishing

Add a dedicated review/publish component using the existing diff, validation, binding-health, and page-version foundations.

Do not mix publishing into draft autosave. Saving updates the draft; publishing creates or selects an immutable published version.

## 10. Delivery Phases

> **Status (2026-08-16):** Phases 1, 2 and 4 are delivered, plus the add-section
> gallery from Phase 3. See §13 for exactly what landed and what did not.

### Phase 1 — Real page editing foundation

1. Route by page ID.
2. Load and persist a real draft.
3. Load the published comparison baseline.
4. Add reliable page switching.
5. Clarify Draft saved versus Live status.

This phase must come first because polishing a fixture-only flow would reinforce an incorrect mental model.

### Phase 2 — Editing-flow refinement

1. Synchronize canvas, section list, and inspector selection.
2. Add post-insert focus and scrolling.
3. Add delete Undo and move actions.
4. Replace Edit/Preview icon ambiguity with visible labels.
5. Improve content ordering and action destination controls.

### Phase 3 — Add-section and responsive-preview quality

1. Add visual section previews and recommendations.
2. Improve device labels, zoom, and full-chrome-free preview.
3. Add mobile-review acknowledgement for first publish.
4. Improve empty, loading, and render-error states.

### Phase 4 — Review and publishing

1. Build the full review surface.
2. Connect publish to immutable page versions.
3. Navigate Fix actions to the exact section or page setting.
4. Add publication success state and live URL actions.

### Phase 5 — Accessibility, testing, and measurement

1. Complete keyboard and screen-reader flows.
2. Test at laptop, tablet, mobile, and 200% zoom sizes.
3. Add interaction analytics.
4. Run merchant usability sessions and refine terminology.

## 11. Acceptance Criteria

The optimized page editor is complete when:

1. The selected location and page are represented in the URL.
2. Refreshing the editor restores the latest saved draft.
3. The merchant can switch pages without losing edits.
4. Canvas, section list, and inspector always agree on the selected section.
5. A newly added section appears at the chosen position and opens ready for editing.
6. Draft saved and Live publication states cannot be confused.
7. Preview mode behaves like the public page and contains no editing overlays.
8. The merchant can inspect desktop and mobile layouts before publishing.
9. Blocking publication issues link directly to the correct fix.
10. Delete, reorder, and other structural operations are keyboard accessible and recoverable.
11. A publish operation updates the live status and published baseline without altering live POS-bound data behavior.
12. Page editing does not expose Online Store operational settings.

## 12. Success Metrics

Track the editor funnel and quality signals:

- Page editor opened → first successful edit.
- First edit → saved draft.
- Saved draft → preview opened.
- Preview opened → publish review opened.
- Publish review opened → page published.
- Median time to complete a simple content edit.
- Save error and conflict rate.
- Percentage of first publishes with mobile preview completed.
- Validation issues by type and section.
- Undo rate after deletion or reordering.
- Page-switch abandonment and unsaved-change incidents.

The primary outcome is not time spent in the editor. It is the percentage of merchants who make the intended update, understand its draft/live state, and publish confidently without support.

## 13. Delivery Record — 2026-08-16

### Phase 1 — Real page editing foundation (done)

The editor loaded `createDemoPage()` through a `noopSaveAdapter`: the whole
surface worked and nothing survived a refresh. That is now removed.

- `builder/page.tsx` routes on `?location=&page=`, loads the real draft via
  `LoadDraft`, and falls back to the home page when `page` is absent or stale.
- `createDraftSaveAdapter` wires autosave to `SaveDraft`, including the
  conflict path. Save failures are a persistent toolbar state with Retry, not a
  toast, plus a `beforeunload` guard while work is at risk.
- `GetPublishedDocument` supplies the live baseline, so the change count means
  "not yet visible to guests" rather than "edited this session".
- A site with no pages gets a real home page from `createStarterHomePage`, not
  the Tony's Pizza fixture. The starter's copy is neutral and prompts editing.

### Phase 2 — Editing-flow refinement (done)

- Canvas, section list and inspector agree on selection. `selectionSource` +
  `revealNonce` mean the surface you clicked never scrolls and the others do;
  both respect `prefers-reduced-motion`.
- Delete shows an Undo toast. The Undo is generation-guarded: if anything was
  edited since, it declines rather than reverting the newer work.
- Move up / move down in the row menu for anyone not dragging, offered only
  where the zone rule permits the move, with a live announcement
  ("Gallery moved after Our story").
- Edit / Preview is a labelled segmented control; device tooltips carry real
  widths.

### Phase 3 — Add-section quality (partial)

- The command list is now a gallery: a CSS wireframe per kind, task-based
  groups, one-sentence purpose, POS badge, `Recommended` driven by what this
  page is actually missing, and singletons explained rather than silently
  broken.
- **Not done:** inspector field re-ordering (§3.6/§6.4). Ordering is still
  schema order; doing it properly means adding group/order/help metadata to the
  section schemas, which is a larger change than it looks.

### Phase 4 — Review and publishing (done)

- `PublishPage` appends an immutable `site_page_versions` row, supersedes the
  previous one, repoints the page, and stamps the site. Content is hashed
  canonically so republishing unchanged content is a no-op.
- The popover is a review sheet: publication target with copy-link, blockers
  that disable publishing, warnings that do not, POS binding health, the change
  list, and a success state that keeps the merchant in place with the live URL.

### One dead end found and fixed

`header`, `hero` and `footer` are `addable: false`, so a document missing one —
an older build, an import, a direct DB edit — produced a blocking validation
error with no way to resolve it: the gallery does not list those kinds and
`addSection` refuses them. `restoreRequiredSection` is the narrow repair path
(only non-deletable kinds, only when absent), surfaced as an `Add it` action on
the blocker. It inserts by canonical kind order, so a restored header lands
above the hero rather than below it.
