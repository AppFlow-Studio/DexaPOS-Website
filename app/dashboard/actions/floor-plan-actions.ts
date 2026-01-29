"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  FloorPlan,
  FloorPlanObject,
  TableWithSession,
  WaitlistEntry,
  Reservation,
} from "@/types/floor-plan";
import { TableStatus } from "@/types/floor-plan";
import { LogAuditEvent } from "./audit-logs";

/**
 * Server actions for floor plan operations
 * These are called from the client-side store
 */

export async function InitializeFloorPlan(locationId: string) {
  const supabase = createServerSupabaseClient();

  const { data: floorPlans, error: fpError } = await supabase.rpc(
    "get_location_floor_plans",
    {
      p_location_id: locationId,
    },
  );

  if (fpError) {
    throw fpError;
  }

  console.log("[InitializeFloorPlan] floorPlans", floorPlans);
  return floorPlans as FloorPlan[];
}

export async function LoadFloorPlanStatus(floorPlanId: string) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_floor_plan_status", {
    p_floor_plan_id: floorPlanId,
  });

  // console.log('[LoadFloorPlanStatus] data', data)
  if (error) {
    throw error;
  }

  return {
    tables: (data?.tables || []) as TableWithSession[],
  };
}

export async function CreateFloorPlanAction(
  locationId: string,
  name: string,
  description?: string,
) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("create_floor_plan", {
    p_location_id: locationId,
    p_name: name,
    p_description: description,
  });

  if (error) throw error;

  // Reload floor plans
  const { data: floorPlans } = await supabase.rpc("get_location_floor_plans", {
    p_location_id: locationId,
  });

  // Log Audit Event
  await LogAuditEvent({
    action: `Created Floor Plan: ${name}`,
    actionCategory: "settings",
    resourceType: "floor_plan",
    resourceId: data.floor_plan_id,
    resourceName: name,
    locationId: locationId,
    changes: { after: { name, description } },
  });

  return {
    floorPlanId: data.floor_plan_id,
    floorPlans: (floorPlans || []) as FloorPlan[],
  };
}

export async function AddTableAction(
  floorPlanId: string,
  tableData: {
    name?: string;
    shape_id: string;
    category?: string;
    x: number;
    y: number;
    rotation?: number;
    capacity?: number | null;
    width?: number | null;
    height?: number | null;
  },
) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("add_floor_plan_object", {
    p_floor_plan_id: floorPlanId,
    p_name: tableData.name || "Table",
    p_shape_id: tableData.shape_id,
    p_category: tableData.category || "table",
    p_x: tableData.x,
    p_y: tableData.y,
    p_rotation: tableData.rotation || 0,
    p_capacity: tableData.capacity ?? null,
    p_width: tableData.width ?? null,
    p_height: tableData.height ?? null,
  });

  if (error) throw error;

  // Log Audit Event
  LogAuditEvent({
    action: `Added Table: ${tableData.name || "Table"}`,
    actionCategory: "settings",
    resourceType: "table",
    resourceId: data.object_id,
    resourceName: tableData.name || "Table",
    changes: { after: tableData as any },
  });

  return { objectId: data.object_id };
}

export async function UpdateTablePositionAction(
  tableId: string,
  x: number,
  y: number,
  rotation?: number,
) {
  const supabase = createServerSupabaseClient();

  // Fetch context before update
  const { data: table } = await supabase
    .from("floor_plan_objects")
    .select("name, floor_plan:floor_plans(location_id, merchant_id)")
    .eq("id", tableId)
    .single();

  const { error } = await supabase.rpc("update_floor_plan_object_position", {
    p_object_id: tableId,
    p_x: x,
    p_y: y,
    p_rotation: rotation,
  });

  if (error) throw error;

  if (table) {
    const fp = (table as any).floor_plan;
    await LogAuditEvent({
      merchantId: fp?.merchant_id,
      action: `Moved Table: ${table.name}`,
      actionCategory: "settings",
      resourceType: "table",
      resourceId: tableId,
      resourceName: table.name,
      locationId: fp?.location_id,
      changes: { after: { x, y, rotation } },
    });
  }
}

export async function UpdateTablePositionsBatchAction(
  updates: Array<{ id: string; x: number; y: number; rotation?: number }>,
) {
  const supabase = createServerSupabaseClient();
  // console.log("[UpdateTablePositionsBatchAction] updates", updates);

  if (updates.length === 0) return;

  const { error } = await supabase.rpc("update_floor_plan_objects_batch", {
    p_updates: updates,
  });

  if (error) throw error;

  // Log Audit Event (Batched)
  // Fetch context from the first table
  const firstId = updates[0].id;
  const { data: tableContext } = await supabase
    .from("floor_plan_objects")
    .select("floor_plan:floor_plans(id, name, location_id, merchant_id)")
    .eq("id", firstId)
    .single();

  if (tableContext && (tableContext as any).floor_plan) {
    const fp = (tableContext as any).floor_plan;
    await LogAuditEvent({
      merchantId: fp.merchant_id,
      action: `Updated Floor Plan Layout`,
      actionCategory: "settings",
      resourceType: "floor_plan",
      resourceId: fp.id,
      resourceName: fp.name,
      locationId: fp.location_id,
      metadata: {
        tables_updated_count: updates.length,
      },
      changes: { after: { updates_count: updates.length } }, // Simplified change log
    });
  }
}

export async function RemoveTableAction(tableId: string) {
  const supabase = createServerSupabaseClient();

  const { data: tableToDelete } = await supabase
    .from("floor_plan_objects")
    .select("name, floor_plan:floor_plans(location_id, merchant_id)")
    .eq("id", tableId)
    .single();

  const { error } = await supabase
    .from("floor_plan_objects")
    .delete()
    .eq("id", tableId);

  if (error) throw error;

  // Log Audit Event
  if (tableToDelete) {
    // Cast because joined relationship might not be typed fully
    const locationId = (tableToDelete as any).floor_plan?.location_id;
    const merchantId = (tableToDelete as any).floor_plan?.merchant_id;

    await LogAuditEvent({
      merchantId: merchantId,
      action: `Removed Table: ${tableToDelete.name}`,
      actionCategory: "settings",
      resourceType: "table",
      resourceId: tableId,
      resourceName: tableToDelete.name,
      locationId: locationId,
      severity: "warning",
    });
  }
}

export async function UpdateTableRotationAction(
  tableId: string,
  rotation: number,
) {
  const supabase = createServerSupabaseClient();

  // Fetch context
  const { data: table } = await supabase
    .from("floor_plan_objects")
    .select("name, floor_plan:floor_plans(location_id, merchant_id)")
    .eq("id", tableId)
    .single();

  const { error } = await supabase
    .from("floor_plan_objects")
    .update({ rotation })
    .eq("id", tableId);

  if (error) throw error;

  if (table) {
    const fp = (table as any).floor_plan;
    await LogAuditEvent({
      merchantId: fp?.merchant_id,
      action: `Rotated Table: ${table.name}`,
      actionCategory: "settings",
      resourceType: "table",
      resourceId: tableId,
      resourceName: table.name,
      locationId: fp?.location_id,
      changes: { after: { rotation } },
    });
  }
}

export async function UpdateTableNameAction(tableId: string, name: string) {
  const supabase = createServerSupabaseClient();

  // Fetch table for context
  const { data: table } = await supabase
    .from("floor_plan_objects")
    .select("name, floor_plan:floor_plans(location_id, merchant_id)")
    .eq("id", tableId)
    .single();

  const { error } = await supabase
    .from("floor_plan_objects")
    .update({ name })
    .eq("id", tableId);

  if (error) throw error;

  if (table) {
    const locationId = (table as any).floor_plan?.location_id;
    const merchantId = (table as any).floor_plan?.merchant_id;

    await LogAuditEvent({
      merchantId: merchantId,
      action: `Renamed Table: ${table.name} -> ${name}`,
      actionCategory: "settings",
      resourceType: "table",
      resourceId: tableId,
      resourceName: name,
      locationId: locationId,
      changes: {
        before: { name: table.name },
        after: { name },
      },
    });
  }
}

export async function MergeTablesAction(
  tableIds: string[],
  primaryTableId: string,
) {
  // Note: Merging is a design-time feature for grouping tables visually.
  // Since the database schema doesn't have merged_with/is_primary columns in floor_plan_objects,
  // we'll handle this client-side. The merge state will be stored in the component state
  // and can be persisted later if needed via a metadata JSONB field or separate table.
  // For now, this action is a no-op - merging is handled entirely client-side.
  return { success: true };
}

export async function UnmergeTablesAction(tableId: string) {
  // Note: Unmerging is handled client-side (see MergeTablesAction comment)
  return { success: true };
}

export async function LoadWaitlistAction(locationId: string) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_waitlist", {
    p_location_id: locationId,
  });

  if (error) throw error;

  return {
    waitlist: (data?.waitlist || []) as WaitlistEntry[],
    summary: (data?.summary || {
      total_waiting: 0,
      total_notified: 0,
      avg_wait_time: 0,
    }) as {
      total_waiting: number;
      total_notified: number;
      avg_wait_time: number;
    },
  };
}

export async function LoadReservationsAction(
  locationId: string,
  date?: string,
) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_reservations", {
    p_location_id: locationId,
    p_date: date,
  });

  if (error) throw error;

  return (data || []) as Reservation[];
}

export async function AddToWaitlistAction(
  locationId: string,
  params: {
    partyName: string;
    partySize: number;
    phone?: string;
    notes?: string;
    preferredSection?: string;
    quotedWaitMinutes?: number;
  },
) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("add_to_waitlist", {
    p_location_id: locationId,
    p_party_name: params.partyName,
    p_party_size: params.partySize,
    p_phone: params.phone || null,
    p_notes: params.notes || null,
    p_preferred_section: params.preferredSection || null,
    p_quoted_wait_minutes: params.quotedWaitMinutes || null,
  });

  if (error) throw error;

  // Log Audit Event
  await LogAuditEvent({
    action: `Added to Waitlist: ${params.partyName}`,
    actionCategory: "waitlist",
    resourceType: "waitlist_entry",
    resourceId: data.waitlist_id,
    resourceName: params.partyName,
    locationId: locationId,
    metadata: {
      party_size: params.partySize,
      phone: params.phone,
      quoted_wait: params.quotedWaitMinutes,
      preferred_section: params.preferredSection,
    },
    changes: { after: params as unknown as Record<string, unknown> },
  });

  return {
    waitlistId: data.waitlist_id,
    position: data.position,
    quotedWait: data.quoted_wait_minutes,
    success: true,
  };
}
