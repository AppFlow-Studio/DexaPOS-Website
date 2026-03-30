"use client";

import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/app/dashboard/actions/invoices";

const CONFIG: Record<
  InvoiceStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  draft: { label: "Draft", variant: "secondary" },
  sent: { label: "Sent", variant: "default" },
  viewed: { label: "Viewed", variant: "outline" },
  paid: { label: "Paid", variant: "default" },
  overdue: { label: "Overdue", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

const COLOR_CLASSES: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200",
  viewed: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200",
  paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200",
  cancelled: "bg-muted text-muted-foreground line-through",
};

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
}

export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const config = CONFIG[status] ?? CONFIG.draft;
  return (
    <Badge variant={config.variant} className={COLOR_CLASSES[status]}>
      {config.label}
    </Badge>
  );
}
