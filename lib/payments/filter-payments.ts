import type { PaymentRecord } from "@/types/payment";
import {
  normalizeCardBrand,
  normalizeEntryMode,
  resolveCardBrand,
  resolveEntryMode,
} from "./method-display";

export interface PaymentTableFilters {
  /** `payment_method` enum values. */
  methods?: string[];
  /** Normalized card brand keys (see `normalizeCardBrand`). */
  brands?: string[];
  /** Normalized entry mode keys (see `normalizeEntryMode`). */
  entryModes?: string[];
  amount?: { min?: number; max?: number };
}

export function hasActiveFilters(filters: PaymentTableFilters): boolean {
  return (
    (filters.methods?.length ?? 0) > 0 ||
    (filters.brands?.length ?? 0) > 0 ||
    (filters.entryModes?.length ?? 0) > 0 ||
    filters.amount?.min !== undefined ||
    filters.amount?.max !== undefined
  );
}

/**
 * Apply the payments-table filters.
 *
 * Different filters AND together; values within one filter OR. Card brand and
 * entry mode are matched on their normalized keys, since both arrive from several
 * processor fields that disagree on spelling ("Visa" vs "VISA", "emv" vs "chip").
 *
 * The amount bounds compare against `amount` — the value shown in the Amount
 * column — rather than `total_amount`, so the filter matches what the merchant
 * is looking at. Bounds are inclusive.
 */
export function filterPayments(
  data: PaymentRecord[],
  filters: PaymentTableFilters
): PaymentRecord[] {
  if (!hasActiveFilters(filters)) return data;

  const methods = new Set(filters.methods ?? []);
  const brands = new Set(filters.brands ?? []);
  const entryModes = new Set(filters.entryModes ?? []);
  const min = filters.amount?.min;
  const max = filters.amount?.max;

  return data.filter((p) => {
    if (methods.size > 0 && !methods.has(p.payment_method)) return false;

    if (brands.size > 0) {
      const brand = resolveCardBrand(p);
      if (!brand || !brands.has(normalizeCardBrand(brand))) return false;
    }

    if (entryModes.size > 0) {
      const mode = resolveEntryMode(p);
      if (!mode || !entryModes.has(normalizeEntryMode(mode))) return false;
    }

    if (min !== undefined || max !== undefined) {
      const amount = Number(p.amount);
      if (!Number.isFinite(amount)) return false;
      if (min !== undefined && amount < min) return false;
      if (max !== undefined && amount > max) return false;
    }

    return true;
  });
}
