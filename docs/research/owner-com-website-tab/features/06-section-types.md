# 06 — Section types and their editors

The complete section vocabulary, and the exact fields behind each one.

Source data: [`../raw/home-section-editors.txt`](../raw/home-section-editors.txt) — a field-and-control dump
of all 16 editable Home sections.

---

## 1. The catalog — 13 types

![Add Section dialog — 13 section types](../screenshots/08-add-section-catalog.png)

Two-column grid of icon + label cards, single-select (radio), confirmed with **`Add ⊕`**.
`Content` is preselected. There is no search, no categories, no descriptions — 13 items fit on one screen.

| | Type | What it is |
|---|---|---|
| ▤ | **Content** | The workhorse: title + subtitle + optional media + optional button |
| 🖼 | **Gallery** | Titled grid of photos/videos |
| ✦ | **Features** | Title + chip list of amenities |
| ▭ | **Cards** | Multi-card layout |
| 📋 | **Form** | Embeds a reusable Form object |
| ☀ | **Integrations** | Third-party embeds |
| 📄 | **PDF** | Menu PDF / document |
| 📅 | **Reservations** | Booking widget |
| 🍴 | **Popular Items** | Menu-driven item carousel |
| ☆ | **Reviews** | Guest review cards |
| ☰ | **Scrolling Banner** | Marquee strip |
| ▶ | **Video** | Single video |
| 🗓 | **Events** | Renders the Events feature |

### The catalog is deliberately restaurant-shaped

There is no "Text", "Image", "Columns", "Spacer" or "HTML embed" — i.e. **no generic layout primitives.**
Every entry is a *restaurant website idea*: your menu items, your reviews, your reservations, your catering PDF.

That is the whole strategy. The merchant never composes a layout; they pick which of thirteen known-good
restaurant page-parts they want. It is also why the output can be responsive and on-brand without any effort
from them — Owner controls the internals of all 13.

**Compare to our v1's 9 kinds.** The gap is mostly features we already cut for want of a data source
(`reviews`, `reservations`) plus media types (`video`, `pdf`, `scrolling banner`) and `cards`.

---

## 2. Content — the workhorse

Roughly **9 of the 18 Home blocks** are Content sections. Get this one right and most of the feature works.

![Content section editor in context](../screenshots/12-content-section-editor.png)

The panel in full:

![Content section editor panel — Background, Media, Alignment](../screenshots/12b-content-section-panel.png)

### Fields, in panel order

| # | Field | Control | Notes |
|---|---|---|---|
| 1 | **Background** | segmented `None · Photo · Color` | Choosing `Photo` reveals a picker tile + **Replace**; `Color` reveals a small swatch row (5 generated options) |
| 2 | **Media** | segmented `None · Photo · Video` | The *foreground* image beside the text. Same picker + **Replace** |
| 3 | **Alignment** | segmented `Left · Right` | Which side the media sits on. Only appears when Media ≠ None |
| 4 | **Title** | text input | **Hard cap 50 chars**, live counter (`28/50`) |
| 5 | **Subtitle** | textarea | **Hard cap 500 chars**, live counter (`356/500`) |
| 6 | **Button** | collapsible group | See below |

### The Button sub-form

```
Button
  Title                       ← text input, the label
  Select a link, page, or action the button opens when clicked.
  Link To   [ URL │ Page │ Action ]
  <target picker>             ← depends on the choice above
```

`Link To` values observed resolving to: `Menu`, `Catering`, `Parties`, `Profile`, `unknownPage`
(a dangling reference — their equivalent of our binding-health `not_found`), and a raw `labels.url` field
for the URL case.

The **`Action`** option is the interesting one: it links to a *behaviour* (open ordering, open rewards/profile)
rather than a page — the analogue of our binding system.

### Character caps are hard limits

`50` for a title, `500` for a subtitle, `150` for the hero title. These are not warnings you can push past.
They are the reason Owner sites never have a headline that wraps to four ugly lines.

**Copy this.** It is the cheapest quality mechanism in the entire product.

### Background *and* Media are separate

A Content section can have a background photo *and* a foreground photo simultaneously (block 6 on Home does).
Two independent image slots, each with its own None/Photo/(Video) switch. Worth modelling as two fields, not one.

---

## 3. Hero

![Hero section editor — Title and 5-photo carousel](../screenshots/09-section-editor-hero.png)

| Field | Control |
|---|---|
| **Title** | textarea, **cap 150 chars**, live counter (`65/150`) |
| **Carousel photos** | tile grid, **max 5**, with an upload slot labelled `Upload a photo 3/5` |

The upload tile *counts for you* — `3/5` tells the merchant how many they have and how many they may add,
in the affordance itself rather than in help text.

Notably **absent**: the eyebrow text ("Best mediterranean food in Staten Island") and the `Order online`
button are not editable here. They come from brand settings and the ordering feature. The hero is
edit-only (no delete, no reorder).

---

## 4. Navigation (the header section)

![Navigation editor — transparent toggle and link order](../screenshots/10-nav-editor.png)

Opens from the header block's ✏️. Route: `/pages/{pageId}/blocks/heading` — note the **stable, non-opaque
block id `heading`**, unlike content blocks which use generated ids (`zPfJ3w7dGGx9`).

Banner at the top: ***"Changes to the navigation affect all pages."*** — essential, since you reached a
site-wide setting by clicking a section on one page.

| Control | Behaviour |
|---|---|
| **Transparent navigation** | toggle. On = nav overlays the hero image instead of sitting on a solid bar |
| **Link Order** | drag-handled (`⣿`) reorderable list |
| Each link row | `Label` + type sub-label (`Page`), plus a `⋯` menu |
| **⊕ Page** / **⊕ Link** | two add buttons — internal page vs external URL |

Hint text under the heading: ***"Links that don't fit will fall into a 'More' menu."***

### The ⋯ menu

![Nav link ⋯ menu — Edit and Delete](../screenshots/11-nav-link-menu.png)

`✏️ Edit` · `🗑 Delete` (red).

### Two things to copy

1. **Automatic overflow.** The merchant never configures a "More" menu; links that don't fit fall into one.
   No breakpoint config, no "hide on mobile" checkboxes.
2. **Nav *is* the drag-and-drop.** It is the one place in the whole product with drag handles — because a
   link list is short, flat and genuinely order-sensitive. Sections get buttons; nav gets drag. That is a
   thoughtful split, not an inconsistency.

> 🔴 **Direct relevance to us.** Our Owner-UI rebuild deleted `NavEditor` and left nothing writing
> `merchant_sites.nav`, while the public renderer still reads it — so a merchant can publish a page no
> visitor can reach. This screen is the reference for the fix. Owner's model: nav is an explicit, ordered,
> editable list that lives *inside the header section editor*, with automatic overflow.

---

## 5. Gallery

| Field | Control |
|---|---|
| **Title** | text input |
| **Description** | text input |
| **Gallery media** | `Add photo` (upload) · `Add video` (upload) |
| Each media item | **Move up** · **Move down** · **Remove** |

Nine photos on the Home gallery. Per-item reordering uses the same button pattern as sections — consistent
vocabulary, no drag.

---

## 6. Reviews

| Control | Notes |
|---|---|
| One row per review, showing the **reviewer name** (`Zahara Z.`, `Ramza Z.`, `Angelo S.`) | each row expands to edit |
| **Add Review** | appends |

Reviews are **manually curated content**, not a live Google feed — the merchant enters the quote and the
attribution. (The section is separately gated by the `Customer reviews` toggle in Brand settings; see
[13 — Settings](13-settings.md).)

---

## 7. Features

| Field | Control |
|---|---|
| **Title** | text input, cap 50 (`9/50` for "Featuring") |
| **Features** | chip list, each removable |
| **Add Feature** | appends |

Live values: `Catering`, `Delivery`, `Dine In`, `Takeout`, `Vegan Options`, `Private Dining Room`, `Live Music`.

Effectively an amenities/tag strip. Renders as icon+label badges.

---

## 8. Popular Items — no editor at all

The `Featured` block has **no Edit button** — only Delete and Move.

It renders straight from the menu: item photo, item name, an `Add Item` button per card, and a `View menu`
link in the header. The merchant changes it by changing their menu.

**This is the data-driven-section pattern**, and it is the right instinct: never make a merchant maintain the
same information twice. It also matches a rule we already have — never write a second price resolver; the
menu is the source of truth.

---

## 9. FAQ — reorder only

Two controls, both in the right gutter: **Move up**, **Move down**. No edit, no delete.

The FAQ content (`What cities do you serve?`, `What are you known for?`) is authored elsewhere — it did not
appear in any Website screen, so it is presumably managed by Owner's team or another settings surface.

It is the only block that is *movable but not editable or deletable*, which is a slightly odd combination
and probably an artefact of it being a semi-managed section.

---

## 10. Fully locked sections

**Our location** (block 16) and **Footer** (block 17) have **zero controls**.

- *Our location* renders a Google Map, address, phone, email, hours (`Open until xx:xx` / `See hours`),
  `Get Directions` and an `Order Now` CTA — all from Location settings.
- *Footer* renders nav links, `Small print` (Terms Of Use / Privacy Policy / Accessibility Statement),
  the copyright line, and a **`Made with Owner`** attribution.

Neither can be touched from the page editor. Both appear on **every** page.

---

## 11. Summary table — capability by kind

Use this as the shape of a section registry:

| Kind | Editable | Deletable | Movable | Content source |
|---|:---:|:---:|:---:|---|
| Navigation / header | ✅ | ❌ | ❌ | own editor (site-wide) |
| Hero | ✅ | ❌ | ❌ | own editor |
| Content | ✅ | ✅ | ✅ | own editor |
| Gallery | ✅ | ✅ | ✅ | own editor |
| Reviews | ✅ | ✅ | ✅ | own editor (+ feature toggle) |
| Features | ✅ | ✅ | ✅ | own editor |
| Popular Items | ❌ | ✅ | ✅ | **menu** |
| Events | ❌ | — | — | **Events feature** |
| FAQ | ❌ | ❌ | ✅ | managed elsewhere |
| Our location | ❌ | ❌ | ❌ | **Location settings** |
| Footer | ❌ | ❌ | ❌ | site config |

---

**Prev:** [05 — Page editor](05-page-editor.md) · **Next:** [07 — Announcements](07-announcements.md)
