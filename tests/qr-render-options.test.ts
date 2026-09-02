import { describe, expect, it } from "vitest";

import {
  ECC_RECOVERY_CAPACITY,
  MAX_LOGO_AREA_FRACTION,
  maxLogoAreaFractionForModules,
  QUIET_ZONE_MODULES,
} from "@/lib/qr/branding-rules";
import { buildBrandedQrOptions } from "@/lib/qr/render";

const TABLE_URL =
  "https://joes-coffee.dexapos.com/t/eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnop.qrstuvwxyz0123456789";
const LOGO_URL =
  "https://dexa-pos-uploads.b-cdn.net/merchants/2add44cb/logos/store-logo.png";

describe("buildBrandedQrOptions", () => {
  /**
   * `saveAsBlob` is what makes branded export work at all, and losing it fails
   * silently rather than loudly. The library inlines the fetched logo as a
   * data: URI; the canvas path rasterises that SVG through an <img>, which is
   * forbidden from loading external resources. With it off, the SVG keeps a
   * remote href and the PNG/PDF come out with no logo and no error — the
   * silently-unbranded print the ticket exists to prevent.
   */
  it("inlines the logo rather than referencing it remotely", () => {
    const { styling } = buildBrandedQrOptions({
      value: TABLE_URL,
      logoUrl: LOGO_URL,
    });

    expect(styling.imageOptions?.saveAsBlob).toBe(true);
  });

  it("requests the logo with crossOrigin anonymous", () => {
    const { styling } = buildBrandedQrOptions({
      value: TABLE_URL,
      logoUrl: LOGO_URL,
    });

    expect(styling.imageOptions?.crossOrigin).toBe("anonymous");
  });

  it("passes the logo through to the renderer", () => {
    const { styling } = buildBrandedQrOptions({
      value: TABLE_URL,
      logoUrl: LOGO_URL,
    });

    expect(styling.image).toBe(LOGO_URL);
    expect(styling.qrOptions?.errorCorrectionLevel).toBe("H");
  });

  // AC: "Merchant with no logo_url gets a clean unbranded QR, no error state."
  it("omits the image entirely when the merchant has no logo", () => {
    const { styling } = buildBrandedQrOptions({
      value: TABLE_URL,
      logoUrl: null,
    });

    expect(styling.image).toBeUndefined();
    expect(styling.qrOptions?.errorCorrectionLevel).toBe("Q");
  });

  // AC: "Logo occupies <=25% of QR area."
  it("keeps the logo within the area cap once converted to library units", () => {
    const { styling } = buildBrandedQrOptions({
      value: TABLE_URL,
      logoUrl: LOGO_URL,
    });

    const imageSize = styling.imageOptions?.imageSize ?? 0;
    expect(imageSize * ECC_RECOVERY_CAPACITY.H).toBeLessThanOrEqual(
      MAX_LOGO_AREA_FRACTION + 1e-9
    );
    // Guard against a well-meaning "fix" that sets imageSize to the cap
    // directly and quietly shrinks every logo to 7.5% of the code.
    expect(imageSize).toBeGreaterThan(MAX_LOGO_AREA_FRACTION);
  });

  // AC: "quiet zone >= 4 modules."
  it("sizes the margin to a real four-module quiet zone", () => {
    const sizePx = 1400;
    const { styling } = buildBrandedQrOptions({
      value: TABLE_URL,
      logoUrl: LOGO_URL,
      sizePx,
    });

    const margin = styling.margin ?? 0;
    // Derived the same way the library does: the drawable area divided by the
    // module count this payload needs at level H.
    const moduleCount = 53;
    const moduleSize = (sizePx - 2 * margin) / moduleCount;

    expect(margin / moduleSize).toBeGreaterThanOrEqual(QUIET_ZONE_MODULES);
  });

  it("applies merchant colours to the modules and the background", () => {
    const { styling } = buildBrandedQrOptions({
      value: TABLE_URL,
      moduleColor: "#0C4FD1",
      backgroundColor: "#FFFFFF",
    });

    expect(styling.dotsOptions?.color).toBe("#0C4FD1");
    expect(styling.backgroundOptions?.color).toBe("#FFFFFF");
    expect(styling.dotsOptions?.gradient).toBeUndefined();
  });

  it("builds a two-stop gradient only when the second colour is safe", () => {
    const safe = buildBrandedQrOptions({
      value: TABLE_URL,
      moduleColor: "#0C4FD1",
      backgroundColor: "#FFFFFF",
      secondaryColor: "#111827",
    });

    expect(safe.styling.dotsOptions?.gradient?.colorStops).toEqual([
      { offset: 0, color: "#0C4FD1" },
      { offset: 1, color: "#111827" },
    ]);

    const unsafe = buildBrandedQrOptions({
      value: TABLE_URL,
      moduleColor: "#0C4FD1",
      backgroundColor: "#FFFFFF",
      secondaryColor: "#FAF3B0",
    });

    expect(unsafe.styling.dotsOptions?.gradient).toBeUndefined();
    expect(unsafe.branding.warnings).toHaveLength(1);
  });

  it("reports the fallback rather than silently rendering an unbranded code", () => {
    const { styling, branding } = buildBrandedQrOptions({
      value: TABLE_URL,
      moduleColor: "#FAF3B0",
      backgroundColor: "#FFFFFF",
    });

    expect(styling.dotsOptions?.color).toBe("#111827");
    expect(branding.warnings).not.toHaveLength(0);
  });
});

/**
 * A flat logo cap is not safe across QR versions.
 *
 * Measured on real output: a table code (~184-char signed-token URL, version
 * 14) decoded with a 25%-area logo; the first marketing code (~59-char
 * short-code URL, version 6) did not decode at any scale with the same
 * setting. Error correction is applied per interleaved block, and a low
 * version has few blocks, so one solid centre square can exhaust a whole
 * block's budget.
 */
describe("logo area is capped by code size, not a flat percentage", () => {
  it("gives a low-version code a smaller logo than a high-version one", () => {
    // A marketing URL and a table URL, at the lengths they actually have.
    const marketing = "https://joes-coffee.dexapos.com/m/GP30G0B9KV";
    const table = `https://joes-coffee.dexapos.com/t/${"a".repeat(150)}`;

    const small = buildBrandedQrOptions({ value: marketing, logoUrl: LOGO_URL });
    const large = buildBrandedQrOptions({ value: table, logoUrl: LOGO_URL });

    expect(small.styling.imageOptions?.imageSize).toBeLessThan(
      large.styling.imageOptions?.imageSize as number
    );
  });

  it("never exceeds the ticket's 25% ceiling at any size", () => {
    for (const modules of [21, 41, 45, 65, 73, 177]) {
      expect(maxLogoAreaFractionForModules(modules)).toBeLessThanOrEqual(
        MAX_LOGO_AREA_FRACTION
      );
    }
  });

  it("stays under the measured failure point for a version 6 code", () => {
    // 41 modules failed to decode at 20% and survived at 16%.
    expect(maxLogoAreaFractionForModules(41)).toBeLessThan(0.2);
  });

  it("stays under the measured failure point for a version 14 code", () => {
    // 73 modules failed at 25% and survived at 20%.
    expect(maxLogoAreaFractionForModules(73)).toBeLessThan(0.25);
  });

  it("falls back to the most conservative cap for a nonsense module count", () => {
    expect(maxLogoAreaFractionForModules(0)).toBe(0.14);
    expect(maxLogoAreaFractionForModules(Number.NaN)).toBe(0.14);
  });
});
