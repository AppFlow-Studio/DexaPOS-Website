"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MenuWithCategories, CategoryWithItems } from "@/types/menu";
import { auth } from "@clerk/nextjs/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { LogAuditEvent } from "./audit-logs";

// ============================================================================
// GET ITEMS (for Items Library view)
// ============================================================================

export async function getItemsForLocation(
  merchantId: string,
  locationId?: string | null
) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_categories_for_location", {
    p_merchant_id: merchantId,
    p_location_id: locationId || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: data || [] };
}

// ============================================================================
// GET CATEGORIES WITH ITEMS (Category-centric view)
// ============================================================================

export async function getCategoriesForLocation(
  merchantId: string,
  locationId?: string | null
) {
  const supabase = createServerSupabaseClient();
  const location_Id = locationId == "all" ? null : locationId;

  const { data, error } = await supabase.rpc("get_categories_for_location", {
    p_merchant_id: merchantId,
    p_location_id: location_Id || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: (data || []) as CategoryWithItems[] };
}

// ============================================================================
// GET ITEMS FLAT (Transform category-centric to item-centric)
// For Items Library view - returns flat list with category associations
// ============================================================================

export interface FlatItem {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  allergens: string[] | null;
  meal_types: string[] | null;
  card_bg_color: string | null;

  // Base prices (Level 1)
  base_price: number;
  base_cash_price: number | null;
  base_availability: boolean;

  // Effective values (computed with overrides)
  effective_price: number;
  effective_cash_price: number | null;
  effective_availability: boolean;

  // Override flags
  has_location_override: boolean;
  price_source:
    | "base"
    | "location_item"
    | "category"
    | "location_category"
    | "location_menu"
    | string;

  // Tax & Inventory Control fields (migration 014)
  tax_category: string; // Base tax category (L1)
  is_tax_exempt: boolean; // Base exemption status (L1)
  available_channels: string[]; // Base channels (L1)
  effective_tax_category: string; // Effective after L2 override
  effective_is_tax_exempt: boolean; // Effective after L2 override
  effective_available_channels: string[]; // Effective after L2 override

  // Location override details (Level 2)
  location_override: {
    id: string;
    custom_price: number | null;
    custom_cash_price: number | null;
    price_modifier: number | null;
    price_modifier_type: string | null;
    is_available: boolean;
    stock_tracking_mode: string | null;
    current_stock: number | null;
    // Tax & channel overrides
    tax_category: string | null;
    is_tax_exempt: boolean | null;
    available_channels: string[] | null;
  } | null;

  // Categories this item belongs to
  categories: Array<{
    id: string;
    name: string;
    location_id: string | null;
    location_name: string | null;
    is_global: boolean;
  }>;

  // Stock info
  stock_tracking_mode: string | null;
  current_stock: number | null;

  // Location-specific item flag
  location_id: string | null;
  modifier_groups: Array<{
    id: string;
    name: string;
    description: string | null;
    base_min_selections: number;
    base_max_selections: number | null;
    base_is_required: boolean;
    base_is_active: boolean;
    location_override: {
      id: string;
      custom_price: number | null;
      custom_cash_price: number | null;
      price_modifier: number | null;
      price_modifier_type: string | null;
      is_available: boolean;
      stock_tracking_mode: string | null;
      current_stock: number | null;
      tax_category: string | null;
      is_tax_exempt: boolean | null;
      available_channels: string[] | null;
    } | null;
    effective_availability: boolean;
    has_location_override: boolean;
    items: Array<{
      id: string;
      name: string;
      description: string | null;
      base_price: number;
      base_is_default: boolean;
      base_is_active: boolean;
      location_override: {
        id: string;
        custom_price: number | null;
        price_modifier: number | null;
        price_modifier_type: string | null;
        is_available: boolean;
        stock_tracking_mode: string | null;
        current_stock: number | null;
      } | null;
      effective_price: number;
      effective_is_active: boolean;
      has_location_override: boolean;
    }>;
  }>;
}

// ============================================================================
// MODIFIER GROUP / ITEM UPDATES (GLOBAL + LOCATION OVERRIDE)
// ============================================================================

interface UpdateModifierGroupParams {
  modifierGroupId: string;
  isActive?: boolean;
  displayOrder?: number | null;
  locationId?: string | null;
}

interface UpdateModifierItemParams {
  modifierItemId: string;
  priceModifier?: number | null;
  isActive?: boolean;
  stockTrackingMode?: "quantity" | "in_stock" | "out_of_stock" | null;
  currentStock?: number | null;
  locationId?: string | null;
}

/**
 * Update modifier group visibility/order.
 * - Global: updates modifier_groups
 * - Location: upserts into location_modifier_group_overrides
 */
export async function updateModifierGroup(params: UpdateModifierGroupParams) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const supabase = createServerSupabaseClient();
  const { modifierGroupId, isActive, displayOrder, locationId } = params;

  // Location-specific override
  if (locationId) {
    // Fetch merchant_id to satisfy FK
    const { data: baseGroup, error: groupError } = await supabase
      .from("modifier_groups")
      .select("merchant_id")
      .eq("id", modifierGroupId)
      .single();

    if (groupError || !baseGroup) {
      return { success: false, error: "Modifier group not found" };
    }

    const { error } = await supabase
      .from("location_modifier_group_overrides")
      .upsert(
        {
          location_id: locationId,
          modifier_group_id: modifierGroupId,
          merchant_id: baseGroup.merchant_id,
          is_active: isActive,
          display_order: displayOrder,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "location_id,modifier_group_id" }
      );

    if (error) return { success: false, error: error.message };
    return { success: true, level: "location" };
  }

  // Global update
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (isActive !== undefined) updateData.is_active = isActive;
  if (displayOrder !== undefined) updateData.display_order = displayOrder;

  const { error } = await supabase
    .from("modifier_groups")
    .update(updateData)
    .eq("id", modifierGroupId);

  if (error) return { success: false, error: error.message };

  // Log Audit Event
  LogAuditEvent({
    action: `Updated Modifier Group`,
    actionCategory: "menu",
    resourceType: "modifier_group",
    resourceId: modifierGroupId,
    locationId: locationId || null,
    changes: { after: updateData },
  });

  return { success: true, level: "global" };
}

/**
 * Update modifier item price/availability.
 * - Global: updates modifier_group_items
 * - Location: uses upsert_modifier_override RPC (location_modifier_item_overrides)
 */
export async function updateModifierItem(params: UpdateModifierItemParams) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const supabase = createServerSupabaseClient();
  const {
    modifierItemId,
    priceModifier,
    isActive,
    stockTrackingMode,
    currentStock,
    locationId,
  } = params;

  if (locationId) {
    // Location override via RPC
    const { data, error } = await supabase.rpc("upsert_modifier_override", {
      p_location_id: locationId,
      p_modifier_item_id: modifierItemId,
      p_price_modifier: priceModifier ?? null,
      p_is_active: isActive ?? null,
      p_stock_tracking_mode: stockTrackingMode ?? null,
      p_current_stock: currentStock ?? null,
    });

    if (error) return { success: false, error: error.message };
    return { success: true, level: "location", data };
  }

  // Global update
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (priceModifier !== undefined) updateData.price_modifier = priceModifier;
  if (isActive !== undefined) updateData.is_active = isActive;
  if (stockTrackingMode !== undefined)
    updateData.stock_tracking_mode = stockTrackingMode;
  if (currentStock !== undefined) updateData.current_stock = currentStock;

  const { error } = await supabase
    .from("modifier_group_items")
    .update(updateData)
    .eq("id", modifierItemId);

  if (error) return { success: false, error: error.message };

  // Log Audit Event
  LogAuditEvent({
    action: `Updated Modifier Item`,
    actionCategory: "menu",
    resourceType: "modifier_item",
    resourceId: modifierItemId,
    locationId: locationId || null,
    changes: { after: updateData },
  });

  return { success: true, level: "global" };
}

export async function getItemsForLocationFlat(
  merchantId: string,
  locationId?: string | null
) {
  const supabase = createServerSupabaseClient();

  // Use the new Items Library-specific RPC function ( Only show L2 Prices)
  // This excludes category prices (L3, L4) from the effective_price cascade
  const { data, error } = await supabase.rpc("get_items_for_location_library", {
    p_merchant_id: merchantId,
    p_location_id: locationId || null,
  });

  if (error) {
    console.error("getItemsForLocationFlat error:", error);
    return { success: false, error: error.message };
  }

  if (!data || !Array.isArray(data)) {
    return { success: true, data: [] };
  }

  // Transform to FlatItem type
  const items: FlatItem[] = data.map((item: any) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    image: item.image,
    allergens: item.allergens,
    meal_types: item.meal_types,
    card_bg_color: item.card_bg_color,

    // Base prices (L1)
    base_price: item.base_price,
    base_cash_price: item.base_cash_price,
    base_availability: item.base_availability ?? true,

    // Effective prices (L2 > L1 ONLY, no category prices!)
    effective_price: item.effective_price,
    effective_cash_price: item.effective_cash_price,
    effective_availability: item.effective_availability ?? true,

    // Override flags
    has_location_override: item.has_location_override ?? false,
    price_source: item.price_source || "base",

    // Tax & Inventory Control (L1)
    tax_category: item.tax_category || "standard",
    is_tax_exempt: item.is_tax_exempt || false,
    available_channels: item.available_channels || ["pos", "online"],

    // Effective Tax & Inventory (L2 > L1)
    effective_tax_category: item.effective_tax_category || "standard",
    effective_is_tax_exempt: item.effective_is_tax_exempt ?? false,
    effective_available_channels: item.effective_available_channels || [
      "pos",
      "online",
    ],

    // Location override details (L2)
    location_override: item.location_override,

    // Categories this item belongs to
    categories: item.categories || [],

    // Stock info
    stock_tracking_mode: item.stock_tracking_mode || null,
    current_stock: item.location_override?.current_stock ?? null,

    // Location-specific item flag
    location_id: item.location_id || null,

    modifier_groups: item.modifier_groups || [],
  }));

  return {
    success: true,
    data: items,
  };
}

// ============================================================================
// GET MENU WITH CATEGORIES (Primary menu view)
// ============================================================================

export async function getMenuWithCategories(
  menuId: string,
  locationId?: string | null
) {
  const supabase = createServerSupabaseClient();
  const location_Id = locationId == "all" ? null : locationId;

  const { data, error } = await supabase.rpc("get_menu_with_categories", {
    p_menu_id: menuId,
    p_location_id: location_Id || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: data as MenuWithCategories };
}

// ============================================================================
// TYPES
// ============================================================================

export interface UpdateItemParams {
  menuItemId: string;
  categoryId?: string | null; // NEW: Category context
  menuId?: string | null; // null = Items Library context
  locationId?: string | null; // null = Merchant Admin (all locations)

  // Fields that can be updated
  name?: string;
  description?: string;
  price?: number | null;
  cashPrice?: number | null;
  image?: string;
  availability?: boolean;
  allergens?: string[];
  cardBgColor?: string;
  stockTrackingMode?: string;
  mealTypes?: string[];

  // Tax & Inventory Control fields (migration 014)
  taxCategory?: string; // 'standard', 'alcohol', 'food', etc.
  isTaxExempt?: boolean;
  availableChannels?: string[]; // ['pos', 'online', 'kiosk']

  // Location-specific fields
  priceModifier?: number | null;
  priceModifierType?: "add" | "percent" | null;
  currentStock?: number | null;

  // Category-specific fields
  displayOrder?: number | null;
  isFeatured?: boolean | null;

  // Modifier linking
  modifier_group_ids?: string[];
}

export interface UpdateResult {
  success: boolean;
  error?: string;
  level?: number;
  table?: string;
  action?: string;
  data?: unknown;
}

// ============================================================================
// UNIFIED UPDATE - Uses the new category-centric database function
// ============================================================================

export async function upsertModifierOverride(
  locationId: string,
  modifierId: string,
  price: number,
  isActive: boolean,
  stockMode: "quantity" | "in_stock" | "out_of_stock",
  currentStock: number | null
) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("upsert_modifier_override", {
    p_location_id: locationId,
    p_modifier_item_id: modifierId,
    p_price_modifier: price,
    p_is_active: isActive,
    p_stock_tracking_mode: stockMode,
    p_current_stock: currentStock,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Log Audit Event
  LogAuditEvent({
    action: `Updated Modifier Override`,
    actionCategory: "menu",
    resourceType: "modifier_item",
    resourceId: modifierId,
    locationId: locationId,
    changes: {
      after: {
        price,
        isActive,
        stockMode,
        currentStock,
      },
    },
  });

  return { success: true, data: data };
}

/**
 * Unified update function that handles all 5 price levels
 * Uses the new upsert_category_item_override RPC
 */
export async function updateItemOverride(
  params: UpdateItemParams
): Promise<UpdateResult> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "Unauthorized" };
  }

  const supabase = createServerSupabaseClient();
  const locationId = params.locationId === "all" ? null : params.locationId;

  // Handle Modifier Group assignments (Global Base Only - but triggered from any level)
  if (params.modifier_group_ids !== undefined) {
    // USE SERVICE ROLE CLIENT to bypass RLS for this specific structure update
    // This allows location managers to link global modifiers to items effectively
    const adminSupabase = createServiceRoleClient();

    // First delete existing assignments
    const { error: deleteError } = await adminSupabase
      .from("menu_item_modifier_groups")
      .delete()
      .eq("menu_item_id", params.menuItemId);

    if (deleteError) {
      console.error(
        "Error deleting existing modifier assignments:",
        deleteError
      );
    }

    // Insert new assignments if any
    if (params.modifier_group_ids.length > 0) {
      // Fetch merchant_id from the menu item
      const { data: menuItem, error: fetchError } = await supabase
        .from("menu_items")
        .select("merchant_id")
        .eq("id", params.menuItemId)
        .single();

      if (fetchError || !menuItem) {
        console.error(
          "Error fetching menu item for modifier update:",
          fetchError
        );
        return { success: false, error: "Could not retrieve item details" };
      }

      const modifierInserts = params.modifier_group_ids.map((groupId) => ({
        menu_item_id: params.menuItemId,
        modifier_group_id: groupId,
        merchant_id: menuItem.merchant_id,
      }));

      const { error: insertError } = await adminSupabase
        .from("menu_item_modifier_groups")
        .insert(modifierInserts);

      if (insertError) {
        console.error("Error inserting modifier assignments:", insertError);
      }
    }
  }

  // If updating base item fields (name, description, etc.) - these are always global
  if (
    params.name !== undefined ||
    params.description !== undefined ||
    params.image !== undefined ||
    params.allergens !== undefined ||
    params.cardBgColor !== undefined ||
    params.mealTypes !== undefined ||
    params.taxCategory !== undefined ||
    params.isTaxExempt !== undefined ||
    params.availableChannels !== undefined
  ) {
    // Only merchant admin can update base item fields
    if (!locationId && !params.menuId && !params.categoryId) {
      // Merchant admin in Items Library - update base item (L1)
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (params.name !== undefined) updateData.name = params.name;
      if (params.description !== undefined)
        updateData.description = params.description;
      if (params.image !== undefined) updateData.image = params.image;
      if (params.allergens !== undefined)
        updateData.allergens = params.allergens;
      if (params.cardBgColor !== undefined)
        updateData.card_bg_color = params.cardBgColor;
      if (params.mealTypes !== undefined)
        updateData.meal_types = params.mealTypes;
      if (params.stockTrackingMode !== undefined)
        updateData.stock_tracking_mode = params.stockTrackingMode;

      // Tax & Inventory Control fields (migration 014)
      if (params.taxCategory !== undefined)
        updateData.tax_category = params.taxCategory;
      if (params.isTaxExempt !== undefined)
        updateData.is_tax_exempt = params.isTaxExempt;
      if (params.availableChannels !== undefined)
        updateData.available_channels = params.availableChannels;

      const { error } = await supabase
        .from("menu_items")
        .update(updateData)
        .eq("id", params.menuItemId);

      if (error) {
        return { success: false, error: error.message };
      }
    }
    // If locationId is set, update location_item_overrides (L2)
    else if (locationId && !params.menuId && !params.categoryId) {
      const overrideData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      // Tax & Inventory Control overrides (migration 014)
      if (params.taxCategory !== undefined)
        overrideData.tax_category = params.taxCategory;
      if (params.isTaxExempt !== undefined)
        overrideData.is_tax_exempt = params.isTaxExempt;
      if (params.availableChannels !== undefined)
        overrideData.available_channels = params.availableChannels;

      // Only upsert if we have tax/channel fields to update
      if (Object.keys(overrideData).length > 1) {
        // > 1 because updated_at is always included
        const { error } = await supabase.from("location_item_overrides").upsert(
          {
            location_id: locationId,
            menu_item_id: params.menuItemId,
            ...overrideData,
          },
          {
            onConflict: "location_id,menu_item_id",
          }
        );

        if (error) {
          return { success: false, error: error.message };
        }
      }
    }
  }

  // If updating price/availability - use the new category-centric function
  if (
    params.price !== undefined ||
    params.cashPrice !== undefined ||
    params.availability !== undefined ||
    params.priceModifier !== undefined ||
    params.displayOrder !== undefined ||
    params.isFeatured !== undefined ||
    params.stockTrackingMode !== undefined ||
    params.currentStock !== undefined
  ) {
    const { data, error } = await supabase.rpc(
      "upsert_category_item_override",
      {
        p_menu_item_id: params.menuItemId,
        p_category_id: params.categoryId || null,
        p_menu_id: params.menuId || null,
        p_location_id: locationId || null,
        p_custom_price: params.price,
        p_custom_cash_price: params.cashPrice,
        p_is_available: params.availability,
        p_price_modifier: params.priceModifier,
        p_price_modifier_type: params.priceModifierType,
        p_display_order: params.displayOrder,
        p_is_featured: params.isFeatured,
        p_stock_tracking_mode: params.stockTrackingMode,
        p_current_stock: params.currentStock,
      }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    const result = data as UpdateResult;

    // Log Audit Event
    if (result.success) {
      // Background logging
      supabase
        .from("menu_items")
        .select("name")
        .eq("id", params.menuItemId)
        .single()
        .then(({ data: item }) => {
          LogAuditEvent({
            action: `Updated Item: ${item?.name || "Unknown"}`,
            actionCategory: "menu",
            resourceType: "menu_item",
            resourceId: params.menuItemId,
            resourceName: item?.name,
            locationId: locationId,
            changes: { after: params as any },
          });
        });
    }

    return result;
  }

  return { success: true, level: 1, table: "menu_items", action: "updated" };
}

// ============================================================================
// CONVENIENCE WRAPPERS
// ============================================================================

/**
 * Update item in Items Library (not category/menu context)
 * - If locationId is null: Updates global base (Level 1)
 * - If locationId is set: Updates location base (Level 2)
 */
export async function updateItemBasePrice(
  menuItemId: string,
  price: number | null,
  cashPrice?: number | null,
  locationId?: string | null
) {
  return updateItemOverride({
    menuItemId,
    categoryId: null, // No category context
    menuId: null, // No menu context
    locationId,
    price: price,
    cashPrice: cashPrice,
  });
}

/**
 * Update item price within a category
 * - If locationId is null: Updates category price (Level 3)
 * - If locationId is set: Updates location+category override (Level 4)
 */
export async function updateCategoryItemPrice(
  menuItemId: string,
  categoryId: string,
  price: number | null,
  cashPrice?: number | null,
  locationId?: string | null
) {
  return updateItemOverride({
    menuItemId,
    categoryId,
    menuId: null,
    locationId,
    price: price,
    cashPrice: cashPrice,
  });
}

/**
 * Update item price within a menu (in category context)
 * - If locationId is null: Updates menu+category price (Level 3/Category)
 * - If locationId is set: Updates location+menu+category override (Level 5)
 */
export async function updateMenuItemPrice(
  menuItemId: string,
  menuId: string,
  categoryId: string,
  price: number | null,
  cashPrice?: number | null,
  locationId?: string | null
) {
  return updateItemOverride({
    menuItemId,
    categoryId,
    menuId,
    locationId,
    price: price,
    cashPrice: cashPrice,
  });
}

/**
 * Set a location-wide price modifier (e.g., airport +$2 markup)
 */
export async function setLocationPriceModifier(
  menuItemId: string,
  locationId: string,
  modifier: number,
  type: "add" | "percent"
) {
  return updateItemOverride({
    menuItemId,
    categoryId: null,
    menuId: null,
    locationId,
    priceModifier: modifier,
    priceModifierType: type,
  });
}

/**
 * Toggle availability at the appropriate level
 */
export async function setItemAvailability(
  menuItemId: string,
  isAvailable: boolean,
  options?: {
    categoryId?: string | null;
    menuId?: string | null;
    locationId?: string | null;
  }
) {
  return updateItemOverride({
    menuItemId,
    categoryId: options?.categoryId,
    menuId: options?.menuId,
    locationId: options?.locationId,
    availability: isAvailable,
  });
}

// ============================================================================
// CREATE ITEM (Always global - Level 1)
// ============================================================================

export async function createMenuItem(
  clerkOrgId: string,
  item: {
    name: string;
    description?: string;
    price: number;
    cashPrice?: number;
    image?: string;
    availability?: boolean;
    allergens?: string[];
    cardBgColor?: string;
    stockTrackingMode?: string;
    mealTypes?: string[];
  }
) {
  const supabase = await createServerSupabaseClient();

  // Get merchant ID from clerk org
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!merchant) {
    return { success: false, error: "Merchant not found" };
  }

  const { data, error } = await supabase
    .from("menu_items")
    .insert({
      merchant_id: merchant.id,
      name: item.name,
      description: item.description,
      price: item.price,
      cash_price: item.cashPrice,
      image: item.image,
      availability: item.availability ?? true,
      allergens: item.allergens ?? [],
      card_bg_color: item.cardBgColor,
      stock_tracking_mode: item.stockTrackingMode ?? "in_stock",
      meal_types: item.mealTypes ?? [],
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Log Audit Event
  await LogAuditEvent({
    action: `Created Menu Item: ${item.name}`,
    actionCategory: "menu",
    resourceType: "menu_item",
    resourceId: data.id,
    resourceName: item.name,
    changes: { after: item as Record<string, unknown> },
  });

  return { success: true, data };
}

// ============================================================================
// RESET TO LEVEL (Uses new category-centric function)
// ============================================================================

export async function resetItemToLevel(
  menuItemId: string,
  targetLevel: 1 | 2 | 3 | 4 | 5,
  options?: {
    categoryId?: string | null;
    menuId?: string | null;
    locationId?: string | null;
  }
): Promise<UpdateResult> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("reset_category_item_to_level", {
    p_menu_item_id: menuItemId,
    p_category_id: options?.categoryId || null,
    p_menu_id: options?.menuId || null,
    p_location_id:
      options?.locationId === "all" ? null : options?.locationId || null,
    p_target_level: targetLevel,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data as UpdateResult;
}

// ============================================================================
// GET ITEM WITH ALL 5 PRICE LEVELS
// ============================================================================

export async function getItemWithPriceLevels(
  menuItemId: string,
  options?: {
    categoryId?: string | null;
    menuId?: string | null;
    locationId?: string | null;
  }
) {
  const supabase = await createServerSupabaseClient();
  const locationId = options?.locationId === "all" ? null : options?.locationId;

  // Get base item with category assignments
  const { data: item, error: itemError } = await supabase
    .from("menu_items")
    .select(
      `
            *,
            category_items(
                id,
                category_id,
                display_order,
                custom_price,
                custom_cash_price,
                is_featured,
                is_available,
                category:categories(id, name)
            ),
            menu_item_modifier_groups(
                modifier_group_id,
                modifier_groups(id, name)
            )
        `
    )
    .eq("id", menuItemId)
    .single();

  if (itemError) {
    return { success: false, error: itemError.message };
  }

  const result: Record<string, unknown> = {
    ...item,
    price_levels: {
      level_1_base: item.price,
      level_1_cash: item.cash_price,
      level_2_location_item: null,
      level_2_modifier: null,
      level_2_modifier_type: null,
      level_3_category: null,
      level_3_category_cash: null,
      level_4_location_category: null,
      level_4_location_category_cash: null,
      level_5_location_menu: null,
      level_5_location_menu_cash: null,
    },
    effective_price: item.price,
    effective_cash_price: item.cash_price,
    current_level: 1,
    has_location_item_override: false,
    has_category_override: false,
    has_location_category_override: false,
    has_location_menu_override: false,
  };

  // Get location item override (Level 2)
  if (locationId) {
    const { data: lio } = await supabase
      .from("location_item_overrides")
      .select("*")
      .eq("location_id", locationId)
      .eq("menu_item_id", menuItemId)
      .single();

    if (lio) {
      const priceLevels = result.price_levels as Record<string, unknown>;
      priceLevels.level_2_location_item = lio.custom_price;
      priceLevels.level_2_location_item_cash = lio.custom_cash_price;
      priceLevels.level_2_modifier = lio.price_modifier;
      priceLevels.level_2_modifier_type = lio.price_modifier_type;
      result.has_location_item_override = true;
      result.location_item_override = lio;

      if (lio.custom_price !== null) {
        result.effective_price = lio.custom_price;
        result.effective_cash_price = lio.custom_cash_price;
        result.current_level = 2;
      } else if (lio.price_modifier !== null) {
        if (lio.price_modifier_type === "add") {
          result.effective_price = item.price + lio.price_modifier;
        } else if (lio.price_modifier_type === "percent") {
          result.effective_price = item.price * (1 + lio.price_modifier / 100);
        }
        result.current_level = 2;
      }
    }
  }

  // Get category override (Level 3)
  if (options?.categoryId) {
    const categoryItem = (
      item.category_items as Array<Record<string, unknown>>
    )?.find((ci) => ci.category_id === options.categoryId);

    if (categoryItem?.custom_price) {
      const priceLevels = result.price_levels as Record<string, unknown>;
      priceLevels.level_3_category = categoryItem.custom_price;
      priceLevels.level_3_category_cash = categoryItem.custom_cash_price;
      result.has_category_override = true;
      result.category_item = categoryItem;

      result.effective_price = categoryItem.custom_price;
      result.effective_cash_price = categoryItem.custom_cash_price;
      result.current_level = 3;
    }

    // Get location + category override (Level 4)
    if (locationId) {
      const { data: lcio } = await supabase
        .from("location_category_item_overrides")
        .select("*")
        .eq("location_id", locationId)
        .eq("category_id", options.categoryId)
        .eq("menu_item_id", menuItemId)
        .single();

      if (lcio?.custom_price) {
        const priceLevels = result.price_levels as Record<string, unknown>;
        priceLevels.level_4_location_category = lcio.custom_price;
        priceLevels.level_4_location_category_cash = lcio.custom_cash_price;
        result.has_location_category_override = true;
        result.location_category_override = lcio;

        result.effective_price = lcio.custom_price;
        result.effective_cash_price = lcio.custom_cash_price;
        result.current_level = 4;
      }
    }

    // Get location + menu + category override (Level 5)
    if (options?.menuId && locationId) {
      const { data: lmio } = await supabase
        .from("location_menu_item_overrides")
        .select("*")
        .eq("location_id", locationId)
        .eq("menu_id", options.menuId)
        .eq("category_id", options.categoryId)
        .eq("menu_item_id", menuItemId)
        .single();

      if (lmio?.custom_price) {
        const priceLevels = result.price_levels as Record<string, unknown>;
        priceLevels.level_5_location_menu = lmio.custom_price;
        priceLevels.level_5_location_menu_cash = lmio.custom_cash_price;
        result.has_location_menu_override = true;
        result.location_menu_override = lmio;

        result.effective_price = lmio.custom_price;
        result.effective_cash_price = lmio.custom_cash_price;
        result.current_level = 5;
      }
    }
  }

  return { success: true, data: result };
}

// ============================================================================
// LEVEL-SPECIFIC CRUD OPERATIONS
// ============================================================================

/**
 * Level 1: Update base item (global)
 * Use when isAllLocations=true, no categoryId, no menuId
 */
export async function updateBaseItem(
  menuItemId: string,
  updates: {
    name?: string;
    description?: string;
    price?: number;
    cashPrice?: number;
    image?: string;
    availability?: boolean;
    allergens?: string[];
    cardBgColor?: string;
    stockTrackingMode?: string;
    mealTypes?: string[];
  }
): Promise<UpdateResult> {
  return updateItemOverride({
    menuItemId,
    categoryId: null,
    menuId: null,
    locationId: null,
    name: updates.name,
    description: updates.description,
    price: updates.price,
    cashPrice: updates.cashPrice,
    image: updates.image,
    availability: updates.availability,
    allergens: updates.allergens,
    cardBgColor: updates.cardBgColor,
    stockTrackingMode: updates.stockTrackingMode,
    mealTypes: updates.mealTypes,
  });
}

/**
 * Level 2: Update location-specific item override
 * Use when viewing a specific location, no categoryId, no menuId
 */
export async function updateLocationItemOverride(
  menuItemId: string,
  locationId: string,
  updates: {
    customPrice?: number | null;
    customCashPrice?: number | null;
    priceModifier?: number | null;
    priceModifierType?: "add" | "percent" | null;
    isAvailable?: boolean;
    stockTrackingMode?: string;
    currentStock?: number | null;
  }
): Promise<UpdateResult> {
  return updateItemOverride({
    menuItemId,
    categoryId: null,
    menuId: null,
    locationId,
    price: updates.customPrice,
    cashPrice: updates.customCashPrice,
    priceModifier: updates.priceModifier,
    priceModifierType: updates.priceModifierType,
    availability: updates.isAvailable,
    stockTrackingMode: updates.stockTrackingMode,
    currentStock: updates.currentStock,
  });
}

/**
 * Level 3: Update category-specific item with full options
 * Use when isAllLocations=true, has categoryId, no menuId
 * Updates category_items table
 */
export async function updateCategoryItemFull(
  categoryId: string,
  menuItemId: string,
  updates: {
    customPrice?: number | null;
    customCashPrice?: number | null;
    isAvailable?: boolean;
    isFeatured?: boolean;
    displayOrder?: number;
  }
): Promise<UpdateResult> {
  return updateItemOverride({
    menuItemId,
    categoryId,
    menuId: null,
    locationId: null,
    price: updates.customPrice,
    cashPrice: updates.customCashPrice,
    availability: updates.isAvailable,
    isFeatured: updates.isFeatured,
    displayOrder: updates.displayOrder,
  });
}

/**
 * Level 4: Update location + category specific override
 * Use when viewing a specific location, has categoryId, no menuId
 * Updates location_category_item_overrides table
 */
export async function updateLocationCategoryItemOverride(
  locationId: string,
  categoryId: string,
  menuItemId: string,
  updates: {
    customPrice?: number | null;
    customCashPrice?: number | null;
    isAvailable?: boolean;
    displayOrder?: number;
    isFeatured?: boolean;
  }
): Promise<UpdateResult> {
  return updateItemOverride({
    menuItemId,
    categoryId,
    menuId: null,
    locationId,
    price: updates.customPrice,
    cashPrice: updates.customCashPrice,
    availability: updates.isAvailable,
    displayOrder: updates.displayOrder,
    isFeatured: updates.isFeatured,
  });
}

/**
 * Level 5: Update location + menu + category specific override
 * Use when viewing a specific location, has menuId and categoryId
 * Updates location_menu_item_overrides table
 */
export async function updateLocationMenuCategoryItemOverride(
  locationId: string,
  menuId: string,
  categoryId: string,
  menuItemId: string,
  updates: {
    customPrice?: number | null;
    customCashPrice?: number | null;
    isAvailable?: boolean;
    displayOrder?: number;
  }
): Promise<UpdateResult> {
  return updateItemOverride({
    menuItemId,
    categoryId,
    menuId,
    locationId,
    price: updates.customPrice,
    cashPrice: updates.customCashPrice,
    availability: updates.isAvailable,
    displayOrder: updates.displayOrder,
  });
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Update multiple items at once (same level)
 */
export async function batchUpdateItems(
  updates: Array<{
    menuItemId: string;
    categoryId?: string | null;
    menuId?: string | null;
    locationId?: string | null;
    price?: number | null;
    cashPrice?: number | null;
    availability?: boolean;
    displayOrder?: number;
  }>
): Promise<{ success: boolean; results: UpdateResult[]; errors: string[] }> {
  const results: UpdateResult[] = [];
  const errors: string[] = [];

  for (const update of updates) {
    try {
      const result = await updateItemOverride({
        menuItemId: update.menuItemId,
        categoryId: update.categoryId,
        menuId: update.menuId,
        locationId: update.locationId,
        price: update.price,
        cashPrice: update.cashPrice,
        availability: update.availability,
        displayOrder: update.displayOrder,
      });

      results.push(result);
      if (!result.success && result.error) {
        errors.push(`Item ${update.menuItemId}: ${result.error}`);
      }
    } catch (err) {
      errors.push(
        `Item ${update.menuItemId}: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }
  }

  return {
    success: errors.length === 0,
    results,
    errors,
  };
}

/**
 * Toggle availability for an item in a category at a location
 * Convenience function that handles the level detection automatically
 */
export async function toggleItemAvailabilityInCategory(
  menuItemId: string,
  categoryId: string,
  isAvailable: boolean,
  options?: {
    menuId?: string | null;
    locationId?: string | null;
  }
): Promise<UpdateResult> {
  return updateItemOverride({
    menuItemId,
    categoryId,
    menuId: options?.menuId,
    locationId: options?.locationId,
    availability: isAvailable,
  });
}

/**
 * Add item to a category with optional initial pricing
 */
export async function addItemToCategoryWithPrice(
  categoryId: string,
  menuItemId: string,
  options?: {
    customPrice?: number;
    customCashPrice?: number;
    displayOrder?: number;
    isFeatured?: boolean;
    merchant_id: string;
  }
): Promise<UpdateResult> {
  const supabase = await createServerSupabaseClient();

  // const { data, error } = await supabase.rpc('add_item_to_category', {
  //     p_category_id: categoryId,
  //     p_menu_item_id: menuItemId,
  //     p_display_order: options?.displayOrder ?? 0,
  //     p_custom_price: options?.customPrice || null,
  //     p_is_featured: options?.isFeatured ?? false
  // })
  const { data, error } = await supabase.from("category_items").insert({
    category_id: categoryId,
    menu_item_id: menuItemId,
    display_order: options?.displayOrder ?? 0,
    custom_price: options?.customPrice || null,
    is_featured: options?.isFeatured ?? false,
    merchant_id: options?.merchant_id,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}
