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
import { ReportPanel as Card, ReportPanelContent as CardContent, ReportPanelHeader as CardHeader, ReportPanelTitle as CardTitle } from "@/components/dashboard/reports/ReportPanel";
import {
  Download,
  Loader2,
  MapPin,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaxLocationRow } from "@/app/dashboard/reports/tax/types";
import { exportToCsv, exportToPdf, formatReportDateRange } from "@/utils/export";

interface TaxLocationTableProps {
  data: TaxLocationRow[] | undefined;
  isLoading: boolean;
  dateFrom: Date;
  dateTo: Date;
}

type SortKey = "locationName" | "taxableSales" | "grossTax" | "taxRefunded" | "netLiability";
type SortDir = "asc" | "desc";

function SortIcon({ col, active, dir }: { col: SortKey; active: SortKey; dir: SortDir }) {
  if (col !== active) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/40 ml-1 shrink-0" />;
  return dir === "asc"
    ? <ArrowUp className="h-3.5 w-3.5 text-[#0C4FD1] dark:text-[#6CA0FF] ml-1 shrink-0" />
    : <ArrowDown className="h-3.5 w-3.5 text-[#0C4FD1] dark:text-[#6CA0FF] ml-1 shrink-0" />;
}

function fmt(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

const exportColumns = [
  { key: "locationName", header: "Location" },
  { key: "salesTaxRate", header: "Configured Rate", format: (v: number | null) => v != null ? `${(v * 100).toFixed(2)}%` : "—" },
  { key: "taxableSales", header: "Taxable Sales", format: (v: number) => fmt(v) },
  { key: "grossTax", header: "Gross Tax", format: (v: number) => fmt(v) },
  { key: "taxRefunded", header: "Tax Refunded", format: (v: number) => fmt(v) },
  { key: "netLiability", header: "Net Liability", format: (v: number) => fmt(v) },
];

export function TaxLocationTable({ data, isLoading, dateFrom, dateTo }: TaxLocationTableProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("netLiability");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = data
    ? [...data].sort((a, b) => {
        const av = a[sortKey] ?? "";
        const bv = b[sortKey] ?? "";
        if (typeof av === "string" && typeof bv === "string")
          return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
      })
    : data;

  const maxLiability = Math.max(...(data ?? []).map((r) => r.netLiability), 0);

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
    exportToCsv(data, exportColumns as any, `tax-by-location-${formatReportDateRange(dateFrom, dateTo)}`);
  }

  async function handleExportPdf() {
    if (!data) return;
    setIsExporting(true);
    try {
      await exportToPdf(data, exportColumns as any, `Tax by Location - ${formatReportDateRange(dateFrom, dateTo)}`, undefined, undefined, dateFrom, dateTo);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span className="text-xs font-medium">
            {isLoading ? "Loading…" : `${data?.length ?? 0} location${(data?.length ?? 0) !== 1 ? "s" : ""}`}
          </span>
        </div>
        <div className="flex gap-2">
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
            {isExporting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />
            }
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
                onClick={() => handleSort("locationName")}
              >
                <div className="flex items-center">
                  Location
                  <SortIcon col="locationName" active={sortKey} dir={sortDir} />
                </div>
              </TableHead>
              <TableHead className="text-[0.8125rem] font-normal text-muted-foreground text-right">
                Tax Rate
              </TableHead>
              <TableHead
                className="text-[0.8125rem] font-normal text-muted-foreground cursor-pointer select-none text-right"
                onClick={() => handleSort("taxableSales")}
              >
                <div className="flex items-center justify-end">
                  Taxable Sales
                  <SortIcon col="taxableSales" active={sortKey} dir={sortDir} />
                </div>
              </TableHead>
              <TableHead
                className="text-[0.8125rem] font-normal text-muted-foreground cursor-pointer select-none text-right"
                onClick={() => handleSort("grossTax")}
              >
                <div className="flex items-center justify-end">
                  Gross Tax
                  <SortIcon col="grossTax" active={sortKey} dir={sortDir} />
                </div>
              </TableHead>
              <TableHead
                className="text-[0.8125rem] font-normal text-muted-foreground cursor-pointer select-none text-right"
                onClick={() => handleSort("taxRefunded")}
              >
                <div className="flex items-center justify-end">
                  Refunded
                  <SortIcon col="taxRefunded" active={sortKey} dir={sortDir} />
                </div>
              </TableHead>
              <TableHead
                className="text-[0.8125rem] font-normal text-muted-foreground cursor-pointer select-none text-right pr-5"
                onClick={() => handleSort("netLiability")}
              >
                <div className="flex items-center justify-end">
                  Net Liability
                  <SortIcon col="netLiability" active={sortKey} dir={sortDir} />
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i} className="border-0">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j} className="py-3.5">
                      <div className="h-4 bg-muted animate-pulse rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !sorted?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <MapPin className="h-7 w-7 opacity-30" />
                    <p className="text-sm font-medium">No location data available</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <>
                {sorted.map((row) => {
                  const barPct = maxLiability > 0 ? (row.netLiability / maxLiability) * 100 : 0;
                  return (
                    <TableRow
                      key={row.locationId}
                      className="border-0 bg-card/70 transition-colors hover:bg-muted/40"
                    >
                      <TableCell className="pl-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/60">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <span className="text-sm font-medium">{row.locationName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 text-right">
                        {row.salesTaxRate != null ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {(row.salesTaxRate * 100).toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3.5 text-right text-sm">
                        {fmt(row.taxableSales)}
                      </TableCell>
                      <TableCell className="py-3.5 text-right">
                        <span className="text-sm font-semibold text-foreground">
                          {fmt(row.grossTax)}
                        </span>
                      </TableCell>
                      <TableCell className="py-3.5 text-right">
                        {row.taxRefunded > 0 ? (
                          <span className="text-sm font-medium text-foreground">
                            -{fmt(row.taxRefunded)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3.5 pr-5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm font-semibold text-foreground">
                            {fmt(row.netLiability)}
                          </span>
                          <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-foreground/35"
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {/* Totals row */}
                {totals && (
                  <TableRow className="border-t-2 border-border bg-muted/30 font-semibold">
                    <TableCell className="pl-5 py-3.5 text-sm font-bold" colSpan={2}>
                      Total — All Locations
                    </TableCell>
                    <TableCell className="py-3.5 text-right text-sm font-bold">
                      {fmt(totals.taxableSales)}
                    </TableCell>
                    <TableCell className="py-3.5 text-right">
                      <span className="text-sm font-bold text-foreground">
                        {fmt(totals.grossTax)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5 text-right">
                      {totals.taxRefunded > 0 ? (
                        <span className="text-sm font-bold text-foreground">
                          -{fmt(totals.taxRefunded)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 pr-5 text-right">
                      <span className="text-sm font-bold text-foreground">
                        {fmt(totals.netLiability)}
                      </span>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
