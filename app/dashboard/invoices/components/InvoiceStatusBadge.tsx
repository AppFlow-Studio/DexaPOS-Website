"use client";

import { getInvoiceStatusLabel } from "@/lib/constants/invoice-status";
import type { InvoiceStatus } from "@/app/dashboard/actions/invoices";
import { StatusBadge } from "@/components/ui/status-badge";

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
}

/**
 * One pill for every invoice status, rendered through the shared
 * StatusBadge so a paid invoice reads green like every other paid
 * surface in the dashboard.
 */
export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  return (
    <StatusBadge status={status} label={getInvoiceStatusLabel(status)} />
  );
}
