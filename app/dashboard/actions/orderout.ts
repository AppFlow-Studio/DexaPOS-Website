"use server";

// ============================================================================
// Merchant OrderOut Server Actions
// Description: Merchant dashboard actions for OrderOut onboarding and status
// ============================================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { LogAuditEvent } from "./audit-logs";
import {
  transformMenuToOrderOut,
  canonicalStringify,
  snoozeToSuspendUntil,
} from "@/lib/orderout/transform-menu";
import type { MenuWithCategories } from "@/types/menu";
import {
  extractConnectedPlatforms,
  extractChannelStatuses,
  normalizeDeliveryChannels,
  type PlatformChannelStatus,
} from "@/lib/orderout/helpers";
import { auth } from "@clerk/nextjs/server";

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
  channelsConfirmedByMerchant: string[];
  channelsConfirmedAt: string | null;
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
        "oo_account_id, oo_restaurant_id, status, is_accepting_orders, prep_time_minutes, connected_channels, auto_accept_orders, channels_confirmed_by_merchant, channels_confirmed_at"
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
        channelsConfirmedByMerchant:
          restaurant?.channels_confirmed_by_merchant ?? [],
        channelsConfirmedAt: restaurant?.channels_confirmed_at ?? null,
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
// Merchant Channel Self-Confirmation
// ============================================================================

export interface SetOrderOutChannelsConfirmedParams {
  clerkOrgId: string;
  locationId: string;
  confirmedChannels: string[]; // caller-normalized UPPERCASE enum list
}

/**
 * Merchant self-attests which delivery channels they have connected inside the
 * OrderOut dashboard. The resulting list is unioned with webhook-verified
 * channels (connected_channels) by the push guard and the UI, so merchants can
 * unblock "Push Menus to Channels" on a fresh install — before any webhook has
 * fired. Once a real webhook arrives, verified channels take visual precedence.
 */
export async function setOrderOutChannelsConfirmed(
  params: SetOrderOutChannelsConfirmedParams
): Promise<{
  success: boolean;
  data?: { channels: string[]; confirmedAt: string };
  error: string | null;
}> {
  const { clerkOrgId, locationId, confirmedChannels } = params;

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

    // Resolve orderout restaurant
    const { data: restaurant, error: restaurantError } = await supabase
      .from("orderout_restaurants")
      .select("id, oo_restaurant_id, channels_confirmed_by_merchant")
      .eq("location_id", locationId)
      .single();

    if (restaurantError || !restaurant) {
      return {
        success: false,
        error: "Location is not onboarded to OrderOut",
      };
    }

    // Normalize input against the canonical allowlist
    const normalized = normalizeDeliveryChannels(confirmedChannels);

    // Diff vs existing for audit metadata
    const previous = ((restaurant.channels_confirmed_by_merchant ?? []) as string[]).map(
      (c: string) => c.toUpperCase()
    );
    const previousSet = new Set(previous);
    const normalizedSet = new Set(normalized);
    const added = normalized.filter((c) => !previousSet.has(c));
    const removed = previous.filter((c) => !normalizedSet.has(c));

    // Clerk user id for attribution
    const { userId } = await auth();

    const confirmedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("orderout_restaurants")
      .update({
        channels_confirmed_by_merchant: normalized,
        channels_confirmed_at: confirmedAt,
        channels_confirmed_by_user_id: userId ?? null,
      })
      .eq("id", restaurant.id);

    if (updateError) {
      console.error(
        "[setOrderOutChannelsConfirmed] update failed:",
        updateError
      );
      return { success: false, error: updateError.message };
    }

    await LogAuditEvent({
      clerkOrgId,
      locationId,
      action: "confirmed_delivery_channels",
      actionCategory: "integrations",
      severity: "info",
      resourceType: "orderout_integration",
      resourceId: locationId,
      metadata: {
        before: previous,
        after: normalized,
        added,
        removed,
        oo_restaurant_id: restaurant.oo_restaurant_id,
      },
    });

    return {
      success: true,
      data: { channels: normalized, confirmedAt },
      error: null,
    };
  } catch (error) {
    console.error("[setOrderOutChannelsConfirmed] Exception:", error);
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
  /** Server-to-server (DB trigger / internal route): use the service-role client. */
  internal?: boolean;
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
    const supabase = params.internal
      ? createServiceRoleClient()
      : createServerSupabaseClient();

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

    // 5. Insert pending sync record — use service role to avoid RLS blocking the
    //    subsequent update. Also expire any stuck pending rows first so they
    //    don't freeze the status display.
    const serviceSupabase = createServiceRoleClient();
    const PENDING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const staleThreshold = new Date(Date.now() - PENDING_TIMEOUT_MS).toISOString();
    await serviceSupabase
      .from("orderout_menu_syncs")
      .update({ sync_status: "failed", error_details: "Timed out — previous push did not complete" })
      .eq("orderout_restaurant_id", restaurant.id)
      .eq("menu_id", menuId)
      .eq("sync_status", "pending")
      .lt("created_at", staleThreshold);

    const { data: syncData, error: syncInsertError } = await serviceSupabase
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

    // 7. Update sync record with result (service role — avoids RLS blocking the write)
    if (syncRecord?.id) {
      if (pushResponse.ok) {
        const { error: updateError } = await serviceSupabase
          .from("orderout_menu_syncs")
          .update({
            sync_status: "success",
            items_synced: itemCount,
            items_failed: 0,
            synced_at: new Date().toISOString(),
            ...(ooMenuId ? { oo_menu_id: ooMenuId } : {}),
          })
          .eq("id", syncRecord.id);

        if (updateError) {
          console.error("[pushMenuToOrderOut] Failed to update sync record to success:", updateError);
        }
      } else {
        const errorMsg =
          (pushResult.error as string) ||
          (pushResult.message as string) ||
          `OrderOut API returned ${pushResponse.status}`;
        const { error: updateError } = await serviceSupabase
          .from("orderout_menu_syncs")
          .update({
            sync_status: "failed",
            error_details: errorMsg,
            synced_at: new Date().toISOString(),
          })
          .eq("id", syncRecord.id);

        if (updateError) {
          console.error("[pushMenuToOrderOut] Failed to update sync record to failed:", updateError);
        }
      }
    } else {
      console.warn("[pushMenuToOrderOut] No sync record to update — insert failed earlier");
    }

    // 7b. Upsert orderout_menu_links after successful push
    if (pushResponse.ok && ooMenuId) {
      const { error: linkError } = await serviceSupabase
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
        await createServiceRoleClient()
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
  // Whether this menu is the canonical online-ordering menu for the location
  // (the single OrderOut push target for availability/86 re-pushes).
  isPrimaryOnlineMenu: boolean;
  // Per-platform delivery-channel status for this menu, from the menu link's
  // platform_statuses (populated by the push-menu webhook). Empty until a
  // channel callback lands.
  platformStatuses: PlatformChannelStatus[];
  // Platforms currently reporting "success" on the restaurant's
  // connected_channels — the channels a push would fan out to.
  connectedChannels: string[];
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
      .select("id, connected_channels")
      .eq("location_id", locationId)
      .single();

    if (!restaurant) {
      return {
        success: true,
        data: {
          lastSync: null,
          totalSyncs: 0,
          ooMenuId: null,
          isPrimaryOnlineMenu: false,
          platformStatuses: [],
          connectedChannels: [],
          syncHistory: [],
        },
        error: null,
      };
    }

    // Channels this restaurant would fan a push out to (reporting "success").
    const connectedChannels = extractConnectedPlatforms(
      restaurant.connected_channels
    );

    // 4a. Query orderout_menu_links for the canonical oo_menu_id + per-platform
    // push status for this menu.
    let ooMenuId: string | null = null;
    let isPrimaryOnlineMenu = false;
    let platformStatuses: PlatformChannelStatus[] = [];
    if (menuId) {
      const { data: link } = await supabase
        .from("orderout_menu_links")
        .select("oo_menu_id, platform_statuses, is_primary")
        .eq("orderout_restaurant_id", restaurant.id)
        .eq("menu_id", menuId)
        .eq("is_active", true)
        .single();
      ooMenuId = link?.oo_menu_id || null;
      isPrimaryOnlineMenu = link?.is_primary ?? false;
      platformStatuses = extractChannelStatuses(link?.platform_statuses);
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

    // Treat pending rows older than 5 minutes as stuck — skip them for lastSync
    // so a crashed push doesn't freeze the status display.
    const PENDING_TIMEOUT_MS = 5 * 60 * 1000;
    const latestSync =
      filteredSyncs.find((s) => {
        if (s.sync_status !== "pending") return true;
        return Date.now() - new Date(s.created_at).getTime() < PENDING_TIMEOUT_MS;
      }) ?? null;

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
        isPrimaryOnlineMenu,
        platformStatuses,
        connectedChannels,
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

export interface OrderOutWebhookHealth {
  /** The restaurant's oo_restaurant_id, or null if not onboarded. */
  ooRestaurantId: string | null;
  /**
   * Most recent time OrderOut delivered a push_menu result for this
   * restaurant. Derived from the max platform_statuses.last_updated across the
   * restaurant's menu links — bumped by both correlated and orphan callbacks.
   */
  lastResultReceivedAt: string | null;
  /** Any delivery platform currently reporting "success". */
  anyChannelLive: boolean;
  /** Unresolved push_menu dead-letters attributed to this restaurant. */
  dlqCount: number;
}

/**
 * Merchant-scoped health of the OrderOut push_menu webhook for a location:
 * is OrderOut delivering results, when was the last one, and are any callbacks
 * failing into the dead-letter queue. Scoped strictly to the merchant's own
 * restaurant — unlike the HQ-gated getOrderOutPushMenuWebhookStatus.
 */
export async function getOrderOutWebhookHealth(
  clerkOrgId: string,
  locationId: string
): Promise<{
  success: boolean;
  data: OrderOutWebhookHealth | null;
  error: string | null;
}> {
  if (!clerkOrgId || !locationId) {
    return { success: false, data: null, error: "Missing required parameters" };
  }

  try {
    const supabase = createServerSupabaseClient();

    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { success: false, data: null, error: "Merchant not found" };
    }

    const { data: restaurant } = await supabase
      .from("orderout_restaurants")
      .select("id, oo_restaurant_id, connected_channels")
      .eq("location_id", locationId)
      .single();

    if (!restaurant) {
      return {
        success: true,
        data: {
          ooRestaurantId: null,
          lastResultReceivedAt: null,
          anyChannelLive: false,
          dlqCount: 0,
        },
        error: null,
      };
    }

    // Max platform_statuses.last_updated across this restaurant's menu links.
    // Both the correlated and orphan webhook paths merge platform_statuses, so
    // this timestamp advances on every result OrderOut delivers.
    const { data: links } = await supabase
      .from("orderout_menu_links")
      .select("platform_statuses")
      .eq("orderout_restaurant_id", restaurant.id);

    let lastResultReceivedAt: string | null = null;
    for (const link of links ?? []) {
      for (const s of extractChannelStatuses(link.platform_statuses)) {
        if (
          s.last_updated &&
          (!lastResultReceivedAt || s.last_updated > lastResultReceivedAt)
        ) {
          lastResultReceivedAt = s.last_updated;
        }
      }
    }

    const anyChannelLive =
      extractConnectedPlatforms(restaurant.connected_channels).length > 0;

    // Unresolved push_menu dead-letters attributed to this restaurant.
    let dlqCount = 0;
    if (restaurant.oo_restaurant_id) {
      const { count } = await supabase
        .from("webhook_dead_letter_queue")
        .select("id", { count: "exact", head: true })
        .eq("source", "orderout")
        .in("event_type", ["push_menu", "push_menu_channels"])
        .eq("status", "pending")
        .filter(
          "raw_payload->>restaurant_id",
          "eq",
          String(restaurant.oo_restaurant_id)
        );
      dlqCount = count ?? 0;
    }

    return {
      success: true,
      data: {
        ooRestaurantId: restaurant.oo_restaurant_id ?? null,
        lastResultReceivedAt,
        anyChannelLive,
        dlqCount,
      },
      error: null,
    };
  } catch (error) {
    console.error("[getOrderOutWebhookHealth] Exception:", error);
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

// ============================================================================
// Push Menu to Connected Delivery Channels
// ============================================================================

export interface PushMenuToChannelsParams {
  clerkOrgId: string;
  menuId: string;
  locationId: string;
  /**
   * Skip the 30s cooldown + 5/hour ceiling. Used for availability-only re-pushes
   * (86ing) where propagating an out-of-stock change promptly matters more than
   * throttling. Human-triggered menu pushes still get the throttles.
   */
  skipCooldown?: boolean;
  /**
   * Server-to-server invocation (DB trigger / internal route) with no Clerk
   * session: use the service-role client and a null audit actor.
   */
  internal?: boolean;
}

export interface PushMenuToChannelsResult {
  syncId: string;
  ooMenuId: string;
  expectedChannels: string[];
  triggeredAt: string;
}

const PUSH_CHANNELS_COOLDOWN_SECONDS = 30;
const PUSH_CHANNELS_HOURLY_LIMIT = 5;

/**
 * Resolve the canonical online-ordering menu link for an OrderOut restaurant.
 * OrderOut serves one menu per store, so availability re-pushes (86ing) target
 * this single link. Prefers the primary flag; falls back to the single / most-
 * recent active link so pre-backfill or freshly-linked restaurants still work.
 * Returns null when the restaurant has no active link.
 */
export async function resolvePrimaryOnlineMenu(
  client: ReturnType<typeof createServiceRoleClient>,
  orderoutRestaurantId: string,
): Promise<{ menu_id: string; oo_menu_id: string | null } | null> {
  const { data: primary } = await client
    .from("orderout_menu_links")
    .select("menu_id, oo_menu_id")
    .eq("orderout_restaurant_id", orderoutRestaurantId)
    .eq("is_active", true)
    .eq("is_primary", true)
    .maybeSingle();
  if (primary) return primary;

  const { data: fallback } = await client
    .from("orderout_menu_links")
    .select("menu_id, oo_menu_id")
    .eq("orderout_restaurant_id", orderoutRestaurantId)
    .eq("is_active", true)
    .order("last_pushed_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (fallback) {
    console.warn(
      `[orderout] no primary online menu for restaurant ${orderoutRestaurantId}; using most-recent active link (menu ${fallback.menu_id})`,
    );
    return fallback;
  }
  return null;
}

/**
 * Designate a menu as the location's canonical online-ordering menu (the single
 * OrderOut push target for availability/86 re-pushes). The menu must already be
 * linked + active on OrderOut; the swap is atomic in set_primary_online_menu_v1.
 */
export async function setPrimaryOnlineMenu(
  clerkOrgId: string,
  locationId: string,
  menuId: string,
): Promise<{ success: boolean; error: string | null }> {
  if (!clerkOrgId || !locationId || !menuId) {
    return { success: false, error: "Missing required parameters" };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("set_primary_online_menu_v1", {
    p_location_id: locationId,
    p_menu_id: menuId,
  });
  if (error) return { success: false, error: error.message };

  const { data: menu } = await supabase
    .from("menus")
    .select("name")
    .eq("id", menuId)
    .maybeSingle();

  await LogAuditEvent({
    clerkOrgId,
    locationId,
    action: `Set OrderOut online menu: ${menu?.name ?? menuId}`,
    actionCategory: "integrations",
    severity: "info",
    resourceType: "menu",
    resourceId: menuId,
    resourceName: menu?.name ?? undefined,
    metadata: { orderout: true },
  });

  return { success: true, error: null };
}

/**
 * The location's canonical online menu + all its active-linked menus, for
 * surfacing the designation on the menus list. Empty when the location isn't
 * onboarded to OrderOut.
 */
export async function getLocationOnlineMenu(
  clerkOrgId: string,
  locationId: string,
): Promise<{ primaryMenuId: string | null; linkedMenuIds: string[] }> {
  if (!clerkOrgId || !locationId || locationId === "all") {
    return { primaryMenuId: null, linkedMenuIds: [] };
  }

  const supabase = createServerSupabaseClient();
  const { data: restaurant } = await supabase
    .from("orderout_restaurants")
    .select("id")
    .eq("location_id", locationId)
    .maybeSingle();
  if (!restaurant) return { primaryMenuId: null, linkedMenuIds: [] };

  const { data: links } = await supabase
    .from("orderout_menu_links")
    .select("menu_id, is_primary")
    .eq("orderout_restaurant_id", restaurant.id)
    .eq("is_active", true);

  const rows = links ?? [];
  return {
    primaryMenuId: rows.find((l) => l.is_primary)?.menu_id ?? null,
    linkedMenuIds: rows.map((l) => l.menu_id),
  };
}

// ============================================================================
// Surgical per-item suspension (86 fast-path)
// ----------------------------------------------------------------------------
// OrderOut exposes a per-item "out of stock" toggle:
//   PUT /pos/restaurant/{restaurant}/menu/{oo_menu}/item/{item}/suspension
//   body: { suspend_until: <unix SECONDS> }   // 0 restores availability
// Because our menu_item.id is pushed verbatim as the OrderOut item id (see
// transform-menu.ts) and the snooze already maps 1:1 to Uber's suspend_until,
// a single 86/restore becomes ONE surgical PUT — no full menu rebuild and no
// push_menu channel fan-out. OrderOut propagates the suspension to the connected
// marketplaces itself.
//
// NOTE: this is items-only. OrderOut has no per-modifier suspension endpoint yet,
// so modifier 86ing stays on the full-menu resync path (see item-snooze.ts).
// ============================================================================

export interface SuspendOrderOutItemParams {
  clerkOrgId: string;
  locationId: string;
  /** menu_items.id — pushed verbatim as the OrderOut item id. */
  menuItemId: string;
  /** location_item_overrides.snoozed_until: ISO | "infinity" | null (restore). */
  snoozedUntil: string | null;
  /** Server-to-server (DB trigger / POS-origin route): use the service-role client. */
  internal?: boolean;
}

export interface SuspendOrderOutItemResult {
  success: boolean;
  /**
   * True when we couldn't take the surgical path because the location's menu
   * isn't live on OrderOut yet (no oo_menu_id). The caller should fall back to a
   * full push, which stages the menu with suspension_info already embedded.
   */
  skipped?: boolean;
  /**
   * The canonical online menu id the suspension was applied to (present on
   * success). Lets the caller fan the change out to connected channels without
   * re-resolving the link.
   */
  menuId?: string;
  error: string | null;
}

/**
 * Mark a single item out-of-stock (or restore it) on OrderOut via the per-item
 * suspension endpoint. Best-effort and self-contained: resolves the restaurant +
 * canonical online menu, computes suspend_until from the snooze, and PUTs.
 * Returns `skipped: true` (not an error) when the menu isn't live yet so the
 * caller can fall back to a full push.
 */
export async function suspendOrderOutItem(
  params: SuspendOrderOutItemParams
): Promise<SuspendOrderOutItemResult> {
  const { clerkOrgId, locationId, menuItemId, snoozedUntil, internal = false } =
    params;

  if (!clerkOrgId || !locationId || !menuItemId) {
    return { success: false, error: "Missing required parameters" };
  }

  try {
    const supabase = internal
      ? createServiceRoleClient()
      : createServerSupabaseClient();

    // Resolve the OrderOut restaurant (must be active).
    const { data: restaurant } = await supabase
      .from("orderout_restaurants")
      .select("id, oo_restaurant_id, status")
      .eq("location_id", locationId)
      .maybeSingle();

    if (!restaurant?.oo_restaurant_id || restaurant.status !== "active") {
      return { success: false, skipped: true, error: null };
    }

    // OrderOut serves one menu per store — target only the canonical online menu.
    const online = await resolvePrimaryOnlineMenu(
      createServiceRoleClient(),
      restaurant.id
    );
    if (!online?.oo_menu_id) {
      // Menu never pushed / no OrderOut menu id yet — nothing to suspend against.
      return { success: false, skipped: true, error: null };
    }

    const orderOutApiUrl = process.env.NEXT_PUBLIC_ORDEROUT_API_URL;
    const orderOutApiKey = process.env.ORDEROUT_API_KEY;
    if (!orderOutApiUrl || !orderOutApiKey) {
      return { success: false, error: "OrderOut API configuration missing" };
    }

    // suspend_until: unix seconds while snoozed, 0 to restore (available).
    const suspendUntil = snoozeToSuspendUntil(snoozedUntil) ?? 0;

    const url = `${orderOutApiUrl}/pos/restaurant/${restaurant.oo_restaurant_id}/menu/${online.oo_menu_id}/item/${menuItemId}/suspension`;

    let httpStatus = 0;
    let errMsg: string | null = null;
    try {
      const resp = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "api-key": orderOutApiKey,
        },
        body: JSON.stringify({ suspend_until: suspendUntil }),
      });
      httpStatus = resp.status;
      if (!resp.ok) {
        try {
          const body = await resp.json();
          errMsg =
            (body?.error as string) ||
            (body?.message as string) ||
            `OrderOut API returned ${resp.status}`;
        } catch {
          errMsg = `OrderOut API returned ${resp.status}`;
        }
      }
    } catch (e) {
      errMsg = e instanceof Error ? e.message : "Network error";
    }

    const ok = httpStatus >= 200 && httpStatus < 300;

    await LogAuditEvent({
      clerkOrgId,
      locationId,
      action: ok
        ? "orderout_item_suspension"
        : "orderout_item_suspension_failed",
      actionCategory: "integrations",
      severity: ok ? "info" : "warning",
      resourceType: "menu_item",
      resourceId: menuItemId,
      metadata: {
        oo_restaurant_id: restaurant.oo_restaurant_id,
        oo_menu_id: online.oo_menu_id,
        suspend_until: suspendUntil,
        restored: suspendUntil === 0,
        http_status: httpStatus,
        ...(errMsg ? { error_message: errMsg } : {}),
      },
    });

    if (!ok) {
      return { success: false, error: errMsg ?? "Failed to suspend item" };
    }

    return { success: true, menuId: online.menu_id, error: null };
  } catch (error) {
    console.error("[suspendOrderOutItem] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Push an already-synced menu to all connected delivery channels via OrderOut's
 * async fan-out endpoint. Per-service results come back via
 * orderout-push-menu-webhook.
 */
export async function pushMenuToConnectedChannels(
  params: PushMenuToChannelsParams
): Promise<{
  success: boolean;
  data?: PushMenuToChannelsResult;
  error: string | null;
}> {
  const { clerkOrgId, menuId, locationId, skipCooldown = false, internal = false } = params;

  if (!clerkOrgId || !menuId || !locationId) {
    return { success: false, error: "Missing required parameters" };
  }

  try {
    const supabase = internal
      ? createServiceRoleClient()
      : createServerSupabaseClient();

    // Best-effort reconcile of stuck rows. Never fail the action on reconcile error.
    try {
      const { error: reconcileError } = await supabase.rpc(
        "reconcile_stuck_push_channels_syncs",
        { p_stale_minutes: 5 }
      );
      if (reconcileError) {
        console.warn(
          "[pushMenuToConnectedChannels] reconcile error (non-fatal):",
          reconcileError.message
        );
      }
    } catch (e) {
      console.warn("[pushMenuToConnectedChannels] reconcile threw (non-fatal):", e);
    }

    // Clerk user id for audit + trigger tracking (none for server-to-server)
    const { userId: clerkUserId } = internal
      ? { userId: null }
      : await auth();

    // Resolve merchant
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { success: false, error: "Merchant not found" };
    }

    // Resolve OrderOut restaurant for the location
    const { data: restaurant, error: restaurantError } = await supabase
      .from("orderout_restaurants")
      .select(
        "id, oo_restaurant_id, connected_channels, channels_confirmed_by_merchant"
      )
      .eq("location_id", locationId)
      .single();

    if (restaurantError || !restaurant?.oo_restaurant_id) {
      return {
        success: false,
        error: "Location is not onboarded to OrderOut",
      };
    }

    // Resolve the menu link (must exist + active + have oo_menu_id)
    const { data: link, error: linkError } = await supabase
      .from("orderout_menu_links")
      .select("id, oo_menu_id")
      .eq("orderout_restaurant_id", restaurant.id)
      .eq("menu_id", menuId)
      .eq("is_active", true)
      .single();

    if (linkError || !link?.oo_menu_id) {
      return {
        success: false,
        error: "Menu has not been uploaded to OrderOut yet",
      };
    }

    // Expected channels — union of webhook-verified + merchant self-confirmed.
    // Merchants can self-attest to avoid the chicken-and-egg problem on fresh
    // installs where no webhook has fired yet. Once a real webhook arrives the
    // verified set grows organically via merge_orderout_connected_channels.
    const verified = extractConnectedPlatforms(restaurant.connected_channels);
    const confirmed = ((restaurant.channels_confirmed_by_merchant ?? []) as string[]).map(
      (c: string) => c.toUpperCase()
    );
    const expectedChannels = Array.from(new Set([...verified, ...confirmed]));

    if (expectedChannels.length === 0) {
      return {
        success: false,
        error:
          "No connected delivery channels. Confirm your platforms in the OrderOut tab first.",
      };
    }

    // Availability-only re-pushes (86ing) skip both throttles so out-of-stock
    // changes propagate promptly. Human-triggered pushes keep the throttles.
    if (!skipCooldown) {
    // Rate limit — 30-second cooldown
    const cooldownSince = new Date(
      Date.now() - PUSH_CHANNELS_COOLDOWN_SECONDS * 1000
    ).toISOString();
    const { count: recentCount, error: recentErr } = await supabase
      .from("orderout_menu_syncs")
      .select("id", { head: true, count: "exact" })
      .eq("orderout_restaurant_id", restaurant.id)
      .eq("menu_id", menuId)
      .eq("sync_direction", "push_channels")
      .gte("created_at", cooldownSince);

    if (recentErr) {
      console.warn(
        "[pushMenuToConnectedChannels] cooldown query failed:",
        recentErr.message
      );
    } else if ((recentCount ?? 0) >= 1) {
      await LogAuditEvent({
        clerkOrgId,
        locationId,
        action: "pushed_menu_to_channels_rate_limited",
        actionCategory: "integrations",
        severity: "warning",
        resourceType: "menu",
        resourceId: menuId,
        metadata: {
          cooldown_seconds: PUSH_CHANNELS_COOLDOWN_SECONDS,
          trigger: "merchant",
        },
      });
      return {
        success: false,
        error: `Please wait ${PUSH_CHANNELS_COOLDOWN_SECONDS} seconds between pushes.`,
      };
    }

    // Rate limit — 5/hour ceiling
    const hourSince = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: hourlyCount, error: hourlyErr } = await supabase
      .from("orderout_menu_syncs")
      .select("id", { head: true, count: "exact" })
      .eq("orderout_restaurant_id", restaurant.id)
      .eq("menu_id", menuId)
      .eq("sync_direction", "push_channels")
      .gte("created_at", hourSince);

    if (hourlyErr) {
      console.warn(
        "[pushMenuToConnectedChannels] hourly query failed:",
        hourlyErr.message
      );
    } else if ((hourlyCount ?? 0) >= PUSH_CHANNELS_HOURLY_LIMIT) {
      await LogAuditEvent({
        clerkOrgId,
        locationId,
        action: "pushed_menu_to_channels_rate_limited",
        actionCategory: "integrations",
        severity: "warning",
        resourceType: "menu",
        resourceId: menuId,
        metadata: {
          hourly_count: hourlyCount,
          hourly_limit: PUSH_CHANNELS_HOURLY_LIMIT,
          trigger: "merchant",
        },
      });
      return {
        success: false,
        error: `Hourly push limit reached (${PUSH_CHANNELS_HOURLY_LIMIT}). Try again later.`,
      };
    }
    } // end !skipCooldown throttles

    // Insert the sync row (pending)
    const { data: syncRow, error: insertErr } = await supabase
      .from("orderout_menu_syncs")
      .insert({
        orderout_restaurant_id: restaurant.id,
        menu_id: menuId,
        oo_menu_id: link.oo_menu_id,
        sync_direction: "push_channels",
        sync_status: "pending",
        expected_channels: expectedChannels,
        pushed_to_channels: [],
        trigger_source: "merchant",
        triggered_by_user_id: clerkUserId ?? null,
        menu_payload_snapshot: {
          trigger: "push_channels",
          expected_channels: expectedChannels,
          oo_menu_id: link.oo_menu_id,
        },
      })
      .select("id")
      .single();

    if (insertErr || !syncRow) {
      console.error(
        "[pushMenuToConnectedChannels] insert sync failed:",
        insertErr
      );
      return { success: false, error: "Failed to create sync record" };
    }

    // Call OrderOut's async fan-out endpoint
    const orderOutApiUrl = process.env.NEXT_PUBLIC_ORDEROUT_API_URL;
    const orderOutApiKey = process.env.ORDEROUT_API_KEY;
    if (!orderOutApiUrl || !orderOutApiKey) {
      await supabase
        .from("orderout_menu_syncs")
        .update({
          sync_status: "failed",
          error_details: "OrderOut API configuration missing",
          synced_at: new Date().toISOString(),
        })
        .eq("id", syncRow.id);
      return { success: false, error: "OrderOut API configuration missing" };
    }

    const triggeredAt = new Date().toISOString();
    const pushUrl = `${orderOutApiUrl}/pos/restaurant/${restaurant.oo_restaurant_id}/push_menu/${link.oo_menu_id}`;

    let httpStatus = 0;
    let errMsg: string | null = null;
    try {
      const resp = await fetch(pushUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": orderOutApiKey,
        },
      });
      httpStatus = resp.status;
      if (!resp.ok) {
        try {
          const body = await resp.json();
          errMsg =
            (body?.error as string) ||
            (body?.message as string) ||
            `OrderOut API returned ${resp.status}`;
        } catch {
          errMsg = `OrderOut API returned ${resp.status}`;
        }
      }
    } catch (e) {
      errMsg = e instanceof Error ? e.message : "Network error";
    }

    if (httpStatus >= 200 && httpStatus < 300) {
      // 2xx — move the row to syncing and await webhook callbacks
      const { error: updErr } = await supabase
        .from("orderout_menu_syncs")
        .update({ sync_status: "syncing" })
        .eq("id", syncRow.id);
      if (updErr) {
        console.warn(
          "[pushMenuToConnectedChannels] failed to mark syncing:",
          updErr.message
        );
      }

      await LogAuditEvent({
        clerkOrgId,
        locationId,
        action: "pushed_menu_to_channels",
        actionCategory: "integrations",
        severity: "info",
        resourceType: "menu",
        resourceId: menuId,
        metadata: {
          sync_id: syncRow.id,
          oo_menu_id: link.oo_menu_id,
          oo_restaurant_id: restaurant.oo_restaurant_id,
          expected_channels: expectedChannels,
          verified_channels: verified,
          self_confirmed_channels: confirmed,
          trigger: "merchant",
        },
      });

      return {
        success: true,
        data: {
          syncId: syncRow.id,
          ooMenuId: link.oo_menu_id,
          expectedChannels,
          triggeredAt,
        },
        error: null,
      };
    }

    // Non-2xx — mark failed + audit
    await supabase
      .from("orderout_menu_syncs")
      .update({
        sync_status: "failed",
        error_details: errMsg ?? "Unknown error",
        synced_at: new Date().toISOString(),
      })
      .eq("id", syncRow.id);

    await LogAuditEvent({
      clerkOrgId,
      locationId,
      action: "pushed_menu_to_channels_failed",
      actionCategory: "integrations",
      severity: "warning",
      resourceType: "menu",
      resourceId: menuId,
      metadata: {
        sync_id: syncRow.id,
        oo_menu_id: link.oo_menu_id,
        oo_restaurant_id: restaurant.oo_restaurant_id,
        http_status: httpStatus,
        error_message: errMsg,
        trigger: "merchant",
      },
    });

    return { success: false, error: errMsg ?? "Failed to push to channels" };
  } catch (error) {
    console.error("[pushMenuToConnectedChannels] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Push-Channels History + Live Status
// ============================================================================

export interface PushChannelsHistoryEntry {
  syncId: string;
  menuId: string | null;
  menuName: string | null;
  ooMenuId: string | null;
  syncStatus: string;
  expectedChannels: string[];
  pushedToChannels: string[];
  triggerSource: string | null;
  triggeredByUserId: string | null;
  createdAt: string;
  syncedAt: string | null;
  errorDetails: unknown;
  perChannelResults: Array<{
    deliveryService: string;
    status: string;
    statusCode: number | null;
    errorMessage: string | null;
    rawResponse: unknown;
    receivedAt: string;
  }>;
}

export async function getPushChannelsHistory(
  clerkOrgId: string,
  locationId: string,
  opts?: { menuId?: string; limit?: number }
): Promise<{
  success: boolean;
  data: PushChannelsHistoryEntry[] | null;
  error: string | null;
}> {
  if (!clerkOrgId || !locationId) {
    return { success: false, data: null, error: "Missing required parameters" };
  }

  try {
    const supabase = createServerSupabaseClient();

    // Resolve merchant (for auth scoping via RLS)
    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();

    if (merchantError || !merchant) {
      return { success: false, data: null, error: "Merchant not found" };
    }

    // Resolve restaurant
    const { data: restaurant } = await supabase
      .from("orderout_restaurants")
      .select("id")
      .eq("location_id", locationId)
      .single();

    if (!restaurant) {
      return { success: true, data: [], error: null };
    }

    const limit = opts?.limit ?? 25;

    let query = supabase
      .from("orderout_menu_syncs")
      .select(
        "id, menu_id, oo_menu_id, sync_status, expected_channels, pushed_to_channels, trigger_source, triggered_by_user_id, created_at, synced_at, error_details"
      )
      .eq("orderout_restaurant_id", restaurant.id)
      .eq("sync_direction", "push_channels")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (opts?.menuId) {
      query = query.eq("menu_id", opts.menuId);
    }

    const { data: rows, error: rowsErr } = await query;
    if (rowsErr) {
      return { success: false, data: null, error: rowsErr.message };
    }
    if (!rows || rows.length === 0) {
      return { success: true, data: [], error: null };
    }

    // Fetch per-channel results
    const syncIds = rows.map((r) => r.id);
    const { data: results } = await supabase
      .from("orderout_menu_sync_results")
      .select(
        "sync_id, delivery_service, status, status_code, error_message, raw_response, received_at"
      )
      .in("sync_id", syncIds);

    const resultsBySyncId = new Map<
      string,
      PushChannelsHistoryEntry["perChannelResults"]
    >();
    for (const r of results || []) {
      const list = resultsBySyncId.get(r.sync_id) ?? [];
      list.push({
        deliveryService: r.delivery_service,
        status: r.status,
        statusCode: r.status_code ?? null,
        errorMessage: r.error_message ?? null,
        rawResponse: r.raw_response,
        receivedAt: r.received_at,
      });
      resultsBySyncId.set(r.sync_id, list);
    }

    // Fetch menu names
    const menuIds = Array.from(
      new Set(rows.map((r) => r.menu_id).filter(Boolean) as string[])
    );
    const { data: menus } =
      menuIds.length > 0
        ? await supabase.from("menus").select("id, name").in("id", menuIds)
        : { data: [] as { id: string; name: string }[] };

    const menuNameById = new Map(menus?.map((m) => [m.id, m.name]) || []);

    const entries: PushChannelsHistoryEntry[] = rows.map((r) => ({
      syncId: r.id,
      menuId: r.menu_id || null,
      menuName: r.menu_id ? menuNameById.get(r.menu_id) ?? null : null,
      ooMenuId: r.oo_menu_id || null,
      syncStatus: r.sync_status,
      expectedChannels: (r.expected_channels as string[] | null) ?? [],
      pushedToChannels: (r.pushed_to_channels as string[] | null) ?? [],
      triggerSource: r.trigger_source ?? null,
      triggeredByUserId: r.triggered_by_user_id ?? null,
      createdAt: r.created_at,
      syncedAt: r.synced_at ?? null,
      errorDetails: r.error_details,
      perChannelResults: resultsBySyncId.get(r.id) ?? [],
    }));

    return { success: true, data: entries, error: null };
  } catch (error) {
    console.error("[getPushChannelsHistory] Exception:", error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export interface PushChannelsLiveStatus {
  syncId: string;
  syncStatus: string;
  expectedChannels: string[];
  reportedChannels: string[];
  lastUpdatedAt: string;
}

export async function getPushChannelsLiveStatus(
  clerkOrgId: string,
  syncId: string
): Promise<{
  success: boolean;
  data: PushChannelsLiveStatus | null;
  error: string | null;
}> {
  if (!clerkOrgId || !syncId) {
    return { success: false, data: null, error: "Missing required parameters" };
  }

  try {
    const supabase = createServerSupabaseClient();

    // Merchant scoping is handled by RLS on orderout_menu_syncs
    const { data: row, error: rowErr } = await supabase
      .from("orderout_menu_syncs")
      .select(
        "id, sync_status, expected_channels, pushed_to_channels, synced_at, created_at"
      )
      .eq("id", syncId)
      .single();

    if (rowErr || !row) {
      return { success: false, data: null, error: "Sync not found" };
    }

    return {
      success: true,
      data: {
        syncId: row.id,
        syncStatus: row.sync_status,
        expectedChannels: (row.expected_channels as string[] | null) ?? [],
        reportedChannels: (row.pushed_to_channels as string[] | null) ?? [],
        lastUpdatedAt: row.synced_at ?? row.created_at,
      },
      error: null,
    };
  } catch (error) {
    console.error("[getPushChannelsLiveStatus] Exception:", error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
