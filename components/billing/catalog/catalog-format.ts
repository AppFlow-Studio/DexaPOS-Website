import type { BillableServiceRecord } from '@/app/manage/actions/subscription-billing'

/*
 * Labels and input parsing shared by the HQ billing catalog view and its
 * editor dialogs. Logic only — no class names live here (UI-DESIGN-SYSTEM C7).
 */

/** Device categories a deployed device can be billed under. */
export const BILLABLE_DEVICE_CATEGORIES = [
  'pos_tablet',
  'cfd',
  'kds',
  'payment_terminal',
  'receipt_printer',
  'kitchen_printer',
  'cash_drawer',
] as const

const DEVICE_CATEGORY_LABELS: Record<string, string> = {
  pos_tablet: 'POS tablet',
  cfd: 'Customer display',
  kds: 'Kitchen display',
  payment_terminal: 'Payment terminal',
  receipt_printer: 'Receipt printer',
  kitchen_printer: 'Kitchen printer',
  cash_drawer: 'Cash drawer',
}

/** A mapping may name a category added after this list; humanise it rather than show a slug. */
export function deviceCategoryLabel(category: string): string {
  if (DEVICE_CATEGORY_LABELS[category]) return DEVICE_CATEGORY_LABELS[category]
  const words = category.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const SERVICE_CATEGORY_LABELS: Record<BillableServiceRecord['service_category'], string> = {
  hardware: 'Hardware',
  software: 'Software',
  service: 'Service',
}

export const PRICING_MODEL_LABELS: Record<BillableServiceRecord['pricing_model'], string> = {
  flat: 'Flat',
  per_unit: 'Per unit',
  tiered: 'Tiered',
}

/** `4` → `4%`, `3.25` → `3.25%`. */
export function formatPercent(value: number): string {
  return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
}

export function parseMoneyInput(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Number(parsed.toFixed(2))) : 0
}

export function parsePercentInput(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(100, Math.max(0, Number(parsed.toFixed(4))))
}

export function parsePositiveInteger(value: string | undefined): number {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.floor(parsed))
}
