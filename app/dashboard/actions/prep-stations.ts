"use server";

// ============================================================================
// Prep Stations Server Actions
// Description: CRUD operations for location-scoped prep stations
//              and category-level prep station defaults
// ============================================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";

// ============================================================================
// Types
// ============================================================================

export interface PrepStation {
  id: string;
  merchant_id: string;
  location_id: string;
  name: string;
  color: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PrepStationWithCount extends PrepStation {
  item_count: number;
}

export interface CategoryPrepDefault {
  id: string;
  location_id: string;
  category_id: string;
  prep_station_id: string;
  merchant_id: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  prep_station_name?: string;
  prep_station_color?: string;
  category_name?: string;
}

export interface CreatePrepStationInput {
  locationId: string;
  name: string;
  color?: string;
}

export interface UpdatePrepStationInput {
  name?: string;
  color?: string;
  display_order?: number;
  is_active?: boolean;
}

// ============================================================================
// Helper: Get merchant_id from clerkOrgId
// ============================================================================

async function getMerchantId(clerkOrgId: string) {
  const supabase = createServerSupabaseClient();
  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (error || !merchant) {
    console.error("[PrepStations] Error getting merchant:", error);
    return null;
  }

  return merchant.id as string;
}

// ============================================================================
// GET — List active prep stations for a location (with item counts)
// ============================================================================

export async function getPrepStationsForLocation(locationId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("prep_stations")
      .select("*")
      .eq("location_id", locationId)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("[getPrepStationsForLocation] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    // Get item counts per station
    const stationIds = (data || []).map((s) => s.id);
    let itemCounts: Record<string, number> = {};

    if (stationIds.length > 0) {
      const { data: counts, error: countError } = await supabase
        .from("location_item_overrides")
        .select("prep_station_id")
        .in("prep_station_id", stationIds)
        .not("prep_station_id", "is", null);

      if (!countError && counts) {
        for (const row of counts) {
          if (row.prep_station_id) {
            itemCounts[row.prep_station_id] =
              (itemCounts[row.prep_station_id] || 0) + 1;
          }
        }
      }
    }

    const stationsWithCounts: PrepStationWithCount[] = (data || []).map(
      (station) => ({
        ...station,
        item_count: itemCounts[station.id] || 0,
      }),
    );

    return { success: true, data: stationsWithCounts, error: null };
  } catch (error) {
    console.error("[getPrepStationsForLocation] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// CREATE — Create a new prep station
// ============================================================================

export async function createPrepStation(
  clerkOrgId: string,
  input: CreatePrepStationInput,
) {
  try {
    const supabase = createServerSupabaseClient();
    const merchantId = await getMerchantId(clerkOrgId);

    if (!merchantId) {
      return { success: false, error: "Merchant not found", data: null };
    }

    // Get next display order
    const { data: existing } = await supabase
      .from("prep_stations")
      .select("display_order")
      .eq("location_id", input.locationId)
      .order("display_order", { ascending: false })
      .limit(1);

    const nextOrder =
      existing && existing.length > 0 ? existing[0].display_order + 1 : 0;

    const { data, error } = await supabase
      .from("prep_stations")
      .insert({
        merchant_id: merchantId,
        location_id: input.locationId,
        name: input.name.trim(),
        color: input.color || "#3B82F6",
        display_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return {
          success: false,
          error: `A prep station named "${input.name.trim()}" already exists at this location`,
          data: null,
        };
      }
      console.error("[createPrepStation] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    LogAuditEvent({
      merchantId,
      locationId: input.locationId,
      action: `Created Prep Station: ${input.name.trim()}`,
      actionCategory: "settings",
      resourceType: "prep_station",
      resourceId: data.id,
      resourceName: input.name.trim(),
      changes: {
        after: { name: input.name.trim(), color: input.color || "#3B82F6" },
      },
    });

    return { success: true, data: data as PrepStation, error: null };
  } catch (error) {
    console.error("[createPrepStation] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// UPDATE — Update a prep station
// ============================================================================

export async function updatePrepStation(
  stationId: string,
  input: UpdatePrepStationInput,
) {
  try {
    const supabase = createServerSupabaseClient();

    // Fetch before state
    const { data: before } = await supabase
      .from("prep_stations")
      .select("*")
      .eq("id", stationId)
      .single();

    if (!before) {
      return { success: false, error: "Prep station not found", data: null };
    }

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name.trim();
    if (input.color !== undefined) updateData.color = input.color;
    if (input.display_order !== undefined)
      updateData.display_order = input.display_order;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;

    const { data, error } = await supabase
      .from("prep_stations")
      .update(updateData)
      .eq("id", stationId)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return {
          success: false,
          error: `A prep station named "${input.name?.trim()}" already exists at this location`,
          data: null,
        };
      }
      console.error("[updatePrepStation] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    LogAuditEvent({
      merchantId: before.merchant_id,
      locationId: before.location_id,
      action: `Updated Prep Station: ${data.name}`,
      actionCategory: "settings",
      resourceType: "prep_station",
      resourceId: stationId,
      resourceName: data.name,
      changes: {
        before: {
          name: before.name,
          color: before.color,
          is_active: before.is_active,
        },
        after: updateData,
      },
    });

    return { success: true, data: data as PrepStation, error: null };
  } catch (error) {
    console.error("[updatePrepStation] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// DELETE — Delete a prep station
// ============================================================================

export async function deletePrepStation(stationId: string) {
  try {
    const supabase = createServerSupabaseClient();

    // Fetch before deleting (for audit log)
    const { data: before } = await supabase
      .from("prep_stations")
      .select("*")
      .eq("id", stationId)
      .single();

    if (!before) {
      return { success: false, error: "Prep station not found" };
    }

    const { error } = await supabase
      .from("prep_stations")
      .delete()
      .eq("id", stationId);

    if (error) {
      console.error("[deletePrepStation] Error:", error);
      return { success: false, error: error.message };
    }

    LogAuditEvent({
      merchantId: before.merchant_id,
      locationId: before.location_id,
      action: `Deleted Prep Station: ${before.name}`,
      actionCategory: "settings",
      severity: "warning",
      resourceType: "prep_station",
      resourceId: stationId,
      resourceName: before.name,
      changes: {
        before: { name: before.name, color: before.color },
      },
    });

    return { success: true, error: null };
  } catch (error) {
    console.error("[deletePrepStation] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// REORDER — Batch update display_order
// ============================================================================

export async function reorderPrepStations(
  stationIds: string[],
  locationId: string,
) {
  try {
    const supabase = createServerSupabaseClient();

    // Update each station's display_order based on position in array
    const updates = stationIds.map((id, index) =>
      supabase
        .from("prep_stations")
        .update({ display_order: index })
        .eq("id", id)
        .eq("location_id", locationId),
    );

    const results = await Promise.all(updates);
    const failedUpdate = results.find((r) => r.error);

    if (failedUpdate?.error) {
      console.error("[reorderPrepStations] Error:", failedUpdate.error);
      return { success: false, error: failedUpdate.error.message };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error("[reorderPrepStations] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// GET — Category prep defaults for a location
// ============================================================================

export async function getCategoryPrepDefaults(locationId: string) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("location_category_prep_defaults")
      .select(
        `
        *,
        prep_stations (name, color),
        categories (name)
      `,
      )
      .eq("location_id", locationId);

    if (error) {
      console.error("[getCategoryPrepDefaults] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    const defaults: CategoryPrepDefault[] = (data || []).map((row: any) => ({
      id: row.id,
      location_id: row.location_id,
      category_id: row.category_id,
      prep_station_id: row.prep_station_id,
      merchant_id: row.merchant_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      prep_station_name: row.prep_stations?.name,
      prep_station_color: row.prep_stations?.color,
      category_name: row.categories?.name,
    }));

    return { success: true, data: defaults, error: null };
  } catch (error) {
    console.error("[getCategoryPrepDefaults] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// SET — Upsert category prep default
// ============================================================================

export async function setCategoryPrepDefault(
  locationId: string,
  categoryId: string,
  prepStationId: string,
  merchantId: string,
) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("location_category_prep_defaults")
      .upsert(
        {
          location_id: locationId,
          category_id: categoryId,
          prep_station_id: prepStationId,
          merchant_id: merchantId,
        },
        {
          onConflict: "location_id,category_id",
        },
      )
      .select(
        `
        *,
        prep_stations (name, color),
        categories (name)
      `,
      )
      .single();

    if (error) {
      console.error("[setCategoryPrepDefault] Error:", error);
      return { success: false, error: error.message, data: null };
    }

    LogAuditEvent({
      merchantId,
      locationId,
      action: `Set Category Prep Default: ${(data as any).categories?.name || categoryId} → ${(data as any).prep_stations?.name || prepStationId}`,
      actionCategory: "settings",
      resourceType: "category_prep_default",
      resourceId: data.id,
      changes: {
        after: {
          category: (data as any).categories?.name || categoryId,
          prep_station: (data as any).prep_stations?.name || prepStationId,
        },
      },
    });

    return { success: true, data, error: null };
  } catch (error) {
    console.error("[setCategoryPrepDefault] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      data: null,
    };
  }
}

// ============================================================================
// REMOVE — Remove category prep default
// ============================================================================

export async function removeCategoryPrepDefault(
  locationId: string,
  categoryId: string,
) {
  try {
    const supabase = createServerSupabaseClient();

    // Fetch before state for audit log
    const { data: before } = await supabase
      .from("location_category_prep_defaults")
      .select(
        `
        *,
        prep_stations (name),
        categories (name)
      `,
      )
      .eq("location_id", locationId)
      .eq("category_id", categoryId)
      .single();

    const { error } = await supabase
      .from("location_category_prep_defaults")
      .delete()
      .eq("location_id", locationId)
      .eq("category_id", categoryId);

    if (error) {
      console.error("[removeCategoryPrepDefault] Error:", error);
      return { success: false, error: error.message };
    }

    if (before) {
      LogAuditEvent({
        merchantId: before.merchant_id,
        locationId,
        action: `Removed Category Prep Default: ${(before as any).categories?.name || categoryId}`,
        actionCategory: "settings",
        resourceType: "category_prep_default",
        resourceId: before.id,
        changes: {
          before: {
            category: (before as any).categories?.name || categoryId,
            prep_station: (before as any).prep_stations?.name,
          },
        },
      });
    }

    return { success: true, error: null };
  } catch (error) {
    console.error("[removeCategoryPrepDefault] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
