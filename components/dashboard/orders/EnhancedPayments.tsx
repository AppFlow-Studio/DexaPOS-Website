"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
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
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

// ─── Types ───

export type RichPayment = NonNullable<OrderFullHistory["payments"]>[number];

// ─── Icon / Label Helpers ───

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
    voided_at: (p as any).voided_at ?? null,
    voided_by_name: (p as any).voided_by_name ?? null,
    voided_by: (p as any).voided_by ?? null,
    void_reason: (p as any).void_reason ?? null,
    tip_adjusted_at: null,
    original_tip_amount: null,
    tip_adjusted_by_name: null,
    result_code: null,
    response_message: null,
    split_count: null,
    split_portion_index: null,
    covers_items: null,
    payment_items: (p.order_payment_items || []).map((opi) => ({
      item_name: opi.order_items?.item_name ?? "Item",
      quantity_paid: opi.quantity_paid,
      subtotal_paid: Number(opi.subtotal_paid) || 0,
      tax_paid: Number(opi.tax_paid) ?? null,
    })),
    events: [],
    subtotal_portion: p.subtotal_portion ?? null,
    tax_portion: p.tax_portion ?? null,
    dual_pricing_fee: p.dual_pricing_fee ?? null,
    tip_fee: p.tip_fee ?? null,
    refunded_dual_pricing_fee: p.refunded_dual_pricing_fee ?? null,
    refunded_tip_fee: p.refunded_tip_fee ?? null,
    original_tip_fee: p.original_tip_fee ?? null,
    dual_pricing_percentage_snapshot: p.dual_pricing_percentage_snapshot ?? null,
    tip_surcharge_percentage_snapshot: p.tip_surcharge_percentage_snapshot ?? null,
  };
}

// ─── Fees & Surcharges Breakdown ───

function PaymentFeeBreakdown({ payment }: { payment: RichPayment }) {
  const dualFee = Number(payment.dual_pricing_fee ?? 0);
  const tipFee = Number(payment.tip_fee ?? 0);
  const refundedDualFee = Number(payment.refunded_dual_pricing_fee ?? 0);
  const refundedTipFee = Number(payment.refunded_tip_fee ?? 0);
  const taxPortion = payment.tax_portion;
  const subtotalPortion = payment.subtotal_portion;
  const dualPct = Number(payment.dual_pricing_percentage_snapshot ?? 0);
  const tipPct = Number(payment.tip_surcharge_percentage_snapshot ?? 0);
  const originalTipFee = payment.original_tip_fee;
  const tipFeeAdjusted =
    originalTipFee != null && Math.abs(Number(originalTipFee) - tipFee) > 0.001;

  const hasAnyFee =
    dualFee > 0 ||
    tipFee > 0 ||
    refundedDualFee > 0 ||
    refundedTipFee > 0 ||
    dualPct > 0 ||
    tipPct > 0 ||
    (subtotalPortion != null && Number(subtotalPortion) > 0) ||
    (taxPortion != null && Number(taxPortion) > 0);

  if (!hasAnyFee) return null;

  const netDualFee = Math.max(0, dualFee - refundedDualFee);
  const netTipFee = Math.max(0, tipFee - refundedTipFee);
  const netTotal = netDualFee + netTipFee;

  return (
    <div className="px-4 pb-3 pt-1">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-medium text-muted-foreground">
          Fees & Surcharges
        </p>
        {netTotal > 0 && (
          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            Net platform fee {formatCurrency(netTotal)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        {subtotalPortion != null && (
          <>
            <span className="text-muted-foreground">Subtotal portion</span>
            <span className="font-mono">{formatCurrency(Number(subtotalPortion))}</span>
          </>
        )}
        {taxPortion != null && (
          <>
            <span className="text-muted-foreground">Tax portion</span>
            <span className="font-mono">{formatCurrency(Number(taxPortion))}</span>
          </>
        )}
        {(dualFee > 0 || dualPct > 0) && (
          <>
            <span className="text-muted-foreground">
              Card surcharge
              {dualPct > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground/70">
                  ({dualPct}%)
                </span>
              )}
            </span>
            <span className="font-mono">{formatCurrency(dualFee)}</span>
          </>
        )}
        {refundedDualFee > 0 && (
          <>
            <span className="text-muted-foreground pl-3">↳ Refunded</span>
            <span className="font-mono text-rose-600 dark:text-rose-400">
              -{formatCurrency(refundedDualFee)}
            </span>
          </>
        )}
        {(tipFee > 0 || tipPct > 0) && (
          <>
            <span className="text-muted-foreground">
              Tip surcharge
              {tipPct > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground/70">
                  ({tipPct}%)
                </span>
              )}
            </span>
            <span className="font-mono">{formatCurrency(tipFee)}</span>
          </>
        )}
        {tipFeeAdjusted && originalTipFee != null && (
          <>
            <span className="text-muted-foreground pl-3">↳ Original</span>
            <span className="font-mono line-through text-muted-foreground">
              {formatCurrency(Number(originalTipFee))}
            </span>
          </>
        )}
        {refundedTipFee > 0 && (
          <>
            <span className="text-muted-foreground pl-3">↳ Refunded</span>
            <span className="font-mono text-rose-600 dark:text-rose-400">
              -{formatCurrency(refundedTipFee)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Enhanced Payment Card ───

function paymentEventSeverity(eventType: string): "success" | "error" | "warning" | "info" {
  switch (eventType) {
    case "captured":
    case "approved":
    case "authorized":
    case "settled":
      return "success";
    case "failed":
    case "declined":
    case "timeout":
      return "error";
    case "voided":
    case "refunded":
    case "cancelled":
      return "warning";
    default:
      return "info";
  }
}

export function EnhancedPaymentCard({
  payment,
  index,
  total,
  cashDiscountApplied,
  orderVoidedAt = null,
  orderVoidedByName = null,
  orderVoidedBy = null,
  orderVoidReason = null,
}: {
  payment: RichPayment;
  index: number;
  total: number;
  cashDiscountApplied: boolean;
  orderVoidedAt?: string | null;
  orderVoidedByName?: string | null;
  orderVoidedBy?: string | null;
  orderVoidReason?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const isCash = payment.payment_method === "cash";
  const isVoided = payment.status === "void";
  const hasOrderVoid =
    !!(orderVoidedAt || orderVoidedByName || orderVoidedBy || orderVoidReason);
  const showVoidInCard = isVoided || hasOrderVoid;
  const isFailed = payment.status === "failed" || payment.status === "declined";
  const isSplit = total > 1;
  const splitIndex = payment.split_portion_index != null ? payment.split_portion_index + 1 : index;
  const splitTotal = payment.split_count ?? total;
  // Header always shows position-in-list (index/total); expanded "Split portion" can use API split_portion_index/split_count when present
  const displayIndex = index;
  const displayTotal = total;

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
  const paymentResultCode = payment.result_code ?? failedEvent?.result_code;
  const paymentResponseMessage = payment.response_message ?? failedEvent?.response_message;

  const tipWasAdjusted = !!(payment.tip_adjusted_at && payment.original_tip_amount != null);
  const isSuccessStatus =
    payment.status === "captured" || payment.status === "paid" || payment.status === "authorized";

  // Collapsed second line: "$43.22 + $5.00 tip = $48.22 · Visa ****4242"
  const collapsedAmountLine = [
    formatCurrency(payment.amount),
    payment.tip_amount > 0 ? `+ ${formatCurrency(payment.tip_amount)} tip` : null,
    `= ${formatCurrency(payment.total_amount)}`,
  ]
    .filter(Boolean)
    .join(" ");
  const collapsedDetailParts: string[] = [];
  if (cardInfo) collapsedDetailParts.push(cardInfo);
  if (isCash && payment.amount_tendered != null) {
    collapsedDetailParts.push(`Tendered ${formatCurrency(payment.amount_tendered)}`);
  }
  if (payment.created_at && !cardInfo && !isCash) {
    collapsedDetailParts.push(formatDate(payment.created_at));
  }
  const collapsedDetailLine =
    collapsedDetailParts.length > 0 ? ` · ${collapsedDetailParts.join(" · ")}` : "";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        // Tint instead of an outline — the payment reads as one surface
        // without drawing another box inside the section.
        className={cn(
          "rounded-2xl bg-muted/40 overflow-hidden transition-colors",
          showVoidInCard && "bg-red-50/60 dark:bg-red-950/20",
          isFailed && "bg-red-50/60 dark:bg-red-950/20"
        )}
      >
        {/* Collapsed: payment icon, method + amount + status */}
        <CollapsibleTrigger
          className={cn(
            "w-full flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors text-left",
            showVoidInCard && "bg-red-50/50 dark:bg-red-950/10"
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base",
                isVoided
                  ? "bg-red-100 dark:bg-red-900/30"
                  : isFailed
                    ? "bg-red-100 dark:bg-red-900/30"
                    : isCash
                      ? "bg-green-100 dark:bg-green-900/30"
                      : "bg-muted"
              )}
            >
              {isCash ? "💵" : "💳"}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  {methodLabel} Payment
                  {isSplit && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      #{displayIndex} ({displayIndex}/{displayTotal})
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <PaymentStatusBadge status={payment.status} />
                  {isSuccessStatus && (
                    <span className="text-emerald-600 dark:text-emerald-400" aria-hidden>
                      ✅
                    </span>
                  )}
                </span>
              </p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                <span className={cn(showVoidInCard && "line-through")}>
                  {collapsedAmountLine}
                </span>
                {collapsedDetailLine}
              </p>
            </div>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
              open && "rotate-180"
            )}
          />
        </CollapsibleTrigger>

        {/* Items summary when collapsed */}
        {!open && itemSummary && (
          <div className="px-4 pb-2.5 -mt-1">
            <p className="text-[11px] text-muted-foreground truncate">
              Items: {itemSummary}
            </p>
          </div>
        )}

        <CollapsibleContent>
          <div className="border-t">
            {/* Amounts grid */}
            <div className="px-4 py-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs items-baseline">
              <span className="text-muted-foreground">Amount</span>
              <span>{formatCurrency(payment.amount)}</span>
              {payment.tip_amount > 0 && (
                <>
                  {tipWasAdjusted && (
                    <>
                      <span className="text-muted-foreground">Original Tip</span>
                      <span className="line-through text-muted-foreground">
                        {formatCurrency(payment.original_tip_amount!)}
                      </span>
                    </>
                  )}
                  <span className="text-muted-foreground">
                    {tipWasAdjusted ? "Adjusted Tip" : "Tip"}
                  </span>
                  <span>{formatCurrency(payment.tip_amount)}</span>
                  {tipWasAdjusted && payment.tip_adjusted_at && (
                    <span className="text-muted-foreground col-span-2 text-right">
                      Adjusted {formatDate(payment.tip_adjusted_at)}
                      {payment.tip_adjusted_by_name
                        ? ` by ${payment.tip_adjusted_by_name}`
                        : ""}
                    </span>
                  )}
                </>
              )}
              {/* Total is set apart by weight and a little space, not a rule.
                  The old markup drew border-t on each cell plus an empty
                  col-span-2 spacer, which rendered as a stray floating line. */}
              <span className="mt-1.5 font-medium text-muted-foreground">Total</span>
              <span className="mt-1.5 font-medium">
                {formatCurrency(payment.total_amount)}
              </span>
            </div>

            {/* Fees & Surcharges (per migration 20260503234806) */}
            <PaymentFeeBreakdown payment={payment} />

            {/* Card info: card_type, card_last_four, auth_code, authorization_code */}
            {hasCardDetails && !isCash && (
              <div className="px-4 pb-3 pt-1">
                <p className="text-[11px] font-medium text-muted-foreground mb-2">Card</p>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                  {cardInfo && (
                    <>
                      <span className="text-muted-foreground">Card</span>
                      <span className="font-mono">{cardInfo}</span>
                    </>
                  )}
                  {authCode && (
                    <>
                      <span className="text-muted-foreground">Auth code</span>
                      <span className="font-mono">{authCode}</span>
                    </>
                  )}
                  {payment.authorization_code && !payment.auth_code && (
                    <>
                      <span className="text-muted-foreground">Authorization code</span>
                      <span className="font-mono">{payment.authorization_code}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* References: psp_reference, transaction_id */}
            {(payment.psp_reference || payment.transaction_id) && (
              <div className="px-4 pb-3 pt-1">
                <p className="text-[11px] font-medium text-muted-foreground mb-2">References</p>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                  {payment.transaction_id && (
                    <>
                      <span className="text-muted-foreground">Transaction ID</span>
                      <span className="font-mono text-[11px] truncate max-w-[220px]">
                        {payment.transaction_id}
                      </span>
                    </>
                  )}
                  {payment.psp_reference && (
                    <>
                      <span className="text-muted-foreground">PSP Reference</span>
                      <span className="font-mono text-[11px] truncate max-w-[220px]">
                        {payment.psp_reference}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Cash details: amount_tendered, change_given (cash only) */}
            {isCash && (
              <div className="px-4 pb-3 pt-1">
                <p className="text-[11px] font-medium text-muted-foreground mb-2">Cash</p>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                  <span className="text-muted-foreground">Amount Tendered</span>
                  <span>
                    {payment.amount_tendered != null
                      ? formatCurrency(payment.amount_tendered)
                      : "—"}
                  </span>
                  <span className="text-muted-foreground">Change Given</span>
                  <span>
                    {payment.change_given != null
                      ? formatCurrency(payment.change_given)
                      : payment.amount_tendered != null
                        ? formatCurrency(
                            Math.max(0, payment.amount_tendered - payment.total_amount)
                          )
                        : "—"}
                  </span>
                </div>
              </div>
            )}

            {/* Terminal: terminal_type, terminal_id, batch_number, dejavoo_* */}
            {hasTerminalInfo && (
              <div className="px-4 pb-3 pt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                {payment.terminal_type && (
                  <>
                    <span className="text-muted-foreground">Terminal Type</span>
                    <span className="font-mono">{payment.terminal_type}</span>
                  </>
                )}
                {payment.terminal_id && (
                  <>
                    <span className="text-muted-foreground">Terminal</span>
                    <span className="font-mono text-[11px] truncate max-w-[180px]">
                      {payment.terminal_id}
                    </span>
                  </>
                )}
                {batchNum && (
                  <>
                    <span className="text-muted-foreground">Batch #</span>
                    <span className="font-mono">{batchNum}</span>
                  </>
                )}
                {invoiceNum && (
                  <>
                    <span className="text-muted-foreground">Invoice #</span>
                    <span className="font-mono">{invoiceNum}</span>
                  </>
                )}
              </div>
            )}

            {/* Timestamps: authorized_at, captured_at, approved_at, created_at · Staff: processed_by_name */}
            <div className="px-4 pb-3 pt-1">
              <p className="text-[11px] font-medium text-muted-foreground mb-2">Timestamps</p>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                {payment.authorized_at && (
                  <>
                    <span className="text-muted-foreground">Authorized</span>
                    <span>{formatDate(payment.authorized_at)}</span>
                  </>
                )}
                {payment.captured_at && (
                  <>
                    <span className="text-muted-foreground">Captured</span>
                    <span>{formatDate(payment.captured_at)}</span>
                  </>
                )}
                {payment.approved_at && (
                  <>
                    <span className="text-muted-foreground">Approved</span>
                    <span>{formatDate(payment.approved_at)}</span>
                  </>
                )}
                {payment.created_at && (
                  <>
                    <span className="text-muted-foreground">Created</span>
                    <span>{formatDate(payment.created_at)}</span>
                  </>
                )}
                {payment.processed_by_name && (
                  <>
                    <span className="mt-1.5 text-muted-foreground">Processed by</span>
                    <span className="mt-1.5">{payment.processed_by_name}</span>
                  </>
                )}
              </div>
            </div>

            {/* Cash discount flag */}
            {cashDiscountApplied && isCash && (
              <div className="px-4 pb-2.5 pt-1">
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                  <DollarSign className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  <span className="text-xs text-green-700 dark:text-green-400">
                    Cash discount applied
                  </span>
                </div>
              </div>
            )}

            {/* Voided: payment-level or order-level voided_at, voided_by, void_reason */}
            {showVoidInCard && (
              <div className="mx-4 mb-3 rounded-xl px-3 py-3 bg-red-50/50 dark:bg-red-950/10 space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                  <Ban className="h-3 w-3 shrink-0" />
                  <span className="font-medium">
                    {isVoided ? "Voided" : "Order voided"}
                  </span>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs text-red-700/90 dark:text-red-300/90">
                  <span className="text-muted-foreground">Voided at</span>
                  <span>
                    {(payment.voided_at ?? orderVoidedAt)
                      ? formatDate(payment.voided_at ?? orderVoidedAt!)
                      : "—"}
                  </span>
                  <span className="text-muted-foreground">Voided by</span>
                  <span>
                    {payment.voided_by_name ??
                      orderVoidedByName ??
                      (payment.voided_by || orderVoidedBy
                        ? `Staff (${String(payment.voided_by || orderVoidedBy).slice(0, 8)}…)`
                        : "—")}
                  </span>
                  <span className="text-muted-foreground">Void reason</span>
                  <span>{payment.void_reason ?? orderVoidReason ?? "—"}</span>
                </div>
              </div>
            )}

            {/* Failed: payment-level or event-level result_code, response_message */}
            {isFailed && (paymentResultCode || paymentResponseMessage || failedEvent?.reason) && (
              <div className="mx-4 mb-3 rounded-xl px-3 py-3 bg-red-50/50 dark:bg-red-950/10 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                  <XCircle className="h-3 w-3 shrink-0" />
                  <span className="font-medium">Payment {payment.status}</span>
                </div>
                {paymentResultCode && (
                  <p className="text-xs text-red-600/80 dark:text-red-400/80 pl-5">
                    Code: {paymentResultCode}
                  </p>
                )}
                {paymentResponseMessage && (
                  <p className="text-xs text-red-600/80 dark:text-red-400/80 pl-5">
                    {paymentResponseMessage}
                  </p>
                )}
                {failedEvent?.reason && !paymentResponseMessage && (
                  <p className="text-xs text-red-600/80 dark:text-red-400/80 pl-5">
                    Reason: {failedEvent.reason}
                  </p>
                )}
              </div>
            )}

            {/* Split info: split_count, split_portion_index, covers_items, payment_items[] */}
            {isSplit && (
              <div className="px-4 pb-3 pt-1">
                <p className="text-[11px] font-medium text-muted-foreground mb-2">
                  Split
                </p>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs mb-2">
                  {payment.split_count != null && (
                    <>
                      <span className="text-muted-foreground">Split count</span>
                      <span className="font-mono">{payment.split_count}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">Portion</span>
                  <span className="font-mono">
                    {displayIndex} of {payment.split_count ?? displayTotal}
                  </span>
                </div>
                {payment.covers_items?.length ? (
                  <p className="text-[11px] text-muted-foreground mb-1.5">
                    Covers: {payment.covers_items.join(", ")}
                  </p>
                ) : null}
                {paymentItems.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">Payment items</p>
                    {paymentItems.map((pi, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs"
                      >
                        <span>
                          {pi.item_name}{" "}
                          <span className="text-muted-foreground">({pi.quantity_paid}x)</span>
                        </span>
                        <span className="font-medium">{formatCurrency(pi.subtotal_paid)}</span>
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
                )}
              </div>
            )}

            {/* Items covered (when not split) */}
            {paymentItems.length > 0 && !isSplit && (
              <div className="px-4 pb-3 pt-1">
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
                        <span className="text-muted-foreground">({pi.quantity_paid}x)</span>
                      </span>
                      <span className="font-medium">{formatCurrency(pi.subtotal_paid)}</span>
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

            {/* Payment Event Sub-Timeline (boxed, severity coloring) */}
            {hasEvents && (
              <div className="px-4 pb-3 pt-1">
                <div className="rounded-lg border bg-muted/30 overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/50 text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                    <Activity className="h-3 w-3" />
                    Payment Event Log
                  </div>
                  <div className="p-3 space-y-0">
                    {payment.events.map((evt, i) => {
                      const evtTime = formatShortTime(evt.timestamp);
                      const evtLabel = paymentEventLabel(evt.event_type);
                      const severity = paymentEventSeverity(evt.event_type);
                      const extras: string[] = [];
                      if (evt.amount != null) extras.push(formatCurrency(evt.amount));
                      if (evt.auth_code) extras.push(`Auth: ${evt.auth_code}`);
                      if (evt.new_status) extras.push(`via ${evt.new_status.replace("_", " ")}`);
                      if (i === 0 && evt.event_type === "initiated") {
                        extras.push(`via ${methodLabel}`);
                      }
                      const severityBorder =
                        severity === "success"
                          ? "border-l-emerald-500"
                          : severity === "error"
                            ? "border-l-red-500"
                            : severity === "warning"
                              ? "border-l-amber-500"
                              : "border-l-muted-foreground/50";

                      return (
                        <div
                          key={i}
                          className={cn(
                            "relative flex items-start gap-2.5 py-2 pl-3 border-l-2 ml-1 -ml-px",
                            severityBorder
                          )}
                        >
                          <div className="shrink-0 mt-0.5">
                            {paymentEventIcon(evt.event_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs leading-snug">
                              <span className="text-muted-foreground font-mono mr-1.5">
                                {evtTime}
                              </span>
                              {severity === "success" && (
                                <span className="text-emerald-600 dark:text-emerald-400 mr-1" aria-hidden>✅</span>
                              )}
                              {evtLabel}
                              {extras.length > 0 && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  ({extras.join(" · ")})
                                </span>
                              )}
                            </p>
                            {evt.response_message && (
                              <p
                                className={cn(
                                  "text-[11px] mt-0.5",
                                  severity === "error"
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-muted-foreground"
                                )}
                              >
                                {evt.response_message}
                              </p>
                            )}
                            {evt.staff_name && (
                              <p className="text-[11px] text-muted-foreground">by {evt.staff_name}</p>
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
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ─── Enhanced Payments List (cards + progress bar, no wrapper) ───

export function EnhancedPaymentsList({
  basicPayments,
  richPayments,
  isLoading,
  cashDiscountApplied,
  totalDue,
  orderVoidedAt = null,
  orderVoidedByName = null,
  orderVoidedBy = null,
  orderVoidReason = null,
}: {
  basicPayments: OrderPayment[];
  richPayments: RichPayment[] | null;
  isLoading: boolean;
  cashDiscountApplied: boolean;
  totalDue: number;
  orderVoidedAt?: string | null;
  orderVoidedByName?: string | null;
  orderVoidedBy?: string | null;
  orderVoidReason?: string | null;
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
          orderVoidedAt={orderVoidedAt}
          orderVoidedByName={orderVoidedByName}
          orderVoidedBy={orderVoidedBy}
          orderVoidReason={orderVoidReason}
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
