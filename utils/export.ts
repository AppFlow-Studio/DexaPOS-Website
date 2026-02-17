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
    const doc = new jsPDF();

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - 2 * margin;

    // ============ HEADER SECTION ============
    // White background header with DexaPOS branding
    const dexaBlue: [number, number, number] = [25, 118, 210]; // DexaPOS blue
    const dexaDarkBlue: [number, number, number] = [13, 71, 161]; // Darker blue for tables

    // White header background
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, 24, "F");

    // Blue accent line at top
    doc.setFillColor(dexaBlue[0], dexaBlue[1], dexaBlue[2]);
    doc.rect(0, 0, pageWidth, 2, "F");

    // Blue logo box (left side)
    doc.setFillColor(dexaBlue[0], dexaBlue[1], dexaBlue[2]);
    doc.rect(margin, 4, 8, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(255, 255, 255);
    doc.text("DEXA", margin + 1, 7);
    doc.setFontSize(5);
    doc.text("POS", margin + 1, 9.5);

    // "Dexa POS" text next to logo
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(dexaDarkBlue[0], dexaDarkBlue[1], dexaDarkBlue[2]);
    doc.text("Dexa POS", margin + 10, 8);

    // Report type and merchant info (right side)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(filename, pageWidth - margin - 50, 6);
    doc.setFontSize(7);
    const merchantInfo = merchantName && locationName ? `${merchantName} | ${locationName}` : "Location Information";
    doc.text(merchantInfo, pageWidth - margin - 50, 10);

    // Blue divider line below header
    doc.setFillColor(dexaBlue[0], dexaBlue[1], dexaBlue[2]);
    doc.rect(0, 25, pageWidth, 1.5, "F");

    // Period and Generated info (below divider)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    const periodText = dateFrom && dateTo ? formatReportDateRange(dateFrom, dateTo) : "Period: N/A";
    doc.text(`Period: ${periodText}`, margin, 30);
    doc.text(`Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, pageWidth - margin - 40, 30);

    // Summary Cards Section
    let yPosition = 35;
    if (summaryCards && summaryCards.length > 0) {
      yPosition = 35;
      const cardWidth = (contentWidth - 8) / 3; // 3 columns with small gaps
      const cardHeight = 16;
      const cardGap = 4;

      summaryCards.forEach((card, idx) => {
        const cardX = margin + idx * (cardWidth + cardGap);

        // Card background (light gray)
        doc.setFillColor(248, 248, 248);
        doc.rect(cardX, yPosition, cardWidth, cardHeight, "F");

        // Card border
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.5);
        doc.rect(cardX, yPosition, cardWidth, cardHeight);

        // Card label
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        doc.text(String(card.label), cardX + 2, yPosition + 4, {
          maxWidth: cardWidth - 4,
          align: "left",
        });

        // Card value
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(40, 40, 40);
        doc.text(String(card.value), cardX + 2, yPosition + 11, {
          maxWidth: cardWidth - 4,
          align: "left",
        });
      });
      yPosition += cardHeight + 8;
    }

    // Table setup
    yPosition = yPosition + 5;
    if (columns.length === 0) return;
    const colWidth = contentWidth / columns.length;
    const rowHeight = 8;
    const headerHeight = 8;

    // Draw headers with DexaPOS dark blue theme
    const drawHeaders = (y: number) => {
      doc.setFillColor(dexaDarkBlue[0], dexaDarkBlue[1], dexaDarkBlue[2]); // DexaPOS dark blue
      doc.setDrawColor(dexaDarkBlue[0], dexaDarkBlue[1], dexaDarkBlue[2]);

      columns.forEach((_, idx) => {
        const x = margin + idx * colWidth;
        doc.rect(x, y, colWidth, headerHeight, "FD");
      });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);

      columns.forEach((col, idx) => {
        const x = margin + idx * colWidth;
        const headerText = col.header;
        doc.text(headerText, x + 2, y + 5.5, {
          maxWidth: colWidth - 4,
          align: "left",
        });
      });
    };

    drawHeaders(yPosition);
    yPosition += headerHeight;

    // Data rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    let rowCount = 0;
    const footerY = pageHeight - margin - 5;

    data.forEach((row) => {
      // Check if new page needed
      if (yPosition + rowHeight > footerY) {
        // Add footer
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${doc.internal.pages.length - 1}`, pageWidth - margin - 10, footerY);

        doc.addPage();
        yPosition = margin;
        drawHeaders(yPosition);
        yPosition += headerHeight;
      }

      // Subtle alternating background
      if (rowCount % 2 === 0) {
        doc.setFillColor(248, 248, 248);
        columns.forEach((_, idx) => {
          const x = margin + idx * colWidth;
          doc.rect(x, yPosition, colWidth, rowHeight, "F");
        });
      }

      // Cell borders with subtle gray
      doc.setDrawColor(235, 235, 235);
      columns.forEach((_, idx) => {
        const x = margin + idx * colWidth;
        doc.rect(x, yPosition, colWidth, rowHeight);
      });

      // Cell content
      doc.setTextColor(40, 40, 40);
      columns.forEach((col, idx) => {
        const x = margin + idx * colWidth;
        const value = row[col.key as keyof T];
        const formatted = col.format ? col.format(value, row) : String(value ?? "");

        doc.text(formatted.substring(0, 25), x + 2, yPosition + 5.5, {
          maxWidth: colWidth - 4,
          align: "left",
        });
      });

      yPosition += rowHeight;
      rowCount++;
    });

    // Final footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${doc.internal.pages.length}`, pageWidth - margin - 10, footerY);

    doc.save(`${filename}.pdf`);
  } catch (error) {
    console.error("PDF export failed:", error);
  }
}