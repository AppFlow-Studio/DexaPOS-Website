"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { currentUser } from "@clerk/nextjs/server";
import {
  AuditLog,
  AuditLogWithLocation,
  AuditLogFilters,
  AdhocExpenseInput,
  AuditCategory,
  AuditSeverity,
} from "@/types/audit-log";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

// ============================================================================
// GET AUDIT LOGS
// ============================================================================

/**
 * Get audit logs for a merchant with optional filters
 * - Global users see all logs
 * - Location admins see only their location's logs
 */
export async function GetAuditLogs(
  clerkOrgId: string,
  filters?: AuditLogFilters,
  limit: number = 50,
  offset: number = 0,
): Promise<{ data?: AuditLogWithLocation[]; total?: number; error?: string }> {
  if (!clerkOrgId) {
    return { error: "Organization ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Get merchant
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    return { error: "Merchant not found" };
  }

  // Build query
  let query = supabase
    .from("audit_logs")
    .select(
      `
      *,
      location:locations(id, name)
    `,
      { count: "exact" },
    )
    .eq("merchant_id", merchant.id)
    .order("created_at", { ascending: false });

  // Apply filters
  if (filters?.location_id && filters.location_id !== "all") {
    // Show logs for specific location OR global logs (null location)
    query = query.or(
      `location_id.eq.${filters.location_id},location_id.is.null`,
    );
  }

  if (filters?.action_category) {
    query = query.eq("action_category", filters.action_category);
  }

  if (filters?.severity) {
    query = query.eq("severity", filters.severity);
  }

  if (filters?.resource_types && filters.resource_types.length > 0) {
    query = query.in("resource_type", filters.resource_types);
  } else if (filters?.resource_type) {
    query = query.eq("resource_type", filters.resource_type);
  }

  // Filter by Staff Profile or Actor
  // PRIORITY: If metadata.staff_profile_id exists, it takes precedence over actor_user_id
  // This ensures orders created by staff via PIN only appear in THEIR activity log,
  // not the device owner's (Clerk user) activity log
  if (filters?.actor_user_id && filters?.staff_profile_id) {
    // For users with both a Clerk user_id AND a staff_profile_id:
    // - Match logs where metadata.staff_profile_id equals their staff_profile_id
    // - OR match logs where actor_user_id matches AND there's NO staff_profile_id in metadata
    //   (backward compatibility for old logs that don't have staff_profile_id)
    query = query.or(
      `metadata->>staff_profile_id.eq.${filters.staff_profile_id},and(actor_user_id.eq.${filters.actor_user_id},metadata->>staff_profile_id.is.null)`,
    );
  } else if (filters?.staff_profile_id) {
    // For POS-only users (no Clerk user_id): filter by staff_profile_id in metadata
    query = query.contains("metadata", {
      staff_profile_id: filters.staff_profile_id,
    });
  } else if (filters?.actor_user_id) {
    // For users with only actor_user_id (no staff_profile_id):
    // Match actor_user_id where there's no staff_profile_id in metadata
    query = query.or(
      `and(actor_user_id.eq.${filters.actor_user_id},metadata->>staff_profile_id.is.null),metadata->>staff_profile_id.eq.${filters.actor_user_id}`,
    );
  }

  if (filters?.date_from) {
    query = query.gte("created_at", filters.date_from);
  }

  if (filters?.date_to) {
    query = query.lte("created_at", filters.date_to);
  }

  if (filters?.search) {
    query = query.or(
      `resource_name.ilike.%${filters.search}%,actor_name.ilike.%${filters.search}%,action.ilike.%${filters.search}%`,
    );
  }

  if (filters?.station_id) {
    query = query.contains("metadata", { station_id: filters.station_id });
  }

  // Pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("Error fetching audit logs:", error);
    return { error: error.message };
  }

  // Transform data
  const logs: AuditLogWithLocation[] = (data || []).map((log) => ({
    ...log,
    location: Array.isArray(log.location) ? log.location[0] : log.location,
  }));

  return { data: logs, total: count || 0 };
}

// ============================================================================
// LOG AUDIT EVENT (Manual logging from server actions)
// ============================================================================

interface LogAuditEventParams {
  clerkOrgId?: string;
  merchantId?: string; // Allow passing merchantId directly
  locationId?: string | null;
  action: string;
  actionCategory: string;
  severity?: "info" | "warning" | "critical";
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    reason?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Helper to compute shallow diff between two objects
 * Returns objects containing only the keys that have changed
 */
function computeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const diffBefore: Record<string, unknown> = {};
  const diffAfter: Record<string, unknown> = {};

  const allKeys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);

  for (const key of Array.from(allKeys)) {
    const valBefore = before?.[key];
    const valAfter = after?.[key];

    // Skip ignored keys
    if (["updated_at", "created_at"].includes(key)) continue;

    // Simple comparison using JSON stringify for basic equality
    // This handles dates (ISO strings) and simple objects reasonably well
    if (JSON.stringify(valBefore) !== JSON.stringify(valAfter)) {
      if (valBefore !== undefined) diffBefore[key] = valBefore;
      if (valAfter !== undefined) diffAfter[key] = valAfter;
    }
  }

  return { before: diffBefore, after: diffAfter };
}

export async function LogAuditEvent(
  params: LogAuditEventParams,
): Promise<{ success?: boolean; logId?: string; error?: string }> {
  const supabase = createServerSupabaseClient();
  let merchantId = params.merchantId;
  let locationId = params.locationId;

  // If locationId is not provided, try to get it from cookies
  if (locationId === undefined || locationId === null) {
    const cookieStore = await cookies();
    const cookieLocationId = cookieStore.get("x-location-id")?.value;
    if (cookieLocationId && cookieLocationId !== "all") {
      locationId = cookieLocationId;
    }
  }

  // Final validation for locationId: "all" should be treated as null (global)
  if (locationId === "all") {
    locationId = null;
  }

  // If merchantId is not provided, try to look it up via Clerk Org ID.
  // Some HQ-only actions are org-scoped (no merchant row), so missing merchant
  // should not block audit logging.
  if (!merchantId) {
    const { orgId: dynamicOrgId } = await auth();
    const activeOrgId = params.clerkOrgId || dynamicOrgId;

    if (!activeOrgId) {
      return { error: "Organization ID is required" };
    }

    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", activeOrgId)
      .single();

    if (merchantError || !merchant) {
      console.warn("[LogAuditEvent] Merchant lookup skipped for org-scoped action:", {
        activeOrgId,
        merchantError,
      });
      merchantId = undefined;
    } else {
      merchantId = merchant.id;
    }
  }

  // Get current user
  const user = await currentUser();
  const userId = user?.id || null;
  const userName = user?.fullName || user?.firstName || "System";

  /**
   * Remove internal IDs and technical fields from the log for a cleaner Manager view.
   */
  const sanitizeRecord = (obj: Record<string, unknown> | undefined) => {
    if (!obj) return undefined;
    const sanitized = { ...obj };
    const technicalKeys = [
      "id",
      "merchant_id",
      "location_id",
      "clerk_org_id",
      "organization_id",
      "org_id",
      "created_at",
      "updated_at",
      "deleted_at",
      "clerkorgid",
    ];

    const isUuid = (val: unknown): boolean =>
      typeof val === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        val,
      );

    Object.keys(sanitized).forEach((key) => {
      const lowerKey = key.toLowerCase();
      const value = sanitized[key];

      const isTechnicalKey = technicalKeys.some(
        (tk) => tk.toLowerCase() === lowerKey,
      );
      const isIdKey =
        lowerKey.endsWith("_id") || key.endsWith("Id") || lowerKey === "id";
      const hasUuidValue = isUuid(value);

      if (isTechnicalKey || isIdKey || hasUuidValue) {
        delete sanitized[key];
      }
    });
    return sanitized;
  };

  // Compute diffs if both before and after are provided to save storage space
  let finalChanges = params.changes;

  if (params.changes?.before || params.changes?.after) {
    const beforeRaw = params.changes.before || {};
    const afterRaw = params.changes.after || {};

    // Compute diff if both exist, otherwise take the one provided (e.g. for Created/Deleted)
    let processedBefore = params.changes.before;
    let processedAfter = params.changes.after;

    if (params.changes.before && params.changes.after) {
      const diff = computeDiff(params.changes.before, params.changes.after);
      processedBefore = diff.before;
      processedAfter = diff.after;
    }

    // Sanitize the result so Managers don't see UUIDs
    finalChanges = {
      ...params.changes,
      before: sanitizeRecord(processedBefore as Record<string, unknown>),
      after: sanitizeRecord(processedAfter as Record<string, unknown>),
    };
  }

  // Call RPC
  const { data, error } = await supabase.rpc("log_audit_event", {
    p_merchant_id: merchantId || null,
    p_location_id: locationId || null,
    p_actor_user_id: userId,
    p_actor_name: userName,
    p_actor_role: null, // Could fetch from member info if needed
    p_action: params.action,
    p_action_category: params.actionCategory,
    p_severity: params.severity || "info",
    p_resource_type: params.resourceType || null,
    p_resource_id: params.resourceId || null,
    p_resource_name: params.resourceName || null,
    p_changes: finalChanges || null,
    p_metadata:
      sanitizeRecord(params.metadata as Record<string, unknown>) || null,
  });

  if (error) {
    console.error("Error logging audit event:", error);
    return { error: error.message };
  }

  return { success: true, logId: data };
}

// ============================================================================
// UPDATE STOCK WITH REASON (Audited)
// ============================================================================

interface UpdateStockWithReasonParams {
  locationId: string;
  inventoryItemId: string;
  newStock: number;
  reason: string;
  source?: "manual" | "adjustment" | "waste" | "transfer";
}

export async function UpdateStockWithReason(
  params: UpdateStockWithReasonParams,
): Promise<{
  success?: boolean;
  previousStock?: number;
  newStock?: number;
  error?: string;
}> {
  const supabase = createServerSupabaseClient();

  // Get current user
  const user = await currentUser();
  const userId = user?.id || null;
  const userName = user?.fullName || user?.firstName || "Unknown User";

  // Both columns are constrained enums — map UI source to both allowed values.
  // update_source: manual | delivery | sale | waste | adjustment | transfer
  // update_reason: received_delivery | manual_adjustment | sale_deduction |
  //                waste_spoilage | physical_count | transfer_in | transfer_out |
  //                initial_stock | other
  const sourceEnumMap: Record<string, { source: string; reason: string }> = {
    manual:     { source: "manual",     reason: "physical_count" },
    adjustment: { source: "adjustment", reason: "manual_adjustment" },
    waste:      { source: "waste",      reason: "waste_spoilage" },
    transfer:   { source: "transfer",   reason: "transfer_in" },
  };
  const mapped = sourceEnumMap[params.source || "manual"] ?? { source: "manual", reason: "physical_count" };

  // Call RPC
  const { data, error } = await supabase.rpc("log_stock_update_with_audit", {
    p_location_id: params.locationId,
    p_inventory_item_id: params.inventoryItemId,
    p_new_stock: params.newStock,
    p_update_reason: mapped.reason,
    p_update_source: mapped.source,
    p_user_id: userId,
    p_user_name: userName,
  });

  if (error) {
    console.error("Error updating stock:", error);
    return { error: error.message };
  }

  return {
    success: data?.success,
    previousStock: data?.previous_stock,
    newStock: data?.new_stock,
  };
}

// ============================================================================
// CREATE ADHOC EXPENSE (Non-vendor purchase)
// ============================================================================

export async function CreateAdhocExpense(
  clerkOrgId: string,
  locationId: string,
  expense: AdhocExpenseInput,
): Promise<{
  success?: boolean;
  purchaseOrderId?: string;
  poNumber?: string;
  error?: string;
}> {
  if (!clerkOrgId) {
    return { error: "Organization ID is required" };
  }

  if (!locationId || locationId === "all") {
    return { error: "A specific location must be selected" };
  }

  if (!expense.expense_vendor_name) {
    return { error: "Vendor/Store name is required" };
  }

  if (expense.items.length === 0) {
    return { error: "At least one item is required" };
  }

  const supabase = createServerSupabaseClient();

  // Get current user
  const user = await currentUser();
  const userId = user?.id || null;
  const userName = user?.fullName || user?.firstName || "Unknown User";

  // Get merchant
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    return { error: "Merchant not found" };
  }

  // Transform items for RPC
  const rpcItems = expense.items.map((item) => ({
    inventory_item_id: item.inventory_item_id || "",
    name: item.name,
    quantity: item.quantity,
    unit_cost: item.unit_cost,
  }));

  // Call RPC
  const { data, error } = await supabase.rpc("create_adhoc_expense", {
    p_merchant_id: merchant.id,
    p_location_id: locationId,
    p_expense_vendor_name: expense.expense_vendor_name,
    p_expense_category: expense.expense_category || null,
    p_expense_notes: expense.expense_notes || null,
    p_payment_method: expense.payment_method,
    p_card_last_four: expense.card_last_four || null,
    p_total_amount: expense.total_amount,
    p_user_id: userId,
    p_user_name: userName,
    p_items: rpcItems,
  });

  if (error) {
    console.error("Error creating adhoc expense:", error);
    return { error: error.message };
  }

  return {
    success: data?.success,
    purchaseOrderId: data?.purchase_order_id,
    poNumber: data?.po_number,
  };
}

// ============================================================================
// GET STOCK UPDATE HISTORY
// ============================================================================

export async function GetStockUpdateHistory(
  clerkOrgId: string,
  inventoryItemId?: string,
  locationId?: string,
  limit: number = 20,
): Promise<{ data?: any[]; error?: string }> {
  if (!clerkOrgId) {
    return { error: "Organization ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Get merchant
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    return { error: "Merchant not found" };
  }

  let query = supabase
    .from("stock_update_log")
    .select(
      `
      *,
      inventory_item:inventory_items(id, name, unit_type),
      location:locations(id, name)
    `,
    )
    .eq("merchant_id", merchant.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (inventoryItemId) {
    query = query.eq("inventory_item_id", inventoryItemId);
  }

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching stock history:", error);
    return { error: error.message };
  }

  return { data: data || [] };
}
