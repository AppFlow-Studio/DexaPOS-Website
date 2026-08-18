export type InventoryStockState = "in_stock" | "low_stock" | "out_of_stock";

export interface StatusBadgeStyle {
  dot: string;
  text: string;
  bg: string;
}

const PURCHASE_ORDER_STATUS_STYLES: Record<string, StatusBadgeStyle> = {
  draft: {
    dot: "bg-slate-400",
    text: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-100 dark:bg-slate-800/40",
  },
  pending: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
  received: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  paid: {
    dot: "bg-green-500",
    text: "text-green-700 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-900/20",
  },
  cancelled: {
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-900/20",
  },
};

const FALLBACK_PURCHASE_ORDER_STYLE = PURCHASE_ORDER_STATUS_STYLES.draft;

export function inventoryStockState(
  stockMode: string | null | undefined,
  currentStock: number,
  reorderPoint: number,
): InventoryStockState {
  if (stockMode === "out_of_stock") return "out_of_stock";
  if (stockMode === "in_stock") return "in_stock";
  if (currentStock <= 0) return "out_of_stock";
  if (currentStock <= reorderPoint) return "low_stock";
  return "in_stock";
}

export function purchaseOrderStatusStyle(
  status: string | null | undefined,
): StatusBadgeStyle {
  if (!status) return FALLBACK_PURCHASE_ORDER_STYLE;
  return PURCHASE_ORDER_STATUS_STYLES[status] ?? FALLBACK_PURCHASE_ORDER_STYLE;
}

export function purchaseOrderStatusLabel(
  status: string | null | undefined,
): string {
  if (!status) return "Unknown";
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
