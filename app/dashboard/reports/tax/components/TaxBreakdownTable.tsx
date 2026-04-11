"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Receipt,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { TaxBreakdownRow } from "@/app/dashboard/reports/tax/types";
import { exportToCsv, exportToPdf, formatReportDateRange } from "@/utils/export";

interface TaxBreakdownTableProps {
  data: TaxBreakdownRow[] | undefined;
  count: number;
  isLoading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  filterOrderType: string;
  filterPaymentMethod: string;
  onFilterOrderType: (v: string) => void;
  onFilterPaymentMethod: (v: string) => void;
  dateFrom: Date;
  dateTo: Date;
}

const ORDER_TYPES = [
  { value: "all", label: "All Order Types" },
  { value: "dine_in", label: "Dine In" },
  { value: "takeout", label: "Takeout" },
  { value: "delivery", label: "Delivery" },
  { value: "online", label: "Online" },
  { value: "catering", label: "Catering" },
];

const PAYMENT_METHODS = [
  { value: "all", label: "All Payments" },
  { value: "cash", label: "Cash" },
  { value: "card_spinapi", label: "Card" },
  { value: "card_dvpaylite", label: "Card (DVPay)" },
];

const ORDER_TYPE_COLORS: Record<string, string> = {
  dine_in:  { bg: "bg-indigo-50",  text: "text-indigo-600" },
  takeout:  { bg: "bg-amber-50",   text: "text-amber-600" },
  delivery: { bg: "bg-emerald-50", text: "text-emerald-600" },
  online:   { bg: "bg-blue-50",    text: "text-blue-600" },
  catering: { bg: "bg-rose-50",    text: "text-rose-600" },
} as any;

function fmt(value: number) {
  return `$${value.toFixed(2)}`;
}

function fmtOrderType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtPayment(method: string | null) {
  if (!method) return "—";
  if (method.startsWith("card")) return "Card";
  return method.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type SortKey = "createdAt" | "subtotal" | "taxAmount" | "taxRate" | "taxRefunded";
type SortDir = "asc" | "desc";

function SortIcon({ col, active, dir }: { col: SortKey; active: SortKey; dir: SortDir }) {
  if (col !== active) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/40 ml-1 shrink-0" />;
  return dir === "asc"
    ? <ArrowUp className="h-3.5 w-3.5 text-primary ml-1 shrink-0" />
    : <ArrowDown className="h-3.5 w-3.5 text-primary ml-1 shrink-0" />;
}

const exportColumns = [
  { key: "createdAt", header: "Date", format: (v: string) => format(new Date(v), "MM/dd/yyyy HH:mm") },
  { key: "orderNumber", header: "Order #" },
  { key: "orderType", header: "Order Type", format: (v: string) => fmtOrderType(v) },
  { key: "subtotal", header: "Subtotal", format: (v: number) => fmt(v) },
  { key: "taxAmount", header: "Tax Amount", format: (v: number) => fmt(v) },
  { key: "taxRate", header: "Tax Rate", format: (v: number) => `${v.toFixed(2)}%` },
  { key: "paymentMethod", header: "Payment", format: (v: string | null) => fmtPayment(v) },
  { key: "pricingMode", header: "Pricing Mode", format: (v: string | null) => v ?? "—" },
  { key: "taxRefunded", header: "Refunded Tax", format: (v: number) => v > 0 ? fmt(v) : "—" },
];

export function TaxBreakdownTable({
  data,
  count,
  isLoading,
  page,
  pageSize,
  onPageChange,
  filterOrderType,
  filterPaymentMethod,
  onFilterOrderType,
  onFilterPaymentMethod,
  dateFrom,
  dateTo,
}: TaxBreakdownTableProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const totalPages = Math.ceil(count / pageSize);
  const hasFilters = filterOrderType !== "all" || filterPaymentMethod !== "all";

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  // Client-side sort on current page
  const sorted = data
    ? [...data].sort((a, b) => {
        const av = a[sortKey as keyof TaxBreakdownRow] ?? 0;
        const bv = b[sortKey as keyof TaxBreakdownRow] ?? 0;
        if (typeof av === "string" && typeof bv === "string")
          return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
      })
    : data;

  function handleExportCsv() {
    if (!data) return;
    exportToCsv(data, exportColumns as any, `tax-breakdown-${formatReportDateRange(dateFrom, dateTo)}`);
  }

  async function handleExportPdf() {
    if (!data) return;
    setIsExporting(true);
    try {
      await exportToPdf(data, exportColumns as any, `Tax Breakdown - ${formatReportDateRange(dateFrom, dateTo)}`, undefined, undefined, dateFrom, dateTo);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-card rounded-2xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between px-5 pt-5 pb-4 border-b border-border/50">
        <div className="flex flex-wrap gap-2">
          <Select value={filterOrderType} onValueChange={onFilterOrderType}>
            <SelectTrigger className="h-9 w-44 text-sm rounded-lg bg-muted/40 border-0 focus:ring-1">
              <SelectValue placeholder="Order type" />
            </SelectTrigger>
            <SelectContent>
              {ORDER_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterPaymentMethod} onValueChange={onFilterPaymentMethod}>
            <SelectTrigger className="h-9 w-44 text-sm rounded-lg bg-muted/40 border-0 focus:ring-1">
              <SelectValue placeholder="Payment method" />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs text-muted-foreground gap-1.5"
              onClick={() => { onFilterOrderType("all"); onFilterPaymentMethod("all"); }}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            {isLoading ? "Loading…" : `${count.toLocaleString()} orders`}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleExportCsv}
            disabled={!data?.length}
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleExportPdf}
            disabled={!data?.length || isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            PDF
          </Button>
        </div>
      </div>

      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b border-border/50">
              <TableHead
                className="pl-5 text-xs font-semibold text-muted-foreground cursor-pointer select-none"
                onClick={() => handleSort("createdAt")}
              >
                <div className="flex items-center">
                  Date
                  <SortIcon col="createdAt" active={sortKey} dir={sortDir} />
                </div>
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Order #</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Type</TableHead>
              <TableHead
                className="text-xs font-semibold text-muted-foreground cursor-pointer select-none text-right"
                onClick={() => handleSort("subtotal")}
              >
                <div className="flex items-center justify-end">
                  Subtotal
                  <SortIcon col="subtotal" active={sortKey} dir={sortDir} />
                </div>
              </TableHead>
              <TableHead
                className="text-xs font-semibold text-muted-foreground cursor-pointer select-none text-right"
                onClick={() => handleSort("taxAmount")}
              >
                <div className="flex items-center justify-end">
                  Tax
                  <SortIcon col="taxAmount" active={sortKey} dir={sortDir} />
                </div>
              </TableHead>
              <TableHead
                className="text-xs font-semibold text-muted-foreground cursor-pointer select-none text-right"
                onClick={() => handleSort("taxRate")}
              >
                <div className="flex items-center justify-end">
                  Rate
                  <SortIcon col="taxRate" active={sortKey} dir={sortDir} />
                </div>
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Payment</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Pricing</TableHead>
              <TableHead
                className="text-xs font-semibold text-muted-foreground cursor-pointer select-none text-right pr-5"
                onClick={() => handleSort("taxRefunded")}
              >
                <div className="flex items-center justify-end">
                  Refunded
                  <SortIcon col="taxRefunded" active={sortKey} dir={sortDir} />
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-b border-border/30">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j} className="py-3.5">
                      <div className="h-4 bg-muted animate-pulse rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !sorted?.length ? (
              <TableRow>
                <TableCell colSpan={9} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Receipt className="h-8 w-8 opacity-30" />
                    <p className="text-sm font-medium">
                      No tax data found for this period
                    </p>
                    {hasFilters && (
                      <button
                        className="text-xs text-primary underline underline-offset-2"
                        onClick={() => { onFilterOrderType("all"); onFilterPaymentMethod("all"); }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((row) => {
                const typeStyle = ORDER_TYPE_COLORS[row.orderType] ?? { bg: "bg-muted", text: "text-muted-foreground" };
                return (
                  <TableRow
                    key={row.orderId}
                    className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="pl-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(row.createdAt), "MM/dd/yy HH:mm")}
                    </TableCell>
                    <TableCell className="py-3.5 font-mono text-xs font-medium">
                      #{row.orderNumber}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
                          typeStyle.bg,
                          typeStyle.text
                        )}
                      >
                        {fmtOrderType(row.orderType)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5 text-right text-sm font-medium">
                      {fmt(row.subtotal)}
                    </TableCell>
                    <TableCell className="py-3.5 text-right">
                      <span className="text-sm font-semibold text-emerald-600">
                        {fmt(row.taxAmount)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5 text-right text-xs text-muted-foreground">
                      {row.taxRate.toFixed(2)}%
                    </TableCell>
                    <TableCell className="py-3.5 text-sm">
                      {fmtPayment(row.paymentMethod)}
                    </TableCell>
                    <TableCell className="py-3.5">
                      {row.pricingMode ? (
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize",
                            row.pricingMode === "cash"
                              ? "bg-amber-50 text-amber-600"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {row.pricingMode}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 text-right pr-5">
                      {row.taxRefunded > 0 ? (
                        <span className="text-sm font-medium text-rose-500">
                          -{fmt(row.taxRefunded)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} · {count.toLocaleString()} orders
          </p>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-lg"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-lg"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
