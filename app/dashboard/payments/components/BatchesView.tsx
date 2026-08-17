"use client";

import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  Layers,
  DollarSign,
  Clock,
  CheckCircle2,
} from "lucide-react";
import {
  SettlementBatchRecord,
  ComputedBatch,
  PaymentRecord,
  BatchFilters,
} from "@/types/payment";
import { useSettlementBatches, useBatchPayments } from "../../hooks/useSettlementBatches";
import { usePayments } from "../../hooks/usePayments";
import { PaymentFilters } from "@/types/payment";
import { CardBrandIcon } from "./CardBrandIcon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Panel, StatRow, StatTile } from "@/components/dashboard/shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getPaymentStatusLabel,
  getPaymentStatusStyle,
} from "@/lib/constants/payment-status";

// ============================================================================
// Helpers
// ============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "pm" : "am";
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, "0");
  return `${formatDate(dateString)} ${displayHours}:${displayMinutes} ${ampm}`;
}

// Prefer the host batch_number with the acquirer prefix (e.g. "TSYS-009").
// Fall back to the legacy batch_id text label only for rows where
// batch_number was never populated.
function formatBatchLabel(
  batch: Pick<SettlementBatchRecord, "batch_number" | "acquirer" | "batch_id">
): string {
  if (batch.batch_number) {
    return batch.acquirer
      ? `${batch.acquirer}-${batch.batch_number}`
      : batch.batch_number;
  }
  return batch.batch_id;
}

/**
 * Soft-tint badges for settlement-batch status (open/closed/submitted/settled/
 * funded) — a distinct domain from `payment_status`, so it isn't covered by
 * `lib/constants/payment-status.ts`. Follows the same `{dot,text,bg}` shape
 * (DS-CTL-09).
 */
const BATCH_STATUS_STYLES: Record<
  string,
  { label: string; dot: string; text: string; bg: string }
> = {
  open: {
    label: "Open",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
  closed: {
    label: "Closed",
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  submitted: {
    label: "Submitted",
    dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/20",
  },
  settled: {
    label: "Settled",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    bg: "bg-muted/60",
  },
  funded: {
    label: "Funded",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    bg: "bg-muted/60",
  },
};

function getStatusBadge(status: string) {
  const normalized = status.toLowerCase();
  const style = BATCH_STATUS_STYLES[normalized];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        style ? style.bg : "bg-muted/60",
        style ? style.text : "text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          style ? style.dot : "bg-muted-foreground"
        )}
      />
      {style ? style.label : status}
    </span>
  );
}

// How the batch was settled — distinguishes an automatic settle from a manual one.
function getOriginBadge(origin?: string | null) {
  switch (origin) {
    case "valor_webhook":
      return (
        <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">
          Auto · Webhook
        </Badge>
      );
    case "pos_auto":
      return (
        <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">
          Auto
        </Badge>
      );
    case "hq_manual":
      return (
        <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-600">
          Manual · HQ
        </Badge>
      );
    case "pos_manual":
      return (
        <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-600">
          Manual
        </Badge>
      );
    default:
      return null;
  }
}

// ============================================================================
// Computed batches from payment data
// ============================================================================

function computeBatchesFromPayments(payments: PaymentRecord[]): ComputedBatch[] {
  const batchMap = new Map<string, PaymentRecord[]>();

  for (const p of payments) {
    const batchNum = p.batch_number || p.dejavoo_batch_number;
    if (!batchNum) continue;
    const existing = batchMap.get(batchNum) || [];
    existing.push(p);
    batchMap.set(batchNum, existing);
  }

  return Array.from(batchMap.entries())
    .map(([batchNumber, batchPayments]) => {
      let grossAmount = 0;
      let tipAmount = 0;
      let refundAmount = 0;
      let salesCount = 0;
      let refundCount = 0;
      let voidCount = 0;
      let earliest = batchPayments[0].initiated_at;
      let latest = batchPayments[0].initiated_at;

      for (const p of batchPayments) {
        const total = Number(p.total_amount) || 0;
        const tip = Number(p.tip_amount) || 0;
        const refunded = Number(p.refunded_amount) || 0;

        if (p.status === "void") {
          voidCount++;
        } else if (p.status === "refunded" || p.status === "partially_refunded") {
          refundCount++;
          refundAmount += refunded || total;
        } else {
          salesCount++;
          grossAmount += total;
        }
        tipAmount += tip;

        if (p.initiated_at < earliest) earliest = p.initiated_at;
        if (p.initiated_at > latest) latest = p.initiated_at;
      }

      return {
        batch_number: batchNumber,
        sales_count: salesCount,
        refund_count: refundCount,
        void_count: voidCount,
        gross_amount: grossAmount,
        tip_amount: tipAmount,
        refund_amount: refundAmount,
        net_amount: grossAmount - refundAmount,
        earliest_payment: earliest,
        latest_payment: latest,
        payments: batchPayments,
      };
    })
    .sort((a, b) => b.latest_payment.localeCompare(a.latest_payment));
}

// ============================================================================
// Summary Stats
// ============================================================================

function BatchSummaryStats({
  batches,
  isLoading,
}: {
  batches: { count: number; settled: number; pending: number; avgSize: number };
  isLoading: boolean;
}) {
  return (
    <Panel className="px-4 py-6 sm:px-6">
      <StatRow columns={4}>
        <StatTile
          icon={<Layers />}
          label="Total Batches"
          value={batches.count}
          isLoading={isLoading}
        />
        <StatTile
          icon={<CheckCircle2 />}
          label="Settled Amount"
          value={formatCurrency(batches.settled)}
          isLoading={isLoading}
        />
        <StatTile
          icon={<Clock />}
          label="Pending"
          value={formatCurrency(batches.pending)}
          isLoading={isLoading}
        />
        <StatTile
          icon={<DollarSign />}
          label="Avg Batch Size"
          value={formatCurrency(batches.avgSize)}
          isLoading={isLoading}
        />
      </StatRow>
    </Panel>
  );
}

// ============================================================================
// DB Batch Card (rich data from settlement_batches)
// ============================================================================

function DbBatchCard({ batch }: { batch: SettlementBatchRecord }) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: batchPayments, isLoading: paymentsLoading } = useBatchPayments(
    batch.id,
    isOpen
  );

  const totalFees = batch.interchange_fees + batch.assessment_fees + batch.processor_fees;

  // Prefer counts/tips computed from the actual loaded payments — the batch
  // row's *_count and tip_amount columns are often 0 when the close-webhook
  // didn't populate them. Fall back to the row values until payments load.
  const derivedCounts = useMemo(() => {
    if (!batchPayments || batchPayments.length === 0) {
      return {
        salesCount: batch.sales_count,
        refundCount: batch.refund_count,
        voidCount: batch.void_count,
        tipAmount: batch.tip_amount,
      };
    }
    let salesCount = 0;
    let refundCount = 0;
    let voidCount = 0;
    let tipAmount = 0;
    for (const p of batchPayments) {
      const tip = Number(p.tip_amount) || 0;
      tipAmount += tip;
      if (p.status === "void") {
        voidCount++;
      } else if (p.status === "refunded" || p.status === "partially_refunded") {
        refundCount++;
      } else {
        salesCount++;
      }
    }
    return { salesCount, refundCount, voidCount, tipAmount };
  }, [batchPayments, batch.sales_count, batch.refund_count, batch.void_count, batch.tip_amount]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Panel nested className="p-4">
          {/* Header row */}
          <CollapsibleTrigger asChild>
            <button className="w-full text-left cursor-pointer">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-sm">
                        Batch {formatBatchLabel(batch)}
                      </span>
                      {getStatusBadge(batch.status)}
                      {getOriginBadge(batch.origin)}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                      <span>{formatDate(batch.business_date)}</span>
                      {(batch.payment_terminals?.terminal_name ||
                        batch.payment_terminals?.serial_number ||
                        batch.terminal_id) && (
                        <span>
                          Terminal:{" "}
                          {batch.payment_terminals?.terminal_name ?? "—"}
                          {(batch.payment_terminals?.serial_number ||
                            batch.terminal_id) && (
                            <span className="font-mono ml-1">
                              (S/N{" "}
                              {batch.payment_terminals?.serial_number ??
                                batch.terminal_id}
                              )
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Financial summary */}
                <div className="flex flex-shrink-0 flex-wrap items-center gap-x-6 gap-y-1 pl-7 text-sm text-foreground sm:pl-0">
                  <div className="flex items-center gap-1">
                    <ArrowDownLeft className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{formatCurrency(batch.gross_amount)}</span>
                  </div>
                  {batch.refund_amount > 0 && (
                    <div className="flex items-center gap-1">
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{formatCurrency(batch.refund_amount)}</span>
                    </div>
                  )}
                  <div className="font-semibold">
                    {formatCurrency(batch.net_deposit)}
                  </div>
                </div>
              </div>
            </button>
          </CollapsibleTrigger>

          {/* Expanded content */}
          <CollapsibleContent>
            <div className="mt-4 border-t pt-4 space-y-4">
              {/* Counts & Fees */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 text-xs">
                <div>
                  <p className="text-muted-foreground">Transactions</p>
                  <p className="font-medium">
                    {derivedCounts.salesCount} sales, {derivedCounts.refundCount} refunds, {derivedCounts.voidCount} voids
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tips</p>
                  <p className="font-medium">{formatCurrency(derivedCounts.tipAmount)}</p>
                </div>
                {totalFees > 0 && (
                  <div>
                    <p className="text-muted-foreground">Fees</p>
                    <p className="font-medium">
                      {formatCurrency(totalFees)}
                      <span className="text-muted-foreground ml-1">
                        (IC: {formatCurrency(batch.interchange_fees)}, AS: {formatCurrency(batch.assessment_fees)}, PR: {formatCurrency(batch.processor_fees)})
                      </span>
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Net Deposit</p>
                  <p className="font-bold text-base">{formatCurrency(batch.net_deposit)}</p>
                </div>
              </div>

              {/* Timeline */}
              <div className="flex flex-wrap gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Opened:</span>{" "}
                  <span>{formatDateTime(batch.opened_at)}</span>
                </div>
                {batch.closed_at && (
                  <div>
                    <span className="text-muted-foreground">Closed:</span>{" "}
                    <span>{formatDateTime(batch.closed_at)}</span>
                  </div>
                )}
                {batch.settlement_date && (
                  <div>
                    <span className="text-muted-foreground">Settled:</span>{" "}
                    <span>{formatDate(batch.settlement_date)}</span>
                  </div>
                )}
                {batch.funded_date && (
                  <div>
                    <span className="text-muted-foreground">Funded:</span>{" "}
                    <span>{formatDate(batch.funded_date)}</span>
                  </div>
                )}
              </div>

              {/* Mini payments table */}
              <BatchPaymentsTable
                payments={batchPayments || []}
                isLoading={paymentsLoading}
              />
            </div>
          </CollapsibleContent>
      </Panel>
    </Collapsible>
  );
}

// ============================================================================
// Computed Batch Card (grouped from payment data)
// ============================================================================

function ComputedBatchCard({ batch }: { batch: ComputedBatch }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Panel nested className="p-4">
          <CollapsibleTrigger asChild>
            <button className="w-full text-left cursor-pointer">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <span className="font-mono font-semibold text-sm">
                      Batch {batch.batch_number}
                    </span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                      <span>{formatDate(batch.earliest_payment)}</span>
                      {batch.earliest_payment !== batch.latest_payment && (
                        <span>to {formatDate(batch.latest_payment)}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-shrink-0 flex-wrap items-center gap-x-6 gap-y-1 pl-7 text-sm text-foreground sm:pl-0">
                  <div className="flex items-center gap-1">
                    <ArrowDownLeft className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{formatCurrency(batch.gross_amount)}</span>
                  </div>
                  {batch.refund_amount > 0 && (
                    <div className="flex items-center gap-1">
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{formatCurrency(batch.refund_amount)}</span>
                    </div>
                  )}
                  <div className="font-semibold">{formatCurrency(batch.net_amount)}</div>
                </div>
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="mt-4 border-t pt-4 space-y-4">
              <div className="text-xs text-muted-foreground">
                {batch.sales_count} sales, {batch.refund_count} refunds, {batch.void_count} voids
                {batch.tip_amount > 0 && ` | Tips: ${formatCurrency(batch.tip_amount)}`}
              </div>

              <BatchPaymentsTable
                payments={batch.payments}
                isLoading={false}
              />
            </div>
          </CollapsibleContent>
      </Panel>
    </Collapsible>
  );
}

// ============================================================================
// Mini payments table for batch drill-down
// ============================================================================

function BatchPaymentsTable({
  payments,
  isLoading,
}: {
  payments: PaymentRecord[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!payments.length) {
    return (
      <p className="text-xs text-muted-foreground py-2">No payments in this batch.</p>
    );
  }

  return (
    <Table variant="data" className="min-w-[480px] text-xs">
      <TableHeader className="[&_tr]:border-0">
        <TableRow className="border-0 hover:bg-transparent">
          <TableHead className="text-xs font-medium text-muted-foreground">Order #</TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground">Method</TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground">Card</TableHead>
          <TableHead className="text-right text-xs font-medium text-muted-foreground">Amount</TableHead>
          <TableHead className="text-right text-xs font-medium text-muted-foreground">Tip</TableHead>
          <TableHead className="text-right text-xs font-medium text-muted-foreground">Total</TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => (
          <TableRow key={p.id} className="border-0 bg-card/70 hover:bg-muted/40">
            <TableCell className="font-mono text-xs">
              {p.orders?.order_number || p.orders?.display_number || "—"}
            </TableCell>
            <TableCell className="text-xs">{getMethodLabel(p.payment_method)}</TableCell>
            <TableCell className="text-xs">
              {p.card_last_four ? (
                <div className="flex items-center gap-1">
                  <CardBrandIcon brand={p.card_type} className="h-4 w-auto" />
                  <span className="font-mono">****{p.card_last_four}</span>
                </div>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="text-right font-mono text-xs">{formatCurrency(p.amount)}</TableCell>
            <TableCell className="text-right font-mono text-xs text-muted-foreground">
              {p.tip_amount ? formatCurrency(p.tip_amount) : "—"}
            </TableCell>
            <TableCell className="text-right font-mono text-xs font-semibold">
              {formatCurrency(p.total_amount)}
            </TableCell>
            <TableCell className="text-xs">
              <StatusBadgeMini status={p.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StatusBadgeMini({ status }: { status: string }) {
  const style = getPaymentStatusStyle(status);
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium",
        style.bg,
        style.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} />
      {getPaymentStatusLabel(status)}
    </span>
  );
}

function getMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: "Cash",
    card: "Card",
    card_spinapi: "Card",
    card_dvpaylite: "Card",
    card_manual: "Manual",
    gift_card: "Gift Card",
    house_account: "House Acct",
    external: "External",
  };
  return labels[method] || method;
}

// ============================================================================
// BatchesView — Main exported component
// ============================================================================

interface BatchesViewProps {
  paymentFilters: PaymentFilters;
}

export function BatchesView({ paymentFilters }: BatchesViewProps) {
  const batchFilters: BatchFilters = useMemo(
    () => ({ dateRange: paymentFilters.dateRange }),
    [paymentFilters.dateRange]
  );

  const {
    data: dbBatches,
    isLoading: dbLoading,
  } = useSettlementBatches(batchFilters);

  const {
    data: payments,
    isLoading: paymentsLoading,
  } = usePayments(paymentFilters);

  const hasDbBatches = !!dbBatches && dbBatches.length > 0;
  const isLoading = dbLoading || paymentsLoading;

  const computedBatches = useMemo(() => {
    if (hasDbBatches) return [];
    return computeBatchesFromPayments(payments || []);
  }, [hasDbBatches, payments]);

  const batches = hasDbBatches ? dbBatches! : computedBatches;
  const hasBatches = batches.length > 0;

  // Summary stats
  const summaryStats = useMemo(() => {
    if (hasDbBatches) {
      const settled = dbBatches!.filter((b) => b.status === "settled" || b.status === "funded");
      const pending = dbBatches!.filter((b) => b.status !== "settled" && b.status !== "funded");
      const settledAmt = settled.reduce((sum, b) => sum + b.net_deposit, 0);
      const pendingAmt = pending.reduce((sum, b) => sum + b.gross_amount, 0);
      const avgSize = dbBatches!.length > 0
        ? dbBatches!.reduce((sum, b) => sum + b.gross_amount, 0) / dbBatches!.length
        : 0;
      return { count: dbBatches!.length, settled: settledAmt, pending: pendingAmt, avgSize };
    }

    const total = computedBatches.reduce((sum, b) => sum + b.gross_amount, 0);
    const avg = computedBatches.length > 0 ? total / computedBatches.length : 0;
    return { count: computedBatches.length, settled: total, pending: 0, avgSize: avg };
  }, [hasDbBatches, dbBatches, computedBatches]);

  return (
    <div className="space-y-4">
      <BatchSummaryStats batches={summaryStats} isLoading={isLoading} />

      {isLoading && !hasBatches ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : !hasBatches ? (
        <Panel className="py-12">
          <Empty
            icon={Layers}
            title="No batches found"
            description="No settlement batches found for the selected date range. Batches appear when card payments are processed through your terminal."
          />
        </Panel>
      ) : (
        <div className="space-y-3">
          {hasDbBatches
            ? dbBatches!.map((batch) => (
                <DbBatchCard key={batch.id} batch={batch} />
              ))
            : computedBatches.map((batch) => (
                <ComputedBatchCard key={batch.batch_number} batch={batch} />
              ))}
        </div>
      )}
    </div>
  );
}
