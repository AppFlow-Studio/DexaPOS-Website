import { formatRelativeDate, getCustomerStatus } from "@/types/customer";
import type { CustomerListItem } from "@/types/customer";

/**
 * Export customers to CSV format and download
 */
export function exportCustomersCSV(customers: CustomerListItem[]): void {
  if (customers.length === 0) {
    console.warn("No customers to export");
    return;
  }

  // CSV headers
  const headers = [
    "Name",
    "Phone",
    "Email",
    "Tags",
    "Total Spend",
    "Visits",
    "Avg Spend",
    "Last Visit",
    "Status",
  ];

  // CSV rows
  const rows = customers.map((customer) => [
    escapeCSVField(customer.name || ""),
    escapeCSVField(customer.phone || ""),
    escapeCSVField(customer.email || ""),
    escapeCSVField((customer.tags || []).join("; ")),
    (customer.lifetime_spend ?? 0).toFixed(2),
    customer.visits ?? 0,
    (customer.avg_spend ?? 0).toFixed(2),
    formatRelativeDate(customer.last_visit),
    getCustomerStatus(customer),
  ]);

  // Build CSV content
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  // Create blob and download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `customers-${new Date().toISOString().split("T")[0]}.csv`
  );
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Escape CSV field values (handle commas, quotes, newlines)
 */
function escapeCSVField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}