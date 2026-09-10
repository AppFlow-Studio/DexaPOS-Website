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

/**
 * Statuses a "Sent" filter must include.
 *
 * `sent` alone is wrong: an invoice flips to `viewed` the moment the customer
 * opens it, and to `payment_failed` on a declined charge. Both are still sent
 * invoices awaiting payment, so filtering on the literal column value made the
 * tab under-report and look stuck.
 */
export const SENT_FILTER_STATUSES: readonly InvoiceStatus[] = [
  "sent",
  "viewed",
  "payment_failed",
];

/**
 * Statuses that can possibly be overdue — the coarse filter a query can push
 * down to the database before the date test runs client-side.
 *
 * Mirrors `status NOT IN ('paid','cancelled','draft')` from
 * `get_invoice_kpis` (migration 20260615120002).
 */
export const OVERDUE_CANDIDATE_STATUSES: readonly InvoiceStatus[] = [
  "sent",
  "viewed",
  "overdue",
  "payment_failed",
];

/** The columns `isOverdue` needs. Kept narrow so any caller can satisfy it. */
export interface OverdueInput {
  status: InvoiceStatus;
  payment_due_type: string;
  due_date: string | null;
  sent_at?: string | null;
  created_at: string;
  total_amount: number;
  amount_paid?: number | null;
}

/**
 * When an invoice is actually due.
 *
 * Ports the `effective_due` CASE from `get_invoice_kpis`: net terms count
 * from when the invoice was sent (falling back to creation), and only
 * `custom` uses the explicit `due_date` column.
 */
export function effectiveDueDate(invoice: OverdueInput): Date | null {
  const anchor = invoice.sent_at ?? invoice.created_at;
  const base = new Date(anchor);
  if (Number.isNaN(base.getTime())) return null;

  const addDays = (days: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
  };

  switch (invoice.payment_due_type) {
    case "upon_receipt":
      return base;
    case "net_15":
      return addDays(15);
    case "net_30":
      return addDays(30);
    case "net_60":
      return addDays(60);
    case "custom": {
      if (!invoice.due_date) return null;
      const due = new Date(invoice.due_date);
      return Number.isNaN(due.getTime()) ? null : due;
    }
    default:
      return null;
  }
}

/**
 * Whether an invoice is overdue.
 *
 * Overdue is DERIVED, never stored — nothing in the system ever writes
 * `status = 'overdue'` (see migration 20260614120000). It means: not settled,
 * still owing a balance, and past its effective due date. This is the single
 * client-side counterpart to the SQL in `get_invoice_kpis`; keep the two in
 * lockstep.
 */
export function isOverdue(invoice: OverdueInput, now: Date = new Date()): boolean {
  if (!OVERDUE_CANDIDATE_STATUSES.includes(invoice.status)) return false;

  const balance = Number(invoice.total_amount) - Number(invoice.amount_paid ?? 0);
  if (!(balance > 0)) return false;

  const due = effectiveDueDate(invoice);
  return due !== null && due.getTime() < now.getTime();
}

