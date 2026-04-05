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
import { Download, Loader2, MapPin } from "lucide-react";
import type { TaxLocationRow } from "@/app/dashboard/reports/tax/types";
import { exportToCsv, exportToPdf, formatReportDateRange } from "@/utils/export";

interface TaxLocationTableProps {
  data: TaxLocationRow[] | undefined;
  isLoading: boolean;
  dateFrom: Date;
  dateTo: Date;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

const exportColumns = [
  { key: "locationName", header: "Location" },
  {
    key: "salesTaxRate",
    header: "Configured Rate",
    format: (v: number | null) => (v != null ? `${(v * 100).toFixed(2)}%` : "—"),
  },
  { key: "taxableSales", header: "Taxable Sales", format: (v: number) => formatCurrency(v) },
  { key: "grossTax", header: "Gross Tax", format: (v: number) => formatCurrency(v) },
  { key: "taxRefunded", header: "Tax Refunded", format: (v: number) => formatCurrency(v) },
  { key: "netLiability", header: "Net Liability", format: (v: number) => formatCurrency(v) },
];

export function TaxLocationTable({
  data,
  isLoading,
  dateFrom,
  dateTo,
}: TaxLocationTableProps) {
  const [isExporting, setIsExporting] = useState(false);

  const totals =
    data && data.length > 1
      ? {
          taxableSales: data.reduce((s, r) => s + r.taxableSales, 0),
          grossTax: data.reduce((s, r) => s + r.grossTax, 0),
          taxRefunded: data.reduce((s, r) => s + r.taxRefunded, 0),
          netLiability: data.reduce((s, r) => s + r.netLiability, 0),
        }
      : null;

  function handleExportCsv() {
    if (!data) return;
    exportToCsv(
      data,
      exportColumns as any,
      `tax-by-location-${formatReportDateRange(dateFrom, dateTo)}`
    );
  }

  async function handleExportPdf() {
    if (!data) return;
    setIsExporting(true);
    try {
      await exportToPdf(
        data,
        exportColumns as any,
        `Tax by Location - ${formatReportDateRange(dateFrom, dateTo)}`,
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span>
            {data?.length ?? 0} location{(data?.length ?? 0) !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex gap-2">
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
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Configured Rate</TableHead>
              <TableHead className="text-right">Taxable Sales</TableHead>
              <TableHead className="text-right">Gross Tax</TableHead>
              <TableHead className="text-right">Tax Refunded</TableHead>
              <TableHead className="text-right">Net Liability</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-muted animate-pulse rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No location data available.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {data.map((row) => (
                  <TableRow key={row.locationId}>
                    <TableCell className="font-medium">{row.locationName}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {row.salesTaxRate != null ? (
                        <Badge variant="outline" className="text-xs">
                          {(row.salesTaxRate * 100).toFixed(2)}%
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.taxableSales)}
                    </TableCell>
                    <TableCell className="text-right text-green-700 font-medium">
                      {formatCurrency(row.grossTax)}
                    </TableCell>
                    <TableCell className="text-right text-red-500">
                      {row.taxRefunded > 0 ? formatCurrency(row.taxRefunded) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-bold text-blue-700">
                      {formatCurrency(row.netLiability)}
                    </TableCell>
                  </TableRow>
                ))}
                {totals && (
                  <TableRow className="border-t-2 bg-muted/40 font-semibold">
                    <TableCell colSpan={2}>Total (All Locations)</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.taxableSales)}
                    </TableCell>
                    <TableCell className="text-right text-green-700">
                      {formatCurrency(totals.grossTax)}
                    </TableCell>
                    <TableCell className="text-right text-red-500">
                      {totals.taxRefunded > 0 ? formatCurrency(totals.taxRefunded) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-blue-700">
                      {formatCurrency(totals.netLiability)}
                    </TableCell>
                  </TableRow>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
