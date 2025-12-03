export interface UsersModel {
    id: string
    first_name: string
    last_name: string
    email: string
    avatar_url: string
    created_at: string
    updated_at: string
}

export interface MembersModel {
    id: string
    user_id: string
    organization_id: string
    created_at: string
    updated_at: string
}

export interface OrganizationsModel {
    id: string
    name: string
    imageURL: string
    created_at: string
    updated_at: string
}

export interface CarriersModel {
    id: string
    clerk_org_id: string // FK to organizations table
    name: string
    created_at: string
    updated_at: string
}

export interface MerchantsModel {
    id: string
    clerk_org_id: string // FK to organizations table
    carrier_id: string // FK to carriers table
    public_metadata: {
        org_type: string,
        status: 'active' | 'pending' | 'suspended',
        business_address: string,
        owner_name: string,
        owner_email: string,
        owner_phone: string,
        carrierId: string,
        createdBy: string,
    }
    type: string
    name: string
    created_at: string
    updated_at: string
}

export interface LocationsModel {
    id: string
    merchant_id: string // FK to merchants table
    name: string
    address: string
    created_at: string
    updated_at: string
}

export interface PendingOrgAdminInvitesModel {
    id: string
    organization_id: string // FK to organizations table
    clerk_invite_id: string // FK to clerk_invitations table
    email: string
    status: string
    role: string
    clerk_user_id: string // FK to clerk_users table
    created_at: string
    updated_at: string
}

// Extended interfaces for merchant info with related data
export interface MerchantInfoModel {
    id: string
    clerk_org_id: string
    carrier_id: string
    public_metadata: {
        org_type: string
        status: 'active' | 'pending' | 'suspended'
        business_address: string
        owner_name: string
        owner_email: string
        owner_phone: string
        carrierId: string
        createdBy: string
    }
    type: string
    name: string
    created_at: Date
    updated_at: Date
    // Related data from joins
    organizations?: {
        imageURL: string
    }
    carriers?: CarriersModel
    members?: Array<{
        id: string
        user_id: string
        organization_id: string
        created_at: string
        updated_at: string
        users?: UsersModel
    }>
    pending_org_admin_invites?: Array<{
        id: string
        organization_id: string
        clerk_invite_id: string
        email: string
        status: string
        role: string
        clerk_user_id: string
        created_at: string
        updated_at: string
        users?: UsersModel
    }>
}

// Interface for merchant analytics/KPI data
export interface MerchantAnalyticsModel {
    total_sales: number
    transaction_count: number
    conversion_rate: number
    growth_rate: number
    monthly_revenue: number
    average_transaction: number
    customer_count: number
    staff_count: number
}

// Interface for transaction data
export interface TransactionModel {
    id: string
    amount: number
    customer: string
    time: string
    status: 'completed' | 'pending' | 'refunded' | 'failed'
    created_at: string
    updated_at: string
}

// Interface for staff member data
export interface StaffMemberModel {
    id: string
    name: string
    role: 'Owner' | 'Manager' | 'Cashier' | 'Admin'
    email: string
    status: 'active' | 'inactive'
    last_login: string
    created_at: string
    updated_at: string
}

// Complete merchant info interface combining all data
export interface CompleteMerchantInfoModel extends MerchantInfoModel {
    analytics?: MerchantAnalyticsModel
    recent_transactions?: TransactionModel[]
    staff?: StaffMemberModel[]
    locations?: LocationsModel[]
}

export interface RolesModel {
    id: string
    code: string,
    name: string,
    description: string,
    organization_type: string,
    level: number,
    is_system_role: boolean,
    level_type: string,
    created_at: string,
    updated_at: string
}

export interface PermissionsModel {
    id: string
    code: string,
    name: string,
    description: string,
    category: string,
    scope: string,
    created_at: string,
}

export interface RolePermissionsModel {
    id: string
    role_code: string,
    permission_code: string,
    created_at: string,
}

// ============================================================================
// Merchant Menu System Models
// ============================================================================

// Core Menu Tables
export interface MenusModel {
    id: string
    merchant_id: string // FK to merchants table
    location_id: string | null // FK to locations table, null = merchant-level
    name: string
    description: string | null
    is_active: boolean
    display_order: number | null
    created_at: string
    updated_at: string
}

export interface CategoriesModel {
    id: string
    merchant_id: string // FK to merchants table
    menu_id: string | null // FK to menus table, null = merchant-global
    name: string
    description: string | null
    display_order: number | null
    image: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface MenuCategoriesModel {
    id: string
    menu_id: string // FK to menus table
    category_id: string // FK to categories table
    display_order: number | null
    created_at: string
}

// Menu Items Tables
export interface MenuItemsModel {
    id: string
    merchant_id: string // FK to merchants table
    name: string
    description: string | null
    price: number
    cash_price: number | null
    image: string | null
    meal_types: ("Lunch" | "Dinner" | "Brunch" | "Specials")[]
    allergens: string[]
    card_bg_color: string | null
    availability: boolean
    stock_tracking_mode: "in_stock" | "out_of_stock" | "quantity" | null
    created_at: string
    updated_at: string
}

export interface MenuItemCategoriesModel {
    id: string
    menu_item_id: string // FK to menu_items table
    category_id: string // FK to categories table
    created_at: string
}

export interface MenuItemMenusModel {
    id: string
    menu_item_id: string // FK to menu_items table
    menu_id: string // FK to menus table
    custom_price: number | null
    custom_cash_price: number | null
    is_available: boolean
    display_order: number | null
    created_at: string
    updated_at: string
}

// Schedule Tables
export interface SchedulesModel {
    id: string
    merchant_id: string // FK to merchants table
    name: string
    description: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface ScheduleTimeSlotsModel {
    id: string
    schedule_id: string // FK to schedules table
    day_of_week: number // 0-6, 0=Sunday
    start_time: string // TIME format
    end_time: string // TIME format
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface MenuSchedulesModel {
    id: string
    menu_id: string // FK to menus table
    schedule_id: string // FK to schedules table
    created_at: string
}

export interface CategorySchedulesModel {
    id: string
    category_id: string // FK to categories table
    schedule_id: string // FK to schedules table
    created_at: string
}

// Item Configuration Tables
export interface ItemSizesModel {
    id: string
    merchant_id: string | null // FK to merchants table, null = item-specific
    menu_item_id: string | null // FK to menu_items table, null = reusable
    name: string
    price_modifier: number
    display_order: number | null
    created_at: string
    updated_at: string
}

export interface ItemAddonsModel {
    id: string
    merchant_id: string | null // FK to merchants table, null = item-specific
    menu_item_id: string | null // FK to menu_items table, null = reusable
    name: string
    description: string | null
    price: number
    display_order: number | null
    created_at: string
    updated_at: string
}

export interface ModifierGroupsModel {
    id: string
    merchant_id: string // FK to merchants table
    name: string
    description: string | null
    is_required: boolean
    min_selections: number
    max_selections: number | null
    display_order: number | null
    created_at: string
    updated_at: string
}

export interface ModifierGroupItemsModel {
    id: string
    modifier_group_id: string // FK to modifier_groups table
    name: string
    description: string | null
    price_modifier: number
    display_order: number | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface MenuItemModifierGroupsModel {
    id: string
    menu_item_id: string // FK to menu_items table
    modifier_group_id: string // FK to modifier_groups table
    display_order: number | null
    created_at: string
}

export interface DiscountsModel {
    id: string
    merchant_id: string // FK to merchants table
    name: string
    description: string | null
    discount_type: "percentage" | "fixed_amount"
    discount_value: number
    min_purchase_amount: number | null
    max_discount_amount: number | null
    start_date: string | null // DATE format
    end_date: string | null // DATE format
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface MenuItemDiscountsModel {
    id: string
    menu_item_id: string // FK to menu_items table
    discount_id: string // FK to discounts table
    created_at: string
}

// Recipe Tables
export interface RecipesModel {
    id: string
    merchant_id: string // FK to merchants table
    name: string
    description: string | null
    instructions: string | null
    servings: number | null
    created_at: string
    updated_at: string
}

export interface RecipeItemsModel {
    id: string
    recipe_id: string // FK to recipes table
    ingredient_name: string
    quantity: number
    unit: string
    display_order: number | null
    created_at: string
    updated_at: string
}

export interface MenuItemRecipesModel {
    id: string
    menu_item_id: string // FK to menu_items table
    recipe_id: string // FK to recipes table
    quantity_multiplier: number
    created_at: string
    updated_at: string
}

// Stock Tracking Tables
export interface ItemStockModel {
    id: string
    location_id: string // FK to locations table
    menu_item_id: string // FK to menu_items table
    quantity: number
    reorder_threshold: number | null
    last_restocked_at: string | null
    created_at: string
    updated_at: string
}