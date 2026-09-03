import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  deriveThemeColors,
  gradeContrast,
  isLight,
  hexToHsl,
  hslToHex,
  mix,
  normalizeHex,
  rgbToHex,
  THEME_COLOR_KEYS,
} from "@/lib/site-builder/color";
import {
  FONT_PAIRINGS,
  SITE_FONTS,
  findFontByStack,
  googleFontsHref,
  stackFor,
} from "@/lib/site-builder/fonts";
import {
  BRAND_SWATCHES,
  SITE_PALETTES,
  brandSwatchName,
  matchPalette,
  paletteColors,
} from "@/lib/site-builder/palettes";
import { DEFAULT_THEME, resolveTheme, themeToCssVars } from "@/lib/site-builder/render-context";

describe("contrast maths", () => {
  it("matches the WCAG reference ratio for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("is symmetric in its arguments", () => {
    expect(contrastRatio("#0C4FD1", "#FFFFFF")).toBeCloseTo(contrastRatio("#FFFFFF", "#0C4FD1"), 10);
  });

  it("grades a pair that only clears the large-text threshold", () => {
    // ~3.1:1 — legible as a headline, not as body copy.
    expect(gradeContrast("#767676", "#FFFFFF")).toBe("aa");
    expect(gradeContrast("#949494", "#FFFFFF")).toBe("aa-large");
    expect(gradeContrast("#CCCCCC", "#FFFFFF")).toBe("fail");
  });

  it("normalises shorthand and rejects non-colours", () => {
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex("#0c4fd1")).toBe("#0C4FD1");
    expect(normalizeHex("blue")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
  });

  it("mixes toward the target colour", () => {
    expect(mix("#000000", "#FFFFFF", 0)).toBe("#000000");
    expect(mix("#000000", "#FFFFFF", 1)).toBe("#FFFFFF");
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });
});

describe("derived theme colours", () => {
  it("keeps supporting colours on the dark side of a dark page", () => {
    const derived = deriveThemeColors({ brand: "#C9A227", surface: "#0F1115", text: "#F4F5F7" });

    // The bug this replaces: a dark preset that only set four colours kept the
    // light-mode border and near-white muted panel underneath it.
    expect(isLight(derived.border)).toBe(false);
    expect(isLight(derived.surfaceMuted)).toBe(false);
    expect(isLight(derived.card)).toBe(false);
    expect(derived.card).not.toBe("#FFFFFF");
  });

  it("keeps supporting colours light on a light page", () => {
    const derived = deriveThemeColors({ brand: "#0C4FD1", surface: "#FFFFFF", text: "#111827" });
    expect(derived.card).toBe("#FFFFFF");
    expect(isLight(derived.border)).toBe(true);
    expect(isLight(derived.surfaceDark)).toBe(false);
  });

  it("chooses a readable foreground for the brand colour", () => {
    // Yellow is the classic trap: white button text on it is unreadable.
    expect(deriveThemeColors({ brand: "#F59E0B", surface: "#FFF", text: "#000" }).brandContrast).toBe("#111827");
    expect(deriveThemeColors({ brand: "#0C4FD1", surface: "#FFF", text: "#000" }).brandContrast).toBe("#FFFFFF");
  });
});

describe("shipped palettes", () => {
  it("has unique ids", () => {
    expect(new Set(SITE_PALETTES.map((p) => p.id)).size).toBe(SITE_PALETTES.length);
  });

  it("resolves a complete colour set for every palette", () => {
    for (const palette of SITE_PALETTES) {
      const colors = paletteColors(palette);
      for (const key of THEME_COLOR_KEYS) {
        expect(colors[key], `${palette.id}.${key}`).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
  });

  it("never ships an unreadable text/background pair", () => {
    for (const palette of SITE_PALETTES) {
      const c = paletteColors(palette);
      const pairs: [string, string, string][] = [
        ["body text", c.text, c.surface],
        ["card text", c.text, c.card],
        ["button text", c.brandContrast, c.brand],
        ["footer text", c.textOnDark, c.surfaceDark],
      ];
      for (const [label, fg, bg] of pairs) {
        expect(contrastRatio(fg, bg), `${palette.id} — ${label}`).toBeGreaterThanOrEqual(4.5);
      }
      // Secondary copy is smaller and dimmer, but still has to be legible.
      expect(contrastRatio(c.textMuted, c.surface), `${palette.id} — muted text`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("round-trips a palette through matchPalette", () => {
    for (const palette of SITE_PALETTES) {
      expect(matchPalette(paletteColors(palette))?.id).toBe(palette.id);
    }
    expect(matchPalette({ brand: "#123456" })).toBeNull();
  });
});

describe("font catalogue", () => {
  it("has unique ids and resolvable stacks", () => {
    expect(new Set(SITE_FONTS.map((f) => f.id)).size).toBe(SITE_FONTS.length);
    for (const font of SITE_FONTS) {
      expect(findFontByStack(font.stack)?.id, font.id).toBe(font.id);
      // Every stack must end in something the device already has.
      expect(font.stack).toMatch(/(sans-serif|serif)$/);
    }
  });

  /**
   * Catches the copy-paste slip that bulk-adding a catalogue invites: a new
   * entry whose `google` parameter still names the font it was copied from, so
   * the picker shows a specimen in one face and the live page loads another.
   * Neither the uniqueness check nor the stack check can see that.
   */
  it("loads the same family it claims to render", () => {
    for (const font of SITE_FONTS) {
      if (!font.google) continue;

      const requested = font.google.split(":")[0].replace(/\+/g, " ");
      const firstInStack = font.stack.match(/^"([^"]+)"/)?.[1];

      expect(firstInStack, `${font.id} stack must open with a quoted family`).toBeDefined();
      expect(requested, font.id).toBe(firstInStack);
    }
  });

  it("offers a display or handwritten face for headings only", () => {
    for (const font of SITE_FONTS) {
      if (font.category === "Display" || font.category === "Handwritten") {
        expect(font.roles, font.id).not.toContain("body");
      }
    }
  });

  it("only pairs fonts that exist and are allowed in their slot", () => {
    for (const pairing of FONT_PAIRINGS) {
      const heading = SITE_FONTS.find((f) => f.id === pairing.headingId);
      const body = SITE_FONTS.find((f) => f.id === pairing.bodyId);
      expect(heading, pairing.id).toBeDefined();
      expect(body, pairing.id).toBeDefined();
      expect(heading?.roles, `${pairing.id} heading`).toContain("heading");
      expect(body?.roles, `${pairing.id} body`).toContain("body");
    }
  });

  it("builds a Google Fonts URL for exactly the families in use", () => {
    const href = googleFontsHref([stackFor("playfair"), stackFor("dm-sans")]);
    expect(href).toContain("family=DM+Sans");
    expect(href).toContain("family=Playfair+Display");
    expect(href).toContain("display=swap");
    expect(href).not.toContain("family=Anton");
  });

  it("returns null when nothing needs downloading", () => {
    expect(googleFontsHref([stackFor("system-sans"), stackFor("system-serif")])).toBeNull();
    expect(googleFontsHref([undefined, null])).toBeNull();
  });

  it("loads the default theme's body font rather than silently falling back", () => {
    // The regression this guards: DEFAULT_THEME claimed DM Sans while nothing
    // on the page ever requested the file, so every site rendered in system-ui.
    expect(googleFontsHref([DEFAULT_THEME.fontFamily])).toContain("family=DM+Sans");
  });
});

describe("theme resolution", () => {
  it("falls a missing heading font back to the merchant's body font", () => {
    const stored = { fontFamily: 'Georgia, "Times New Roman", serif' };
    expect(resolveTheme(stored).headingFont).toBe(stored.fontFamily);
  });

  it("prefers a stored heading font over the body font", () => {
    const resolved = resolveTheme({ fontFamily: "A, serif", headingFont: "B, serif" });
    expect(resolved.headingFont).toBe("B, serif");
  });

  it("layers stored values over fallbacks over defaults", () => {
    const resolved = resolveTheme({ brand: "#AA0000" }, { brand: "#00AA00", surface: "#F0F0F0" });
    expect(resolved.brand).toBe("#AA0000");
    expect(resolved.surface).toBe("#F0F0F0");
    expect(resolved.text).toBe(DEFAULT_THEME.text);
  });

  it("derives button-text colour rather than inheriting it across layers", () => {
    // The live bug this fixes: a storefront `primary_color` of light teal
    // arrived as `brand` from the fallback layer while `brandContrast` stayed at
    // the default white — 1.9:1, unreadable — on every site that inherited one.
    const resolved = resolveTheme(null, { brand: "#2DD4BF" });
    expect(resolved.brand).toBe("#2DD4BF");
    expect(resolved.brandContrast).toBe("#111827");
    expect(contrastRatio(resolved.brandContrast, resolved.brand)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps a brand/contrast pair that was saved together", () => {
    const resolved = resolveTheme({ brand: "#0C4FD1", brandContrast: "#FFFFFF" });
    expect(resolved.brandContrast).toBe("#FFFFFF");
  });

  it("does not let a stored brand inherit the fallback's contrast colour", () => {
    const resolved = resolveTheme({ brand: "#FDE047" }, { brand: "#0C4FD1", brandContrast: "#FFFFFF" });
    expect(resolved.brandContrast).toBe("#111827");
  });

  it("emits a heading-font custom property", () => {
    const vars = themeToCssVars(resolveTheme({ headingFont: "Anton, sans-serif" }));
    expect(vars["--site-heading-font"]).toBe("Anton, sans-serif");
  });
});

describe("hue, saturation and lightness", () => {
  it("agrees with the reference values for the primaries", () => {
    expect(hexToHsl("#FF0000")).toMatchObject({ h: 0 });
    expect(hexToHsl("#FF0000").s).toBeCloseTo(1, 5);
    expect(hexToHsl("#FF0000").l).toBeCloseTo(0.5, 5);

    expect(hexToHsl("#00FF00").h).toBeCloseTo(120, 5);
    expect(hexToHsl("#0000FF").h).toBeCloseTo(240, 5);
  });

  it("reports greys as having no hue and no saturation", () => {
    for (const grey of ["#000000", "#808080", "#FFFFFF"]) {
      expect(hexToHsl(grey).s, grey).toBeCloseTo(0, 5);
      expect(hexToHsl(grey).h, grey).toBe(0);
    }
    expect(hexToHsl("#FFFFFF").l).toBeCloseTo(1, 5);
    expect(hexToHsl("#000000").l).toBeCloseTo(0, 5);
  });

  it("round-trips every colour the picker can produce", () => {
    // The picker derives HSL from the stored hex on every render rather than
    // holding it in state, so a lossy round-trip would show up as a swatch that
    // will not stay selected.
    const drift: string[] = [];
    for (const swatch of BRAND_SWATCHES) {
      if (hslToHex(hexToHsl(swatch.hex)) !== swatch.hex) drift.push(swatch.name);
    }
    expect(drift).toEqual([]);
  });

  it("round-trips a broad sweep of colours, not just the shortlist", () => {
    const drift: string[] = [];
    for (let r = 0; r < 256; r += 17) {
      for (let g = 0; g < 256; g += 51) {
        for (let b = 0; b < 256; b += 85) {
          const hex = rgbToHex({ r, g, b });
          if (hslToHex(hexToHsl(hex)) !== hex) drift.push(hex);
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it("wraps hue and clamps saturation and lightness", () => {
    // The hue slider is a wheel with a seam in it, and the shade ramp is
    // arithmetic on a value a caller could push past either end.
    expect(hslToHex({ h: 360, s: 0.8, l: 0.5 })).toBe(hslToHex({ h: 0, s: 0.8, l: 0.5 }));
    expect(hslToHex({ h: -30, s: 0.8, l: 0.5 })).toBe(hslToHex({ h: 330, s: 0.8, l: 0.5 }));
    expect(hslToHex({ h: 200, s: 5, l: 2 })).toBe("#FFFFFF");
    expect(hslToHex({ h: 200, s: 0.5, l: -1 })).toBe("#000000");
  });
});

describe("the brand colour shortlist", () => {
  it("stores every swatch as a normalised uppercase hex", () => {
    for (const swatch of BRAND_SWATCHES) {
      expect(normalizeHex(swatch.hex), swatch.name).toBe(swatch.hex);
    }
  });

  it("offers no colour and no name twice", () => {
    // A duplicate hex would render two swatches that both light up when either
    // is clicked, and `brandSwatchName` would silently pick the first.
    expect(new Set(BRAND_SWATCHES.map((s) => s.hex)).size).toBe(BRAND_SWATCHES.length);
    expect(new Set(BRAND_SWATCHES.map((s) => s.name)).size).toBe(BRAND_SWATCHES.length);
  });

  it("fills the six-wide grid the picker lays out", () => {
    expect(BRAND_SWATCHES.length % 6).toBe(0);
  });

  it("names a colour it knows and stays quiet about one it does not", () => {
    expect(brandSwatchName("#0C4FD1")).toBe("Azure");
    // The stored theme is uppercase, but a merchant pasting a hex is not.
    expect(brandSwatchName("#0c4fd1")).toBe("Azure");
    expect(brandSwatchName("  #0C4FD1  ")).toBe("Azure");
    expect(brandSwatchName("#123456")).toBeUndefined();
  });
});
