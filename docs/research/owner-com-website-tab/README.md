# Owner.com — Website tab teardown

Captured **2026-08-18** from a live Owner.com merchant account (brand: *Charcoal Gardenia*, Staten Island NY).
Purpose: replicate the Website feature — every sub-page, section, editor field and behaviour — in the DexaPOS dashboard.

> **Nothing was modified on the live site.** Details in [Safety notes](#safety-notes).

---

## Read this first

| Doc | What's in it |
|---|---|
| **[01 — Shell, navigation & routing](features/01-shell-navigation-and-routing.md)** | The two-app split, the URL contract, the sidebar, the shared editor chrome, the auth flow |
| **[02 — Pages](features/02-pages.md)** | The hub: table, status control, the three classes of page, what's deliberately absent |
| **[03 — Change Style](features/03-change-style.md)** | The whole theming system in five controls |
| **[04 — New Page](features/04-new-page.md)** | Three templates, previewed in the brand's own style |
| **[05 — The page editor](features/05-page-editor.md)** | Canvas, gutter controls, Add Section dividers, **per-section permissions**, the draft/publish model |
| **[06 — Section types](features/06-section-types.md)** | All 13 types + field-by-field editors (Content, Hero, Nav, Gallery, Reviews, Features…) |
| **[07 — Announcements](features/07-announcements.md)** | Being retired by Owner — don't build it |
| **[08 — Events](features/08-events.md)** | Entity + form + how it mounts onto a page |
| **[09 — Forms](features/09-forms.md)** | Reusable form objects, submissions, the 10 field types |
| **[10 — Analytics](features/10-analytics.md)** | Not analytics — four tracking-pixel fields |
| **[11 — Customer support](features/11-customer-support.md)** | Order complaints, closed issue taxonomy |
| **[12 — Careers](features/12-careers.md)** | Roles, applications, resumes; the only location-scoped child |
| **[13 — Settings](features/13-settings.md)** | Brand/location settings, **feature toggles that gate sections**, and why there's no domain UI |
| **[14 — Page anatomy](features/14-page-anatomy.md)** | Block-by-block composition of all 8 pages |
| **[15 — Implementation notes](features/15-implementation-notes.md)** | What to copy, skip and decide — mapped onto `feat/website-owner-ui` |

**Also:** [`GALLERY.md`](GALLERY.md) — all 28 screenshots on one page ·
[`raw/`](raw/) — machine-extracted editor field dumps

---

## The 60-second version

**Where it lives.** Owner runs two apps. `app.owner.com` is the Ionic ops shell with a cut-down Website
screen that redirects to `/launch` on pre-launch accounts. The real feature is on **`dashboard.owner.com`**
(Vue 3), at `/brands/{brandId}/website/{sub}?locationId={loc}` — brand in the path, location as a query param.

**What it is.** A nav group with **7 children**: Pages · Announcements · Events · Forms · Analytics ·
Customer support · Careers. (Four of them don't actually live under `/website/` — the grouping is a product
decision layered over unrelated routes.)

**The builder.** One column. No drag-and-drop, no grid, no columns, no zoom. Sections stack; controls sit in the
margins (edit/delete left, move up/down right); a full-width `⊕ Add Section` divider sits between every pair.
**13 section types**, all restaurant-shaped — there is no "Text", "Image", "Columns" or "HTML embed".

**The five mechanisms that make it work**

1. **Per-section permissions.** Header, hero, location and footer are locked; Popular Items has no editor
   (it renders from the menu); FAQ is reorder-only. Enforced by *omitting the control*, never by disabling it.
2. **Hard character caps** — 50 for a title, 500 for a subtitle, 150 for the hero — with live counters.
3. **Global style, five knobs**: logo, one brand colour, Light/Dark, Rounded/Square, title font.
4. **Brand-level feature toggles** (`Customer reviews`, `Rewards`, `Gift cards`) gate section availability;
   the page editor only decides placement and copy.
5. **No autosave.** In-memory draft → explicit per-page **Publish**, with a *Discard unsaved changes* prompt on exit.

**One shell, reused.** Pages, Forms, Style and New Page all share the same
`Close │ name │ Build/Preview │ Publish` frame. The form builder *is* the page builder.

**The framing.** Owner's own line — *"if you're looking for a lot of design freedom, Owner is not the right fit"*.
**The simplicity is removed decisions, not a visual style.**

---

## Account snapshot

| | |
|---|---|
| Brand | Charcoal Gardenia (`fnCBQdCez9su`), Staten Island NY |
| Location | `Rrhxl9S6qWVM` → `/charcoalgardenia-wt221f` |
| Style | `#047373` teal · Light · Square corners · `Noto Serif Display` titles |
| Pages | 8 (Home 18 blocks, Catering 10, Our Story 7, Events 4 *unpublished*, We're Hiring 4, Gift Cards 4, Parties 4, Contact Us) |
| Forms | 4, with 8 / 38 / 13 / 18 responses |
| Careers | 8 applications |
| Announcements | 0 (feature end-of-life) |
| Events | 0 |
| Analytics | all 4 pixel fields empty |

---

## Safety notes

The account is a **live, in-use site**, so the capture was read-only. Two things to be transparent about:

1. A scripted sweep of the section editors clicked the first gutter control on every block. On sections that
   have *no* edit button, the first control is a different action. That opened a **Delete Section**
   confirmation (dismissed without deleting) and **moved the FAQ section up two positions in the draft**.
2. The FAQ section was moved back to its original position, and the editor session was then closed via
   **Discard unsaved changes**.

Verified afterwards: Home has all **18 blocks in the original order**, and re-opening the editor raises **no**
unsaved-changes prompt — the stored draft is clean. **Publish was never clicked** on any page, form or style,
so the public site was never affected at any point.

Anyone repeating this capture: never sweep gutter controls by index. Verify the pencil's SVG path
(`M227.31,73.37,…`) before clicking — see [05 — Page editor](features/05-page-editor.md#3-gutter-controls).

**PII:** `screenshots/18-form-submissions.png`, `22-customer-support.png` and `23-careers.png` contain real
customer and applicant names, emails and phone numbers. Keep this folder internal.
