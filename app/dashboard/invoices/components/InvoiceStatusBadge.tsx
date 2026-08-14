"use client";

import { cn } from "@/lib/utils";
import {
  getInvoiceStatusLabel,
  getInvoiceStatusStyle,
} from "@/lib/constants/invoice-status";
import type { InvoiceStatus } from "@/app/dashboard/actions/invoices";

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
}

export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const style = getInvoiceStatusStyle(status);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        style.bg,
        style.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} />
      {getInvoiceStatusLabel(status)}
    </span>
  );
}
