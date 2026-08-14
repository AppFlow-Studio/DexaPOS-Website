import type { InvoiceStatus } from "@/app/dashboard/actions/invoices";

/**
 * Single source of truth for `invoice.status` badge presentation (DS-CTL-09).
 *
 * Covers every `InvoiceStatus` value so a badge can never hit an unmapped
 * status and leak a raw enum string to the UI.
 */

/** Human-readable labels for each invoice status. */
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
  payment_failed: "Payment Failed",
};

interface BadgeStyle {
  dot: string;
  text: string;
  bg: string;
}

/** Color palette for invoice-status badges — soft tint + dot (D-11). */
export const INVOICE_STATUS_STYLES: Record<InvoiceStatus, BadgeStyle> = {
  draft: {
    dot: "bg-gray-400",
    text: "text-gray-600 dark:text-gray-400",
    bg: "bg-gray-50 dark:bg-gray-800/30",
  },
  sent: {
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  viewed: {
    dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/20",
  },
  paid: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  overdue: {
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-900/20",
  },
  cancelled: {
    dot: "bg-gray-400",
    text: "text-gray-600 dark:text-gray-400 line-through",
    bg: "bg-gray-50 dark:bg-gray-800/30",
  },
  payment_failed: {
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-900/20",
  },
};

const FALLBACK_STYLE: BadgeStyle = {
  dot: "bg-gray-400",
  text: "text-gray-600 dark:text-gray-400",
  bg: "bg-gray-50 dark:bg-gray-800/30",
};

/** Label for an invoice status, with a humanized fallback for unknown values. */
export function getInvoiceStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return (
    INVOICE_STATUS_LABELS[status as InvoiceStatus] ??
    status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")
  );
}

/** Badge style for an invoice status, with a neutral fallback for unknown values. */
export function getInvoiceStatusStyle(status: string | null | undefined): BadgeStyle {
  if (!status) return FALLBACK_STYLE;
  return INVOICE_STATUS_STYLES[status as InvoiceStatus] ?? FALLBACK_STYLE;
}
