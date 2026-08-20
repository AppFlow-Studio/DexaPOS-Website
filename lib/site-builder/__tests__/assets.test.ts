import { describe, expect, it } from "vitest";

import { assetResolver, EMPTY_ASSET_MAP, type AssetMap } from "../asset-map";
import {
  ALLOWED_ASSET_TYPES,
  MAX_ASSET_BYTES,
  checkAssetUpload,
  formatBytes,
  isAllowedAssetType,
  readImageSize,
  safeFileName,
  sniffImageType,
} from "../assets";
import { collectAssetIds } from "../bindings/collect";
import { CURRENT_SCHEMA_VERSION } from "../page-document";

/**
 * The upload gate.
 *
 * Everything here is about one idea: **the type a file claims is a claim, not a
 * fact.** A browser sets it from the extension and a scripted request sets it
 * to whatever it likes, so a `.png` that is really an HTML document with a
 * `<script>` in it arrives labelled `image/png` — and it would be served back
 * from our own CDN hostname.
 */

const png = (extra: number[] = []) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...extra]);
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const gif = () => new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0]);
const html = () => new TextEncoder().encode("<!doctype html><script>alert(1)</script>");

describe("sniffImageType", () => {
  it("recognises the formats we accept", () => {
    expect(sniffImageType(png())).toBe("image/png");
    expect(sniffImageType(jpeg())).toBe("image/jpeg");
    expect(sniffImageType(gif())).toBe("image/gif");
  });

  it("recognises webp, whose marker is not at the start", () => {
    const bytes = new Uint8Array(16);
    bytes.set(new TextEncoder().encode("RIFF"), 0);
    bytes.set(new TextEncoder().encode("WEBP"), 8);
    expect(sniffImageType(bytes)).toBe("image/webp");
  });

  it("refuses to identify anything else", () => {
    expect(sniffImageType(html())).toBeNull();
    expect(sniffImageType(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });

  /**
   * The whole reason the sniffer exists: an SVG is a document that can carry
   * script, and it is not in the allowlist — but the point is that it does not
   * even reach that check, because its bytes are not an image we know.
   */
  it("does not identify an SVG", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(sniffImageType(svg)).toBeNull();
  });
});

describe("checkAssetUpload", () => {
  it("accepts an honest image", () => {
    const result = checkAssetUpload("image/png", 1024, png());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.type).toBe("image/png");
  });

  it("rejects a script wearing an image's name", () => {
    const result = checkAssetUpload("image/png", 200, html());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("asset_type_rejected");
  });

  /**
   * Both halves have to agree. A real GIF uploaded under a `image/png` label is
   * how you get past a filter that only reads the declaration — and how a file
   * ends up stored with an extension its bytes do not match.
   */
  it("rejects a real image whose declared type is a lie", () => {
    const result = checkAssetUpload("image/png", 1024, gif());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("do not match");
  });

  it("rejects a type that is not on the list at all", () => {
    expect(checkAssetUpload("image/svg+xml", 1024, png()).ok).toBe(false);
    expect(checkAssetUpload("application/pdf", 1024, png()).ok).toBe(false);
    expect(checkAssetUpload("text/html", 1024, png()).ok).toBe(false);
  });

  it("rejects an image past the size cap", () => {
    const result = checkAssetUpload("image/png", MAX_ASSET_BYTES + 1, png());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("asset_too_large");
  });

  it("accepts one exactly at the cap", () => {
    expect(checkAssetUpload("image/png", MAX_ASSET_BYTES, png()).ok).toBe(true);
  });

  it("rejects an empty file", () => {
    expect(checkAssetUpload("image/png", 0, new Uint8Array()).ok).toBe(false);
  });

  it("never accepts SVG, whatever it claims", () => {
    expect(isAllowedAssetType("image/svg+xml")).toBe(false);
    expect(ALLOWED_ASSET_TYPES).not.toContain("image/svg+xml");
  });
});

describe("safeFileName", () => {
  it("keeps the merchant's name readable but not authoritative", () => {
    expect(safeFileName("Our Best Pizza.JPG", "abc123", "image/jpeg")).toBe(
      "our-best-pizza-abc123.jpg",
    );
  });

  /**
   * Nothing a merchant can type may influence where the file lands. The
   * uniqueness is ours; theirs is decoration.
   */
  it("cannot climb out of its directory", () => {
    const name = safeFileName("../../etc/passwd", "abc123", "image/png");
    expect(name).not.toContain("/");
    expect(name).not.toContain("..");
    expect(name.endsWith("-abc123.png")).toBe(true);
  });

  it("survives a name with nothing usable in it", () => {
    expect(safeFileName("???.png", "abc123", "image/png")).toBe("image-abc123.png");
  });

  it("uses the sniffed type's extension, not the one that was typed", () => {
    expect(safeFileName("photo.png", "abc123", "image/webp")).toBe("photo-abc123.webp");
  });
});

describe("readImageSize", () => {
  it("reads a PNG header", () => {
    const bytes = new Uint8Array(24);
    bytes.set(png(), 0);
    new DataView(bytes.buffer).setUint32(16, 800);
    new DataView(bytes.buffer).setUint32(20, 600);
    expect(readImageSize(bytes, "image/png")).toEqual({ width: 800, height: 600 });
  });

  it("reads a GIF header", () => {
    const bytes = new Uint8Array(10);
    bytes.set(gif().subarray(0, 6), 0);
    new DataView(bytes.buffer).setUint16(6, 320, true);
    new DataView(bytes.buffer).setUint16(8, 240, true);
    expect(readImageSize(bytes, "image/gif")).toEqual({ width: 320, height: 240 });
  });

  /**
   * Dimensions are a nice-to-have that stops layout shift — never a reason to
   * fail an upload. A truncated or exotic header returns null and the image is
   * stored without them.
   */
  it("returns null rather than throwing on a header it cannot read", () => {
    expect(readImageSize(new Uint8Array([0x89, 0x50]), "image/png")).toBeNull();
    expect(readImageSize(new Uint8Array(4), "image/jpeg")).toBeNull();
  });
});

describe("formatBytes", () => {
  it("reads the way a person would say it", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

/**
 * Collecting the ids a page needs, so one query fetches every photograph on it.
 * Structural rather than path-based, which is why the content reshape added two
 * asset slots to one section and this needed no change.
 */
describe("collectAssetIds", () => {
  const doc = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sections: [
      {
        id: "s1",
        kind: "content" as const,
        props: {
          background: "photo",
          backgroundImage: { assetId: "bg_1" },
          media: "photo",
          mediaImage: { assetId: "fg_1" },
          alignment: "left",
        },
      },
      {
        id: "s2",
        kind: "gallery" as const,
        props: {
          images: [{ assetId: "g_1" }, { assetId: "g_2" }, { assetId: "bg_1" }],
          layout: "grid",
          columns: 3,
        },
      },
    ],
    seo: {},
    settings: {},
  } as never;

  it("finds both slots on a content section and every image in a gallery", () => {
    expect(collectAssetIds(doc).sort()).toEqual(["bg_1", "fg_1", "g_1", "g_2"]);
  });

  it("deduplicates, so one photo used twice is fetched once", () => {
    expect(collectAssetIds(doc).filter((id) => id === "bg_1")).toHaveLength(1);
  });

  it("returns nothing for a page with no photographs", () => {
    expect(
      collectAssetIds({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        sections: [{ id: "s1", kind: "faq", props: { items: [], defaultOpenFirst: true } }],
        seo: {},
        settings: {},
      } as never),
    ).toEqual([]);
  });
});

describe("assetResolver", () => {
  const map: AssetMap = new Map([
    ["a_1", { url: "https://cdn.test/a.png", alt: "A plate of pasta", width: 800, height: 600 }],
  ]);

  it("resolves a known asset", () => {
    expect(assetResolver(map)("a_1")?.url).toBe("https://cdn.test/a.png");
  });

  /**
   * A deleted asset, a foreign one, and an id from before the library all have
   * to look identical to a renderer: nothing to draw. `SiteImage` renders no
   * element at all for null, so a merchant clearing out their photos can never
   * produce a broken-image icon on a live page.
   */
  it("returns null for anything it does not hold", () => {
    expect(assetResolver(map)("deleted")).toBeNull();
    expect(assetResolver(EMPTY_ASSET_MAP)("a_1")).toBeNull();
  });
});
