/**
 * Rules that keep a *branded* QR code scannable.
 *
 * These are field-failure constraints, not stylistic preferences. A QR code
 * with a logo punched through the middle and the merchant's brand colours
 * applied is one bad parameter away from being unreadable on paper, and the
 * merchant only finds out after printing a few hundred table tents.
 *
 * Everything here is pure and synchronous so it can be unit-tested without a
 * DOM. The renderer (`lib/qr/render.ts`) is the only consumer that needs a
 * browser.
 */

export const ECC_WITH_LOGO = "H" as const;
export const ECC_WITHOUT_LOGO = "Q" as const;

export type QrErrorCorrectionLevel = "L" | "M" | "Q" | "H";

/**
 * Fraction of a QR code's total area that error correction can reconstruct.
 * These are the QR spec's recovery capacities, and they are also the exact
 * coefficients `qr-code-styling` multiplies `imageOptions.imageSize` by.
 */
export const ECC_RECOVERY_CAPACITY: Record<QrErrorCorrectionLevel, number> = {
  L: 0.07,
  M: 0.15,
  Q: 0.25,
  H: 0.3,
};

/**
 * Hard cap from the ticket: the logo may occlude at most 25% of the QR's area.
 * Clamped in code — never left to the merchant.
 *
 * This is a ceiling, not a target. `maxLogoAreaFractionForModules` lowers it
 * further for small codes, which the ticket's flat number does not survive.
 */
export const MAX_LOGO_AREA_FRACTION = 0.25;

/**
 * The safe logo area for a code of `moduleCount` modules.
 *
 * **A flat 25% is not safe across QR versions**, and this was measured, not
 * reasoned about. A table code encodes a ~184-character signed-token URL and
 * comes out at version 14 (73×73). A marketing code encodes a ~59-character
 * short-code URL and comes out at **version 6 (41×41)**. The same centred logo
 * that leaves a version 14 code readable makes a version 6 code undecodable:
 * the first branded marketing QR produced by this codebase failed to decode at
 * every scale from 1200px down to 300px, while the equivalent table code
 * decoded at all of them.
 *
 * The reason is block structure, not area. Error correction is applied per
 * interleaved block; a low version has few blocks, so one contiguous centre
 * square can exhaust a whole block's recovery budget while the same *fraction*
 * spread over a high version's many blocks stays inside it. Reed–Solomon
 * recovers scattered damage far better than a solid hole.
 *
 * Thresholds below sit under the measured failure points with margin:
 *
 * | modules | measured OK | measured FAIL | shipped |
 * |---------|-------------|---------------|---------|
 * | 41 (v6) | 16%         | 20%           | 14%     |
 * | 73 (v14)| 20%         | 25%           | 22%     |
 *
 * Tune only against the printed-scan matrix, and re-measure both a short
 * marketing URL and a long table URL when you do — they are different codes.
 */
export function maxLogoAreaFractionForModules(moduleCount: number): number {
  if (!Number.isFinite(moduleCount) || moduleCount <= 0) {
    // Nothing to reason about; take the most conservative option.
    return 0.14;
  }

  if (moduleCount <= 45) return 0.14; // version 1–7
  if (moduleCount <= 65) return 0.18; // version 8–12
  return 0.22; // version 13 and up
}

/** Quiet zone required by the QR spec, in modules, on every side. */
export const QUIET_ZONE_MODULES = 4;

/**
 * Minimum contrast ratio between the module colour and the background.
 *
 * Deliberately conservative: 4.5:1 is the WCAG AA text threshold, borrowed
 * here as a print floor because a scanner binarising a photo of a printed
 * code under bad lighting has less signal to work with than an eye reading a
 * screen. Tune only against the printed-scan matrix in the ticket, never to
 * make a specific merchant's brand colour pass.
 */
export const MIN_CONTRAST_RATIO = 4.5;

export const DEFAULT_MODULE_COLOR = "#111827";
export const DEFAULT_BACKGROUND_COLOR = "#FFFFFF";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Accepts `#rgb`, `#rrggbb`, and the same without the leading `#`. */
export function parseHexColor(input: string | null | undefined): Rgb | null {
  if (!input) return null;

  const hex = input.trim().replace(/^#/, "");
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;

  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

/** WCAG relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1..21. Order-independent. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * True when the modules are *lighter* than the background — a "light on dark"
 * QR code. It looks striking and a large share of scanners refuse to read it,
 * because decoders assume dark modules on a light field.
 */
export function isInverted(moduleColor: Rgb, backgroundColor: Rgb): boolean {
  return relativeLuminance(moduleColor) > relativeLuminance(backgroundColor);
}

export type QrBrandingIssueCode =
  | "invalid_module_color"
  | "invalid_background_color"
  | "invalid_secondary_color"
  | "inverted"
  | "low_contrast";

/**
 * Which colour the issue is about. `primary` problems make the code
 * unscannable and force a fallback; `secondary` problems only cost the
 * gradient.
 */
export type QrBrandingScope = "primary" | "secondary";

export interface QrBrandingIssue {
  code: QrBrandingIssueCode;
  scope: QrBrandingScope;
  /** Merchant-facing sentence. Always says *why*, never just "invalid". */
  message: string;
}

export interface QrBrandingColorInput {
  moduleColor?: string | null;
  backgroundColor?: string | null;
  /** Optional gradient end stop. Checked against the same rules when present. */
  secondaryColor?: string | null;
}

/**
 * Validate colours *at the moment the merchant picks them*.
 *
 * This is the "reject at input with a visible reason" path. It returns every
 * problem rather than the first, so the settings screen can show them all at
 * once instead of making the merchant fix one, save, and discover the next.
 *
 * Do not call this at render time — see `resolveQrBranding`, which degrades
 * instead of failing so that an old row with bad colours still prints.
 */
export function validateQrBrandingColors(
  input: QrBrandingColorInput
): QrBrandingIssue[] {
  const issues: QrBrandingIssue[] = [];

  const moduleRgb = parseHexColor(input.moduleColor ?? DEFAULT_MODULE_COLOR);
  const backgroundRgb = parseHexColor(
    input.backgroundColor ?? DEFAULT_BACKGROUND_COLOR
  );

  if (!moduleRgb) {
    issues.push({
      code: "invalid_module_color",
      scope: "primary",
      message: `"${input.moduleColor}" is not a valid hex colour. Use a value like #0C4FD1.`,
    });
  }

  if (!backgroundRgb) {
    issues.push({
      code: "invalid_background_color",
      scope: "primary",
      message: `"${input.backgroundColor}" is not a valid hex colour. Use a value like #FFFFFF.`,
    });
  }

  // A gradient end stop is optional, but if one is set it has to survive the
  // same checks as the start stop — a gradient that fades into the background
  // is unscannable at the pale end even when the dark end looks fine.
  if (input.secondaryColor) {
    const secondaryRgb = parseHexColor(input.secondaryColor);
    if (!secondaryRgb) {
      issues.push({
        code: "invalid_secondary_color",
        scope: "secondary",
        message: `"${input.secondaryColor}" is not a valid hex colour. Use a value like #0C4FD1.`,
      });
    } else if (backgroundRgb) {
      issues.push(
        ...checkContrastAndInversion(secondaryRgb, backgroundRgb, "secondary")
      );
    }
  }

  if (moduleRgb && backgroundRgb) {
    issues.push(...checkContrastAndInversion(moduleRgb, backgroundRgb, "primary"));
  }

  return issues;
}

const SCOPE_LABEL: Record<QrBrandingScope, string> = {
  primary: "QR colour",
  secondary: "second gradient colour",
};

function checkContrastAndInversion(
  moduleRgb: Rgb,
  backgroundRgb: Rgb,
  scope: QrBrandingScope
): QrBrandingIssue[] {
  const label = SCOPE_LABEL[scope];

  if (isInverted(moduleRgb, backgroundRgb)) {
    return [
      {
        code: "inverted",
        scope,
        message:
          `This ${label} is lighter than the background. Many phone cameras cannot read ` +
          `light-on-dark QR codes, so the code must stay dark on a light background.`,
      },
    ];
  }

  const ratio = contrastRatio(moduleRgb, backgroundRgb);
  if (ratio < MIN_CONTRAST_RATIO) {
    return [
      {
        code: "low_contrast",
        scope,
        message:
          `This ${label} is too close to the background to scan reliably ` +
          `(contrast ${ratio.toFixed(1)}:1, minimum ${MIN_CONTRAST_RATIO}:1). ` +
          `Pick a darker colour.`,
      },
    ];
  }

  return [];
}

export interface ResolvedQrBranding {
  moduleColor: string;
  backgroundColor: string;
  /** Present only when a gradient is both requested and safe. */
  secondaryColor: string | null;
  logoUrl: string | null;
  errorCorrectionLevel: QrErrorCorrectionLevel;
  /**
   * Non-empty when stored branding had to be dropped. The caller MUST surface
   * these — the ticket forbids silently falling back to an unbranded code.
   */
  warnings: string[];
}

export interface ResolveQrBrandingInput extends QrBrandingColorInput {
  logoUrl?: string | null;
}

/**
 * Resolve branding *at render time*. Never throws.
 *
 * Input validation already rejects bad colours, but rows predating this
 * feature — or written by an admin tool that skips the form — can still hold
 * something unscannable. Refusing to render would leave the merchant unable to
 * print at all, so we fall back to safe defaults and report what we dropped.
 * The caller is responsible for showing `warnings`; dropping them on the floor
 * turns this into the silent fallback the ticket explicitly forbids.
 */
export function resolveQrBranding(
  input: ResolveQrBrandingInput
): ResolvedQrBranding {
  const warnings: string[] = [];
  const logoUrl = input.logoUrl?.trim() || null;

  const requestedModule = input.moduleColor?.trim() || DEFAULT_MODULE_COLOR;
  const requestedBackground =
    input.backgroundColor?.trim() || DEFAULT_BACKGROUND_COLOR;

  const issues = validateQrBrandingColors({
    moduleColor: requestedModule,
    backgroundColor: requestedBackground,
    secondaryColor: input.secondaryColor,
  });

  let moduleColor = requestedModule;
  let backgroundColor = requestedBackground;

  // Any problem involving the primary pair invalidates the pair as a whole:
  // we cannot keep a brand module colour and swap only the background without
  // guessing at the merchant's intent.
  const primaryPairBroken = issues.some((issue) => issue.scope === "primary");

  if (primaryPairBroken) {
    moduleColor = DEFAULT_MODULE_COLOR;
    backgroundColor = DEFAULT_BACKGROUND_COLOR;
    warnings.push(
      "This store's brand colours cannot be scanned reliably, so the QR code was " +
        "rendered in the default black on white. Update the colours in Online Store settings."
    );
  }

  // The gradient is a separate, droppable enhancement: losing it degrades the
  // look without touching scannability, so it does not poison the base colours.
  let secondaryColor = input.secondaryColor?.trim() || null;
  const secondaryBroken =
    secondaryColor !== null &&
    (primaryPairBroken || issues.some((issue) => issue.scope === "secondary"));

  if (secondaryBroken) {
    secondaryColor = null;
    warnings.push(
      "The second brand colour was skipped because the resulting gradient would not scan reliably."
    );
  }

  return {
    moduleColor,
    backgroundColor,
    secondaryColor,
    logoUrl,
    // Level H is mandatory once a logo occludes the centre. Without a logo we
    // keep Q, which is what unbranded codes have always used and keeps the
    // module grid coarser (and so easier to scan small).
    errorCorrectionLevel: logoUrl ? ECC_WITH_LOGO : ECC_WITHOUT_LOGO,
    warnings,
  };
}

/**
 * Convert the ticket's "logo covers at most N% of the QR *area*" rule into the
 * `imageSize` number `qr-code-styling` actually wants.
 *
 * These are NOT the same unit, and the mistake is invisible in review. The
 * library computes `hiddenModules = imageSize * ECC_RECOVERY_CAPACITY[ecc] * totalModules`,
 * so `imageSize` is a fraction *of the error-correction budget*, not of the code.
 *
 * Worked example: the library's own default `imageSize: 0.4` at level H hides
 * 0.4 * 0.3 = 12% of the code, not 40%. Conversely, passing 0.25 to "comply"
 * with a 25% cap would hide only 7.5% — a needlessly tiny logo.
 */
export function areaFractionToImageSize(
  areaFraction: number,
  errorCorrectionLevel: QrErrorCorrectionLevel
): number {
  const cappedArea = Math.min(
    Math.max(areaFraction, 0),
    MAX_LOGO_AREA_FRACTION
  );
  const imageSize = cappedArea / ECC_RECOVERY_CAPACITY[errorCorrectionLevel];

  // The library treats imageSize > 1 as "hide more modules than error
  // correction can rebuild", which is exactly the unscannable case.
  return Math.min(imageSize, 1);
}

/**
 * Quiet-zone margin in pixels for a code of `moduleCount` modules rendered at
 * `sizePx` square.
 *
 * `qr-code-styling`'s `margin` is in pixels while the spec states the quiet
 * zone in modules, and module size itself depends on the margin. Solving
 * `margin >= QUIET_ZONE_MODULES * (sizePx - 2 * margin) / moduleCount` gives
 * the closed form below.
 */
export function quietZoneMarginPx(sizePx: number, moduleCount: number): number {
  if (moduleCount <= 0) return 0;

  return Math.ceil(
    (QUIET_ZONE_MODULES * sizePx) / (moduleCount + 2 * QUIET_ZONE_MODULES)
  );
}
