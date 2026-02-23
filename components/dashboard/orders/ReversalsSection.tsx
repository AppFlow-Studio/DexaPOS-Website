"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  Ban,
  RotateCcw,
  PackageX,
  ChevronDown,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ShieldAlert,
  User,
  FileText,
  CreditCard,
  Package,
  AlertTriangle,
} from "lucide-react";
import type { OrderFullHistory } from "@/types/order-full-history";

// ─── Types ───

type Reversal = OrderFullHistory["reversals"][number];
type Chargeback = OrderFullHistory["chargebacks"][number];

// ─── Helpers ───

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateOnly(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysRemaining(deadline: string): number {
  const now = new Date();
  const dl = new Date(deadline);
  const diff = dl.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─── Reversal Type Helpers ───

function reversalTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    void: "Void",
    refund: "Full Refund",
    partial_refund: "Partial Refund",
    item_return: "Item Return",
  };
  return labels[type] || type.replace(/_/g, " ");
}

function reversalTypeIcon(type: string) {
  switch (type) {
    case "void":
      return <Ban className="h-4 w-4" />;
    case "refund":
      return <RotateCcw className="h-4 w-4" />;
    case "partial_refund":
      return <RefreshCw className="h-4 w-4" />;
    case "item_return":
      return <PackageX className="h-4 w-4" />;
    default:
      return <RefreshCw className="h-4 w-4" />;
  }
}

// ─── Status Badge ───

function ReversalStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    completed: {
      label: "Completed",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    },
    processed: {
      label: "Processed",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    },
    pending: {
      label: "Pending",
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    },
    requested: {
      label: "Requested",
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    },
    failed: {
      label: "Failed",
      className:
        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
    },
    declined: {
      label: "Declined",
      className:
        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
    },
  };

  const c = config[status] ?? {
    label: status.replace(/_/g, " "),
    className: "bg-muted text-muted-foreground border-border",
  };

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] capitalize font-medium", c.className)}
    >
      {c.label}
    </Badge>
  );
}

function ChargebackStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    open: {
      label: "Open",
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    },
    under_review: {
      label: "Under Review",
      className:
        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    },
    won: {
      label: "Won",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    },
    lost: {
      label: "Lost",
      className:
        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
    },
  };

  const c = config[status] ?? {
    label: status.replace(/_/g, " "),
    className: "bg-muted text-muted-foreground border-border",
  };

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] capitalize font-medium", c.className)}
    >
      {c.label}
    </Badge>
  );
}

function reversalStatusIcon(status: string) {
  switch (status) {
    case "completed":
    case "processed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "failed":
    case "declined":
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case "pending":
    case "requested":
      return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    default:
      return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function paymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: "Cash",
    card_spinapi: "Card",
    card_dvpaylite: "Card",
    card_manual: "Card (Manual)",
    gift_card: "Gift Card",
    house_account: "House Account",
    external: "External",
  };
  return labels[method] || method.replace(/_/g, " ");
}

// ─── Reversal Card ───

function ReversalCard({ reversal }: { reversal: Reversal }) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const isCompleted = reversal.status === "completed" || reversal.status === "processed";
  const isFailed = reversal.status === "failed" || reversal.status === "declined";
  const hasItems = reversal.refund_items.length > 0;
  const hasTerminalResult = !!(reversal.result_code || reversal.response_message);

  const originalPaymentLabel = reversal.original_card_last_four
    ? `${paymentMethodLabel(reversal.original_payment_method)} ****${reversal.original_card_last_four}`
    : paymentMethodLabel(reversal.original_payment_method);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card overflow-hidden transition-colors",
        isFailed && "border-red-200 dark:border-red-800/50"
      )}
    >
      {/* Collapsed Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              isCompleted
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                : isFailed
                  ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                  : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
            )}
          >
            {reversalTypeIcon(reversal.reversal_type)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {reversalTypeLabel(reversal.reversal_type)}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {reversal.reason_description || reversal.reason_code || "No reason provided"}
              {reversal.initiated_by_name && (
                <span> &middot; {reversal.initiated_by_name}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="text-right">
            <p className="text-sm font-semibold">
              {formatCurrency(reversal.amount)}
            </p>
            <ReversalStatusBadge status={reversal.status} />
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t">
          {/* Type & Reason */}
          <div className="px-4 py-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="capitalize">{reversalTypeLabel(reversal.reversal_type)}</span>
            </div>
            {reversal.reason_code && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reason Code</span>
                <span className="font-mono capitalize">
                  {reversal.reason_code === "other" ? "Other" : reversal.reason_code}
                </span>
              </div>
            )}
            {reversal.reason_description && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">Reason</span>
                <span className="text-right">{reversal.reason_description}</span>
              </div>
            )}
          </div>

          {/* Approval Chain */}
          <div className="border-t px-4 py-3 space-y-2 text-xs">
            <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <User className="h-3 w-3" />
              Approval Chain
            </p>
            <div className="space-y-1.5 ml-1">
              {reversal.initiated_by_name && (
                <div className="flex items-start gap-2">
                  <div className="relative z-10 mt-0.5 shrink-0">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">
                      <span className="font-medium">{reversal.initiated_by_name}</span>
                      <span className="text-muted-foreground"> initiated</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(reversal.requested_at)}
                    </p>
                  </div>
                </div>
              )}
              {reversal.approved_by_name && (
                <div className="flex items-start gap-2">
                  <div className="relative z-10 mt-0.5 shrink-0">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">
                      <span className="font-medium">{reversal.approved_by_name}</span>
                      <span className="text-muted-foreground"> approved</span>
                    </p>
                  </div>
                </div>
              )}
              {reversal.completed_at && (
                <div className="flex items-start gap-2">
                  <div className="relative z-10 mt-0.5 shrink-0">
                    {reversalStatusIcon(reversal.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">
                      <span className="font-medium capitalize">{reversal.status}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(reversal.completed_at)}
                    </p>
                  </div>
                </div>
              )}
              {!reversal.initiated_by_name && !reversal.approved_by_name && (
                <p className="text-xs text-muted-foreground italic">
                  No approval chain recorded
                </p>
              )}
            </div>
          </div>

          {/* Reference & Original Payment */}
          <div className="border-t px-4 py-3 space-y-1.5 text-xs">
            {reversal.reversal_reference_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reversal Ref</span>
                <span className="font-mono">{reversal.reversal_reference_id}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Original Payment</span>
              <span className="flex items-center gap-1">
                <CreditCard className="h-3 w-3 text-muted-foreground" />
                {originalPaymentLabel}
              </span>
            </div>
          </div>

          {/* Terminal Response */}
          {hasTerminalResult && (
            <div
              className={cn(
                "border-t px-4 py-3 space-y-1.5 text-xs",
                isFailed && "bg-red-50/50 dark:bg-red-950/10"
              )}
            >
              <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3 w-3" />
                Terminal Response
              </p>
              {reversal.result_code && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Result Code</span>
                  <span
                    className={cn(
                      "font-mono",
                      reversal.result_code === "0000" || reversal.result_code === "00"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : isFailed
                          ? "text-red-600 dark:text-red-400"
                          : ""
                    )}
                  >
                    {reversal.result_code}
                  </span>
                </div>
              )}
              {reversal.response_message && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground shrink-0">Message</span>
                  <span
                    className={cn(
                      "text-right",
                      isFailed && "text-red-600 dark:text-red-400"
                    )}
                  >
                    {reversal.response_message}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Refunded Items */}
          {hasItems && (
            <div className="border-t px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Package className="h-3 w-3" />
                Refunded Items
              </p>
              <div className="space-y-2">
                {reversal.refund_items.map((ri, i) => {
                  const amount = Number(ri.amount) || 0;
                  const taxAmt = Number(ri.tax_refunded) || 0;
                  const lineTotal = amount + taxAmt;
                  const itemName = ri.item_name ?? "Item";

                  return (
                    <div
                      key={i}
                      className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">
                          {ri.quantity_refunded}x {itemName}
                        </span>
                        <span className="font-medium">
                          {formatCurrency(lineTotal)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>Subtotal: {formatCurrency(amount)}</span>
                        {taxAmt > 0 && (
                          <>
                            <span>&middot;</span>
                            <span>Tax: {formatCurrency(taxAmt)}</span>
                          </>
                        )}
                      </div>
                      {ri.reason && (
                        <p className="text-[11px] text-muted-foreground">
                          Reason: {ri.reason}
                        </p>
                      )}
                      <div className="flex items-center gap-1 text-[11px]">
                        <span className="text-muted-foreground">Returned to inventory:</span>
                        {ri.returned_to_inventory ? (
                          <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                            Yes <CheckCircle2 className="h-3 w-3" />
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Chargeback Card ───

function ChargebackCard({ chargeback }: { chargeback: Chargeback }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const isResolved = chargeback.status === "won" || chargeback.status === "lost";
  const days = chargeback.defense_deadline ? daysRemaining(chargeback.defense_deadline) : null;
  const deadlineUrgent = days != null && days <= 7 && days > 0;
  const deadlinePassed = days != null && days <= 0;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card overflow-hidden transition-colors",
        !isResolved && "border-amber-200 dark:border-amber-800/50"
      )}
    >
      {/* Collapsed Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              chargeback.status === "won"
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                : chargeback.status === "lost"
                  ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                  : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
            )}
          >
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">Chargeback</p>
            <p className="text-xs text-muted-foreground truncate">
              {chargeback.reason_description || chargeback.reason_code}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="text-right">
            <p className="text-sm font-semibold">{formatCurrency(chargeback.amount)}</p>
            <ChargebackStatusBadge status={chargeback.status} />
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t px-4 py-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Reason Code</span>
            <span className="font-mono">{chargeback.reason_code}</span>
          </div>
          {chargeback.reason_description && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground shrink-0">Reason</span>
              <span className="text-right">{chargeback.reason_description}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Received</span>
            <span>{formatDateOnly(chargeback.received_at)}</span>
          </div>
          {chargeback.defense_deadline && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Defense Deadline</span>
              <span
                className={cn(
                  deadlinePassed && "text-red-600 dark:text-red-400 font-medium",
                  deadlineUrgent && !deadlinePassed && "text-amber-600 dark:text-amber-400 font-medium"
                )}
              >
                {formatDateOnly(chargeback.defense_deadline)}
                {days != null && !deadlinePassed && (
                  <span className="ml-1">({days} day{days !== 1 ? "s" : ""} remaining)</span>
                )}
                {deadlinePassed && (
                  <span className="ml-1">(deadline passed)</span>
                )}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="capitalize">{chargeback.status.replace(/_/g, " ")}</span>
          </div>
          {chargeback.resolution && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground shrink-0">Resolution</span>
              <span className="text-right capitalize">{chargeback.resolution}</span>
            </div>
          )}
          {chargeback.resolved_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Resolved</span>
              <span>{formatDate(chargeback.resolved_at)}</span>
            </div>
          )}

          {/* Urgent deadline warning */}
          {deadlineUrgent && !deadlinePassed && (
            <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs text-amber-700 dark:text-amber-400">
                Defense deadline in {days} day{days !== 1 ? "s" : ""} — action required
              </span>
            </div>
          )}
          {deadlinePassed && !isResolved && (
            <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
              <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />
              <span className="text-xs text-red-700 dark:text-red-400">
                Defense deadline has passed
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Reversals List (no wrapper, used by both sheet and page) ───

export function ReversalsList({
  reversals,
  chargebacks,
  isLoading,
}: {
  reversals: Reversal[] | null;
  chargebacks: Chargeback[] | null;
  isLoading: boolean;
}) {
  const reversalCount = reversals?.length ?? 0;
  const chargebackCount = chargebacks?.length ?? 0;
  const totalCount = reversalCount + chargebackCount;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No refunds, reversals, or chargebacks recorded.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Reversals */}
      {reversalCount > 0 && (
        <div className="space-y-2">
          {reversals!.map((r) => (
            <ReversalCard key={r.id} reversal={r} />
          ))}
        </div>
      )}

      {/* Chargebacks */}
      {chargebackCount > 0 && (
        <div className="space-y-2">
          {reversalCount > 0 && (
            <div className="flex items-center gap-2 pt-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Chargebacks
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}
          {chargebacks!.map((c) => (
            <ChargebackCard key={c.id} chargeback={c} />
          ))}
        </div>
      )}
    </div>
  );
}
