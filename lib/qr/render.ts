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
  maxLogoAreaFractionForModules,
  quietZoneMarginPx,
  resolveQrBranding,
  type ResolveQrBrandingInput,
  type ResolvedQrBranding,
} from "./branding-rules";
import { prepareLogoForQr } from "./logo-plate";

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

  // The cap depends on how big this particular code is, not just on the
  // ticket's flat 25%. A short marketing URL produces a low-version code whose
  // error correction cannot survive a 25% centre logo — measured, see
  // `maxLogoAreaFractionForModules`. `moduleCount` above is already the grid
  // this payload will actually use.
  const imageSize = areaFractionToImageSize(
    maxLogoAreaFractionForModules(moduleCount),
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

/**
 * Build one renderer instance, with the logo plated first.
 *
 * The library clears a rectangle for the logo but paints nothing into it, and
 * sizes that rectangle from the image file rather than from the ink inside it
 * — so a transparent logo comes out as a bare hole. `prepareLogoForQr` hands
 * back an image that already carries its own opaque background, which is the
 * shape the library has always rendered correctly. See `logo-plate.ts`.
 */
async function createStyledQr(options: BrandedQrOptions) {
  const { styling, branding } = buildBrandedQrOptions(options);
  const QRCodeStyling = await loadQrCodeStyling();

  if (!branding.logoUrl) {
    return { instance: new QRCodeStyling(styling), branding };
  }

  const prepared = await prepareLogoForQr({
    logoUrl: branding.logoUrl,
    // The plate takes the QR's own background colour so it merges with the
    // modules the library clears around it, rather than reading as a card
    // pasted over the code.
    plateColor: branding.backgroundColor,
    // Unless that would hide the logo, in which case a badge in the merchant's
    // own module colour beats an empty square.
    fallbackPlateColor: branding.moduleColor,
  });

  const warnings = [...branding.warnings];

  if (prepared.usedFallbackPlate) warnings.push(LOGO_BADGED_NOTICE);

  if (prepared.outcome === "blank" || prepared.outcome === "unavailable") {
    warnings.push(
      prepared.outcome === "blank"
        ? LOGO_BLANK_WARNING
        : LOGO_UNAVAILABLE_WARNING
    );

    return {
      instance: new QRCodeStyling({ ...styling, image: undefined }),
      // Reporting no logo here also leaves the deadline below unarmed, which
      // is correct: there is no image left that could hang.
      branding: { ...branding, logoUrl: null, warnings },
    };
  }

  return {
    instance: new QRCodeStyling(
      prepared.dataUrl
        ? {
            ...styling,
            image: prepared.dataUrl,
            imageOptions: {
              ...styling.imageOptions,
              // A shaped plate covers exactly what it needs to. Blanking a
              // rectangle of modules on top of it is what made a transparent
              // logo look like it was sitting on a panel, and it occludes more
              // of the code than the outline does.
              hideBackgroundDots: !prepared.shapedPlate,
            },
          }
        : styling
    ),
    branding: { ...branding, warnings },
  };
}

type StyledQrInstance = Awaited<ReturnType<typeof createStyledQr>>["instance"];

/**
 * How long the logo gets to load before the code is rendered without it.
 *
 * `qr-code-styling` installs no error handler anywhere on its browser path.
 * Verified against the bundled source: zero occurrences of `onerror`,
 * `onabort` or `ontimeout`. It is `img.onload = …; img.src = url`, and the XHR
 * that inlines the logo likewise sets only `onload`. (The Node/`nodeCanvas`
 * branch does have a `.catch`; the browser branch, the one we use, does not.)
 *
 * So a `logo_url` that 404s, has been deleted from the bucket, or is served by
 * a host that fails CORS does not reject — it never settles. That is not an
 * exception a `.catch` can see, it is a hang: the preview spins forever and
 * every export awaits with no toast, no error and no completion. The ticket
 * forbids an error state for a missing logo; no state at all is worse.
 *
 * Six seconds clears a cold CDN fetch with room to spare and still returns
 * inside a merchant's patience.
 */
export const LOGO_LOAD_TIMEOUT_MS = 6_000;

const LOGO_UNAVAILABLE_WARNING =
  "The logo could not be loaded, so this code was rendered without it. Check the logo in Online Store settings.";

const LOGO_BLANK_WARNING =
  "This store's logo image is empty, so the code was rendered without it. Upload a logo with visible artwork in Online Store settings.";

/**
 * A pale logo was rescued by painting its plate in the module colour.
 *
 * Not a failure — the code looks better for it — but the merchant is getting a
 * coloured badge they did not ask for, and finding out from their own printed
 * table tents would be worse than being told here.
 */
const LOGO_BADGED_NOTICE =
  "This store's logo is too pale to sit on the QR background, so it was placed on a badge in the QR colour to keep it visible.";

const TIMED_OUT = Symbol("qr-logo-timeout");

/**
 * Run one render, and if a logo is in play, hold it to a deadline.
 *
 * On expiry the code is re-rendered with no logo and the drop is reported
 * through the same `warnings` channel every other fallback uses — the
 * degrade-and-say-so path already exists, this failure mode simply never
 * reached it.
 */
async function renderWithLogoDeadline<T>(
  options: BrandedQrOptions,
  extract: (instance: StyledQrInstance) => Promise<T | null>,
  formatLabel: string
): Promise<BrandedQrResult<T>> {
  const { instance, branding } = await createStyledQr(options);

  // Without a logo there is nothing that can hang, so don't arm a timer that
  // could only ever fire spuriously on a slow machine.
  if (!branding.logoUrl) {
    return {
      data: await required(extract(instance), formatLabel),
      warnings: branding.warnings,
      branding,
    };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), LOGO_LOAD_TIMEOUT_MS);
  });

  let raced: T | null | typeof TIMED_OUT;
  try {
    raced = await Promise.race([extract(instance), deadline]);
  } finally {
    clearTimeout(timer);
  }

  if (raced !== TIMED_OUT) {
    return {
      data: await required(Promise.resolve(raced), formatLabel),
      warnings: branding.warnings,
      branding,
    };
  }

  // The original render is abandoned, not cancelled — the library gives us no
  // handle to cancel with. It resolves into nothing if the image ever arrives.
  const fallback = await createStyledQr({ ...options, logoUrl: null });

  return {
    data: await required(extract(fallback.instance), formatLabel),
    warnings: [...fallback.branding.warnings, LOGO_UNAVAILABLE_WARNING],
    branding: fallback.branding,
  };
}

async function required<T>(
  work: Promise<T | null>,
  formatLabel: string
): Promise<T> {
  const data = await work;

  if (!data) {
    throw new Error(`Failed to render the QR code as ${formatLabel}.`);
  }

  return data;
}

/** Branded QR as an SVG string. The logo is inlined, so the file stands alone. */
export async function renderBrandedQrSvg(
  options: BrandedQrOptions
): Promise<BrandedQrResult<string>> {
  const { data, warnings, branding } = await renderWithLogoDeadline(
    options,
    async (instance) => {
      const blob = await instance.getRawData("svg");
      return blob ? await blobToText(blob as Blob) : null;
    },
    "SVG"
  );

  return { data, warnings, branding };
}

/** Branded QR as a PNG blob. */
export async function renderBrandedQrPngBlob(
  options: BrandedQrOptions
): Promise<BrandedQrResult<Blob>> {
  return renderWithLogoDeadline(
    options,
    async (instance) => (await instance.getRawData("png")) as Blob | null,
    "PNG"
  );
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
