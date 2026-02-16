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

/**
 * Export data to PDF and trigger browser download.
 * Creates a modern, professional PDF table without external plugins.
 */
export async function exportToPdf<T extends Record<string, any>>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string
): Promise<void> {
  try {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - 2 * margin;

    // Modern title styling
    doc.setFillColor(37, 99, 235); // Modern blue
    doc.rect(margin, 10, contentWidth, 14, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(filename, margin + 3, 19);

    // Subtitle with date
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin + 3, 27);

    // Table setup
    let yPosition = 32;
    if (columns.length === 0) return;
    const colWidth = contentWidth / columns.length;
    const rowHeight = 8;
    const headerHeight = 8;

    // Draw headers with modern style
    const drawHeaders = (y: number) => {
      doc.setFillColor(37, 99, 235); // Modern blue
      doc.setDrawColor(37, 99, 235);

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