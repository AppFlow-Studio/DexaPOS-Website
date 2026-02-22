"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Banknote,
  CreditCard,
  DollarSign,
  Ban,
  XCircle,
  CheckCircle2,
  AlertCircle,
  CircleDot,
  Activity,
  ChevronDown,
} from "lucide-react";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import type { OrderFullHistory } from "@/types/order-full-history";
import type { OrderPayment } from "@/types/order-management";

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

function formatShortTime(dateString: string | null | undefined): string | null {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ─── Types ───

export type RichPayment = NonNullable<OrderFullHistory["payments"]>[number];

// ─── Icon / Label Helpers ───

function paymentMethodIcon(method: string) {
  if (method === "cash") return <Banknote className="h-4 w-4" />;
  return <CreditCard className="h-4 w-4" />;
}

function formatPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: "Cash",
    card_spinapi: "Card",
    card_dvpaylite: "Card",
    card_manual: "Card (Manual)",
    gift_card: "Gift Card",
    house_account: "House Account",
    external: "External",
  };
  return labels[method] || method.replace("_", " ");
}

function paymentEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    initiated: "Payment initiated",
    processing: "Terminal processing…",
    authorized: "Authorized",
    captured: "Captured",
    approved: "Approved",
    failed: "Failed",
    declined: "Declined",
    voided: "Voided",
    refunded: "Refunded",
    settled: "Settled",
    timeout: "Timed out",
    cancelled: "Cancelled",
  };
  return labels[eventType] || eventType.replace("_", " ");
}

function paymentEventIcon(eventType: string) {
  switch (eventType) {
    case "captured":
    case "approved":
    case "authorized":
    case "settled":
      return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
    case "failed":
    case "declined":
    case "timeout":
      return <XCircle className="h-3 w-3 text-red-500" />;
    case "voided":
    case "refunded":
    case "cancelled":
      return <AlertCircle className="h-3 w-3 text-amber-500" />;
    default:
      return <CircleDot className="h-3 w-3 text-muted-foreground" />;
  }
}

// ─── Basic → Rich Payment Adapter ───

function basicToRich(p: OrderPayment): RichPayment {
  return {
    id: p.id,
    payment_method: p.payment_method,
    amount: Number(p.amount) || 0,
    tip_amount: Number(p.tip_amount) || 0,
    total_amount: Number(p.total_amount) || 0,
    status: p.status,
    card_type: p.card_type ?? null,
    card_last_four: p.card_last_four ?? null,
    auth_code: null,
    authorization_code: p.authorization_code ?? null,
    terminal_type: p.terminal_type ?? null,
    terminal_id: p.terminal_id ?? null,
    batch_number: null,
    dejavoo_batch_number: null,
    dejavoo_invoice_number: null,
    psp_reference: null,
    transaction_id: p.transaction_id ?? null,
    captured_at: p.captured_at ?? null,
    authorized_at: null,
    approved_at: null,
    created_at: p.initiated_at,
    processed_by_name: null,
    amount_tendered: null,
    change_given: null,
    voided_at: null,
    voided_by_name: null,
    void_reason: null,
    tip_adjusted_at: null,
    original_tip_amount: null,
    covers_items: null,
    payment_items: (p.order_payment_items || []).map((opi) => ({
      item_name: opi.order_items?.item_name ?? "Item",
      quantity_paid: opi.quantity_paid,
      subtotal_paid: Number(opi.subtotal_paid) || 0,
      tax_paid: Number(opi.tax_paid) || null,
    })),
    events: [],
  };
}

// ─── Enhanced Payment Card ───

export function EnhancedPaymentCard({
  payment,
  index,
  total,
  cashDiscountApplied,
}: {
  payment: RichPayment;
  index: number;
  total: number;
  cashDiscountApplied: boolean;
}) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const isCash = payment.payment_method === "cash";
  const isVoided = payment.status === "void";
  const isFailed = payment.status === "failed" || payment.status === "declined";
  const isSplit = total > 1;

  const methodLabel = formatPaymentMethodLabel(payment.payment_method);
  const cardInfo =
    payment.card_type && payment.card_last_four
      ? `${payment.card_type} ****${payment.card_last_four}`
      : payment.card_last_four
        ? `****${payment.card_last_four}`
        : null;

  const paymentItems = payment.payment_items || [];
  const itemSummary =
    paymentItems.length > 0
      ? paymentItems.map((pi) => pi.item_name).join(", ")
      : null;

  const authCode = payment.auth_code || payment.authorization_code;
  const batchNum = payment.dejavoo_batch_number || payment.batch_number;
  const invoiceNum = payment.dejavoo_invoice_number;
  const hasTerminalInfo = !!(payment.terminal_type || payment.terminal_id);
  const hasCardDetails = !!(cardInfo || authCode || payment.transaction_id || payment.psp_reference);
  const hasEvents = payment.events.length > 0;

  const failedEvent = isFailed
    ? payment.events.find((e) => e.event_type === "failed" || e.event_type === "declined")
    : null;

  const tipWasAdjusted = !!(payment.tip_adjusted_at && payment.original_tip_amount != null);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card overflow-hidden transition-colors",
        isVoided && "border-red-200 dark:border-red-800/50",
        isFailed && "border-red-200 dark:border-red-800/50"
      )}
    >
      {/* Collapsed Header */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors",
          isVoided && "bg-red-50/50 dark:bg-red-950/10"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              isVoided
                ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                : isFailed
                  ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                  : isCash
                    ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                    : "bg-muted text-muted-foreground"
            )}
          >
            {paymentMethodIcon(payment.payment_method)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium">
                {methodLabel} Payment
                {isSplit && (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    ({index}/{total})
                  </span>
                )}
              </p>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {cardInfo && <span>{cardInfo}</span>}
              {cardInfo && payment.tip_amount > 0 && <span> &middot; </span>}
              {payment.tip_amount > 0 && (
                <span>
                  Tip:{" "}
                  {tipWasAdjusted && (
                    <span className="line-through mr-1">
                      {formatCurrency(payment.original_tip_amount!)}
                    </span>
                  )}
                  {formatCurrency(payment.tip_amount)}
                </span>
              )}
              {!cardInfo && !payment.tip_amount && isCash && payment.amount_tendered && (
                <span>
                  Tendered: {formatCurrency(payment.amount_tendered)}
                  {payment.change_given
                    ? ` · Change: ${formatCurrency(payment.change_given)}`
                    : ""}
                </span>
              )}
              {!cardInfo && !payment.tip_amount && !isCash && payment.created_at && (
                <span>{formatDate(payment.created_at)}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="text-right">
            <p
              className={cn(
                "text-sm font-semibold",
                isVoided && "line-through text-muted-foreground"
              )}
            >
              {formatCurrency(payment.total_amount)}
            </p>
            <PaymentStatusBadge status={payment.status} />
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </div>

      {/* Items summary (collapsed) */}
      {!isExpanded && itemSummary && (
        <div className="px-4 pb-2.5 -mt-1">
          <p className="text-[11px] text-muted-foreground truncate">
            Items: {itemSummary}
          </p>
        </div>
      )}

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t">
          {/* Amount breakdown */}
          <div className="px-4 py-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span>{formatCurrency(payment.amount)}</span>
            </div>
            {payment.tip_amount > 0 && (
              <>
                {tipWasAdjusted && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Original Tip</span>
                    <span className="line-through">
                      {formatCurrency(payment.original_tip_amount!)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {tipWasAdjusted ? "Adjusted Tip" : "Tip"}
                  </span>
                  <span>{formatCurrency(payment.tip_amount)}</span>
                </div>
                {tipWasAdjusted && payment.tip_adjusted_at && (
                  <p className="text-[11px] text-muted-foreground text-right">
                    Adjusted {formatDate(payment.tip_adjusted_at)}
                  </p>
                )}
              </>
            )}
            <div className="flex justify-between font-medium border-t pt-1.5">
              <span>Total</span>
              <span>{formatCurrency(payment.total_amount)}</span>
            </div>
          </div>

          {/* Card / Cash details */}
          {(hasCardDetails || isCash) && (
            <div className="border-t px-4 py-3 space-y-1.5 text-xs">
              {cardInfo && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Card</span>
                  <span className="font-mono">{cardInfo}</span>
                </div>
              )}
              {authCode && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Auth Code</span>
                  <span className="font-mono">{authCode}</span>
                </div>
              )}
              {payment.transaction_id && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transaction ID</span>
                  <span className="font-mono text-[11px] truncate max-w-[180px]">
                    {payment.transaction_id}
                  </span>
                </div>
              )}
              {payment.psp_reference && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PSP Reference</span>
                  <span className="font-mono text-[11px] truncate max-w-[180px]">
                    {payment.psp_reference}
                  </span>
                </div>
              )}
              {isCash && payment.amount_tendered != null && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount Tendered</span>
                    <span>{formatCurrency(payment.amount_tendered)}</span>
                  </div>
                  {payment.change_given != null && payment.change_given > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Change Given</span>
                      <span>{formatCurrency(payment.change_given)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Terminal info */}
          {hasTerminalInfo && (
            <div className="border-t px-4 py-3 space-y-1.5 text-xs">
              {payment.terminal_type && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Terminal Type</span>
                  <span className="font-mono">{payment.terminal_type}</span>
                </div>
              )}
              {payment.terminal_id && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Terminal</span>
                  <span className="font-mono text-[11px] truncate max-w-[180px]">
                    {payment.terminal_id}
                  </span>
                </div>
              )}
              {batchNum && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Batch #</span>
                  <span className="font-mono">{batchNum}</span>
                </div>
              )}
              {invoiceNum && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice #</span>
                  <span className="font-mono">{invoiceNum}</span>
                </div>
              )}
            </div>
          )}

          {/* Timestamps & staff */}
          <div className="border-t px-4 py-3 space-y-1.5 text-xs">
            {payment.authorized_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Authorized</span>
                <span>{formatDate(payment.authorized_at)}</span>
              </div>
            )}
            {payment.captured_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Captured</span>
                <span>{formatDate(payment.captured_at)}</span>
              </div>
            )}
            {payment.approved_at && !payment.authorized_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approved</span>
                <span>{formatDate(payment.approved_at)}</span>
              </div>
            )}
            {!payment.authorized_at && !payment.captured_at && !payment.approved_at && payment.created_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Initiated</span>
                <span>{formatDate(payment.created_at)}</span>
              </div>
            )}
            {payment.processed_by_name && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Processed by</span>
                <span>{payment.processed_by_name}</span>
              </div>
            )}
          </div>

          {/* Cash discount flag */}
          {cashDiscountApplied && isCash && (
            <div className="border-t px-4 py-2.5">
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                <DollarSign className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                <span className="text-xs text-green-700 dark:text-green-400">
                  Cash discount applied
                </span>
              </div>
            </div>
          )}

          {/* Voided details */}
          {isVoided && (
            <div className="border-t px-4 py-3 bg-red-50/50 dark:bg-red-950/10 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                <Ban className="h-3 w-3" />
                <span className="font-medium">
                  Voided{payment.voided_at ? `: ${formatDate(payment.voided_at)}` : ""}
                  {payment.voided_by_name ? ` by ${payment.voided_by_name}` : ""}
                </span>
              </div>
              {payment.void_reason && (
                <p className="text-xs text-red-600/80 dark:text-red-400/80 pl-[18px]">
                  Reason: {payment.void_reason}
                </p>
              )}
            </div>
          )}

          {/* Failed payment details */}
          {isFailed && failedEvent && (
            <div className="border-t px-4 py-3 bg-red-50/50 dark:bg-red-950/10 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                <XCircle className="h-3 w-3" />
                <span className="font-medium">Payment {payment.status}</span>
              </div>
              {failedEvent.result_code && (
                <p className="text-xs text-red-600/80 dark:text-red-400/80 pl-[18px]">
                  Code: {failedEvent.result_code}
                </p>
              )}
              {failedEvent.response_message && (
                <p className="text-xs text-red-600/80 dark:text-red-400/80 pl-[18px]">
                  {failedEvent.response_message}
                </p>
              )}
              {failedEvent.reason && (
                <p className="text-xs text-red-600/80 dark:text-red-400/80 pl-[18px]">
                  Reason: {failedEvent.reason}
                </p>
              )}
            </div>
          )}

          {/* Items covered */}
          {paymentItems.length > 0 && (
            <div className="border-t px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground mb-2">
                Items covered
              </p>
              <div className="space-y-1.5">
                {paymentItems.map((pi, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs"
                  >
                    <span>
                      {pi.item_name}{" "}
                      <span className="text-muted-foreground">
                        ({pi.quantity_paid}x)
                      </span>
                    </span>
                    <span className="font-medium">
                      {formatCurrency(pi.subtotal_paid)}
                    </span>
                  </div>
                ))}
                {paymentItems.some((pi) => pi.tax_paid != null && pi.tax_paid > 0) && (
                  <div className="flex items-center justify-between text-xs border-t pt-1.5 mt-1.5">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-medium">
                      {formatCurrency(
                        paymentItems.reduce(
                          (sum, pi) => sum + (Number(pi.tax_paid) || 0),
                          0
                        )
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment event log */}
          {hasEvents && (
            <div className="border-t px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Activity className="h-3 w-3" />
                Payment Event Log
              </p>
              <div className="relative ml-1">
                <div className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-border" />
                <div className="space-y-0">
                  {payment.events.map((evt, i) => {
                    const evtTime = formatShortTime(evt.timestamp);
                    const evtLabel = paymentEventLabel(evt.event_type);
                    const extras: string[] = [];
                    if (evt.amount != null) extras.push(formatCurrency(evt.amount));
                    if (evt.auth_code) extras.push(`Auth: ${evt.auth_code}`);
                    if (evt.new_status) extras.push(`via ${evt.new_status.replace("_", " ")}`);

                    return (
                      <div
                        key={i}
                        className="relative flex items-start gap-2.5 py-1.5"
                      >
                        <div className="relative z-10 mt-0.5 shrink-0">
                          {paymentEventIcon(evt.event_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs leading-snug">
                            <span className="text-muted-foreground font-mono mr-1.5">
                              {evtTime}
                            </span>
                            {evtLabel}
                            {extras.length > 0 && (
                              <span className="text-muted-foreground">
                                {" "}({extras.join(" · ")})
                              </span>
                            )}
                          </p>
                          {evt.response_message && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {evt.response_message}
                            </p>
                          )}
                          {evt.staff_name && (
                            <p className="text-[11px] text-muted-foreground">
                              by {evt.staff_name}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Enhanced Payments List (cards + progress bar, no wrapper) ───

export function EnhancedPaymentsList({
  basicPayments,
  richPayments,
  isLoading,
  cashDiscountApplied,
  totalDue,
}: {
  basicPayments: OrderPayment[];
  richPayments: RichPayment[] | null;
  isLoading: boolean;
  cashDiscountApplied: boolean;
  totalDue: number;
}) {
  const useRich = richPayments && richPayments.length > 0;
  const paymentCount = useRich ? richPayments.length : basicPayments.length;
  const isSplit = paymentCount > 1;

  const allPayments: RichPayment[] = useRich
    ? richPayments
    : basicPayments.map(basicToRich);

  const totalPaid = allPayments
    .filter((p) => {
      const s = p.status;
      return s === "paid" || s === "captured" || s === "authorized";
    })
    .reduce((sum, p) => sum + Number(p.total_amount), 0);

  const paidPercent = totalDue > 0 ? Math.min((totalPaid / totalDue) * 100, 100) : 0;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }

  if (paymentCount === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">No payments recorded</p>
    );
  }

  return (
    <div className="space-y-2">
      {allPayments.map((p, i) => (
        <EnhancedPaymentCard
          key={p.id}
          payment={p}
          index={i + 1}
          total={paymentCount}
          cashDiscountApplied={cashDiscountApplied}
        />
      ))}

      {/* Split payment progress bar */}
      {isSplit && totalDue > 0 && (
        <div className="mt-3 pt-3 border-t">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">Total Paid</span>
            <span className="font-medium">
              {formatCurrency(totalPaid)} / {formatCurrency(totalDue)}
              <span className="text-muted-foreground ml-1.5">
                {Math.round(paidPercent)}%
              </span>
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                paidPercent >= 100
                  ? "bg-emerald-500"
                  : paidPercent > 0
                    ? "bg-primary"
                    : "bg-muted"
              )}
              style={{ width: `${paidPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
