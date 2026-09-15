/**
 * The box in the middle of the QR code.
 *
 * `qr-code-styling` clears a rectangle for the logo and paints nothing into
 * it, and it sizes that rectangle from the image file rather than from the ink
 * the file contains. A logo with a baked-in background fills the rectangle and
 * looks deliberate; a transparent one leaves a bare hole — pale artwork
 * vanishes into it entirely, and export padding makes it far larger than the
 * mark it is supposed to frame.
 *
 * These tests pin the measurements that let the renderer build the missing
 * plate itself. They deliberately cover the two traps that make a naive
 * implementation look correct while being wrong on real files: the alpha haze
 * left along anti-aliased edges, and the arbitrary RGB that encoders leave
 * inside fully transparent pixels.
 */

import { describe, expect, it } from "vitest";

import {
  alphaBoundingBox,
  choosePlateColor,
  hasTransparency,
  inkIsInvisibleOnPlate,
  meanInkColor,
  platePlacement,
  rampAlpha,
  type RgbaPixels,
} from "@/lib/qr/logo-plate";

/** The merchant on the branch: cream background, brown modules. */
const CREAM = "#f5ebdd";
const BROWN = "#6b3e2e";

type Pixel = [r: number, g: number, b: number, a: number];

function pixels(
  width: number,
  height: number,
  at: (x: number, y: number) => Pixel
): RgbaPixels {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = at(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }

  return { width, height, data };
}

const TRANSPARENT: Pixel = [0, 0, 0, 0];
const BLACK: Pixel = [0, 0, 0, 255];
const WHITE: Pixel = [255, 255, 255, 255];

/** A mark occupying a known region of an otherwise empty canvas. */
function markAt(box: { x: number; y: number; width: number; height: number }) {
  return (x: number, y: number): Pixel =>
    x >= box.x &&
    x < box.x + box.width &&
    y >= box.y &&
    y < box.y + box.height
      ? BLACK
      : TRANSPARENT;
}

describe("finding the real ink in a logo file", () => {
  it("trims export padding down to the mark", () => {
    // The shape merchants actually upload: a small mark exported onto a large
    // square canvas. Measured as-is, this is what produces an oversized hole.
    const box = { x: 30, y: 34, width: 12, height: 20 };

    expect(alphaBoundingBox(pixels(100, 100, markAt(box)))).toEqual(box);
  });

  it("reports nothing for an entirely transparent file", () => {
    // Must not become a plate-shaped blob in the middle of the code.
    expect(alphaBoundingBox(pixels(20, 20, () => TRANSPARENT))).toBeNull();
  });

  it("ignores the alpha haze left by anti-aliasing and lossy re-encodes", () => {
    // Every pixel outside the mark carries alpha 5. A zero threshold would
    // measure this as content and trim nothing at all.
    const box = { x: 8, y: 8, width: 4, height: 4 };
    const hazy = pixels(24, 24, (x, y) => {
      const inside = markAt(box)(x, y);
      return inside[3] > 0 ? inside : [0, 0, 0, 5];
    });

    expect(alphaBoundingBox(hazy)).toEqual(box);
  });
});

describe("deciding whether a logo plates itself", () => {
  it("leaves a fully opaque logo alone", () => {
    expect(hasTransparency(pixels(10, 10, () => WHITE))).toBe(false);
  });

  it("treats a single soft edge pixel as transparency", () => {
    const almostOpaque = pixels(10, 10, (x, y) =>
      x === 0 && y === 0 ? [255, 255, 255, 200] : WHITE
    );

    expect(hasTransparency(almostOpaque)).toBe(true);
  });
});

describe("measuring the colour of the ink", () => {
  it("ignores the RGB inside transparent pixels", () => {
    // The trap: PNG encoders routinely leave black in fully transparent
    // pixels. An unweighted mean over this box returns dark grey and declares
    // a white logo perfectly visible.
    const box = { x: 4, y: 4, width: 2, height: 2 };
    const whiteMark = pixels(20, 20, (x, y) =>
      markAt(box)(x, y)[3] > 0 ? WHITE : TRANSPARENT
    );

    expect(meanInkColor(whiteMark, { x: 0, y: 0, width: 20, height: 20 }))
      .toEqual({ r: 255, g: 255, b: 255 });
  });

  it("returns nothing when the box holds no ink", () => {
    const empty = pixels(8, 8, () => TRANSPARENT);

    expect(meanInkColor(empty, { x: 0, y: 0, width: 8, height: 8 })).toBeNull();
  });
});

describe("laying the mark out on its plate", () => {
  it("keeps a wide mark wide", () => {
    // Forcing a square would strand a wide logo in a tall box — the same bug
    // in a different costume.
    const placement = platePlacement(
      { x: 0, y: 0, width: 200, height: 50 },
      0.1
    );

    // Margin is a fraction of the longest edge, applied on all four sides.
    expect(placement).toEqual({
      plateWidth: 240,
      plateHeight: 90,
      drawX: 20,
      drawY: 20,
    });
    expect(placement.plateWidth).toBeGreaterThan(placement.plateHeight);
  });

  it("centres the mark", () => {
    const box = { x: 5, y: 5, width: 100, height: 100 };
    const { plateWidth, plateHeight, drawX, drawY } = platePlacement(box, 0.08);

    expect(plateWidth - (drawX + box.width)).toBe(drawX);
    expect(plateHeight - (drawY + box.height)).toBe(drawY);
  });
});

describe("catching a logo that cannot be seen on its plate", () => {
  it("flags white artwork on a light brand background", () => {
    // The reported case: a transparent PNG exported white for a dark header,
    // plated onto the merchant's cream background.
    expect(inkIsInvisibleOnPlate({ r: 255, g: 255, b: 255 }, CREAM)).toBe(
      true
    );
  });

  it("passes the same merchant's actual brand colour", () => {
    expect(inkIsInvisibleOnPlate({ r: 107, g: 62, b: 46 }, CREAM)).toBe(
      false
    );
  });

  it("passes mid grey, which is visible even though it is not high contrast", () => {
    // This is a visibility floor, not the print legibility rule that governs
    // the modules. Applying that stricter rule here would reject good logos.
    expect(inkIsInvisibleOnPlate({ r: 136, g: 136, b: 136 }, CREAM)).toBe(
      false
    );
  });

  it("stays quiet when the plate colour cannot be parsed", () => {
    // Render time never fails on branding; it degrades and says so elsewhere.
    expect(inkIsInvisibleOnPlate({ r: 255, g: 255, b: 255 }, "not-a-colour")).toBe(
      false
    );
  });
});

describe("choosing what colour to paint the plate", () => {
  it("uses the QR background, so plate and cleared hole read as one field", () => {
    expect(choosePlateColor({ r: 107, g: 62, b: 46 }, CREAM, BROWN)).toEqual({
      color: CREAM,
      usedFallback: false,
    });
  });

  it("rescues white artwork with a badge in the module colour", () => {
    // The reported bug, fully fixed rather than merely reported: a white
    // transparent PNG would otherwise plate onto cream and disappear.
    expect(choosePlateColor({ r: 255, g: 255, b: 255 }, CREAM, BROWN)).toEqual({
      color: BROWN,
      usedFallback: true,
    });
  });

  it("always finds a colour that shows the logo, whatever its tone", () => {
    // There is no third case. Contrast is multiplicative along a chain, so ink
    // hidden against both colours would mean the two brand colours are within
    // 1.4 * 1.4 = 1.96 of each other — and `resolveQrBranding` guarantees at
    // least 4.5. This sweep is the executable form of that argument.
    for (let tone = 0; tone <= 255; tone += 5) {
      const chosen = choosePlateColor({ r: tone, g: tone, b: tone }, CREAM, BROWN);

      expect(inkIsInvisibleOnPlate({ r: tone, g: tone, b: tone }, chosen.color)).toBe(
        false
      );
    }
  });

  it("never badges a logo whose colour could not be measured", () => {
    expect(choosePlateColor(null, CREAM, BROWN)).toEqual({
      color: CREAM,
      usedFallback: false,
    });
  });
});

describe("shaping the plate to the artwork", () => {
  it("ramps any real coverage up to a solid plate", () => {
    // The plate must never be translucent over the modules, or the pattern
    // shows through the logo and both become unreadable.
    expect(rampAlpha(0, 8, 40)).toBe(0);
    expect(rampAlpha(8, 8, 40)).toBe(0);
    expect(rampAlpha(40, 8, 40)).toBe(255);
    expect(rampAlpha(255, 8, 40)).toBe(255);
  });

  it("fades across the ramp so an outline does not stair-step", () => {
    const midpoint = rampAlpha(24, 8, 40);

    expect(midpoint).toBeGreaterThan(0);
    expect(midpoint).toBeLessThan(255);
  });
});
