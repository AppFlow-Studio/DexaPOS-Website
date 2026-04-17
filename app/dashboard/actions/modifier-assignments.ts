"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";

// ============================================================================
// MODIFIER GROUP → ITEM ASSIGNMENTS (Bulk)
// ============================================================================

/**
 * Bulk assign a modifier group to multiple menu items.
 * Uses batch upsert — existing assignments are silently skipped.
 */
export async function AssignModifierToItems(
  modifierGroupId: string,
  menuItemIds: string[],
  merchantId: string,
  locationId?: string | null,
) {
  if (!modifierGroupId || !menuItemIds.length || !merchantId) {
    return { error: "Modifier Group ID, item IDs, and Merchant ID are required" };
  }

  const supabase = createServerSupabaseClient();

  // Get count of existing assignments to calculate skip count
  const { data: existing } = await supabase
    .from("menu_item_modifier_groups")
    .select("menu_item_id")
    .eq("modifier_group_id", modifierGroupId)
    .in("menu_item_id", menuItemIds);

  const existingSet = new Set(existing?.map((e) => e.menu_item_id) || []);
  const newItemIds = menuItemIds.filter((id) => !existingSet.has(id));

  if (newItemIds.length > 0) {
    const rows = newItemIds.map((menuItemId) => ({
      menu_item_id: menuItemId,
      modifier_group_id: modifierGroupId,
      merchant_id: merchantId,
    }));

    const { error } = await supabase
      .from("menu_item_modifier_groups")
      .upsert(rows, { onConflict: "menu_item_id,modifier_group_id" });

    if (error) {
      console.error("Error assigning modifier to items:", error);
      return { error: error.message };
    }
  }

  const assignedCount = newItemIds.length;
  const skippedCount = existingSet.size;

  // Fetch names for audit log
  const [modifierResult, itemsResult] = await Promise.all([
    supabase
      .from("modifier_groups")
      .select("name")
      .eq("id", modifierGroupId)
      .single(),
    supabase
      .from("menu_items")
      .select("name")
      .in("id", menuItemIds),
  ]);

  const modifierGroupName = modifierResult.data?.name || "Unknown Modifier Group";
  const itemNames = itemsResult.data?.map((i) => i.name) || [];

  await LogAuditEvent({
    merchantId,
    action: `Assigned Modifier Group "${modifierGroupName}" to ${assignedCount} item(s)${skippedCount > 0 ? ` (${skippedCount} already assigned)` : ""}`,
    actionCategory: "menu",
    resourceType: "modifier_group",
    resourceId: modifierGroupId,
    resourceName: modifierGroupName,
    locationId: locationId || undefined,
    metadata: {
      item_names: itemNames,
      assigned_count: assignedCount,
      skipped_count: skippedCount,
    },
  });

  return { success: true, assignedCount, skippedCount };
}

// ============================================================================
// MODIFIER GROUP → CATEGORY ASSIGNMENTS
// ============================================================================

/**
 * Assign a modifier group to a category.
 * 1. Creates category_modifier_groups record
 * 2. Propagates to all items currently in the category
 */
export async function AssignModifierToCategory(
  modifierGroupId: string,
  categoryId: string,
  merchantId: string,
  locationId?: string | null,
) {
  if (!modifierGroupId || !categoryId || !merchantId) {
    return { error: "Modifier Group ID, Category ID, and Merchant ID are required" };
  }

  const supabase = createServerSupabaseClient();

  // 1. Upsert into category_modifier_groups
  const { error: categoryError } = await supabase
    .from("category_modifier_groups")
    .upsert(
      {
        category_id: categoryId,
        modifier_group_id: modifierGroupId,
        merchant_id: merchantId,
      },
      { onConflict: "category_id,modifier_group_id" },
    );

  if (categoryError) {
    console.error("Error assigning modifier to category:", categoryError);
    return { error: categoryError.message };
  }

  // 2. Get all items in this category
  const { data: categoryItems } = await supabase
    .from("category_items")
    .select("menu_item_id")
    .eq("category_id", categoryId);

  let itemsAffected = 0;

  if (categoryItems?.length) {
    const menuItemIds = categoryItems.map((ci) => ci.menu_item_id);

    // Batch upsert — duplicates silently skipped
    const rows = menuItemIds.map((menuItemId) => ({
      menu_item_id: menuItemId,
      modifier_group_id: modifierGroupId,
      merchant_id: merchantId,
    }));

    const { error: itemError } = await supabase
      .from("menu_item_modifier_groups")
      .upsert(rows, { onConflict: "menu_item_id,modifier_group_id" });

    if (itemError) {
      console.error("Error propagating modifier to items:", itemError);
      // Category assignment succeeded but propagation failed — partial success
      return {
        success: true,
        categoryAssigned: true,
        itemsAffected: 0,
        warning: "Category assigned but failed to propagate to items: " + itemError.message,
      };
    }

    itemsAffected = menuItemIds.length;
  }

  // Fetch names for audit log
  const [modifierResult, categoryResult] = await Promise.all([
    supabase
      .from("modifier_groups")
      .select("name")
      .eq("id", modifierGroupId)
      .single(),
    supabase
      .from("categories")
      .select("name")
      .eq("id", categoryId)
      .single(),
  ]);

  const modifierGroupName = modifierResult.data?.name || "Unknown Modifier Group";
  const categoryName = categoryResult.data?.name || "Unknown Category";

  await LogAuditEvent({
    merchantId,
    action: `Assigned Modifier Group "${modifierGroupName}" to Category "${categoryName}" (propagated to ${itemsAffected} item(s))`,
    actionCategory: "menu",
    resourceType: "category_modifier_group",
    resourceId: categoryId,
    resourceName: categoryName,
    locationId: locationId || undefined,
    metadata: {
      modifier_group_name: modifierGroupName,
      items_affected: itemsAffected,
    },
  });

  return { success: true, categoryAssigned: true, itemsAffected };
}

/**
 * Remove a modifier group from a category.
 * 1. Deletes category_modifier_groups record
 * 2. Removes modifier from items in this category
 *    (protects items also covered by other categories with the same modifier)
 */
export async function RemoveModifierFromCategory(
  modifierGroupId: string,
  categoryId: string,
  locationId?: string | null,
) {
  if (!modifierGroupId || !categoryId) {
    return { error: "Modifier Group ID and Category ID are required" };
  }

  const supabase = createServerSupabaseClient();

  // Fetch names before deletion for audit logging
  const [modifierResult, categoryResult] = await Promise.all([
    supabase
      .from("modifier_groups")
      .select("name, merchant_id")
      .eq("id", modifierGroupId)
      .single(),
    supabase
      .from("categories")
      .select("name")
      .eq("id", categoryId)
      .single(),
  ]);

  const modifierGroupName = modifierResult.data?.name || "Unknown Modifier Group";
  const categoryName = categoryResult.data?.name || "Unknown Category";
  const merchantId = modifierResult.data?.merchant_id;

  // 1. Delete the category_modifier_groups record
  const { error: deleteError } = await supabase
    .from("category_modifier_groups")
    .delete()
    .eq("category_id", categoryId)
    .eq("modifier_group_id", modifierGroupId);

  if (deleteError) {
    console.error("Error removing modifier from category:", deleteError);
    return { error: deleteError.message };
  }

  // 2. Get all items in this category
  const { data: categoryItems } = await supabase
    .from("category_items")
    .select("menu_item_id")
    .eq("category_id", categoryId);

  let itemsRemoved = 0;

  if (categoryItems?.length) {
    const itemIdsInCategory = categoryItems.map((ci) => ci.menu_item_id);

    // 3. Multi-category overlap protection:
    // Find all OTHER categories that still have this modifier group
    const { data: otherCategoryAssignments } = await supabase
      .from("category_modifier_groups")
      .select("category_id")
      .eq("modifier_group_id", modifierGroupId)
      .neq("category_id", categoryId);

    let protectedItemIds: Set<string> = new Set();

    if (otherCategoryAssignments?.length) {
      const otherCategoryIds = otherCategoryAssignments.map((a) => a.category_id);

      // Get items in those other categories (these should keep the modifier)
      const { data: protectedItems } = await supabase
        .from("category_items")
        .select("menu_item_id")
        .in("category_id", otherCategoryIds);

      protectedItemIds = new Set(protectedItems?.map((p) => p.menu_item_id) || []);
    }

    // 4. Items to remove = items in THIS category MINUS protected items
    const itemsToRemove = itemIdsInCategory.filter((id) => !protectedItemIds.has(id));

    if (itemsToRemove.length > 0) {
      const { error: removeError } = await supabase
        .from("menu_item_modifier_groups")
        .delete()
        .eq("modifier_group_id", modifierGroupId)
        .in("menu_item_id", itemsToRemove);

      if (removeError) {
        console.error("Error removing modifier from items:", removeError);
        return {
          success: true,
          warning: "Category unlinked but failed to remove from some items: " + removeError.message,
        };
      }

      itemsRemoved = itemsToRemove.length;
    }
  }

  if (merchantId) {
    await LogAuditEvent({
      merchantId,
      action: `Removed Modifier Group "${modifierGroupName}" from Category "${categoryName}" (removed from ${itemsRemoved} item(s))`,
      actionCategory: "menu",
      severity: "warning",
      resourceType: "category_modifier_group",
      resourceId: categoryId,
      resourceName: categoryName,
      locationId: locationId || undefined,
      metadata: {
        modifier_group_name: modifierGroupName,
        items_removed: itemsRemoved,
      },
    });
  }

  return { success: true, itemsRemoved };
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

/**
 * Get all categories that have a specific modifier group assigned.
 * Used by the category picker dialog to show already-assigned state.
 */
export async function GetModifierGroupCategories(modifierGroupId: string) {
  if (!modifierGroupId) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("category_modifier_groups")
    .select(
      `
      id,
      category_id,
      category:categories(id, name)
    `,
    )
    .eq("modifier_group_id", modifierGroupId);

  if (error) {
    console.error("Error getting modifier group categories:", error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    category_id: row.category_id,
    category_name: row.category?.name || "Unknown Category",
  }));
}
