import type { TableStatus } from "@/types/floor-plan";

/**
 * Single source of truth for `TableStatus` presentation.
 *
 * Mirrors the shape of `PAYMENT_STATUS_STYLES` in `payment-status.ts` — a dot,
 * a text colour and a tint — so every status badge in the product reads as one
 * system. Replaces the solid `bg-green-500` / `bg-blue-500` fills the tables
 * area used to carry, which shouted over the flat surfaces around them.
 *
 * Note these are the badge styles for lists, panels and cards. The floor-plan
 * canvas keeps its own stronger colour encoding: a table's fill has to read at
 * a glance across a dense layout, which a soft tint cannot do.
 */

export interface BadgeStyle {
  dot: string;
  text: string;
  bg: string;
}

/** Several raw statuses collapse to one user-facing label. */
export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  available: "Available",
  seated: "In Use",
  ordered: "In Use",
  served: "In Use",
  check_presented: "In Use",
  paid: "Overtime",
  cleaning: "Needs Cleaning",
  reserved: "Reserved",
  blocked: "Blocked",
  not_in_service: "Not in Service",
};

export const TABLE_STATUS_STYLES: Record<TableStatus, BadgeStyle> = {
  available: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  seated: {
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  ordered: {
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  served: {
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  check_presented: {
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  paid: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
  cleaning: {
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
  },
  reserved: {
    dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/20",
  },
  blocked: {
    dot: "bg-slate-500",
    text: "text-slate-700 dark:text-slate-400",
    bg: "bg-slate-100 dark:bg-slate-800/40",
  },
  not_in_service: {
    dot: "bg-slate-500",
    text: "text-slate-700 dark:text-slate-400",
    bg: "bg-slate-100 dark:bg-slate-800/40",
  },
};

/** `null` is treated as available — an unseated table has no session. */
export function tableStatusStyle(status: TableStatus | null): BadgeStyle {
  return TABLE_STATUS_STYLES[status ?? "available"] ?? TABLE_STATUS_STYLES.available;
}

export function tableStatusLabel(status: TableStatus | null): string {
  return TABLE_STATUS_LABELS[status ?? "available"] ?? String(status);
}
