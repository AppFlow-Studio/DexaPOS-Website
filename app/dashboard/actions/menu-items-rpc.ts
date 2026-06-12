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
  locationId?: string | null,
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
  locationId?: string | null,
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
  base_delivery_price: number | null;
  base_availability: boolean;

  // Effective values (computed with overrides)
  effective_price: number;
  effective_cash_price: number | null;
  effective_delivery_price: number | null;
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
    custom_delivery_price: number | null;
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
        { onConflict: "location_id,modifier_group_id" },
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
  if (stockTrackingMode !== undefined || currentStock !== undefined) {
    return {
      success: false,
      error:
        "Global modifier edits cannot set stock fields. Use a location override.",
    };
  }

  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (priceModifier !== undefined) updateData.price_modifier = priceModifier;
  if (isActive !== undefined) updateData.is_active = isActive;

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
  locationId?: string | null,
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
    base_delivery_price: item.base_delivery_price ?? null,
    base_availability: item.base_availability ?? true,

    // Effective prices (L2 > L1 ONLY, no category prices!)
    effective_price: item.effective_price,
    effective_cash_price: item.effective_cash_price,
    effective_delivery_price: item.effective_delivery_price ?? null,
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
// GET ITEM MODIFIER GROUPS (for Edit Item dialog)
// Direct query — not dependent on the RPC including modifier_groups.
// ============================================================================

export async function getItemModifierGroups(
  menuItemId: string,
  locationId?: string | null,
): Promise<
  Array<{ id: string; name: string; description: string | null; source?: "global" | "location" }>
> {
  if (!menuItemId) return [];
  try {
    const supabase = createServiceRoleClient();

    const sortAssignments = (
      rows: any[],
      source: "global" | "location",
      relationKey = "modifier_groups",
    ) =>
      (rows || [])
        .filter((row) => row?.[relationKey])
        .sort((a, b) => {
          const aOrder =
            typeof a.display_order === "number"
              ? a.display_order
              : typeof a[relationKey]?.display_order === "number"
                ? a[relationKey].display_order
                : Number.MAX_SAFE_INTEGER;
          const bOrder =
            typeof b.display_order === "number"
              ? b.display_order
              : typeof b[relationKey]?.display_order === "number"
                ? b[relationKey].display_order
                : Number.MAX_SAFE_INTEGER;

          if (aOrder !== bOrder) {
            return aOrder - bOrder;
          }

          return (a[relationKey]?.name || "").localeCompare(
            b[relationKey]?.name || "",
          );
        })
        .map((row) => ({ ...row[relationKey], source }));

    // 1. Global assignments
    const { data: globalData } = await supabase
      .from("menu_item_modifier_groups")
      .select(
        "modifier_group_id, display_order, modifier_groups(id, name, description, display_order)",
      )
      .eq("menu_item_id", menuItemId);

    const globalGroups = sortAssignments(
      globalData as any[] || [],
      "global",
    ) as Array<{
      id: string;
      name: string;
      description: string | null;
      source: "global";
    }>;

    // 2. Location-specific assignments (if location provided)
    if (locationId && locationId !== "all") {
      const { data: locationData } = await supabase
        .from("location_item_modifier_groups")
        .select(
          "modifier_group_id, display_order, modifier_groups:modifier_groups(id, name, description, display_order)",
        )
        .eq("menu_item_id", menuItemId)
        .eq("location_id", locationId);

      const locationGroups = sortAssignments(
        locationData as any[] || [],
        "location",
      ) as Array<{
        id: string;
        name: string;
        description: string | null;
        source: "location";
      }>;

      // Merge and deduplicate (global takes precedence)
      const globalIds = new Set(globalGroups.map((g: any) => g.id));
      const combined = [
        ...globalGroups,
        ...locationGroups.filter((g: any) => !globalIds.has(g.id)),
      ];

      // 3. Per-location order override. reorder_item_modifier_groups upserts
      // location_modifier_group_overrides(location_id, modifier_group_id,
      // display_order) when called with a location_id, so that table is the
      // source of truth for per-location ordering. The assignment tables only
      // track membership/global order.
      if (combined.length > 0) {
        const { data: overrideRows } = await supabase
          .from("location_modifier_group_overrides")
          .select("modifier_group_id, display_order")
          .eq("location_id", locationId)
          .in(
            "modifier_group_id",
            combined.map((g) => g.id),
          );

        const overrideOrder = new Map<string, number>();
        for (const row of (overrideRows ?? []) as Array<{
          modifier_group_id: string;
          display_order: number | null;
        }>) {
          if (typeof row.display_order === "number") {
            overrideOrder.set(row.modifier_group_id, row.display_order);
          }
        }

        if (overrideOrder.size > 0) {
          // Stable sort: groups with a location override use it; groups without
          // fall back to their current relative position (which already encodes
          // the global order from sortAssignments above).
          const withIdx = combined.map((g, idx) => ({ g, idx }));
          withIdx.sort((a, b) => {
            const aO = overrideOrder.get(a.g.id);
            const bO = overrideOrder.get(b.g.id);
            if (aO != null && bO != null) return aO - bO;
            if (aO != null) return -1;
            if (bO != null) return 1;
            return a.idx - b.idx;
          });
          return withIdx.map((x) => x.g);
        }
      }

      return combined;
    }

    return globalGroups;
  } catch {
    return [];
  }
}

// ============================================================================
// GET MENU WITH CATEGORIES (Primary menu view)
// ============================================================================

export async function getMenuWithCategories(
  menuId: string,
  locationId?: string | null,
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
  deliveryPrice?: number | null;
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

  // Prep Station (KDS Routing - migration 022)
  prepStationId?: string | null;

  // Modifier linking
  modifier_group_ids?: string[];

  // Location-owned menu flag (skip RPC, update category_items directly)
  isMenuLocationOwned?: boolean;
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
  locationId: string | null,
  modifierId: string,
  price: number,
  isActive: boolean,
  stockMode: "quantity" | "in_stock" | "out_of_stock",
  currentStock: number | null,
) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("upsert_modifier_override", {
    p_location_id: locationId ?? null,
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
  params: UpdateItemParams,
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

    // Fetch existing modifier group assignments BEFORE deletion (for audit log)
    const { data: existingAssignments } = await adminSupabase
      .from("menu_item_modifier_groups")
      .select("modifier_group_id")
      .eq("menu_item_id", params.menuItemId);

    const oldModifierGroupIds = (existingAssignments || []).map(
      (a) => a.modifier_group_id,
    );

    // Fetch menu item details for audit log (name and merchant_id)
    const { data: menuItemDetails, error: menuItemError } = await supabase
      .from("menu_items")
      .select("name, merchant_id")
      .eq("id", params.menuItemId)
      .single();

    // First delete existing assignments
    const { error: deleteError } = await adminSupabase
      .from("menu_item_modifier_groups")
      .delete()
      .eq("menu_item_id", params.menuItemId);

    if (deleteError) {
      console.error(
        "Error deleting existing modifier assignments:",
        deleteError,
      );
    }

    // Insert new assignments if any
    if (params.modifier_group_ids.length > 0) {
      if (!menuItemDetails) {
        console.error(
          "Error fetching menu item for modifier update:",
          menuItemError,
        );
        return { success: false, error: "Could not retrieve item details" };
      }

      const modifierInserts = params.modifier_group_ids.map((groupId, index) => ({
        menu_item_id: params.menuItemId,
        modifier_group_id: groupId,
        display_order: index,
        merchant_id: menuItemDetails.merchant_id,
      }));

      const { error: insertError } = await adminSupabase
        .from("menu_item_modifier_groups")
        .insert(modifierInserts);

      if (insertError) {
        console.error("Error inserting modifier assignments:", insertError);
      }
    }

    // Log Audit Event for modifier group updates
    if (menuItemDetails) {
      // Determine what changed
      const addedGroupIds = params.modifier_group_ids.filter(
        (id) => !oldModifierGroupIds.includes(id),
      );
      const removedGroupIds = oldModifierGroupIds.filter(
        (id) => !params.modifier_group_ids!.includes(id),
      );
      const orderChanged =
        addedGroupIds.length === 0 &&
        removedGroupIds.length === 0 &&
        oldModifierGroupIds.length === params.modifier_group_ids.length &&
        oldModifierGroupIds.some(
          (id, index) => id !== params.modifier_group_ids![index],
        );

      // Only log if there was an actual change
      if (addedGroupIds.length > 0 || removedGroupIds.length > 0 || orderChanged) {
        // Fetch modifier group names for user-friendly display
        const allGroupIds = [
          ...new Set([
            ...addedGroupIds,
            ...removedGroupIds,
            ...params.modifier_group_ids,
          ]),
        ];
        const { data: modifierGroups } = await supabase
          .from("modifier_groups")
          .select("id, name")
          .in("id", allGroupIds);

        const groupNameMap = new Map(
          (modifierGroups || []).map((g) => [g.id, g.name]),
        );

        // Get human-readable names
        const addedGroupNames = addedGroupIds.map(
          (id) => groupNameMap.get(id) || "Unknown Group",
        );
        const removedGroupNames = removedGroupIds.map(
          (id) => groupNameMap.get(id) || "Unknown Group",
        );
        const newGroupNames = params.modifier_group_ids.map(
          (id) => groupNameMap.get(id) || "Unknown Group",
        );
        const oldGroupNames = oldModifierGroupIds.map(
          (id) => groupNameMap.get(id) || "Unknown Group",
        );

        await LogAuditEvent({
          merchantId: menuItemDetails.merchant_id,
          action: `Updated Modifiers for Item: ${menuItemDetails.name}`,
          actionCategory: "menu",
          resourceType: "menu_item",
          resourceId: params.menuItemId,
          resourceName: menuItemDetails.name,
          locationId: locationId,
          changes: {
            before: { modifier_groups: oldGroupNames },
            after: { modifier_groups: newGroupNames },
          },
          metadata: {
            added_modifier_groups: addedGroupNames,
            removed_modifier_groups: removedGroupNames,
            modifier_order_changed: orderChanged,
          },
        });
      }
    }
  }

  // 1. Fetch "Before" state for Audit Log (Base Fields & Simple Price Overrides)
  const beforeLog: Record<string, unknown> = {};

  // Fetch Base Item
  const { data: beforeItem } = await supabase
    .from("menu_items")
    .select("*")
    .eq("id", params.menuItemId)
    .single();

  if (beforeItem) {
    if (params.name !== undefined) beforeLog.name = beforeItem.name;
    if (params.description !== undefined)
      beforeLog.description = beforeItem.description;
    if (params.image !== undefined) beforeLog.image = beforeItem.image;
    if (params.allergens !== undefined)
      beforeLog.allergens = beforeItem.allergens;
    if (params.cardBgColor !== undefined)
      beforeLog.card_bg_color = beforeItem.card_bg_color;
    if (params.mealTypes !== undefined)
      beforeLog.meal_types = beforeItem.meal_types;
    if (params.stockTrackingMode !== undefined && !locationId)
      beforeLog.stock_tracking_mode = beforeItem.stock_tracking_mode;

    if (params.taxCategory !== undefined && !locationId)
      beforeLog.tax_category = beforeItem.tax_category;
    if (params.isTaxExempt !== undefined && !locationId)
      beforeLog.is_tax_exempt = beforeItem.is_tax_exempt;
    if (params.availableChannels !== undefined && !locationId)
      beforeLog.available_channels = beforeItem.available_channels;

    // Base Price (Global)
    if (!locationId && params.price !== undefined)
      beforeLog.price = beforeItem.price;
    if (!locationId && params.cashPrice !== undefined)
      beforeLog.cash_price = beforeItem.cash_price;
    if (!locationId && params.availability !== undefined)
      beforeLog.availability = beforeItem.availability ?? true;
  }

  // Fetch Location Override (if L2)
  if (locationId && !params.menuId && !params.categoryId) {
    const { data: beforeOverride } = await supabase
      .from("location_item_overrides")
      .select("*")
      .eq("location_id", locationId)
      .eq("menu_item_id", params.menuItemId)
      .single();

    if (beforeOverride) {
      // Existing override
      if (params.price !== undefined)
        beforeLog.price = beforeOverride.custom_price ?? beforeItem?.price;
      if (params.cashPrice !== undefined)
        beforeLog.cash_price =
          beforeOverride.custom_cash_price ?? beforeItem?.cash_price;
      if (params.taxCategory !== undefined)
        beforeLog.tax_category =
          beforeOverride.tax_category ?? beforeItem?.tax_category;
      if (params.isTaxExempt !== undefined)
        beforeLog.is_tax_exempt =
          beforeOverride.is_tax_exempt ?? beforeItem?.is_tax_exempt;
      if (params.availableChannels !== undefined)
        beforeLog.available_channels =
          beforeOverride.available_channels ?? beforeItem?.available_channels;
    } else if (beforeItem) {
      // No existing override, inheriting base
      if (params.price !== undefined) beforeLog.price = beforeItem.price;
      if (params.cashPrice !== undefined)
        beforeLog.cash_price = beforeItem.cash_price;
      // ... stock tracking mode, etc. if needed
    }
  }

  // Track changes for audit log (After state)
  const changesLog: Record<string, unknown> = {};
  let finalUpdateResult: UpdateResult = {
    success: true,
    level: 1,
    table: "menu_items",
    action: "updated",
  };

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
      if (params.name !== undefined) {
        updateData.name = params.name;
        changesLog.name = params.name;
      }
      if (params.description !== undefined) {
        updateData.description = params.description;
        changesLog.description = params.description;
      }
      if (params.image !== undefined) {
        updateData.image = params.image;
        changesLog.image = params.image;
      }
      if (params.allergens !== undefined) {
        updateData.allergens = params.allergens;
        changesLog.allergens = params.allergens;
      }
      if (params.cardBgColor !== undefined) {
        updateData.card_bg_color = params.cardBgColor;
        changesLog.card_bg_color = params.cardBgColor;
      }
      if (params.mealTypes !== undefined) {
        updateData.meal_types = params.mealTypes;
        changesLog.meal_types = params.mealTypes;
      }
      if (params.stockTrackingMode !== undefined) {
        updateData.stock_tracking_mode = params.stockTrackingMode;
        // Don't log here if it's handled in override block
      }

      // Tax & Inventory Control fields (migration 014)
      if (params.taxCategory !== undefined) {
        updateData.tax_category = params.taxCategory;
        changesLog.tax_category = params.taxCategory;
      }
      if (params.isTaxExempt !== undefined) {
        updateData.is_tax_exempt = params.isTaxExempt;
        changesLog.is_tax_exempt = params.isTaxExempt;
      }
      if (params.availableChannels !== undefined) {
        updateData.available_channels = params.availableChannels;
        changesLog.available_channels = params.availableChannels;
      }
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
      if (params.taxCategory !== undefined) {
        overrideData.tax_category = params.taxCategory;
        changesLog.tax_category = params.taxCategory;
      }
      if (params.isTaxExempt !== undefined) {
        overrideData.is_tax_exempt = params.isTaxExempt;
        changesLog.is_tax_exempt = params.isTaxExempt;
      }
      if (params.availableChannels !== undefined) {
        overrideData.available_channels = params.availableChannels;
        changesLog.available_channels = params.availableChannels;
      }

      // Prep Station override (migration 022)
      if (params.prepStationId !== undefined) {
        overrideData.prep_station_id = params.prepStationId;
        changesLog.prep_station_id = params.prepStationId;
      }

      // Only upsert if we have fields to update
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
          },
        );

        if (error) {
          return { success: false, error: error.message };
        }
      }
    }
  }

  // Prep Station assignment — always writes to location_item_overrides (location-only)
  // This is separate because prep stations apply at any level (L2/L4/L5) but
  // always persist in location_item_overrides regardless of category/menu context.
  if (
    params.prepStationId !== undefined &&
    locationId &&
    // Skip if already handled in the L2 base fields block above
    (params.menuId || params.categoryId)
  ) {
    const { error } = await supabase.from("location_item_overrides").upsert(
      {
        location_id: locationId,
        menu_item_id: params.menuItemId,
        prep_station_id: params.prepStationId,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "location_id,menu_item_id",
      },
    );

    if (error) {
      console.error("[updateItemOverride] Prep station upsert error:", error);
    } else {
      changesLog.prep_station_id = params.prepStationId;
    }
  }

  // If updating price/availability - use the new category-centric function
  if (
    params.price !== undefined ||
    params.cashPrice !== undefined ||
    params.deliveryPrice !== undefined ||
    params.availability !== undefined ||
    params.priceModifier !== undefined ||
    params.displayOrder !== undefined ||
    params.isFeatured !== undefined ||
    params.stockTrackingMode !== undefined ||
    params.currentStock !== undefined
  ) {
    if (params.isMenuLocationOwned && params.categoryId && params.menuId) {
      // Location-owned menus: update category_items directly (the source of truth).
      // The RPC rejects this case by design since there's no need for L5 overrides.
      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (params.price !== undefined) updatePayload.custom_price = params.price ?? null;
      if (params.cashPrice !== undefined) updatePayload.custom_cash_price = params.cashPrice ?? null;
      if (params.deliveryPrice !== undefined) updatePayload.custom_delivery_price = params.deliveryPrice ?? null;
      if (params.availability !== undefined) updatePayload.is_available = params.availability ?? true;
      if (params.displayOrder !== undefined) updatePayload.display_order = params.displayOrder;
      if (params.isFeatured !== undefined) updatePayload.is_featured = params.isFeatured;

      const { error } = await supabase
        .from("category_items")
        .update(updatePayload)
        .eq("category_id", params.categoryId)
        .eq("menu_item_id", params.menuItemId);

      if (error) return { success: false, error: error.message };
      finalUpdateResult = { success: true, action: "updated", level: 3, table: "category_items" };
    } else {
      const { data, error } = await supabase.rpc(
        "upsert_category_item_override",
        {
          p_menu_item_id: params.menuItemId,
          p_category_id: params.categoryId || null,
          // Pass menuId always: RPC now handles all four (location,menu) combinations:
          //   (null,null)   = UI L2 global category → category_items WHERE menu_id IS NULL
          //   (null,menuId) = UI L4 global menu cat → category_items WHERE menu_id = menuId
          //   (locId,null)  = UI L3 branch category → location_category_item_overrides
          //   (locId,menuId)= UI L5 branch menu     → location_menu_item_overrides
          p_menu_id: params.menuId || null,
          p_location_id: locationId || null,
          p_custom_price: params.price,
          p_custom_cash_price: params.cashPrice,
          p_custom_delivery_price: params.deliveryPrice,
          p_is_available: params.availability,
          p_price_modifier: params.priceModifier,
          p_price_modifier_type: params.priceModifierType,
          p_display_order: params.displayOrder,
          p_is_featured: params.isFeatured,
          p_stock_tracking_mode: params.stockTrackingMode,
          p_current_stock: params.currentStock,
        },
      );

      if (error) {
        return { success: false, error: error.message };
      }

      finalUpdateResult = data as UpdateResult;
    }

    if (finalUpdateResult.success) {
      if (params.price !== undefined) changesLog.price = params.price;
      if (params.cashPrice !== undefined)
        changesLog.cash_price = params.cashPrice;
      if (params.deliveryPrice !== undefined)
        changesLog.delivery_price = params.deliveryPrice;
      if (params.availability !== undefined)
        changesLog.availability = params.availability;
      if (params.priceModifier !== undefined)
        changesLog.price_modifier = params.priceModifier;
      if (params.displayOrder !== undefined)
        changesLog.display_order = params.displayOrder;
      if (params.isFeatured !== undefined)
        changesLog.is_featured = params.isFeatured;
      if (params.stockTrackingMode !== undefined)
        changesLog.stock_tracking_mode = params.stockTrackingMode;
    }
  }

  // Final Audit Log - Only log if there are ACTUAL changes
  if (Object.keys(changesLog).length > 0) {
    // Check if any values actually changed
    let hasRealChanges = false;
    for (const key of Object.keys(changesLog)) {
      // Compare before and after values
      const beforeValue = beforeLog[key];
      const afterValue = changesLog[key];

      // Use JSON.stringify for deep comparison (handles arrays, objects, etc.)
      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        hasRealChanges = true;
        break;
      }
    }

    // Only proceed with logging if there are actual changes
    if (hasRealChanges) {
      // Fetch item details and related names for user-friendly audit log
      const [itemResult, categoryResult, menuResult] = await Promise.all([
        supabase
          .from("menu_items")
          .select("name, merchant_id")
          .eq("id", params.menuItemId)
          .single(),
        params.categoryId
          ? supabase
              .from("categories")
              .select("name")
              .eq("id", params.categoryId)
              .single()
          : Promise.resolve({ data: null }),
        params.menuId
          ? supabase
              .from("menus")
              .select("name")
              .eq("id", params.menuId)
              .single()
          : Promise.resolve({ data: null }),
      ]);

      const itemName = itemResult.data?.name || "Unknown Item";
      const categoryName = categoryResult.data?.name;
      const menuName = menuResult.data?.name;

      // Build user-friendly metadata
      const userFriendlyMetadata: Record<string, unknown> = {};
      if (categoryName) userFriendlyMetadata.category_name = categoryName;
      if (menuName) userFriendlyMetadata.menu_name = menuName;

      await LogAuditEvent({
        merchantId: itemResult.data?.merchant_id,
        action: `Updated Item: ${itemName}`,
        actionCategory: "menu",
        resourceType: "menu_item",
        resourceId: params.menuItemId,
        resourceName: itemName,
        locationId: locationId,
        changes: {
          before: beforeLog,
          after: changesLog,
        },
        metadata:
          Object.keys(userFriendlyMetadata).length > 0
            ? userFriendlyMetadata
            : undefined,
      });
    }
  }

  return finalUpdateResult;
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
  locationId?: string | null,
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
  locationId?: string | null,
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
  locationId?: string | null,
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
  type: "add" | "percent",
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
  },
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
  },
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
  },
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

  const result = data as UpdateResult;

  if (result.success) {
    // Fetch names for audit log
    const [itemResult, locResult, catResult] = await Promise.all([
      supabase
        .from("menu_items")
        .select("name, merchant_id")
        .eq("id", menuItemId)
        .single(),
      options?.locationId && options.locationId !== "all"
        ? supabase
            .from("locations")
            .select("name")
            .eq("id", options.locationId)
            .single()
        : Promise.resolve({ data: null }),
      options?.categoryId
        ? supabase
            .from("categories")
            .select("name")
            .eq("id", options.categoryId)
            .single()
        : Promise.resolve({ data: null }),
    ]);

    const levelLabels: Record<number, string> = {
      1: "Global Base",
      2: "Location Base",
      3: "Category",
      4: "Location Category",
      5: "Location Menu",
    };

    const itemName = itemResult.data?.name || "Unknown Item";
    const locationName = locResult.data?.name;
    const categoryName = catResult.data?.name;

    await LogAuditEvent({
      merchantId: itemResult.data?.merchant_id,
      action: `Reset Item Pricing: ${itemName}`,
      actionCategory: "menu",
      resourceType: "menu_item",
      resourceId: menuItemId,
      resourceName: itemName,
      locationId:
        options?.locationId === "all" ? null : options?.locationId || null,
      metadata: {
        target_level: targetLevel,
        target_level_name: levelLabels[targetLevel],
        location_name: locationName,
        category_name: categoryName,
      },
    });
  }

  return result;
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
  },
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
        `,
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
  },
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
  },
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
  },
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
  },
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
  },
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
  }>,
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
        }`,
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
  },
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
  },
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
