// Invoice lifecycle — single source of truth for status values, allowed
// transitions, and display labels. The DB status CHECK is lowercase
// (draft/sent/viewed/paid/overdue/cancelled/payment_failed); keep this in lockstep
// with migration 20260612100000_invoices_lifecycle_tokens.sql.

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "paid",
  "overdue",
  "cancelled",
  "payment_failed",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
  payment_failed: "Payment Failed",
};

/**
 * Allowed forward transitions. Encodes draft→sent→viewed→paid plus the
 * off-ramps (overdue, payment_failed, cancelled). `paid` and `cancelled` are
 * terminal. Used by actions and UI instead of ad-hoc string checks.
 */
const TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["viewed", "paid", "overdue", "payment_failed", "cancelled"],
  viewed: ["paid", "overdue", "payment_failed", "cancelled"],
  overdue: ["paid", "payment_failed", "cancelled"],
  payment_failed: ["paid", "overdue", "cancelled"],
  paid: [],
  cancelled: [],
};

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Outstanding = a real payable awaiting payment (drives Outstanding KPIs). */
export function isOutstanding(status: InvoiceStatus): boolean {
  return status === "sent" || status === "viewed" || status === "overdue";
}

/** Whether the invoice can still be sent/resent over email/SMS. */
export function isSendable(status: InvoiceStatus): boolean {
  return status !== "paid" && status !== "cancelled";
}
