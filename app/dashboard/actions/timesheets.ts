"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ShiftBreakLog, StaffShift } from "@/types/staff";
import { startOfDay, endOfDay } from "date-fns";
import { LogAuditEvent } from "./audit-logs";

// ============================================================================
// TYPES
// ============================================================================

type MutationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

interface TimesheetFilters {
  dateFrom: string; // ISO date string
  dateTo: string; // ISO date string
  locationIds?: string[];
  employeeIds?: string[];
}

interface TimesheetResources {
  staff: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  }[];
  locations: { id: string; name: string }[];
}

interface AdjustShiftTimesInput {
  shiftId: string;
  clockInTime: string;
  clockOutTime: string | null;
  breakLogs: ShiftBreakLog[];
  reason: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getMerchantIdFromClerkOrg(clerkOrgId: string): Promise<string> {
  if (!clerkOrgId) {
    throw new Error("Organization ID is required");
  }

  const supabase = createServerSupabaseClient();

  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (error || !merchant) {
    throw new Error("Merchant not found");
  }

  return merchant.id;
}

function mapShiftAdjustmentError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  const messages: Record<string, string> = {
    SHIFT_REQUIRED: "Shift is required.",
    CLOCK_IN_REQUIRED: "Clock-in time is required.",
    REASON_REQUIRED: "A correction reason is required.",
    SHIFT_NOT_FOUND: "Shift not found.",
    PERMISSION_DENIED: "You do not have permission to adjust this shift.",
    FUTURE_SHIFT_TIME: "Shift times cannot be in the future.",
    INVALID_RANGE: "Clock-out must be after clock-in.",
    INVALID_BREAK_LOGS: "Break logs must be a valid list.",
    INVALID_BREAK_TYPE: "Break type must be paid or unpaid.",
    BREAK_TIME_REQUIRED: "Each break needs a start and end time.",
    INVALID_BREAK_TIME: "One or more break times are invalid.",
    INVALID_BREAK_RANGE: "Break end must be after break start.",
    BREAK_OUT_OF_BOUNDS: "Breaks must be inside the shift window.",
    FUTURE_BREAK_TIME: "Break times cannot be in the future.",
    BREAKS_OVERLAP: "Breaks cannot overlap.",
    BREAK_EXCEEDS_SHIFT: "Unpaid break time cannot exceed the shift duration.",
  };

  for (const [code, friendlyMessage] of Object.entries(messages)) {
    if (message.includes(code)) {
      return friendlyMessage;
    }
  }

  return message || "Failed to adjust shift times";
}

// ============================================================================
// GET TIMESHEETS
// ============================================================================

export async function GetTimesheets(
  clerkOrgId: string,
  filters: TimesheetFilters,
): Promise<MutationResult<StaffShift[]>> {
  try {
    const supabase = createServiceRoleClient();

    const from = startOfDay(new Date(filters.dateFrom)).toISOString();
    const to = endOfDay(new Date(filters.dateTo)).toISOString();

    // Single query — filter through merchants!inner to avoid a separate merchant lookup round-trip
    let query = supabase
      .from("staff_shifts")
      .select(
        `
                id,
                status,
                clock_in_time,
                clock_out_time,
                break_logs,
                hourly_rate_snapshot,
                notes,
                is_verified,
                created_at,
                updated_at,
                merchant_id,
                location_id,
                staff_profile_id,
                merchants!inner(clerk_org_id),
                staff_profile:staff_profiles(first_name, last_name, avatar_url),
                location:locations(name)
            `,
      )
      .eq("merchants.clerk_org_id", clerkOrgId)
      .gte("clock_in_time", from)
      .lte("clock_in_time", to)
      .order("clock_in_time", { ascending: false });

    if (filters.locationIds && filters.locationIds.length > 0) {
      query = query.in("location_id", filters.locationIds);
    }

    if (filters.employeeIds && filters.employeeIds.length > 0) {
      query = query.in("staff_profile_id", filters.employeeIds);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return { success: true, data: (data || []) as unknown as StaffShift[] };
  } catch (error) {
    console.error("[GetTimesheets] error", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch timesheets",
    };
  }
}

// ============================================================================
// GET TIMESHEET RESOURCES (staff and locations for filters)
// ============================================================================

export async function GetTimesheetResources(
  clerkOrgId: string,
): Promise<MutationResult<TimesheetResources>> {
  try {
    const supabase = createServiceRoleClient();

    // Both queries run in parallel, each filtering via merchants!inner — no separate merchant lookup
    const [staffRes, locRes] = await Promise.all([
      supabase
        .from("staff_profiles")
        .select("id, first_name, last_name, avatar_url, merchants!inner(clerk_org_id)")
        .eq("merchants.clerk_org_id", clerkOrgId)
        .order("first_name", { ascending: true }),
      supabase
        .from("locations")
        .select("id, name, merchants!inner(clerk_org_id)")
        .eq("merchants.clerk_org_id", clerkOrgId)
        .order("name", { ascending: true }),
    ]);

    if (staffRes.error) throw staffRes.error;
    if (locRes.error) throw locRes.error;

    return {
      success: true,
      data: {
        staff: (staffRes.data || []).map(({ merchants: _, ...s }) => s) as TimesheetResources["staff"],
        locations: (locRes.data || []).map(({ merchants: _, ...l }) => l) as TimesheetResources["locations"],
      },
    };
  } catch (error) {
    console.error("[GetTimesheetResources] error", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch resources",
    };
  }
}

// ============================================================================
// GET SINGLE SHIFT
// ============================================================================

export async function GetShiftById(
  clerkOrgId: string,
  shiftId: string,
): Promise<MutationResult<StaffShift>> {
  try {
    const supabase = createServiceRoleClient();
    const merchantId = await getMerchantIdFromClerkOrg(clerkOrgId);

    const { data, error } = await supabase
      .from("staff_shifts")
      .select(
        `
                id, 
                status, 
                clock_in_time, 
                clock_out_time, 
                break_logs, 
                hourly_rate_snapshot, 
                notes,
                is_verified,
                created_at,
                updated_at,
                merchant_id,
                location_id,
                staff_profile_id,
                staff_profile:staff_profiles(first_name, last_name, avatar_url),
                location:locations(name)
            `,
      )
      .eq("id", shiftId)
      .eq("merchant_id", merchantId)
      .single();

    if (error || !data) {
      throw error || new Error("Shift not found");
    }

    return { success: true, data: data as unknown as StaffShift };
  } catch (error) {
    console.error("[GetShiftById] error", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch shift",
    };
  }
}

// ============================================================================
// UPDATE SHIFT STATUS
// ============================================================================

export async function UpdateShiftStatus(
  clerkOrgId: string,
  shiftId: string,
  status: "active" | "completed" | "approved" | "rejected",
): Promise<MutationResult<StaffShift>> {
  try {
    const supabase = createServiceRoleClient();
    const merchantId = await getMerchantIdFromClerkOrg(clerkOrgId);

    const { data: updatedData, error } = await supabase
      .from("staff_shifts")
      .update({
        status,
        updated_at: new Date().toISOString(),
        is_verified: status === "approved" ? true : undefined,
      })
      .eq("id", shiftId)
      .eq("merchant_id", merchantId)
      .select(
        `
                id,
                status,
                clock_in_time,
                clock_out_time,
                break_logs,
                hourly_rate_snapshot,
                notes,
                is_verified,
                created_at,
                updated_at,
                merchant_id,
                location_id,
                staff_profile_id,
                staff_profile:staff_profiles(first_name, last_name, avatar_url),
                location:locations(name)
            `,
      )
      .single();

    if (error || !updatedData) {
      throw error || new Error("Failed to update shift");
    }

    // Log audit event
    // Cast to any because the joined type isn't fully inferred
    const staffProfile = (updatedData as any).staff_profile;
    const staffName = staffProfile
      ? `${staffProfile.first_name} ${staffProfile.last_name}`
      : "Unknown Staff";

    await LogAuditEvent({
      merchantId: updatedData.merchant_id,
      action: `Shift ${status}: ${staffName}`,
      actionCategory: "staff_shifts",
      resourceType: "staff_shift",
      resourceId: shiftId,
      resourceName: staffName,
      locationId: updatedData.location_id,
      changes: {
        after: { status, is_verified: status === "approved" },
      },
    });

    return { success: true, data: updatedData as unknown as StaffShift };
  } catch (error) {
    console.error("[UpdateShiftStatus] error", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update shift status",
    };
  }
}

// ============================================================================
// ADJUST SHIFT TIMES (Manual correction)
// ============================================================================

export async function AdjustShiftTimes(
  clerkOrgId: string,
  input: AdjustShiftTimesInput,
): Promise<MutationResult<StaffShift>> {
  try {
    const serviceSupabase = createServiceRoleClient();
    const supabase = createServerSupabaseClient();
    const merchantId = await getMerchantIdFromClerkOrg(clerkOrgId);

    // Fetch before state
    const { data: beforeShift } = await serviceSupabase
      .from("staff_shifts")
      .select(
        `
        id,
        status,
        clock_in_time,
        clock_out_time,
        break_logs,
        hourly_rate_snapshot,
        notes,
        is_verified,
        merchant_id,
        location_id,
        staff_profile_id,
        staff_profile:staff_profiles(first_name, last_name, avatar_url),
        location:locations(name)
      `,
      )
      .eq("id", input.shiftId)
      .eq("merchant_id", merchantId)
      .single();

    if (!beforeShift) {
      throw new Error("Shift not found");
    }

    const { error } = await (supabase as any).rpc("admin_adjust_staff_shift", {
      p_shift_id: input.shiftId,
      p_clock_in_time: input.clockInTime,
      p_clock_out_time: input.clockOutTime,
      p_break_logs: input.breakLogs ?? [],
      p_reason: input.reason,
    });

    if (error) {
      throw new Error(mapShiftAdjustmentError(error));
    }

    const updatedResult = await GetShiftById(clerkOrgId, input.shiftId);
    if (!updatedResult.success) {
      throw new Error(updatedResult.error);
    }

    const updatedData = updatedResult.data;

    // Log audit event
    if (beforeShift) {
      const staffProfile = (updatedData as any).staff_profile;
      const staffName = staffProfile
        ? `${staffProfile.first_name} ${staffProfile.last_name}`
        : "Unknown Staff";

      await LogAuditEvent({
        merchantId: updatedData.merchant_id,
        action: "shift_adjusted",
        actionCategory: "staff_shifts",
        resourceType: "staff_shift",
        resourceId: input.shiftId,
        resourceName: staffName,
        locationId: updatedData.location_id,
        changes: {
          before: {
            clock_in_time: beforeShift.clock_in_time,
            clock_out_time: beforeShift.clock_out_time,
            break_logs: beforeShift.break_logs,
            status: beforeShift.status,
            is_verified: beforeShift.is_verified,
          },
          after: {
            clock_in_time: updatedData.clock_in_time,
            clock_out_time: updatedData.clock_out_time,
            break_logs: updatedData.break_logs,
            status: updatedData.status,
            is_verified: updatedData.is_verified,
          },
          reason: input.reason,
        },
        metadata: {
          adjustment_type: "manual",
          staff_name: staffName,
        },
      });
    }

    return { success: true, data: updatedData };
  } catch (error) {
    console.error("[AdjustShiftTimes] error", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? mapShiftAdjustmentError(error)
          : "Failed to adjust shift times",
    };
  }
}

// ============================================================================
// DELETE SHIFT
// ============================================================================

export async function DeleteShift(
  clerkOrgId: string,
  shiftId: string,
): Promise<MutationResult<null>> {
  try {
    const supabase = createServiceRoleClient();
    const merchantId = await getMerchantIdFromClerkOrg(clerkOrgId);

    // Fetch shift before deleting
    const { data: shiftToDelete } = await supabase
      .from("staff_shifts")
      .select(
        `
        *,
        staff_profile:staff_profiles(first_name, last_name)
      `,
      )
      .eq("id", shiftId)
      .single();

    const { error: deleteError } = await supabase
      .from("staff_shifts")
      .delete()
      .eq("id", shiftId)
      .eq("merchant_id", merchantId);

    if (deleteError) throw deleteError;

    // Log audit event
    if (shiftToDelete) {
      const staffName = shiftToDelete.staff_profile
        ? `${shiftToDelete.staff_profile.first_name} ${shiftToDelete.staff_profile.last_name}`
        : "Unknown Staff";
      await LogAuditEvent({
        merchantId: shiftToDelete.merchant_id,
        action: `Deleted Shift: ${staffName}`,
        actionCategory: "staff_shifts",
        resourceType: "staff_shift",
        resourceId: shiftId,
        resourceName: staffName,
        locationId: shiftToDelete.location_id,
      });
    }

    return { success: true, data: null };
  } catch (error) {
    console.error("[DeleteShift] error", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete shift",
    };
  }
}

// ============================================================================
// BULK APPROVE SHIFTS
// ============================================================================

export async function BulkApproveShifts(
  clerkOrgId: string,
  shiftIds: string[],
): Promise<MutationResult<number>> {
  try {
    if (!shiftIds.length) return { success: true, data: 0 };

    const supabase = createServiceRoleClient();
    const merchantId = await getMerchantIdFromClerkOrg(clerkOrgId);

    const { data, error } = await supabase
      .from("staff_shifts")
      .update({
        status: "approved",
        is_verified: true,
        updated_at: new Date().toISOString(),
      })
      .in("id", shiftIds)
      .eq("merchant_id", merchantId)
      .select();

    if (error) throw error;

    const count = data?.length || 0;

    // Log bulk approval
    await LogAuditEvent({
      merchantId: merchantId,
      action: `Bulk Approved ${count} Shifts`,
      actionCategory: "staff_shifts",
      resourceType: "staff_shift",
      resourceId: undefined,
      resourceName: `${count} Shifts`,
      metadata: {
        count,
        shift_ids: shiftIds,
      },
    });

    return { success: true, data: count };
  } catch (error) {
    console.error("[BulkApproveShifts] error", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to approve shifts",
    };
  }
}
