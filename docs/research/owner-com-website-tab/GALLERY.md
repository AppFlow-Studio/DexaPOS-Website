# Screenshot gallery

All 28 captures from the 2026-08-18 Owner.com Website-tab teardown, in capture order.
Each links to the deep-dive that explains it.

> ⚠️ Three of these contain **real customer/applicant PII** (names, emails, phone numbers): `18`, `22`, `23`.
> Keep this folder internal.

---

### 00 — Ops app launch checklist
The `app.owner.com` dead end: pre-launch accounts force-redirect every route to `/launch`.
→ [01 — Shell & routing](features/01-shell-navigation-and-routing.md)

![](screenshots/00-launch-page.png)

---

### 01 — Website → Pages
The hub. Name / Created by / Status, inline search, Change Style + New Page.
→ [02 — Pages](features/02-pages.md)

![](screenshots/01-website-pages-list.png)

---

### 02 — Page status dropdown
`Unpublish` · `Delete`. The Home row has no chevron at all.
→ [02 — Pages](features/02-pages.md)

![](screenshots/02-pages-status-dropdown.png)

---

### 03 — Change Style
The entire theming system: logo, brand colour, theme, corners, title font — plus a live full-site preview.
→ [03 — Change Style](features/03-change-style.md)

![](screenshots/03-change-style-editor.png)

---

### 04 — New Page: Article template
→ [04 — New Page](features/04-new-page.md)

![](screenshots/04-new-page-templates.png)

### 05 — New Page: Showcase template

![](screenshots/05-new-page-showcase.png)

### 06 — New Page: Blank template
Even "Blank" keeps the locked nav and footer.

![](screenshots/06-new-page-blank.png)

---

### 07 — The page editor
Single column, gutter controls in the margins, `Add Section` dividers between every pair.
→ [05 — Page editor](features/05-page-editor.md)

![](screenshots/07-page-editor-home.png)

---

### 08 — Add Section catalog
13 section types. No generic layout primitives — every entry is a restaurant idea.
→ [06 — Section types](features/06-section-types.md)

![](screenshots/08-add-section-catalog.png)

---

### 09 — Hero section editor
Title (150-char cap) + a 5-photo carousel with an `Upload a photo 3/5` counting slot.
→ [06 — Section types](features/06-section-types.md#3-hero)

![](screenshots/09-section-editor-hero.png)

---

### 10 — Navigation editor
*"Changes to the navigation affect all pages."* Transparent toggle, drag-ordered links, ⊕ Page / ⊕ Link.
→ [06 — Section types](features/06-section-types.md#4-navigation-the-header-section)

![](screenshots/10-nav-editor.png)

### 11 — Nav link ⋯ menu
`Edit` · `Delete`.

![](screenshots/11-nav-link-menu.png)

---

### 12 — Content section editor (in context)
The left flyout with the canvas live beside it.
→ [06 — Section types](features/06-section-types.md#2-content--the-workhorse)

![](screenshots/12-content-section-editor.png)

### 12b — Content panel, full
Background (None/Photo/Color) · Media (None/Photo/Video) · Alignment · Title · Subtitle · Button.

![](screenshots/12b-content-section-panel.png)

---

### 13 — Preview mode
Same DOM, all editing chrome removed.
→ [05 — Page editor](features/05-page-editor.md#build-vs-preview)

![](screenshots/13-editor-preview-mode.png)

---

### 14 — Announcements
End of life; creation removed. Don't build this.
→ [07 — Announcements](features/07-announcements.md)

![](screenshots/14-announcements.png)

---

### 15 — Events list
→ [08 — Events](features/08-events.md)

![](screenshots/15-events.png)

### 16 — Create New Event
Photo (required) · Name · Description · Location · Start date/time · End time · Repeat · Ticket link.

![](screenshots/16-new-event-form.png)

---

### 17 — Forms list
`Status` = usage (`1 page` / `Not used`), not publish state.
→ [09 — Forms](features/09-forms.md)

![](screenshots/17-forms.png)

### 18 — Form submissions ⚠️ PII
Columns derived from the form's own fields. Export is the primary action.

![](screenshots/18-form-submissions.png)

### 19 — Form builder
Literally the page-builder shell, reused.

![](screenshots/19-form-builder.png)

### 20 — Form field types
10 semantic types — `Name` and `Email` are distinct types, not a text field with validation.

![](screenshots/20-form-field-types.png)

---

### 21 — Analytics
Not analytics: four tracking-pixel ID fields.
→ [10 — Analytics](features/10-analytics.md)

![](screenshots/21-analytics.png)

---

### 22 — Customer support ⚠️ PII
Order complaints with a closed 4-value issue taxonomy.
→ [11 — Customer support](features/11-customer-support.md)

![](screenshots/22-customer-support.png)

---

### 23 — Careers: Applications ⚠️ PII
Name · Roles · Email · Phone · Received · Resume · Delete.
→ [12 — Careers](features/12-careers.md)

![](screenshots/23-careers.png)

### 24 — Careers: Open Roles

![](screenshots/24-careers-open-roles.png)

---

### 25 — Settings overlay
Two-pane modal, deep-linked by query param, brand/location scope split.
→ [13 — Settings](features/13-settings.md)

![](screenshots/25-settings-overlay.png)

### 26 — Settings: Brand details
Where the `Customer reviews` / `Rewards` / `Gift cards` toggles gate website sections.

![](screenshots/26-settings-brand-details.png)
