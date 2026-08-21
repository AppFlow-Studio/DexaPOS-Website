import type { DeviceLifecycleStatus } from "@/types/device-registry";

export interface DeviceStatusBadgeStyle {
  dot: string;
  text: string;
  bg: string;
}

export type DeviceWarrantyState = "unknown" | "expired" | "expiring" | "active";

export interface DeviceWarrantyPresentation {
  state: DeviceWarrantyState;
  label: string;
  style: DeviceStatusBadgeStyle;
}

interface DeviceLifecyclePresentation {
  label: string;
  style: DeviceStatusBadgeStyle;
}

const NEUTRAL_STYLE: DeviceStatusBadgeStyle = {
  dot: "bg-slate-400",
  text: "text-slate-600 dark:text-slate-400",
  bg: "bg-slate-100 dark:bg-slate-800/40",
};

const DEVICE_LIFECYCLE_PRESENTATION: Record<
  DeviceLifecycleStatus,
  DeviceLifecyclePresentation
> = {
  in_warehouse: {
    label: "In Warehouse",
    style: {
      dot: "bg-blue-500",
      text: "text-blue-700 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-900/20",
    },
  },
  allocated: {
    label: "Allocated",
    style: {
      dot: "bg-violet-500",
      text: "text-violet-700 dark:text-violet-400",
      bg: "bg-violet-50 dark:bg-violet-900/20",
    },
  },
  shipped: {
    label: "Shipped",
    style: {
      dot: "bg-indigo-500",
      text: "text-indigo-700 dark:text-indigo-400",
      bg: "bg-indigo-50 dark:bg-indigo-900/20",
    },
  },
  provisioning: {
    label: "Provisioning",
    style: {
      dot: "bg-cyan-500",
      text: "text-cyan-700 dark:text-cyan-400",
      bg: "bg-cyan-50 dark:bg-cyan-900/20",
    },
  },
  deployed: {
    label: "Deployed",
    style: {
      dot: "bg-emerald-500",
      text: "text-emerald-700 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
    },
  },
  in_repair: {
    label: "In Repair",
    style: {
      dot: "bg-amber-500",
      text: "text-amber-700 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-900/20",
    },
  },
  decommissioned: {
    label: "Decommissioned",
    style: NEUTRAL_STYLE,
  },
  lost: {
    label: "Lost",
    style: {
      dot: "bg-rose-500",
      text: "text-rose-700 dark:text-rose-400",
      bg: "bg-rose-50 dark:bg-rose-900/20",
    },
  },
  rma: {
    label: "RMA",
    style: {
      dot: "bg-orange-500",
      text: "text-orange-700 dark:text-orange-400",
      bg: "bg-orange-50 dark:bg-orange-900/20",
    },
  },
};

const WARRANTY_STYLES: Record<DeviceWarrantyState, DeviceStatusBadgeStyle> = {
  unknown: NEUTRAL_STYLE,
  expired: {
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-900/20",
  },
  expiring: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
  active: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
};

function startOfLocalDay(date: Date): number | null {
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function deviceWarrantyState(
  date: string | null | undefined,
  today: Date = new Date(),
): DeviceWarrantyPresentation {
  const expiryDay = date ? startOfLocalDay(new Date(date)) : null;
  const todayDay = startOfLocalDay(today);

  if (expiryDay === null || todayDay === null) {
    return {
      state: "unknown",
      label: "Warranty unknown",
      style: WARRANTY_STYLES.unknown,
    };
  }

  const diffDays = Math.round((expiryDay - todayDay) / 86_400_000);

  if (diffDays < 0) {
    return {
      state: "expired",
      label: "Warranty expired",
      style: WARRANTY_STYLES.expired,
    };
  }

  if (diffDays <= 60) {
    return {
      state: "expiring",
      label: `Warranty ends in ${diffDays}d`,
      style: WARRANTY_STYLES.expiring,
    };
  }

  return {
    state: "active",
    label: "Warranty active",
    style: WARRANTY_STYLES.active,
  };
}

export function deviceWarrantyIsOnWatch(
  date: string | null | undefined,
  today: Date = new Date(),
): boolean {
  const state = deviceWarrantyState(date, today).state;
  return state === "expired" || state === "expiring";
}

export function deviceNeedsAttention(
  status: string | null | undefined,
): boolean {
  return status === "in_repair" || status === "lost" || status === "rma";
}

export function deviceLifecycleStatusStyle(
  status: string | null | undefined,
): DeviceStatusBadgeStyle {
  if (!status) return NEUTRAL_STYLE;
  return (
    DEVICE_LIFECYCLE_PRESENTATION[status as DeviceLifecycleStatus]?.style ??
    NEUTRAL_STYLE
  );
}

export function deviceLifecycleStatusLabel(
  status: string | null | undefined,
): string {
  if (!status) return "Unknown";
  return (
    DEVICE_LIFECYCLE_PRESENTATION[status as DeviceLifecycleStatus]?.label ??
    status
      .replace(/_/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}
