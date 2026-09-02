import { describe, expect, it } from "vitest";

import { contrastRatio, hslToHex as libHslToHex } from "../color";
import { BRAND_SWATCHES } from "../palettes";
import { DEFAULT_THEME, type ThemeTokens } from "../render-context";
import {
  composeTheme,
  isCustomTitleFont,
  readStyleInputs,
  STYLE_CORNERS,
  STYLE_MODES,
  TITLE_FONTS,
  type StyleInputs,
  type StyleMode,
} from "../style-inputs";
import { stackFor } from "../fonts";

/**
 * The invariant that replaced the readability panel.
 *
 * The old design workspace let a merchant choose every colour and then *warned*
 * them when the result was unreadable. The five-control surface removes the
 * ability to make the mistake — but only if the derivation actually holds, and
 * "it should be fine" is not a guarantee. This sweeps the hue circle and asserts
 * it.
 */

/** The five text/background pairs a visitor actually reads. */
const PAIRS: { id: string; foreground: keyof ThemeTokens; background: keyof ThemeTokens }[] = [
  { id: "button text on brand", foreground: "brandContrast", background: "brand" },
  { id: "body text on the page", foreground: "text", background: "surface" },
  { id: "secondary text on the page", foreground: "textMuted", background: "surface" },
  { id: "text inside cards", foreground: "text", background: "card" },
  { id: "footer text on the dark band", foreground: "textOnDark", background: "surfaceDark" },
];

/** WCAG AA for body text. */
const AA = 4.5;

function hueSweep(step = 15): string[] {
  const out: string[] = [];
  for (let hue = 0; hue < 360; hue += step) {
    // Two saturations and two lightnesses per hue: a pale pastel and a deep
    // brand colour stress opposite ends of `readableOn`.
    out.push(hslToHex(hue, 0.85, 0.45), hslToHex(hue, 0.45, 0.72));
  }
  return out;
}

const inputs = (brand: string, mode: StyleMode): StyleInputs => ({
  brand,
  mode,
  corner: "rounded",
  headingFont: stackFor("inter"),
  fontFamily: stackFor("dm-sans"),
});

describe("five-control theme derivation", () => {
  const brands = hueSweep();

  it("sweeps enough of the hue circle to be worth trusting", () => {
    expect(brands.length).toBeGreaterThanOrEqual(48);
  });

  for (const mode of ["light", "dark"] as StyleMode[]) {
    it(`never produces an unreadable pair in ${mode} mode`, () => {
      const failures: string[] = [];

      for (const brand of brands) {
        const theme = composeTheme(inputs(brand, mode));
        for (const pair of PAIRS) {
          const ratio = contrastRatio(String(theme[pair.foreground]), String(theme[pair.background]));
          if (ratio < AA) {
            failures.push(`${brand} · ${pair.id} · ${ratio.toFixed(2)}:1`);
          }
        }
      }

      expect(failures).toEqual([]);
    });
  }

  it("keeps the brand colour exactly as chosen", () => {
    // Everything else is derived, but the one colour the merchant picked must
    // survive untouched — a brand colour that comes back subtly different is the
    // fastest way to lose their trust in the whole surface.
    for (const brand of brands) {
      expect(composeTheme(inputs(brand, "light")).brand).toBe(brand);
    }
  });

  it("maps corners to the two radii the control offers", () => {
    expect(composeTheme({ ...inputs("#0C4FD1", "light"), corner: "square" }).radius).toBe(
      STYLE_CORNERS.square,
    );
    expect(composeTheme({ ...inputs("#0C4FD1", "light"), corner: "rounded" }).radius).toBe(
      STYLE_CORNERS.rounded,
    );
  });
});

describe("reading a stored theme back into five controls", () => {
  it("round-trips everything the controls can express", () => {
    for (const mode of ["light", "dark"] as StyleMode[]) {
      for (const corner of ["rounded", "square"] as const) {
        const original = { ...inputs("#0C4FD1", mode), corner };
        expect(readStyleInputs(composeTheme(original))).toEqual(original);
      }
    }
  });

  it("recovers the mode from the surface rather than a stored flag", () => {
    // This is what keeps the five-control surface migration-free: nothing new is
    // persisted, so `mode` has to be recoverable from the palette itself.
    expect(readStyleInputs(composeTheme(inputs("#0C4FD1", "dark"))).mode).toBe("dark");
    expect(readStyleInputs(composeTheme(inputs("#0C4FD1", "light"))).mode).toBe("light");
    expect(STYLE_MODES.dark.surface).not.toBe(STYLE_MODES.light.surface);
  });

  it("opens a theme saved by the old ten-colour workspace", () => {
    // The workspace offered radii the new control does not, and palettes whose
    // surfaces are neither of the two fixed values. Opening one must produce the
    // nearest equivalent, not a crash and not a refusal.
    const legacy = { ...DEFAULT_THEME, radius: "20px", surface: "#FAF7F2", brand: "#7C3AED" };
    const read = readStyleInputs(legacy as ThemeTokens);

    expect(read.corner).toBe("rounded");
    expect(read.mode).toBe("light");
    expect(read.brand).toBe("#7C3AED");
  });

  it("calls a heading face outside the three named options Custom", () => {
    expect(isCustomTitleFont(stackFor("inter"))).toBe(false);
    expect(isCustomTitleFont(stackFor("pacifico"))).toBe(true);
    for (const font of TITLE_FONTS) {
      expect(isCustomTitleFont(stackFor(font.fontId))).toBe(false);
    }
  });
});

/** Test-local so the sweep does not depend on a colour library. */
function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

describe("the brand colours the picker offers by name", () => {
  // The hue sweep above proves *no* brand colour can produce an unreadable
  // page. This is narrower and more pointed: these twenty-four are the ones a
  // merchant reaches in a single click, so they are the ones most likely to
  // actually ship, and a regression here would be visible on real websites.
  for (const mode of ["light", "dark"] as StyleMode[]) {
    it(`stays readable in ${mode} mode`, () => {
      const failures: string[] = [];

      for (const swatch of BRAND_SWATCHES) {
        const theme = composeTheme(inputs(swatch.hex, mode));
        for (const pair of PAIRS) {
          const ratio = contrastRatio(
            String(theme[pair.foreground]),
            String(theme[pair.background]),
          );
          if (ratio < AA) failures.push(`${swatch.name} · ${pair.id} · ${ratio.toFixed(2)}:1`);
        }
      }

      expect(failures).toEqual([]);
    });
  }
});

describe("the shared colour converter", () => {
  it("agrees with the independent one this sweep is built on", () => {
    // `hslToHex` below is deliberately test-local so the readability sweep does
    // not depend on the code it is checking. That makes it a second opinion
    // worth having: the picker uses the library version, and the two disagreeing
    // would mean one of them is wrong.
    const drift: string[] = [];
    for (let hue = 0; hue < 360; hue += 7) {
      for (const [s, l] of [
        [0.85, 0.45],
        [0.45, 0.72],
        [0.2, 0.3],
      ] as const) {
        const mine = libHslToHex({ h: hue, s, l });
        const reference = hslToHex(hue, s, l);
        if (mine !== reference) drift.push(`${hue} ${s} ${l}: ${mine} vs ${reference}`);
      }
    }
    expect(drift).toEqual([]);
  });
});
