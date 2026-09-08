/**
 * The five inputs a merchant actually chooses, and the full theme they produce.
 *
 * The design surface used to ask for ten colours, two typefaces and four radii.
 * It now asks for a brand colour, light or dark, rounded or square, and a title
 * face — and everything else is computed here.
 *
 * **This is where the readability guarantee lives.** The workspace this replaced
 * shipped a WCAG panel that *warned* a merchant when their colours were
 * unreadable. Removing the ability to choose text and background colours turns
 * that warning into an invariant: there is no combination of the five inputs
 * that produces an unreadable page, and `__tests__/style-derivation.test.ts`
 * asserts it across a sweep of brand hues rather than trusting the claim.
 *
 * Pure and React-free so the test, the overlay and any future generator all
 * agree about what a theme is.
 */

import { contrastRatio, deriveThemeColors, isLight } from "./color";
import { stackFor } from "./fonts";
import type { ThemeTokens } from "./render-context";

/** WCAG AA for body-sized text. Button labels are 14px semibold — not "large". */
const AA = 4.5;

/**
 * The two ends of the Light/Dark switch.
 *
 * Fixed rather than merchant-chosen, which is the entire point: these pairs are
 * known to clear AA against any brand colour once `deriveThemeColors` has filled
 * in the rest.
 */
export const STYLE_MODES = {
  light: { surface: "#FFFFFF", text: "#111827" },
  dark: { surface: "#0F1115", text: "#F5F5F4" },
} as const;

export type StyleMode = keyof typeof STYLE_MODES;

export const STYLE_CORNERS = {
  rounded: "12px",
  square: "2px",
} as const;

export type StyleCorner = keyof typeof STYLE_CORNERS;

/**
 * The three named title faces, plus "Custom" for anything else already stored.
 *
 * Only the heading face is offered. The body face is set once and left alone —
 * it is the one a merchant will never have an opinion about and the one most
 * easily ruined.
 */
export const TITLE_FONTS = [
  { id: "sans", label: "Sans serif", fontId: "inter" },
  { id: "serif", label: "Serif", fontId: "playfair" },
  { id: "condensed", label: "Condensed", fontId: "oswald" },
] as const;

export const DEFAULT_BODY_FONT = stackFor("dm-sans");

export interface StyleInputs {
  brand: string;
  mode: StyleMode;
  corner: StyleCorner;
  headingFont: string;
  fontFamily: string;
}

/**
 * A label colour for the brand button that is guaranteed to clear AA.
 *
 * `readableOn` picks between white and a soft near-black **by a luminance
 * threshold**, which is right almost always and wrong in a narrow band of
 * mid-tone brand colours: a vivid magenta lands just dark enough to be given
 * white, at 4.35:1. The derivation-sweep test found it at `#D411D4`.
 *
 * So: keep the designed pair when it clears AA — the soft near-black is nicer
 * than pure black and is what the rest of the product uses — and fall back to
 * the true extremes only when it does not. That fallback always succeeds: the
 * worst possible background sits where white and black are equally distant, and
 * both measure 4.58:1 there, so an accessible label always exists.
 *
 * Deliberately local rather than a fix inside `readableOn`, which every stored
 * palette in the product already depends on. Changing it there would restyle
 * existing merchants' sites as a side effect of a UI rebuild; changing it here
 * affects only themes composed from the five controls. Worth revisiting in
 * `color.ts` on its own terms.
 */
function accessibleOn(background: string): string {
  const best = (candidates: string[]) =>
    candidates.reduce((a, b) =>
      contrastRatio(b, background) > contrastRatio(a, background) ? b : a,
    );

  const designed = best(["#FFFFFF", "#111827"]);
  if (contrastRatio(designed, background) >= AA) return designed;

  return best(["#FFFFFF", "#000000"]);
}

/** The five inputs → the full token set the renderer reads. */
export function composeTheme(inputs: StyleInputs): ThemeTokens {
  const colors = deriveThemeColors({ brand: inputs.brand, ...STYLE_MODES[inputs.mode] });
  return {
    ...colors,
    brandContrast: accessibleOn(colors.brand),
    radius: STYLE_CORNERS[inputs.corner],
    headingFont: inputs.headingFont,
    fontFamily: inputs.fontFamily,
  } as ThemeTokens;
}

/**
 * A stored theme → the five inputs.
 *
 * Nothing new is persisted to make this work: `mode` is recovered from the
 * surface's luminance and `corner` from the radius. That is what keeps the
 * five-control surface a UI change with no migration behind it — and it means a
 * theme saved by the old ten-colour workspace still opens, showing the nearest
 * equivalent rather than refusing to load.
 */
export function readStyleInputs(theme: ThemeTokens): StyleInputs {
  return {
    brand: (theme.brand || "#0C4FD1").toUpperCase(),
    mode: isLight(theme.surface) ? "light" : "dark",
    // The old workspace offered 2/6/12/20px; only the extremes survive as named
    // choices, so anything at or below the midpoint reads as square.
    corner: parseInt(theme.radius, 10) <= 6 ? "square" : "rounded",
    headingFont: theme.headingFont || theme.fontFamily || DEFAULT_BODY_FONT,
    fontFamily: theme.fontFamily || DEFAULT_BODY_FONT,
  };
}

/** True when the stored heading face is not one of the three named options. */
export function isCustomTitleFont(headingFont: string): boolean {
  return !TITLE_FONTS.some((font) => stackFor(font.fontId) === headingFont);
}
