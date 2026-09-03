"use server";

import { after } from "next/server";

import {
  cancelFutureReservationsForLocation,
  notifyClosureCancellations,
} from "@/lib/site-builder/reservations/location-closure";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  Location,
  CreateLocationInput,
  UpdateLocationInput,
} from "@/types/merchant_locations";
import { LogAuditEvent } from "./audit-logs";
import {
  getEffectiveMerchantContext,
  UnauthorizedOrgError,
} from "@/lib/admin/merchant-context";
import { isValidEmail, normalizeEmail } from "@/lib/utils/email";
import { findEmailConflict } from "@/app/manage/actions/email-duplicates";
import { emailConflictMessage } from "@/lib/utils/email";
import { getCurrentUserMerchantRole } from "./role-check";

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

  const normalizedLocationEmail = data.email ? normalizeEmail(data.email) : null;
  if (normalizedLocationEmail) {
    if (!isValidEmail(normalizedLocationEmail)) {
      return { error: "Invalid email" };
    }
    const conflict = await findEmailConflict(normalizedLocationEmail, {
      scope: "global",
    });
    if (conflict) {
      return { error: emailConflictMessage(conflict) };
    }
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
      email: normalizedLocationEmail,
      address_line1: data.address_line1,
      address_line2: data.address_line2 || null,
      city: data.city,
      state: data.state,
      postal_code: data.postal_code,
      country: data.country || "US",
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      timezone: data.timezone || "America/New_York",
      pricing_strategy: data.pricing_strategy || "manual",
      dual_pricing_percentage: data.dual_pricing_percentage ?? 4.0,
      use_merchant_pricing_defaults: data.use_merchant_pricing_defaults ?? true,
      is_active: data.is_active ?? true,
      is_accepting_orders: data.is_accepting_orders ?? true,
      business_hours: data.business_hours || {},
      ein: data.ein || null,
      tax_id: data.tax_id || null,
      sales_tax_rate: data.sales_tax_rate ?? null,
      tax_registration_status: data.tax_registration_status || 'pending',
      onboarding_step: data.onboarding_step ?? 0,
      onboarding_completed: data.onboarding_completed ?? false,
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
  if (data.pricing_strategy !== undefined) updateData.pricing_strategy = data.pricing_strategy;
  if (data.dual_pricing_percentage !== undefined) updateData.dual_pricing_percentage = data.dual_pricing_percentage;
  if (data.use_merchant_pricing_defaults !== undefined) updateData.use_merchant_pricing_defaults = data.use_merchant_pricing_defaults;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;
  if (data.is_accepting_orders !== undefined)
    updateData.is_accepting_orders = data.is_accepting_orders;
  if (data.business_hours !== undefined)
    updateData.business_hours = data.business_hours;
  if (data.business_day_end_hour !== undefined)
    updateData.business_day_end_hour = data.business_day_end_hour;
  if (data.ein !== undefined) updateData.ein = data.ein || null;
  if (data.tax_id !== undefined) updateData.tax_id = data.tax_id || null;
  if (data.sales_tax_rate !== undefined) updateData.sales_tax_rate = data.sales_tax_rate;
  if (data.tax_registration_status !== undefined)
    updateData.tax_registration_status = data.tax_registration_status;
  if (data.onboarding_step !== undefined) updateData.onboarding_step = data.onboarding_step;
  if (data.onboarding_completed !== undefined)
    updateData.onboarding_completed = data.onboarding_completed;
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

  // Debug Log
  console.log('[UpdateLocation] Success:', {
    id: location.id,
    strategy: location.pricing_strategy,
    percentage: location.dual_pricing_percentage
  });

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

  // Log audit event — fire-and-forget so the caller isn't blocked by the insert
  if (changedFields.length > 0) {
    void LogAuditEvent({
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
// BATCH-OUT SUMMARY EMAIL SETTINGS
// ============================================================================

export interface BatchSummaryEmailSettings {
  enabled: boolean;
  recipient: string | null;
  /** locations.email — the fallback recipient shown as the input placeholder. */
  locationEmail: string | null;
}

/**
 * Updates the per-location auto-email toggle + recipient override consumed by
 * the `email-batch-summary` Edge Function. An empty recipient is stored as NULL
 * (falls back to locations.email at send time).
 */
export async function UpdateBatchSummaryEmailSettings(
  clerkOrgId: string,
  locationId: string,
  input: { enabled: boolean; recipient: string | null }
): Promise<{
  success: boolean;
  data?: BatchSummaryEmailSettings;
  error?: string;
}> {
  if (!clerkOrgId || !locationId) {
    return { success: false, error: "Missing required parameters" };
  }

  const recipientRaw = (input.recipient ?? "").trim();
  if (recipientRaw && !isValidEmail(recipientRaw)) {
    return { success: false, error: "Enter a valid recipient email address." };
  }
  const recipient = recipientRaw ? normalizeEmail(recipientRaw) : null;

  const supabase = createServerSupabaseClient();

  // Resolve the target merchant through the impersonation-aware chokepoint.
  // A raw `clerk_org_id = clerkOrgId` lookup breaks while an HQ admin is
  // impersonating a merchant: the page passes the HQ org, so the merchant is
  // never found ("Merchant not found"). getEffectiveMerchantContext honors the
  // active impersonation session (from secure cookies) and returns the
  // impersonated merchant.
  let merchantId: string;
  try {
    ({ merchantId } = await getEffectiveMerchantContext(clerkOrgId || null));
  } catch (err) {
    console.error("[UpdateBatchSummaryEmailSettings] merchant context:", err);
    return {
      success: false,
      error: err instanceof UnauthorizedOrgError ? err.message : "Merchant not found",
    };
  }

  const { data: current, error: fetchError } = await supabase
    .from("locations")
    .select(
      "name, email, merchant_id, batch_summary_email_enabled, batch_summary_email_recipient"
    )
    .eq("id", locationId)
    .eq("merchant_id", merchantId)
    .single();

  if (fetchError || !current) {
    console.error("[UpdateBatchSummaryEmailSettings] location lookup:", fetchError);
    return { success: false, error: "Location not found" };
  }

  const { data: updated, error } = await supabase
    .from("locations")
    .update({
      batch_summary_email_enabled: input.enabled,
      batch_summary_email_recipient: recipient,
    })
    .eq("id", locationId)
    .select(
      "name, email, batch_summary_email_enabled, batch_summary_email_recipient"
    )
    .single();

  if (error || !updated) {
    console.error("[UpdateBatchSummaryEmailSettings] update:", error);
    return { success: false, error: error?.message || "Failed to save settings" };
  }

  await LogAuditEvent({
    clerkOrgId,
    locationId,
    action: `Batch-out summary email ${
      updated.batch_summary_email_enabled ? "enabled" : "disabled"
    }: ${updated.name}`,
    actionCategory: "settings",
    resourceType: "location",
    resourceId: locationId,
    resourceName: updated.name,
    changes: {
      before: {
        batch_summary_email_enabled: current.batch_summary_email_enabled,
        batch_summary_email_recipient: current.batch_summary_email_recipient,
      },
      after: {
        batch_summary_email_enabled: updated.batch_summary_email_enabled,
        batch_summary_email_recipient: updated.batch_summary_email_recipient,
      },
    },
  });

  return {
    success: true,
    data: {
      enabled: !!updated.batch_summary_email_enabled,
      recipient: updated.batch_summary_email_recipient ?? null,
      locationEmail: updated.email ?? null,
    },
  };
}

// ============================================================================
// ARCHIVE / RESTORE OPERATIONS  (replaces hard-delete)
// ============================================================================

/**
 * Archiving a branch closes a door, and somebody may be planning to walk
 * through it.
 *
 * Website bookings at an archived location are invisible to the merchant — the
 * dashboard scopes to active locations — so without this a guest keeps a
 * confirmation number for a restaurant that no longer opens. The bookings are
 * cancelled before the merchant is told the archive succeeded, so the count
 * they read is the truth; the messages go out afterwards, because a mail
 * provider must not decide whether a branch can be archived.
 */
export async function ArchiveLocation(locationId: string) {
  if (!locationId) {
    return { error: "Location ID is required" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("archive_location", {
    p_location_id: locationId,
  });

  if (error) {
    console.error("Error archiving location:", error);
    return { error: error.message };
  }

  const result = data as { error?: string; success?: boolean; name?: string };
  if (result.error) {
    return { error: result.error };
  }

  // After the archive, never before: cancelling a guest's dinner because an
  // archive was *about* to happen would be unrecoverable if the archive then
  // failed.
  const closure = await cancelFutureReservationsForLocation(
    locationId,
    `${result.name ?? "This location"} has closed.`,
  );
  if (closure.error) {
    console.error("Error cancelling reservations for archived location:", closure.error);
  }
  if (closure.reservationIds.length > 0) {
    after(() => notifyClosureCancellations(closure.reservationIds));
  }

  const { data: locationData } = await supabase
    .from("locations")
    .select("merchant_id")
    .eq("id", locationId)
    .single();

  if (locationData) {
    await LogAuditEvent({
      merchantId: locationData.merchant_id,
      action: `Archived Location: ${result.name}`,
      actionCategory: "settings",
      resourceType: "location",
      resourceId: locationId,
      resourceName: result.name ?? locationId,
      changes: { before: { is_active: true }, after: { is_active: false } },
    });
  }

  return { success: true, cancelledReservations: closure.cancelled };
}

export async function RestoreLocation(locationId: string) {
  if (!locationId) {
    return { error: "Location ID is required" };
  }

  const roleInfo = await getCurrentUserMerchantRole();
  if (!roleInfo?.isOwnerOrAdmin) {
    return { error: "Only merchant owners and admins can activate locations" };
  }

  const supabase = createServerSupabaseClient();

  const { data: targetLocation, error: targetError } = await supabase
    .from("locations")
    .select("merchant_id, is_active")
    .eq("id", locationId)
    .maybeSingle();

  if (
    targetError ||
    !targetLocation ||
    targetLocation.merchant_id !== roleInfo.merchantId
  ) {
    return { error: "Location not found" };
  }

  // Treat retries as a successful no-op so a replay cannot create a second,
  // inaccurate activation audit event.
  if (targetLocation.is_active) {
    return { success: true };
  }

  const { data, error } = await supabase.rpc("restore_location", {
    p_location_id: locationId,
  });

  if (error) {
    console.error("Error restoring location:", error);
    return { error: error.message };
  }

  const result = data as { error?: string; success?: boolean; name?: string };
  if (result.error) {
    return { error: result.error };
  }

  await LogAuditEvent({
    merchantId: targetLocation.merchant_id,
    action: `Activated Location: ${result.name}`,
    actionCategory: "settings",
    resourceType: "location",
    resourceId: locationId,
    resourceName: result.name ?? locationId,
    changes: { before: { is_active: false }, after: { is_active: true } },
  });

  return { success: true };
}

// ============================================================================
// MERCHANT PRICING DEFAULTS
// ============================================================================

export async function GetMerchantPricingDefaults(clerkOrgId: string) {
  if (!clerkOrgId) {
    return { error: "Organization ID is required" };
  }

  const supabase = createServerSupabaseClient();

  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("id, pricing_strategy, dual_pricing_percentage")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (error || !merchant) {
    console.error("[GetMerchantPricingDefaults] Error:", error);
    return { error: "Merchant not found" };
  }

  return {
    data: {
      merchantId: merchant.id,
      pricing_strategy: merchant.pricing_strategy as "manual" | "dual",
      dual_pricing_percentage: merchant.dual_pricing_percentage as number,
    },
  };
}

export async function UpdateMerchantPricingDefaults(
  clerkOrgId: string,
  data: {
    pricing_strategy?: "manual" | "dual";
    dual_pricing_percentage?: number;
  },
) {
  if (!clerkOrgId) {
    return { error: "Organization ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Get merchant
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id, name, pricing_strategy, dual_pricing_percentage")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    return { error: "Merchant not found" };
  }

  const updateData: Record<string, unknown> = {};
  if (data.pricing_strategy !== undefined) updateData.pricing_strategy = data.pricing_strategy;
  if (data.dual_pricing_percentage !== undefined) updateData.dual_pricing_percentage = data.dual_pricing_percentage;

  const { error } = await supabase
    .from("merchants")
    .update(updateData)
    .eq("id", merchant.id);

  if (error) {
    console.error("[UpdateMerchantPricingDefaults] Error:", error);
    return { error: error.message };
  }

  // Audit log
  await LogAuditEvent({
    merchantId: merchant.id,
    action: "Updated Merchant Pricing Defaults",
    actionCategory: "settings",
    resourceType: "merchant",
    resourceId: merchant.id,
    resourceName: merchant.name,
    changes: {
      before: {
        pricing_strategy: merchant.pricing_strategy,
        dual_pricing_percentage: merchant.dual_pricing_percentage,
      },
      after: updateData,
    },
  });

  return { success: true };
}
