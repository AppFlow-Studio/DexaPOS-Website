# 03 — Change Style

`/brands/{brandId}/website/style?locationId={loc}` — the entire theming system, in five controls.

![Change Style editor with live preview](../screenshots/03-change-style-editor.png)

---

## 1. Layout

Full-screen editor, shared chrome, but **no Build/Preview toggle** — the preview *is* the right-hand pane.

```
┌ ⊗ Close │ Style │                              💬 │ Save ✓ ┐
├──────────────┬──────────────────────────────────────────────┤
│ control rail │  live preview of the real home page          │
│ (scrollable) │  (scrollable, full site top to bottom)       │
└──────────────┴──────────────────────────────────────────────┘
```

The primary action is **`Save`**, not Publish. Style is not versioned per page — it is brand configuration.

---

## 2. The five controls

That is the whole theming system. There is nothing else.

### Logo
Dashed drop-zone showing the current mark, a `⋯` menu on the tile, and a **Replace** button underneath.
File input accepts an image. No crop UI, no size guidance shown, no light/dark logo variants.

### Brand Color
A colour swatch button + a **hex text input** side by side. Current value `#047373` (deep teal).
The hex field is directly editable — you can paste a brand hex rather than hunting in a picker.

**One colour drives the entire site.** Buttons, links, accents, the nav CTA, section backgrounds when
"Color" is chosen — all derived. There is no secondary colour, no palette, no per-section colour override
beyond picking a background from a small generated set.

### Theme — `Light` / `Dark`
Two-button segmented control. Currently `Light`.

### Corners — `Rounded` / `Square`
Two-button segmented control. Currently `Square`. Applies to buttons, cards, image containers globally.

This is a genuinely clever reduction: "corner radius" is normally a per-component design decision, and Owner
has collapsed it to one binary that carries most of the perceived personality difference between a modern
and a classic restaurant site.

### Titles font
Four **radio cards**, each rendering a live `Aa` specimen in the actual typeface:

| Option | Specimen |
|---|---|
| `Sans serif` | `Aa` |
| `Serif` | `Aa` |
| `Condensed` | `Aa` |
| **`Custom`** *(selected)* | shows the resolved family name — `Noto Serif Display` |

Only **titles** are themeable. Body copy is fixed. That is why every Owner site reads consistently: the
merchant can change the personality of the headings without touching legibility of the paragraphs.

The `Custom` slot is not merchant-editable in the UI — it displays a font that was set for this brand
(presumably by Owner's team during onboarding). So there is an escape hatch, but it is staff-operated.

---

## 3. What this means

Five controls — logo, one colour, light/dark, rounded/square, title font — and **no per-page or per-section
overrides**. The live preview shows the whole real site, so the merchant sees the blast radius of every change
immediately.

Compare with what we currently have per the builder rebuild: palettes, pairings, font pickers and a readability
panel. Owner's answer to all of that is *five knobs and a preview*. Their own positioning is explicit:

> *"if you're looking for a lot of design freedom, Owner is not the right fit"*

**The simplicity is removed decisions, not a visual style.** A merchant physically cannot produce an
inconsistent site, because there is no control that would let them.

---

## 4. Parity notes for DexaPOS

- We already deleted our design workspace in favour of this model — this capture confirms the target.
  Our `style-inputs.ts` is the analogous surface.
- **Readability is Owner's problem to have too.** They pick one brand colour and derive foregrounds from it;
  our `readableOn` luminance-threshold bug (vivid mid-tones getting 4.35:1 button labels) is exactly the class
  of bug this design creates. Keep the sweep test.
- **Save vs Publish is a real distinction here.** Style saves immediately and applies site-wide; pages publish
  individually. If we unify everything under one publish, we lose that — and merchants will expect a colour
  change to be instant.
- The **hex input next to the swatch** is a small thing that matters a lot to real businesses who have a brand
  guide. Don't ship a picker-only control.

---

**Prev:** [02 — Pages](02-pages.md) · **Next:** [04 — New Page](04-new-page.md)
