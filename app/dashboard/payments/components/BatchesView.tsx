"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

function getStatusBadge(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "open") {
    return (
      <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800">
        Open
      </Badge>
    );
  }
  if (normalized === "closed") {
    return (
      <Badge variant="outline" className="border-blue-300 bg-blue-100 text-blue-800">
        Closed
      </Badge>
    );
  }
  if (normalized === "submitted") {
    return (
      <Badge variant="outline" className="border-purple-300 bg-purple-100 text-purple-800">
        Submitted
      </Badge>
    );
  }
  if (normalized === "settled") {
    return (
      <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-800">
        Settled
      </Badge>
    );
  }
  if (normalized === "funded") {
    return (
      <Badge variant="outline" className="border-green-300 bg-green-100 text-green-800">
        Funded
      </Badge>
    );
  }
  return <Badge variant="outline">{status}</Badge>;
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
  const stats = [
    { label: "Total Batches", value: batches.count, icon: Layers },
    { label: "Settled Amount", value: formatCurrency(batches.settled), icon: CheckCircle2 },
    { label: "Pending", value: formatCurrency(batches.pending), icon: Clock },
    { label: "Avg Batch Size", value: formatCurrency(batches.avgSize), icon: DollarSign },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="pt-4 pb-4">
            {isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-muted p-2">
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-lg font-bold">{stat.value}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
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
      <Card>
        <CardContent className="p-4">
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
                <div className="flex flex-shrink-0 flex-wrap items-center gap-x-6 gap-y-1 pl-7 text-sm sm:pl-0">
                  <div className="flex items-center gap-1 text-green-700">
                    <ArrowDownLeft className="h-3.5 w-3.5" />
                    <span>{formatCurrency(batch.gross_amount)}</span>
                  </div>
                  {batch.refund_amount > 0 && (
                    <div className="flex items-center gap-1 text-red-600">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      <span>{formatCurrency(batch.refund_amount)}</span>
                    </div>
                  )}
                  <div className="font-bold">
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
        </CardContent>
      </Card>
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
      <Card>
        <CardContent className="p-4">
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

                <div className="flex flex-shrink-0 flex-wrap items-center gap-x-6 gap-y-1 pl-7 text-sm sm:pl-0">
                  <div className="flex items-center gap-1 text-green-700">
                    <ArrowDownLeft className="h-3.5 w-3.5" />
                    <span>{formatCurrency(batch.gross_amount)}</span>
                  </div>
                  {batch.refund_amount > 0 && (
                    <div className="flex items-center gap-1 text-red-600">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      <span>{formatCurrency(batch.refund_amount)}</span>
                    </div>
                  )}
                  <div className="font-bold">{formatCurrency(batch.net_amount)}</div>
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
        </CardContent>
      </Card>
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
    <div className="overflow-x-auto rounded border text-xs">
      <table className="w-full min-w-[480px]">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="p-2 text-left font-medium">Order #</th>
            <th className="p-2 text-left font-medium">Method</th>
            <th className="p-2 text-left font-medium">Card</th>
            <th className="p-2 text-right font-medium">Amount</th>
            <th className="p-2 text-right font-medium">Tip</th>
            <th className="p-2 text-right font-medium">Total</th>
            <th className="p-2 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-b last:border-0">
              <td className="p-2 font-mono">
                {p.orders?.order_number || p.orders?.display_number || "—"}
              </td>
              <td className="p-2">{getMethodLabel(p.payment_method)}</td>
              <td className="p-2">
                {p.card_last_four ? (
                  <div className="flex items-center gap-1">
                    <CardBrandIcon brand={p.card_type} className="h-4 w-auto" />
                    <span className="font-mono">****{p.card_last_four}</span>
                  </div>
                ) : (
                  "—"
                )}
              </td>
              <td className="p-2 text-right font-mono">{formatCurrency(p.amount)}</td>
              <td className="p-2 text-right font-mono text-muted-foreground">
                {p.tip_amount ? formatCurrency(p.tip_amount) : "—"}
              </td>
              <td className="p-2 text-right font-mono font-semibold">
                {formatCurrency(p.total_amount)}
              </td>
              <td className="p-2">
                <StatusBadgeMini status={p.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadgeMini({ status }: { status: string }) {
  const configs: Record<string, { label: string; className: string }> = {
    captured: { label: "Captured", className: "bg-green-100 text-green-800 border-green-300" },
    paid: { label: "Paid", className: "bg-green-100 text-green-800 border-green-300" },
    refunded: { label: "Refunded", className: "bg-red-100 text-red-800 border-red-300" },
    partially_refunded: { label: "Partial Refund", className: "bg-amber-100 text-amber-800 border-amber-300" },
    void: { label: "Void", className: "bg-gray-100 text-gray-800 border-gray-300" },
  };
  const config = configs[status] || { label: status, className: "" };
  return (
    <Badge variant="outline" className={`text-[10px] ${config.className}`}>
      {config.label}
    </Badge>
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
        <Card>
          <CardContent className="py-12">
            <Empty
              icon={Layers}
              title="No batches found"
              description="No settlement batches found for the selected date range. Batches appear when card payments are processed through your terminal."
            />
          </CardContent>
        </Card>
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
