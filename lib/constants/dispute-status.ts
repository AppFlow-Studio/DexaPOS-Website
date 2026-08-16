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

/**
 * Status is never colour-coded (UI-DESIGN-SYSTEM §4.6b / D-12): every dispute
 * status renders as the same neutral pill and the *word* carries the meaning.
 *
 * The `{dot,text,bg}` shape is kept so consumers keep compiling, but every
 * status now resolves to the same neutral triple. These classes are generated
 * only because they are also written literally in a `.tsx` — Tailwind does not
 * scan `.ts` files (C7).
 */
const NEUTRAL_STYLE: BadgeStyle = {
  dot: "bg-muted-foreground/60",
  text: "text-muted-foreground",
  bg: "bg-muted/60",
};

export const DISPUTE_STATUS_STYLES: Record<DisputeStatus, BadgeStyle> = {
  notified: NEUTRAL_STYLE,
  under_review: NEUTRAL_STYLE,
  defended: NEUTRAL_STYLE,
  won: NEUTRAL_STYLE,
  lost: NEUTRAL_STYLE,
  expired: NEUTRAL_STYLE,
};

const FALLBACK_STYLE: BadgeStyle = NEUTRAL_STYLE;

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
  overdue: NEUTRAL_STYLE,
  urgent: NEUTRAL_STYLE,
  neutral: NEUTRAL_STYLE,
};

/** Neutral "source unknown" / no-linked-record badge style, shared across the page. */
export const UNKNOWN_SOURCE_STYLE: BadgeStyle = FALLBACK_STYLE;
