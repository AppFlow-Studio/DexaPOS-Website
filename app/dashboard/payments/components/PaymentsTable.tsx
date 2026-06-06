"use client";

import * as React from "react";
import {
  ColumnDef,
  SortingState,
  ExpandedState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  useReactTable,
  Row,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  ArrowUpDown,
  ChevronRight,
  ChevronDown,
  CreditCard,
  Banknote,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Wifi,
  Smartphone,
  CreditCard as ChipIcon,
} from "lucide-react";
import { PaymentRecord, EmvData } from "@/types/payment";
import { CardBrandIcon } from "./CardBrandIcon";
import { cn } from "@/lib/utils";

// ============================================================================
// Helpers
// ============================================================================

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const orderDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "pm" : "am";
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, "0");
  const timeString = `${displayHours}:${displayMinutes} ${ampm}`;

  if (orderDate.getTime() === today.getTime()) {
    return `Today at ${timeString}`;
  }

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()} at ${timeString}`;
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

function getMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: "Cash",
    card: "Card",
    card_spinapi: "Card",
    card_dvpaylite: "Card",
    card_manual: "Card (Manual)",
    gift_card: "Gift Card",
    house_account: "House Acct",
    external: "External",
  };
  return labels[method] || method;
}

function isCardMethod(method: string): boolean {
  return method === "card" || method.startsWith("card_");
}

function getStatusConfig(status: string) {
  const configs: Record<string, { label: string; className: string }> = {
    captured: {
      label: "Captured",
      className: "bg-green-100 text-green-800 border-green-300",
    },
    paid: {
      label: "Paid",
      className: "bg-green-100 text-green-800 border-green-300",
    },
    authorized: {
      label: "Authorized",
      className: "bg-blue-100 text-blue-800 border-blue-300",
    },
    pending: {
      label: "Pending",
      className: "bg-yellow-100 text-yellow-800 border-yellow-300",
    },
    processing: {
      label: "Processing",
      className: "bg-blue-100 text-blue-800 border-blue-300",
    },
    refunded: {
      label: "Refunded",
      className: "bg-red-100 text-red-800 border-red-300",
    },
    partially_refunded: {
      label: "Partial Refund",
      className: "bg-amber-100 text-amber-800 border-amber-300",
    },
    void: {
      label: "Void",
      className: "bg-gray-100 text-gray-800 border-gray-300",
    },
    failed: {
      label: "Failed",
      className: "bg-red-100 text-red-800 border-red-300",
    },
    declined: {
      label: "Declined",
      className: "bg-red-100 text-red-800 border-red-300",
    },
  };
  return configs[status] || { label: status, className: "" };
}

function getEntryModeLabel(mode?: string): string {
  if (!mode) return "";
  const labels: Record<string, string> = {
    contactless: "Contactless",
    emvcl: "Contactless",
    chip: "Chip",
    emv: "Chip",
    swipe: "Swipe",
    manual: "Manual",
    keyed: "Keyed",
  };
  return labels[mode.toLowerCase()] || mode;
}

function getCastlesData(p: PaymentRecord) {
  const ct = p.processor_response?.castles_transaction;
  const raw = p.processor_response?.raw_castles_response;
  const isCastles = p.processor_response?.terminal_vendor === "castles";
  return { ct, raw, isCastles };
}

function getEntryModeIcon(mode?: string) {
  if (!mode) return null;
  const m = mode.toLowerCase();
  if (m === "contactless" || m === "emvcl") return <Wifi className="h-3 w-3" />;
  if (m === "chip" || m === "emv") return <ChipIcon className="h-3 w-3" />;
  if (m === "swipe") return <CreditCard className="h-3 w-3" />;
  if (m === "manual" || m === "keyed")
    return <Smartphone className="h-3 w-3" />;
  return null;
}

// ============================================================================
// Expanded Row Detail
// ============================================================================

function PaymentDetailPanel({ payment }: { payment: PaymentRecord }) {
  const hasReversals =
    payment.reversals && payment.reversals.length > 0;
  const hasItems =
    payment.order_payment_items && payment.order_payment_items.length > 0;

  const { ct, raw, isCastles } = getCastlesData(payment);

  const baseEmv: EmvData | null | undefined =
    payment.emv_data || payment.processor_response?.emv_data;
  const emvData: EmvData | null | undefined = baseEmv
    ? baseEmv
    : raw?.txnAID || raw?.txnCardBrand
      ? { aid: raw.txnAID, applicationName: raw.txnCardBrand }
      : null;
  const hasEmvData =
    emvData &&
    (emvData.aid ||
      emvData.applicationName ||
      emvData.arc ||
      emvData.iad ||
      emvData.tsi ||
      emvData.tvr);

  return (
    <div className="grid gap-4 p-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Transaction Details */}
      <div className="space-y-2 min-w-0">
        <h4 className="text-sm font-semibold">Transaction Details</h4>
        <dl className="space-y-1 text-xs">
          {payment.authorization_code && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Auth Code</dt>
              <dd className="font-mono">{payment.authorization_code}</dd>
            </div>
          )}
          {payment.transaction_id && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Transaction ID</dt>
              <dd className="font-mono truncate max-w-35">
                {payment.transaction_id}
              </dd>
            </div>
          )}
          {payment.reference_number && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Reference #</dt>
              <dd className="font-mono">{payment.reference_number}</dd>
            </div>
          )}
          {payment.dejavoo_response_code && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Response Code</dt>
              <dd className="font-mono">{payment.dejavoo_response_code}</dd>
            </div>
          )}
          {(payment.batch_number || ct?.batchNumber) && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Batch #</dt>
              <dd className="font-mono">{payment.batch_number || ct?.batchNumber}</dd>
            </div>
          )}
          {payment.settled_at && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Settled At</dt>
              <dd>{formatDate(payment.settled_at)}</dd>
            </div>
          )}
          {(payment.invoice_number || raw?.txnInvoiceNumber) && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Invoice #</dt>
              <dd className="font-mono">{payment.invoice_number || raw?.txnInvoiceNumber}</dd>
            </div>
          )}
          {ct?.rrn && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">RRN</dt>
              <dd className="font-mono">{ct.rrn}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Terminal Info */}
      <div className="space-y-2 min-w-0">
        <h4 className="text-sm font-semibold">Terminal Info</h4>
        <dl className="space-y-1 text-xs">
          {payment.terminal_type && (
            <div className="flex gap-2 justify-between">
              <dt className="text-muted-foreground shrink-0">Terminal</dt>
              <dd className="text-right break-all">{payment.terminal_type}</dd>
            </div>
          )}
          {(payment.terminal_id || ct?.terminalId) && (
            <div className="flex gap-2 justify-between">
              <dt className="text-muted-foreground shrink-0">Terminal ID</dt>
              <dd
                className="font-mono text-right truncate min-w-0 max-w-[160px]"
                title={payment.terminal_id || ct?.terminalId || ''}
              >
                {payment.terminal_id || ct?.terminalId}
              </dd>
            </div>
          )}
          {payment.device_id && (
            <div className="flex gap-2 justify-between">
              <dt className="text-muted-foreground shrink-0">Device ID</dt>
              <dd
                className="font-mono text-right truncate min-w-0 max-w-[160px]"
                title={payment.device_id}
              >
                {payment.device_id}
              </dd>
            </div>
          )}
          {payment.processor_response?.serial_number && (
            <div className="flex gap-2 justify-between">
              <dt className="text-muted-foreground shrink-0">Serial #</dt>
              <dd
                className="font-mono text-right truncate min-w-0 max-w-[160px]"
                title={String(payment.processor_response.serial_number)}
              >
                {payment.processor_response.serial_number}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Reversal Details (conditional) */}
      {hasReversals && (
        <div className="space-y-2 min-w-0">
          <h4 className="text-sm font-semibold">Reversals</h4>
          <div className="space-y-2">
            {payment.reversals!.map((rev) => (
              <div
                key={rev.id}
                className="rounded border p-2 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px]">
                    {rev.reversal_type}
                  </Badge>
                  <span className="font-mono text-red-600">
                    -{formatCurrency(rev.amount)}
                  </span>
                </div>
                {rev.reason && (
                  <p className="text-muted-foreground">{rev.reason}</p>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>{rev.status}</span>
                  {rev.processed_at && (
                    <span>{formatDate(rev.processed_at)}</span>
                  )}
                </div>
                {rev.order_refund_items &&
                  rev.order_refund_items.length > 0 && (
                    <div className="mt-1 pt-1 border-t space-y-0.5">
                      {rev.order_refund_items.map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between"
                        >
                          <span>
                            {item.item_name} x{item.quantity_refunded}
                          </span>
                          <span className="font-mono">
                            {formatCurrency(item.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Items Paid For (conditional) */}
      {hasItems && (
        <div className="space-y-2 min-w-0">
          <h4 className="text-sm font-semibold">Items Paid</h4>
          <div className="rounded border overflow-x-auto">
            <table className="w-full text-xs min-w-105">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-2 py-1.5 text-left font-medium">Item</th>
                  <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                  <th className="px-2 py-1.5 text-right font-medium">Subtotal</th>
                  <th className="px-2 py-1.5 text-right font-medium">Tax</th>
                </tr>
              </thead>
              <tbody>
                {payment.order_payment_items!.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {item.order_items?.item_name || "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap">
                      {item.quantity_paid}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap">
                      {formatCurrency(item.subtotal_paid)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap">
                      {formatCurrency(item.tax_paid)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {(() => {
                const items = payment.order_payment_items ?? [];
                const itemsSubtotal = items.reduce(
                  (s, it) => s + Number(it.subtotal_paid || 0),
                  0
                );
                const itemsTax = items.reduce(
                  (s, it) => s + Number(it.tax_paid || 0),
                  0
                );
                const subtotal = Number(
                  payment.subtotal_portion ?? itemsSubtotal
                );
                const tax = Number(payment.tax_portion ?? itemsTax);
                const discount = Number(payment.discount_portion ?? 0);
                const gatewayFee = Number(payment.gateway_fee ?? 0);
                const orderSvc = Number(
                  payment.orders?.service_charge ?? 0
                );
                const orderTotal = Number(
                  payment.orders?.total_amount ?? 0
                );
                const payAmount = Number(payment.amount ?? 0);
                const payTip = Number(payment.tip_amount ?? 0);
                const payTotal = Number(
                  payment.total_amount ?? payAmount + payTip
                );
                const isSplit =
                  orderTotal > 0 &&
                  payAmount > 0 &&
                  payAmount + payTip < orderTotal;
                // Service charge share for this payment, prorated when split.
                const svcShare =
                  orderSvc > 0 && isSplit
                    ? orderSvc * (payAmount / Math.max(orderTotal, 1))
                    : orderSvc;
                // The POS taxes on top of SC, so true tax = item tax + tax on SC.
                // In some payments the SC amount itself is bundled into
                // tax_portion as well — detect that and peel it out so SC can
                // always be displayed as its own line without double-counting.
                const portionsCoverAmount =
                  Math.abs(
                    subtotal + tax + gatewayFee - discount - payAmount
                  ) < 0.02;
                const svcBundledInTax =
                  svcShare > 0 && tax >= svcShare && portionsCoverAmount;
                const taxDisplay = svcBundledInTax ? tax - svcShare : tax;
                const accounted =
                  subtotal +
                  taxDisplay +
                  svcShare +
                  gatewayFee -
                  discount;
                const other = payAmount - accounted;
                const rows: Array<{
                  label: string;
                  value: number;
                  cls?: string;
                }> = [
                  { label: "Subtotal", value: subtotal },
                  { label: "Tax", value: taxDisplay },
                ];
                if (svcShare > 0)
                  rows.push({
                    label: `Service Charge${isSplit ? " (prorated)" : ""}`,
                    value: svcShare,
                  });
                if (gatewayFee > 0)
                  rows.push({ label: "Gateway Fee", value: gatewayFee });
                if (discount > 0)
                  rows.push({
                    label: "Discount",
                    value: -discount,
                    cls: "text-red-600",
                  });
                if (Math.abs(other) >= 0.005)
                  rows.push({
                    label: "Other / Adjustments",
                    value: other,
                    cls: "text-muted-foreground",
                  });
                rows.push({
                  label: "Amount",
                  value: payAmount,
                  cls: "font-semibold",
                });
                if (payTip > 0) rows.push({ label: "Tip", value: payTip });
                rows.push({
                  label: "Total",
                  value: payTotal,
                  cls: "font-semibold",
                });
                return (
                  <tfoot className="border-t bg-muted/30">
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td
                          colSpan={3}
                          className={cn(
                            "px-2 py-1 text-right text-muted-foreground",
                            r.cls
                          )}
                        >
                          {r.label}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1 text-right font-mono whitespace-nowrap",
                            r.cls
                          )}
                        >
                          {formatCurrency(r.value)}
                        </td>
                      </tr>
                    ))}
                  </tfoot>
                );
              })()}
            </table>
          </div>
        </div>
      )}

      {/* EMV Data (conditional) */}
      {hasEmvData && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">EMV Data</h4>
          <dl className="space-y-1 text-xs">
            {emvData!.aid && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">AID</dt>
                <dd className="font-mono">{emvData!.aid}</dd>
              </div>
            )}
            {emvData!.applicationName && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Application Name</dt>
                <dd className="font-mono">{emvData!.applicationName}</dd>
              </div>
            )}
            {emvData!.arc && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">ARC</dt>
                <dd className="font-mono">{emvData!.arc}</dd>
              </div>
            )}
            {emvData!.iad && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">IAD</dt>
                <dd className="font-mono truncate max-w-35">
                  {emvData!.iad}
                </dd>
              </div>
            )}
            {emvData!.tsi && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">TSI</dt>
                <dd className="font-mono">{emvData!.tsi}</dd>
              </div>
            )}
            {emvData!.tvr && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">TVR</dt>
                <dd className="font-mono">{emvData!.tvr}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Table Component
// ============================================================================

interface PaymentsTableProps {
  data: PaymentRecord[];
  isLoading?: boolean;
}

export function PaymentsTable({ data, isLoading }: PaymentsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "initiated_at", desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [expanded, setExpanded] = React.useState<ExpandedState>({});

  const columns: ColumnDef<PaymentRecord>[] = [
    // Expand toggle
    {
      id: "expand",
      header: () => null,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            row.toggleExpanded();
          }}
        >
          {row.getIsExpanded() ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      ),
      enableSorting: false,
    },
    // Date/Time
    {
      accessorKey: "initiated_at",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2"
        >
          Date/Time
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(row.original.initiated_at)}
        </div>
      ),
    },
    // Order #
    {
      id: "order_number",
      accessorFn: (row) =>
        row.orders?.order_number || row.orders?.display_number || "",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2"
        >
          Order #
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-medium text-xs">
          {row.original.orders?.order_number ||
            row.original.orders?.display_number ||
            "—"}
        </div>
      ),
    },
    // Method
    {
      accessorKey: "payment_method",
      header: "Method",
      cell: ({ row }) => {
        const method = row.original.payment_method;
        const isCard = isCardMethod(method);
        return (
          <Badge variant="outline" className="gap-1 text-xs">
            {isCard ? (
              <CreditCard className="h-3 w-3" />
            ) : (
              <Banknote className="h-3 w-3" />
            )}
            {getMethodLabel(method)}
          </Badge>
        );
      },
      enableSorting: false,
    },
    // Card
    {
      id: "card_info",
      header: "Card",
      cell: ({ row }) => {
        const p = row.original;
        if (!p.card_last_four) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex items-center gap-1.5">
            <CardBrandIcon brand={p.card_type} className="h-5 w-auto" />
            <span className="font-mono text-xs">****{p.card_last_four}</span>
          </div>
        );
      },
      enableSorting: false,
    },
    // Entry Mode
    {
      id: "entry_mode",
      header: "Entry",
      cell: ({ row }) => {
        const { ct } = getCastlesData(row.original);
        const mode =
          row.original.card_entry_mode ||
          row.original.processor_response?.entry_type ||
          ct?.entryMode;
        if (!mode) return <span className="text-muted-foreground">—</span>;
        return (
          <Badge variant="outline" className="gap-1 text-[10px]">
            {getEntryModeIcon(mode)}
            {getEntryModeLabel(mode)}
          </Badge>
        );
      },
      enableSorting: false,
    },
    // Amount
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 justify-between"
        >
          <span className="flex-1 text-left">Amount</span>
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-mono text-sm text-right">
          {formatCurrency(row.original.amount)}
        </div>
      ),
    },
    // Tip
    {
      accessorKey: "tip_amount",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 justify-between"
        >
          <span className="flex-1 text-left">Tip</span>
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-mono text-sm text-right text-muted-foreground">
          {row.original.tip_amount != null
            ? formatCurrency(row.original.tip_amount)
            : "—"}
        </div>
      ),
    },
    // Service Charge (prorated for split payments)
    {
      id: "service_charge",
      header: "Service Charge",
      enableSorting: false,
      cell: ({ row }) => {
        const svc = Number(row.original.orders?.service_charge ?? 0);
        if (!(svc > 0)) {
          return (
            <div className="font-mono text-sm text-right text-muted-foreground">
              —
            </div>
          );
        }
        const orderTotal = Number(row.original.orders?.total_amount ?? 0);
        const payTotal = Number(
          row.original.total_amount ?? row.original.amount ?? 0
        );
        const isSplit =
          orderTotal > 0 && payTotal > 0 && payTotal < orderTotal;
        const shown = isSplit ? svc * (payTotal / orderTotal) : svc;
        return (
          <div
            className="font-mono text-sm text-right text-muted-foreground"
            title={isSplit ? "Prorated from order service charge" : undefined}
          >
            {formatCurrency(shown)}
            {isSplit && <span className="ml-1 text-[10px]">*</span>}
          </div>
        );
      },
    },
    // Total
    {
      accessorKey: "total_amount",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 justify-between"
        >
          <span className="flex-1 text-left">Total</span>
          <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-mono text-sm font-semibold text-right">
          {formatCurrency(row.original.total_amount)}
        </div>
      ),
    },
    // Status
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const config = getStatusConfig(row.original.status);
        return (
          <Badge variant="outline" className={`text-xs ${config.className}`}>
            {config.label}
          </Badge>
        );
      },
      enableSorting: false,
    },
    // Settlement
    {
      id: "settlement",
      header: "Settlement",
      cell: ({ row }) => {
        const p = row.original;
        const batchNum = p.batch_number || p.dejavoo_batch_number;
        if (p.is_settled) {
          return (
            <div className="flex flex-col gap-0.5">
              <Badge
                variant="outline"
                className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300"
              >
                Settled
              </Badge>
              {batchNum && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  Batch {batchNum}
                </span>
              )}
            </div>
          );
        }
        if (batchNum) {
          return (
            <span className="text-xs text-muted-foreground font-mono">
              Batch {batchNum}
            </span>
          );
        }
        return <span className="text-muted-foreground">—</span>;
      },
      enableSorting: false,
    },
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onExpandedChange: setExpanded,
    getRowCanExpand: () => true,
    initialState: {
      pagination: { pageSize: 50 },
    },
    state: {
      sorting,
      globalFilter,
      expanded,
    },
  });

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by order #, auth code, card, customer..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <React.Fragment key={row.id}>
                  <TableRow
                    data-state={row.getIsExpanded() && "expanded"}
                    className="cursor-pointer"
                    onClick={() => row.toggleExpanded()}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={cell.column.id === "amount" || cell.column.id === "tip_amount" || cell.column.id === "service_charge" || cell.column.id === "total_amount" ? "text-right" : undefined}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() && (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="bg-muted/30 p-0"
                      >
                        <PaymentDetailPanel payment={row.original} />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <CreditCard className="h-8 w-8" />
                    <p>No payments found</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {table.getPageCount()}
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="icon"
          className="hidden size-8 lg:flex"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
        >
          <span className="sr-only">Go to first page</span>
          <ChevronsLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <span className="sr-only">Go to previous page</span>
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <span className="sr-only">Go to next page</span>
          <ChevronRight />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="hidden size-8 lg:flex"
          onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          disabled={!table.getCanNextPage()}
        >
          <span className="sr-only">Go to last page</span>
          <ChevronsRight />
        </Button>
      </div>
    </div>
  );
}
