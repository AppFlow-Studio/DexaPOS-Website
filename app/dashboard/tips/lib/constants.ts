/**
 * Session status labels.
 *
 * D-12: status is **never** colour-coded. This module used to carry a
 * `{dot,text,bg}` colour triple per status (the superseded D-11 "soft tint +
 * dot" treatment). Every status now renders as one neutral `bg-muted/60` pill
 * and the word carries the meaning, so only the label survives.
 *
 * Because no class names live here any more, the C7 hazard is gone with them —
 * there is nothing for Tailwind to miss, and `TipStatusBadge` no longer needs
 * a literal class anchor to keep in sync.
 */
export const STATUS_LABELS: Record<string, string> = {
  draft: "Live",
  calculated: "Calculated",
  pending_approval: "Pending Approval",
  approved: "Approved",
  exported: "Exported",
  voided: "Voided",
};

export function tipStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? STATUS_LABELS.draft;
}

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
