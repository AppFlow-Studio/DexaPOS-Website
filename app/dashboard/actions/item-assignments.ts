"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";

// ============================================================================
// ITEM-CATEGORY ASSIGNMENTS (Using new category_items table)
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

  // Auto-propagate category-level modifier groups to the new item
  const { data: categoryModifiers } = await supabase
    .from("category_modifier_groups")
    .select("modifier_group_id")
    .eq("category_id", categoryId);

  if (categoryModifiers?.length) {
    const upserts = categoryModifiers.map((cm) => ({
      menu_item_id: menuItemId,
      modifier_group_id: cm.modifier_group_id,
      merchant_id: merchantId,
    }));
    // Batch upsert — duplicates are silently skipped
    await supabase
      .from("menu_item_modifier_groups")
      .upsert(upserts, { onConflict: "menu_item_id,modifier_group_id" });
  }

  // Fetch category and item names for user-friendly audit log
  const [categoryResult, itemResult] = await Promise.all([
    supabase.from("categories").select("name").eq("id", categoryId).single(),
    supabase.from("menu_items").select("name").eq("id", menuItemId).single(),
  ]);

  const categoryName = categoryResult.data?.name || "Unknown Category";
  const itemName = itemResult.data?.name || "Unknown Item";

  // Log Audit Event with human-readable names
  await LogAuditEvent({
    merchantId,
    action: `Assigned Item "${itemName}" to Category: ${categoryName}`,
    actionCategory: "menu",
    resourceType: "category_item",
    resourceId: menuItemId,
    resourceName: itemName,
    locationId: locationId,
    metadata: {
      category_name: categoryName,
      item_name: itemName,
      display_order: displayOrder,
      custom_price: customPrice,
      is_featured: isFeatured,
      auto_propagated_modifiers: categoryModifiers?.length || 0,
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
  if (!menuItemId || !categoryId) {
    return { error: "Menu Item ID and Category ID are required" };
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

  // Fetch category and item names for user-friendly audit log
  // Ideally we should do this before deleting, or fetched from DB if soft deleted,
  // but RPC deletes the association. The item and category still exist.
  const [categoryResult, itemResult] = await Promise.all([
    supabase.from("categories").select("name").eq("id", categoryId).single(),
    supabase
      .from("menu_items")
      .select("name, merchant_id")
      .eq("id", menuItemId)
      .single(),
  ]);

  const categoryName = categoryResult.data?.name || "Unknown Category";
  const itemName = itemResult.data?.name || "Unknown Item";

  if (itemResult.data) {
    await LogAuditEvent({
      merchantId: itemResult.data.merchant_id,
      action: `Removed Item "${itemName}" from Category: ${categoryName}`,
      actionCategory: "menu",
      resourceType: "category_item",
      resourceId: menuItemId,
      resourceName: itemName,
      locationId: locationId,
      metadata: {
        category_name: categoryName,
        item_name: itemName,
      },
    });
  }

  return { success: true, data };
}

/**
 * @deprecated Use AddItemToCategory instead
 */
export async function AssignItemToCategory(
  menuItemId: string,
  categoryId: string,
  merchantId: string,
) {
  return AddItemToCategory(categoryId, menuItemId, merchantId);
}

/**
 * Update category item settings (display order, featured, category price)
 */
export async function UpdateCategoryItem(
  categoryId: string,
  menuItemId: string,
  data: {
    displayOrder?: number;
    customPrice?: number | null;
    customCashPrice?: number | null;
    isFeatured?: boolean;
    isAvailable?: boolean;
  },
  locationId?: string | null,
) {
  if (!menuItemId || !categoryId) {
    return { error: "Menu Item ID and Category ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.displayOrder !== undefined)
    updateData.display_order = data.displayOrder;
  if (data.customPrice !== undefined)
    updateData.custom_price = data.customPrice;
  if (data.customCashPrice !== undefined)
    updateData.custom_cash_price = data.customCashPrice;
  if (data.isFeatured !== undefined) updateData.is_featured = data.isFeatured;
  if (data.isAvailable !== undefined)
    updateData.is_available = data.isAvailable;

  const { error } = await supabase
    .from("category_items")
    .update(updateData)
    .eq("category_id", categoryId)
    .eq("menu_item_id", menuItemId);

  if (error) {
    console.error("Error updating category item:", error);
    return { error: error.message };
  }

  // Fetch category and item names for user-friendly audit log
  const [categoryResult, itemResult] = await Promise.all([
    supabase.from("categories").select("name").eq("id", categoryId).single(),
    supabase
      .from("menu_items")
      .select("name, merchant_id")
      .eq("id", menuItemId)
      .single(),
  ]);

  const categoryName = categoryResult.data?.name || "Unknown Category";
  const itemName = itemResult.data?.name || "Unknown Item";

  // Build user-friendly changes object
  const userFriendlyChanges: Record<string, unknown> = {};
  if (data.displayOrder !== undefined)
    userFriendlyChanges.display_order = data.displayOrder;
  if (data.customPrice !== undefined)
    userFriendlyChanges.custom_price = data.customPrice;
  if (data.customCashPrice !== undefined)
    userFriendlyChanges.custom_cash_price = data.customCashPrice;
  if (data.isFeatured !== undefined)
    userFriendlyChanges.is_featured = data.isFeatured;
  if (data.isAvailable !== undefined)
    userFriendlyChanges.is_available = data.isAvailable;

  // Log Audit Event with human-readable names
  await LogAuditEvent({
    merchantId: itemResult.data?.merchant_id,
    action: `Updated Item Settings for "${itemName}" in Category: ${categoryName}`,
    actionCategory: "menu",
    resourceType: "category_item",
    resourceId: menuItemId,
    resourceName: itemName,
    locationId: locationId,
    metadata: {
      category_name: categoryName,
      item_name: itemName,
    },
    changes: { after: userFriendlyChanges },
  });

  return { success: true };
}

/**
 * Bulk update category items (for reordering)
 */
export async function UpdateCategoryItemsOrder(
  categoryId: string,
  itemOrders: Array<{ menuItemId: string; displayOrder: number }>,
  locationId?: string | null,
) {
  if (!categoryId || !itemOrders?.length) {
    return { error: "Category ID and item orders are required" };
  }

  const supabase = createServerSupabaseClient();

  // Update each item's display order
  const updates = itemOrders.map(({ menuItemId, displayOrder }) =>
    supabase
      .from("category_items")
      .update({
        display_order: displayOrder,
        updated_at: new Date().toISOString(),
      })
      .eq("category_id", categoryId)
      .eq("menu_item_id", menuItemId),
  );

  const results = await Promise.all(updates);
  const errors = results.filter((r) => r.error);

  if (errors.length > 0) {
    console.error("Error updating category item orders:", errors);
    return { error: "Failed to update some item orders" };
  }

  // Fetch category name and item names for human-readable logging
  const [{ data: category }, { data: items }] = await Promise.all([
    supabase
      .from("categories")
      .select("name, merchant_id")
      .eq("id", categoryId)
      .single(),
    supabase
      .from("menu_items")
      .select("name")
      .in(
        "id",
        itemOrders.map((io) => io.menuItemId),
      ),
  ]);

  if (category) {
    const itemNames = items?.map((i) => i.name) || [];
    await LogAuditEvent({
      merchantId: category.merchant_id,
      action: `Updated Item Order in ${category.name}`,
      actionCategory: "menu",
      resourceType: "menu_category",
      resourceId: categoryId,
      resourceName: category.name,
      locationId: locationId,
      metadata: {
        count: itemOrders.length,
        item_names: itemNames,
      },
    });
  }

  return { success: true };
}

/**
 * Batch update display order for multiple menu categories
 */
export async function UpdateMenuCategoriesOrder(
  menuId: string,
  categoryOrders: Array<{ categoryId: string; displayOrder: number }>,
  locationId?: string | null,
) {
  if (!menuId || !categoryOrders || categoryOrders.length === 0) {
    return { error: "Menu ID and category orders are required" };
  }

  const supabase = createServerSupabaseClient();

  // Validate all categories belong to the menu
  const categoryIds = categoryOrders.map((co) => co.categoryId);
  const { data: menuCategories, error: fetchError } = await supabase
    .from("menu_categories")
    .select("id, category_id")
    .eq("menu_id", menuId)
    .in("category_id", categoryIds);

  if (
    fetchError ||
    !menuCategories ||
    menuCategories.length !== categoryIds.length
  ) {
    return { error: "One or more categories not found in this menu" };
  }

  // Batch update display_order
  const updates = categoryOrders.map(({ categoryId, displayOrder }) =>
    supabase
      .from("menu_categories")
      .update({
        display_order: displayOrder,
        updated_at: new Date().toISOString(),
      })
      .eq("menu_id", menuId)
      .eq("category_id", categoryId),
  );

  const results = await Promise.all(updates);
  const errors = results.filter((r) => r.error);

  if (errors.length > 0) {
    console.error("Error updating menu category orders:", errors);
    return { error: "Failed to update some category orders" };
  }

  // Fetch menu name and category names for human-readable logging
  const [{ data: menu }, { data: categories }] = await Promise.all([
    supabase
      .from("menus")
      .select("name, merchant_id")
      .eq("id", menuId)
      .single(),
    supabase.from("categories").select("name").in("id", categoryIds),
  ]);

  if (menu) {
    const categoryNames = categories?.map((c) => c.name) || [];
    await LogAuditEvent({
      merchantId: menu.merchant_id,
      action: `Updated Category Order in ${menu.name}`,
      actionCategory: "menu",
      resourceType: "menu",
      resourceId: menuId,
      resourceName: menu.name,
      locationId: locationId,
      metadata: {
        count: categoryOrders.length,
        category_names: categoryNames,
      },
    });
  }

  return { success: true };
}

// ============================================================================
// CATEGORY-MENU ASSIGNMENTS
// ============================================================================

/**
 * Add a category to a menu using the RPC function
 */
export async function AddCategoryToMenu(
  menuId: string,
  categoryId: string,
  displayOrder?: number,
  customTitle?: string,
  locationId?: string | null,
) {
  if (!categoryId || !menuId) {
    return { error: "Category ID and Menu ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("add_category_to_menu", {
    p_menu_id: menuId,
    p_category_id: categoryId,
    p_display_order: displayOrder ?? 0,
    p_custom_title: customTitle || null,
  });

  if (error) {
    console.error("Error adding category to menu:", error);
    return { error: error.message };
  }

  // Fetch names for audit log
  const [menuResult, categoryResult] = await Promise.all([
    supabase
      .from("menus")
      .select("name, merchant_id")
      .eq("id", menuId)
      .single(),
    supabase.from("categories").select("name").eq("id", categoryId).single(),
  ]);

  if (menuResult.data) {
    await LogAuditEvent({
      merchantId: menuResult.data.merchant_id,
      action: `Assigned Category "${categoryResult.data?.name || "Unknown"}" to Menu: ${menuResult.data.name}`,
      actionCategory: "menu",
      resourceType: "menu_category",
      resourceId: categoryId,
      resourceName: categoryResult.data?.name,
      locationId: locationId,
      metadata: {
        menu_name: menuResult.data.name,
        menu_id: menuId,
        display_order: displayOrder,
        custom_title: customTitle,
      },
    });
  }

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

  // Fetch names for audit log
  const [menuResult, categoryResult] = await Promise.all([
    supabase
      .from("menus")
      .select("name, merchant_id")
      .eq("id", menuId)
      .single(),
    supabase.from("categories").select("name").eq("id", categoryId).single(),
  ]);

  if (menuResult.data) {
    await LogAuditEvent({
      merchantId: menuResult.data.merchant_id,
      action: `Removed Category "${categoryResult.data?.name || "Unknown"}" from Menu: ${menuResult.data.name}`,
      actionCategory: "menu",
      resourceType: "menu_category",
      resourceId: categoryId,
      resourceName: categoryResult.data?.name,
      locationId: locationId,
      metadata: {
        menu_name: menuResult.data.name,
        menu_id: menuId,
      },
    });
  }

  return { success: true, data };
}

/**
 * Update menu category settings
 */
export async function UpdateMenuCategory(
  menuId: string,
  categoryId: string,
  data: {
    displayOrder?: number;
    isActive?: boolean;
    customTitle?: string;
    customImage?: string;
  },
  locationId?: string | null,
) {
  if (!categoryId || !menuId) {
    return { error: "Category ID and Menu ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.displayOrder !== undefined)
    updateData.display_order = data.displayOrder;
  if (data.isActive !== undefined) updateData.is_active = data.isActive;
  if (data.customTitle !== undefined)
    updateData.custom_title = data.customTitle;
  if (data.customImage !== undefined)
    updateData.custom_image = data.customImage;

  const { error } = await supabase
    .from("menu_categories")
    .update(updateData)
    .eq("menu_id", menuId)
    .eq("category_id", categoryId);

  if (error) {
    console.error("Error updating menu category:", error);
    return { error: error.message };
  }

  // Fetch names for audit log
  const [menuResult, categoryResult] = await Promise.all([
    supabase
      .from("menus")
      .select("name, merchant_id")
      .eq("id", menuId)
      .single(),
    supabase.from("categories").select("name").eq("id", categoryId).single(),
  ]);

  if (menuResult.data) {
    await LogAuditEvent({
      merchantId: menuResult.data.merchant_id,
      action: `Updated Category Settings for "${categoryResult.data?.name || "Unknown"}" in Menu: ${menuResult.data.name}`,
      actionCategory: "menu",
      resourceType: "menu_category",
      resourceId: categoryId,
      resourceName: categoryResult.data?.name,
      locationId: locationId,
      metadata: {
        menu_name: menuResult.data.name,
        menu_id: menuId,
      },
      changes: { after: updateData },
    });
  }

  return { success: true };
}

// ============================================================================
// ITEM-MODIFIER GROUP ASSIGNMENTS
// ============================================================================

export async function AssignModifierToItem(
  menuItemId: string,
  modifierGroupId: string,
  displayOrder?: number,
) {
  if (!menuItemId || !modifierGroupId) {
    return { error: "Menu Item ID and Modifier Group ID are required" };
  }

  const supabase = createServerSupabaseClient();

  // Check if assignment already exists
  const { data: existing } = await supabase
    .from("menu_item_modifier_groups")
    .select("id")
    .eq("menu_item_id", menuItemId)
    .eq("modifier_group_id", modifierGroupId)
    .single();

  if (existing) {
    // Update display order if provided
    if (displayOrder !== undefined) {
      const { error } = await supabase
        .from("menu_item_modifier_groups")
        .update({ display_order: displayOrder })
        .eq("id", existing.id);

      if (error) {
        return { error: error.message };
      }
    }
    return { success: true, data: existing };
  }

  // Fetch the item's merchant_id for RLS
  const { data: menuItem } = await supabase
    .from("menu_items")
    .select("merchant_id")
    .eq("id", menuItemId)
    .single();

  if (!menuItem?.merchant_id) {
    return { error: "Could not determine merchant for this item" };
  }

  // Create new assignment
  const { data, error } = await supabase
    .from("menu_item_modifier_groups")
    .insert({
      menu_item_id: menuItemId,
      modifier_group_id: modifierGroupId,
      merchant_id: menuItem.merchant_id,
      display_order: displayOrder || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Error assigning modifier to item:", error);
    return { error: error.message };
  }

  // Fetch item and modifier group details for auditing
  const [itemResult, modifierResult] = await Promise.all([
    supabase
      .from("menu_items")
      .select("merchant_id, name")
      .eq("id", menuItemId)
      .single(),
    supabase
      .from("modifier_groups")
      .select("name")
      .eq("id", modifierGroupId)
      .single(),
  ]);

  const itemName = itemResult.data?.name || "Unknown Item";
  const modifierGroupName =
    modifierResult.data?.name || "Unknown Modifier Group";

  // Log Audit Event with human-readable names
  if (itemResult.data) {
    await LogAuditEvent({
      merchantId: itemResult.data.merchant_id,
      action: `Assigned "${modifierGroupName}" to Item: ${itemName}`,
      actionCategory: "menu",
      resourceType: "menu_item",
      resourceId: menuItemId,
      resourceName: itemName,
      metadata: {
        modifier_group_name: modifierGroupName,
        display_order: displayOrder,
      },
    });
  }

  return { success: true, data };
}

export async function RemoveModifierFromItem(
  menuItemId: string,
  modifierGroupId: string,
) {
  if (!menuItemId || !modifierGroupId) {
    return { error: "Menu Item ID and Modifier Group ID are required" };
  }

  const supabase = createServerSupabaseClient();

  // Fetch item and modifier group details for auditing BEFORE deleting
  const [itemResult, modifierResult] = await Promise.all([
    supabase
      .from("menu_items")
      .select("merchant_id, name")
      .eq("id", menuItemId)
      .single(),
    supabase
      .from("modifier_groups")
      .select("name")
      .eq("id", modifierGroupId)
      .single(),
  ]);

  const itemName = itemResult.data?.name || "Unknown Item";
  const modifierGroupName =
    modifierResult.data?.name || "Unknown Modifier Group";

  const { error } = await supabase
    .from("menu_item_modifier_groups")
    .delete()
    .eq("menu_item_id", menuItemId)
    .eq("modifier_group_id", modifierGroupId);

  if (error) {
    console.error("Error removing modifier from item:", error);
    return { error: error.message };
  }

  // Log Audit Event with human-readable names
  if (itemResult.data) {
    await LogAuditEvent({
      merchantId: itemResult.data.merchant_id,
      action: `Removed "${modifierGroupName}" from Item: ${itemName}`,
      actionCategory: "menu",
      resourceType: "menu_item",
      resourceId: menuItemId,
      resourceName: itemName,
      metadata: {
        modifier_group_name: modifierGroupName,
      },
    });
  }

  return { success: true };
}

// ============================================================================
// CREATE ITEM IN CATEGORY (Combined operation)
// ============================================================================

/**
 * Creates a new menu item and immediately assigns it to a category.
 * This enforces the hierarchical structure where items must belong to categories.
 *
 * @param locationId - Optional location ID. If provided, creates a location-specific item.
 *                     If null/undefined, creates a global item (location_id = null).
 */
export async function CreateItemInCategory(
  clerkOrgId: string,
  categoryId: string,
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
  },
  options?: {
    displayOrder?: number;
    customPrice?: number;
    isFeatured?: boolean;
    locationId?: string | null;
    merchantId?: string;
  },
) {
  if (!clerkOrgId && !options?.merchantId) {
    return { error: "Organization ID or Merchant ID is required" };
  }

  if (!categoryId) {
    return { error: "Category ID is required" };
  }

  const supabase = createServerSupabaseClient();

  let finalMerchantId = options?.merchantId;

  if (!finalMerchantId) {
    // Get merchant ID from clerk org
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      console.error("Error getting merchant:", merchantError);
      return { error: "Merchant not found" };
    }
    finalMerchantId = merchant.id;
  }

  // Step 1: Create the menu item
  const { data: createdItem, error: createError } = await supabase
    .from("menu_items")
    .insert({
      merchant_id: finalMerchantId,
      location_id: options?.locationId || null,
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

  if (createError || !createdItem) {
    console.error("Error creating menu item:", createError);
    return { error: createError?.message || "Failed to create item" };
  }

  // Step 2: Add the item to the category using direct insert/upsert
  const { data: assignmentData, error: assignmentError } = await supabase
    .from("category_items")
    .upsert(
      {
        category_id: categoryId,
        menu_item_id: createdItem.id,
        merchant_id: finalMerchantId,
        display_order: options?.displayOrder ?? 0,
        custom_price: options?.customPrice || null,
        is_featured: options?.isFeatured ?? false,
        is_available: true,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "category_id,menu_item_id",
      },
    )
    .select()
    .single();

  if (assignmentError) {
    // Item was created but assignment failed - log but don't fail completely
    console.error("Error assigning item to category:", assignmentError);
    return {
      data: createdItem,
      warning:
        "Item created but failed to assign to category: " +
        assignmentError.message,
    };
  }
  console.log("Item assigned to category:", assignmentData);

  // Fetch category name for user-friendly audit log
  const { data: category } = await supabase
    .from("categories")
    .select("name")
    .eq("id", categoryId)
    .single();

  const categoryName = category?.name || "Unknown Category";

  // Log Audit Event for created item with human-readable names
  const logResult = await LogAuditEvent({
    merchantId: finalMerchantId,
    action: `Created Item "${item.name}" in Category: ${categoryName}`,
    actionCategory: "menu",
    resourceType: "menu_item",
    resourceId: createdItem.id,
    resourceName: item.name,
    locationId: options?.locationId || undefined,
    changes: { after: item as Record<string, unknown> },
    metadata: {
      category_name: categoryName,
      location_id: options?.locationId,
    },
  });

  return { success: true, data: createdItem };
}

// ============================================================================
// LOCATION-BASED ORDERING (Per-Location Display Order Overrides)
// ============================================================================

/**
 * Update category display order for a specific location.
 * Uses location_menu_category_overrides table for location-specific ordering.
 * Falls back to global menu_categories ordering when locationId is null/'all'.
 */
export async function UpdateLocationMenuCategoriesOrder(
  locationId: string | null,
  menuId: string,
  categoryOrders: Array<{ categoryId: string; displayOrder: number }>,
) {
  if (!menuId || !categoryOrders || categoryOrders.length === 0) {
    return { error: "Menu ID and category orders are required" };
  }

  const supabase = createServerSupabaseClient();

  // If no location specified or 'all', update global menu_categories order
  if (!locationId || locationId === "all") {
    return UpdateMenuCategoriesOrder(menuId, categoryOrders);
  }

  // Update location-specific order using upsert
  const upserts = categoryOrders.map(({ categoryId, displayOrder }) => ({
    location_id: locationId,
    menu_id: menuId,
    category_id: categoryId,
    display_order: displayOrder,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("location_menu_category_overrides")
    .upsert(upserts, {
      onConflict: "location_id,menu_id,category_id",
    });

  if (error) {
    console.error("Error updating location category orders:", error);
    return { error: error.message };
  }

  // Fetch menu, location, and category names for human-readable logging
  const [menuResult, locationResult, categoriesResult] = await Promise.all([
    supabase
      .from("menus")
      .select("name, merchant_id")
      .eq("id", menuId)
      .single(),
    supabase.from("locations").select("name").eq("id", locationId).single(),
    supabase
      .from("categories")
      .select("name")
      .in(
        "id",
        categoryOrders.map((co) => co.categoryId),
      ),
  ]);

  if (menuResult.data && locationResult.data) {
    const categoryNames = categoriesResult.data?.map((c) => c.name) || [];
    await LogAuditEvent({
      merchantId: menuResult.data.merchant_id,
      action: `Updated Category Order (Location Override) in ${menuResult.data.name}`,
      actionCategory: "menu",
      resourceType: "menu",
      resourceId: menuId,
      resourceName: menuResult.data.name,
      locationId: locationId!,
      metadata: {
        count: categoryOrders.length,
        location_name: locationResult.data.name,
        category_names: categoryNames,
      },
    });
  }

  return { success: true };
}

/**
 * Update item display order within a category for a specific location.
 * Uses location_category_item_overrides table for location-specific ordering.
 * Falls back to global category_items ordering when locationId is null/'all'.
 */
export async function UpdateLocationCategoryItemsOrder(
  locationId: string | null,
  menuId: string | null,
  categoryId: string,
  itemOrders: Array<{ menuItemId: string; displayOrder: number }>,
) {
  if (!categoryId || !itemOrders || itemOrders.length === 0) {
    return { error: "Category ID and item orders are required" };
  }

  const supabase = createServerSupabaseClient();

  // If no location specified or 'all', update global category_items order
  if (!locationId || locationId === "all") {
    return UpdateCategoryItemsOrder(categoryId, itemOrders, locationId);
  }

  // Update location-specific order using upsert
  const upserts = itemOrders.map(({ menuItemId, displayOrder }) => ({
    location_id: locationId,
    category_id: categoryId,
    menu_item_id: menuItemId,
    display_order: displayOrder,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("location_category_item_overrides")
    .upsert(upserts, {
      onConflict: "location_id,category_id,menu_item_id",
    });

  if (error) {
    console.error("Error updating location item orders:", error);
    return { error: error.message };
  }

  // Fetch category, location, and item names for human-readable logging
  const [categoryResult, locationResult, itemsResult] = await Promise.all([
    supabase
      .from("categories")
      .select("name, merchant_id")
      .eq("id", categoryId)
      .single(),
    supabase.from("locations").select("name").eq("id", locationId).single(),
    supabase
      .from("menu_items")
      .select("name")
      .in(
        "id",
        itemOrders.map((io) => io.menuItemId),
      ),
  ]);

  if (categoryResult.data && locationResult.data) {
    const itemNames = itemsResult.data?.map((i) => i.name) || [];
    await LogAuditEvent({
      merchantId: categoryResult.data.merchant_id,
      action: `Updated Item Order (Location Override) in ${categoryResult.data.name}`,
      actionCategory: "menu",
      resourceType: "menu_category",
      resourceId: categoryId,
      resourceName: categoryResult.data.name,
      locationId: locationId!,
      metadata: {
        count: itemOrders.length,
        location_name: locationResult.data.name,
        item_names: itemNames,
      },
    });
  }

  return { success: true };
}

/**
 * Reset location-specific category order to use global defaults.
 * Removes all display_order overrides for categories in a menu at a location.
 */
export async function ResetLocationCategoryOrder(
  locationId: string,
  menuId: string,
) {
  if (!locationId || !menuId) {
    return { error: "Location ID and Menu ID are required" };
  }

  const supabase = createServerSupabaseClient();

  // Only delete the display_order, not the entire override
  // We'll update display_order to null to indicate "use global"
  const { error } = await supabase
    .from("location_menu_category_overrides")
    .update({ display_order: null, updated_at: new Date().toISOString() })
    .eq("location_id", locationId)
    .eq("menu_id", menuId);

  if (error) {
    console.error("Error resetting location category order:", error);
    return { error: error.message };
  }

  // Fetch menu and location names
  const [menuResult, locationResult] = await Promise.all([
    supabase
      .from("menus")
      .select("name, merchant_id")
      .eq("id", menuId)
      .single(),
    supabase.from("locations").select("name").eq("id", locationId).single(),
  ]);

  if (menuResult.data && locationResult.data) {
    await LogAuditEvent({
      merchantId: menuResult.data.merchant_id,
      action: `Reset Category Order (Location Override) for Menu: ${menuResult.data.name}`,
      actionCategory: "menu",
      resourceType: "menu",
      resourceId: menuId,
      resourceName: menuResult.data.name,
      locationId: locationId,
      metadata: { location_name: locationResult.data.name },
    });
  }

  return { success: true };
}

/**
 * Reset location-specific item order within a category to use global defaults.
 * Removes all display_order overrides for items in a category at a location.
 */
export async function ResetLocationItemOrder(
  locationId: string,
  categoryId: string,
) {
  if (!locationId || !categoryId) {
    return { error: "Location ID and Category ID are required" };
  }

  const supabase = createServerSupabaseClient();

  // Update display_order to null to indicate "use global"
  const { error } = await supabase
    .from("location_category_item_overrides")
    .update({ display_order: null, updated_at: new Date().toISOString() })
    .eq("location_id", locationId)
    .eq("category_id", categoryId);

  if (error) {
    console.error("Error resetting location item order:", error);
    return { error: error.message };
  }

  // Fetch category and location names
  const [categoryResult, locationResult] = await Promise.all([
    supabase
      .from("categories")
      .select("name, merchant_id")
      .eq("id", categoryId)
      .single(),
    supabase.from("locations").select("name").eq("id", locationId).single(),
  ]);

  if (categoryResult.data && locationResult.data) {
    await LogAuditEvent({
      merchantId: categoryResult.data.merchant_id,
      action: `Reset Item Order (Location Override) for Category: ${categoryResult.data.name}`,
      actionCategory: "menu",
      resourceType: "menu_category",
      resourceId: categoryId,
      resourceName: categoryResult.data.name,
      locationId: locationId,
      metadata: { location_name: locationResult.data.name },
    });
  }

  return { success: true };
}
