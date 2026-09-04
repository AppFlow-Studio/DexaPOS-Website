import type { KdsDeviceTruthVerdict } from "@/app/manage/actions/kds-device-truth";

/**
 * Single source of truth for how a routed-vs-seen verdict is labelled and
 * coloured across the device-truth UI. The tone is a tailwind class fragment
 * that pairs with <Badge>; keeping it here means the divergence list, the
 * timeline and the health cards can never disagree about what a verdict means.
 */
export const VERDICT_META: Record<
  KdsDeviceTruthVerdict,
  {
    label: string;
    tone: "green" | "amber" | "red" | "gray" | "purple";
    description: string;
  }
> = {
  CONFIRMED: {
    label: "Confirmed",
    tone: "green",
    description:
      "Server routed it and the device acknowledged painting it. The kitchen really showed this.",
  },
  RENDER_SUSPECT: {
    label: "Render suspect",
    tone: "amber",
    description:
      "The device received it but never reported painting it. Likely arrived on the tablet and failed to render.",
  },
  NEVER_SHOWED: {
    label: "Never showed",
    tone: "red",
    description:
      "Server routed it, the device was online, but the device never reported receiving it. The real bug this tool exists to find.",
  },
  OFFLINE: {
    label: "Offline at fire",
    tone: "gray",
    description:
      "Routed while the device was offline. Expected, not a bug — the item will reach the screen on reconnect.",
  },
  GHOST: {
    label: "Ghost",
    tone: "purple",
    description:
      "The device reported an event but the routing log has no decision for this item. Stale cache on the device.",
  },
  NOT_ROUTED: {
    label: "Not routed",
    tone: "gray",
    description:
      "The routing log has a non-routed decision (skipped or dropped) for this item.",
  },
  NO_DEVICE_DATA: {
    label: "No device data",
    tone: "gray",
    description:
      "This display has never reported. The POS emitter has not shipped to it yet — absence of device evidence is not evidence of a fault.",
  },
};

const TONE_CLASS: Record<VERDICT_META_TONE, string> = {
  green:
    "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  amber:
    "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  red: "border-transparent bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  gray: "border-transparent bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  purple:
    "border-transparent bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
};

type VERDICT_META_TONE = (typeof VERDICT_META)[KdsDeviceTruthVerdict]["tone"];

export function verdictToneClass(verdict: KdsDeviceTruthVerdict): string {
  return TONE_CLASS[VERDICT_META[verdict].tone];
}
