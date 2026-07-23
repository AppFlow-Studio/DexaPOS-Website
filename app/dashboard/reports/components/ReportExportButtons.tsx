"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import {
  exportToCsv,
  exportToPdf,
  formatReportDateRange,
  type ExportColumn,
  type SummaryCardData,
} from "@/utils/export";

interface ReportExportButtonsProps<T extends Record<string, any>> {
  data: T[];
  columns: ExportColumn<T>[];
  /** Filename stem for the CSV, e.g. "sales-by-items" (date range is appended) */
  filenameBase: string;
  /** Human title used in the PDF header, e.g. "Sales by Items" */
  pdfTitle: string;
  dateFrom: Date;
  dateTo: Date;
  locationName?: string;
  /** Optional PDF summary cards. Max 3 — the PDF card row fits 3 across. */
  summaryCards?: SummaryCardData[];
  disabled?: boolean;
}

/**
 * Reusable CSV + PDF export buttons for report pages.
 * Wraps the shared exportToCsv / exportToPdf helpers with a loading state
 * for the (dynamically imported) PDF generator.
 */
export function ReportExportButtons<T extends Record<string, any>>({
  data,
  columns,
  filenameBase,
  pdfTitle,
  dateFrom,
  dateTo,
  locationName,
  summaryCards,
  disabled,
}: ReportExportButtonsProps<T>) {
  const [isExporting, setIsExporting] = useState(false);
  const range = formatReportDateRange(dateFrom, dateTo);
  const noData = disabled || !data.length;

  function handleExportCsv() {
    if (noData) return;
    exportToCsv(data, columns, `${filenameBase}-${range}`);
  }

  async function handleExportPdf() {
    if (noData) return;
    setIsExporting(true);
    try {
      await exportToPdf(
        data,
        columns,
        `${pdfTitle} - ${range}`,
        undefined,
        locationName,
        dateFrom,
        dateTo,
        summaryCards
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs gap-1.5"
        onClick={handleExportCsv}
        disabled={noData}
      >
        <Download className="h-3.5 w-3.5" />
        CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs gap-1.5"
        onClick={handleExportPdf}
        disabled={noData || isExporting}
      >
        {isExporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        PDF
      </Button>
    </div>
  );
}
