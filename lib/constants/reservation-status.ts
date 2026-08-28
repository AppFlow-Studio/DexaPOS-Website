import type { Reservation } from "@/types/floor-plan";

/**
 * Single source of truth for reservation-status presentation (D-11).
 *
 * Same shape as `TABLE_STATUS_STYLES` and `PAYMENT_STATUS_STYLES` — a dot, a
 * text colour and a soft tint — so a reservation badge reads as the same system
 * as every other status badge in the product. Replaces the per-card
 * `STATUS_COLORS` / `STATUS_ACCENTS` pair the reservation card used to carry,
 * whose bordered fills and gradient top-rules competed with the panel edges
 * around them.
 */

export type ReservationStatus = Reservation["status"];

export interface BadgeStyle {
  dot: string;
  text: string;
  bg: string;
}

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  reminded: "Reminded",
  arrived: "Arrived",
  seated: "Seated",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-Show",
};

export const RESERVATION_STATUS_STYLES: Record<ReservationStatus, BadgeStyle> = {
  pending: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
  confirmed: {
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  reminded: {
    dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/20",
  },
  arrived: {
    dot: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-900/20",
  },
  seated: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  // `bg-muted/60` rather than a slate pair: `dark:bg-slate-800/40` is spelled
  // in no `.tsx`, so Tailwind never generates a rule for it and the dark-mode
  // fill silently vanishes (C7). The muted token is theme-aware by definition.
  completed: {
    dot: "bg-slate-500",
    text: "text-muted-foreground",
    bg: "bg-muted/60",
  },
  cancelled: {
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
  },
  no_show: {
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
  },
};

export function reservationStatusStyle(
  status: ReservationStatus | null,
): BadgeStyle {
  return (
    RESERVATION_STATUS_STYLES[status ?? "pending"] ??
    RESERVATION_STATUS_STYLES.pending
  );
}

export function reservationStatusLabel(
  status: ReservationStatus | null,
): string {
  return RESERVATION_STATUS_LABELS[status ?? "pending"] ?? String(status);
}
