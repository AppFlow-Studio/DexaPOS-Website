import {
  fitPreviewScale,
  PREVIEW_DEVICES,
  PREVIEW_DEVICE_PRESETS,
} from "../preview-device";

describe("preview device presets", () => {
  it("offers desktop, tablet, and phone viewports in that order", () => {
    expect(PREVIEW_DEVICES.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "desktop", label: "Desktop" },
      { id: "tablet", label: "Tablet" },
      { id: "mobile", label: "Phone" },
    ]);
  });

  it("uses widths that exercise the storefront's desktop and mobile breakpoints", () => {
    expect(PREVIEW_DEVICE_PRESETS.desktop.width).toBeGreaterThanOrEqual(1024);
    expect(PREVIEW_DEVICE_PRESETS.tablet.width).toBeGreaterThanOrEqual(768);
    expect(PREVIEW_DEVICE_PRESETS.tablet.width).toBeLessThan(1024);
    expect(PREVIEW_DEVICE_PRESETS.mobile.width).toBeLessThan(640);
  });
});

describe("fitting a preview viewport", () => {
  it("does not enlarge a viewport that already fits", () => {
    expect(fitPreviewScale(1200, 900, 1120, 800)).toBe(1);
  });

  it("uses the tighter dimension while keeping the aspect ratio", () => {
    expect(fitPreviewScale(600, 700, 834, 1112)).toBeCloseTo(668 / 1112);
  });
});
