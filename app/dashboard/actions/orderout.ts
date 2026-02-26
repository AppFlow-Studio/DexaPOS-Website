"use server";

// ============================================================================
// Merchant OrderOut Server Actions
// Description: Merchant dashboard actions for OrderOut onboarding and status
// ============================================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";
import {
  transformMenuToOrderOut,
  canonicalStringify,
} from "@/lib/orderout/transform-menu";
import type { MenuWithCategories } from "@/types/menu";

// ============================================================================
// Types
// ============================================================================

export interface OrderOutLocationStatus {
  hasAccount: boolean;
  ooAccountId: string | null;
  hasRestaurant: boolean;
  ooRestaurantId: string | null;
  status: string | null;
  isAcceptingOrders: boolean;
  prepTimeMinutes: number;
  connectedChannels: unknown;
  autoAcceptOrders: boolean;
  dashboardUrl: string;
}

export interface OnboardOrderOutParams {
  clerkOrgId: string;
  locationId: string;
  accountName: string;
  restaurantName: string;
  streetAddress: string;
  city: string;
  state: string;
  zipcode: string;
  country: string;
  restaurantManagerEmail: string;
  restaurantManagerFirstname: string;
  restaurantManagerLastname: string;
  restaurantManagerPhone: string;
}

// ============================================================================
// READ Operations
// ============================================================================

/**
 * Get OrderOut status for a specific location
 */
export async function getOrderOutStatus(
  clerkOrgId: string,
  locationId: string
): Promise<{
  success: boolean;
  data: OrderOutLocationStatus | null;
  error: string | null;
}> {
  if (!clerkOrgId || !locationId) {
    return { success: false, data: null, error: "Missing required parameters" };
  }

  try {
    const supabase = createServerSupabaseClient();

    // Resolve merchant
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { success: false, data: null, error: "Merchant not found" };
    }

    // Get restaurant for this location (oo_account_id lives here now)
    const { data: restaurant } = await supabase
      .from("orderout_restaurants")
      .select(
        "oo_account_id, oo_restaurant_id, status, is_accepting_orders, prep_time_minutes, connected_channels, auto_accept_orders"
      )
      .eq("location_id", locationId)
      .single();

    return {
      success: true,
      data: {
        hasAccount: !!restaurant?.oo_account_id,
        ooAccountId: restaurant?.oo_account_id || null,
        hasRestaurant: !!restaurant,
        ooRestaurantId: restaurant?.oo_restaurant_id || null,
        status: restaurant?.status || null,
        isAcceptingOrders: restaurant?.is_accepting_orders ?? false,
        prepTimeMinutes: restaurant?.prep_time_minutes ?? 20,
        connectedChannels: restaurant?.connected_channels || null,
        autoAcceptOrders: restaurant?.auto_accept_orders ?? false,
        dashboardUrl: "https://dashboard.orderout.co",
      },
      error: null,
    };
  } catch (error) {
    console.error("[getOrderOutStatus] Exception:", error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// WRITE Operations
// ============================================================================

/**
 * Onboard a location to OrderOut via the edge function
 */
export async function onboardOrderOut(
  params: OnboardOrderOutParams
): Promise<{
  success: boolean;
  data?: {
    oo_account_id: string;
    oo_restaurant_id: string;
    dashboard_url: string;
  };
  error: string | null;
}> {
  if (!params.clerkOrgId || !params.locationId) {
    return { success: false, error: "Missing required parameters" };
  }

  try {
    const supabase = createServerSupabaseClient();

    // Resolve merchant
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", params.clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { success: false, error: "Merchant not found" };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return { success: false, error: "Server configuration error" };
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/orderout-onboard`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          merchant_id: merchant.id,
          location_id: params.locationId,
          account_name: params.accountName,
          restaurant_name: params.restaurantName,
          street_address: params.streetAddress,
          city: params.city,
          state: params.state,
          zipcode: params.zipcode,
          country: params.country,
          restaurant_manager_email: params.restaurantManagerEmail,
          restaurant_manager_firstname: params.restaurantManagerFirstname,
          restaurant_manager_lastname: params.restaurantManagerLastname,
          restaurant_manager_phone: params.restaurantManagerPhone,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || "Failed to onboard location to OrderOut",
      };
    }

    // Fetch location name for audit log
    const { data: loc } = await supabase
      .from("locations")
      .select("name")
      .eq("id", params.locationId)
      .single();

    await LogAuditEvent({
      clerkOrgId: params.clerkOrgId,
      locationId: params.locationId,
      action: "Connected Location to OrderOut",
      actionCategory: "integrations",
      severity: "info",
      resourceType: "orderout_integration",
      resourceId: params.locationId,
      resourceName: loc?.name || "Location",
      metadata: {
        location_name: loc?.name,
        oo_account_id: result.data?.oo_account_id,
        oo_restaurant_id: result.data?.oo_restaurant_id,
      },
    });

    return { success: true, data: result.data, error: null };
  } catch (error) {
    console.error("[onboardOrderOut] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Menu Upload
// ============================================================================

export interface PushMenuToOrderOutParams {
  clerkOrgId: string;
  menuId: string;
  locationId: string;
}

/**
 * Push a menu to OrderOut for delivery platform listing
 */
export async function pushMenuToOrderOut(
  params: PushMenuToOrderOutParams
): Promise<{
  success: boolean;
  data?: { syncId: string; itemsSynced: number; ooMenuId: string | null; isUpdate: boolean };
  error: string | null;
}> {
  const { clerkOrgId, menuId, locationId } = params;

  if (!clerkOrgId || !menuId || !locationId) {
    return { success: false, error: "Missing required parameters" };
  }

  let syncRecord: { id: string } | null = null;

  try {
    const supabase = createServerSupabaseClient();

    // 1. Resolve merchant
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { success: false, error: "Merchant not found" };
    }

    // 2. Get OrderOut restaurant for this location
    const { data: restaurant, error: restaurantError } = await supabase
      .from("orderout_restaurants")
      .select("id, oo_restaurant_id")
      .eq("location_id", locationId)
      .single();

    if (restaurantError || !restaurant?.oo_restaurant_id) {
      return {
        success: false,
        error: "Location is not onboarded to OrderOut",
      };
    }

    // 3. Fetch menu data via RPC
    const { data: menuData, error: menuError } = await supabase.rpc(
      "get_menu_with_categories",
      { p_menu_id: menuId, p_location_id: locationId }
    );

    if (menuError || !menuData) {
      return {
        success: false,
        error: menuError?.message || "Failed to fetch menu data",
      };
    }

    // 4. Transform menu to OrderOut format
    const menuPayload = transformMenuToOrderOut(menuData as MenuWithCategories);
    const itemCount = menuPayload.items.length;

    // 4b. Check for existing link (determines if this is an update)
    const { data: existingLink } = await supabase
      .from("orderout_menu_links")
      .select("id, oo_menu_id")
      .eq("orderout_restaurant_id", restaurant.id)
      .eq("menu_id", menuId)
      .eq("is_active", true)
      .single();

    const isUpdate = !!existingLink?.oo_menu_id;

    // 5. Insert pending sync record
    const { data: syncData, error: syncInsertError } = await supabase
      .from("orderout_menu_syncs")
      .insert({
        orderout_restaurant_id: restaurant.id,
        menu_id: menuId,
        sync_direction: "push",
        sync_status: "pending",
        menu_payload_snapshot: menuPayload,
        items_synced: 0,
        items_failed: 0,
      })
      .select("id")
      .single();

    if (syncInsertError || !syncData) {
      console.error("[pushMenuToOrderOut] Failed to create sync record:", syncInsertError);
      // Still continue with the push — the menu upload is more important than tracking
    } else {
      syncRecord = syncData;
    }

    // 6. Call OrderOut API directly to push menu
    const orderOutApiUrl = process.env.NEXT_PUBLIC_ORDEROUT_API_URL;
    const orderOutApiKey = process.env.ORDEROUT_API_KEY;

    if (!orderOutApiUrl || !orderOutApiKey) {
      return { success: false, error: "OrderOut API configuration missing" };
    }

    const pushUrl =
      isUpdate && existingLink?.oo_menu_id
        ? `${orderOutApiUrl}/pos/restaurant/${restaurant.oo_restaurant_id}/menu/${existingLink.oo_menu_id}`
        : `${orderOutApiUrl}/pos/restaurant/${restaurant.oo_restaurant_id}/menu`;
    const pushMethod = isUpdate && existingLink?.oo_menu_id ? "PUT" : "POST";

    const pushResponse = await fetch(pushUrl, {
      method: pushMethod,
      headers: {
        "Content-Type": "application/json",
        "api-key": orderOutApiKey,
      },
      body: JSON.stringify(menuPayload),
    });

    let pushResult: Record<string, unknown> = {};
    try {
      pushResult = await pushResponse.json();
    } catch {
      // Response may not be JSON
    }

    // console.log(`[pushMenuToOrderOut] ${pushMethod} response:`, pushResponse.status, JSON.stringify(pushResult));

    // 6a. Extract oo_menu_id from POST response
    // Confirmed response format: { "menu": {...}, "successful": true, "id": 5132227285483520 }
    // The OO menu ID is at the root-level `id` field
    let ooMenuId: string | null = null;
    if (pushResponse.ok && pushResult) {
      // For updates where we already have a link, preserve the existing oo_menu_id
      if (isUpdate && existingLink?.oo_menu_id) {
        ooMenuId = existingLink.oo_menu_id;
        console.log("[pushMenuToOrderOut] Using existing oo_menu_id from link:", ooMenuId);
      } else {
        // For new pushes, extract from root-level `id`
        const responseId = pushResult.id;
        if (responseId) {
          ooMenuId = String(responseId);
          console.log("[pushMenuToOrderOut] Got oo_menu_id from POST response:", ooMenuId);
        }
      }
    }

    // 6b. Fall back to GET to retrieve oo_menu_id only for new pushes where POST didn't provide it
    if (pushResponse.ok && !ooMenuId) {
      try {
        const getResponse = await fetch(
          `${orderOutApiUrl}/pos/restaurant/${restaurant.oo_restaurant_id}/menu`,
          {
            method: "GET",
            headers: {
              "api-key": orderOutApiKey,
              accept: "application/json",
            },
          }
        );

        if (getResponse.ok) {
          const menus = await getResponse.json();
          if (Array.isArray(menus) && menus.length > 0) {
            const matched = menus.find(
              (m: { name?: string }) => m.name === menuPayload.name
            );
            const target = matched || menus[menus.length - 1];
            ooMenuId = target?.id ? String(target.id) : null;
          }
        }
      } catch (getErr) {
        console.warn("[pushMenuToOrderOut] Failed to retrieve oo_menu_id:", getErr);
        // Non-fatal — menu was still pushed successfully
      }
    }

    // 7. Update sync record with result
    if (syncRecord?.id) {
      if (pushResponse.ok) {
        const { data: updatedSync, error: updateError } = await supabase
          .from("orderout_menu_syncs")
          .update({
            sync_status: "success",
            items_synced: itemCount,
            items_failed: 0,
            synced_at: new Date().toISOString(),
            ...(ooMenuId ? { oo_menu_id: ooMenuId } : {}),
          })
          .eq("id", syncRecord.id)
          .select("id")
          .single();

        if (updateError) {
          console.error("[pushMenuToOrderOut] Failed to update sync record to success:", updateError);
        } else if (!updatedSync) {
          console.error("[pushMenuToOrderOut] Sync record update returned no rows — possible RLS issue for id:", syncRecord.id);
        }
      } else {
        const errorMsg =
          (pushResult.error as string) ||
          (pushResult.message as string) ||
          `OrderOut API returned ${pushResponse.status}`;
        const { data: updatedSync, error: updateError } = await supabase
          .from("orderout_menu_syncs")
          .update({
            sync_status: "failed",
            error_details: errorMsg,
            synced_at: new Date().toISOString(),
          })
          .eq("id", syncRecord.id)
          .select("id")
          .single();

        if (updateError) {
          console.error("[pushMenuToOrderOut] Failed to update sync record to failed:", updateError);
        } else if (!updatedSync) {
          console.error("[pushMenuToOrderOut] Sync record update returned no rows — possible RLS issue for id:", syncRecord.id);
        }
      }
    } else {
      console.warn("[pushMenuToOrderOut] No sync record to update — insert failed earlier");
    }

    // 7b. Upsert orderout_menu_links after successful push
    if (pushResponse.ok && ooMenuId) {
      const { error: linkError } = await supabase
        .from("orderout_menu_links")
        .upsert(
          {
            orderout_restaurant_id: restaurant.id,
            menu_id: menuId,
            oo_menu_id: ooMenuId,
            oo_menu_name: menuPayload.name,
            is_active: true,
            last_pushed_at: new Date().toISOString(),
            last_sync_id: syncRecord?.id || null,
          },
          { onConflict: "orderout_restaurant_id,menu_id" }
        );

      if (linkError) {
        console.error("[pushMenuToOrderOut] Failed to upsert menu link:", linkError);
        // Non-fatal — the push itself succeeded
      }
    }

    if (!pushResponse.ok) {
      const errorMsg =
        (pushResult.error as string) ||
        (pushResult.message as string) ||
        "Failed to push menu to OrderOut";
      return {
        success: false,
        error: errorMsg,
      };
    }

    // 8. Audit log
    const { data: menuInfo } = await supabase
      .from("menus")
      .select("name")
      .eq("id", menuId)
      .single();

    await LogAuditEvent({
      clerkOrgId,
      locationId,
      action: "pushed_menu_to_orderout",
      actionCategory: "integrations",
      severity: "info",
      resourceType: "menu",
      resourceId: menuId,
      resourceName: menuInfo?.name || "Menu",
      metadata: {
        items_synced: itemCount,
        sync_id: syncRecord?.id,
        oo_restaurant_id: restaurant.oo_restaurant_id,
        oo_menu_id: ooMenuId,
      },
    });

    return {
      success: true,
      data: {
        syncId: syncRecord?.id || "",
        itemsSynced: itemCount,
        ooMenuId,
        isUpdate,
      },
      error: null,
    };
  } catch (error) {
    console.error("[pushMenuToOrderOut] Exception:", error);

    // If we have a sync record, mark it as failed so it doesn't stay "pending"
    if (syncRecord?.id) {
      try {
        const supabase = createServerSupabaseClient();
        await supabase
          .from("orderout_menu_syncs")
          .update({
            sync_status: "failed",
            error_details: error instanceof Error ? error.message : "Unexpected error",
            synced_at: new Date().toISOString(),
          })
          .eq("id", syncRecord.id);
      } catch {
        console.error("[pushMenuToOrderOut] Failed to mark sync record as failed after exception");
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Live OrderOut Menus
// ============================================================================

/**
 * Fetch the list of menus currently live on OrderOut for a location
 */
export async function getOrderOutMenus(
  clerkOrgId: string,
  locationId: string
): Promise<{
  success: boolean;
  data: Array<{ id: string; name: string; published?: boolean }> | null;
  error: string | null;
}> {
  if (!clerkOrgId || !locationId) {
    return { success: false, data: null, error: "Missing required parameters" };
  }

  try {
    const supabase = createServerSupabaseClient();

    // Resolve merchant
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { success: false, data: null, error: "Merchant not found" };
    }

    // Get restaurant for this location
    const { data: restaurant } = await supabase
      .from("orderout_restaurants")
      .select("id, oo_restaurant_id")
      .eq("location_id", locationId)
      .single();

    if (!restaurant?.oo_restaurant_id) {
      return { success: false, data: null, error: "Location is not onboarded to OrderOut" };
    }

    const orderOutApiUrl = process.env.NEXT_PUBLIC_ORDEROUT_API_URL;
    const orderOutApiKey = process.env.ORDEROUT_API_KEY;

    if (!orderOutApiUrl || !orderOutApiKey) {
      return { success: false, data: null, error: "OrderOut API configuration missing" };
    }

    const response = await fetch(
      `${orderOutApiUrl}/pos/restaurant/${restaurant.oo_restaurant_id}/menu`,
      {
        method: "GET",
        headers: {
          "api-key": orderOutApiKey,
          accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      return {
        success: false,
        data: null,
        error: `OrderOut API returned ${response.status}`,
      };
    }

    const menus = await response.json();

    if (!Array.isArray(menus)) {
      return { success: true, data: [], error: null };
    }

    const formatted = menus.map((m: { id: number | string; name?: string; published?: boolean }) => ({
      id: String(m.id),
      name: m.name || "Unnamed Menu",
      published: m.published,
    }));

    return { success: true, data: formatted, error: null };
  } catch (error) {
    console.error("[getOrderOutMenus] Exception:", error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Menu Sync Status
// ============================================================================

export interface OrderOutMenuSyncStatus {
  lastSync: {
    id: string;
    status: string;
    itemsSynced: number;
    itemsFailed: number;
    errorDetails: string | null;
    createdAt: string;
    completedAt: string | null;
  } | null;
  totalSyncs: number;
  ooMenuId: string | null;
  syncHistory: Array<{
    id: string;
    menuId: string | null;
    menuName: string | null;
    status: string;
    itemsSynced: number;
    itemsFailed: number;
    errorDetails: string | null;
    createdAt: string;
    completedAt: string | null;
    ooMenuId: string | null;
  }>;
}

/**
 * Get the menu sync status for a location, optionally filtered by menuId
 */
export async function getOrderOutMenuSyncStatus(
  clerkOrgId: string,
  locationId: string,
  menuId?: string
): Promise<{
  success: boolean;
  data: OrderOutMenuSyncStatus | null;
  error: string | null;
}> {
  if (!clerkOrgId || !locationId) {
    return { success: false, data: null, error: "Missing required parameters" };
  }

  try {
    const supabase = createServerSupabaseClient();

    // Resolve merchant
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { success: false, data: null, error: "Merchant not found" };
    }

    // Get restaurant for this location
    const { data: restaurant } = await supabase
      .from("orderout_restaurants")
      .select("id")
      .eq("location_id", locationId)
      .single();

    if (!restaurant) {
      return {
        success: true,
        data: { lastSync: null, totalSyncs: 0, ooMenuId: null, syncHistory: [] },
        error: null,
      };
    }

    // 4a. Query orderout_menu_links for the canonical oo_menu_id
    let ooMenuId: string | null = null;
    if (menuId) {
      const { data: link } = await supabase
        .from("orderout_menu_links")
        .select("oo_menu_id")
        .eq("orderout_restaurant_id", restaurant.id)
        .eq("menu_id", menuId)
        .eq("is_active", true)
        .single();
      ooMenuId = link?.oo_menu_id || null;
    }

    // Get all sync records for this restaurant
    const { data: allSyncs } = await supabase
      .from("orderout_menu_syncs")
      .select("id, sync_status, items_synced, items_failed, error_details, created_at, synced_at, oo_menu_id, menu_id, menu_payload_snapshot")
      .eq("orderout_restaurant_id", restaurant.id)
      .order("created_at", { ascending: false });

    // Filter by menuId if provided — use menu_id FK directly, with name-matching fallback for historical records
    let filteredSyncs = allSyncs || [];
    if (menuId && filteredSyncs.length > 0) {
      // Fetch the menu name for fallback matching on legacy records
      const { data: menuRecord } = await supabase
        .from("menus")
        .select("name")
        .eq("id", menuId)
        .single();

      filteredSyncs = filteredSyncs.filter((sync) => {
        // Primary: match by menu_id FK
        if (sync.menu_id === menuId) return true;
        // Fallback for historical records where menu_id was NULL
        if (!sync.menu_id && menuRecord?.name) {
          const snapshot = sync.menu_payload_snapshot as Record<string, unknown> | null;
          return snapshot?.name === menuRecord.name;
        }
        return false;
      });
    }

    const latestSync = filteredSyncs[0] || null;

    // If no link found, fall back to scanning sync records (legacy)
    if (!ooMenuId) {
      const latestSuccessful = filteredSyncs.find(
        (s) => s.sync_status === "success" && s.oo_menu_id
      );
      ooMenuId = latestSuccessful?.oo_menu_id || null;
    }

    // Build sync history
    const syncHistory = filteredSyncs.map((sync) => {
      const snapshot = sync.menu_payload_snapshot as Record<string, unknown> | null;
      return {
        id: sync.id,
        menuId: sync.menu_id || menuId || null,
        menuName: (snapshot?.name as string) || null,
        status: sync.sync_status,
        itemsSynced: sync.items_synced ?? 0,
        itemsFailed: sync.items_failed ?? 0,
        errorDetails: sync.error_details,
        createdAt: sync.created_at,
        completedAt: sync.synced_at,
        ooMenuId: sync.oo_menu_id || null,
      };
    });

    return {
      success: true,
      data: {
        lastSync: latestSync
          ? {
              id: latestSync.id,
              status: latestSync.sync_status,
              itemsSynced: latestSync.items_synced ?? 0,
              itemsFailed: latestSync.items_failed ?? 0,
              errorDetails: latestSync.error_details,
              createdAt: latestSync.created_at,
              completedAt: latestSync.synced_at,
            }
          : null,
        totalSyncs: filteredSyncs.length,
        ooMenuId,
        syncHistory,
      },
      error: null,
    };
  } catch (error) {
    console.error("[getOrderOutMenuSyncStatus] Exception:", error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Backfill oo_menu_id for sync records that were pushed but didn't get the ID
 */
export async function backfillOrderOutMenuIds(
  clerkOrgId: string,
  locationId: string
): Promise<{
  success: boolean;
  data?: { backfilledCount: number };
  error: string | null;
}> {
  if (!clerkOrgId || !locationId) {
    return { success: false, error: "Missing required parameters" };
  }

  try {
    const supabase = createServerSupabaseClient();

    // Resolve merchant
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { success: false, error: "Merchant not found" };
    }

    // Get restaurant for this location
    const { data: restaurant } = await supabase
      .from("orderout_restaurants")
      .select("id, oo_restaurant_id")
      .eq("location_id", locationId)
      .single();

    if (!restaurant?.oo_restaurant_id) {
      return { success: false, error: "Location is not onboarded to OrderOut" };
    }

    // Fetch menus from OrderOut API
    const orderOutApiUrl = process.env.NEXT_PUBLIC_ORDEROUT_API_URL;
    const orderOutApiKey = process.env.ORDEROUT_API_KEY;

    if (!orderOutApiUrl || !orderOutApiKey) {
      return { success: false, error: "OrderOut API configuration missing" };
    }

    const getResponse = await fetch(
      `${orderOutApiUrl}/pos/restaurant/${restaurant.oo_restaurant_id}/menu`,
      {
        method: "GET",
        headers: {
          "api-key": orderOutApiKey,
          accept: "application/json",
        },
      }
    );

    if (!getResponse.ok) {
      return { success: false, error: `OrderOut API returned ${getResponse.status}` };
    }

    const ooMenus: Array<{ id: number | string; name: string; published?: boolean }> =
      await getResponse.json();

    if (!Array.isArray(ooMenus) || ooMenus.length === 0) {
      return { success: true, data: { backfilledCount: 0 }, error: null };
    }

    // Get successful sync records missing oo_menu_id
    const { data: syncRecords } = await supabase
      .from("orderout_menu_syncs")
      .select("id, menu_payload_snapshot, oo_menu_id")
      .eq("orderout_restaurant_id", restaurant.id)
      .eq("sync_status", "success")
      .is("oo_menu_id", null);

    if (!syncRecords || syncRecords.length === 0) {
      return { success: true, data: { backfilledCount: 0 }, error: null };
    }

    // Fetch all local menus for this merchant (for link upserts)
    const { data: localMenus } = await supabase
      .from("menus")
      .select("id, name")
      .eq("merchant_id", merchant.id);

    // Match by name and update sync records + upsert links
    let backfilledCount = 0;
    for (const syncRecord of syncRecords) {
      const snapshot = syncRecord.menu_payload_snapshot as Record<string, unknown> | null;
      const snapshotName = snapshot?.name as string | undefined;

      if (!snapshotName) continue;

      const matchedOoMenu = ooMenus.find((m) => m.name === snapshotName);
      if (!matchedOoMenu) continue;

      const ooMenuIdStr = String(matchedOoMenu.id);

      // Update sync record
      const { error: updateError } = await supabase
        .from("orderout_menu_syncs")
        .update({ oo_menu_id: ooMenuIdStr })
        .eq("id", syncRecord.id);

      if (!updateError) {
        backfilledCount++;
      }

      // Upsert into orderout_menu_links if we can match a local menu
      const matchedLocalMenu = localMenus?.find((m) => m.name === snapshotName);
      if (matchedLocalMenu) {
        await supabase
          .from("orderout_menu_links")
          .upsert(
            {
              orderout_restaurant_id: restaurant.id,
              menu_id: matchedLocalMenu.id,
              oo_menu_id: ooMenuIdStr,
              oo_menu_name: snapshotName,
              is_active: true,
              last_pushed_at: new Date().toISOString(),
              last_sync_id: syncRecord.id,
            },
            { onConflict: "orderout_restaurant_id,menu_id" }
          );
      }
    }

    return { success: true, data: { backfilledCount }, error: null };
  } catch (error) {
    console.error("[backfillOrderOutMenuIds] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Menu Payload Diff Check
// ============================================================================

export interface MenuPayloadDiffResult {
  hasChanges: boolean;
  isNewMenu: boolean;
  currentItemCount: number;
  lastSyncedItemCount: number;
}

/**
 * Compare the current menu payload against the last successful sync snapshot.
 * Returns whether there are changes that need to be synced.
 */
export async function checkMenuPayloadDiff(
  clerkOrgId: string,
  locationId: string,
  menuId: string
): Promise<{
  success: boolean;
  data: MenuPayloadDiffResult | null;
  error: string | null;
}> {
  if (!clerkOrgId || !locationId || !menuId) {
    return { success: false, data: null, error: "Missing required parameters" };
  }

  try {
    const supabase = createServerSupabaseClient();

    // 1. Resolve merchant
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { success: false, data: null, error: "Merchant not found" };
    }

    // 2. Get restaurant for this location
    const { data: restaurant } = await supabase
      .from("orderout_restaurants")
      .select("id, oo_restaurant_id")
      .eq("location_id", locationId)
      .single();

    if (!restaurant?.oo_restaurant_id) {
      return {
        success: false,
        data: null,
        error: "Location is not onboarded to OrderOut",
      };
    }

    // 3. Fetch current menu data via RPC and transform
    const { data: menuData, error: menuError } = await supabase.rpc(
      "get_menu_with_categories",
      { p_menu_id: menuId, p_location_id: locationId }
    );

    if (menuError || !menuData) {
      return {
        success: false,
        data: null,
        error: menuError?.message || "Failed to fetch menu data",
      };
    }

    const currentPayload = transformMenuToOrderOut(
      menuData as MenuWithCategories
    );
    const currentItemCount = currentPayload.items.length;

    // 4. Get last successful sync's payload snapshot
    const { data: lastSuccessSync } = await supabase
      .from("orderout_menu_syncs")
      .select("menu_payload_snapshot, items_synced")
      .eq("orderout_restaurant_id", restaurant.id)
      .eq("menu_id", menuId)
      .eq("sync_status", "success")
      .order("synced_at", { ascending: false })
      .limit(1)
      .single();

    // No previous sync = new menu
    if (!lastSuccessSync) {
      return {
        success: true,
        data: {
          hasChanges: true,
          isNewMenu: true,
          currentItemCount,
          lastSyncedItemCount: 0,
        },
        error: null,
      };
    }

    // 5. Compare using canonical stringify
    const lastSnapshot = lastSuccessSync.menu_payload_snapshot;
    const hasChanges =
      canonicalStringify(currentPayload) !== canonicalStringify(lastSnapshot);

    return {
      success: true,
      data: {
        hasChanges,
        isNewMenu: false,
        currentItemCount,
        lastSyncedItemCount: lastSuccessSync.items_synced ?? 0,
      },
      error: null,
    };
  } catch (error) {
    console.error("[checkMenuPayloadDiff] Exception:", error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Synced Menus (for OrderOut Tab)
// ============================================================================

export interface OrderOutSyncedMenu {
  menuId: string;
  menuName: string;
  ooMenuId: string;
  isActive: boolean;
  lastPushedAt: string | null;
  lastSyncStatus: string | null;
  itemsSynced: number;
}

/**
 * Get all menus synced to OrderOut for a location
 */
export async function getOrderOutSyncedMenus(
  clerkOrgId: string,
  locationId: string
): Promise<{
  success: boolean;
  data: OrderOutSyncedMenu[] | null;
  error: string | null;
}> {
  if (!clerkOrgId || !locationId) {
    return { success: false, data: null, error: "Missing required parameters" };
  }

  try {
    const supabase = createServerSupabaseClient();

    // Resolve merchant
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { success: false, data: null, error: "Merchant not found" };
    }

    // Get restaurant for this location
    const { data: restaurant } = await supabase
      .from("orderout_restaurants")
      .select("id")
      .eq("location_id", locationId)
      .single();

    if (!restaurant) {
      return { success: true, data: [], error: null };
    }

    // Get menu links
    const { data: links, error: linksError } = await supabase
      .from("orderout_menu_links")
      .select("menu_id, oo_menu_id, oo_menu_name, is_active, last_pushed_at, last_sync_id")
      .eq("orderout_restaurant_id", restaurant.id);

    if (linksError) {
      return { success: false, data: null, error: linksError.message };
    }

    if (!links || links.length === 0) {
      return { success: true, data: [], error: null };
    }

    // Fetch menu names
    const menuIds = links.map((l) => l.menu_id).filter(Boolean);
    const { data: menus } = await supabase
      .from("menus")
      .select("id, name")
      .in("id", menuIds);

    const menuNameMap = new Map(menus?.map((m) => [m.id, m.name]) || []);

    // Fetch latest sync status for each link
    const syncIds = links.map((l) => l.last_sync_id).filter(Boolean) as string[];
    const { data: syncs } = syncIds.length > 0
      ? await supabase
          .from("orderout_menu_syncs")
          .select("id, sync_status, items_synced")
          .in("id", syncIds)
      : { data: [] };

    const syncMap = new Map(syncs?.map((s) => [s.id, s]) || []);

    const result: OrderOutSyncedMenu[] = links.map((link) => {
      const sync = link.last_sync_id ? syncMap.get(link.last_sync_id) : null;
      return {
        menuId: link.menu_id,
        menuName: menuNameMap.get(link.menu_id) || link.oo_menu_name || "Unknown Menu",
        ooMenuId: link.oo_menu_id,
        isActive: link.is_active,
        lastPushedAt: link.last_pushed_at,
        lastSyncStatus: sync?.sync_status || null,
        itemsSynced: sync?.items_synced ?? 0,
      };
    });

    return { success: true, data: result, error: null };
  } catch (error) {
    console.error("[getOrderOutSyncedMenus] Exception:", error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Recent Orders (for OrderOut Tab)
// ============================================================================

export interface OrderOutRecentOrder {
  id: string;
  ooOrderNumber: string;
  deliveryPlatform: string;
  orderType: string;
  customerName: string | null;
  acceptStatus: string;
  platformTotal: number | null;
  createdAt: string;
}

/**
 * Get the last 10 delivery orders for a location
 */
export async function getRecentOrderOutOrders(
  clerkOrgId: string,
  locationId: string
): Promise<{
  success: boolean;
  data: OrderOutRecentOrder[] | null;
  error: string | null;
}> {
  if (!clerkOrgId || !locationId) {
    return { success: false, data: null, error: "Missing required parameters" };
  }

  try {
    const supabase = createServerSupabaseClient();

    // Resolve merchant
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { success: false, data: null, error: "Merchant not found" };
    }

    // Get restaurant for this location
    const { data: restaurant } = await supabase
      .from("orderout_restaurants")
      .select("id")
      .eq("location_id", locationId)
      .single();

    if (!restaurant) {
      return { success: true, data: [], error: null };
    }

    // Get last 10 orders
    const { data: orders, error: ordersError } = await supabase
      .from("orderout_orders")
      .select("id, oo_order_number, delivery_platform, order_type, customer_name, accept_status, platform_total, created_at")
      .eq("orderout_restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (ordersError) {
      return { success: false, data: null, error: ordersError.message };
    }

    const result: OrderOutRecentOrder[] = (orders || []).map((o) => ({
      id: o.id,
      ooOrderNumber: o.oo_order_number,
      deliveryPlatform: o.delivery_platform,
      orderType: o.order_type,
      customerName: o.customer_name,
      acceptStatus: o.accept_status,
      platformTotal: o.platform_total,
      createdAt: o.created_at,
    }));

    return { success: true, data: result, error: null };
  } catch (error) {
    console.error("[getRecentOrderOutOrders] Exception:", error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
