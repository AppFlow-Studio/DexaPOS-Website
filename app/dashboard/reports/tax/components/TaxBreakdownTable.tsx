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
import { ReportPanel as Card, ReportPanelContent as CardContent } from "@/components/dashboard/reports/ReportPanel";
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
import {
  MobileColumnsButton,
  initialHiddenColumns,
  type ReportColumn,
} from "@/components/dashboard/reports/MobileColumnsButton";
import { useIsMobile } from "@/hooks/use-mobile";

/** Nine columns is the widest report table, so most default to hidden on mobile. */
const TABLE_COLUMNS: ReportColumn[] = [
  { id: "createdAt", label: "Date", locked: true },
  { id: "orderNumber", label: "Order #" },
  { id: "orderType", label: "Type", defaultHidden: true },
  { id: "subtotal", label: "Subtotal", defaultHidden: true },
  { id: "taxAmount", label: "Tax", locked: true },
  { id: "taxRate", label: "Rate", defaultHidden: true },
  { id: "paymentMethod", label: "Payment", defaultHidden: true },
  { id: "pricingMode", label: "Pricing", defaultHidden: true },
  { id: "taxRefunded", label: "Refunded", defaultHidden: true },
];

// Exported so page.tsx can manage sort state at the top level
export type SortKey = "createdAt" | "subtotal" | "taxAmount" | "taxRate" | "taxRefunded";
export type SortDir = "asc" | "desc";

// Columns sorted at the database level (correct across all pages).
// taxRate and taxRefunded are computed/joined — sorted client-side on the current page.
const DB_SORTED_COLS = new Set<SortKey>(["createdAt", "subtotal", "taxAmount"]);

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
  // Sort state is owned by the page so the hook re-fetches with server-side sort
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
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

const ORDER_TYPE_STYLE = "bg-muted/60 text-muted-foreground";

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

function SortIcon({
  col,
  active,
  dir,
}: {
  col: SortKey;
  active: SortKey;
  dir: SortDir;
}) {
  if (col !== active)
    return (
      <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/40 ml-1 shrink-0" />
    );
  return dir === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5 text-[#0C4FD1] dark:text-[#6CA0FF] ml-1 shrink-0" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5 text-[#0C4FD1] dark:text-[#6CA0FF] ml-1 shrink-0" />
  );
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
  sortKey,
  sortDir,
  onSort,
}: TaxBreakdownTableProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [hiddenCols, setHiddenCols] = useState(() =>
    initialHiddenColumns(TABLE_COLUMNS),
  );
  const isMobile = useIsMobile();

  /** Column hiding only applies at mobile widths; desktop always shows all. */
  const isColVisible = (id: string) => !isMobile || !hiddenCols.has(id);
  const visibleColCount = TABLE_COLUMNS.filter((c) => isColVisible(c.id)).length;

  const totalPages = Math.ceil(count / pageSize);
  const hasFilters = filterOrderType !== "all" || filterPaymentMethod !== "all";

  // DB-sortable columns are already ordered by the server.
  // For computed columns (taxRate, taxRefunded), sort the current page in the
  // client. This is intentional and limited to the current page.
  const isClientSort = !DB_SORTED_COLS.has(sortKey);
  const sorted =
    isClientSort && data
      ? [...data].sort((a, b) => {
          const av = a[sortKey as keyof TaxBreakdownRow] ?? 0;
          const bv = b[sortKey as keyof TaxBreakdownRow] ?? 0;
          if (typeof av === "string" && typeof bv === "string")
            return sortDir === "asc"
              ? av.localeCompare(bv)
              : bv.localeCompare(av);
          return sortDir === "asc"
            ? (av as number) - (bv as number)
            : (bv as number) - (av as number);
        })
      : data;

  function handleExportCsv() {
    if (!data) return;
    exportToCsv(
      data,
      exportColumns as any,
      `tax-breakdown-${formatReportDateRange(dateFrom, dateTo)}`
    );
  }

  async function handleExportPdf() {
    if (!data) return;
    setIsExporting(true);
    try {
      await exportToPdf(
        data,
        exportColumns as any,
        `Tax Breakdown - ${formatReportDateRange(dateFrom, dateTo)}`,
        undefined,
        undefined,
        dateFrom,
        dateTo
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      {/* Toolbar */}
      <div className="flex min-w-0 flex-col justify-between gap-3 px-5 pb-4 pt-5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-wrap gap-2">
          <Select value={filterOrderType} onValueChange={onFilterOrderType}>
            <SelectTrigger className="h-9 w-44 border-0 bg-muted/60 text-[0.8125rem] shadow-none">
              <SelectValue placeholder="Order type" />
            </SelectTrigger>
            <SelectContent>
              {ORDER_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filterPaymentMethod}
            onValueChange={onFilterPaymentMethod}
          >
            <SelectTrigger className="h-9 w-44 border-0 bg-muted/60 text-[0.8125rem] shadow-none">
              <SelectValue placeholder="Payment method" />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs text-muted-foreground gap-1.5"
              onClick={() => {
                onFilterOrderType("all");
                onFilterPaymentMethod("all");
              }}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>

        {/* Wraps instead of overflowing the card on a phone. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {isLoading ? "Loading…" : `${count.toLocaleString()} orders`}
          </span>
          <MobileColumnsButton
            columns={TABLE_COLUMNS}
            hidden={hiddenCols}
            onChange={setHiddenCols}
          />
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

      <CardContent className="p-0">
        <Table variant="data">
          <TableHeader className="[&_tr]:border-0">
            <TableRow className="hover:bg-transparent">
              <TableHead
                className="text-[0.8125rem] font-normal text-muted-foreground cursor-pointer select-none"
                onClick={() => onSort("createdAt")}
              >
                <div className="flex items-center">
                  Date
                  <SortIcon col="createdAt" active={sortKey} dir={sortDir} />
                </div>
              </TableHead>
              {isColVisible("orderNumber") && (
                <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">
                  Order #
                </TableHead>
              )}
              {isColVisible("orderType") && (
                <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">
                  Type
                </TableHead>
              )}
              {isColVisible("subtotal") && (
                <TableHead
                  className="text-[0.8125rem] font-normal text-muted-foreground cursor-pointer select-none text-right"
                  onClick={() => onSort("subtotal")}
                >
                  <div className="flex items-center justify-end">
                    Subtotal
                    <SortIcon col="subtotal" active={sortKey} dir={sortDir} />
                  </div>
                </TableHead>
              )}
              <TableHead
                className="text-[0.8125rem] font-normal text-muted-foreground cursor-pointer select-none text-right"
                onClick={() => onSort("taxAmount")}
              >
                <div className="flex items-center justify-end">
                  Tax
                  <SortIcon col="taxAmount" active={sortKey} dir={sortDir} />
                </div>
              </TableHead>
              {/* taxRate is a computed field — sort applies to current page only */}
              {isColVisible("taxRate") && (
                <TableHead
                  className="text-[0.8125rem] font-normal text-muted-foreground cursor-pointer select-none text-right"
                  onClick={() => onSort("taxRate")}
                  title="Sorting applies to the current page only"
                >
                  <div className="flex items-center justify-end">
                    Rate
                    <SortIcon col="taxRate" active={sortKey} dir={sortDir} />
                    {sortKey === "taxRate" && (
                      <span className="ml-1 text-[9px] text-muted-foreground/60 font-normal leading-none">
                        pg
                      </span>
                    )}
                  </div>
                </TableHead>
              )}
              {isColVisible("paymentMethod") && (
                <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">
                  Payment
                </TableHead>
              )}
              {isColVisible("pricingMode") && (
                <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">
                  Pricing
                </TableHead>
              )}
              {/* taxRefunded is a joined field — sort applies to current page only */}
              {isColVisible("taxRefunded") && (
                <TableHead
                  className="text-[0.8125rem] font-normal text-muted-foreground cursor-pointer select-none text-right pr-5"
                  onClick={() => onSort("taxRefunded")}
                  title="Sorting applies to the current page only"
                >
                  <div className="flex items-center justify-end">
                    Refunded
                    <SortIcon col="taxRefunded" active={sortKey} dir={sortDir} />
                    {sortKey === "taxRefunded" && (
                      <span className="ml-1 text-[9px] text-muted-foreground/60 font-normal leading-none">
                        pg
                      </span>
                    )}
                  </div>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-0">
                  {Array.from({ length: visibleColCount }).map((_, j) => (
                    <TableCell key={j} className="py-3.5">
                      <div className="h-4 bg-muted animate-pulse rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !sorted?.length ? (
              <TableRow>
                <TableCell colSpan={visibleColCount} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Receipt className="h-8 w-8 opacity-30" />
                    <p className="text-sm font-medium">
                      No tax data found for this period
                    </p>
                    {hasFilters && (
                      <button
                        className="text-xs text-primary underline underline-offset-2"
                        onClick={() => {
                          onFilterOrderType("all");
                          onFilterPaymentMethod("all");
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((row) => {
                return (
                  <TableRow
                    key={row.orderId}
                    className="border-0 bg-card/70 transition-colors hover:bg-muted/40"
                  >
                    <TableCell className="pl-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(row.createdAt), "MM/dd/yy HH:mm")}
                    </TableCell>
                    {isColVisible("orderNumber") && (
                      <TableCell className="py-3.5 font-mono text-xs font-medium">
                        #{row.orderNumber}
                      </TableCell>
                    )}
                    {isColVisible("orderType") && (
                      <TableCell className="py-3.5">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
                            ORDER_TYPE_STYLE
                          )}
                        >
                          {fmtOrderType(row.orderType)}
                        </span>
                      </TableCell>
                    )}
                    {isColVisible("subtotal") && (
                      <TableCell className="py-3.5 text-right text-sm font-medium">
                        {fmt(row.subtotal)}
                      </TableCell>
                    )}
                    <TableCell className="py-3.5 text-right">
                      <span className="text-sm font-semibold text-foreground">
                        {fmt(row.taxAmount)}
                      </span>
                    </TableCell>
                    {isColVisible("taxRate") && (
                      <TableCell className="py-3.5 text-right text-xs text-muted-foreground">
                        {row.taxRate.toFixed(2)}%
                      </TableCell>
                    )}
                    {isColVisible("paymentMethod") && (
                      <TableCell className="py-3.5 text-sm">
                        {fmtPayment(row.paymentMethod)}
                      </TableCell>
                    )}
                    {isColVisible("pricingMode") && (
                      <TableCell className="py-3.5">
                        {row.pricingMode ? (
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize",
                              "bg-muted/60 text-muted-foreground"
                            )}
                          >
                            {row.pricingMode}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    )}
                    {isColVisible("taxRefunded") && (
                      <TableCell className="py-3.5 text-right pr-5">
                        {row.taxRefunded > 0 ? (
                          <span className="text-sm font-medium text-foreground">
                            -{fmt(row.taxRefunded)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3.5">
          <p className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} · {count.toLocaleString()} orders
          </p>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
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
