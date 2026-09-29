import type { KdsDeviceTruthVerdict } from "@/app/manage/actions/kds-device-truth";

/**
 * Single source of truth for how a routed-vs-seen verdict is labelled and
 * explained across the device-truth UI, so the divergence list, the timeline
 * and the health cards can never disagree about what a verdict means.
 *
 * There is deliberately no colour here: a verdict is a word in a neutral pill
 * (UI-DESIGN-SYSTEM §4.6b). `needsAttention` marks the verdicts where the
 * server and the device disagree; the UI shows those by weight, not hue.
 */
export const VERDICT_META: Record<
  KdsDeviceTruthVerdict,
  {
    label: string;
    needsAttention: boolean;
    description: string;
  }
> = {
  CONFIRMED: {
    label: "Confirmed",
    needsAttention: false,
    description:
      "Server routed it and the device acknowledged painting it. The kitchen really showed this.",
  },
  RENDER_SUSPECT: {
    label: "Render suspect",
    needsAttention: true,
    description:
      "The device received it but never reported painting it. Likely arrived on the tablet and failed to render.",
  },
  NEVER_SHOWED: {
    label: "Never showed",
    needsAttention: true,
    description:
      "Server routed it, the device was online, but the device never reported receiving it. The real bug this tool exists to find.",
  },
  OFFLINE: {
    label: "Offline at fire",
    needsAttention: false,
    description:
      "Routed while the device was offline. Expected, not a bug — the item will reach the screen on reconnect.",
  },
  GHOST: {
    label: "Ghost",
    needsAttention: true,
    description:
      "The device reported an event but the routing log has no decision for this item. Stale cache on the device.",
  },
  NOT_ROUTED: {
    label: "Not routed",
    needsAttention: false,
    description:
      "The routing log has a non-routed decision (skipped or dropped) for this item.",
  },
  NO_DEVICE_DATA: {
    label: "No device data",
    needsAttention: false,
    description:
      "This display has never reported. The POS emitter has not shipped to it yet — absence of device evidence is not evidence of a fault.",
  },
};
