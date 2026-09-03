import { describe, expect, it } from "vitest";

import { textToneColor } from "@/components/site-builder/section-shell";
import { contrastRatio, hslToHex, mix, mutedOn, readableOn, tintOn } from "../color";
import { DEFAULT_THEME, resolveTheme, themeToCssVars } from "../render-context";
import { composeTheme, STYLE_MODES } from "../style-inputs";
import { TEXT_TONES, sectionStyleSchema } from "../sections/primitives";
import { SECTION_REGISTRY } from "../sections/registry";
import { SECTION_KINDS } from "../sections/kinds";

/**
 * The per-section text tone, held to the same standard as the rest of the design
 * system: **readability is an invariant, not a warning**.
 *
 * `style-inputs.ts` earned that claim by removing the controls that could break
 * it. This feature adds a control back — a merchant may now recolour a section's
 * copy — so the claim has to be re-earned here, by sweeping every tone against
 * every backdrop across a range of brand colours and asserting that no
 * combination a merchant can reach produces text below WCAG AA.
 *
 * The sweep is what matters. A spot check on the default navy passes trivially;
 * the failures live at the edges of the hue circle, where a brand is either very
 * light (yellow on white) or very dark (indigo on the dark band).
 */

/** WCAG AA for body-sized text. */
const AA = 4.5;

/**
 * The strongest fade the section renderers apply to merchant copy —
 * `opacity-70` in the footer. Every assertion measures the tone *through* it,
 * because that is how the colour is actually rendered. See `mutedOn`.
 */
const FADE = 0.3;

/** A ring of brand colours, plus the pathological pale and near-black cases. */
const BRANDS = [
  ...Array.from({ length: 24 }, (_, i) => hslToHex({ h: i * 15, s: 0.78, l: 0.5 })),
  "#FDE047", // pale yellow — fails as type on white without adjustment
  "#FFFFFF",
  "#0A0A0A",
  "#808080",
  "#D411D4", // the magenta that broke `readableOn` in style-inputs
];

/** As rendered: the tone composited against its backdrop through the fade. */
function asRendered(color: string, backdrop: string): string {
  return mix(color, backdrop, FADE);
}

describe("text tone derivation", () => {
  it("keeps a brand colour readable as type on both backdrop families", () => {
    for (const brand of BRANDS) {
      for (const mode of ["light", "dark"] as const) {
        const theme = composeTheme({
          brand,
          mode,
          corner: "rounded",
          headingFont: DEFAULT_THEME.headingFont,
          fontFamily: DEFAULT_THEME.fontFamily,
        });

        const onSurface = tintOn(theme.brand, theme.surface);
        expect(
          contrastRatio(asRendered(onSurface, theme.surface), theme.surface),
          `brand ${brand} (${mode}) as type on the page`,
        ).toBeGreaterThanOrEqual(AA);

        const onDark = tintOn(theme.brand, theme.surfaceDark);
        expect(
          contrastRatio(asRendered(onDark, theme.surfaceDark), theme.surfaceDark),
          `brand ${brand} (${mode}) as type on the dark band`,
        ).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it("keeps a muted tone readable on every band it can appear on", () => {
    for (const brand of BRANDS) {
      for (const mode of ["light", "dark"] as const) {
        const theme = composeTheme({
          brand,
          mode,
          corner: "rounded",
          headingFont: DEFAULT_THEME.headingFont,
          fontFamily: DEFAULT_THEME.fontFamily,
        });

        // The brand band is absent deliberately: it has no readable muted
        // colour, so the tone table resolves `muted` to the contrast colour
        // there. Asserted separately below rather than swept here.
        const pairs: [string, string, string][] = [
          ["page", mutedOn(theme.text, theme.surface), theme.surface],
          ["dark band", mutedOn(theme.textOnDark, theme.surfaceDark), theme.surfaceDark],
        ];

        for (const [where, color, backdrop] of pairs) {
          expect(
            contrastRatio(asRendered(color, backdrop), backdrop),
            `muted on the ${where}, brand ${brand} (${mode})`,
          ).toBeGreaterThanOrEqual(AA);
        }
      }
    }
  });

  /**
   * A muted tone that resolved to the same colour as the default one would be a
   * control that does nothing — the failure mode a purely defensive derivation
   * falls into, since the safest muted colour is no muting at all.
   */
  it("still visibly mutes on the default theme", () => {
    const vars = themeToCssVars(DEFAULT_THEME);
    expect(vars["--site-text-dim"]).not.toBe(DEFAULT_THEME.text);
    expect(vars["--site-text-dim-on-dark"]).not.toBe(DEFAULT_THEME.textOnDark);
  });

  /**
   * The brand band's tones all collapse to one colour, and that is a decision
   * rather than an oversight — pinned here so a later "why is muted missing on
   * brand?" is answered by a failing test rather than by a plausible-looking fix
   * that reintroduces unreadable copy.
   */
  it("gives a brand band one readable foreground and no de-emphasised one", () => {
    for (const tone of TEXT_TONES) {
      if (tone === "custom") continue; // carries its own colour; asserted separately
      expect(
        textToneColor("brand", { textTone: tone }, DEFAULT_THEME),
        tone,
      ).toBe("var(--site-brand-contrast)");
    }

    // The reason, measured: white on a saturated red is already at the limit,
    // so any muting of it fails.
    const brand = "#E31C1C";
    const contrast = readableOn(brand);
    expect(contrastRatio(mix(contrast, brand, 0.1), brand)).toBeLessThan(AA);
  });

  it("leaves a brand colour that already reads well alone", () => {
    // Near-black on white needs no adjustment, and adjusting it anyway would
    // mean a merchant's chosen colour is never quite the one they chose.
    expect(tintOn("#111827", "#FFFFFF")).toBe("#111827");
  });

  it("emits every custom property the tone table names", () => {
    const vars = themeToCssVars(resolveTheme(null));
    for (const name of [
      "--site-text-brand",
      "--site-text-brand-on-dark",
      "--site-text-dim",
      "--site-text-dim-on-dark",
    ]) {
      expect(vars[name], name).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe("text tone contract", () => {
  it("accepts every tone and refuses anything else", () => {
    for (const tone of TEXT_TONES) {
      expect(sectionStyleSchema.safeParse({ textTone: tone }).success, tone).toBe(true);
    }
    expect(sectionStyleSchema.safeParse({ textTone: "#FF0000" }).success).toBe(false);
    expect(sectionStyleSchema.safeParse({ textTone: "rainbow" }).success).toBe(false);
  });

  /**
   * The point of `styleControls`: a merchant is never shown a control whose
   * edit the mutation layer would then refuse. The drawer reads this list and
   * `updateSectionStyle` gates on `editable`, so the two have to agree.
   */
  it("only offers style controls on kinds that accept edits", () => {
    for (const kind of SECTION_KINDS) {
      const def = SECTION_REGISTRY[kind];
      if (!def.styleControls?.length) continue;
      expect(def.editable, `${kind} offers style controls but is not editable`).toBe(true);
    }
  });

  it("offers a text tone on every kind that renders merchant copy", () => {
    // The header is navigation chrome, not copy — the one deliberate omission.
    for (const kind of SECTION_KINDS) {
      if (kind === "header") continue;
      expect(
        SECTION_REGISTRY[kind].styleControls ?? [],
        `${kind} should offer a text tone`,
      ).toContain("textTone");
    }
    expect(SECTION_REGISTRY.header.styleControls ?? []).not.toContain("textTone");
  });
});

describe("style mode surfaces", () => {
  it("covers both ends of the light/dark switch in the sweep", () => {
    expect(Object.keys(STYLE_MODES).sort()).toEqual(["dark", "light"]);
  });
});
