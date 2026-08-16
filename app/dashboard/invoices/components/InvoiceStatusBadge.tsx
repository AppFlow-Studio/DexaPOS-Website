"use client";

import { getInvoiceStatusLabel } from "@/lib/constants/invoice-status";
import type { InvoiceStatus } from "@/app/dashboard/actions/invoices";

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
}

/**
 * One neutral pill for every invoice status (D-12).
 *
 * Status is not colour-coded: the word carries the meaning. The old
 * soft-tint-plus-dot palette (D-11) put five hues in a single table column,
 * which made the amounts — the figures a merchant actually scans — the least
 * prominent thing on the row. The colour triples still live in
 * `lib/constants/invoice-status.ts` because `subscription-status.ts` imports
 * them; retiring those is tracked in the design doc's §11 backlog.
 */
export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground">
      {getInvoiceStatusLabel(status)}
    </span>
  );
}
