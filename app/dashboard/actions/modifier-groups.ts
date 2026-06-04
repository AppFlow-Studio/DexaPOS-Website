"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ModifierGroupsModel,
  ModifierGroupItemsModel,
} from "@/types/db-modles";
import { LogAuditEvent } from "./audit-logs";
import { getCurrentUserMerchantRole } from "./role-check";

function sortByDisplayOrder<T extends { display_order?: number | null; name?: string | null }>(
  items: T[],
) {
  return [...items].sort((a, b) => {
    const aOrder =
      typeof a.display_order === "number" ? a.display_order : Number.MAX_SAFE_INTEGER;
    const bOrder =
      typeof b.display_order === "number" ? b.display_order : Number.MAX_SAFE_INTEGER;

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return (a.name || "").localeCompare(b.name || "");
  });
}

function sortModifierItems(
  items: Array<
    ModifierGroupItemsModel & {
      location_override?: Array<{ display_order?: number | null }> | null;
    }
  >,
) {
  return [...items].sort((a, b) => {
    const aOverrideOrder = a.location_override?.[0]?.display_order;
    const bOverrideOrder = b.location_override?.[0]?.display_order;

    const aOrder =
      typeof aOverrideOrder === "number"
        ? aOverrideOrder
        : typeof a.display_order === "number"
          ? a.display_order
          : Number.MAX_SAFE_INTEGER;
    const bOrder =
      typeof bOverrideOrder === "number"
        ? bOverrideOrder
        : typeof b.display_order === "number"
          ? b.display_order
          : Number.MAX_SAFE_INTEGER;

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return (a.name || "").localeCompare(b.name || "");
  });
}

// ============================================================================
// GET OPERATIONS - MODIFIER GROUPS
// ============================================================================

export async function GetModifierGroups(
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

  // Build query with location filtering
  let query = supabase
    .from("modifier_groups")
    .select(
      `
            *,
            location_name:locations(name),
            modifier_group_items(
                *,
                location_override:location_modifier_item_overrides!left(
                    id,
                    display_order,
                    price_modifier,
                    is_active,
                    location_id,
                    stock_tracking_mode,
                    current_stock
                )
            ),
            menu_item_modifier_groups(
                id,
                menu_item:menu_items(id, name, price)
            ),
            location_item_modifier_groups(
                id,
                location_id,
                location:locations(id, name),
                menu_item:menu_items(id, name, price)
            ),
            category_modifier_groups(
                id,
                location_id,
                category:categories(id, name)
            ),
            location_override:location_modifier_group_overrides!left(
                id,
                is_active,
                location_id
            )
        `,
    )
    .eq("merchant_id", merchant.id);

  // Add location filtering if locationId provided
  if (locationId && locationId !== "all") {
    // Return: global groups (location_id IS NULL) + this location's specific groups
    query = query.or(`location_id.is.null,location_id.eq.${locationId}`);
    // Also filter location_override to current location
    query = query.eq(
      "location_modifier_group_overrides.location_id",
      locationId,
    );
    query = query.eq(
      "modifier_group_items.location_modifier_item_overrides.location_id",
      locationId,
    );
    // Filter location-scoped item assignments to this location only
    query = query.eq(
      "location_item_modifier_groups.location_id",
      locationId,
    );
    // Filter category-modifier assignments: global + this location
    query = query.or(
      `location_id.is.null,location_id.eq.${locationId}`,
      { referencedTable: "category_modifier_groups" },
    );
  }

  query = query
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error("Error getting modifier groups:", error);
    return [];
  }

  return (data || []).map((group: any) => ({
    ...group,
    modifier_group_items: sortModifierItems(group.modifier_group_items || []),
  })) as (ModifierGroupsModel & {
    modifier_group_items: ModifierGroupItemsModel[];
    location_name: {
      name: string;
    };
    menu_item_modifier_groups: Array<{
      id: string;
      menu_item: {
        id: string;
        name: string;
        price: number;
      };
    }>;
    location_override?: Array<{
      id: string;
      is_active: boolean;
      location_id: string;
    }>;
  })[];
}

export async function GetModifierGroup(modifierGroupId: string) {
  if (!modifierGroupId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("modifier_groups")
    .select(
      `
            *,
            modifier_group_items(*)
        `,
    )
    .eq("id", modifierGroupId)
    .single();

  if (error || !data) {
    console.error("Error getting modifier group:", error);
    return null;
  }

  return {
    ...data,
    modifier_group_items: sortByDisplayOrder(data.modifier_group_items || []),
  } as ModifierGroupsModel & {
    modifier_group_items: ModifierGroupItemsModel[];
  };
}

// ============================================================================
// CREATE OPERATIONS - MODIFIER GROUPS
// ============================================================================

export async function CreateModifierGroup(
  clerkOrgId: string,
  data: {
    name: string;
    description?: string;
    is_required?: boolean;
    min_selections?: number;
    max_selections?: number;
    display_order?: number;
    location_id?: string | null;
    options?: Array<{
      id?: string;
      name: string;
      description?: string;
      price_modifier: number;
      display_order?: number;
      is_default?: boolean;
      merchant_id: string;
    }>;
  },
) {
  if (!clerkOrgId) {
    return { error: "Organization ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Role check: managers can only create location-specific modifier groups for their assigned locations
  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to create modifier groups" };
  }
  if (roleInfo?.isManager) {
    if (!data.location_id) {
      return { error: "Managers cannot create global modifier groups" };
    }
    if (!roleInfo.assignedLocationIds.includes(data.location_id)) {
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

  // Create modifier group
  const { data: modifierGroup, error: groupError } = await supabase
    .from("modifier_groups")
    .insert({
      merchant_id: merchant.id,
      location_id: data.location_id || null,
      name: data.name,
      description: data.description || null,
      is_required: data.is_required ?? false,
      min_selections: data.min_selections ?? 0,
      max_selections: data.max_selections || null,
      display_order: data.display_order || null,
    })
    .select()
    .single();

  if (groupError || !modifierGroup) {
    console.error("Error creating modifier group:", groupError);
    return { error: groupError?.message || "Failed to create modifier group" };
  }

  // Create options if provided
  if (data.options && data.options.length > 0) {
    const normalizedOptions = data.options.map((opt: any, index: number) => ({
      modifier_group_id: modifierGroup.id,
      name: opt.name,
      description: opt.description || null,
      price_modifier: opt.price_modifier,
      display_order: opt.display_order ?? index,
      is_active: true,
      is_default: opt.is_default ?? false,
      merchant_id: opt.merchant_id,
    }));

    const { error: optionsError } = await supabase
      .from("modifier_group_items")
      .insert(normalizedOptions);

    if (optionsError) {
      console.error("Error creating modifier group options:", optionsError);
      return {
        error: "Modifier group created but failed to add options",
        data: modifierGroup,
      };
    }
  }

  // Log audit event
  const optionNames = data.options?.map((opt) => opt.name) || [];
  await LogAuditEvent({
    merchantId: merchant.id,
    action: `Created Modifier Group: ${data.name}${optionNames.length > 0 ? ` (with ${optionNames.length} option${optionNames.length > 1 ? "s" : ""}: ${optionNames.join(", ")})` : ""}`,
    actionCategory: "menu",
    resourceType: "modifier_group",
    resourceId: modifierGroup.id,
    resourceName: data.name,
    locationId: data.location_id || undefined,
    metadata: {
      is_required: data.is_required,
      options_count: optionNames.length,
      options: optionNames,
    },
  });

  return { data: modifierGroup as ModifierGroupsModel };
}

// ============================================================================
// UPDATE OPERATIONS - MODIFIER GROUPS
// ============================================================================

export async function UpdateModifierGroup(
  modifierGroupId: string,
  data: {
    name?: string;
    description?: string;
    is_required?: boolean;
    min_selections?: number;
    max_selections?: number | null;
    display_order?: number;
    location_id?: string | null;
  },
  locationId?: string | null,
) {
  if (!modifierGroupId) {
    return { error: "Modifier Group ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Fetch existing modifier group BEFORE updating (for audit log)
  const { data: existingGroup } = await supabase
    .from("modifier_groups")
    .select("*")
    .eq("id", modifierGroupId)
    .single();

  // Role check: managers cannot edit global modifier groups
  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to update modifier groups" };
  }
  if (roleInfo?.isManager) {
    if (!existingGroup?.location_id) {
      return { error: "Managers cannot edit global modifier groups" };
    }
    if (!roleInfo.assignedLocationIds.includes(existingGroup.location_id)) {
      return { error: "You do not have access to this modifier group" };
    }
  }

  const updateData: any = {};
  const beforeLog: Record<string, unknown> = {};
  const afterLog: Record<string, unknown> = {};

  if (data.name !== undefined) {
    updateData.name = data.name;
    if (existingGroup) beforeLog.name = existingGroup.name;
    afterLog.name = data.name;
  }
  if (data.description !== undefined) {
    updateData.description = data.description;
    if (existingGroup) beforeLog.description = existingGroup.description;
    afterLog.description = data.description;
  }
  if (data.is_required !== undefined) {
    updateData.is_required = data.is_required;
    if (existingGroup) beforeLog.is_required = existingGroup.is_required;
    afterLog.is_required = data.is_required;
  }
  if (data.min_selections !== undefined) {
    updateData.min_selections = data.min_selections;
    if (existingGroup) beforeLog.min_selections = existingGroup.min_selections;
    afterLog.min_selections = data.min_selections;
  }
  if (data.max_selections !== undefined) {
    updateData.max_selections = data.max_selections;
    if (existingGroup) beforeLog.max_selections = existingGroup.max_selections;
    afterLog.max_selections = data.max_selections;
  }
  if (data.display_order !== undefined) {
    updateData.display_order = data.display_order;
    if (existingGroup) beforeLog.display_order = existingGroup.display_order;
    afterLog.display_order = data.display_order;
  }
  if (data.location_id !== undefined) {
    updateData.location_id = data.location_id;
    if (existingGroup) beforeLog.location_id = existingGroup.location_id;
    afterLog.location_id = data.location_id;
  }

  const { data: modifierGroup, error } = await supabase
    .from("modifier_groups")
    .update(updateData)
    .eq("id", modifierGroupId)
    .select()
    .single();

  if (error) {
    console.error("Error updating modifier group:", error);
    return { error: error.message };
  }

  // Check if any values actually changed before logging
  let hasRealChanges = false;
  for (const key of Object.keys(afterLog)) {
    if (JSON.stringify(beforeLog[key]) !== JSON.stringify(afterLog[key])) {
      hasRealChanges = true;
      break;
    }
  }

  if (hasRealChanges) {
    await LogAuditEvent({
      merchantId: modifierGroup.merchant_id,
      action: `Updated Modifier Group: ${modifierGroup.name}`,
      actionCategory: "menu",
      resourceType: "modifier_group",
      resourceId: modifierGroupId,
      resourceName: modifierGroup.name,
      locationId: locationId || modifierGroup.location_id,
      changes: { before: beforeLog, after: afterLog },
    });
  }

  return { data: modifierGroup as ModifierGroupsModel };
}

// ============================================================================
// DELETE OPERATIONS - MODIFIER GROUPS
// ============================================================================

export async function DeleteModifierGroup(
  modifierGroupId: string,
  locationId?: string | null,
) {
  if (!modifierGroupId) {
    return { error: "Modifier Group ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Check if this is a location-specific group and if it's in use
  const { data: group } = await supabase
    .from("modifier_groups")
    .select("location_id, name, merchant_id")
    .eq("id", modifierGroupId)
    .single();

  // Role check: managers can only delete location-specific modifier groups for their assigned locations
  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to delete modifier groups" };
  }
  if (roleInfo?.isManager) {
    if (!group?.location_id) {
      return { error: "Managers cannot delete global modifier groups" };
    }
    if (!roleInfo.assignedLocationIds.includes(group.location_id)) {
      return { error: "You do not have access to this modifier group" };
    }
  }

  // Clean up references before deleting the group
  // Remove menu item assignments
  await supabase
    .from("menu_item_modifier_groups")
    .delete()
    .eq("modifier_group_id", modifierGroupId);

  // Remove category assignments
  await supabase
    .from("category_modifier_groups")
    .delete()
    .eq("modifier_group_id", modifierGroupId);

  // Remove references in order_item_modifiers
  await supabase
    .from("order_item_modifiers")
    .delete()
    .eq("modifier_group_id", modifierGroupId);

  // Delete the group (global groups can always be deleted, cascade to overrides)
  const { error } = await supabase
    .from("modifier_groups")
    .delete()
    .eq("id", modifierGroupId);

  if (error) {
    console.error("Error deleting modifier group:", error);
    return { error: error.message };
  }

  // Fetch details for audit log before deletion (group is already fetched above but let's be safe if logic changes)
  // We used 'group' variable earlier for check.
  if (group) {
    await LogAuditEvent({
      merchantId: group.merchant_id,
      action: `Deleted Modifier Group: ${group.name}`,
      actionCategory: "menu",
      resourceType: "modifier_group",
      resourceId: modifierGroupId,
      resourceName: group.name,
      locationId: locationId || group.location_id,
    });
  }

  return { success: true };
}

// ============================================================================
// MODIFIER GROUP ITEMS - CREATE
// ============================================================================

export async function CreateModifierGroupItem(
  modifierGroupId: string,
  data: {
    name: string;
    description?: string;
    price_modifier: number;
    display_order?: number;
    is_active?: boolean;
    is_default?: boolean;
    merchant_id: string;
  },
  locationId?: string | null,
) {
  if (!modifierGroupId) {
    return { error: "Modifier Group ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Role check: managers cannot add options to global modifier groups
  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to create modifier options" };
  }
  if (roleInfo?.isManager) {
    const { data: parentGroup } = await supabase
      .from("modifier_groups")
      .select("location_id")
      .eq("id", modifierGroupId)
      .single();

    if (!parentGroup?.location_id) {
      return {
        error: "Managers cannot add options to global modifier groups",
      };
    }
    if (!roleInfo.assignedLocationIds.includes(parentGroup.location_id)) {
      return { error: "You do not have access to this modifier group" };
    }
  }

  const { data: item, error } = await supabase
    .from("modifier_group_items")
    .insert({
      modifier_group_id: modifierGroupId,
      name: data.name,
      description: data.description || null,
      price_modifier: data.price_modifier,
      display_order: data.display_order || null,
      is_active: data.is_active ?? true,
      is_default: data.is_default ?? false,
      merchant_id: data.merchant_id,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating modifier group item:", error);
    return { error: error.message };
  }

  // Fetch modifier group name for context
  const { data: modifierGroup } = await supabase
    .from("modifier_groups")
    .select("name")
    .eq("id", modifierGroupId)
    .single();

  // Log audit event
  await LogAuditEvent({
    merchantId: data.merchant_id,
    action: `Created Modifier Option: ${data.name} (in ${modifierGroup?.name || "Unknown Group"})`,
    actionCategory: "menu",
    resourceType: "modifier_group",
    resourceId: modifierGroupId,
    resourceName: data.name,
    locationId: locationId,
    metadata: {
      option_id: item.id,
      modifier_group_name: modifierGroup?.name,
      price_modifier: data.price_modifier,
    },
  });

  return { data: item as ModifierGroupItemsModel };
}

// ============================================================================
// MODIFIER GROUP ITEMS - UPDATE
// ============================================================================

export async function UpdateModifierGroupItem(
  itemId: string,
  data: {
    name?: string;
    description?: string;
    price_modifier?: number;
    display_order?: number;
    is_active?: boolean;
    is_default?: boolean;
  },
  locationId?: string | null,
) {
  if (!itemId) {
    return { error: "Item ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Fetch existing item BEFORE updating (for audit log and default handling)
  const { data: existingItem } = await supabase
    .from("modifier_group_items")
    .select("*")
    .eq("id", itemId)
    .single();

  // Role check: managers cannot edit options of global modifier groups
  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to update modifier options" };
  }
  if (roleInfo?.isManager && existingItem?.modifier_group_id) {
    const { data: parentGroup } = await supabase
      .from("modifier_groups")
      .select("location_id")
      .eq("id", existingItem.modifier_group_id)
      .single();

    if (!parentGroup?.location_id) {
      return {
        error: "Managers cannot edit options of global modifier groups",
      };
    }
    if (!roleInfo.assignedLocationIds.includes(parentGroup.location_id)) {
      return { error: "You do not have access to this modifier group" };
    }
  }

  const updateData: any = {};
  const beforeLog: Record<string, unknown> = {};
  const afterLog: Record<string, unknown> = {};

  if (data.name !== undefined) {
    updateData.name = data.name;
    if (existingItem) beforeLog.name = existingItem.name;
    afterLog.name = data.name;
  }
  if (data.description !== undefined) {
    updateData.description = data.description;
    if (existingItem) beforeLog.description = existingItem.description;
    afterLog.description = data.description;
  }
  if (data.price_modifier !== undefined) {
    updateData.price_modifier = data.price_modifier;
    if (existingItem) beforeLog.price_modifier = existingItem.price_modifier;
    afterLog.price_modifier = data.price_modifier;
  }
  if (data.display_order !== undefined) {
    updateData.display_order = data.display_order;
    if (existingItem) beforeLog.display_order = existingItem.display_order;
    afterLog.display_order = data.display_order;
  }
  if (data.is_active !== undefined) {
    updateData.is_active = data.is_active;
    if (existingItem) beforeLog.is_active = existingItem.is_active;
    afterLog.is_active = data.is_active;
  }
  if (data.is_default !== undefined) {
    updateData.is_default = data.is_default;
    if (existingItem) beforeLog.is_default = existingItem.is_default;
    afterLog.is_default = data.is_default;
  }

  const { data: item, error } = await supabase
    .from("modifier_group_items")
    .update(updateData)
    .eq("id", itemId)
    .select()
    .single();

  if (error) {
    console.error("Error updating modifier group item:", error);
    return { error: error.message };
  }

  // Check if any values actually changed before logging
  let hasRealChanges = false;
  for (const key of Object.keys(afterLog)) {
    if (JSON.stringify(beforeLog[key]) !== JSON.stringify(afterLog[key])) {
      hasRealChanges = true;
      break;
    }
  }

  if (hasRealChanges) {
    // Fetch modifier group name for better context
    const { data: modifierGroup } = await supabase
      .from("modifier_groups")
      .select("name")
      .eq("id", item.modifier_group_id)
      .single();

    await LogAuditEvent({
      merchantId: item.merchant_id,
      action: `Updated Modifier Option: ${item.name} (in ${modifierGroup?.name || "Unknown Group"})`,
      actionCategory: "menu",
      resourceType: "modifier_group",
      resourceId: item.modifier_group_id,
      resourceName: item.name,
      locationId: locationId,
      metadata: {
        option_id: itemId,
        modifier_group_name: modifierGroup?.name,
      },
      changes: { before: beforeLog, after: afterLog },
    });
  }

  return { data: item as ModifierGroupItemsModel };
}

// ============================================================================
// MODIFIER GROUP ITEMS - DELETE (Soft Delete)
// ============================================================================

/**
 * Soft delete a modifier group item by setting is_active to false.
 * We use soft delete because modifier items may be referenced by historical orders
 * in the order_item_modifiers table, and hard deleting would violate foreign key constraints.
 */
export async function DeleteModifierGroupItem(
  itemId: string,
  locationId?: string | null,
) {
  if (!itemId) {
    return { error: "Item ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // First, check if this is referenced in any orders
  const { data: refs } = await supabase
    .from("order_item_modifiers")
    .select("id")
    .eq("modifier_item_id", itemId);

  const orderReferenceCount = refs?.length || 0;

  // If referenced in orders, we MUST soft delete
  if (orderReferenceCount && orderReferenceCount > 0) {
    // Soft delete - set is_active to false
    const { data: item, error } = await supabase
      .from("modifier_group_items")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .select()
      .single();

    if (error) {
      console.error("Error soft-deleting modifier group item:", error);
      return { error: error.message };
    }

    // Log audit event (Soft Delete)
    if (item) {
      // Fetch modifier group name for context
      const { data: modifierGroup } = await supabase
        .from("modifier_groups")
        .select("name")
        .eq("id", item.modifier_group_id)
        .single();

      await LogAuditEvent({
        merchantId: item.merchant_id,
        action: `Deactivated Modifier Option: ${item.name} (from ${modifierGroup?.name || "Unknown Group"})`,
        actionCategory: "menu",
        resourceType: "modifier_group",
        resourceId: item.modifier_group_id,
        resourceName: item.name,
        locationId: locationId,
        metadata: {
          option_id: itemId,
          modifier_group_name: modifierGroup?.name,
          soft_deleted: true,
          order_reference_count: orderReferenceCount,
        },
      });
    }

    return {
      success: true,
      softDeleted: true,
      message: `Item deactivated (used in ${orderReferenceCount} order(s))`,
      data: item,
    };
  }

  // Fetch item details before hard delete for context
  const { data: itemToDelete } = await supabase
    .from("modifier_group_items")
    .select("name, merchant_id, modifier_group_id")
    .eq("id", itemId)
    .single();

  // Role check: managers cannot delete options of global modifier groups
  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to delete modifier options" };
  }
  if (roleInfo?.isManager && itemToDelete?.modifier_group_id) {
    const { data: parentGroup } = await supabase
      .from("modifier_groups")
      .select("location_id")
      .eq("id", itemToDelete.modifier_group_id)
      .single();

    if (!parentGroup?.location_id) {
      return {
        error: "Managers cannot delete options of global modifier groups",
      };
    }
    if (!roleInfo.assignedLocationIds.includes(parentGroup.location_id)) {
      return { error: "You do not have access to this modifier group" };
    }
  }

  // Fetch modifier group name for context (before we lose the reference)
  let modifierGroupName: string | null = null;
  if (itemToDelete?.modifier_group_id) {
    const { data: modifierGroup } = await supabase
      .from("modifier_groups")
      .select("name")
      .eq("id", itemToDelete.modifier_group_id)
      .single();
    modifierGroupName = modifierGroup?.name || null;
  }

  // No order references - safe to hard delete
  const { error } = await supabase
    .from("modifier_group_items")
    .delete()
    .eq("id", itemId);

  if (error) {
    console.error("Error deleting modifier group item:", error);
    // If still fails (e.g., other references), fall back to soft delete
    if (error.code === "23503") {
      const { data: item, error: softError } = await supabase
        .from("modifier_group_items")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId)
        .select()
        .single();

      if (softError) {
        return { error: softError.message };
      }

      // Log audit event (Fallback Soft Delete)
      if (item) {
        await LogAuditEvent({
          merchantId: item.merchant_id,
          action: `Deactivated Modifier Option: ${item.name} (from ${modifierGroupName || "Unknown Group"})`,
          actionCategory: "menu",
          resourceType: "modifier_group",
          resourceId: item.modifier_group_id,
          resourceName: item.name,
          locationId: locationId,
          metadata: {
            option_id: itemId,
            modifier_group_name: modifierGroupName,
            soft_deleted: true,
            reason: "foreign_key_violation",
          },
        });
      }

      return {
        success: true,
        softDeleted: true,
        message: "Item deactivated (has references)",
        data: item,
      };
    }
    return { error: error.message };
  }

  // Log audit event (Hard Delete)
  if (itemToDelete) {
    await LogAuditEvent({
      merchantId: itemToDelete.merchant_id,
      action: `Deleted Modifier Option: ${itemToDelete.name} (from ${modifierGroupName || "Unknown Group"})`,
      actionCategory: "menu",
      resourceType: "modifier_group",
      resourceId: itemToDelete.modifier_group_id,
      resourceName: itemToDelete.name,
      locationId: locationId,
      metadata: {
        option_id: itemId,
        modifier_group_name: modifierGroupName,
      },
    });
  }

  return { success: true, softDeleted: false };
}

// ============================================================================
// REORDER OPERATIONS
// ============================================================================

export async function ReorderModifierGroups(
  clerkOrgId: string,
  groupOrders: Array<{ modifierGroupId: string; displayOrder: number }>,
) {
  if (!clerkOrgId) {
    return { error: "Organization ID is required" };
  }

  const supabase = createServerSupabaseClient();
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    return { error: "Merchant not found" };
  }

  const { data, error } = await supabase.rpc("reorder_modifier_groups", {
    p_merchant_id: merchant.id,
    p_group_orders: groupOrders.map(({ modifierGroupId, displayOrder }) => ({
      modifier_group_id: modifierGroupId,
      display_order: displayOrder,
    })),
  });

  if (error) {
    console.error("Error reordering modifier groups:", error);
    return { error: error.message };
  }

  return { success: true, data };
}

export async function ReorderModifierGroupItems(
  modifierGroupId: string,
  itemOrders: Array<{ modifierGroupItemId: string; displayOrder: number }>,
  locationId?: string | null,
) {
  if (!modifierGroupId) {
    return { error: "Modifier Group ID is required" };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("reorder_modifier_group_items", {
    p_location_id: locationId && locationId !== "all" ? locationId : null,
    p_modifier_group_id: modifierGroupId,
    p_item_orders: itemOrders.map(({ modifierGroupItemId, displayOrder }) => ({
      modifier_group_item_id: modifierGroupItemId,
      display_order: displayOrder,
    })),
  });

  if (error) {
    console.error("Error reordering modifier group items:", error);
    return { error: error.message };
  }

  return { success: true, data };
}
