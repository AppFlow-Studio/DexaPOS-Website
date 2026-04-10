"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { LogAuditEvent } from "./audit-logs";
import { getCurrentUserMerchantRole } from "./role-check";

// ============================================================================
// TYPES
// ============================================================================

export interface ItemSizeInput {
  name: string;
  price_modifier: number;
  display_order?: number;
}

export interface ItemAddonInput {
  name: string;
  description?: string;
  price: number;
  display_order?: number;
}

// ============================================================================
// ITEM SIZES
// ============================================================================

/**
 * Get all sizes for a menu item
 */
export async function GetItemSizes(menuItemId: string) {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("item_sizes")
    .select("*")
    .eq("menu_item_id", menuItemId)
    .order("display_order", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("Error fetching item sizes:", error);
    return { error: error.message };
  }

  return { data: data || [] };
}

/**
 * Create a new size for a menu item
 */
export async function CreateItemSize(
  clerkOrgId: string,
  menuItemId: string,
  input: ItemSizeInput,
) {
  if (!clerkOrgId || !menuItemId) {
    return { error: "Organization ID and Item ID are required" };
  }

  const supabase = createServiceRoleClient();

  // Role check
  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to manage item sizes" };
  }

  // Get merchant ID
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    return { error: "Merchant not found" };
  }

  // Get next display_order if not provided
  let displayOrder = input.display_order;
  if (displayOrder === undefined) {
    const { data: existing } = await supabase
      .from("item_sizes")
      .select("display_order")
      .eq("menu_item_id", menuItemId)
      .order("display_order", { ascending: false, nullsFirst: false })
      .limit(1);

    displayOrder = (existing?.[0]?.display_order ?? -1) + 1;
  }

  const { data: size, error } = await supabase
    .from("item_sizes")
    .insert({
      menu_item_id: menuItemId,
      name: input.name,
      price_modifier: input.price_modifier,
      display_order: displayOrder,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating item size:", error);
    return { error: error.message };
  }

  // Get item name for audit
  const { data: item } = await supabase
    .from("menu_items")
    .select("name")
    .eq("id", menuItemId)
    .single();

  await LogAuditEvent({
    merchantId: merchant.id,
    action: `Added size "${input.name}" to item "${item?.name || menuItemId}"`,
    actionCategory: "menu",
    resourceType: "item_size",
    resourceId: size.id,
    resourceName: input.name,
    changes: { after: input as any },
  });

  return { data: size };
}

/**
 * Update an existing item size
 */
export async function UpdateItemSize(
  sizeId: string,
  input: Partial<ItemSizeInput>,
) {
  if (!sizeId) {
    return { error: "Size ID is required" };
  }

  const supabase = createServiceRoleClient();

  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to manage item sizes" };
  }

  // Get existing size for audit
  const { data: existing } = await supabase
    .from("item_sizes")
    .select("*, menu_items(name, merchant_id)")
    .eq("id", sizeId)
    .single();

  if (!existing) {
    return { error: "Size not found" };
  }

  const updateData: Record<string, any> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.price_modifier !== undefined) updateData.price_modifier = input.price_modifier;
  if (input.display_order !== undefined) updateData.display_order = input.display_order;

  const { data: size, error } = await supabase
    .from("item_sizes")
    .update(updateData)
    .eq("id", sizeId)
    .select()
    .single();

  if (error) {
    console.error("Error updating item size:", error);
    return { error: error.message };
  }

  await LogAuditEvent({
    merchantId: (existing as any).menu_items?.merchant_id || existing.merchant_id,
    action: `Updated size "${size.name}" on item "${(existing as any).menu_items?.name || "unknown"}"`,
    actionCategory: "menu",
    resourceType: "item_size",
    resourceId: sizeId,
    resourceName: size.name,
    changes: { before: existing as any, after: input as any },
  });

  return { data: size };
}

/**
 * Delete an item size
 */
export async function DeleteItemSize(sizeId: string) {
  if (!sizeId) {
    return { error: "Size ID is required" };
  }

  const supabase = createServiceRoleClient();

  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to manage item sizes" };
  }

  // Get existing for audit
  const { data: existing } = await supabase
    .from("item_sizes")
    .select("*, menu_items(name, merchant_id)")
    .eq("id", sizeId)
    .single();

  if (!existing) {
    return { error: "Size not found" };
  }

  const { error } = await supabase
    .from("item_sizes")
    .delete()
    .eq("id", sizeId);

  if (error) {
    console.error("Error deleting item size:", error);
    return { error: error.message };
  }

  await LogAuditEvent({
    merchantId: (existing as any).menu_items?.merchant_id || existing.merchant_id,
    action: `Deleted size "${existing.name}" from item "${(existing as any).menu_items?.name || "unknown"}"`,
    actionCategory: "menu",
    resourceType: "item_size",
    resourceId: sizeId,
    resourceName: existing.name,
    severity: "warning",
  });

  return { success: true };
}

/**
 * Reorder item sizes
 */
export async function ReorderItemSizes(
  menuItemId: string,
  sizeIds: string[],
) {
  if (!menuItemId || !sizeIds.length) {
    return { error: "Item ID and size IDs are required" };
  }

  const supabase = createServiceRoleClient();

  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to manage item sizes" };
  }

  // Batch update display_order
  const updates = sizeIds.map((id, index) =>
    supabase
      .from("item_sizes")
      .update({ display_order: index })
      .eq("id", id)
      .eq("menu_item_id", menuItemId)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("Error reordering item sizes:", failed.error);
    return { error: failed.error.message };
  }

  return { success: true };
}

// ============================================================================
// ITEM ADDONS
// ============================================================================

/**
 * Get all addons for a menu item
 */
export async function GetItemAddons(menuItemId: string) {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("item_addons")
    .select("*")
    .eq("menu_item_id", menuItemId)
    .order("display_order", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("Error fetching item addons:", error);
    return { error: error.message };
  }

  return { data: data || [] };
}

/**
 * Create a new addon for a menu item
 */
export async function CreateItemAddon(
  clerkOrgId: string,
  menuItemId: string,
  input: ItemAddonInput,
) {
  if (!clerkOrgId || !menuItemId) {
    return { error: "Organization ID and Item ID are required" };
  }

  const supabase = createServiceRoleClient();

  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to manage item addons" };
  }

  // Get merchant ID
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    return { error: "Merchant not found" };
  }

  // Get next display_order if not provided
  let displayOrder = input.display_order;
  if (displayOrder === undefined) {
    const { data: existing } = await supabase
      .from("item_addons")
      .select("display_order")
      .eq("menu_item_id", menuItemId)
      .order("display_order", { ascending: false, nullsFirst: false })
      .limit(1);

    displayOrder = (existing?.[0]?.display_order ?? -1) + 1;
  }

  const { data: addon, error } = await supabase
    .from("item_addons")
    .insert({
      menu_item_id: menuItemId,
      name: input.name,
      description: input.description || null,
      price: input.price,
      display_order: displayOrder,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating item addon:", error);
    return { error: error.message };
  }

  // Get item name for audit
  const { data: item } = await supabase
    .from("menu_items")
    .select("name")
    .eq("id", menuItemId)
    .single();

  await LogAuditEvent({
    merchantId: merchant.id,
    action: `Added addon "${input.name}" to item "${item?.name || menuItemId}"`,
    actionCategory: "menu",
    resourceType: "item_addon",
    resourceId: addon.id,
    resourceName: input.name,
    changes: { after: input as any },
  });

  return { data: addon };
}

/**
 * Update an existing item addon
 */
export async function UpdateItemAddon(
  addonId: string,
  input: Partial<ItemAddonInput>,
) {
  if (!addonId) {
    return { error: "Addon ID is required" };
  }

  const supabase = createServiceRoleClient();

  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to manage item addons" };
  }

  // Get existing addon for audit
  const { data: existing } = await supabase
    .from("item_addons")
    .select("*, menu_items(name, merchant_id)")
    .eq("id", addonId)
    .single();

  if (!existing) {
    return { error: "Addon not found" };
  }

  const updateData: Record<string, any> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description || null;
  if (input.price !== undefined) updateData.price = input.price;
  if (input.display_order !== undefined) updateData.display_order = input.display_order;

  const { data: addon, error } = await supabase
    .from("item_addons")
    .update(updateData)
    .eq("id", addonId)
    .select()
    .single();

  if (error) {
    console.error("Error updating item addon:", error);
    return { error: error.message };
  }

  await LogAuditEvent({
    merchantId: (existing as any).menu_items?.merchant_id || existing.merchant_id,
    action: `Updated addon "${addon.name}" on item "${(existing as any).menu_items?.name || "unknown"}"`,
    actionCategory: "menu",
    resourceType: "item_addon",
    resourceId: addonId,
    resourceName: addon.name,
    changes: { before: existing as any, after: input as any },
  });

  return { data: addon };
}

/**
 * Delete an item addon
 */
export async function DeleteItemAddon(addonId: string) {
  if (!addonId) {
    return { error: "Addon ID is required" };
  }

  const supabase = createServiceRoleClient();

  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to manage item addons" };
  }

  // Get existing for audit
  const { data: existing } = await supabase
    .from("item_addons")
    .select("*, menu_items(name, merchant_id)")
    .eq("id", addonId)
    .single();

  if (!existing) {
    return { error: "Addon not found" };
  }

  const { error } = await supabase
    .from("item_addons")
    .delete()
    .eq("id", addonId);

  if (error) {
    console.error("Error deleting item addon:", error);
    return { error: error.message };
  }

  await LogAuditEvent({
    merchantId: (existing as any).menu_items?.merchant_id || existing.merchant_id,
    action: `Deleted addon "${existing.name}" from item "${(existing as any).menu_items?.name || "unknown"}"`,
    actionCategory: "menu",
    resourceType: "item_addon",
    resourceId: addonId,
    resourceName: existing.name,
    severity: "warning",
  });

  return { success: true };
}

/**
 * Reorder item addons
 */
export async function ReorderItemAddons(
  menuItemId: string,
  addonIds: string[],
) {
  if (!menuItemId || !addonIds.length) {
    return { error: "Item ID and addon IDs are required" };
  }

  const supabase = createServiceRoleClient();

  const roleInfo = await getCurrentUserMerchantRole();
  if (roleInfo?.isMember) {
    return { error: "You do not have permission to manage item addons" };
  }

  // Batch update display_order
  const updates = addonIds.map((id, index) =>
    supabase
      .from("item_addons")
      .update({ display_order: index })
      .eq("id", id)
      .eq("menu_item_id", menuItemId)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("Error reordering item addons:", failed.error);
    return { error: failed.error.message };
  }

  return { success: true };
}
