export const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:            { label: "Live",             className: "bg-gray-100 text-gray-700 border-gray-200" },
  calculated:       { label: "Calculated",       className: "bg-blue-100 text-blue-700 border-blue-200" },
  pending_approval: { label: "Pending Approval", className: "bg-amber-100 text-amber-700 border-amber-200" },
  approved:         { label: "Approved",         className: "bg-green-100 text-green-700 border-green-200" },
  exported:         { label: "Exported",         className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  voided:           { label: "Voided",           className: "bg-red-100 text-red-700 border-red-200" },
};

export const SHIFT_LABELS: Record<string, string> = {
  full_day: "Full Day",
  lunch:    "Lunch",
  dinner:   "Dinner",
  custom:   "Custom",
};

export function formatMoney(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
