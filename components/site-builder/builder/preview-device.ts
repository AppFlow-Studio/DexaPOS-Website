export type PreviewDevice = "desktop" | "tablet" | "mobile";

export interface PreviewDevicePreset {
  id: PreviewDevice;
  label: string;
  width: number;
  height: number;
}

/** Representative CSS viewports, not vendor-specific hardware profiles. */
export const PREVIEW_DEVICE_PRESETS: Record<PreviewDevice, PreviewDevicePreset> = {
  desktop: { id: "desktop", label: "Desktop", width: 1120, height: 800 },
  tablet: { id: "tablet", label: "Tablet", width: 834, height: 1112 },
  mobile: { id: "mobile", label: "Phone", width: 390, height: 844 },
};

export const PREVIEW_DEVICES = Object.values(PREVIEW_DEVICE_PRESETS);

/** Keeps the complete simulated viewport visible without enlarging it. */
export function fitPreviewScale(
  availableWidth: number,
  availableHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = 32,
) {
  if (availableWidth <= 0 || availableHeight <= 0) return 1;

  return Math.min(
    1,
    Math.max(0, availableWidth - padding) / viewportWidth,
    Math.max(0, availableHeight - padding) / viewportHeight,
  );
}
