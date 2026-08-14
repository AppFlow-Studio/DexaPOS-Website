export const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:            { label: "Live",             className: "bg-muted text-muted-foreground" },
  calculated:       { label: "Calculated",       className: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400" },
  pending_approval: { label: "Pending Approval", className: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" },
  approved:         { label: "Approved",         className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" },
  exported:         { label: "Exported",         className: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400" },
  voided:           { label: "Voided",           className: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" },
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
