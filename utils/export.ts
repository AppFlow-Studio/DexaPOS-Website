export interface ExportColumn<T> {
  key: keyof T | string;
  header: string;
  format?: (value: any, row: T) => string;
}

/**
 * Export data to CSV and trigger browser download.
 * BOM-prefixed for Excel compatibility.
 */
export function exportToCsv<T extends Record<string, any>>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string
): void {
  const BOM = "\uFEFF";
  const header = columns.map((c) => `"${c.header}"`).join(",");
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value = row[col.key as keyof T];
        const formatted = col.format
          ? col.format(value, row)
          : String(value ?? "");
        return `"${formatted.replace(/"/g, '""')}"`;
      })
      .join(",")
  );
  const csv = BOM + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Format a number as USD currency string for CSV */
export function formatCurrencyForExport(amount: number): string {
  return amount.toFixed(2);
}

/** Format a date string for CSV */
export function formatDateForExport(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** Format date range for report filenames and titles */
export function formatReportDateRange(dateFrom: Date, dateTo: Date): string {
  const fromStr = dateFrom.toISOString().split("T")[0];
  const toStr = dateTo.toISOString().split("T")[0];

  if (fromStr === toStr) {
    return fromStr;
  }
  return `${fromStr} to ${toStr}`;
}

export interface SummaryCardData {
  label: string;
  value: string | number;
}

/**
 * Export data to PDF and trigger browser download.
 * Creates a professional PDF with DexaPOS branding header.
 */
export async function exportToPdf<T extends Record<string, any>>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string,
  merchantName?: string,
  locationName?: string,
  dateFrom?: Date,
  dateTo?: Date,
  summaryCards?: SummaryCardData[]
): Promise<void> {
  try {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF({ unit: "pt" });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;

    // Darker blue for header background (was [25, 118, 210])
    const dexaBlue: [number, number, number] = [0, 70, 140];
    const dexaDark: [number, number, number] = [0, 70, 140];

    // ================= HEADER BACKGROUND =================
    doc.setFillColor(...dexaBlue);
    doc.rect(0, 0, pageWidth, 70, "F");

    // ================= RED UNDERLINE =================
    const dexaRed: [number, number, number] = [220, 38, 38];
    doc.setDrawColor(...dexaRed);
    doc.setLineWidth(2);
    doc.line(0, 70, pageWidth, 70);

    // ================= LOGO & BRANDING =================
    // Logo box (top left) - Red background with white text
    doc.setFillColor(...dexaRed);
    doc.roundedRect(margin, 15, 40, 40, 5, 5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text("DEXA", margin + 20, 36, { align: "center" });
    doc.setFontSize(9);
    doc.text("POS", margin + 20, 47, { align: "center" });

    // Title and merchant info (top right)
    // Remove date from filename for display
    const displayFilename = filename.replace(/ - \d{4}-\d{2}-\d{2}.*/, "");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text(displayFilename, pageWidth - margin, 25, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(220, 220, 220);
    const merchantInfo =
      merchantName && locationName
        ? `${merchantName} | ${locationName}`
        : "Report";
    doc.text(merchantInfo, pageWidth - margin, 45, { align: "right" });

    // Period and Generated info below header (left and right)
    const periodText =
      dateFrom && dateTo
        ? formatReportDateRange(dateFrom, dateTo)
        : "N/A";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(`period: ${periodText}`, margin, 115);

    doc.text(
      `generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`,
      pageWidth - margin,
      115,
      { align: "right" }
    );

    let yPosition = 130;

    // ================= SUMMARY CARDS =================
    if (summaryCards && summaryCards.length > 0) {
      const cardWidth = (contentWidth - 20) / 3;
      const cardHeight = 60;
      const gap = 10;

      summaryCards.forEach((card, index) => {
        const x = margin + index * (cardWidth + gap);

        // Card background
        doc.setFillColor(248, 248, 248);
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.5);
        doc.roundedRect(x, yPosition, cardWidth, cardHeight, 3, 3, "FD");

        // Label
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text(card.label, x + 8, yPosition + 16, {
          maxWidth: cardWidth - 16,
        });

        // Value
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(...dexaBlue);
        doc.text(String(card.value), x + 8, yPosition + 45, {
          maxWidth: cardWidth - 16,
        });
      });

      yPosition += cardHeight + 25;
    }

    // ================= TABLE =================
    autoTable(doc, {
      startY: yPosition,
      margin: { left: margin, right: margin },
      head: [columns.map((c) => c.header)],
      body: data.map((row) =>
        columns.map((col) => {
          const value = row[col.key as keyof T];
          return col.format
            ? col.format(value, row)
            : String(value ?? "");
        })
      ),
      theme: "striped",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 8,
        overflow: "linebreak",
        valign: "middle",
        textColor: 60,
      },
      headStyles: {
        fillColor: dexaDark,
        textColor: 255,
        fontStyle: "bold",
        fontSize: 10,
        lineColor: dexaBlue,
        lineWidth: 0.5,
      },
      alternateRowStyles: {
        fillColor: [245, 248, 255],
      },
      rowPageBreak: "avoid",
      columnStyles: Object.fromEntries(
        columns.map((_, i) => [
          i,
          { cellWidth: contentWidth / columns.length },
        ])
      ),
      didDrawPage: (data: any) => {
        // Repeating header on new pages
        if (data.pageNumber > 1) {
          doc.setFillColor(...dexaBlue);
          doc.rect(0, 0, pageWidth, 25, "F");

          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(255, 255, 255);
          doc.text(displayFilename, margin, 16);
        }
      },
    });

    // Add page numbers to all pages
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${i} of ${pageCount}`,
        pageWidth - margin,
        doc.internal.pageSize.getHeight() - 15,
        { align: "right" }
      );
    }

    doc.save(`${filename}.pdf`);
  } catch (error) {
    console.error("PDF export failed:", error);
  }
}