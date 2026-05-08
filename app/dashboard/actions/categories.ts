"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CategoriesModel } from "@/types/db-modles";
import { CategoryWithItems } from "@/types/menu";
import { LogAuditEvent } from "./audit-logs";
import { getCurrentUserMerchantRole } from "./role-check";

// ============================================================================
// GET OPERATIONS
// ============================================================================

/**
 * Get categories for a merchant (basic list without items)
 */
export async function GetCategories(
  clerkOrgId: string,
  menuId?: string | null,
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

  // Build query
  let query = supabase
    .from("categories")
    .select("*")
    .eq("merchant_id", merchant.id)
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (menuId === null) {
    // Get merchant-global categories (menu_id is null)
    query = query.is("menu_id", null);
  } else if (menuId) {
    // Get menu-specific categories
    query = query.eq("menu_id", menuId);
  }
  // If menuId is undefined, get all categories

  const { data, error } = await query;

  if (error) {
    console.error("Error getting categories:", error);
    return [];
  }
  return data as CategoriesModel[];
}

/**
 * Get categories with items for a location using the RPC function
 * This is the PRIMARY way to get category-centric data
 */
export async function GetCategoriesForLocation(
  merchantId: string,
  locationId?: string | null,
) {
  if (!merchantId) {
    return { success: false, error: "Merchant ID is required", data: [] };
  }

  const supabase = createServerSupabaseClient();
  const location_Id = locationId === "all" ? null : locationId;

  const { data, error } = await supabase.rpc("get_categories_for_location", {
    p_merchant_id: merchantId,
    p_location_id: location_Id || null,
  });

  if (error) {
    console.error("Error getting categories for location:", error);
    return { success: false, error: error.message, data: [] };
  }

  return { success: true, data: (data || []) as CategoryWithItems[] };
}

/**
 * Get categories for location using clerk org ID
 */
export async function GetCategoriesWithItemsForLocation(
  clerkOrgId: string,
  locationId?: string | null,
) {
  if (!clerkOrgId) {
    return { success: false, error: "Organization ID is required", data: [] };
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
    return { success: false, error: "Merchant not found", data: [] };
  }

  return GetCategoriesForLocation(merchant.id, locationId);
}

export async function GetCategory(categoryId: string) {
  if (!categoryId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data: category, error } = await supabase
    .from("categories")
    .select(
      `
            *,
            category_schedules(
                id,
                schedule:schedules(*)
            )
        `,
    )
    .eq("id", categoryId)
    .single();

  if (error || !category) {
    console.error("Error getting category:", error);
    return null;
  }

  return category as CategoriesModel & {
    category_schedules?: Array<{
      id: string;
      schedule: any;
    }>;
  };
}

/**
 * Get a category with its items
 */
export async function GetCategoryWithItems(
  categoryId: string,
  locationId?: string | null,
) {
  if (!categoryId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  // Get category with merchant_id
  const { data: category, error: catError } = await supabase
    .from("categories")
    .select("*, merchant_id")
    .eq("id", categoryId)
    .single();

  if (catError || !category) {
    console.error("Error getting category:", catError);
    return null;
  }

  // Get all categories for this merchant with items, then filter
  const { data, error } = await supabase.rpc("get_categories_for_location", {
    p_merchant_id: category.merchant_id,
    p_location_id: locationId === "all" ? null : locationId || null,
  });

  if (error) {
    console.error("Error getting category with items:", error);
    return null;
  }

  // Find the specific category
  const categoryWithItems = (data as CategoryWithItems[])?.find(
    (c) => c.id === categoryId,
  );
  return categoryWithItems || null;
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

export async function CreateCategory(
  clerkOrgId: string,
  locationId: string | null,
  data: {
    name: string;
    description?: string;
    menu_id?: string | null;
    display_order?: number;
    image?: string;
    is_active?: boolean;
  },
) {
  if (!clerkOrgId) {
    return { error: "Organization ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Role check: managers can only create location-specific categories for their assigned locations
  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to create categories" };
  }
  if (roleInfo?.isManager) {
    if (!locationId) {
      return { error: "Managers cannot create global categories" };
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

  // If menu_id is provided, verify it belongs to the merchant
  if (data.menu_id) {
    const { data: menu, error: menuError } = await supabase
      .from("menus")
      .select("id")
      .eq("id", data.menu_id)
      .eq("merchant_id", merchant.id)
      .single();

    if (menuError || !menu) {
      return { error: "Menu not found or does not belong to merchant" };
    }
  }

  const { data: category, error } = await supabase
    .from("categories")
    .insert({
      merchant_id: merchant.id,
      name: data.name,
      description: data.description || null,
      location_id: locationId,
      display_order: data.display_order || null,
      image: data.image || null,
      is_active: data.is_active ?? true,
      is_global: locationId === null ? true : false,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating category:", error);
    return { error: error.message };
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId: merchant.id,
    action: `Created Category: ${data.name}`,
    actionCategory: "menu",
    resourceType: "category",
    resourceId: category.id,
    resourceName: data.name,
    locationId: locationId,
    changes: { after: data as any },
  });

  return { data: category as CategoriesModel };
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

export async function UpdateCategory(
  categoryId: string,
  data: {
    name?: string;
    description?: string;
    menu_id?: string | null;
    display_order?: number;
    image?: string;
    is_active?: boolean;
  },
  locationId?: string | null,
) {
  if (!categoryId) {
    return { error: "Category ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Role check: managers cannot edit global categories
  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to update categories" };
  }
  if (roleInfo?.isManager) {
    const { data: categoryCheck } = await supabase
      .from("categories")
      .select("location_id")
      .eq("id", categoryId)
      .single();

    if (!categoryCheck?.location_id) {
      return { error: "Managers cannot edit global categories" };
    }
    if (!roleInfo.assignedLocationIds.includes(categoryCheck.location_id)) {
      return { error: "You do not have access to this category" };
    }
  }

  // Build update object
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.menu_id !== undefined) updateData.menu_id = data.menu_id || null;
  if (data.display_order !== undefined)
    updateData.display_order = data.display_order;
  if (data.image !== undefined) updateData.image = data.image;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

  // If menu_id is being updated, verify it belongs to the merchant
  if (data.menu_id !== undefined && data.menu_id) {
    const { data: category } = await supabase
      .from("categories")
      .select("merchant_id")
      .eq("id", categoryId)
      .single();

    if (category) {
      const { data: menu, error: menuError } = await supabase
        .from("menus")
        .select("id")
        .eq("id", data.menu_id)
        .eq("merchant_id", category.merchant_id)
        .single();

      if (menuError || !menu) {
        return { error: "Menu not found or does not belong to merchant" };
      }
    }
  }

  const { data: category, error } = await supabase
    .from("categories")
    .update(updateData)
    .eq("id", categoryId)
    .select()
    .single();

  if (error) {
    console.error("Error updating category:", error);
    return { error: error.message };
  }

  // Log Audit Event
  await LogAuditEvent({
    merchantId: category.merchant_id,
    action: `Updated Category: ${category.name}`,
    actionCategory: "menu",
    resourceType: "category",
    resourceId: categoryId,
    resourceName: category.name,
    locationId: locationId,
    changes: { after: data as any },
  });

  return { data: category as CategoriesModel };
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

export async function DeleteCategory(
  categoryId: string,
  locationId?: string | null,
) {
  if (!categoryId) {
    return { error: "Category ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Role check: managers can only delete location-specific categories for their assigned locations
  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to delete categories" };
  }
  if (roleInfo?.isManager) {
    const { data: categoryCheck } = await supabase
      .from("categories")
      .select("location_id")
      .eq("id", categoryId)
      .single();

    if (!categoryCheck?.location_id) {
      return { error: "Managers cannot delete global categories" };
    }
    if (!roleInfo.assignedLocationIds.includes(categoryCheck.location_id)) {
      return { error: "You do not have access to this category" };
    }
  }

  // Fetch category first to get name for logging
  const { data: category } = await supabase
    .from("categories")
    .select("name, merchant_id")
    .eq("id", categoryId)
    .single();

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId);

  if (error) {
    console.error("Error deleting category:", error);
    return { error: error.message };
  }

  // Log Audit Event
  if (category) {
    await LogAuditEvent({
      merchantId: category.merchant_id,
      action: `Deleted Category: ${category.name}`,
      actionCategory: "menu",
      resourceType: "category",
      resourceId: categoryId,
      resourceName: category.name,
      locationId: locationId,
      severity: "warning",
    });
  }

  return { success: true };
}

// ============================================================================
// CATEGORY-MENU ASSIGNMENT OPERATIONS
// ============================================================================

/**
 * Add a category to a menu using the RPC function
 */
export async function AddCategoryToMenu(
  menuId: string,
  categoryId: string,
  merchantId: string,
  displayOrder?: number,
  customTitle?: string,
  locationId?: string | null,
) {
  if (!categoryId || !menuId) {
    return { error: "Category ID and Menu ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("menu_categories")
    .upsert(
      {
        menu_id: menuId,
        category_id: categoryId,
        merchant_id: merchantId,
        display_order: displayOrder ?? 0,
        custom_title: customTitle || null,
        is_active: true,
      },
      { onConflict: "menu_id,category_id" },
    );

  if (error) {
    console.error("Error adding category to menu:", error);
    return { error: error.message };
  }

  // Fetch menu and category names for logging
  const [menuRes, catRes] = await Promise.all([
    supabase
      .from("menus")
      .select("name, merchant_id")
      .eq("id", menuId)
      .single(),
    supabase.from("categories").select("name").eq("id", categoryId).single(),
  ]);

  await LogAuditEvent({
    merchantId: menuRes.data?.merchant_id,
    action: `Assigned Category "${catRes.data?.name || "Unknown"}" to Menu: ${menuRes.data?.name || "Unknown"}`,
    actionCategory: "menu",
    resourceType: "menu_category",
    resourceId: categoryId,
    locationId: locationId,
    metadata: {
      menu_id: menuId,
      menu_name: menuRes.data?.name,
      category_name: catRes.data?.name,
      display_order: displayOrder,
      custom_title: customTitle,
    },
  });

  return { success: true, data };
}

/**
 * Remove a category from a menu using the RPC function
 */
export async function RemoveCategoryFromMenu(
  menuId: string,
  categoryId: string,
  locationId?: string | null,
) {
  if (!categoryId || !menuId) {
    return { error: "Category ID and Menu ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("remove_category_from_menu", {
    p_menu_id: menuId,
    p_category_id: categoryId,
  });

  if (error) {
    console.error("Error removing category from menu:", error);
    return { error: error.message };
  }

  // Fetch menu and category names for logging
  const [menuRes, catRes] = await Promise.all([
    supabase
      .from("menus")
      .select("name, merchant_id")
      .eq("id", menuId)
      .single(),
    supabase.from("categories").select("name").eq("id", categoryId).single(),
  ]);

  await LogAuditEvent({
    merchantId: menuRes.data?.merchant_id,
    action: `Removed Category "${catRes.data?.name || "Unknown"}" from Menu: ${menuRes.data?.name || "Unknown"}`,
    actionCategory: "menu",
    resourceType: "menu_category",
    resourceId: categoryId,
    locationId: locationId,
    metadata: {
      menu_id: menuId,
      menu_name: menuRes.data?.name,
      category_name: catRes.data?.name,
    },
  });

  return { success: true, data };
}

/**
 * @deprecated Use AddCategoryToMenu instead
 */
export async function AssignCategoryToMenu(
  categoryId: string,
  menuId: string,
  displayOrder?: number,
) {
  const supabase = createServerSupabaseClient();
  const { data: menu } = await supabase
    .from("menus")
    .select("merchant_id")
    .eq("id", menuId)
    .single();

  if (!menu) {
    return { error: "Menu not found" };
  }

  return AddCategoryToMenu(menuId, categoryId, menu.merchant_id, displayOrder);
}

// ============================================================================
// CATEGORY-ITEM ASSIGNMENT OPERATIONS
// ============================================================================

/**
 * Add an item to a category using the RPC function
 */
export async function AddItemToCategory(
  categoryId: string,
  menuItemId: string,
  merchantId: string,
  displayOrder?: number,
  customPrice?: number,
  isFeatured?: boolean,
  locationId?: string | null,
) {
  if (!categoryId || !menuItemId) {
    return { error: "Category ID and Menu Item ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.from("category_items").insert({
    category_id: categoryId,
    menu_item_id: menuItemId,
    display_order: displayOrder ?? 0,
    custom_price: customPrice || null,
    is_featured: isFeatured ?? false,
    merchant_id: merchantId,
  });

  if (error) {
    console.error("Error adding item to category:", error);
    return { error: error.message };
  }

  // Fetch category and item names
  const [catRes, itemRes] = await Promise.all([
    supabase.from("categories").select("name").eq("id", categoryId).single(),
    supabase.from("menu_items").select("name").eq("id", menuItemId).single(),
  ]);

  await LogAuditEvent({
    merchantId,
    action: `Assigned Item "${itemRes.data?.name || "Unknown"}" to Category: ${catRes.data?.name || "Unknown"}`,
    actionCategory: "menu",
    resourceType: "category_item",
    resourceId: menuItemId,
    locationId: locationId,
    metadata: {
      category_id: categoryId,
      category_name: catRes.data?.name,
      item_name: itemRes.data?.name,
      display_order: displayOrder,
      custom_price: customPrice,
      is_featured: isFeatured,
    },
  });

  return { success: true, data };
}

/**
 * Remove an item from a category using the RPC function
 */
export async function RemoveItemFromCategory(
  categoryId: string,
  menuItemId: string,
  locationId?: string | null,
) {
  if (!categoryId || !menuItemId) {
    return { error: "Category ID and Menu Item ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("remove_item_from_category", {
    p_category_id: categoryId,
    p_menu_item_id: menuItemId,
  });

  if (error) {
    console.error("Error removing item from category:", error);
    return { error: error.message };
  }

  // Fetch category and item details (need merchant_id from item or category)
  const { data: itemRes } = await supabase
    .from("menu_items")
    .select("name, merchant_id")
    .eq("id", menuItemId)
    .single();
  const { data: catRes } = await supabase
    .from("categories")
    .select("name")
    .eq("id", categoryId)
    .single();

  if (itemRes) {
    await LogAuditEvent({
      merchantId: itemRes.merchant_id,
      action: `Removed Item "${itemRes.name}" from Category "${catRes?.name || "Unknown"}"`,
      actionCategory: "menu",
      resourceType: "category_item",
      resourceId: menuItemId,
      resourceName: itemRes.name,
      locationId: locationId,
      metadata: {
        category_id: categoryId,
        category_name: catRes?.name,
        item_name: itemRes.name,
      },
    });
  }

  return { success: true, data };
}

// ============================================================================
// CATEGORY ITEM PRICE OVERRIDE OPERATIONS
// ============================================================================

/**
 * Upsert a category item override (handles L3, L4, L5 based on context)
 */
export async function UpsertCategoryItemOverride(
  menuItemId: string,
  options: {
    categoryId?: string | null;
    menuId?: string | null;
    locationId?: string | null;
    customPrice?: number | null;
    customCashPrice?: number | null;
    isAvailable?: boolean | null;
    priceModifier?: number | null;
    priceModifierType?: "add" | "percent" | null;
    displayOrder?: number | null;
    isFeatured?: boolean | null;
    stockTrackingMode?: string | null;
    currentStock?: number | null;
  },
) {
  if (!menuItemId) {
    return { error: "Menu Item ID is required" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("upsert_category_item_override", {
    p_menu_item_id: menuItemId,
    p_category_id: options.categoryId || null,
    p_menu_id: options.menuId || null,
    p_location_id:
      options.locationId === "all" ? null : options.locationId || null,
    p_custom_price: options.customPrice,
    p_custom_cash_price: options.customCashPrice,
    p_is_available: options.isAvailable,
    p_price_modifier: options.priceModifier,
    p_price_modifier_type: options.priceModifierType,
    p_display_order: options.displayOrder,
    p_is_featured: options.isFeatured,
    p_stock_tracking_mode: options.stockTrackingMode,
    p_current_stock: options.currentStock,
  });

  if (error) {
    console.error("Error upserting category item override:", error);
    return { error: error.message };
  }

  // Log audit event
  const itemRes = await supabase
    .from("menu_items")
    .select("name, merchant_id")
    .eq("id", menuItemId)
    .single();
  let contextName = "Base Item";
  if (options.categoryId) {
    const { data } = await supabase
      .from("categories")
      .select("name")
      .eq("id", options.categoryId)
      .single();
    if (data) contextName = `Category: ${data.name}`;
  } else if (options.menuId) {
    const { data } = await supabase
      .from("menus")
      .select("name")
      .eq("id", options.menuId)
      .single();
    if (data) contextName = `Menu: ${data.name}`;
  }

  if (itemRes.data) {
    await LogAuditEvent({
      merchantId: itemRes.data.merchant_id,
      action: `Overridden Item "${itemRes.data.name}" (${contextName})`,
      actionCategory: "menu",
      resourceType: "category_item_override",
      resourceId: menuItemId,
      resourceName: itemRes.data.name,
      locationId: options.locationId === "all" ? undefined : options.locationId,
      changes: { after: options },
      metadata: {
        context: contextName,
        location_id: options.locationId,
      },
    });
  }

  return { success: true, data };
}

/**
 * Reset an item to a specific price level
 */
export async function ResetCategoryItemToLevel(
  menuItemId: string,
  targetLevel: 1 | 2 | 3 | 4 | 5,
  options?: {
    categoryId?: string | null;
    menuId?: string | null;
    locationId?: string | null;
  },
) {
  if (!menuItemId) {
    return { error: "Menu Item ID is required" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("reset_category_item_to_level", {
    p_menu_item_id: menuItemId,
    p_category_id: options?.categoryId || null,
    p_menu_id: options?.menuId || null,
    p_location_id:
      options?.locationId === "all" ? null : options?.locationId || null,
    p_target_level: targetLevel,
  });

  if (error) {
    console.error("Error resetting category item to level:", error);
    return { error: error.message };
  }

  // Log audit event
  const { data: item } = await supabase
    .from("menu_items")
    .select("name, merchant_id")
    .eq("id", menuItemId)
    .single();
  if (item) {
    await LogAuditEvent({
      merchantId: item.merchant_id,
      action: `Reset Item to Level ${targetLevel}: ${item.name}`,
      actionCategory: "menu",
      resourceType: "category_item_override",
      resourceId: menuItemId,
      resourceName: item.name,
      metadata: {
        target_level: targetLevel,
        ...options,
      },
    });
  }

  return { success: true, data };
}

// ============================================================================
// LOCATION CATEGORY OVERRIDE OPERATIONS
// ============================================================================

/**
 * Update location-specific category settings
 */
export async function UpdateLocationCategoryOverride(
  locationId: string,
  categoryId: string,
  data: {
    isActive?: boolean;
    displayOrder?: number;
    customTitle?: string;
  },
) {
  if (!locationId || !categoryId) {
    return { error: "Location ID and Category ID are required" };
  }

  const supabase = createServerSupabaseClient();

  // First, check if this is a location-specific category
  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("location_id, name, merchant_id")
    .eq("id", categoryId)
    .single();

  if (categoryError || !category) {
    console.error("Error fetching category:", categoryError);
    return { error: "Category not found" };
  }

  // If this is a location-specific category owned by this location, update the category directly
  if (category.location_id === locationId) {
    const updateData: {
      is_active?: boolean;
      display_order?: number;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (data.isActive !== undefined) {
      updateData.is_active = data.isActive;
    }
    if (data.displayOrder !== undefined) {
      updateData.display_order = data.displayOrder;
    }

    const { error } = await supabase
      .from("categories")
      .update(updateData)
      .eq("id", categoryId);

    if (error) {
      console.error("Error updating location-specific category:", error);
      return { error: error.message };
    }

    // Log Audit Event (Direct Update)
    await LogAuditEvent({
      merchantId: category.merchant_id, // category fetched above
      action: `Updated Location Category: ${category.name}`,
      actionCategory: "menu",
      resourceType: "category",
      resourceId: categoryId,
      resourceName: category.name,
      locationId: locationId,
      changes: { after: updateData },
    });

    return { success: true };
  }

  // For global categories (or location-specific categories from other locations),
  // use location_category_overrides
  const { error } = await supabase.from("location_category_overrides").upsert(
    {
      location_id: locationId,
      category_id: categoryId,
      is_active: data.isActive,
      display_order: data.displayOrder,
      custom_title: data.customTitle,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "location_id,category_id",
    },
  );

  if (error) {
    console.error("Error updating location category override:", error);
    return { error: error.message };
  }

  // Fetch category name for log
  const { data: catName } = await supabase
    .from("categories")
    .select("name, merchant_id")
    .eq("id", categoryId)
    .single();

  if (catName) {
    await LogAuditEvent({
      merchantId: catName.merchant_id,
      action: `Updated Category Override: ${catName.name}`,
      actionCategory: "menu",
      resourceType: "location_category_override",
      resourceId: categoryId,
      resourceName: catName.name,
      locationId: locationId,
      changes: { after: data as any },
    });
  }

  return { success: true };
}

/**
 * Remove location-specific category override (revert to global)
 */
export async function RemoveLocationCategoryOverride(
  locationId: string,
  categoryId: string,
) {
  if (!locationId || !categoryId) {
    return { error: "Location ID and Category ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("location_category_overrides")
    .delete()
    .eq("location_id", locationId)
    .eq("category_id", categoryId);

  if (error) {
    console.error("Error removing location category override:", error);
    return { error: error.message };
  }

  // Fetch category name for log
  const { data: catName } = await supabase
    .from("categories")
    .select("name, merchant_id")
    .eq("id", categoryId)
    .single();

  if (catName) {
    await LogAuditEvent({
      merchantId: catName.merchant_id,
      action: `Removed Category Override: ${catName.name}`,
      actionCategory: "menu",
      resourceType: "location_category_override",
      resourceId: categoryId,
      resourceName: catName.name,
      locationId: locationId,
    });
  }

  return { success: true };
}

// ============================================================================
// LOCATION + MENU + CATEGORY OVERRIDE OPERATIONS
// ============================================================================

/**
 * Update location-specific category settings for a specific menu
 * This is used when a location wants to customize a global menu's category
 */
export async function UpdateLocationMenuCategoryOverride(
  locationId: string,
  menuId: string,
  categoryId: string,
  data: {
    isActive?: boolean;
    displayOrder?: number;
    customTitle?: string;
  },
) {
  if (!locationId || !menuId || !categoryId) {
    return { error: "Location ID, Menu ID, and Category ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("location_menu_category_overrides")
    .upsert(
      {
        location_id: locationId,
        menu_id: menuId,
        category_id: categoryId,
        is_active: data.isActive,
        display_order: data.displayOrder,
        custom_title: data.customTitle,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "location_id,menu_id,category_id",
      },
    );

  if (error) {
    console.error("Error updating location menu category override:", error);
    return { error: error.message };
  }

  return { success: true };
}

/**
 * Toggle category visibility in a menu (handles both global and location-specific)
 */
export async function ToggleCategoryInMenu(
  menuId: string,
  categoryId: string,
  isActive: boolean,
  locationId?: string | null,
) {
  if (!menuId || !categoryId) {
    return { error: "Menu ID and Category ID are required" };
  }

  const supabase = createServerSupabaseClient();
  const location_Id = locationId === "all" ? null : locationId;

  // If no location context, update the menu_categories table directly
  if (!location_Id) {
    const { error } = await supabase
      .from("menu_categories")
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("menu_id", menuId)
      .eq("category_id", categoryId);

    if (error) {
      console.error("Error toggling category in menu:", error);
      return { error: error.message };
    }
  } else {
    // Location-specific override
    const { error } = await supabase
      .from("location_menu_category_overrides")
      .upsert(
        {
          location_id: location_Id,
          menu_id: menuId,
          category_id: categoryId,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "location_id,menu_id,category_id",
        },
      );

    if (error) {
      console.error("Error toggling location category override:", error);
      return { error: error.message };
    }
  }

  return { success: true };
}

/**
 * Remove location-specific menu category override (revert to global)
 */
export async function RemoveLocationMenuCategoryOverride(
  locationId: string,
  menuId: string,
  categoryId: string,
) {
  if (!locationId || !menuId || !categoryId) {
    return { error: "Location ID, Menu ID, and Category ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("location_menu_category_overrides")
    .delete()
    .eq("location_id", locationId)
    .eq("menu_id", menuId)
    .eq("category_id", categoryId);

  if (error) {
    console.error("Error removing location menu category override:", error);
    return { error: error.message };
  }

  return { success: true };
}
