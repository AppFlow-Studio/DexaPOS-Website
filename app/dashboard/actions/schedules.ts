"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { SchedulesModel, ScheduleTimeSlotsModel } from "@/types/db-modles";
import { GetLocationScheduleOverrides } from "./location-schedule-overrides";
import { LogAuditEvent } from "./audit-logs";

// ============================================================================
// GET OPERATIONS
// ============================================================================

export async function GetSchedules(clerkOrgId: string, locationId?: string) {
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

  // Build query based on location context
  let query = supabase
    .from("schedules")
    .select(
      `*,
            schedule_time_slots(*)
        `,
    )
    .eq("merchant_id", merchant.id);

  if (locationId === "all" || !locationId) {
    // All Locations view: return all schedules (global + all location-specific)
    // No additional filtering needed
  } else {
    // Specific Location view: return global schedules + this location's specific schedules
    query = query.or(`location_id.is.null,location_id.eq.${locationId}`);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("Error getting schedules:", error);
    return [];
  }

  // If viewing specific location, fetch overrides and merge
  if (locationId && locationId !== "all") {
    const overrides = await GetLocationScheduleOverrides(locationId);
    const overrideMap = new Map(overrides.map((o) => [o.schedule_id, o]));

    return data.map((schedule) => ({
      ...schedule,
      has_location_override: overrideMap.has(schedule.id),
      effective_is_active:
        overrideMap.get(schedule.id)?.is_active ?? schedule.is_active,
      location_override: overrideMap.get(schedule.id) || null,
      is_location_specific: schedule.location_id !== null,
    }));
  }

  return data.map((schedule) => ({
    ...schedule,
    has_location_override: false,
    effective_is_active: schedule.is_active,
    location_override: null,
    is_location_specific: schedule.location_id !== null,
  }));
}

export async function GetSchedule(scheduleId: string) {
  if (!scheduleId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data: schedule, error } = await supabase
    .from("schedules")
    .select(
      `
            *,
            schedule_time_slots(*)
        `,
    )
    .eq("id", scheduleId)
    .single();

  if (error || !schedule) {
    console.error("Error getting schedule:", error);
    return null;
  }

  return schedule as SchedulesModel & {
    schedule_time_slots: ScheduleTimeSlotsModel[];
  };
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

export async function CreateSchedule(
  clerkOrgId: string,
  data: {
    name: string;
    description?: string;
    is_active?: boolean;
    location_id?: string | null;
    time_slots?: Array<{
      day_of_week: number;
      start_time: string;
      end_time: string;
      is_active?: boolean;
    }>;
  },
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

  // Create schedule
  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .insert({
      merchant_id: merchant.id,
      name: data.name,
      description: data.description || null,
      is_active: data.is_active ?? true,
      location_id: data.location_id || null,
    })
    .select()
    .single();

  if (scheduleError || !schedule) {
    console.error("Error creating schedule:", scheduleError);
    return { error: scheduleError?.message || "Failed to create schedule" };
  }

  // Create time slots if provided
  if (data.time_slots && data.time_slots.length > 0) {
    const timeSlots = data.time_slots.map((slot) => ({
      schedule_id: schedule.id,
      day_of_week: slot.day_of_week,
      start_time: slot.start_time,
      end_time: slot.end_time,
      is_active: slot.is_active ?? true,
      merchant_id: merchant.id,
    }));

    const { error: slotsError } = await supabase
      .from("schedule_time_slots")
      .insert(timeSlots);

    if (slotsError) {
      console.error("Error creating time slots:", slotsError);
      // Schedule was created but slots failed - return partial success
      return {
        error: "Schedule created but failed to add time slots",
        data: schedule,
      };
    }
  }

  // Fetch location name for audit log if applicable
  let locationName: string | undefined;
  if (data.location_id) {
    const { data: loc } = await supabase
      .from("locations")
      .select("name")
      .eq("id", data.location_id)
      .single();
    locationName = loc?.name;
  }

  // Log audit event
  await LogAuditEvent({
    merchantId: merchant.id,
    action: `Created Schedule: ${data.name}`,
    actionCategory: "settings",
    resourceType: "schedule",
    resourceId: schedule.id,
    resourceName: data.name,
    locationId: data.location_id || undefined,
    metadata: {
      location_name: locationName,
      has_time_slots: !!(data.time_slots && data.time_slots.length > 0),
    },
    changes: { after: data as Record<string, unknown> },
  });

  return { data: schedule as SchedulesModel };
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

export async function UpdateSchedule(
  scheduleId: string,
  data: {
    name?: string;
    description?: string;
    is_active?: boolean;
  },
  locationId?: string | null,
) {
  if (!scheduleId) {
    return { error: "Schedule ID is required" };
  }

  const supabase = createServerSupabaseClient();

  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

  const { data: schedule, error } = await supabase
    .from("schedules")
    .update(updateData)
    .eq("id", scheduleId)
    .select()
    .single();

  if (error) {
    console.error("Error updating schedule:", error);
    return { error: error.message };
  }

  // Log audit event
  await LogAuditEvent({
    merchantId: schedule.merchant_id,
    action: `Updated Schedule: ${schedule.name}`,
    actionCategory: "settings",
    resourceType: "schedule",
    resourceId: scheduleId,
    resourceName: schedule.name,
    locationId: locationId || schedule.location_id || undefined,
    changes: { after: data as Record<string, unknown> },
  });

  return { data: schedule as SchedulesModel };
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

export async function DeleteSchedule(
  scheduleId: string,
  locationId?: string | null,
) {
  if (!scheduleId) {
    return { error: "Schedule ID is required" };
  }

  // Use service role client to bypass RLS
  const supabase = createServiceRoleClient();

  // 1. Delete all menu_schedules assignments
  const { error: menuError } = await supabase
    .from("menu_schedules")
    .delete()
    .eq("schedule_id", scheduleId);

  if (menuError) {
    console.error("Error removing schedule from menus:", menuError);
    return { error: "Failed to remove schedule from menus" };
  }

  // 2. Delete all category_schedules assignments
  const { error: categoryError } = await supabase
    .from("category_schedules")
    .delete()
    .eq("schedule_id", scheduleId);

  if (categoryError) {
    console.error("Error removing schedule from categories:", categoryError);
    return { error: "Failed to remove schedule from categories" };
  }

  // 3. Delete all schedule_time_slots
  const { error: slotsError } = await supabase
    .from("schedule_time_slots")
    .delete()
    .eq("schedule_id", scheduleId);

  if (slotsError) {
    console.error("Error deleting time slots:", slotsError);
    return { error: "Failed to delete time slots" };
  }

  // Fetch schedule details for audit log before deletion
  const { data: scheduleToDelete } = await supabase
    .from("schedules")
    .select("name, merchant_id, location_id")
    .eq("id", scheduleId)
    .single();

  // 4. Finally delete the schedule itself
  const { error } = await supabase
    .from("schedules")
    .delete()
    .eq("id", scheduleId);

  if (error) {
    console.error("Error deleting schedule:", error);
    return { error: error.message };
  }

  // Log audit event
  if (scheduleToDelete) {
    await LogAuditEvent({
      merchantId: scheduleToDelete.merchant_id,
      action: `Deleted Schedule: ${scheduleToDelete.name}`,
      actionCategory: "settings",
      resourceType: "schedule",
      resourceId: scheduleId,
      resourceName: scheduleToDelete.name,
      locationId:
        locationId || (scheduleToDelete as any).location_id || undefined,
    });
  }

  return { success: true };
}

// ============================================================================
// ASSIGNMENT OPERATIONS
// ============================================================================

/**
 * Get schedules assigned to a category with location context
 */
export async function GetCategorySchedules(
  categoryId: string,
  locationId?: string,
) {
  if (!categoryId) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("category_schedules")
    .select(
      `
            id,
            schedule:schedules(
                *,
                schedule_time_slots(*)
            )
        `,
    )
    .eq("category_id", categoryId);

  if (error) {
    console.error("Error getting category schedules:", error);
    return [];
  }

  // Type for schedule with time slots
  type ScheduleWithSlots = SchedulesModel & {
    schedule_time_slots: ScheduleTimeSlotsModel[];
  };

  const schedules = data
    .map((item) => item.schedule as unknown as ScheduleWithSlots | null)
    .filter((s): s is ScheduleWithSlots => s !== null);

  // If viewing specific location, fetch overrides and merge
  if (locationId && locationId !== "all") {
    const overrides = await GetLocationScheduleOverrides(locationId);
    const overrideMap = new Map(overrides.map((o) => [o.schedule_id, o]));

    return schedules.map((schedule) => ({
      ...schedule,
      has_location_override: overrideMap.has(schedule.id),
      effective_is_active:
        overrideMap.get(schedule.id)?.is_active ?? schedule.is_active,
      location_override: overrideMap.get(schedule.id) || null,
    }));
  }

  return schedules;
}

export async function AssignScheduleToMenu(
  menuId: string,
  scheduleId: string,
  clerkOrgId: string,
  locationId?: string | null,
) {
  if (!menuId || !scheduleId) {
    return { error: "Menu ID and Schedule ID are required" };
  }

  console.log("clerkOrgId", clerkOrgId);
  const supabase = createServerSupabaseClient();
  // First, get the merchant ID from the clerk_org_id
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    console.error("Error getting merchant:", merchantError);
    return { error: "Merchant not found" };
  }

  // Check if assignment already exists
  const { data: existing } = await supabase
    .from("menu_schedules")
    .select("id")
    .eq("menu_id", menuId)
    .eq("schedule_id", scheduleId)
    .single();

  if (existing) {
    return { success: true, data: existing };
  }

  // Create new assignment
  const { data, error } = await supabase
    .from("menu_schedules")
    .insert({
      menu_id: menuId,
      schedule_id: scheduleId,
      merchant_id: merchant.id,
    })
    .select()
    .single();

  if (error) {
    console.error("Error assigning schedule to menu:", error);
    return { error: error.message };
  }

  // Fetch names for audit log
  const [{ data: menu }, { data: schedule }] = await Promise.all([
    supabase.from("menus").select("name").eq("id", menuId).single(),
    supabase.from("schedules").select("name").eq("id", scheduleId).single(),
  ]);

  // Log audit event
  await LogAuditEvent({
    merchantId: merchant.id,
    action: `Assigned Schedule "${schedule?.name}" to Menu "${menu?.name}"`,
    actionCategory: "settings",
    resourceType: "schedule",
    resourceId: scheduleId,
    resourceName: schedule?.name,
    locationId: locationId,
    metadata: {
      menu_id: menuId,
      menu_name: menu?.name,
    },
  });

  return { success: true, data };
}

export async function AssignScheduleToCategory(
  categoryId: string,
  scheduleId: string,
  locationId?: string | null,
) {
  if (!categoryId || !scheduleId) {
    return { error: "Category ID and Schedule ID are required" };
  }

  const supabase = createServerSupabaseClient();

  // Check if assignment already exists
  const { data: existing } = await supabase
    .from("category_schedules")
    .select("id")
    .eq("category_id", categoryId)
    .eq("schedule_id", scheduleId)
    .single();

  if (existing) {
    return { success: true, data: existing };
  }

  // Create new assignment
  const { data, error } = await supabase
    .from("category_schedules")
    .insert({
      category_id: categoryId,
      schedule_id: scheduleId,
    })
    .select()
    .single();

  if (error) {
    console.error("Error assigning schedule to category:", error);
    return { error: error.message };
  }

  // Fetch details for audit log
  const [{ data: category }, { data: schedule }] = await Promise.all([
    supabase
      .from("categories")
      .select("category, merchant_id")
      .eq("id", categoryId)
      .single(),
    supabase.from("schedules").select("name").eq("id", scheduleId).single(),
  ]);

  // Log audit event
  if (category) {
    await LogAuditEvent({
      merchantId: category.merchant_id,
      action: `Assigned Schedule "${schedule?.name}" to Category "${category.category}"`,
      actionCategory: "settings",
      resourceType: "schedule",
      resourceId: scheduleId,
      resourceName: schedule?.name,
      locationId: locationId,
      metadata: {
        category_id: categoryId,
        category_name: category.category,
      },
    });
  }

  return { success: true, data };
}

export async function RemoveScheduleFromMenu(
  menuId: string,
  scheduleId: string,
  locationId?: string | null,
) {
  if (!menuId || !scheduleId) {
    return { error: "Menu ID and Schedule ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("menu_schedules")
    .delete()
    .eq("menu_id", menuId)
    .eq("schedule_id", scheduleId);

  if (error) {
    console.error("Error removing schedule from menu:", error);
    return { error: error.message };
  }

  // Fetch names for audit log (after delete, but entities still exist)
  const [{ data: menu }, { data: schedule }] = await Promise.all([
    supabase
      .from("menus")
      .select("name, merchant_id")
      .eq("id", menuId)
      .single(),
    supabase.from("schedules").select("name").eq("id", scheduleId).single(),
  ]);

  if (menu) {
    await LogAuditEvent({
      merchantId: menu.merchant_id,
      action: `Removed Schedule "${schedule?.name}" from Menu "${menu.name}"`,
      actionCategory: "settings",
      resourceType: "schedule",
      resourceId: scheduleId,
      resourceName: schedule?.name,
      locationId: locationId,
      metadata: {
        menu_id: menuId,
        menu_name: menu.name,
      },
    });
  }

  return { success: true };
}

export async function RemoveScheduleFromCategory(
  categoryId: string,
  scheduleId: string,
  locationId?: string | null,
) {
  if (!categoryId || !scheduleId) {
    return { error: "Category ID and Schedule ID are required" };
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("category_schedules")
    .delete()
    .eq("category_id", categoryId)
    .eq("schedule_id", scheduleId);

  if (error) {
    console.error("Error removing schedule from category:", error);
    return { error: error.message };
  }

  // Fetch details for audit log
  const [{ data: category }, { data: schedule }] = await Promise.all([
    supabase
      .from("categories")
      .select("category, merchant_id")
      .eq("id", categoryId)
      .single(),
    supabase.from("schedules").select("name").eq("id", scheduleId).single(),
  ]);

  if (category) {
    await LogAuditEvent({
      merchantId: category.merchant_id,
      action: `Removed Schedule "${schedule?.name}" from Category "${category.category}"`,
      actionCategory: "settings",
      resourceType: "schedule",
      resourceId: scheduleId,
      resourceName: schedule?.name,
      locationId: locationId,
      metadata: {
        category_id: categoryId,
        category_name: category.category,
      },
    });
  }

  return { success: true };
}

// ============================================================================
// MENU SCHEDULE QUERIES
// ============================================================================

export async function GetMenuSchedules(menuId: string) {
  if (!menuId) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("menu_schedules")
    .select(
      `
            id,
            schedule:schedules(
                *,
                schedule_time_slots(*)
            )
        `,
    )
    .eq("menu_id", menuId);

  if (error) {
    console.error("Error getting menu schedules:", error);
    return [];
  }

  // Flatten to just return the schedules with time slots
  type ScheduleWithSlots = SchedulesModel & {
    schedule_time_slots: ScheduleTimeSlotsModel[];
  };

  return data
    .map((item) => item.schedule as unknown as ScheduleWithSlots | null)
    .filter((s): s is ScheduleWithSlots => s !== null);
}

export async function GetSchedulesWithTimeSlots(clerkOrgId: string) {
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

  const { data, error } = await supabase
    .from("schedules")
    .select(
      `
            *,
            schedule_time_slots(*)
        `,
    )
    .eq("merchant_id", merchant.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error getting schedules with time slots:", error);
    return [];
  }

  return data as Array<
    SchedulesModel & {
      schedule_time_slots: ScheduleTimeSlotsModel[];
    }
  >;
}

// Get schedules with their associated menus and time slots
export async function GetSchedulesWithMenus(clerkOrgId: string) {
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

  const { data, error } = await supabase
    .from("schedules")
    .select(
      `
            *,
            schedule_time_slots(*),
            menu_schedules(
                id,
                menu:menus(
                    id,
                    name,
                    is_active
                )
            )
        `,
    )
    .eq("merchant_id", merchant.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error getting schedules with menus:", error);
    return [];
  }

  return data as Array<
    SchedulesModel & {
      schedule_time_slots: ScheduleTimeSlotsModel[];
      menu_schedules: Array<{
        id: string;
        menu: {
          id: string;
          name: string;
          is_active: boolean;
        } | null;
      }>;
    }
  >;
}

// Get a single schedule with full details including menus
export async function GetScheduleWithDetails(scheduleId: string) {
  if (!scheduleId) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data: schedule, error } = await supabase
    .from("schedules")
    .select(
      `
            *,
            schedule_time_slots(*),
            menu_schedules(
                id,
                menu:menus(
                    id,
                    name,
                    is_active
                )
            )
        `,
    )
    .eq("id", scheduleId)
    .single();

  if (error || !schedule) {
    console.error("Error getting schedule with details:", error);
    return null;
  }

  return schedule as SchedulesModel & {
    schedule_time_slots: ScheduleTimeSlotsModel[];
    menu_schedules: Array<{
      id: string;
      menu: {
        id: string;
        name: string;
        is_active: boolean;
      } | null;
    }>;
  };
}

// Toggle schedule active status
export async function ToggleScheduleActive(
  scheduleId: string,
  locationId?: string | null,
) {
  if (!scheduleId) {
    return { error: "Schedule ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Get current status
  const { data: schedule, error: fetchError } = await supabase
    .from("schedules")
    .select("is_active")
    .eq("id", scheduleId)
    .single();

  if (fetchError || !schedule) {
    console.error("Error fetching schedule:", fetchError);
    return { error: "Schedule not found" };
  }

  // Toggle status
  const { data: updatedSchedule, error } = await supabase
    .from("schedules")
    .update({ is_active: !schedule.is_active })
    .eq("id", scheduleId)
    .select()
    .single();

  if (error) {
    console.error("Error toggling schedule status:", error);
    return { error: error.message };
  }

  // Log audit event
  const newStatus = updatedSchedule.is_active ? "activated" : "deactivated";
  await LogAuditEvent({
    merchantId: updatedSchedule.merchant_id,
    action: `Schedule ${newStatus}: ${updatedSchedule.name}`,
    actionCategory: "settings",
    resourceType: "schedule",
    resourceId: scheduleId,
    resourceName: updatedSchedule.name,
    locationId: locationId || updatedSchedule.location_id || undefined,
    changes: {
      before: { is_active: schedule.is_active },
      after: { is_active: updatedSchedule.is_active },
    },
  });

  return { data: updatedSchedule as SchedulesModel };
}

// ============================================================================
// TIME SLOT OPERATIONS
// ============================================================================

export async function CreateTimeSlot(
  scheduleId: string,
  data: {
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_active?: boolean;
  },
) {
  if (!scheduleId) {
    return { error: "Schedule ID is required" };
  }

  const supabase = createServerSupabaseClient();

  const { data: timeSlot, error } = await supabase
    .from("schedule_time_slots")
    .insert({
      schedule_id: scheduleId,
      day_of_week: data.day_of_week,
      start_time: data.start_time,
      end_time: data.end_time,
      is_active: data.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating time slot:", error);
    return { error: error.message };
  }

  // Fetch schedule name for audit log
  const { data: schedule } = await supabase
    .from("schedules")
    .select("name, merchant_id")
    .eq("id", scheduleId)
    .single();

  if (schedule) {
    await LogAuditEvent({
      merchantId: schedule.merchant_id,
      action: `Created Time Slot for Schedule: ${schedule.name}`,
      actionCategory: "settings",
      resourceType: "schedule",
      resourceId: scheduleId,
      resourceName: schedule.name,
      metadata: {
        time_slot_id: timeSlot.id,
        day_of_week: data.day_of_week,
        start_time: data.start_time,
        end_time: data.end_time,
      },
    });
  }

  return { data: timeSlot as ScheduleTimeSlotsModel };
}

export async function UpdateTimeSlot(
  timeSlotId: string,
  data: {
    day_of_week?: number;
    start_time?: string;
    end_time?: string;
    is_active?: boolean;
  },
) {
  if (!timeSlotId) {
    return { error: "Time Slot ID is required" };
  }

  const supabase = createServerSupabaseClient();

  const updateData: Record<string, unknown> = {};
  if (data.day_of_week !== undefined) updateData.day_of_week = data.day_of_week;
  if (data.start_time !== undefined) updateData.start_time = data.start_time;
  if (data.end_time !== undefined) updateData.end_time = data.end_time;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

  const { data: timeSlot, error } = await supabase
    .from("schedule_time_slots")
    .update(updateData)
    .eq("id", timeSlotId)
    .select()
    .single();

  if (error) {
    console.error("Error updating time slot:", error);
    return { error: error.message };
  }

  // Fetch schedule info for audit log
  const { data: schedule } = await supabase
    .from("schedules")
    .select("name, merchant_id")
    .eq("id", timeSlot.schedule_id)
    .single();

  if (schedule) {
    await LogAuditEvent({
      merchantId: schedule.merchant_id,
      action: `Updated Time Slot for Schedule: ${schedule.name}`,
      actionCategory: "settings",
      resourceType: "schedule",
      resourceId: timeSlot.schedule_id,
      resourceName: schedule.name,
      metadata: {
        time_slot_id: timeSlotId,
      },
      changes: { after: data as Record<string, unknown> },
    });
  }

  return { data: timeSlot as ScheduleTimeSlotsModel };
}

export async function DeleteTimeSlot(timeSlotId: string) {
  if (!timeSlotId) {
    return { error: "Time Slot ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Fetch info before delete
  const { data: timeSlot } = await supabase
    .from("schedule_time_slots")
    .select("schedule_id")
    .eq("id", timeSlotId)
    .single();

  let scheduleName = "Unknown";
  let merchantId = "";

  if (timeSlot) {
    const { data: schedule } = await supabase
      .from("schedules")
      .select("name, merchant_id")
      .eq("id", timeSlot.schedule_id)
      .single();
    if (schedule) {
      scheduleName = schedule.name;
      merchantId = schedule.merchant_id;
    }
  }

  const { error } = await supabase
    .from("schedule_time_slots")
    .delete()
    .eq("id", timeSlotId);

  if (error) {
    console.error("Error deleting time slot:", error);
    return { error: error.message };
  }

  // Log audit event
  if (merchantId) {
    await LogAuditEvent({
      merchantId: merchantId,
      action: `Deleted Time Slot from Schedule: ${scheduleName}`,
      actionCategory: "settings",
      resourceType: "schedule",
      resourceId: timeSlot?.schedule_id || "",
      resourceName: scheduleName,
      metadata: {
        time_slot_id: timeSlotId,
      },
    });
  }

  return { success: true };
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Update schedule with time slots (replaces all time slots)
 * This is used when editing a schedule - it removes old slots and creates new ones
 */
export async function UpdateScheduleWithTimeSlots(
  scheduleId: string,
  data: {
    name?: string;
    description?: string;
    is_active?: boolean;
    time_slots?: Array<{
      day_of_week: number;
      start_time: string;
      end_time: string;
      is_active?: boolean;
    }>;
  },
  locationId?: string | null,
) {
  if (!scheduleId) {
    return { error: "Schedule ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Get merchant_id from schedule
  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .select("merchant_id")
    .eq("id", scheduleId)
    .single();

  if (scheduleError || !schedule) {
    console.error("Error getting schedule:", scheduleError);
    return { error: "Schedule not found" };
  }

  // Update schedule details
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

  if (Object.keys(updateData).length > 0) {
    const { error } = await supabase
      .from("schedules")
      .update(updateData)
      .eq("id", scheduleId);

    if (error) {
      console.error("Error updating schedule:", error);
      return { error: error.message };
    }
  }

  // Update time slots if provided
  if (data.time_slots !== undefined) {
    console.log(
      "[DEBUG UpdateScheduleWithTimeSlots] time_slots provided, count:",
      data.time_slots.length,
    );

    // Delete existing time slots
    console.log(
      "[DEBUG UpdateScheduleWithTimeSlots] Attempting to delete existing slots for schedule:",
      scheduleId,
    );

    // Use service role client to bypass RLS for delete operation
    const serviceClient = createServiceRoleClient();
    const { error: deleteError, data: deletedData } = await serviceClient
      .from("schedule_time_slots")
      .delete()
      .eq("schedule_id", scheduleId)
      .select();

    console.log(
      "[DEBUG UpdateScheduleWithTimeSlots] Delete result - error:",
      deleteError,
      "deleted count:",
      deletedData?.length ?? 0,
    );

    if (deleteError) {
      console.error("Error deleting old time slots:", deleteError);
      return { error: "Failed to update time slots" };
    }

    // Insert new time slots
    if (data.time_slots.length > 0) {
      const timeSlots = data.time_slots.map((slot) => ({
        schedule_id: scheduleId,
        merchant_id: schedule.merchant_id,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
        is_active: slot.is_active ?? true,
      }));

      console.log(
        "[DEBUG UpdateScheduleWithTimeSlots] Inserting new slots, count:",
        timeSlots.length,
      );

      const { error: insertError, data: insertedData } = await supabase
        .from("schedule_time_slots")
        .insert(timeSlots)
        .select();

      console.log(
        "[DEBUG UpdateScheduleWithTimeSlots] Insert result - error:",
        insertError,
        "inserted count:",
        insertedData?.length,
      );

      if (insertError) {
        console.error("Error creating new time slots:", insertError);
        return { error: "Failed to create time slots" };
      }
    }
  }

  // Fetch updated schedule with slots
  const { data: updatedSchedule, error: fetchError } = await supabase
    .from("schedules")
    .select(
      `
            *,
            schedule_time_slots(*)
        `,
    )
    .eq("id", scheduleId)
    .single();

  if (fetchError) {
    console.error("Error fetching updated schedule:", fetchError);
    return { error: "Schedule updated but failed to fetch" };
  }

  // Log audit event
  await LogAuditEvent({
    merchantId: schedule.merchant_id, // fetched at start
    action: `Updated Schedule Logic: ${updatedSchedule.name}`, // "Logic" implies slots
    actionCategory: "settings",
    resourceType: "schedule",
    resourceId: scheduleId,
    resourceName: updatedSchedule.name,
    locationId: locationId || updatedSchedule.location_id || undefined,
    metadata: {
      updated_slots_count: data.time_slots
        ? data.time_slots.length
        : "unchanged",
      has_slots_changes: data.time_slots !== undefined,
    },
    changes: { after: data as Record<string, unknown> },
  });

  return {
    data: updatedSchedule as SchedulesModel & {
      schedule_time_slots: ScheduleTimeSlotsModel[];
    },
  };
}
