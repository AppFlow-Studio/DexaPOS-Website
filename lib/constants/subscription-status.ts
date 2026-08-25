/**
 * Single source of truth for merchant subscription-plan and invoice-status
 * presentation. Mirrors the shape of `PAYMENT_STATUS_STYLES` in
 * `payment-status.ts` — a dot, a text colour and a tint — so every status
 * badge in the product reads as one system. Replaces the raw
 * `bg-[#0C4FD1] text-white` / `border-amber-200 bg-amber-100` pairs
 * `MerchantSubscriptionOverviewCard` previously hardcoded per call site.
 */

export interface BadgeStyle {
  dot: string;
  text: string;
  bg: string;
}

export type SubscriptionStatus = "active" | "past_due" | "suspended" | "cancelled";

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: "Active",
  past_due: "Past Due",
  suspended: "Suspended",
  cancelled: "Cancelled",
};

export const SUBSCRIPTION_STATUS_STYLES: Record<SubscriptionStatus, BadgeStyle> = {
  active: {
    dot: "bg-[#0C4FD1] dark:bg-[#6CA0FF]",
    text: "text-[#0C4FD1] dark:text-[#6CA0FF]",
    bg: "bg-[#0C4FD1]/10 dark:bg-[#6CA0FF]/10",
  },
  past_due: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
  suspended: {
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
  },
  cancelled: {
    dot: "bg-slate-400",
    text: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-100 dark:bg-slate-800/40",
  },
};

export function subscriptionStatusStyle(status: string | null | undefined): BadgeStyle {
  return SUBSCRIPTION_STATUS_STYLES[(status as SubscriptionStatus) ?? "cancelled"] ?? SUBSCRIPTION_STATUS_STYLES.cancelled;
}

export function subscriptionStatusLabel(status: string | null | undefined): string {
  if (!status) return "Inactive";
  return SUBSCRIPTION_STATUS_LABELS[status as SubscriptionStatus] ?? status.replace(/_/g, " ");
}

export type InvoiceStatus = "open" | "processing" | "paid" | "failed" | "refunded" | "voided";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  open: "Open",
  processing: "Processing",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  voided: "Voided",
};

export const INVOICE_STATUS_STYLES: Record<InvoiceStatus, BadgeStyle> = {
  paid: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  open: {
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  processing: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
  failed: {
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
  },
  refunded: {
    dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/20",
  },
  voided: {
    dot: "bg-slate-400",
    text: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-100 dark:bg-slate-800/40",
  },
};

export function invoiceStatusStyle(status: string | null | undefined): BadgeStyle {
  return INVOICE_STATUS_STYLES[(status as InvoiceStatus) ?? "open"] ?? INVOICE_STATUS_STYLES.open;
}

export function invoiceStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return INVOICE_STATUS_LABELS[status as InvoiceStatus] ?? status.replace(/_/g, " ");
}
