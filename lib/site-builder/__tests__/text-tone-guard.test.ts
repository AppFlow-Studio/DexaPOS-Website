import { describe, expect, it } from "vitest";

import { textToneColor } from "@/components/site-builder/section-shell";
import { contrastRatio, hexToHsl, hslToHex, mix, normalizeHex } from "../color";
import { DEFAULT_THEME, type ThemeTokens } from "../render-context";
import { composeTheme } from "../style-inputs";
import { sectionStyleSchema } from "../sections/primitives";

/**
 * The custom text colour, and the guard that is the entire reason it can be
 * offered at all.
 *
 * The decision this reverses (2026-08-27) was to ship named tones only, on the
 * grounds that a guard makes a weaker promise than a closed set. The guard is
 * what has to make that objection wrong, so it is tested harder than the tones
 * are: not "does it usually help", but **can any hex a merchant is able to type,
 * on any backdrop they can select, under any brand colour, produce text below
 * AA**.
 *
 * If a case here ever fails, the honest response is to narrow what the picker
 * accepts — never to lower the threshold.
 */

const AA = 4.5;

/** The strongest fade the sections apply to merchant copy. See `mutedOn`. */
const FADE = 0.3;

const BACKDROPS = ["default", "muted", "brand", "dark"] as const;

/** Colours a merchant can reach: the hue circle at three lightnesses, plus edges. */
const CHOSEN: string[] = [
  ...[0.25, 0.5, 0.78].flatMap((l) =>
    Array.from({ length: 12 }, (_, i) => hslToHex({ h: i * 30, s: 0.85, l })),
  ),
  "#FFFFFF",
  "#000000",
  "#FDE047", // the pale yellow that fails on white untouched
  "#7F7F7F",
];

const BRANDS = ["#0C4FD1", "#E31C1C", "#FDE047", "#111827", "#12B981"];

function backdropOf(backdrop: (typeof BACKDROPS)[number], theme: ThemeTokens): string {
  return backdrop === "muted"
    ? theme.surfaceMuted
    : backdrop === "brand"
      ? theme.brand
      : backdrop === "dark"
        ? theme.surfaceDark
        : theme.surface;
}

describe("custom text colour guard", () => {
  it("never renders a merchant's colour below AA, on any backdrop or brand", () => {
    for (const brandColor of BRANDS) {
      for (const mode of ["light", "dark"] as const) {
        const theme = composeTheme({
          brand: brandColor,
          mode,
          corner: "rounded",
          headingFont: DEFAULT_THEME.headingFont,
          fontFamily: DEFAULT_THEME.fontFamily,
        });

        for (const backdrop of BACKDROPS) {
          // The brand band takes no custom colour at all — asserted separately.
          if (backdrop === "brand") continue;
          const behind = backdropOf(backdrop, theme);

          for (const textColor of CHOSEN) {
            const rendered = textToneColor(
              backdrop,
              { background: backdrop, textTone: "custom", textColor },
              theme,
            );

            // A guarded colour is real hex, never a token — a `var()` here would
            // mean the custom branch silently fell back and the sweep proved
            // nothing.
            expect(rendered, `${textColor} on ${backdrop}`).toMatch(/^#[0-9A-F]{6}$/);

            expect(
              contrastRatio(mix(rendered, behind, FADE), behind),
              `${textColor} on ${backdrop} band, brand ${brandColor} (${mode})`,
            ).toBeGreaterThanOrEqual(AA);
          }
        }
      }
    }
  });

  /**
   * The promise that makes the picker worth having: a merchant with a brand
   * guide gets the value from the guide, untouched, whenever it is legible.
   *
   * Asserted as a *property* rather than against a list of colours, because
   * "legible" here means legible through the fade — and that is a stricter bar
   * than intuition suggests. `#7C2D12` measures 8.9:1 on white and is still
   * nudged, because faded to 70% it lands at 4.4:1. Pinning specific hexes
   * encodes a guess about where that line falls; pinning the rule does not.
   */
  it("leaves a colour that already reads well exactly as it was chosen", () => {
    const untouched: string[] = [];

    for (const backdrop of ["default", "muted", "dark"] as const) {
      const behind = backdropOf(backdrop, DEFAULT_THEME);

      for (const textColor of CHOSEN) {
        const rendered = textToneColor(
          backdrop,
          { background: backdrop, textTone: "custom", textColor },
          DEFAULT_THEME,
        );
        const alreadyReadable =
          contrastRatio(mix(textColor, behind, FADE), behind) >= AA;

        if (alreadyReadable) {
          expect(rendered, `${textColor} on ${backdrop} was readable already`).toBe(
            normalizeHex(textColor),
          );
          untouched.push(textColor);
        }
      }
    }

    // Guards against the test passing vacuously: if the derivation started
    // adjusting everything, the loop above would assert nothing at all.
    expect(untouched.length).toBeGreaterThan(20);
  });

  it("keeps a brand band's one readable foreground instead of a custom colour", () => {
    // The same finding as the muted tone, reached independently by the sweep:
    // nothing clears AA on a brand fill once the copy is faded, so the band
    // declines the colour rather than rendering something unreadable. The editor
    // does not offer the picker here.
    for (const textColor of ["#FFFFFF", "#000000", "#760A0A", "#12B981"]) {
      expect(
        textToneColor(
          "brand",
          { background: "brand", textTone: "custom", textColor },
          DEFAULT_THEME,
        ),
        textColor,
      ).toBe("var(--site-brand-contrast)");
    }
  });

  it("moves lightness but keeps the hue a merchant asked for", () => {
    // Pale yellow is unreadable on white and must be darkened — but it has to
    // come back yellow. A guard that returned a readable *grey* would satisfy a
    // contrast assertion and betray the merchant.
    const rendered = textToneColor(
      "default",
      { background: "default", textTone: "custom", textColor: "#FDE047" },
      DEFAULT_THEME,
    );

    expect(rendered).not.toBe("#FDE047");
    expect(contrastRatio(rendered, DEFAULT_THEME.surface)).toBeGreaterThanOrEqual(AA);
    expect(Math.abs(hexToHsl(rendered).h - hexToHsl("#FDE047").h)).toBeLessThan(2);
    expect(hexToHsl(rendered).s).toBeGreaterThan(0.4);
  });

  it("falls back to the default tone when the colour is missing or malformed", () => {
    // Reachable only by a hand-edited document — the schema refuses these on the
    // way in. The renderer still must not emit `color: undefined`, which a
    // browser ignores, leaving the copy whatever it happened to inherit.
    for (const style of [
      { textTone: "custom" as const },
      { textTone: "custom" as const, textColor: "" },
      { textTone: "custom" as const, textColor: "red" },
      { textTone: "custom" as const, textColor: "#ABC" },
      { textTone: "custom" as const, textColor: "javascript:alert(1)" },
    ]) {
      expect(textToneColor("default", style, DEFAULT_THEME)).toBe("var(--site-text)");
      expect(textToneColor("dark", style, DEFAULT_THEME)).toBe("var(--site-text-on-dark)");
    }
  });

  it("re-resolves against the backdrop rather than trusting what was saved", () => {
    // The reason the guard runs on every render rather than once on save. One
    // stored colour, two bands: legible near-black on the page, and necessarily
    // changed on the dark one.
    const style = { textTone: "custom" as const, textColor: "#111827" };

    const onPage = textToneColor("default", { ...style, background: "default" }, DEFAULT_THEME);
    const onDark = textToneColor("dark", { ...style, background: "dark" }, DEFAULT_THEME);

    expect(onPage).toBe("#111827");
    expect(onDark).not.toBe("#111827");
    expect(
      contrastRatio(mix(onDark, DEFAULT_THEME.surfaceDark, FADE), DEFAULT_THEME.surfaceDark),
    ).toBeGreaterThanOrEqual(AA);
  });
});

describe("custom colour contract", () => {
  it("accepts six-digit hex and refuses everything else", () => {
    for (const ok of ["#000000", "#FFFFFF", "#0c4fd1", "#ABCDEF"]) {
      expect(sectionStyleSchema.safeParse({ textColor: ok }).success, ok).toBe(true);
    }
    // The list is deliberately adversarial: this value ends up inside a `style`
    // attribute on a public page, so the schema is the boundary that keeps
    // anything but a colour out of it.
    for (const bad of [
      "#ABC",
      "red",
      "rgb(0,0,0)",
      "#12345",
      "#1234567",
      "#GGGGGG",
      "url(x)",
      "#000000; background: url(x)",
      "#000000/**/;color:red",
    ]) {
      expect(sectionStyleSchema.safeParse({ textColor: bad }).success, bad).toBe(false);
    }
  });

  it("accepts custom as a tone", () => {
    expect(
      sectionStyleSchema.safeParse({ textTone: "custom", textColor: "#112233" }).success,
    ).toBe(true);
  });
});
