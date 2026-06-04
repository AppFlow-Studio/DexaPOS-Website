"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MenuItemsModel } from "@/types/db-modles";
import {
  UpsertLocationMenuItemOverride,
  GetLocationMenuItemOverride,
  OverrideData,
} from "./location-menu-overrides";
import { LocationLibraryItem } from "@/types/menu";
import { LogAuditEvent } from "./audit-logs";
import { getCurrentUserMerchantRole } from "./role-check";
import { assertNameAvailable } from "./_name-uniqueness";

// ============================================================================
// TYPES
// ============================================================================

export type EffectivePriceSource = 1 | 2 | 3 | 4 | 5;

export interface MenuItemWithLocationContext extends MenuItemsModel {
  // Location override data
  effective_price: number;
  effective_cash_price: number | null;
  has_price_override: boolean;
  has_availability_override: boolean;
  location_is_available: boolean;
  global_price: number;
  global_cash_price: number | null;
  /**
   * Cascade level that produced effective_price for this row.
   * Today the GetMenuItems path only resolves L1 (global) or L2
   * (location_item_overrides), so values are 1 or 2. Deeper cascade
   * resolution (L3-L5) happens in the price matrix endpoint.
   */
  effective_price_source: EffectivePriceSource;
  /**
   * Human-readable name of the source (e.g. "Global", "Downtown override").
   * Safe to render directly in lists.
   */
  effective_price_source_name: string;
}

// ============================================================================
// PRICE MATRIX
// ============================================================================

export interface PriceMatrixRow {
  level: EffectivePriceSource;
  /** Table name that stores this override (developer-only) */
  tableName: string;
  locationId: string | null;
  locationName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  menuId: string | null;
  menuName: string | null;
  price: number | null;
  cashPrice: number | null;
  /** ID of the override row itself (for delete/update) */
  overrideId: string | null;
}

export interface PriceMatrixResult {
  itemId: string;
  itemName: string;
  globalPrice: number;
  globalCashPrice: number | null;
  levels: PriceMatrixRow[];
}

// ============================================================================
// GET OPERATIONS
// ============================================================================

export async function GetMenuItems(
  clerkOrgId: string,
  locationId?: string | null,
  merchantId?: string,
) {
  const supabase = createServerSupabaseClient();
  let finalMerchantId = merchantId;

  if (!finalMerchantId) {
    if (!clerkOrgId) {
      return [];
    }

    // Get merchant ID
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      console.error("Error getting merchant:", merchantError);
      return [];
    }
    finalMerchantId = merchant.id;
  }

  const { data, error } = await supabase
    .from("menu_items")
    .select("*")
    .eq("merchant_id", finalMerchantId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error getting menu items:", error);
    return [];
  }

  // If no location specified, return global items
  if (!locationId || locationId === "all") {
    return data as MenuItemsModel[];
  }

  // Look up location name so we can label the price source
  const { data: location } = await supabase
    .from("locations")
    .select("name")
    .eq("id", locationId)
    .single();
  const locationName = location?.name || "this location";

  // Get location overrides
  const { data: overrides } = await supabase
    .from("location_menu_item_overrides")
    .select("*")
    .eq("location_id", locationId);

  const overrideMap = new Map(
    (overrides || []).map((o) => [o.menu_item_id, o]),
  );

  // Return items with effective prices
  return data.map((item) => {
    const override = overrideMap.get(item.id);
    const hasPriceOverride = !!(
      override &&
      (override.custom_price !== null || override.custom_cash_price !== null)
    );
    return {
      ...item,
      effective_price: override?.custom_price ?? item.price,
      effective_cash_price: override?.custom_cash_price ?? item.cash_price,
      has_price_override: hasPriceOverride,
      has_availability_override:
        override?.is_available !== undefined &&
        override?.is_available !== item.availability,
      location_is_available: override?.is_available ?? item.availability,
      global_price: item.price,
      global_cash_price: item.cash_price,
      effective_price_source: (hasPriceOverride ? 2 : 1) as EffectivePriceSource,
      effective_price_source_name: hasPriceOverride
        ? `${locationName} override`
        : "Global",
    } as MenuItemWithLocationContext;
  });
}

export async function GetMenuItem(
  itemId: string,
  locationId?: string | null, // Optional: Add context if known
) {
  if (!itemId) return null;

  const Location_Id = locationId == "all" ? null : locationId;
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_menu_item_details", {
    p_item_id: itemId,
    p_location_id: Location_Id || null,
  });
  console.log("data", data);

  if (error) {
    console.error("Error getting menu item:", error);
    return null;
  }

  if (!data) return null;

  // Use explicit casting to ensure type safety with your updated interfaces
  return data as LocationLibraryItem;
}

/**
 * Get menu item with location-specific pricing and availability context
 */
export async function GetMenuItemWithLocationContext(
  itemId: string,
  locationId?: string | null,
) {
  if (!itemId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  // Get menu item with all relations (using new category_items table)
  const { data: item, error } = await supabase
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
                is_available,
                is_featured,
                category:categories(*)
            ),
            menu_item_modifier_groups(
                id,
                display_order,
                modifier_group:modifier_groups(
                    *,
                    modifier_group_items(*)
                )
            )
        `,
    )
    .eq("id", itemId)
    .single();

  if (error || !item) {
    console.error("Error getting menu item:", error);
    return null;
  }

  // If no location specified, return item without override context
  if (!locationId || locationId === "all") {
    return {
      ...item,
      effective_price: item.price,
      effective_cash_price: item.cash_price,
      has_price_override: false,
      has_availability_override: false,
      location_is_available: item.availability,
      global_price: item.price,
      global_cash_price: item.cash_price,
      location_override: null,
      effective_price_source: 1 as EffectivePriceSource,
      effective_price_source_name: "Global",
    };
  }

  // Get location override + location name
  const [override, { data: location }] = await Promise.all([
    GetLocationMenuItemOverride(locationId, itemId),
    supabase
      .from("locations")
      .select("name")
      .eq("id", locationId)
      .single(),
  ]);
  const locationName = location?.name || "this location";

  const hasPriceOverride =
    override &&
    (override.custom_price !== null || override.custom_cash_price !== null);
  const hasAvailabilityOverride =
    override && override.is_available !== item.availability;

  return {
    ...item,
    effective_price:
      hasPriceOverride && override.custom_price !== null
        ? override.custom_price
        : item.price,
    effective_cash_price:
      hasPriceOverride && override.custom_cash_price !== null
        ? override.custom_cash_price
        : item.cash_price,
    has_price_override: !!hasPriceOverride,
    has_availability_override: !!hasAvailabilityOverride,
    location_is_available: override?.is_available ?? item.availability,
    global_price: item.price,
    global_cash_price: item.cash_price,
    location_override: override,
    effective_price_source: (hasPriceOverride
      ? 2
      : 1) as EffectivePriceSource,
    effective_price_source_name: hasPriceOverride
      ? `${locationName} override`
      : "Global",
  };
}

/**
 * @deprecated Use GetMenuWithCategories from menus.ts instead.
 * Items are now accessed through categories within a menu.
 */
export async function GetMenuItemsByMenu(
  menuId: string,
  locationId?: string | null,
) {
  if (!menuId) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  // Get items through category_items via menu_categories junction
  // This replaces the deprecated menu_item_menus table
  const { data, error } = await supabase
    .from("menu_categories")
    .select(
      `
            id,
            category_id,
            display_order,
            category:categories(
                id,
                name,
                category_items(
                    id,
                    menu_item_id,
                    display_order,
                    custom_price,
                    custom_cash_price,
                    is_available,
                    is_featured,
                    menu_item:menu_items(*)
                )
            )
        `,
    )
    .eq("menu_id", menuId)
    .order("display_order", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("Error getting menu items by menu:", error);
    return [];
  }

  // Flatten items from all categories
  const items: Array<
    MenuItemsModel & {
      category_item_id: string;
      category_id: string;
      custom_price?: number | null;
      custom_cash_price?: number | null;
      is_available_in_menu: boolean;
      display_order_in_menu?: number;
      is_featured?: boolean;
    }
  > = [];

  for (const menuCategory of data || []) {
    const category = menuCategory.category as unknown as {
      id: string;
      name: string;
      category_items: Array<{
        id: string;
        menu_item_id: string;
        display_order: number;
        custom_price: number | null;
        custom_cash_price: number | null;
        is_available: boolean;
        is_featured: boolean;
        menu_item: MenuItemsModel;
      }>;
    } | null;

    if (!category?.category_items) continue;

    for (const categoryItem of category.category_items) {
      if (!categoryItem.menu_item) continue;
      items.push({
        ...categoryItem.menu_item,
        category_item_id: categoryItem.id,
        category_id: category.id,
        custom_price: categoryItem.custom_price,
        custom_cash_price: categoryItem.custom_cash_price,
        is_available_in_menu: categoryItem.is_available,
        display_order_in_menu: categoryItem.display_order,
        is_featured: categoryItem.is_featured,
      });
    }
  }

  // If no location specified, return as is
  if (!locationId || locationId === "all") {
    return items;
  }

  // Get location overrides for these items
  const itemIds = items.map((i) => i.id).filter(Boolean);
  if (!itemIds.length) return items;

  const { data: overrides } = await supabase
    .from("location_menu_item_overrides")
    .select("*")
    .eq("location_id", locationId)
    .in("menu_item_id", itemIds);

  const overrideMap = new Map(
    (overrides || []).map((o) => [o.menu_item_id, o]),
  );

  // Apply location overrides to items
  return items.map((item) => {
    const override = overrideMap.get(item.id);
    const hasPriceOverride =
      override &&
      (override.custom_price !== null || override.custom_cash_price !== null);

    return {
      ...item,
      effective_price:
        hasPriceOverride && override.custom_price !== null
          ? override.custom_price
          : item.price,
      effective_cash_price:
        hasPriceOverride && override.custom_cash_price !== null
          ? override.custom_cash_price
          : item.cash_price,
      has_price_override: !!hasPriceOverride,
      location_is_available: override?.is_available ?? item.availability,
      global_price: item.price,
      global_cash_price: item.cash_price,
    };
  });
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

export async function CreateMenuItem(
  clerkOrgId: string,
  data: {
    name: string;
    description?: string;
    price: number;
    cash_price?: number;
    delivery_price?: number | null;
    image?: string;
    meal_types?: ("Lunch" | "Dinner" | "Brunch" | "Specials")[];
    allergens?: string[];
    tax_category?: string;
    is_tax_exempt?: boolean;
    available_channels?: string[];
    card_bg_color?: string;
    availability?: boolean;
    stock_tracking_mode?: "in_stock" | "out_of_stock" | "quantity";
    modifier_group_ids?: string[];
  },
  locationId?: string | null,
) {
  if (!clerkOrgId) {
    return { error: "Organization ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Role check: managers can only create location-specific items for their assigned locations
  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to create menu items" };
  }
  if (roleInfo?.isManager) {
    if (!locationId) {
      return { error: "Managers cannot create global menu items" };
    }
    if (!roleInfo.assignedLocationIds.includes(locationId)) {
      return { error: "You do not have access to this location" };
    }
  }

  // Get merchant ID
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    console.error("Error getting merchant:", merchantError);
    return { error: "Merchant not found" };
  }

  const nameCheck = await assertNameAvailable(supabase, merchant.id, data.name);
  if (nameCheck.error) {
    return { error: nameCheck.error };
  }

  const { data: item, error } = await supabase
    .from("menu_items")
    .insert({
      merchant_id: merchant.id,
      name: data.name,
      description: data.description || null,
      price: data.price,
      cash_price: data.cash_price || null,
      delivery_price: data.delivery_price ?? null,
      image: data.image || null,
      meal_types: data.meal_types || [],
      allergens: data.allergens || [],
      card_bg_color: data.card_bg_color || null,
      availability: data.availability ?? true,
      stock_tracking_mode: data.stock_tracking_mode || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating menu item:", error);
    return { error: error.message };
  }

  // Insert modifier group assignments if provided
  if (data.modifier_group_ids && data.modifier_group_ids.length > 0) {
    const modifierInserts = data.modifier_group_ids.map((groupId, index) => ({
      menu_item_id: item.id,
      modifier_group_id: groupId,
      display_order: index,
      merchant_id: merchant.id,
    }));

    const { error: modifierError } = await supabase
      .from("menu_item_modifier_groups")
      .insert(modifierInserts);

    if (modifierError) {
      console.error("Error linking modifier groups:", modifierError);
      // We don't fail the whole request, but we log it
    }
  }
  console.log("Created menu item:", item);

  // Log Audit Event
  await LogAuditEvent({
    merchantId: merchant.id,
    action: `Created Menu Item: ${data.name}`,
    actionCategory: "menu",
    resourceType: "menu_item",
    resourceId: item.id,
    resourceName: data.name,
    locationId: locationId,
    changes: { after: data as any },
  });

  return { data: item as MenuItemsModel };
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update a menu item - location-aware
 *
 * If locationId is provided AND data contains price/availability changes:
 *   → Creates/updates location_menu_item_overrides (location-specific)
 * If locationId is null/undefined OR "all":
 *   → Updates the global menu_items table
 */
export async function UpdateMenuItem(
  itemId: string,
  data: {
    name?: string;
    description?: string;
    price?: number;
    cash_price?: number;
    image?: string;
    meal_types?: ("Lunch" | "Dinner" | "Brunch" | "Specials")[];
    allergens?: string[];
    dietary_flags?: string[];
    card_bg_color?: string;
    availability?: boolean;
    stock_tracking_mode?: "in_stock" | "out_of_stock" | "quantity";
    tax_category?: string;
    is_tax_exempt?: boolean;
    available_channels?: string[];
    modifier_group_ids?: string[];
  },
  locationId?: string | null,
) {
  console.log("UpdateMenuItem data", data);
  console.log("UpdateMenuItem locationId", locationId);
  console.log("UpdateMenuItem itemId", itemId);
  if (!itemId) {
    return { error: "Item ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Role check for managers and members
  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to update menu items" };
  }
  if (roleInfo?.isManager) {
    // Look up the item's location_id to distinguish global vs location-specific
    const { data: itemCheck } = await supabase
      .from("menu_items")
      .select("location_id")
      .eq("id", itemId)
      .single();

    const itemLocationId = itemCheck?.location_id;

    if (!itemLocationId) {
      // Global item: manager can only edit price/availability via location override
      if (!locationId || locationId === "all") {
        return {
          error:
            "Managers must provide a location context to update global menu items",
        };
      }
      if (!roleInfo.assignedLocationIds.includes(locationId)) {
        return { error: "You do not have access to this location" };
      }
      // Block non-price/availability fields for global items
      const blockedFields = [
        "name",
        "description",
        "image",
        "meal_types",
        "allergens",
        "card_bg_color",
        "modifier_group_ids",
        "tax_category",
        "is_tax_exempt",
        "available_channels",
      ] as const;
      const hasBlockedFields = blockedFields.some(
        (f) => data[f as keyof typeof data] !== undefined,
      );
      if (hasBlockedFields) {
        return {
          error:
            "Managers can only update price and availability for global menu items",
        };
      }
    } else {
      // Location-specific item: manager can only edit items in their assigned locations
      if (!roleInfo.assignedLocationIds.includes(itemLocationId)) {
        return { error: "You do not have access to this menu item" };
      }
    }
  }

  if (data.name !== undefined) {
    const { data: existingItem } = await supabase
      .from("menu_items")
      .select("merchant_id, name")
      .eq("id", itemId)
      .single();
    if (
      existingItem &&
      data.name.trim().toLowerCase() !==
        (existingItem.name ?? "").trim().toLowerCase()
    ) {
      const nameCheck = await assertNameAvailable(
        supabase,
        existingItem.merchant_id,
        data.name,
        { excludeTable: "menu_items", excludeId: itemId },
      );
      if (nameCheck.error) {
        return { error: nameCheck.error };
      }
    }
  }

  // Determine if this is a location-scoped update
  const isLocationScoped = locationId && locationId !== "all";
  console.log("UpdateMenuItem isLocationScoped", isLocationScoped);

  // Fields that can be overridden at location level
  const locationOverrideFields = [
    "price",
    "cash_price",
    "availability",
    "stock_tracking_mode",
  ];

  // Check if we have any location-overridable fields in the data
  const hasLocationOverrideData = locationOverrideFields.some(
    (field) => data[field as keyof typeof data] !== undefined,
  );
  console.log(
    "UpdateMenuItem hasLocationOverrideData",
    hasLocationOverrideData,
  );

  // If location-scoped and has overridable data, use location override
  if (isLocationScoped && hasLocationOverrideData) {
    // Prepare override data
    const overrideData: OverrideData = {};

    if (data.price !== undefined) {
      overrideData.custom_price = data.price;
    }
    if (data.cash_price !== undefined) {
      overrideData.custom_cash_price = data.cash_price;
    }
    if (data.availability !== undefined) {
      overrideData.is_available = data.availability;
    }
    if (data.stock_tracking_mode !== undefined) {
      overrideData.stock_tracking_mode =
        data.stock_tracking_mode as OverrideData["stock_tracking_mode"];
    }

    // Update/create location override
    const overrideResult = await UpsertLocationMenuItemOverride(
      locationId,
      itemId,
      overrideData,
    );

    if (overrideResult.error) {
      return { error: overrideResult.error };
    }

    // Check if there are any non-location fields to update globally
    const globalFields = [
      "name",
      "description",
      "image",
      "meal_types",
      "allergens",
      "card_bg_color",
    ];
    const hasGlobalData = globalFields.some(
      (field) => data[field as keyof typeof data] !== undefined,
    );

    // If no global fields, return success with just the override
    if (!hasGlobalData) {
      // Get updated item with context
      const updatedItem = await GetMenuItemWithLocationContext(
        itemId,
        locationId,
      );

      // Log Audit Event for location-only update
      await LogAuditEvent({
        merchantId: updatedItem?.merchant_id,
        action: `Updated Menu Item (Location Override)`,
        actionCategory: "menu",
        resourceType: "menu_item",
        resourceId: itemId,
        resourceName: updatedItem?.name,
        locationId: locationId,
        severity: overrideData.custom_price !== undefined ? "warning" : "info",
        changes: { after: overrideData as Record<string, unknown> },
      });

      return {
        data: updatedItem,
        location_override: overrideResult.data,
      };
    }

    // Continue to update global fields below
  }

  // Build update object with only provided fields (non-location fields for scoped updates)
  const updateData: Record<string, unknown> = {};

  if (!isLocationScoped || !hasLocationOverrideData) {
    // Include all fields for global updates
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.cash_price !== undefined) updateData.cash_price = data.cash_price;
    if (data.image !== undefined) updateData.image = data.image;
    if (data.meal_types !== undefined) updateData.meal_types = data.meal_types;
    if (data.allergens !== undefined) updateData.allergens = data.allergens;
    if (data.dietary_flags !== undefined) updateData.dietary_flags = data.dietary_flags;
    if (data.card_bg_color !== undefined)
      updateData.card_bg_color = data.card_bg_color;
    if (data.stock_tracking_mode !== undefined)
      updateData.stock_tracking_mode = data.stock_tracking_mode;
    if (data.tax_category !== undefined)
      updateData.tax_category = data.tax_category;
    if (data.is_tax_exempt !== undefined)
      updateData.is_tax_exempt = data.is_tax_exempt;
    if (data.available_channels !== undefined)
      updateData.available_channels = data.available_channels;
  } else {
    // Only include non-overridable fields for location-scoped updates
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.image !== undefined) updateData.image = data.image;
    if (data.meal_types !== undefined) updateData.meal_types = data.meal_types;
    if (data.allergens !== undefined) updateData.allergens = data.allergens;
    if (data.dietary_flags !== undefined) updateData.dietary_flags = data.dietary_flags;
    if (data.card_bg_color !== undefined)
      updateData.card_bg_color = data.card_bg_color;
  }

  let hasModifiersUpdated = false;

  // Handle Modifier Group assignments (Global Only)
  if (!isLocationScoped && data.modifier_group_ids !== undefined) {
    hasModifiersUpdated = true;
    // First delete existing assignments
    const { error: deleteError } = await supabase
      .from("menu_item_modifier_groups")
      .delete()
      .eq("menu_item_id", itemId);

    if (deleteError) {
      console.error(
        "Error deleting existing modifier assignments:",
        deleteError,
      );
      return { error: "Failed to update modifiers" };
    }

    // Insert new assignments if any
    if (data.modifier_group_ids.length > 0) {
      // Fetch merchant_id for RLS policy
      const { data: itemForMerchant } = await supabase
        .from("menu_items")
        .select("merchant_id")
        .eq("id", itemId)
        .single();

      const modifierInserts = data.modifier_group_ids.map((groupId, index) => ({
        menu_item_id: itemId,
        modifier_group_id: groupId,
        display_order: index,
        merchant_id: itemForMerchant?.merchant_id,
      }));

      const { error: insertError } = await supabase
        .from("menu_item_modifier_groups")
        .insert(modifierInserts);

      if (insertError) {
        console.error("Error inserting modifier assignments:", insertError);
        return { error: "Failed to update modifiers" };
      }
    }
  }

  console.log("UpdateMenuItem updateData", updateData);

  // If nothing to update in global table AND no modifiers updated, return early
  if (Object.keys(updateData).length === 0 && !hasModifiersUpdated) {
    const item = await GetMenuItemWithLocationContext(itemId, locationId);
    return { data: item };
  }

  let item: MenuItemsModel | null = null;

  // If we have table updates, perform them
  if (Object.keys(updateData).length > 0) {
    const { data: updatedItem, error } = await supabase
      .from("menu_items")
      .update(updateData)
      .eq("id", itemId)
      .select()
      .single();

    if (error) {
      console.error("Error updating menu item:", error);
      return { error: error.message };
    }
    item = updatedItem;
  } else {
    // Just modifiers updated, fetch the current item state
    const { data: currentItem, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (error) {
      return { error: error.message };
    }
    item = currentItem as MenuItemsModel;
  }

  if (!item) return { error: "Failed to retrieve item" };

  // Return with location context if applicable
  if (isLocationScoped) {
    const contextItem = await GetMenuItemWithLocationContext(
      itemId,
      locationId,
    );

    // Log Audit Event for location-scoped update
    await LogAuditEvent({
      merchantId: contextItem?.merchant_id,
      action: `Updated Menu Item (Location Override)`,
      actionCategory: "menu",
      resourceType: "menu_item",
      resourceId: itemId,
      resourceName: item.name,
      locationId: locationId,
      severity: data.price !== undefined ? "warning" : "info",
      changes: { after: data as Record<string, unknown> },
    });

    return { data: contextItem };
  }

  // Log Audit Event for global update
  await LogAuditEvent({
    merchantId: item.merchant_id,
    action: `Updated Menu Item: ${item.name}`,
    actionCategory: "menu",
    resourceType: "menu_item",
    resourceId: itemId,
    resourceName: item.name,
    severity: data.price !== undefined ? "warning" : "info",
    changes: { after: data as Record<string, unknown> },
  });

  return { data: item as MenuItemsModel };
}

/**
 * Reset location-specific override to use global values
 */
export async function ResetMenuItemToGlobal(
  itemId: string,
  locationId: string,
) {
  if (!itemId || !locationId) {
    return { error: "Item ID and Location ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("location_menu_item_overrides")
    .delete()
    .eq("location_id", locationId)
    .eq("menu_item_id", itemId);

  if (error) {
    console.error("Error resetting menu item to global:", error);
    return { error: error.message };
  }

  // Return the item with updated context
  const item = await GetMenuItemWithLocationContext(itemId, locationId);

  // Log Audit Event
  await LogAuditEvent({
    merchantId: item?.merchant_id,
    action: `Reset Item to Global`,
    actionCategory: "menu",
    resourceType: "menu_item",
    resourceId: itemId,
    resourceName: item?.name,
    locationId: locationId,
  });
  return { data: item };
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

export async function DeleteMenuItem(
  itemId: string,
  locationId?: string | null,
) {
  if (!itemId) {
    return { error: "Item ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Role check: managers can only delete location-specific items for their assigned locations
  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to delete menu items" };
  }
  if (roleInfo?.isManager) {
    const { data: itemCheck } = await supabase
      .from("menu_items")
      .select("location_id")
      .eq("id", itemId)
      .single();

    if (!itemCheck?.location_id) {
      return { error: "Managers cannot delete global menu items" };
    }
    if (!roleInfo.assignedLocationIds.includes(itemCheck.location_id)) {
      return { error: "You do not have access to this menu item" };
    }
  }

  // Get item details before deleting (for audit log)
  const { data: item } = await supabase
    .from("menu_items")
    .select("merchant_id, name")
    .eq("id", itemId)
    .single();

  // Clean up child records before deleting the parent.
  // This is defensive — the migration adds ON DELETE CASCADE, but it may
  // not be deployed yet.  Order is not important because nothing references
  // these tables except order_items.selected_size_id (SET NULL in migration).
  await Promise.all([
    supabase.from("item_sizes").delete().eq("menu_item_id", itemId),
    supabase.from("item_addons").delete().eq("menu_item_id", itemId),
    supabase.from("item_stock").delete().eq("menu_item_id", itemId),
    supabase.from("category_items").delete().eq("menu_item_id", itemId),
    supabase.from("menu_item_modifier_groups").delete().eq("menu_item_id", itemId),
    supabase.from("menu_item_menus").delete().eq("menu_item_id", itemId),
    supabase.from("location_item_overrides").delete().eq("menu_item_id", itemId),
    supabase.from("location_menu_item_overrides").delete().eq("menu_item_id", itemId),
    supabase.from("menu_item_discounts").delete().eq("menu_item_id", itemId),
  ]);

  const { error } = await supabase.from("menu_items").delete().eq("id", itemId);
  if (error) {
    console.error("Error deleting menu item:", error);
    return { error: error.message };
  }

  // Log Audit Event
  if (item) {
    await LogAuditEvent({
      merchantId: item.merchant_id,
      action: `Deleted Menu Item: ${item.name}`,
      actionCategory: "menu",
      resourceType: "menu_item",
      resourceId: itemId,
      resourceName: item.name,
      locationId: locationId,
      severity: "warning",
    });
  }

  return { success: true };
}

// ============================================================================
// ITEMS WITH CATEGORIES
// ============================================================================

export async function GetMenuItemsWithCategories(
  clerkOrgId: string,
  locationId?: string | null,
) {
  if (!clerkOrgId) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  // Get merchant ID
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    console.error("Error getting merchant:", merchantError);
    return [];
  }

  const { data, error } = await supabase
    .from("menu_items")
    .select(
      `
            *,
            category_items(
                id,
                category_id,
                custom_price,
                is_featured,
                category:categories(
                    id,
                    name
                )
            )
        `,
    )
    .eq("merchant_id", merchant.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error getting menu items with categories:", error);
    return [];
  }

  // If no location specified, return global items
  if (!locationId || locationId === "all") {
    return data as (MenuItemsModel & {
      category_items: Array<{
        id: string;
        category_id: string;
        custom_price: number | null;
        is_featured: boolean;
        category: {
          id: string;
          name: string;
        } | null;
      }>;
    })[];
  }

  // Get location overrides
  const itemIds = data.map((d) => d.id);
  const { data: overrides } = await supabase
    .from("location_menu_item_overrides")
    .select("*")
    .eq("location_id", locationId)
    .in("menu_item_id", itemIds);

  const overrideMap = new Map(
    (overrides || []).map((o) => [o.menu_item_id, o]),
  );

  // Look up location name for source labeling
  const { data: location } = await supabase
    .from("locations")
    .select("name")
    .eq("id", locationId)
    .single();
  const locationName = location?.name || "this location";

  // Return items with location context
  return data.map((item) => {
    const override = overrideMap.get(item.id);
    const hasPriceOverride = !!(
      override &&
      (override.custom_price !== null || override.custom_cash_price !== null)
    );

    return {
      ...item,
      effective_price:
        hasPriceOverride && override!.custom_price !== null
          ? override!.custom_price
          : item.price,
      effective_cash_price:
        hasPriceOverride && override!.custom_cash_price !== null
          ? override!.custom_cash_price
          : item.cash_price,
      has_price_override: hasPriceOverride,
      location_is_available: override?.is_available ?? item.availability,
      global_price: item.price,
      global_cash_price: item.cash_price,
      effective_price_source: (hasPriceOverride ? 2 : 1) as EffectivePriceSource,
      effective_price_source_name: hasPriceOverride
        ? `${locationName} override`
        : "Global",
    };
  });
}

export async function GetMenuItemsByCategory(categoryId: string) {
  if (!categoryId) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  // Use new category_items table
  const { data, error } = await supabase
    .from("category_items")
    .select(
      `
            id,
            display_order,
            custom_price,
            custom_cash_price,
            is_available,
            is_featured,
            menu_item:menu_items(*)
        `,
    )
    .eq("category_id", categoryId)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("Error getting menu items by category:", error);
    return [];
  }

  // Transform to return items with category context
  return data
    .map((item) => {
      const menuItem = item.menu_item as unknown as MenuItemsModel | null;
      if (!menuItem) return null;
      return {
        ...menuItem,
        category_item_id: item.id,
        category_custom_price: item.custom_price,
        category_custom_cash_price: item.custom_cash_price,
        category_is_available: item.is_available,
        is_featured: item.is_featured,
        display_order: item.display_order,
      };
    })
    .filter(
      (
        item,
      ): item is MenuItemsModel & {
        category_item_id: string;
        category_custom_price: number | null;
        category_custom_cash_price: number | null;
        category_is_available: boolean;
        is_featured: boolean;
        display_order: number;
      } => item !== null,
    );
}

// ============================================================================
// GET PRICE MATRIX
// ============================================================================

/**
 * Returns every override row that exists for a single menu item across the
 * 5-level cascade, joined with location/category/menu names. Used by the
 * Item Price Matrix page and the PriceSourcePopover cascade ladder.
 *
 * The returned `levels` array does NOT pad in "inherits from above" rows —
 * the UI layer computes inheritance by row+column. This keeps the server
 * response proportional to the number of overrides that actually exist.
 */
export async function GetItemPriceMatrix(
  itemId: string,
  clerkOrgId: string,
): Promise<{ data?: PriceMatrixResult; error?: string }> {
  if (!itemId) return { error: "Item ID is required" };
  if (!clerkOrgId) return { error: "Organization ID is required" };

  const supabase = createServerSupabaseClient();

  // Merchant lookup (also enforces org scoping)
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();
  if (merchantError || !merchant) {
    return { error: "Merchant not found" };
  }

  // Base item
  const { data: item, error: itemError } = await supabase
    .from("menu_items")
    .select("id, name, price, cash_price, merchant_id")
    .eq("id", itemId)
    .eq("merchant_id", merchant.id)
    .single();
  if (itemError || !item) {
    return { error: "Item not found" };
  }

  // Fetch all 4 override tables in parallel
  const [l2Res, l3Res, l4Res, l5Res, locsRes] = await Promise.all([
    supabase
      .from("location_item_overrides")
      .select("id, location_id, custom_price, custom_cash_price")
      .eq("menu_item_id", itemId),
    supabase
      .from("category_items")
      .select(
        "id, category_id, custom_price, custom_cash_price, category:categories(id, name)",
      )
      .eq("menu_item_id", itemId)
      .eq("merchant_id", merchant.id),
    supabase
      .from("location_category_item_overrides")
      .select(
        "id, location_id, category_id, custom_price, custom_cash_price, category:categories(id, name)",
      )
      .eq("menu_item_id", itemId),
    supabase
      .from("location_menu_item_overrides")
      .select(
        "id, location_id, menu_id, category_id, custom_price, custom_cash_price, menu:menus(id, name), category:categories(id, name)",
      )
      .eq("menu_item_id", itemId),
    supabase
      .from("locations")
      .select("id, name")
      .eq("merchant_id", merchant.id),
  ]);

  const locationNameById = new Map(
    (locsRes.data || []).map((l) => [l.id as string, l.name as string]),
  );

  const levels: PriceMatrixRow[] = [];

  // L2 — location_item_overrides
  for (const row of l2Res.data || []) {
    levels.push({
      level: 2,
      tableName: "location_item_overrides",
      locationId: row.location_id,
      locationName: locationNameById.get(row.location_id) ?? null,
      categoryId: null,
      categoryName: null,
      menuId: null,
      menuName: null,
      price: row.custom_price,
      cashPrice: row.custom_cash_price,
      overrideId: row.id,
    });
  }

  // L3 — category_items (global)
  for (const row of l3Res.data || []) {
    const cat = Array.isArray(row.category) ? row.category[0] : row.category;
    levels.push({
      level: 3,
      tableName: "category_items",
      locationId: null,
      locationName: null,
      categoryId: row.category_id,
      categoryName: cat?.name ?? null,
      menuId: null,
      menuName: null,
      price: row.custom_price,
      cashPrice: row.custom_cash_price,
      overrideId: row.id,
    });
  }

  // L4 — location_category_item_overrides
  for (const row of l4Res.data || []) {
    const cat = Array.isArray(row.category) ? row.category[0] : row.category;
    levels.push({
      level: 4,
      tableName: "location_category_item_overrides",
      locationId: row.location_id,
      locationName: locationNameById.get(row.location_id) ?? null,
      categoryId: row.category_id,
      categoryName: cat?.name ?? null,
      menuId: null,
      menuName: null,
      price: row.custom_price,
      cashPrice: row.custom_cash_price,
      overrideId: row.id,
    });
  }

  // L5 — location_menu_item_overrides
  for (const row of l5Res.data || []) {
    const cat = Array.isArray(row.category) ? row.category[0] : row.category;
    const menu = Array.isArray(row.menu) ? row.menu[0] : row.menu;
    levels.push({
      level: 5,
      tableName: "location_menu_item_overrides",
      locationId: row.location_id,
      locationName: locationNameById.get(row.location_id) ?? null,
      categoryId: row.category_id,
      categoryName: cat?.name ?? null,
      menuId: row.menu_id,
      menuName: menu?.name ?? null,
      price: row.custom_price,
      cashPrice: row.custom_cash_price,
      overrideId: row.id,
    });
  }

  return {
    data: {
      itemId: item.id,
      itemName: item.name,
      globalPrice: item.price,
      globalCashPrice: item.cash_price,
      levels,
    },
  };
}

export async function ReorderMenuItemModifierGroups(
  itemId: string,
  groupOrders: Array<{ modifierGroupId: string; displayOrder: number }>,
  locationId?: string | null,
) {
  if (!itemId) {
    return { error: "Item ID is required" };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "reorder_item_modifier_groups",
    {
      p_menu_item_id: itemId,
      p_group_orders: groupOrders.map(({ modifierGroupId, displayOrder }) => ({
        modifier_group_id: modifierGroupId,
        display_order: displayOrder,
      })),
      p_location_id: locationId && locationId !== "all" ? locationId : null,
    },
  );

  if (error) {
    console.error("Error reordering menu item modifier groups:", error);
    return { error: error.message };
  }

  return { success: true, data };
}
