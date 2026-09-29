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
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from "@/components/dashboard/reports/MobileColumnsButton";
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
import { useIsMobile } from "@/hooks/use-mobile";
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

type BreakdownRow = { label: string; value: number; muted?: boolean };

/**
 * How one payment's amount breaks down: the itemised lines, then the tip and
 * total. `tail` is empty when there is no tip, since Amount would equal Total.
 */
function getPaymentBreakdown(payment: PaymentRecord) {
  const items = payment.order_payment_items ?? [];
  const itemsSubtotal = items.reduce(
    (s, it) => s + Number(it.subtotal_paid || 0),
    0
  );
  const itemsTax = items.reduce((s, it) => s + Number(it.tax_paid || 0), 0);
  const subtotal = Number(payment.subtotal_portion ?? itemsSubtotal);
  const tax = Number(payment.tax_portion ?? itemsTax);
  const discount = Number(payment.discount_portion ?? 0);
  const gatewayFee = Number(payment.gateway_fee ?? 0);
  const orderSvc = Number(payment.orders?.service_charge ?? 0);
  const orderTotal = Number(payment.orders?.total_amount ?? 0);
  const payAmount = Number(payment.amount ?? 0);
  const payTip = Number(payment.tip_amount ?? 0);
  const payTotal = Number(payment.total_amount ?? payAmount + payTip);
  const isSplit =
    orderTotal > 0 && payAmount > 0 && payAmount + payTip < orderTotal;
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
    Math.abs(subtotal + tax + gatewayFee - discount - payAmount) < 0.02;
  const svcBundledInTax =
    svcShare > 0 && tax >= svcShare && portionsCoverAmount;
  const taxDisplay = svcBundledInTax ? tax - svcShare : tax;
  const accounted = subtotal + taxDisplay + svcShare + gatewayFee - discount;
  const other = payAmount - accounted;

  const lines: BreakdownRow[] = [
    { label: "Subtotal", value: subtotal },
    { label: "Tax", value: taxDisplay },
  ];
  if (svcShare > 0)
    lines.push({
      label: `Service charge${isSplit ? " (prorated)" : ""}`,
      value: svcShare,
    });
  if (gatewayFee > 0) lines.push({ label: "Gateway fee", value: gatewayFee });
  if (discount > 0) lines.push({ label: "Discount", value: -discount });
  if (Math.abs(other) >= 0.005)
    lines.push({ label: "Other / adjustments", value: other, muted: true });

  const tail: BreakdownRow[] =
    payTip > 0
      ? [
          { label: "Amount", value: payAmount },
          { label: "Tip", value: payTip },
        ]
      : [];

  return { lines, tail, total: payTotal };
}

type DetailField = { label: string; value?: React.ReactNode; mono?: boolean };

/** A labelled group of reference fields; empty fields are skipped. */
function DetailGroup({
  title,
  fields,
}: {
  title: string;
  fields: DetailField[];
}) {
  const shown = fields.filter(
    (f) => f.value !== null && f.value !== undefined && f.value !== ""
  );
  if (shown.length === 0) return null;
  return (
    <section className="min-w-0 space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      <DetailList fields={shown} />
    </section>
  );
}

/** Label beside value, so the eye never crosses the panel to pair them. */
function DetailList({ fields }: { fields: DetailField[] }) {
  return (
    <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
      {fields.map((f) => (
        <React.Fragment key={f.label}>
          <dt className="text-muted-foreground">{f.label}</dt>
          <dd className={cn("min-w-0 break-all", f.mono && "font-mono")}>
            {f.value}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function PaymentDetailPanel({ payment }: { payment: PaymentRecord }) {
  const hasReversals =
    payment.reversals && payment.reversals.length > 0;
  const hasItems =
    payment.order_payment_items && payment.order_payment_items.length > 0;

  const { ct, raw } = getCastlesData(payment);

  const baseEmv: EmvData | null | undefined =
    payment.emv_data || payment.processor_response?.emv_data;
  const emvData: EmvData | null | undefined = baseEmv
    ? baseEmv
    : raw?.txnAID || raw?.txnCardBrand
      ? { aid: raw.txnAID, applicationName: raw.txnCardBrand }
      : null;
  const emvFields: DetailField[] = emvData
    ? [
        { label: "AID", value: emvData.aid, mono: true },
        { label: "Application", value: emvData.applicationName },
        { label: "ARC", value: emvData.arc, mono: true },
        { label: "IAD", value: emvData.iad, mono: true },
        { label: "TSI", value: emvData.tsi, mono: true },
        { label: "TVR", value: emvData.tvr, mono: true },
      ].filter((f) => f.value)
    : [];

  const breakdown = hasItems ? getPaymentBreakdown(payment) : null;

  return (
    <div className="grid gap-x-10 gap-y-6 p-5 @3xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      {/* What was paid: the question most people open a payment to answer. */}
      <div className="min-w-0 space-y-6">
        {hasItems && breakdown && (
          <section className="min-w-0 space-y-3">
            <h4 className="text-sm font-semibold">Items paid</h4>
            {/* A grid, not a nested <table>: the data TableBody styles every
                descendant tr/td (fill, hover, padding) and would win. */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] text-xs">
              <div className="border-b pb-2 text-muted-foreground">Item</div>
              <div className="border-b pb-2 pl-6 text-right text-muted-foreground">Qty</div>
              <div className="border-b pb-2 pl-6 text-right text-muted-foreground">Subtotal</div>
              <div className="border-b pb-2 pl-6 text-right text-muted-foreground">Tax</div>
              {payment.order_payment_items!.map((item) => (
                <React.Fragment key={item.id}>
                  <div className="min-w-0 pt-2">
                    {item.order_items?.item_name || "—"}
                  </div>
                  <div className="pt-2 pl-6 text-right tabular-nums">
                    {item.quantity_paid}
                  </div>
                  <div className="pt-2 pl-6 text-right tabular-nums">
                    {formatCurrency(item.subtotal_paid)}
                  </div>
                  <div className="pt-2 pl-6 text-right tabular-nums">
                    {formatCurrency(item.tax_paid)}
                  </div>
                </React.Fragment>
              ))}
            </div>

            {/* Receipt-style breakdown, right-aligned under the money columns. */}
            <dl className="ml-auto w-full max-w-60 space-y-1.5 border-t pt-3 text-xs">
              {[...breakdown.lines, ...breakdown.tail].map((r, i) => (
                <div
                  key={`${r.label}-${i}`}
                  className={cn(
                    "flex justify-between gap-4",
                    r.muted && "text-muted-foreground"
                  )}
                >
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd className="tabular-nums">{formatCurrency(r.value)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t pt-1.5 text-sm font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">
                  {formatCurrency(breakdown.total)}
                </dd>
              </div>
            </dl>
          </section>
        )}

        {hasReversals && (
          <section className="min-w-0 space-y-3">
            <h4 className="text-sm font-semibold">Reversals</h4>
            <div className="space-y-2">
              {payment.reversals!.map((rev) => (
                <div
                  key={rev.id}
                  className="space-y-1 rounded-xl bg-card p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium capitalize">
                      {rev.reversal_type}
                    </span>
                    <span className="tabular-nums">
                      -{formatCurrency(rev.amount)}
                    </span>
                  </div>
                  {rev.reason && (
                    <p className="text-muted-foreground">{rev.reason}</p>
                  )}
                  <div className="flex justify-between gap-4 text-muted-foreground">
                    <span className="capitalize">{rev.status}</span>
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
                            className="flex justify-between gap-4"
                          >
                            <span>
                              {item.item_name} x{item.quantity_refunded}
                            </span>
                            <span className="tabular-nums">
                              {formatCurrency(item.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Processor references: looked up, not read, so they sit second. */}
      <div className="min-w-0 space-y-5">
        <h4 className="text-sm font-semibold">Reference</h4>
        <DetailGroup
          title="Transaction"
          fields={[
            { label: "Auth code", value: payment.authorization_code, mono: true },
            { label: "Transaction ID", value: payment.transaction_id, mono: true },
            { label: "Reference #", value: payment.reference_number, mono: true },
            { label: "Response code", value: payment.dejavoo_response_code, mono: true },
            { label: "Batch #", value: payment.batch_number || ct?.batchNumber, mono: true },
            { label: "Invoice #", value: payment.invoice_number || raw?.txnInvoiceNumber, mono: true },
            { label: "RRN", value: ct?.rrn, mono: true },
            {
              label: "Settled",
              value: payment.settled_at ? formatDate(payment.settled_at) : null,
            },
          ]}
        />
        <DetailGroup
          title="Terminal"
          fields={[
            { label: "Type", value: payment.terminal_type },
            { label: "Terminal ID", value: payment.terminal_id || ct?.terminalId, mono: true },
            { label: "Device ID", value: payment.device_id, mono: true },
            {
              label: "Serial #",
              value: payment.processor_response?.serial_number
                ? String(payment.processor_response.serial_number)
                : null,
              mono: true,
            },
          ]}
        />
        {/* Raw chip data is for disputes and support, so it starts folded. */}
        {emvFields.length > 0 && (
          <details className="group min-w-0">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
              EMV data
            </summary>
            <div className="mt-2">
              <DetailList fields={emvFields} />
            </div>
          </details>
        )}
      </div>
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

const PAYMENT_MOBILE_COLUMN_META: ReportColumn[] = [
  { id: "order_number", label: "Order #", locked: true },
  { id: "initiated_at", label: "Date/Time", defaultHidden: true },
  { id: "payment_method", label: "Method", defaultHidden: true },
  { id: "card_info", label: "Card", defaultHidden: true },
  { id: "entry_mode", label: "Entry", defaultHidden: true },
  { id: "tip_amount", label: "Tip", defaultHidden: true },
  { id: "service_charge", label: "Service Charge", defaultHidden: true },
  { id: "status", label: "Status", defaultHidden: true },
  { id: "settlement", label: "Settlement", defaultHidden: true },
];

export function PaymentsTable({ data, isLoading }: PaymentsTableProps) {
  const isMobile = useIsMobile();
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "initiated_at", desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [mobileHiddenColumns, setMobileHiddenColumns] = React.useState<Set<string>>(() =>
    initialHiddenColumns(PAYMENT_MOBILE_COLUMN_META)
  );

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

  const isColumnVisible = React.useCallback(
    (columnId: string) => {
      if (columnId === "order_number") return true;
      return !isMobile || !mobileHiddenColumns.has(columnId);
    },
    [isMobile, mobileHiddenColumns]
  );

  const columns: ColumnDef<PaymentRecord>[] = [
    // Expand toggle
    {
      id: "expand",
      header: () => null,
      cell: ({ row }) => {
        if (isMobile) return null;
        return (
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
        );
      },
      enableSorting: false,
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
    getRowCanExpand: () => !isMobile,
    initialState: {
      pagination: { pageSize: 10 },
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
          <MobileColumnsButton
            columns={PAYMENT_MOBILE_COLUMN_META}
            hidden={mobileHiddenColumns}
            onChange={setMobileHiddenColumns}
          />
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
      <Table variant="data" className="min-w-max" containerClassName="@container">
          <TableHeader className="[&_tr]:border-0">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-0 hover:bg-transparent"
              >
                {headerGroup.headers
                  .filter(
                    (header) => !isMobile || isColumnVisible(header.column.id)
                  )
                  .map((header) => (
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
                    className={cn(
                      "border-0 transition-colors",
                      !isMobile && "cursor-pointer"
                    )}
                    onClick={() => !isMobile && row.toggleExpanded()}
                  >
                    {row
                      .getVisibleCells()
                      .filter(
                        (cell) => !isMobile || isColumnVisible(cell.column.id)
                      )
                      .map((cell) => (
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
                  {!isMobile && row.getIsExpanded() && (
                    <TableRow className="border-0 hover:bg-transparent">
                      <TableCell
                        colSpan={columns.length}
                        className="bg-muted/40 p-0 whitespace-normal"
                      >
                        {/* The cell spans the whole (wider-than-view) table, so
                            pin the panel to the visible width: 100cqw of the
                            scroll container, stuck to its left edge. */}
                        <div className="@container sticky left-0 w-[100cqw]">
                          <PaymentDetailPanel payment={row.original} />
                        </div>
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
