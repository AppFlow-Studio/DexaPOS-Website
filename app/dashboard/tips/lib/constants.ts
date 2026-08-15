import type { BadgeStyle } from "@/lib/constants/table-status";

/**
 * Session status badge styles, in the `{dot,text,bg}` shape used by
 * `table-status.ts` / `menu-item-badges.ts` (DS-CTL-09, D-11).
 *
 * ⚠️ Tailwind does not scan `.ts` files (C7). Every class below is also
 * written literally in `TipStatusBadge` (`components/TipStatusBadge.tsx`) so
 * the rules actually get generated. Before adding a class here, add it there.
 */
export const STATUS_STYLES: Record<string, BadgeStyle & { label: string }> = {
  draft: {
    label: "Live",
    dot: "bg-slate-400 dark:bg-slate-500",
    text: "text-slate-700 dark:text-slate-300",
    bg: "bg-slate-500/10 dark:bg-slate-400/10",
  },
  calculated: {
    label: "Calculated",
    dot: "bg-blue-500 dark:bg-blue-400",
    text: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-500/10 dark:bg-blue-400/10",
  },
  pending_approval: {
    label: "Pending Approval",
    dot: "bg-amber-500 dark:bg-amber-400",
    text: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-500/10 dark:bg-amber-400/10",
  },
  approved: {
    label: "Approved",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-500/10 dark:bg-emerald-400/10",
  },
  exported: {
    label: "Exported",
    dot: "bg-indigo-500 dark:bg-indigo-400",
    text: "text-indigo-700 dark:text-indigo-300",
    bg: "bg-indigo-500/10 dark:bg-indigo-400/10",
  },
  voided: {
    label: "Voided",
    dot: "bg-red-500 dark:bg-red-400",
    text: "text-red-700 dark:text-red-300",
    bg: "bg-red-500/10 dark:bg-red-400/10",
  },
};

export function tipStatusStyle(status: string) {
  return STATUS_STYLES[status] ?? STATUS_STYLES.draft;
}

export const SHIFT_LABELS: Record<string, string> = {
  full_day: "Full Day",
  lunch:    "Lunch",
  dinner:   "Dinner",
  custom:   "Custom",
};

export function formatMoney(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
