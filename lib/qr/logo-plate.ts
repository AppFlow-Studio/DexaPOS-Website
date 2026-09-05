/**
 * Giving a transparent logo an opaque plate.
 *
 * `qr-code-styling` does not draw anything behind the logo. Verified against
 * the bundled source: `drawBackground()` fills the canvas, then
 * `hideBackgroundDots` makes `drawDots` *skip* every module inside a centred
 * rectangle — it paints no plate, it just leaves a hole — and `drawImage()`
 * then stretches the logo across exactly that rectangle.
 *
 * The rectangle is sized from the image file's intrinsic width and height,
 * never from how much of the file is actually ink. So:
 *
 *   - A logo with its background baked in *is* the plate. The hole is filled
 *     edge to edge and reads as a deliberate badge. This is the case that has
 *     always looked right, and nothing here should change it.
 *   - A transparent logo has no plate. Light artwork (very common — logos get
 *     exported white for dark headers) disappears into the background colour,
 *     leaving a blank square. And transparent export padding is measured as if
 *     it were ink, so a small mark floats in an oversized hole.
 *
 * Both read to a merchant as "there is a box in my QR code".
 *
 * The fix is to hand the renderer an image that already has the plate: trim
 * the dead padding down to the real ink, then redraw that ink centred on an
 * opaque rectangle in the QR's own background colour. The hole and the plate
 * become one continuous field, which is precisely what an opaque logo gives
 * today.
 *
 * **This does not change how much of the code is occluded.** The rectangle is
 * cleared in full either way; trimming only lets the visible mark use the
 * space that was already being spent on padding. The printed-scan matrix in
 * the ticket does not need re-measuring for this change.
 *
 * The plate keeps the *trimmed ink's* aspect ratio rather than being forced
 * square, so a wide mark still produces a wide hole — squaring it would strand
 * a wide logo in a tall box, which is the same bug in a different costume.
 *
 * Everything above `prepareLogoForQr` is pure and synchronous so it can be
 * tested without a DOM, matching the split in `branding-rules.ts`.
 */

import { contrastRatio, parseHexColor, type Rgb } from "./branding-rules";

/**
 * Alpha at or below this counts as "not ink".
 *
 * Not zero: anti-aliased edges and lossy re-encodes leave a haze of alpha 1-5
 * across nominally empty pixels, and a zero threshold would measure that haze
 * as content and trim nothing at all.
 */
export const INK_ALPHA_THRESHOLD = 8;

/**
 * Alpha below this counts as "this image has transparency".
 *
 * Deliberately near-opaque rather than a midpoint: the question being asked is
 * "does this file carry a background of its own", and a single soft edge pixel
 * is enough to mean no.
 */
export const TRANSPARENCY_ALPHA_THRESHOLD = 250;

/**
 * Breathing room around the trimmed ink, as a fraction of its longest edge.
 *
 * Doubles as the silhouette dilation radius, so the halo around the artwork is
 * the same width as the margin a rectangular plate would have had.
 */
export const PLATE_MARGIN_FRACTION = 0.08;

/**
 * Stamps per ring when dilating the logo's alpha mask into a silhouette.
 *
 * Dilation is done by stamping the mask around a ring rather than by blurring
 * and thresholding. Blur was the first attempt and is wrong here: a Gaussian
 * wide enough to dilate by the margin flattens a thin letter stroke below any
 * usable threshold, so text logos lose their halo exactly where they need it
 * most. Stamping is indifferent to how thin the feature is.
 *
 * 48 stamps keep arc spacing under a couple of pixels at realistic radii, and
 * a half-radius inner ring fills the band behind thin strokes.
 */
export const SILHOUETTE_STAMPS = 48;

/**
 * Alpha ramp applied to the dilated mask.
 *
 * Any real coverage becomes fully opaque — the plate must not be translucent
 * over the modules — but the two-step ramp leaves a soft pixel at the edge so
 * the outline does not stair-step around curves.
 */
export const SILHOUETTE_RAMP_LOW = 8;
export const SILHOUETTE_RAMP_HIGH = 40;

/**
 * Longest edge of the working canvas.
 *
 * The logo is drawn at roughly 450px in a 1200px export, so 1024 is past the
 * point of visible gain while keeping one `getImageData` under 4MB.
 */
export const PLATE_ANALYSIS_MAX_EDGE = 1024;

/**
 * Contrast floor between the logo's ink and its plate.
 *
 * A *visibility* floor, not a scannability one — nothing about the logo's
 * colour affects decoding, since the modules underneath are cleared either
 * way. It exists to catch the case this module is about: white artwork on a
 * light plate, which measures around 1.0-1.2 and is invisible. Anything with
 * genuine separation clears it comfortably (mid grey on cream is about 3:1).
 *
 * Do not raise this towards `MIN_CONTRAST_RATIO`. That threshold is a print
 * legibility rule for the modules; applied to artwork it would reject plenty
 * of logos that look perfectly good.
 */
export const MIN_LOGO_PLATE_CONTRAST = 1.4;

/** An `ImageData`-shaped value. Declared structurally so tests need no DOM. */
export interface RgbaPixels {
  width: number;
  height: number;
  /** RGBA, four bytes per pixel, row-major. */
  data: Uint8ClampedArray | number[];
}

export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The tightest box containing every pixel with meaningful alpha.
 *
 * `null` when the image is entirely transparent — a blank file, which is a
 * real thing merchants upload and which must not become a plate-shaped blob
 * sitting in the middle of the code.
 */
export function alphaBoundingBox(
  pixels: RgbaPixels,
  threshold: number = INK_ALPHA_THRESHOLD
): PixelBox | null {
  const { width, height, data } = pixels;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4;

    for (let x = 0; x < width; x++) {
      if (data[rowStart + x * 4 + 3] <= threshold) continue;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return null;

  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Whether the file carries a background of its own.
 *
 * A fully opaque logo already plates itself, so it is passed through
 * untouched. Compositing it anyway would only add a margin ring it never had.
 */
export function hasTransparency(
  pixels: RgbaPixels,
  threshold: number = TRANSPARENCY_ALPHA_THRESHOLD
): boolean {
  const { data, width, height } = pixels;
  const end = width * height * 4;

  for (let i = 3; i < end; i += 4) {
    if (data[i] < threshold) return true;
  }

  return false;
}

/**
 * Average colour of the ink, weighted by alpha.
 *
 * Weighting matters: an unweighted mean over a mostly-empty box is dominated
 * by whatever RGB the encoder happened to leave in fully transparent pixels,
 * which is frequently black and would make a white logo look perfectly
 * visible.
 *
 * This is a mean, so it cannot describe a two-tone logo — half white and half
 * black averages to grey and passes. That is the correct outcome (it *is*
 * visible); the check only needs to catch artwork that is uniformly pale.
 */
export function meanInkColor(
  pixels: RgbaPixels,
  box: PixelBox,
  threshold: number = INK_ALPHA_THRESHOLD
): Rgb | null {
  const { width, data } = pixels;

  let totalAlpha = 0;
  let r = 0;
  let g = 0;
  let b = 0;

  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3];

      if (alpha <= threshold) continue;

      totalAlpha += alpha;
      r += data[offset] * alpha;
      g += data[offset + 1] * alpha;
      b += data[offset + 2] * alpha;
    }
  }

  if (totalAlpha === 0) return null;

  return {
    r: Math.round(r / totalAlpha),
    g: Math.round(g / totalAlpha),
    b: Math.round(b / totalAlpha),
  };
}

export interface PlatePlacement {
  plateWidth: number;
  plateHeight: number;
  drawX: number;
  drawY: number;
}

/**
 * Where the trimmed ink sits on its plate.
 *
 * The margin is a fraction of the *longest* edge and is applied equally on all
 * four sides, so a wide mark keeps its proportions instead of being padded out
 * into a square.
 */
export function platePlacement(
  box: PixelBox,
  marginFraction: number = PLATE_MARGIN_FRACTION
): PlatePlacement {
  const margin = Math.round(
    Math.max(box.width, box.height) * Math.max(marginFraction, 0)
  );

  return {
    plateWidth: box.width + margin * 2,
    plateHeight: box.height + margin * 2,
    drawX: margin,
    drawY: margin,
  };
}

/**
 * Map dilated-mask coverage onto plate opacity.
 *
 * Below `low` there is no plate; above `high` it is solid; between the two it
 * fades, which is what keeps a curved outline from stair-stepping.
 */
export function rampAlpha(value: number, low: number, high: number): number {
  if (value <= low) return 0;
  if (value >= high) return 255;

  return Math.round(((value - low) / (high - low)) * 255);
}

/** True when the ink would be effectively invisible against its plate. */
export function inkIsInvisibleOnPlate(
  ink: Rgb | null,
  plateColor: string
): boolean {
  const plate = parseHexColor(plateColor);

  if (!ink || !plate) return false;

  return contrastRatio(ink, plate) < MIN_LOGO_PLATE_CONTRAST;
}

export interface PlateColorChoice {
  color: string;
  /** The preferred colour would have hidden the logo, so the fallback won. */
  usedFallback: boolean;
}

/**
 * Which colour to paint the plate.
 *
 * Normally the QR's own background, so plate and cleared hole read as one
 * field. But pale artwork on a pale background is exactly the case that makes
 * a merchant think the feature is broken, and there the background is the
 * wrong choice: painting the plate in the module colour instead turns an
 * invisible logo into a deliberate badge, at no cost to scanning, since the
 * modules under the plate are cleared either way.
 *
 * The fallback is the module colour rather than a fixed dark tone because it
 * is already the merchant's own colour and already guaranteed to contrast with
 * the background — that is what `validateQrBrandingColors` enforces — so a
 * badge in it never looks foreign to the code around it.
 *
 * That guarantee also means there is no third case to handle. Contrast is
 * multiplicative along a chain, so ink hidden against both colours would imply
 * `contrast(background, module) < 1.4 * 1.4 = 1.96`, while `resolveQrBranding`
 * has already forced that pair to at least `MIN_CONTRAST_RATIO` (4.5) or
 * replaced it with the defaults. One of the two colours always shows the logo.
 */
export function choosePlateColor(
  ink: Rgb | null,
  preferred: string,
  fallback: string
): PlateColorChoice {
  if (!inkIsInvisibleOnPlate(ink, preferred)) {
    return { color: preferred, usedFallback: false };
  }

  if (!inkIsInvisibleOnPlate(ink, fallback)) {
    return { color: fallback, usedFallback: true };
  }

  // Unreachable for any validated colour pair, per the note above. Kept total
  // rather than throwing, because nothing about branding may break a render.
  return { color: preferred, usedFallback: false };
}

/**
 * What happened to the logo.
 *
 * - `unchanged`   — already opaque. Use the original URL.
 * - `plated`      — trimmed and composited. Use `dataUrl`.
 * - `blank`       — the file has no ink at all. Render with no logo.
 * - `unavailable` — the image failed to load. Render with no logo.
 * - `unreadable`  — it loaded but its pixels cannot be inspected. Use the
 *                   original URL and let the render deadline guard it.
 */
export type PreparedLogoOutcome =
  | "unchanged"
  | "plated"
  | "blank"
  | "unavailable"
  | "unreadable";

export interface PreparedLogo {
  outcome: PreparedLogoOutcome;
  /** Set only for `plated`. */
  dataUrl: string | null;
  /** The plate was painted in the module colour to keep the logo visible. */
  usedFallbackPlate: boolean;
  /**
   * The plate follows the artwork's outline rather than filling a rectangle.
   *
   * The caller MUST turn `hideBackgroundDots` off for one of these. That option
   * blanks a rectangle of modules, which is the whole reason a logo looks like
   * it sits on a panel; a shaped plate covers what it needs to cover by itself,
   * and every module outside the outline should still be drawn.
   */
  shapedPlate: boolean;
}

export interface PrepareLogoInput {
  logoUrl: string;
  /** The QR's background colour, so plate and cleared hole are one field. */
  plateColor: string;
  /** Used instead when the logo would vanish into `plateColor`. */
  fallbackPlateColor: string;
  timeoutMs?: number;
}

/**
 * How long the logo gets to load here.
 *
 * This step runs *before* the renderer's own deadline is armed, so it needs a
 * deadline of its own or a dead CDN would hang ahead of the guard rather than
 * inside it. Unlike `qr-code-styling`, this loader also gets a real `onerror`,
 * which turns a 404 into an immediate answer instead of a six second wait.
 */
export const PLATE_LOAD_TIMEOUT_MS = 6_000;

const UNCACHEABLE: ReadonlySet<PreparedLogoOutcome> = new Set([
  "unavailable",
  "unreadable",
]);

const MAX_CACHE_ENTRIES = 24;
const cache = new Map<string, Promise<PreparedLogo>>();

/**
 * Trim, plate and cache one logo.
 *
 * Cached because the preview re-renders on every colour keystroke, and each
 * miss costs a decode plus two canvas passes.
 *
 * Never rejects: every failure is reported as an outcome, because a logo
 * problem must degrade the branding rather than break the render.
 */
export function prepareLogoForQr(
  input: PrepareLogoInput
): Promise<PreparedLogo> {
  const key = `${input.logoUrl}|${input.plateColor}|${input.fallbackPlateColor}`;
  const cached = cache.get(key);

  if (cached) return cached;

  const work = preparePlate(input).then((prepared) => {
    // A transient network failure must not unbrand every later render until
    // the page is reloaded.
    if (UNCACHEABLE.has(prepared.outcome)) cache.delete(key);
    return prepared;
  });

  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(key, work);

  return work;
}

/** Test seam. */
export function clearPreparedLogoCache(): void {
  cache.clear();
}

const UNCHANGED: PreparedLogo = {
  outcome: "unchanged",
  dataUrl: null,
  usedFallbackPlate: false,
  shapedPlate: false,
};

async function preparePlate(input: PrepareLogoInput): Promise<PreparedLogo> {
  // Plating is a browser-only enhancement. Off the DOM there is no logo
  // problem to report — the caller simply keeps the URL it already had — so
  // this must not masquerade as a load failure.
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return UNCHANGED;
  }

  let image: HTMLImageElement;

  try {
    image = await loadImage(
      input.logoUrl,
      input.timeoutMs ?? PLATE_LOAD_TIMEOUT_MS
    );
  } catch {
    return {
      outcome: "unavailable",
      dataUrl: null,
      usedFallbackPlate: false,
      shapedPlate: false,
    };
  }

  // An SVG with no intrinsic size reports 0 here. The library can still draw
  // it into whatever box it is given, so leave it alone.
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;

  if (!sourceWidth || !sourceHeight) return unreadable();

  const scale = Math.min(
    1,
    PLATE_ANALYSIS_MAX_EDGE / Math.max(sourceWidth, sourceHeight)
  );
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;

  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) return unreadable();

  sourceContext.drawImage(image, 0, 0, width, height);

  let pixels: ImageData;
  try {
    pixels = sourceContext.getImageData(0, 0, width, height);
  } catch {
    // Cross-origin without `Access-Control-Allow-Origin` taints the canvas and
    // makes this throw. Both logo hosts send it today, so this is the guard
    // for a host we have not met yet, not the expected path.
    return unreadable();
  }

  if (!hasTransparency(pixels)) return UNCHANGED;

  const box = alphaBoundingBox(pixels);
  if (!box) {
    return {
      outcome: "blank",
      dataUrl: null,
      usedFallbackPlate: false,
      shapedPlate: false,
    };
  }

  const plate = choosePlateColor(
    meanInkColor(pixels, box),
    input.plateColor,
    input.fallbackPlateColor
  );

  const { plateWidth, plateHeight, drawX, drawY } = platePlacement(box);

  const canvas = document.createElement("canvas");
  canvas.width = plateWidth;
  canvas.height = plateHeight;

  const plateContext = canvas.getContext("2d");
  if (!plateContext) return unreadable();

  const radius = Math.round(
    Math.max(box.width, box.height) * PLATE_MARGIN_FRACTION
  );
  const silhouette = buildSilhouette(
    { source, box, plateWidth, plateHeight, drawX, drawY, radius },
    plate.color
  );

  if (silhouette) {
    plateContext.putImageData(silhouette, 0, 0);
  } else {
    // No shaped plate could be built, so fall back to filling the rectangle.
    // Still an improvement on an unplated logo; just not a shaped one.
    plateContext.fillStyle = plate.color;
    plateContext.fillRect(0, 0, plateWidth, plateHeight);
  }

  plateContext.drawImage(
    source,
    box.x,
    box.y,
    box.width,
    box.height,
    drawX,
    drawY,
    box.width,
    box.height
  );

  return {
    outcome: "plated",
    dataUrl: canvas.toDataURL("image/png"),
    usedFallbackPlate: plate.usedFallback,
    shapedPlate: silhouette !== null,
  };
}

interface SilhouetteInput {
  source: HTMLCanvasElement;
  box: PixelBox;
  plateWidth: number;
  plateHeight: number;
  drawX: number;
  drawY: number;
  radius: number;
}

/**
 * A plate shaped like the artwork, not like its bounding box.
 *
 * The library only ever clears a *rectangle* of modules for the logo, and that
 * rectangle is what makes a transparent logo look like it is sitting on a
 * panel. Handing back a plate that follows the outline lets the caller leave
 * every module drawn and let the pattern run right up to the artwork — which
 * also occludes *less* of the code than the rectangle it replaces.
 *
 * The outline is the logo's own alpha mask dilated by `radius`, produced by
 * stamping the mask around two rings. See `SILHOUETTE_STAMPS` for why this is
 * not a blur.
 */
function buildSilhouette(
  input: SilhouetteInput,
  plateColor: string
): ImageData | null {
  const rgb = parseHexColor(plateColor);
  if (!rgb) return null;

  const { source, box, plateWidth, plateHeight, drawX, drawY, radius } = input;

  const mask = document.createElement("canvas");
  mask.width = plateWidth;
  mask.height = plateHeight;

  const context = mask.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  const stamp = (offsetX: number, offsetY: number) =>
    context.drawImage(
      source,
      box.x,
      box.y,
      box.width,
      box.height,
      drawX + offsetX,
      drawY + offsetY,
      box.width,
      box.height
    );

  // Two rings rather than one: the outer ring carries the dilation, the inner
  // one fills the band behind strokes thinner than the radius, which would
  // otherwise end up with a hollow halo.
  for (const ring of [radius, radius / 2]) {
    for (let step = 0; step < SILHOUETTE_STAMPS; step++) {
      const angle = (step / SILHOUETTE_STAMPS) * Math.PI * 2;
      stamp(Math.cos(angle) * ring, Math.sin(angle) * ring);
    }
  }

  stamp(0, 0);

  const dilated = context.getImageData(0, 0, plateWidth, plateHeight);
  const plate = context.createImageData(plateWidth, plateHeight);

  for (let offset = 0; offset < dilated.data.length; offset += 4) {
    plate.data[offset] = rgb.r;
    plate.data[offset + 1] = rgb.g;
    plate.data[offset + 2] = rgb.b;
    plate.data[offset + 3] = rampAlpha(
      dilated.data[offset + 3],
      SILHOUETTE_RAMP_LOW,
      SILHOUETTE_RAMP_HIGH
    );
  }

  return plate;
}

function unreadable(): PreparedLogo {
  return {
    outcome: "unreadable",
    dataUrl: null,
    usedFallbackPlate: false,
    shapedPlate: false,
  };
}

function loadImage(url: string, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Required for the `getImageData` above, and harmless on our own hosts.
    image.crossOrigin = "anonymous";

    const timer = setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      reject(new Error("Timed out loading the logo."));
    }, timeoutMs);

    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };

    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Failed to load the logo."));
    };

    image.src = url;
  });
}
