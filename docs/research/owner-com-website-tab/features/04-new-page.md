# 04 — New Page

`/brands/{brandId}/website/pages/new?locationId={loc}`

Full-screen editor chrome, primary action **`Create ➔`**. No Build/Preview toggle.

---

## 1. The whole flow is one choice

```
Select a template
Start your page design with a pre-built template or make your own.

  ▣ Article    ✓          ← selected by default
  ▣ Showcase
  ▣ Blank
```

Left rail: three radio cards with icons. Right: a **live preview of that template rendered in this brand's
own style** — real logo, real brand colour, real fonts.

**There is no name field, no URL/slug field, no page-type field, and no SEO fields.** You pick a template and
press Create; naming and addressing happen later inside the editor. One decision to get moving.

---

## 2. The three templates

### Article *(default)*

![New Page — Article template](../screenshots/04-new-page-templates.png)

Long-form editorial layout: alternating full-width images and text blocks. For Our Story / About / blog-style
content.

### Showcase

![New Page — Showcase template](../screenshots/05-new-page-showcase.png)

Image-led, larger media, more visual rhythm. For Catering / Parties / Private Dining style pages that sell
with photography.

### Blank

![New Page — Blank template](../screenshots/06-new-page-blank.png)

Header + footer only. The merchant composes from scratch with `Add Section`.

Note that even "Blank" is not empty: it still carries the locked navigation and footer. **You cannot create a
page without site chrome** — another structural guarantee.

---

## 3. Why the preview matters

The preview is not a generic template thumbnail. It renders with the brand's logo, `#047373` teal, `Square`
corners and `Noto Serif Display` headings — the merchant sees *their* site, not a stock mockup.

That single detail converts an abstract choice ("Article or Showcase?") into a concrete one ("which of these
two versions of my site do I want?"). It is cheap to build once the renderer exists, and it is the difference
between a template picker that helps and one that guesses.

---

## 4. Parity notes for DexaPOS

- We already have `page-templates.ts` from the Owner-UI replacement work. This confirms **three** is the right
  number, and confirms the naming instinct: describe the *shape* (Article / Showcase / Blank), not the
  *purpose* (About / Catering / Empty). Shape names age better and don't constrain the merchant.
- Our `CreatePage` seeds `createEmptyPage` and takes no document, so a template is applied as a follow-up
  `SaveDraft`. That is compatible with this flow — Owner also defers everything except the template choice.
- **Do not add a name field here.** It is tempting and it is wrong: it puts a naming decision in front of a
  merchant who has not yet seen the page. Owner names it afterwards, in page settings.

---

**Prev:** [03 — Change Style](03-change-style.md) · **Next:** [05 — The page editor](05-page-editor.md)
