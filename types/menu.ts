// ============================================================================
// 1. SHARED ENUMS & UTILITY TYPES
// ============================================================================

export type StockTrackingMode = "quantity" | "in_stock" | "out_of_stock";
export type PriceModifierType = "add" | "percent";

// The specific sources where a price can come from in the 5-level cascade
export type PriceSource =
  | "base" // L1: menu_items.price
  | "location_item" // L2: location_item_overrides
  | "category" // L3: category_items.custom_price
  | "location_category" // L4: location_category_item_overrides
  | "location_menu"; // L5: location_menu_item_overrides (with category_id)

// ============================================================================
// 2. MODIFIERS (Nested within Menu Items)
// ============================================================================

export interface MenuModifierItem {
  id: string;
  name: string;
  description: string | null;

  // Computed values (Location Override > Global Base)
  price_modifier: number;
  is_active: boolean;

  // Stock Logic (Location Specific)
  stock_tracking_mode: StockTrackingMode;
  current_stock: number | null;
}

export interface MenuModifierGroup {
  id: string;
  name: string;
  description: string | null;

  // Rules
  min_selections: number;
  max_selections: number | null;
  is_required: boolean;

  // Computed Availability (Location Override > Global Base)
  is_active: boolean;

  items: MenuModifierItem[];
}

// ============================================================================
// 3. PRICE BREAKDOWN (5 Levels)
// ============================================================================

export interface PriceBreakdown {
  level_1_base: number;
  level_2_location_item: number | null;
  level_2_modifier: number | null;
  level_2_modifier_type: PriceModifierType | null;
  level_3_category: number | null;
  level_4_location_category: number | null;
  level_5_location_menu: number | null;
}

// ============================================================================
// 4. LOCATION OVERRIDES
// ============================================================================

export interface LocationItemOverride {
  id: string;
  custom_price: number | null;
  custom_cash_price: number | null;
  custom_delivery_price: number | null;
  price_modifier: number | null;
  price_modifier_type: PriceModifierType | null;
  is_available: boolean;
  stock_tracking_mode: StockTrackingMode;
  current_stock: number | null;
  is_popular: boolean;
}

export interface LocationCategoryOverride {
  id: string;
  is_active: boolean;
  display_order: number | null;
  custom_title: string | null;
}

export interface LocationCategoryItemOverride {
  id: string;
  custom_price: number | null;
  custom_cash_price: number | null;
  custom_delivery_price: number | null;
  is_available: boolean;
}

export interface LocationMenuItemOverride {
  id: string;
  custom_price: number | null;
  custom_cash_price: number | null;
  custom_delivery_price: number | null;
  is_available: boolean;
}

// ============================================================================
// 5. MODIFIER TYPES (Shared between both views)
// ============================================================================

export interface ModifierItem {
  id: string;
  name: string;
  description: string | null;

  // Effective values (The SQL already resolves Global vs Location Override)
  price_modifier: number;
  is_active: boolean;

  // Stock Logic
  stock_tracking_mode: StockTrackingMode;
  current_stock: number | null;
}

export interface ModifierGroup {
  id: string;
  name: string;
  description: string | null;
  min_selections: number;
  max_selections: number | null;
  is_required: boolean;

  // Group availability (The SQL resolves Global vs Location Override)
  is_active: boolean;

  items: ModifierItem[];
}

// ============================================================================
// 6. ITEMS LIBRARY RESPONSE (get_items_for_location)
// ============================================================================

export interface LocationLibraryItem {
  // Identity
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  location_id: string | null; // null = global, uuid = local item

  // Meta
  meal_types: string[] | null;
  allergens: string[] | null;
  card_bg_color: string | null;
  stock_tracking_mode: StockTrackingMode;

  // Level 1: Base
  base_price: number;
  base_cash_price: number | null;
  base_delivery_price: number | null;
  base_availability: boolean;

  // Level 2: Location Override (Nullable)
  location_override: LocationItemOverride | null;

  // Effective Values (Computed)
  effective_price: number;
  effective_cash_price: number | null;
  effective_delivery_price: number | null;
  effective_availability: boolean;

  // UI Flags
  has_location_override: boolean;
  price_source: PriceSource;

  // Relations
  modifier_groups: ModifierGroup[];
  categories: { id: string; name: string }[];
  menu_count: number;
  menus: {
    id: string;
    name: string;
    is_active: boolean;
    is_global: boolean;
    location_id: string | null;
  }[];

  // Timestamps
  created_at: string;
  updated_at: string;
}

// ============================================================================
// 7. CATEGORY-CENTRIC MENU ITEM (Within a category context)
// ============================================================================

export interface CategoryMenuItem {
  id: string; // category_items.id
  menu_item_id: string; // menu_items.id
  display_order: number;
  is_featured: boolean;

  // Level 3: Category-specific price
  category_price: number | null;
  category_cash_price: number | null;
  category_delivery_price: number | null;
  category_is_available: boolean;

  // The menu item details
  menu_item: {
    id: string;
    name: string;
    description: string | null;
    image: string | null;
    allergens: string[] | null;
    meal_types: string[] | null;
    card_bg_color: string | null;

    // Level 1: Base price
    base_price: number;
    base_cash_price: number | null;
    base_delivery_price: number | null;
    base_availability: boolean;

    // Level 2: Location item override (applies to all categories)
    location_item_override: LocationItemOverride | null;

    // Level 4: Location + Category override
    location_category_override: LocationCategoryItemOverride | null;

    // Computed effective values (full 5-level cascade)
    effective_price: number;
    effective_cash_price: number | null;
    effective_delivery_price: number | null;
    effective_availability: boolean;

    // Price source indicator
    price_source: PriceSource;

    // Override flags for UI
    has_location_item_override: boolean;
    has_category_price: boolean;
    has_location_category_override: boolean;

    // Stock
    stock_tracking_mode: StockTrackingMode;
    current_stock: number | null;

    // Modifiers
    modifier_groups: ModifierGroup[];
  };
}

// ============================================================================
// 8. CATEGORY WITH ITEMS (get_categories_for_location response)
// ============================================================================

export interface CategoryWithItems {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  display_order: number;
  is_global: boolean;

  // Null if global, otherwise the location ID is location specific category
  location_id: string | null;
  location_name: string | null;

  // Global availability
  is_active: boolean;

  // Location override
  location_override: LocationCategoryOverride | null;

  // Effective values
  effective_is_active: boolean;
  effective_display_order: number;

  // Items in this category
  items: CategoryMenuItem[];

  // Counts
  item_count: number;
  menu_count: number;

  created_at: string;
  created_by: string;
  updated_at: string;
}

// ============================================================================
// 9. MENU CATEGORY (Within a menu context)
// ============================================================================

export interface MenuCategoryDetails {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  has_location_override: boolean;
  has_menu_category_override: boolean;
  location_id?: string | null; // NULL if global category, UUID if location-scoped
  location_name?: string | null; // Name of the location if location-scoped
}

export interface MenuCategory {
  id: string; // menu_categories.id
  category_id: string; // categories.id
  display_order: number;
  is_active: boolean;

  // Category details
  category: MenuCategoryDetails;

  // Items in this category on this menu
  items: MenuCategoryItem[];
}

// ============================================================================
// 10. MENU CATEGORY ITEM (Item within a menu > category context)
// Includes all 5 price levels
// ============================================================================

export interface MenuCategoryItem {
  id: string; // category_items.id
  menu_item_id: string; // menu_items.id
  category_id: string; // categories.id
  display_order: number;
  is_featured: boolean;

  // The menu item with full price cascade
  menu_item: {
    id: string;
    name: string;
    description: string | null;
    image: string | null;
    allergens: string[] | null;
    meal_types: string[] | null;
    card_bg_color: string | null;

    // All price levels for debugging/UI
    price_levels: PriceBreakdown;

    // Computed effective values
    effective_price: number;
    effective_cash_price: number | null;
    effective_delivery_price: number | null;
    effective_availability: boolean;

    // Price source indicator
    price_source: PriceSource;

    // Override flags for UI
    has_location_item_override: boolean;
    has_category_override: boolean;
    has_location_category_override: boolean;
    has_location_menu_override: boolean;

    // Stock
    stock_tracking_mode: StockTrackingMode;
    current_stock: number | null;

    // Modifiers with location overrides
    modifier_groups: ModifierGroup[];
  };
}

// ============================================================================
// 11. SCHEDULES
// ============================================================================

export interface ScheduleTimeSlot {
  id: string;
  day_of_week: number; // 0 = Sunday, 6 = Saturday
  start_time: string; // "06:00:00"
  end_time: string; // "11:00:00"
}

export interface MenuScheduleWrapper {
  id: string;
  schedule: {
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    time_slots: ScheduleTimeSlot[];
  };
}

// ============================================================================
// 12. MAIN RETURN TYPE: MENU WITH CATEGORIES (get_menu_with_categories)
// ============================================================================

export interface MenuWithCategories {
  id: string;
  merchant_id: string;
  location_id: string | null; // NULL if it's a global merchant menu

  name: string;
  description: string | null;
  image: string | null;

  is_active: boolean;
  is_global: boolean; // location_id IS NULL
  is_location_owned: boolean; // location_id IS NOT NULL (created by location)

  created_at: string;
  updated_at: string;

  // Categories with nested items (Uber Eats / DoorDash style)
  categories: MenuCategory[];

  // Schedules
  schedules: MenuScheduleWrapper[];
}

// ============================================================================
// 13. LEGACY TYPES (For backwards compatibility during migration)
// @deprecated - Use MenuWithCategories instead
// ============================================================================

/** @deprecated Use LocationCategoryItemOverride instead */
export interface LocationMenuOverride {
  id: string;
  custom_price: number | null;
  custom_cash_price: number | null;
  is_available: boolean;
}

/** @deprecated Use LocationItemOverride instead */
export interface LocationOverrideDetails {
  id: string;
  custom_price: number | null;
  custom_cash_price: number | null;
  price_modifier: number | null;
  price_modifier_type: PriceModifierType | null;
  is_available: boolean;
  stock_tracking_mode: StockTrackingMode;
  current_stock: number | null;
  low_stock_threshold: number | null;
}

/** @deprecated Use CategoryMenuItem.menu_item instead */
export interface MenuItemDetails {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  meal_types: string[] | null;
  allergens: string[] | null;
  card_bg_color: string | null;
  price: number;
  cash_price: number | null;
  availability: boolean;
  location_item_override: LocationItemOverride | null;
  effective_price: number;
  effective_cash_price: number | null;
  effective_availability: boolean;
  has_location_item_override: boolean;
  has_menu_override: boolean;
  has_location_menu_override: boolean;
  price_source: PriceSource;
  price_breakdown: PriceBreakdown;
  stock_tracking_mode: StockTrackingMode;
  current_stock: number | null;
  modifier_groups: MenuModifierGroup[];
}

/** @deprecated Use MenuCategory instead */
export interface MenuCategoryWrapper {
  id: string;
  category: MenuCategoryDetails;
}

/** @deprecated Items are now accessed through categories */
export interface MenuItemWrapper {
  id: string;
  custom_price: number | null;
  custom_cash_price: number | null;
  is_available: boolean;
  location_menu_override: LocationMenuOverride | null;
  menu_item: MenuItemDetails;
}

/** @deprecated Use MenuWithCategories instead */
export interface MenuForLocation {
  id: string;
  merchant_id: string;
  location_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  is_global: boolean;
  is_location_owned: boolean;
  created_at: string;
  updated_at: string;
  menu_categories: MenuCategoryWrapper[];
  menu_item_menus: MenuItemWrapper[];
  menu_schedules: MenuScheduleWrapper[];
}
