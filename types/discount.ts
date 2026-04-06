export type DiscountType = "percentage" | "fixed_amount";
export type DiscountScope = "dine_in" | "takeout" | "both";
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Discount {
  id: string;
  merchant_id: string;
  location_id: string | null;
  name: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  min_purchase_amount: number | null;
  max_discount_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  scope: DiscountScope;
  requires_manager_approval: boolean;
  max_uses_per_day: number | null;
  max_uses_per_order: number;
  applicable_days: DayOfWeek[];
  applicable_hours_start: string | null;
  applicable_hours_end: string | null;
  exclude_alcohol: boolean;
  exclude_categories: string[] | null;
  applies_to_categories: string[] | null;
  stackable: boolean;
  display_order: number;
  menu_item_ids?: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface DiscountFormInput {
  name: string;
  description?: string | null;
  discount_type: DiscountType;
  discount_value: number;
  min_purchase_amount?: number | null;
  max_discount_amount?: number | null;
  start_date?: Date | null;
  end_date?: Date | null;
  is_active: boolean;
  scope: DiscountScope;
  location_id?: string | null;
  requires_manager_approval: boolean;
  max_uses_per_day?: number | null;
  max_uses_per_order: number;
  applicable_days: DayOfWeek[];
  applicable_hours_start?: string | null;
  applicable_hours_end?: string | null;
  exclude_alcohol: boolean;
  exclude_categories?: string[] | null;
  applies_to_categories?: string[] | null;
  stackable: boolean;
  display_order: number;
  menu_item_ids?: string[] | null;
}

export interface DiscountUsageStats {
  usage_count: number;
  last_used_at?: string | null;
}

export interface DiscountListFilters {
  search?: string;
  isActive?: boolean | "all";
  sortBy?: "name" | "created_at" | "display_order";
  sortDir?: "asc" | "desc";
  locationId?: string;
  hideExpired?: boolean;
}

export const defaultApplicableDays: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

export function isDiscountExpired(
  discount: Pick<Discount, "end_date">,
): boolean {
  if (!discount.end_date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(discount.end_date) < today;
}
