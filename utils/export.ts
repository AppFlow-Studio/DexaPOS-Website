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
