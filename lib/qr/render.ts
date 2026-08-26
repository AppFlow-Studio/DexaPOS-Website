/**
 * Branded QR rendering.
 *
 * Browser-only: `qr-code-styling` draws through the DOM and Canvas, so every
 * entry point here must be reached from a client component (and the module
 * itself is imported lazily so it never lands in a server bundle).
 *
 * The single shared renderer exists so the dashboard preview, the SVG export,
 * the PNG export and the PDF table tent cannot drift apart. The ticket's
 * acceptance criteria call out exactly that failure — branded on screen,
 * unbranded on paper.
 */

import QRCode from "qrcode";
import type { Options as QrCodeStylingOptions } from "qr-code-styling";

import {
  areaFractionToImageSize,
  MAX_LOGO_AREA_FRACTION,
  quietZoneMarginPx,
  resolveQrBranding,
  type ResolveQrBrandingInput,
  type ResolvedQrBranding,
} from "./branding-rules";

export const DEFAULT_QR_PIXEL_SIZE = 1200;

export interface BrandedQrOptions extends ResolveQrBrandingInput {
  /** The URL the QR code encodes. */
  value: string;
  /** Rendered square size in pixels. Ignored by the SVG path's viewBox. */
  sizePx?: number;
}

export interface BrandedQrResult<T> {
  data: T;
  /**
   * Branding that was dropped for scannability. Callers MUST surface these —
   * see `resolveQrBranding`.
   */
  warnings: string[];
  branding: ResolvedQrBranding;
}

/**
 * `qr-code-styling` is a CJS, DOM-dependent bundle with no ESM entry, so it
 * cannot be statically imported into a module that Next may evaluate on the
 * server. Loading it on first use also keeps it out of the initial chunk for
 * the many dashboard pages that never render a QR code.
 */
async function loadQrCodeStyling() {
  const styling = await import("qr-code-styling");
  return styling.default;
}

/**
 * Resolve branding and translate it into `qr-code-styling`'s option shape.
 *
 * Exported so the option translation can be asserted without a DOM — notably
 * that `crossOrigin` survives, since losing it breaks every raster export at
 * runtime and nowhere else.
 */
export function buildBrandedQrOptions(options: BrandedQrOptions): {
  styling: QrCodeStylingOptions;
  branding: ResolvedQrBranding;
} {
  const branding = resolveQrBranding(options);

  return { styling: buildStylingOptions(options, branding), branding };
}

function buildStylingOptions(
  options: BrandedQrOptions,
  branding: ResolvedQrBranding
): QrCodeStylingOptions {
  const sizePx = options.sizePx ?? DEFAULT_QR_PIXEL_SIZE;

  // The quiet zone is specified in modules but the library takes pixels, and
  // module size depends on how many modules this particular payload needs.
  // `qrcode` and `qr-code-styling` both auto-select the smallest version that
  // fits, so asking `qrcode` for the module count gives the same grid the
  // renderer will produce.
  const moduleCount = QRCode.create(options.value, {
    errorCorrectionLevel: branding.errorCorrectionLevel,
  }).modules.size;

  const imageSize = areaFractionToImageSize(
    MAX_LOGO_AREA_FRACTION,
    branding.errorCorrectionLevel
  );

  return {
    width: sizePx,
    height: sizePx,
    type: "svg",
    data: options.value,
    image: branding.logoUrl ?? undefined,
    margin: quietZoneMarginPx(sizePx, moduleCount),
    qrOptions: {
      errorCorrectionLevel: branding.errorCorrectionLevel,
    },
    imageOptions: {
      // Load-bearing, and it fails *silently* — which is the dangerous kind.
      // The library fetches the logo over XHR and inlines it as a data: URI.
      // The canvas path then rasterises that SVG through an <img>, and an
      // <img>-loaded SVG is forbidden from fetching external resources. So
      // with saveAsBlob off, the downloaded SVG carries a remote href and the
      // PNG/PDF simply come out *without the logo* — no error, no warning,
      // exactly the unbranded print the ticket forbids. Measured: the same
      // code renders 119KB with it on and 30KB with it off.
      // It is the library default; pinned so a future default cannot flip it.
      saveAsBlob: true,
      // The XHR above is itself subject to CORS, so branded rendering depends
      // on the logo host sending `Access-Control-Allow-Origin: *` — verified
      // for both Bunny and the legacy Supabase Storage bucket. This attribute
      // covers the direct-draw path the library falls back to.
      crossOrigin: "anonymous",
      // Converted from the ticket's area cap; NOT a raw percentage. See
      // `areaFractionToImageSize`.
      imageSize,
      hideBackgroundDots: true,
      margin: 0,
    },
    dotsOptions: branding.secondaryColor
      ? {
          type: "square",
          gradient: {
            type: "linear",
            rotation: Math.PI / 4,
            colorStops: [
              { offset: 0, color: branding.moduleColor },
              { offset: 1, color: branding.secondaryColor },
            ],
          },
        }
      : {
          type: "square",
          color: branding.moduleColor,
        },
    backgroundOptions: {
      color: branding.backgroundColor,
    },
  };
}

async function createStyledQr(options: BrandedQrOptions) {
  const { styling, branding } = buildBrandedQrOptions(options);
  const QRCodeStyling = await loadQrCodeStyling();

  return { instance: new QRCodeStyling(styling), branding };
}

/** Branded QR as an SVG string. The logo is inlined, so the file stands alone. */
export async function renderBrandedQrSvg(
  options: BrandedQrOptions
): Promise<BrandedQrResult<string>> {
  const { instance, branding } = await createStyledQr(options);
  const blob = await instance.getRawData("svg");

  if (!blob) {
    throw new Error("Failed to render the QR code as SVG.");
  }

  return {
    data: await blobToText(blob as Blob),
    warnings: branding.warnings,
    branding,
  };
}

/** Branded QR as a PNG blob. */
export async function renderBrandedQrPngBlob(
  options: BrandedQrOptions
): Promise<BrandedQrResult<Blob>> {
  const { instance, branding } = await createStyledQr(options);
  const blob = await instance.getRawData("png");

  if (!blob) {
    throw new Error("Failed to render the QR code as PNG.");
  }

  return { data: blob as Blob, warnings: branding.warnings, branding };
}

/** Branded QR as a PNG data URL — the shape `jsPDF.addImage` accepts. */
export async function renderBrandedQrPngDataUrl(
  options: BrandedQrOptions
): Promise<BrandedQrResult<string>> {
  const { data, warnings, branding } = await renderBrandedQrPngBlob(options);

  return { data: await blobToDataUrl(data), warnings, branding };
}

function blobToText(blob: Blob): Promise<string> {
  return blob.text();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("Failed to read the rendered QR code."));
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
