import { describe, expect, it } from "vitest";

import {
  areaFractionToImageSize,
  contrastRatio,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_MODULE_COLOR,
  ECC_RECOVERY_CAPACITY,
  isInverted,
  MAX_LOGO_AREA_FRACTION,
  MIN_CONTRAST_RATIO,
  parseHexColor,
  QUIET_ZONE_MODULES,
  quietZoneMarginPx,
  relativeLuminance,
  resolveQrBranding,
  validateQrBrandingColors,
} from "@/lib/qr/branding-rules";

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };
const DEXA_BLUE = "#0C4FD1";
const PALE_YELLOW = "#FAF3B0";

describe("parseHexColor", () => {
  it("accepts long form, short form, and a missing hash", () => {
    expect(parseHexColor("#0C4FD1")).toEqual({ r: 12, g: 79, b: 209 });
    expect(parseHexColor("0C4FD1")).toEqual({ r: 12, g: 79, b: 209 });
    expect(parseHexColor("#fff")).toEqual(WHITE);
  });

  it("rejects anything that is not a hex colour", () => {
    expect(parseHexColor("rgb(0,0,0)")).toBeNull();
    expect(parseHexColor("#12345")).toBeNull();
    expect(parseHexColor("#GGGGGG")).toBeNull();
    expect(parseHexColor("")).toBeNull();
    expect(parseHexColor(null)).toBeNull();
  });
});

describe("contrast", () => {
  it("puts black on white at the maximum 21:1", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
  });

  it("is order-independent", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(contrastRatio(WHITE, BLACK), 10);
  });

  it("ranks white as the most luminous colour", () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 5);
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 5);
  });
});

describe("inversion", () => {
  it("flags light modules on a dark background", () => {
    expect(isInverted(WHITE, BLACK)).toBe(true);
  });

  it("accepts dark modules on a light background", () => {
    expect(isInverted(BLACK, WHITE)).toBe(false);
  });
});

describe("validateQrBrandingColors — the reject-at-input path", () => {
  it("accepts the Dexa brand blue on white", () => {
    expect(
      validateQrBrandingColors({
        moduleColor: DEXA_BLUE,
        backgroundColor: "#FFFFFF",
      })
    ).toEqual([]);
  });

  // AC: "Light-module-on-dark inversions are rejected at input with a visible
  // reason, not silently rendered."
  it("rejects an inversion with a reason the merchant can act on", () => {
    const issues = validateQrBrandingColors({
      moduleColor: "#FFFFFF",
      backgroundColor: "#111827",
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("inverted");
    expect(issues[0].scope).toBe("primary");
    expect(issues[0].message).toMatch(/lighter than the background/i);
  });

  // AC: "Insufficient contrast between module colour and background is
  // rejected with a visible reason." The ticket's worked example is a merchant
  // whose brand colour is pale yellow.
  it("rejects pale yellow on white and quotes the ratio", () => {
    const issues = validateQrBrandingColors({
      moduleColor: PALE_YELLOW,
      backgroundColor: "#FFFFFF",
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("low_contrast");
    expect(issues[0].message).toContain(`minimum ${MIN_CONTRAST_RATIO}:1`);
  });

  it("reports every problem at once rather than only the first", () => {
    const issues = validateQrBrandingColors({
      moduleColor: "not-a-colour",
      backgroundColor: "also-not-a-colour",
    });

    expect(issues.map((issue) => issue.code).sort()).toEqual([
      "invalid_background_color",
      "invalid_module_color",
    ]);
  });

  it("holds a gradient's second stop to the same standard", () => {
    const issues = validateQrBrandingColors({
      moduleColor: DEXA_BLUE,
      backgroundColor: "#FFFFFF",
      secondaryColor: PALE_YELLOW,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].scope).toBe("secondary");
    expect(issues[0].code).toBe("low_contrast");
  });
});

describe("resolveQrBranding — the render-time path", () => {
  // AC: "Merchant with no logo_url gets a clean unbranded QR, no error state."
  it("renders a clean code with no logo and no warnings", () => {
    const resolved = resolveQrBranding({
      logoUrl: null,
      moduleColor: DEXA_BLUE,
      backgroundColor: "#FFFFFF",
    });

    expect(resolved.logoUrl).toBeNull();
    expect(resolved.warnings).toEqual([]);
    expect(resolved.moduleColor).toBe(DEXA_BLUE);
  });

  // AC: "error correction fixed at level H" whenever a logo is overlaid.
  it("forces level H when a logo is present and keeps Q when it is not", () => {
    expect(
      resolveQrBranding({ logoUrl: "https://cdn.example/logo.png" })
        .errorCorrectionLevel
    ).toBe("H");
    expect(resolveQrBranding({ logoUrl: null }).errorCorrectionLevel).toBe("Q");
  });

  it("falls back to safe colours for a stored value that cannot scan, and says so", () => {
    const resolved = resolveQrBranding({
      moduleColor: PALE_YELLOW,
      backgroundColor: "#FFFFFF",
    });

    expect(resolved.moduleColor).toBe(DEFAULT_MODULE_COLOR);
    expect(resolved.backgroundColor).toBe(DEFAULT_BACKGROUND_COLOR);
    // The fallback must never be silent — the ticket forbids it explicitly.
    expect(resolved.warnings).toHaveLength(1);
    expect(resolved.warnings[0]).toMatch(/default black on white/i);
  });

  it("drops only the gradient when just the second stop is unsafe", () => {
    const resolved = resolveQrBranding({
      moduleColor: DEXA_BLUE,
      backgroundColor: "#FFFFFF",
      secondaryColor: PALE_YELLOW,
    });

    expect(resolved.moduleColor).toBe(DEXA_BLUE);
    expect(resolved.secondaryColor).toBeNull();
    expect(resolved.warnings).toHaveLength(1);
    expect(resolved.warnings[0]).toMatch(/second brand colour/i);
  });

  it("keeps a gradient whose stops both pass", () => {
    const resolved = resolveQrBranding({
      moduleColor: DEXA_BLUE,
      backgroundColor: "#FFFFFF",
      secondaryColor: "#111827",
    });

    expect(resolved.secondaryColor).toBe("#111827");
    expect(resolved.warnings).toEqual([]);
  });

  it("drops the gradient when the primary pair already failed", () => {
    const resolved = resolveQrBranding({
      moduleColor: PALE_YELLOW,
      backgroundColor: "#FFFFFF",
      secondaryColor: "#111827",
    });

    expect(resolved.secondaryColor).toBeNull();
    expect(resolved.warnings).toHaveLength(2);
  });
});

describe("areaFractionToImageSize — the unit trap", () => {
  // The library multiplies imageSize by the ECC recovery capacity, so
  // imageSize is a fraction of the correction budget, NOT of the QR's area.
  it("converts the 25% area cap into the library's units", () => {
    const imageSize = areaFractionToImageSize(MAX_LOGO_AREA_FRACTION, "H");

    expect(imageSize).toBeCloseTo(0.25 / 0.3, 10);
    // Round-trips back to the area the ticket actually caps.
    expect(imageSize * ECC_RECOVERY_CAPACITY.H).toBeCloseTo(
      MAX_LOGO_AREA_FRACTION,
      10
    );
  });

  it("is not the identity — passing 0.25 straight through would be wrong", () => {
    expect(areaFractionToImageSize(0.25, "H")).not.toBeCloseTo(0.25, 3);
  });

  it("clamps a caller asking for more than the cap", () => {
    const imageSize = areaFractionToImageSize(0.9, "H");

    expect(imageSize * ECC_RECOVERY_CAPACITY.H).toBeCloseTo(
      MAX_LOGO_AREA_FRACTION,
      10
    );
  });

  it("never exceeds 1, which would hide more than error correction can rebuild", () => {
    for (const ecc of ["L", "M", "Q", "H"] as const) {
      expect(areaFractionToImageSize(1, ecc)).toBeLessThanOrEqual(1);
    }
  });
});

describe("quietZoneMarginPx", () => {
  // AC: "quiet zone >= 4 modules". The library takes pixels, and module size
  // itself depends on the margin, so this is the closed-form solution.
  it("yields a margin worth at least four modules", () => {
    for (const moduleCount of [21, 33, 49, 53, 77, 177]) {
      for (const sizePx of [180, 352, 1200, 1400]) {
        const margin = quietZoneMarginPx(sizePx, moduleCount);
        const moduleSize = (sizePx - 2 * margin) / moduleCount;

        expect(margin / moduleSize).toBeGreaterThanOrEqual(QUIET_ZONE_MODULES);
      }
    }
  });

  it("is a real improvement on the margin:2 the PDF path used to hardcode", () => {
    // 1400px, 53 modules (a level-H table URL) previously got 2px of quiet
    // zone — roughly a tenth of one module.
    expect(quietZoneMarginPx(1400, 53)).toBeGreaterThan(2);
  });

  it("handles a degenerate module count without dividing by zero", () => {
    expect(quietZoneMarginPx(1200, 0)).toBe(0);
  });
});
