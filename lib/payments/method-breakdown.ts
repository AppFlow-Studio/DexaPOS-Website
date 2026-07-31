import type { PaymentSummary } from "@/types/payment";
import { getPaymentMethodDisplay } from "./method-display";

export interface MethodBreakdownRow {
  method: string;
  label: string;
  color: string;
  amount: number;
  /** 0-100, rounded to one decimal. Sums to 100 across the returned rows. */
  percent: number;
}

/** Round a dollar figure to whole cents, avoiding binary-float representation error. */
function toCents(amount: number): number {
  return Math.round((Number(amount) || 0) * 100);
}

/**
 * Build the donut/legend rows from the same `byMethod` aggregate the payments table
 * is filtered by, so legend totals reconcile with the table to the cent.
 *
 * Percentages are computed from integer cents rather than floats: summing dollar
 * amounts as doubles lets representation error into the displayed percent, and the
 * naive per-row `round()` can leave the column summing to 99.9% or 100.1%. The
 * largest-remainder method below distributes the rounding so the column always
 * totals exactly 100%.
 *
 * Zero-amount methods are dropped — they render neither a legend row nor a
 * (zero-width, but still hoverable) donut segment.
 */
export function buildMethodBreakdown(
  byMethod: PaymentSummary["byMethod"] | undefined
): MethodBreakdownRow[] {
  const rows = (byMethod ?? [])
    .map((entry) => ({ method: entry.method as string, cents: toCents(entry.amount) }))
    .filter((entry) => entry.cents > 0)
    .sort((a, b) => b.cents - a.cents);

  const totalCents = rows.reduce((sum, entry) => sum + entry.cents, 0);

  if (totalCents === 0) {
    return [];
  }

  // Largest-remainder apportionment in tenths of a percent (1000 units = 100.0%).
  const scaled = rows.map((entry) => {
    const exact = (entry.cents * 1000) / totalCents;
    const floor = Math.floor(exact);
    return { ...entry, floor, remainder: exact - floor };
  });

  let leftover = 1000 - scaled.reduce((sum, entry) => sum + entry.floor, 0);

  const order = scaled
    .map((entry, index) => ({ index, remainder: entry.remainder }))
    .sort((a, b) => b.remainder - a.remainder);

  const tenths = scaled.map((entry) => entry.floor);
  for (let i = 0; leftover > 0 && i < order.length; i++, leftover--) {
    tenths[order[i].index] += 1;
  }

  return scaled.map((entry, index) => {
    const display = getPaymentMethodDisplay(entry.method);
    return {
      method: entry.method,
      label: display.label,
      color: display.color,
      amount: entry.cents / 100,
      percent: tenths[index] / 10,
    };
  });
}
