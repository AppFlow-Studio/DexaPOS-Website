/**
 * Colour maths for the site theme.
 *
 * Lives outside the design workspace because two callers need the same answers:
 * the workspace (validating what a merchant types, deriving the neutrals they
 * never see) and the palette catalogue (which is checked against these rules in
 * tests, so a shipped palette cannot carry unreadable text).
 *
 * Contrast is WCAG 2.1 relative luminance, not a channel average — an average
 * calls white-on-gold readable when it is not.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: string): boolean {
  return HEX_PATTERN.test(value.trim());
}

/** Accepts `#abc` and `#aabbcc`; returns `#AABBCC`. Invalid input returns null. */
export function normalizeHex(value: string): string | null {
  const raw = value.trim();
  if (HEX_PATTERN.test(raw)) return raw.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    const [, r, g, b] = raw;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return null;
}

export function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex) ?? "#000000";
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

/** Linear blend of two colours. `amount` 0 returns `from`, 1 returns `to`. */
export function mix(from: string, to: string, amount: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = Math.min(1, Math.max(0, amount));
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

/** WCAG 2.1 relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export function isLight(hex: string): boolean {
  return relativeLuminance(hex) > 0.45;
}

/** The darker/lighter of two foregrounds, whichever reads better on `background`. */
export function readableOn(background: string, dark = "#111827", light = "#FFFFFF"): string {
  return contrastRatio(background, dark) >= contrastRatio(background, light) ? dark : light;
}

export type ContrastGrade = "aaa" | "aa" | "aa-large" | "fail";

/**
 * Grades a foreground/background pair against WCAG 2.1.
 *
 * `aa-large` means the pair only passes at 18pt/14pt-bold and up — fine for a
 * hero headline, not for body copy, which is exactly the distinction a merchant
 * choosing a brand colour needs to be told about.
 */
export function gradeContrast(foreground: string, background: string): ContrastGrade {
  const ratio = contrastRatio(foreground, background);
  if (ratio >= 7) return "aaa";
  if (ratio >= 4.5) return "aa";
  if (ratio >= 3) return "aa-large";
  return "fail";
}

/** The colour keys a palette owns. `fontFamily`/`headingFont`/`radius` are not colours. */
export const THEME_COLOR_KEYS = [
  "brand",
  "brandContrast",
  "surface",
  "surfaceMuted",
  "surfaceDark",
  "text",
  "textMuted",
  "textOnDark",
  "border",
  "card",
] as const;

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

export type ThemeColors = Record<ThemeColorKey, string>;

/**
 * Fills in the six supporting colours from the three a merchant actually picks.
 *
 * The design workspace only ever asks for brand, page background, and text.
 * Everything else — muted panels, borders, the dark footer, muted copy — is
 * derived here so a merchant who chooses a near-black page background cannot end
 * up with the light-grey borders and near-white muted panels the old preset list
 * left behind.
 */
export function deriveThemeColors(core: {
  brand: string;
  surface: string;
  text: string;
}): ThemeColors {
  const { brand, surface, text } = core;
  const lightSurface = isLight(surface);

  return {
    brand,
    brandContrast: readableOn(brand),
    surface,
    // A panel that sits *on* the page: nudged toward the text colour so it
    // separates on a light page and lifts on a dark one.
    surfaceMuted: lightSurface ? mix(surface, text, 0.05) : mix(surface, "#FFFFFF", 0.055),
    // The footer band. On a light page it is a deep tint of the text colour; on
    // an already-dark page it goes deeper still rather than inverting.
    surfaceDark: lightSurface ? mix(text, "#000000", 0.12) : mix(surface, "#000000", 0.45),
    text,
    // Pulled only 36% toward the background. Anything looser reads as "dimmer"
    // but drops secondary copy — hours, descriptions, captions — below the 4.5:1
    // AA threshold, which the palette test enforces.
    textMuted: mix(text, surface, 0.36),
    textOnDark: lightSurface
      ? readableOn(mix(text, "#000000", 0.12))
      : readableOn(mix(surface, "#000000", 0.45)),
    border: lightSurface ? mix(surface, text, 0.14) : mix(surface, "#FFFFFF", 0.14),
    card: lightSurface ? "#FFFFFF" : mix(surface, "#FFFFFF", 0.07),
  };
}
