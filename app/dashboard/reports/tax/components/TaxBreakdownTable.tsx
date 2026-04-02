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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import type { TaxBreakdownRow } from "@/app/dashboard/reports/tax/types";
import { exportToCsv, exportToPdf, formatReportDateRange } from "@/utils/export";
import { format } from "date-fns";

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
  { value: "all", label: "All Types" },
  { value: "dine_in", label: "Dine In" },
  { value: "takeout", label: "Takeout" },
  { value: "delivery", label: "Delivery" },
  { value: "online", label: "Online" },
  { value: "catering", label: "Catering" },
];

const PAYMENT_METHODS = [
  { value: "all", label: "All Methods" },
  { value: "cash", label: "Cash" },
  { value: "card_spinapi", label: "Card" },
  { value: "card_dvpaylite", label: "Card (DVPay)" },
];

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatOrderType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPaymentMethod(method: string | null) {
  if (!method) return "—";
  if (method.startsWith("card")) return "Card";
  return method.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const exportColumns = [
  { key: "createdAt", header: "Date", format: (v: string) => format(new Date(v), "MM/dd/yyyy HH:mm") },
  { key: "orderNumber", header: "Order #" },
  { key: "orderType", header: "Order Type", format: (v: string) => formatOrderType(v) },
  { key: "subtotal", header: "Subtotal", format: (v: number) => formatCurrency(v) },
  { key: "taxAmount", header: "Tax Amount", format: (v: number) => formatCurrency(v) },
  { key: "taxRate", header: "Tax Rate", format: (v: number) => `${v.toFixed(2)}%` },
  { key: "paymentMethod", header: "Payment", format: (v: string | null) => formatPaymentMethod(v) },
  { key: "pricingMode", header: "Pricing Mode", format: (v: string | null) => v ?? "—" },
  { key: "taxRefunded", header: "Refunded Tax", format: (v: number) => v > 0 ? formatCurrency(v) : "—" },
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

  const totalPages = Math.ceil(count / pageSize);

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterOrderType} onValueChange={onFilterOrderType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Order Type" />
          </SelectTrigger>
          <SelectContent>
            {ORDER_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterPaymentMethod} onValueChange={onFilterPaymentMethod}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Payment Method" />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!data?.length}>
            <Download className="h-4 w-4 mr-1" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={!data?.length || isExporting}>
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1" />
            )}
            PDF
          </Button>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Order #</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">Tax Amount</TableHead>
              <TableHead className="text-right">Tax Rate</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Pricing</TableHead>
              <TableHead className="text-right">Refunded</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-muted animate-pulse rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data?.length ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No tax data found for the selected period.
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.orderId}>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(row.createdAt), "MM/dd/yy HH:mm")}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    #{row.orderNumber}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {formatOrderType(row.orderType)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(row.subtotal)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-green-700">
                    {formatCurrency(row.taxAmount)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {row.taxRate.toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatPaymentMethod(row.paymentMethod)}
                  </TableCell>
                  <TableCell>
                    {row.pricingMode ? (
                      <Badge
                        variant={row.pricingMode === "cash" ? "secondary" : "outline"}
                        className="text-xs capitalize"
                      >
                        {row.pricingMode}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right text-red-500 text-sm">
                    {row.taxRefunded > 0 ? formatCurrency(row.taxRefunded) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages} ({count} orders)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
