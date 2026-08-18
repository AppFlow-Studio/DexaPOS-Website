import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  /** Raw status value — decides the tone (paid/captured → green). */
  status: string;
  /** Display text. Defaults to a humanized form of `status`. */
  label?: string;
  className?: string;
}

/**
 * The one status pill every dashboard surface imports.
 *
 * Paid reads green (text + background); every other status stays neutral so
 * the amounts — not the chips — remain the most prominent thing on a row.
 * Rendered as a plain span (not the Badge primitive) so page-level
 * neutral-badge overrides (.inventory-neutral-badges[-portal]) cannot gray
 * out the green.
 */
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const isPaid = status === "paid" || status === "captured";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        isPaid
          ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
          : "bg-muted/60 text-muted-foreground",
        className,
      )}
    >
      {label ??
        (status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " "))}
    </span>
  );
}
