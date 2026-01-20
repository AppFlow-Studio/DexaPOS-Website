"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  Location,
  CreateLocationInput,
  UpdateLocationInput,
} from "@/types/merchant_locations";
import { LogAuditEvent } from "./audit-logs";

// ============================================================================
// GET OPERATIONS
// ============================================================================

export async function GetLocations(clerkOrgId: string) {
  if (!clerkOrgId) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  // First, get the merchant ID from the clerk_org_id
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    console.error("Error getting merchant:", merchantError);
    return [];
  }

  // Then get locations for this merchant
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .eq("merchant_id", merchant.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GetLocations] Error getting locations:", error);
    return [];
  }
  return data as Location[];
}

export async function GetLocation(locationId: string) {
  if (!locationId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data: location, error } = await supabase
    .from("locations")
    .select("*")
    .eq("id", locationId)
    .single();

  if (error || !location) {
    console.error("Error getting location:", error);
    return null;
  }

  return location as Location;
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

export async function CreateLocation(
  clerkOrgId: string,
  data: CreateLocationInput,
) {
  if (!clerkOrgId) {
    return { error: "Organization ID is required" };
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
    return { error: "Merchant not found" };
  }

  // Check for duplicate code if provided
  if (data.code) {
    const { data: existingLocation } = await supabase
      .from("locations")
      .select("id")
      .eq("merchant_id", merchant.id)
      .eq("code", data.code)
      .single();

    if (existingLocation) {
      return { error: "A location with this code already exists" };
    }
  }

  const { data: location, error } = await supabase
    .from("locations")
    .insert({
      merchant_id: merchant.id,
      name: data.name,
      code: data.code || null,
      description: data.description || null,
      phone: data.phone || null,
      email: data.email || null,
      address_line1: data.address_line1,
      address_line2: data.address_line2 || null,
      city: data.city,
      state: data.state,
      postal_code: data.postal_code,
      country: data.country || "US",
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      timezone: data.timezone || "America/New_York",
      is_active: data.is_active ?? true,
      is_accepting_orders: data.is_accepting_orders ?? true,
      business_hours: data.business_hours || {},
      uses_global_menu: data.uses_global_menu ?? true,
      public_metadata: data.public_metadata || {},
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating location:", error);
    return { error: error.message };
  }

  // Log audit event
  await LogAuditEvent({
    merchantId: merchant.id,
    action: `Created Location: ${data.name}`,
    actionCategory: "settings",
    resourceType: "location",
    resourceId: location.id,
    resourceName: data.name,
    locationId: location.id,
    changes: { after: data as Record<string, unknown> },
  });

  return { data: location as Location };
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

export async function UpdateLocation(
  locationId: string,
  data: UpdateLocationInput,
) {
  if (!locationId) {
    return { error: "Location ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Build update object with only provided fields
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code || null;
  if (data.description !== undefined)
    updateData.description = data.description || null;
  if (data.phone !== undefined) updateData.phone = data.phone || null;
  if (data.email !== undefined) updateData.email = data.email || null;
  if (data.address_line1 !== undefined)
    updateData.address_line1 = data.address_line1;
  if (data.address_line2 !== undefined)
    updateData.address_line2 = data.address_line2 || null;
  if (data.city !== undefined) updateData.city = data.city;
  if (data.state !== undefined) updateData.state = data.state;
  if (data.postal_code !== undefined) updateData.postal_code = data.postal_code;
  if (data.country !== undefined) updateData.country = data.country;
  if (data.latitude !== undefined) updateData.latitude = data.latitude;
  if (data.longitude !== undefined) updateData.longitude = data.longitude;
  if (data.timezone !== undefined) updateData.timezone = data.timezone;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;
  if (data.is_accepting_orders !== undefined)
    updateData.is_accepting_orders = data.is_accepting_orders;
  if (data.business_hours !== undefined)
    updateData.business_hours = data.business_hours;
  if (data.uses_global_menu !== undefined)
    updateData.uses_global_menu = data.uses_global_menu;
  if (data.public_metadata !== undefined)
    updateData.public_metadata = data.public_metadata;

  // Fetch current location data for audit log diff
  const { data: currentLocation, error: fetchError } = await supabase
    .from("locations")
    .select("*")
    .eq("id", locationId)
    .single();

  if (fetchError || !currentLocation) {
    return { error: "Location not found" };
  }

  // Check for duplicate code if being updated
  if (data.code) {
    const { data: existingLocation } = await supabase
      .from("locations")
      .select("id")
      .eq("merchant_id", currentLocation.merchant_id)
      .eq("code", data.code)
      .neq("id", locationId)
      .single();

    if (existingLocation) {
      return { error: "A location with this code already exists" };
    }
  }

  const { data: location, error } = await supabase
    .from("locations")
    .update(updateData)
    .eq("id", locationId)
    .select()
    .single();

  if (error) {
    console.error("Error updating location:", error);
    return { error: error.message };
  }

  // Calculate changes for audit log
  const changedFields: string[] = [];
  const beforeLog: Record<string, unknown> = {};
  const afterLog: Record<string, unknown> = {};

  Object.keys(updateData).forEach((key) => {
    // Skip updated_at
    if (key === "updated_at") return;

    const newValue = updateData[key];
    const oldValue = currentLocation[key as keyof typeof currentLocation];

    if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
      changedFields.push(key);
      beforeLog[key] = oldValue;
      afterLog[key] = newValue;
    }
  });

  // Log audit event
  if (changedFields.length > 0) {
    await LogAuditEvent({
      merchantId: location.merchant_id,
      action: `Updated Location: ${location.name}`,
      actionCategory: "settings",
      resourceType: "location",
      resourceId: locationId,
      resourceName: location.name,
      locationId: locationId,
      changes: { before: beforeLog, after: afterLog },
    });
  }

  return { data: location as Location };
}

export async function ToggleLocationActive(locationId: string) {
  if (!locationId) {
    return { error: "Location ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // First get current status
  const { data: location, error: fetchError } = await supabase
    .from("locations")
    .select("is_active")
    .eq("id", locationId)
    .single();

  if (fetchError || !location) {
    console.error("Error fetching location:", fetchError);
    return { error: "Location not found" };
  }

  // Toggle the status
  const { data: updatedLocation, error } = await supabase
    .from("locations")
    .update({ is_active: !location.is_active })
    .eq("id", locationId)
    .select()
    .single();

  if (error) {
    console.error("Error toggling location active status:", error);
    return { error: error.message };
  }

  // Log audit event
  const newStatus = updatedLocation.is_active ? "activated" : "deactivated";
  await LogAuditEvent({
    merchantId: updatedLocation.merchant_id,
    action: `Location ${newStatus}: ${updatedLocation.name}`,
    actionCategory: "settings",
    resourceType: "location",
    resourceId: locationId,
    resourceName: updatedLocation.name,
    locationId: locationId,
    changes: {
      before: { is_active: location.is_active },
      after: { is_active: updatedLocation.is_active },
    },
  });

  return { data: updatedLocation as Location };
}

export async function ToggleLocationOrders(locationId: string) {
  if (!locationId) {
    return { error: "Location ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // First get current status
  const { data: location, error: fetchError } = await supabase
    .from("locations")
    .select("is_accepting_orders")
    .eq("id", locationId)
    .single();

  if (fetchError || !location) {
    console.error("Error fetching location:", fetchError);
    return { error: "Location not found" };
  }

  // Toggle the status
  const { data: updatedLocation, error } = await supabase
    .from("locations")
    .update({ is_accepting_orders: !location.is_accepting_orders })
    .eq("id", locationId)
    .select()
    .single();

  if (error) {
    console.error("Error toggling location orders status:", error);
    return { error: error.message };
  }

  // Log audit event
  const ordersStatus = updatedLocation.is_accepting_orders
    ? "enabled"
    : "disabled";
  await LogAuditEvent({
    merchantId: updatedLocation.merchant_id,
    action: `Location orders ${ordersStatus}: ${updatedLocation.name}`,
    actionCategory: "settings",
    resourceType: "location",
    resourceId: locationId,
    resourceName: updatedLocation.name,
    locationId: locationId,
    changes: {
      before: { is_accepting_orders: location.is_accepting_orders },
      after: { is_accepting_orders: updatedLocation.is_accepting_orders },
    },
  });

  return { data: updatedLocation as Location };
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

export async function DeleteLocation(locationId: string) {
  if (!locationId) {
    return { error: "Location ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Fetch location details before deletion for audit log
  const { data: locationToDelete } = await supabase
    .from("locations")
    .select("name, merchant_id")
    .eq("id", locationId)
    .single();

  const { error } = await supabase
    .from("locations")
    .delete()
    .eq("id", locationId);

  if (error) {
    console.error("Error deleting location:", error);
    return { error: error.message };
  }

  // Log audit event
  if (locationToDelete) {
    await LogAuditEvent({
      merchantId: locationToDelete.merchant_id,
      action: `Deleted Location: ${locationToDelete.name}`,
      actionCategory: "settings",
      resourceType: "location",
      resourceId: locationId,
      resourceName: locationToDelete.name,
    });
  }

  return { success: true };
}
