/**
 * What the asset pipeline will and will not accept.
 *
 * Pure, I/O-free and server-free so the upload action, the picker and the tests
 * all agree about the rules rather than each carrying their own copy. The
 * action is what enforces them; this is what defines them.
 */

/** 5 MB. Matches the CDN edge function's own image ceiling. */
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

/**
 * The image types a merchant website may carry.
 *
 * **SVG is deliberately absent, and the CDN function's own allowlist is wider
 * than this on purpose.** An SVG is a document: it can carry `<script>`,
 * external references and event handlers, and it is served from our CDN under
 * our origin. Sanitising one properly is a real piece of work, and the payoff —
 * a slightly crisper logo — does not justify a stored-XSS surface on a public
 * restaurant page. The upload action rejects it before the file ever reaches
 * the edge function, which still permits SVG for the organisation logos it
 * accepted before this existed.
 */
export const ALLOWED_ASSET_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export type AllowedAssetType = (typeof ALLOWED_ASSET_TYPES)[number];

/**
 * The first bytes of each format we accept.
 *
 * **The declared MIME type is a claim by the uploader, not a fact.** A browser
 * sets it from the file extension, and a scripted request sets it to whatever it
 * likes — so a `.png` that is actually an HTML document with a `<script>` in it
 * arrives labelled `image/png`. Checking the magic number is the cheap half of
 * the answer (the other half is that we never serve these from an origin that
 * can execute anything).
 */
const MAGIC: { type: AllowedAssetType; bytes: number[]; offset?: number }[] = [
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  // RIFF....WEBP — the format marker sits at byte 8, after the size field.
  { type: "image/webp", bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
  // ....ftyp — AVIF's brand follows; the box type is enough to tell it from
  // the formats above, and an unknown brand fails the type check anyway.
  { type: "image/avif", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
];

export function isAllowedAssetType(value: string): value is AllowedAssetType {
  return (ALLOWED_ASSET_TYPES as readonly string[]).includes(value);
}

/**
 * The type the file's own bytes claim to be, or `null` if we do not recognise
 * them. A `null` is a rejection, not a shrug: an image we cannot identify is
 * one we should not be republishing to the open internet.
 */
export function sniffImageType(bytes: Uint8Array): AllowedAssetType | null {
  for (const { type, bytes: signature, offset = 0 } of MAGIC) {
    if (bytes.length < offset + signature.length) continue;
    if (signature.every((byte, i) => bytes[offset + i] === byte)) return type;
  }
  return null;
}

export type AssetRejection =
  | { ok: true; type: AllowedAssetType }
  | { ok: false; code: "asset_type_rejected" | "asset_too_large"; message: string };

/**
 * The whole gate, in one call.
 *
 * Both the declared type *and* the sniffed type must be acceptable, and they
 * must agree. Requiring agreement is what stops a real GIF being uploaded under
 * a `image/png` label to slip past a filter keyed on the declaration.
 */
export function checkAssetUpload(
  declaredType: string,
  sizeBytes: number,
  head: Uint8Array,
): AssetRejection {
  if (sizeBytes > MAX_ASSET_BYTES) {
    return {
      ok: false,
      code: "asset_too_large",
      message: `That image is ${formatBytes(sizeBytes)}. The limit is ${formatBytes(MAX_ASSET_BYTES)}.`,
    };
  }

  if (sizeBytes === 0) {
    return { ok: false, code: "asset_type_rejected", message: "That file is empty." };
  }

  if (!isAllowedAssetType(declaredType)) {
    return {
      ok: false,
      code: "asset_type_rejected",
      message: "Use a JPG, PNG, WebP, GIF or AVIF image.",
    };
  }

  const sniffed = sniffImageType(head);
  if (!sniffed) {
    return {
      ok: false,
      code: "asset_type_rejected",
      message: "That file does not look like an image.",
    };
  }

  if (sniffed !== declaredType) {
    return {
      ok: false,
      code: "asset_type_rejected",
      message: "That file's contents do not match its type.",
    };
  }

  return { ok: true, type: sniffed };
}

/**
 * A storage-safe filename.
 *
 * The merchant's own name is kept only as a readable prefix — the uniqueness
 * comes from the caller's random component, never from what they typed. Path
 * separators, dots and everything non-alphanumeric go, so nothing a merchant
 * can name a file can climb out of its directory.
 */
export function safeFileName(originalName: string, unique: string, type: AllowedAssetType): string {
  const stem = originalName
    .replace(/\.[^.]*$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `${stem || "image"}-${unique}.${EXTENSIONS[type]}`;
}

const EXTENSIONS: Record<AllowedAssetType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reads the intrinsic size out of an image's header.
 *
 * Worth the ~60 lines because the alternative is a public page whose images
 * have no `width`/`height`, which means layout shift on every photo a merchant
 * uploads — a Core Web Vitals number, on a product sold partly on SEO. Only the
 * formats whose headers are trivial to read are covered; anything else stores
 * `null` and simply does not get the attributes.
 */
export function readImageSize(
  bytes: Uint8Array,
  type: AllowedAssetType,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  try {
    if (type === "image/png" && bytes.length >= 24) {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }

    if (type === "image/gif" && bytes.length >= 10) {
      return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    }

    if (type === "image/jpeg") return readJpegSize(view, bytes.length);

    // Lossy VP8: the dimensions sit just past the start code in the frame
    // header. The lossless and extended variants are laid out differently and
    // fall through to null rather than being guessed at.
    if (type === "image/webp" && bytes.length >= 30) {
      const format = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
      if (format === "VP8 ") {
        return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
      }
      if (format === "VP8L") {
        const bits = view.getUint32(21, true);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
  } catch {
    // A truncated or malformed header is not worth an exception: the image
    // still uploads, it just renders without dimensions.
    return null;
  }

  return null;
}

/** Walks JPEG segments to the start-of-frame marker, which carries the size. */
function readJpegSize(view: DataView, length: number): { width: number; height: number } | null {
  let offset = 2;

  while (offset + 9 < length) {
    if (view.getUint8(offset) !== 0xff) return null;

    const marker = view.getUint8(offset + 1);
    // SOF0–SOF15, excluding the four that are not frame headers.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }

    offset += 2 + view.getUint16(offset + 2);
  }

  return null;
}
