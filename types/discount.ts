export type DiscountType = 'percentage' | 'fixed'
export type DiscountScope = 'dine_in' | 'takeout' | 'both'
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface Discount {
    id: string
    merchant_id: string
    name: string
    description: string | null
    discount_type: DiscountType
    discount_value: number
    min_purchase_amount: number | null
    max_discount_amount: number | null
    start_date: string | null
    end_date: string | null
    is_active: boolean
    scope: DiscountScope
    requires_manager_approval: boolean
    max_uses_per_day: number | null
    max_uses_per_order: number
    applicable_days: DayOfWeek[]
    applicable_hours_start: string | null
    applicable_hours_end: string | null
    exclude_alcohol: boolean
    exclude_categories: string[] | null
    applies_to_categories: string[] | null
    stackable: boolean
    display_order: number
    created_at: string
    updated_at: string
}

export interface DiscountFormInput {
    name: string
    description?: string
    discount_type: DiscountType
    discount_value: number
    min_purchase_amount?: number
    max_discount_amount?: number
    start_date?: Date
    end_date?: Date
    is_active: boolean
    scope: DiscountScope
    requires_manager_approval: boolean
    max_uses_per_day?: number
    max_uses_per_order: number
    applicable_days: DayOfWeek[]
    applicable_hours_start?: string
    applicable_hours_end?: string
    exclude_alcohol: boolean
    exclude_categories?: string[]
    applies_to_categories?: string[]
    stackable: boolean
    display_order: number
    menu_item_ids?: string[]
}

export interface DiscountUsageStats {
    usage_count: number
    last_used_at?: string | null
}

export interface DiscountListFilters {
    search?: string
    isActive?: boolean | 'all'
    sortBy?: 'name' | 'created_at' | 'display_order'
    sortDir?: 'asc' | 'desc'
}

export const defaultApplicableDays: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6]

