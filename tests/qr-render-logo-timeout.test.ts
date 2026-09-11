/**
 * The broken-logo hang.
 *
 * `qr-code-styling` installs no error handler on its browser path — no
 * `onerror` on the <img>, none on the XHR that inlines the logo. A logo URL
 * that 404s, has been deleted from the bucket, or fails CORS therefore never
 * settles the render promise. It does not reject, so no `.catch` can see it:
 * the preview spins forever and every export awaits with no toast and no
 * completion.
 *
 * These tests pin the deadline that turns that hang into the degrade-and-say-so
 * path the ticket asks for. The fake below models the real failure exactly: a
 * render with an image returns a promise that never settles.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeOptions {
  image?: string;
  [key: string]: unknown;
}

const constructed: FakeOptions[] = [];

vi.mock("qr-code-styling", () => {
  class FakeQrCodeStyling {
    private readonly options: FakeOptions;

    constructor(options: FakeOptions) {
      this.options = options;
      constructed.push(options);
    }

    getRawData(type: string): Promise<Blob | null> {
      // The whole point: with an image set, this never settles.
      if (this.options.image) {
        return new Promise<Blob | null>(() => {});
      }

      return Promise.resolve(
        new Blob([`<svg data-format="${type}" />`], { type: "image/svg+xml" })
      );
    }
  }

  return { default: FakeQrCodeStyling };
});

const { LOGO_LOAD_TIMEOUT_MS, renderBrandedQrSvg } = await import(
  "@/lib/qr/render"
);

const TABLE_URL = "https://joes-coffee.dexapos.com/t/abcdef.0123456789";
const BROKEN_LOGO = "https://dexa-pos-uploads.b-cdn.net/deleted/logo.png";

describe("a logo that never loads", () => {
  beforeEach(() => {
    constructed.length = 0;
    vi.useFakeTimers();
  });

  it("falls back to an unbranded code instead of hanging forever", async () => {
    const pending = renderBrandedQrSvg({
      value: TABLE_URL,
      logoUrl: BROKEN_LOGO,
      moduleColor: "#6B3E2E",
      backgroundColor: "#F5EBDD",
    });

    await vi.advanceTimersByTimeAsync(LOGO_LOAD_TIMEOUT_MS);

    const result = await pending;

    expect(result.data).toContain("<svg");
    expect(result.branding.logoUrl).toBeNull();
  });

  it("says the logo was dropped rather than degrading silently", async () => {
    const pending = renderBrandedQrSvg({
      value: TABLE_URL,
      logoUrl: BROKEN_LOGO,
    });

    await vi.advanceTimersByTimeAsync(LOGO_LOAD_TIMEOUT_MS);
    const { warnings } = await pending;

    expect(warnings.some((w) => /logo could not be loaded/i.test(w))).toBe(true);
  });

  /**
   * The retry must actually drop the image. Re-rendering with the same options
   * would hang a second time — and the merchant's colours must survive, since
   * only the logo failed.
   */
  it("retries without the image but keeps the merchant's colours", async () => {
    const pending = renderBrandedQrSvg({
      value: TABLE_URL,
      logoUrl: BROKEN_LOGO,
      moduleColor: "#6B3E2E",
      backgroundColor: "#F5EBDD",
    });

    await vi.advanceTimersByTimeAsync(LOGO_LOAD_TIMEOUT_MS);
    const result = await pending;

    expect(constructed).toHaveLength(2);
    expect(constructed[0].image).toBe(BROKEN_LOGO);
    expect(constructed[1].image).toBeUndefined();
    expect(result.branding.moduleColor).toBe("#6B3E2E");
    expect(result.branding.backgroundColor).toBe("#F5EBDD");
  });

  /**
   * Dropping the logo means the code no longer has an occluded centre, so the
   * error correction that was raised to carry the logo should come back down.
   */
  it("returns error correction to Q once the logo is gone", async () => {
    const pending = renderBrandedQrSvg({
      value: TABLE_URL,
      logoUrl: BROKEN_LOGO,
    });

    await vi.advanceTimersByTimeAsync(LOGO_LOAD_TIMEOUT_MS);
    const { branding } = await pending;

    expect(branding.errorCorrectionLevel).toBe("Q");
  });
});

describe("a merchant with no logo at all", () => {
  beforeEach(() => {
    constructed.length = 0;
    vi.useFakeTimers();
  });

  /**
   * Nothing can hang without an image, so the deadline must not be armed —
   * otherwise a slow machine could time out a render that was going to succeed
   * and report a dropped logo that never existed.
   */
  it("resolves without waiting on the deadline and warns about nothing", async () => {
    const result = await renderBrandedQrSvg({
      value: TABLE_URL,
      logoUrl: null,
    });

    expect(result.data).toContain("<svg");
    expect(result.warnings).toEqual([]);
    expect(constructed).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
