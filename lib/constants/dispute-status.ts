/**
 * Single source of truth for TSYS dispute (chargeback) status presentation.
 *
 * Mirrors the shape of `PAYMENT_STATUS_STYLES` in `payment-status.ts` — a dot,
 * a text colour and a tint — so every status badge in the product reads as one
 * system. Also covers the deadline-urgency badges ("Overdue", "Xd left") and
 * the neutral "source unknown" badge on the disputes page, which previously
 * inlined their own saturated Tailwind chains.
 */

export interface BadgeStyle {
  dot: string;
  text: string;
  bg: string;
}

export type DisputeStatus =
  | "notified"
  | "under_review"
  | "defended"
  | "won"
  | "lost"
  | "expired";

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  notified: "Notified",
  under_review: "Under Review",
  defended: "Defended",
  won: "Won",
  lost: "Lost",
  expired: "Expired",
};

export const DISPUTE_STATUS_STYLES: Record<DisputeStatus, BadgeStyle> = {
  notified: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
  under_review: {
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  defended: {
    dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/20",
  },
  won: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  lost: {
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-900/20",
  },
  expired: {
    dot: "bg-gray-400",
    text: "text-gray-600 dark:text-gray-400",
    bg: "bg-gray-50 dark:bg-gray-800/30",
  },
};

const FALLBACK_STYLE: BadgeStyle = {
  dot: "bg-gray-400",
  text: "text-gray-600 dark:text-gray-400",
  bg: "bg-gray-50 dark:bg-gray-800/30",
};

/** Label for a dispute status, with a humanized fallback for unknown values. */
export function getDisputeStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const key = status.toLowerCase() as DisputeStatus;
  return (
    DISPUTE_STATUS_LABELS[key] ??
    status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")
  );
}

/** Badge style for a dispute status, with a neutral fallback for unknown values. */
export function getDisputeStatusStyle(status: string | null | undefined): BadgeStyle {
  if (!status) return FALLBACK_STYLE;
  const key = status.toLowerCase() as DisputeStatus;
  return DISPUTE_STATUS_STYLES[key] ?? FALLBACK_STYLE;
}

/**
 * Deadline-urgency styles — distinct from `DisputeStatus` because these
 * describe time pressure, not the dispute's lifecycle state.
 */
export type DeadlineUrgency = "overdue" | "urgent" | "neutral";

export const DEADLINE_URGENCY_STYLES: Record<DeadlineUrgency, BadgeStyle> = {
  overdue: DISPUTE_STATUS_STYLES.lost,
  urgent: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
  neutral: FALLBACK_STYLE,
};

/** Neutral "source unknown" / no-linked-record badge style, shared across the page. */
export const UNKNOWN_SOURCE_STYLE: BadgeStyle = FALLBACK_STYLE;
