# Per-section text colour

**Status:** built, tested, unmerged. Branch `feat/branded-qr-rendering`.
**Date:** 2026-08-27

## What was asked for

A merchant should be able to change the font colour of a section, on every
section where a font colour is meaningful.

## What was built

A per-section **text colour** control on `SectionStyle`, offering four choices:

| choice | stored as | resolves to |
|---|---|---|
| Default | `textTone: "default"` | the backdrop's paired foreground |
| Muted | `textTone: "muted"` | a de-emphasised colour measured against the backdrop |
| Brand colour | `textTone: "brand"` | the brand, adjusted until it reads as type |
| Custom… | `textTone: "custom"` + `textColor` | the merchant's hex, guarded on every render |

The first three are tokens: they resolve to CSS custom properties and keep
following the site's theme. The fourth is a hex the merchant picks, and it is
the one that needed the most care.

## The custom colour, and the guard

**A stored hex is a request, not the rendered value.** Every render puts it
through `tintOn` against the backdrop the section is actually painted on, which
keeps the hue and saturation and moves only the lightness — until the pair
clears WCAG AA. A merchant who asks for their orange gets their orange,
darkened if it has to be.

Three decisions inside that are worth stating, because each had a plausible
alternative:

- **Adjust, do not refuse.** Refusing an unreadable colour reads as a broken
  control; the merchant picked a swatch and the product said no. Adjusting is
  only acceptable if it is *visible*, so the editor names the adjusted value and
  shows a chip of it whenever the guard moved anything.
- **Guard on render, not on save.** A colour checked once on save is correct
  until something moves — the merchant switches the section to a dark band, or
  changes their brand colour — after which the stored value was validated
  against a backdrop that is no longer there. Re-deriving costs a few colour
  conversions and cannot go stale.
- **`theme` is a required parameter,** not an optional one, on
  `sectionStyleProps` and `textToneColor`. The guard cannot run without knowing
  what is behind the text, and an optional parameter lets a call site skip it
  silently. Making it required turned "did I update all sixteen renderers?" into
  a compiler question — and it caught two I had missed.

**What a custom colour costs, and the editor says so:** it stops following the
theme. Change the brand colour later and the three named tones move with it;
a custom colour does not.

## Resolution table

`textToneColor(backdrop, style, theme)` in `components/site-builder/section-shell.tsx`:

| backdrop | `default` | `muted` | `brand` | `custom` |
|---|---|---|---|---|
| default, muted | `--site-text` | `--site-text-dim` | `--site-text-brand` | guarded hex |
| brand | `--site-brand-contrast` | *(same)* | *(same)* | *(same)* |
| dark (incl. photo) | `--site-text-on-dark` | `--site-text-dim-on-dark` | `--site-text-brand-on-dark` | guarded hex |

The four `--site-text-*` variables are **derived per theme** in `themeToCssVars`,
never stored — each is a fact about a foreground/background *pair*, and storing
one would let a theme row hold a pair that no longer agrees with itself (the bug
`resolveTheme` already works around for `brandContrast`).

## Three findings from the sweeps

1. **The sections fade their own copy.** Subheadings carry `opacity-75`, footer
   columns `opacity-70`. A colour sitting exactly on the AA line lands under it
   once composited. `tintOn` and `mutedOn` therefore measure the colour *through*
   a 0.3 fade, so the rendered text clears AA rather than the token doing so in
   isolation. This is stricter than intuition: `#7C2D12` measures 8.9:1 on white
   and is still nudged, because faded to 70% it is 4.4:1.
2. **A brand band has exactly one readable foreground.** `brandContrast` on a
   saturated red is barely over AA before anything is done to it, so any muting
   takes it under — and a sweep of the hue circle against a brand fill finds
   *nothing* that clears AA once copy is faded, not even white. All four choices
   collapse to the contrast colour there, and the editor omits the picker rather
   than offering one that changes nothing.
3. **The guard must preserve hue, not just contrast.** A guard that returned a
   readable *grey* for an unreadable yellow would satisfy every contrast
   assertion and betray the merchant. Asserted directly.

## Files changed

| File | Change |
|---|---|
| `lib/site-builder/color.ts` | `tintOn`, `mutedOn` — both fade-aware |
| `lib/site-builder/render-context.ts` | four derived `--site-text-*` vars |
| `lib/site-builder/sections/primitives.ts` | `TEXT_TONES`, `textTone`, `textColor`, `hexColorSchema` |
| `lib/site-builder/sections/registry.ts` | `StyleControl`, `styleControls` per kind |
| `components/site-builder/section-shell.tsx` | tone table, `textToneColor`, the guard |
| `components/site-builder/builder/SectionDrawer.tsx` | the control, picker and adjustment note |
| `components/site-builder/builder/BuilderShell.tsx` | `theme` prop |
| `app/dashboard/website/pages/[pageId]/page.tsx` | resolves the theme for the drawer |
| 16 section renderers | `ctx.theme` threaded; five opt into their own backdrop |

**No migration.** `textTone` and `textColor` are optional fields on the page
document's `style` object; `normalizePage` already `safeParse`s it and Zod strips
what it does not know. Absent means `default`, which is exactly what these
sections rendered before.

**A drive-by cleanup:** the drawer's background control was gated on
`section.kind === "reviews"` written into the panel. It is now declared in the
registry like everything else, which is what let the tone control ship to
sixteen kinds without a sixteen-way conditional.

## Security note

`textColor` is the first merchant-authored value in this feature that reaches a
`style` attribute on a public page. `hexColorSchema` is the boundary: a strict
`/^#[0-9A-Fa-f]{6}$/`, not `z.string()`. `text-tone-guard.test.ts` asserts the
adversarial cases (`url(x)`, `#000000; background: url(x)`, comment-splitting)
are refused, and the renderer falls back to the default tone rather than emitting
an invalid `color` for anything that slipped in by hand-editing a document.

## Coverage

- `__tests__/text-tone.test.ts` — 29 brand colours × light/dark × every named
  tone × every backdrop, AA through the fade.
- `__tests__/text-tone-guard.test.ts` — 40 merchant-chosen colours × every
  backdrop × 5 brands × light/dark; plus hue preservation, the
  already-readable property, malformed input, and the schema's adversarial list.
- `__tests__/text-tone-render.test.tsx` — the tone and the guarded colour reach
  the markup in the five sections that paint their own backdrop.
- Site-builder suite: 914 passing, 0 new failures. `tsc` error count unchanged
  from baseline (879, all pre-existing).

## History

**2026-08-27, morning — tokens only.** Shipped `default`/`muted`/`brand` and
recorded a decision *against* a hex picker, on three grounds: a guard makes a
weaker promise than a closed set, a hex opts out of the theme permanently, and
the cost is asymmetric (tokens can grow into hex; hex cannot be walked back once
merchants' pages depend on stored colours).

**2026-08-27, same day — reversed on request.** The custom option was built. The
three objections were not wrong, and two of them still stand as *costs* rather
than blockers:

- *"A guard is a weaker promise."* Answered by making the guard adjust rather
  than refuse, and by saying so in the panel. It is still a weaker promise than a
  closed set — `text-tone-guard.test.ts` is what holds it, and it is deliberately
  the harshest test in the feature.
- *"A hex opts out of the theme."* True, unchanged, and now stated to the
  merchant in the editor rather than only in this document.
- *"Cost is asymmetric."* Accepted; the work is done.

## Deliberately not done

- **The header.** Navigation chrome rather than merchant copy, and its appearance
  is already its editor's subject. One line in its registry entry turns it on.
- **Per-field colours** (heading vs. body separately). Multiplies the drawer and
  is how a page ends up with four different colours.
- **Custom colours on a brand band.** Not a policy choice — nothing readable
  exists there. See finding 2.

## Not verified

Browser QA. Covered by render tests at the markup level, but the picker and its
adjustment note have not been clicked through in the builder canvas.
