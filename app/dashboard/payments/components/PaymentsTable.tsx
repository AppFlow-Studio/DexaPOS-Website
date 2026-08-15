"use client";

import * as React from "react";
import Link from "next/link";
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


  Wifi,
  Smartphone,
  X,
  CreditCard as ChipIcon,
} from "lucide-react";
import { PaymentRecord, EmvData } from "@/types/payment";
import { CardBrandIcon } from "./CardBrandIcon";
import { PaymentFacetFilter, type FacetOption } from "./PaymentFacetFilter";
import { PaymentAmountFilter, type AmountRange } from "./PaymentAmountFilter";
import {
  getCardBrandLabel,
  getPaymentMethodLabel,
  normalizeCardBrand,
  normalizeEntryMode,
  resolveCardBrand,
  resolveEntryMode,
  getEntryModeLabel as getCanonicalEntryModeLabel,
} from "@/lib/payments/method-display";
import { filterPayments } from "@/lib/payments/filter-payments";
import { cn } from "@/lib/utils";
import {
  getPaymentStatusLabel,
  getPaymentStatusStyle,
} from "@/lib/constants/payment-status";

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

function getEntryModeLabel(mode?: string): string {
  if (!mode) return "";
  return getCanonicalEntryModeLabel(mode);
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
    <div className="grid w-full max-w-full gap-6 p-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-4 min-w-0 md:col-span-1">
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
              <div className="space-y-1">
                <dt className="text-muted-foreground">Terminal ID</dt>
                <dd
                  className="font-mono break-all text-left"
                  title={payment.terminal_id || ct?.terminalId || ''}
                >
                  {payment.terminal_id || ct?.terminalId}
                </dd>
              </div>
            )}
            {payment.device_id && (
              <div className="space-y-1">
                <dt className="text-muted-foreground">Device ID</dt>
                <dd
                  className="font-mono break-all text-left"
                  title={payment.device_id}
                >
                  {payment.device_id}
                </dd>
              </div>
            )}
            {payment.processor_response?.serial_number && (
              <div className="space-y-1">
                <dt className="text-muted-foreground">Serial #</dt>
                <dd
                  className="font-mono break-all text-left"
                  title={String(payment.processor_response.serial_number)}
                >
                  {payment.processor_response.serial_number}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Reversal Details (conditional) */}
      {hasReversals && (
        <div className="space-y-2 min-w-0">
          <h4 className="text-sm font-semibold">Reversals</h4>
          <div className="space-y-2">
            {payment.reversals!.map((rev) => (
              <div
                key={rev.id}
                className="space-y-1 rounded-2xl border-0 bg-muted/60 p-2 text-xs shadow-none"
              >
                <div className="flex items-center justify-between">
                  <Badge
                    variant="secondary"
                    className="rounded-full border-0 text-[10px]"
                  >
                    {rev.reversal_type}
                  </Badge>
                  <span className="font-mono tabular-nums">
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
                    <div className="mt-1 space-y-0.5 pt-1">
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
        <div className="space-y-2 min-w-0 pt-2">
          <h4 className="text-sm font-semibold">Items Paid</h4>
          <div className="overflow-hidden rounded-2xl bg-muted/20">
            <table className="w-full max-w-full text-xs">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="px-2 py-1.5 text-left font-medium">Item</th>
                  <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                  <th className="px-2 py-1.5 text-right font-medium">Subtotal</th>
                  <th className="px-2 py-1.5 text-right font-medium">Tax</th>
                </tr>
              </thead>
              <tbody>
                {payment.order_payment_items!.map((item) => (
                  <tr key={item.id} className="bg-card/70">
                    <td className="px-1.5 py-1.5 whitespace-nowrap">
                      {item.order_items?.item_name || "—"}
                    </td>
                    <td className="px-1.5 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {item.quantity_paid}
                    </td>
                    <td className="px-1.5 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {formatCurrency(item.subtotal_paid)}
                    </td>
                    <td className="px-1.5 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
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

                const summaryColumns = rows.slice(0, 4);
                const overflowColumns = rows.slice(4);

                return (
                  <div className="mt-3 ml-auto w-full max-w-[500px] text-xs">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                      {summaryColumns.map((r, i) => (
                        <div key={`${r.label}-${i}`} className="min-w-0">
                          <div
                            className={cn(
                              "mb-1 text-right text-muted-foreground",
                              r.cls
                            )}
                          >
                            {r.label}
                          </div>
                          <div
                            className={cn(
                              "text-right font-mono tabular-nums whitespace-nowrap",
                              r.cls
                            )}
                          >
                            {formatCurrency(r.value)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {overflowColumns.length > 0 && (
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                        {overflowColumns.map((r, i) => (
                          <div key={`${r.label}-extra-${i}`} className="min-w-0">
                            <div
                              className={cn(
                                "mb-1 text-right text-muted-foreground",
                                r.cls
                              )}
                            >
                              {r.label}
                            </div>
                            <div
                              className={cn(
                                "text-right font-mono tabular-nums whitespace-nowrap",
                                r.cls
                              )}
                            >
                              {formatCurrency(r.value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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

  const [methodFilter, setMethodFilter] = React.useState<string[]>([]);
  const [brandFilter, setBrandFilter] = React.useState<string[]>([]);
  const [entryFilter, setEntryFilter] = React.useState<string[]>([]);
  const [amountFilter, setAmountFilter] = React.useState<AmountRange>({});

  // Facet options come from the rows in view, so every option returns results.
  // Counts are computed over the unfiltered data, matching the usual faceted-
  // filter convention where counts describe the dataset, not the current result.
  const { methodOptions, brandOptions, entryOptions } = React.useMemo(() => {
    const tally = (
      rows: PaymentRecord[],
      key: (p: PaymentRecord) => string | undefined,
      label: (raw: string) => string
    ): FacetOption[] => {
      const counts = new Map<string, { label: string; count: number }>();
      for (const p of rows) {
        const raw = key(p);
        if (!raw) continue;
        const existing = counts.get(raw);
        if (existing) {
          existing.count++;
        } else {
          counts.set(raw, { label: label(raw), count: 1 });
        }
      }
      return [...counts.entries()]
        .map(([value, v]) => ({ value, ...v }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    };

    return {
      methodOptions: tally(
        data,
        (p) => p.payment_method,
        (raw) => getPaymentMethodLabel(raw)
      ),
      // Normalized so "Visa" and "VISA" are one option, not two.
      brandOptions: tally(
        data,
        (p) => {
          const brand = resolveCardBrand(p);
          return brand ? normalizeCardBrand(brand) : undefined;
        },
        (raw) => getCardBrandLabel(raw)
      ),
      entryOptions: tally(
        data,
        (p) => {
          const mode = resolveEntryMode(p);
          return mode ? normalizeEntryMode(mode) : undefined;
        },
        (raw) => getCanonicalEntryModeLabel(raw)
      ),
    };
  }, [data]);

  const activeFilterCount =
    methodFilter.length +
    brandFilter.length +
    entryFilter.length +
    (amountFilter.min !== undefined || amountFilter.max !== undefined ? 1 : 0);

  const clearAllFilters = () => {
    setMethodFilter([]);
    setBrandFilter([]);
    setEntryFilter([]);
    setAmountFilter({});
  };

  // Applied before the table sees the rows: brand and entry mode are derived from
  // several processor fields, so there is no single column to filter on.
  const filteredData = React.useMemo(
    () =>
      filterPayments(data, {
        methods: methodFilter,
        brands: brandFilter,
        entryModes: entryFilter,
        amount: amountFilter,
      }),
    [data, methodFilter, brandFilter, entryFilter, amountFilter]
  );

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
      cell: ({ row }) => {
        const label =
          row.original.orders?.order_number ||
          row.original.orders?.display_number;
        // The route resolves orders by UUID, not by the human-readable number.
        const orderId = row.original.order_id;

        if (!label || !orderId) {
          return <div className="font-medium text-xs">{label || "—"}</div>;
        }

        return (
          <Link
            href={`/dashboard/orders/${orderId}`}
            // Rows toggle their detail panel on click; keep that from firing.
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-xs text-primary hover:underline"
          >
            {label}
          </Link>
        );
      },
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
        const style = getPaymentStatusStyle(row.original.status);
        return (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
              style.bg,
              style.text
            )}
          >
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} />
            {getPaymentStatusLabel(row.original.status)}
          </span>
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
              <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                Settled
              </span>
              {batchNum && (
                <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
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
    data: filteredData,
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

  // Narrowing the results can strand the view on a page that no longer exists.
  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();
  React.useEffect(() => {
    if (pageCount > 0 && pageIndex > pageCount - 1) {
      table.setPageIndex(0);
    }
  }, [pageCount, pageIndex, table]);

  return (
    <div className="space-y-4 min-w-0">
      {/* Search + filters */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative w-full min-w-0 lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            placeholder="Search by order #, auth code, card, customer..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-10 pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PaymentFacetFilter
            title="Method"
            options={methodOptions}
            selected={methodFilter}
            onChange={setMethodFilter}
          />
          <PaymentFacetFilter
            title="Card Type"
            options={brandOptions}
            selected={brandFilter}
            onChange={setBrandFilter}
            searchable
          />
          <PaymentFacetFilter
            title="Entry"
            options={entryOptions}
            selected={entryFilter}
            onChange={setEntryFilter}
          />
          <PaymentAmountFilter
            value={amountFilter}
            onChange={setAmountFilter}
          />
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-full px-3 text-muted-foreground hover:text-foreground"
              onClick={clearAllFilters}
            >
              Clear all
              <X className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Showing {filteredData.length} of {data.length} payments
        </p>
      )}

      {/* Table — §5: variant="data" carries the well, header band and
          borderless rows; do not restate them here. */}
      <Table variant="data" className="min-w-max">
          <TableHeader className="[&_tr]:border-0">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-0 hover:bg-transparent"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground"
                  >
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
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  <div className="flex items-center justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <React.Fragment key={row.id}>
                  <TableRow
                    data-state={row.getIsExpanded() && "expanded"}
                    className="cursor-pointer border-0 transition-colors"
                    onClick={() => row.toggleExpanded()}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "py-3 text-sm",
                          (cell.column.id === "amount" ||
                            cell.column.id === "tip_amount" ||
                            cell.column.id === "service_charge" ||
                            cell.column.id === "total_amount") &&
                            "text-right tabular-nums"
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() && (
                    <TableRow className="border-0 hover:bg-transparent">
                      <TableCell
                        colSpan={columns.length}
                        className="w-full max-w-full bg-muted/40 p-0"
                      >
                        <PaymentDetailPanel payment={row.original} />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <CreditCard className="h-8 w-8" />
                    <p>No payments found</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
      </Table>

      {/* Pagination — D-08: labelled outline pills, hidden on a single page. */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-[0.8125rem] text-muted-foreground tabular-nums">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="mr-1.5 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
              <ChevronRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
