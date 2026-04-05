"use server";

import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import twilio from "twilio";
import { assertHQPermission } from "@/lib/admin/auth";
import {
  Order,
  OrderItem,
  OrderPayment,
  OrderItemModifier,
  OrderResponse,
  OrderFilters,
} from "@/types/order-management";
import type {
  OrderFullHistory,
  OrderFullHistoryTimelineEvent,
  TimelineCategory,
  TimelineSeverity,
} from "@/types/order-full-history";

/** Application-level check: returns merchant_id and location_ids the user can access. */
async function getUserOrderAccess(): Promise<{
  merchantId: string | null;
  locationIds: string[];
} | null> {
  const { userId, orgId } = await auth();
  if (!userId) return null;

  const supabase = createServerSupabaseClient();

  let merchantId: string | null = null;
  let clerkOrgId: string | null = orgId ?? null;

  // Primary path: use Clerk orgId directly to find the merchant
  if (clerkOrgId) {
    const { data: merchant } = await supabase
      .from("merchants")
      .select("id")
      .eq("clerk_org_id", clerkOrgId)
      .single();
    merchantId = merchant?.id ?? null;
  }

  // Fallback: navigate through users -> members -> organizations -> merchants
  if (!merchantId) {
    const { data: userData } = await supabase
      .from("users")
      .select(
        `
        members(
          organization_id,
          organizations(
            clerk_org_id,
            merchants(id)
          )
        )
      `
      )
      .eq("id", userId)
      .single();

    const members = (userData as any)?.members ?? [];
    const org = members[0]?.organizations;
    merchantId = org?.merchants?.id ?? null;
    clerkOrgId = clerkOrgId ?? org?.clerk_org_id ?? null;
  }

  if (!merchantId || !clerkOrgId) return null;

  // Check if user has merchant-level role (owner/admin) -> all locations
  const { data: memberRole } = await supabase
    .from("members")
    .select("role")
    .eq("organization_id", clerkOrgId)
    .eq("user_id", userId)
    .single();

  const isOwnerOrAdmin =
    memberRole?.role === "merchant.owner" ||
    memberRole?.role === "org:admin" ||
    memberRole?.role === "admin";

  if (isOwnerOrAdmin) {
    const { data: locations } = await supabase
      .from("locations")
      .select("id")
      .eq("merchant_id", merchantId);
    return {
      merchantId,
      locationIds: (locations ?? []).map((l) => l.id),
    };
  }

  // Get location_ids from location_members (user_id or staff_profile_id)
  const { data: staffProfile } = await supabase
    .from("staff_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  const orFilter = staffProfile?.id
    ? `user_id.eq.${userId},staff_profile_id.eq.${staffProfile.id}`
    : `user_id.eq.${userId}`;

  const { data: locationMembers } = await supabase
    .from("location_members")
    .select("location_id")
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .or(orFilter);

  return {
    merchantId,
    locationIds: [...new Set((locationMembers ?? []).map((lm) => lm.location_id))],
  };
}

export async function GetOrders(
  clerkOrgId: string,
  locationId?: string | null,
  filters?: OrderFilters
): Promise<OrderResponse[]> {
  if (!clerkOrgId) {
    return [];
  }

  // Use service role to bypass RLS on joined tables (staff_profiles, users)
  // so Staff column can display creator names. Access control is enforced
  // by filtering orders by merchant_id from the user's clerk org.
  const supabase = createServiceRoleClient();

  // Get merchant ID from clerk org ID
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (merchantError || !merchant) {
    console.error("[GetOrders] Error getting merchant:", merchantError);
    return [];
  }

  // Build query with location filtering
  let query = supabase
    .from("orders")
    .select(
      `
            *,
            created_by_staff:staff_profiles!orders_created_by_staff_id_fkey(first_name, last_name, display_name),
            created_by_user:users!orders_created_by_user_id_fkey(first_name, last_name),
            order_items(
            *,
            order_item_modifiers(
                *
            )
            ),
            order_payments(*)
            `
    )
    .eq("merchant_id", merchant.id);

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  // Apply filters
  if (filters) {
    // Date Range
    if (filters.dateRange?.from) {
      query = query.gte("created_at", filters.dateRange.from.toISOString());
    }
    if (filters.dateRange?.to) {
      // Set to end of day if it's the same as from or if only date is provided
      const toDate = new Date(filters.dateRange.to);
      toDate.setHours(23, 59, 59, 999);
      query = query.lte("created_at", toDate.toISOString());
    }

    // Status
    if (filters.status && filters.status.length > 0) {
      query = query.in("status", filters.status);
    }

    // Order Type
    if (filters.orderType && filters.orderType.length > 0) {
      query = query.in("order_type", filters.orderType);
    }

    // Staff
    if (filters.staffId && filters.staffId !== "all") {
      query = query.eq("created_by_staff_id", filters.staffId);
    }

    // Amount Range
    if (filters.amountRange?.min !== undefined) {
      query = query.gte("total_amount", filters.amountRange.min);
    }
    if (filters.amountRange?.max !== undefined) {
      query = query.lte("total_amount", filters.amountRange.max);
    }
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("[GetOrders] Error getting orders:", error);
    return [];
  }

  let result = (data as OrderResponse[]) || [];

  // Enrich orders with staff/user names (embedded join can fail; batch fetch is reliable)
  const staffIds = [...new Set(result.map((o) => o.created_by_staff_id).filter(Boolean))] as string[];
  const userIds = [...new Set(result.map((o) => o.created_by_user_id).filter(Boolean))] as string[];

  const [staffRes, userRes] = await Promise.all([
    staffIds.length > 0
      ? supabase
          .from("staff_profiles")
          .select("id, first_name, last_name, display_name")
          .in("id", staffIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null; display_name: string | null }[] }),
    userIds.length > 0
      ? supabase
          .from("users")
          .select("id, first_name, last_name")
          .in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null }[] }),
  ]);

  const staffById = new Map<string, { first_name?: string | null; last_name?: string | null; display_name?: string | null }>();
  for (const s of staffRes.data ?? []) {
    if (s?.id) staffById.set(s.id, s);
  }
  const userById = new Map<string, { first_name?: string | null; last_name?: string | null }>();
  for (const u of userRes.data ?? []) {
    if (u?.id) userById.set(u.id, u);
  }

  for (const order of result) {
    if (!order.created_by_staff && order.created_by_staff_id) {
      const s = staffById.get(order.created_by_staff_id);
      if (s) {
        (order as any).created_by_staff = {
          first_name: s.first_name ?? undefined,
          last_name: s.last_name ?? undefined,
          display_name: s.display_name ?? undefined,
        };
      }
    }
    if (!order.created_by_user && order.created_by_user_id) {
      const u = userById.get(order.created_by_user_id);
      if (u) {
        (order as any).created_by_user = {
          first_name: u.first_name ?? undefined,
          last_name: u.last_name ?? undefined,
        };
      }
    }
  }

  // In-memory filter for Payment Method
  if (filters?.paymentMethod && filters.paymentMethod.length > 0) {
    result = result.filter((order) => {
      // If order has no payments, it doesn't match a specific payment method filter
      if (!order.order_payments || order.order_payments.length === 0)
        return false;

      // Check if any of the order's payments match the selected methods
      return order.order_payments.some((payment) =>
        filters.paymentMethod?.includes(payment.payment_method)
      );
    });
  }

  return result;
}

export async function GetOrderDetails(
  orderId: string
): Promise<OrderResponse | null> {
  if (!orderId) {
    return null;
  }

  // Use service role so we can read the order; access is enforced in application code
  // (same pattern as GetOrders). This avoids RLS blocking merchant owners who have
  // no staff_profiles row but do have access via Clerk org/members.
  const supabase = createServiceRoleClient();

  try {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        `
                *,
                location:locations!orders_location_id_fkey(name),
                created_by_staff:staff_profiles!orders_created_by_staff_id_fkey(first_name, last_name, display_name),
                created_by_user:users!orders_created_by_user_id_fkey(first_name, last_name),
                assigned_server:staff_profiles!orders_assigned_server_id_fkey(first_name, last_name, display_name),
                station:stations!orders_station_id_fkey(station_name, device_name),
                order_items(
                    *,
                    order_item_modifiers(*)
                ),
                order_payments(
                    *,
                    order_payment_items(
                        *,
                        order_items(id, item_name, quantity)
                    )
                ),
                order_status_history(
                *,
                users(first_name, last_name),
                staff_profiles(first_name, last_name)
                ),
                table_sessions!table_sessions_order_id_fkey(
                *,
                table_session_events(
                *,
                staff_profiles(first_name, last_name)
                ),
                server:staff_profiles!table_sessions_server_staff_id_fkey(first_name, last_name, display_name)
                )
                `
      )
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      console.error("[GetOrderDetails] Error getting order:", orderError);
      return null;
    }

    const orderObj = order as OrderResponse & { merchant_id?: string; location_id?: string };

    // Enforce access: HQ admin with permission, or merchant/location in user scope
    try {
      try {
        await assertHQPermission("hq.merchant.view");
        return orderObj as OrderResponse;
      } catch {
        const userAccess = await getUserOrderAccess();
        if (!userAccess) return null;
        if (
          orderObj.merchant_id !== userAccess.merchantId ||
          !userAccess.locationIds.includes(orderObj.location_id)
        ) {
          return null;
        }
        return orderObj as OrderResponse;
      }
    } catch {
      return null;
    }
  } catch (error) {
    console.error("[GetOrderDetails] Unexpected error:", error);
    return null;
  }
}

const formatName = (first?: string | null, last?: string | null) => {
  const full = `${first ?? ""} ${last ?? ""}`.trim();
  return full.length ? full : null;
};

const severityForStatus = (toStatus?: string | null): TimelineSeverity => {
  if (!toStatus) return "info";
  if (toStatus === "completed") return "success";
  if (toStatus === "cancelled" || toStatus === "void") return "error";
  return "info";
};

const severityForPaymentEvent = (eventType?: string | null): TimelineSeverity => {
  if (!eventType) return "info";
  const t = eventType.toLowerCase();
  if (t.includes("capture") || t.includes("authorized") || t.includes("approve"))
    return "success";
  if (t.includes("fail") || t.includes("declin") || t.includes("error"))
    return "error";
  if (t.includes("void") || t.includes("refund") || t.includes("reversal"))
    return "warning";
  return "info";
};

const makeEvent = (e: OrderFullHistoryTimelineEvent) => e;

export async function GetOrderFullHistory(
  orderId: string
): Promise<OrderFullHistory | null> {
  if (!orderId) return null;

  const supabase = createServerSupabaseClient();

  // Reuse existing GetOrderDetails query (already battle-tested and RLS-safe)
  const orderDetails = await GetOrderDetails(orderId);
  if (!orderDetails) {
    console.error("[GetOrderFullHistory] Order not found for id:", orderId);
    return null;
  }

  // Application-level check: prevent cross-merchant/cross-location access
  // HQ/Carrier admins with hq.merchant.view can access any merchant's orders.
  // Merchant users are restricted to their own merchant/locations.
  const order: any = orderDetails;
  try {
    try {
      await assertHQPermission("hq.merchant.view");
      // HQ admin with permission — allow access
    } catch {
      // Not HQ admin — apply merchant/location scope check
      const userAccess = await getUserOrderAccess();
      if (userAccess) {
        if (
          order.merchant_id !== userAccess.merchantId ||
          !userAccess.locationIds.includes(order.location_id)
        ) {
          console.error(
            "[GetOrderFullHistory] Access denied: order merchant/location not in user scope"
          );
          const err = new Error("ACCESS_DENIED") as Error & { code?: string };
          err.code = "ACCESS_DENIED";
          throw err;
        }
      }
    }
  } catch (accessErr: unknown) {
    const err = accessErr as Error & { code?: string };
    if (err?.code === "ACCESS_DENIED") {
      throw accessErr; // Propagate so API can return 403
    }
    console.warn("[GetOrderFullHistory] Access check failed, continuing with RLS protection:", accessErr);
  }

  const paymentIds: string[] = (order.order_payments || [])
    .map((p: any) => p?.id)
    .filter(Boolean);

  const sessionId: string | null = order.session_id ?? null;

  const staffIds = new Set<string>();

  if (order.created_by_staff_id) staffIds.add(order.created_by_staff_id);
  if (order.assigned_server_id) staffIds.add(order.assigned_server_id);
  if (order.voided_by) staffIds.add(order.voided_by);

  for (const oi of order.order_items || []) {
    if (oi?.voided_by) staffIds.add(oi.voided_by);
    if (oi?.assigned_to_staff_id) staffIds.add(oi.assigned_to_staff_id);
    if (oi?.discount_applied_by) staffIds.add(oi.discount_applied_by);
    if (oi?.discount_approved_by) staffIds.add(oi.discount_approved_by);
  }

  for (const osh of order.order_status_history || []) {
    if (osh?.changed_by_staff_id) staffIds.add(osh.changed_by_staff_id);
  }

  for (const op of order.order_payments || []) {
    if (op?.processed_by_staff_id) staffIds.add(op.processed_by_staff_id);
    if (op?.voided_by) staffIds.add(op.voided_by);
    if (op?.refunded_by) staffIds.add(op.refunded_by);
    if (op?.tip_adjusted_by) staffIds.add(op.tip_adjusted_by);
  }

  for (const ts of order.table_sessions || []) {
    if (ts?.server_staff_id) staffIds.add(ts.server_staff_id);
    for (const tse of ts?.table_session_events || []) {
      if (tse?.triggered_by_staff_id) staffIds.add(tse.triggered_by_staff_id);
    }
  }

  const stationId: string | null = order.station_id ?? null;
  const createdByUserId: string | null = order.created_by_user_id ?? null;

  const [
    paymentEventsRes,
    reversalsRes,
    discountsRes,
    chargebacksRes,
    auditRes,
    sessionTablesRes,
    staffProfilesRes,
    stationRes,
    createdByUserRes,
    kdsItemStatusRes,
  ] = await Promise.all([
    paymentIds.length
      ? supabase
          .from("payment_events")
          .select("*, staff_profiles(first_name, last_name)")
          .in("payment_id", paymentIds)
          .order("event_timestamp", { ascending: true })
      : Promise.resolve({ data: [], error: null } as any),
    paymentIds.length
      ? supabase
          .from("reversals")
          .select(
            `
              *,
              initiated_by_profile:staff_profiles!reversals_initiated_by_fkey(first_name, last_name),
              approved_by_profile:staff_profiles!reversals_approved_by_fkey(first_name, last_name),
              order_refund_items(*, order_items(item_name))
            `
          )
          .in("original_payment_id", paymentIds)
          .order("requested_at", { ascending: true })
      : Promise.resolve({ data: [], error: null } as any),
    supabase
      .from("discount_usage_log")
      .select(
        `
          *,
          discounts(name),
          applied_by:staff_profiles!discount_usage_log_applied_by_staff_profiles_id_fkey(first_name, last_name),
          order_items(item_name)
        `
      )
      .eq("order_id", orderId)
      .order("applied_at", { ascending: true }),
    paymentIds.length
      ? supabase
          .from("chargebacks")
          .select("*")
          .in("original_payment_id", paymentIds)
          .order("received_at", { ascending: true })
      : Promise.resolve({ data: [], error: null } as any),
    paymentIds.length
      ? supabase
          .from("payment_audit_log")
          .select("*")
          .eq("resource_type", "payment")
          .in("resource_id", paymentIds)
          .order("event_timestamp", { ascending: true })
      : Promise.resolve({ data: [], error: null } as any),
    sessionId
      ? supabase
          .from("table_session_tables")
          .select("is_primary, table_id, is_active, floor_plan_objects(name)")
          .eq("session_id", sessionId)
      : Promise.resolve({ data: [], error: null } as any),
    staffIds.size
      ? supabase
          .from("staff_profiles")
          .select("id, first_name, last_name, display_name")
          .in("id", Array.from(staffIds))
      : Promise.resolve({ data: [], error: null } as any),
    stationId
      ? supabase
          .from("stations")
          .select("station_name, device_name")
          .eq("id", stationId)
          .single()
      : Promise.resolve({ data: null, error: null } as any),
    createdByUserId
      ? supabase
          .from("users")
          .select("first_name, last_name")
          .eq("id", createdByUserId)
          .single()
      : Promise.resolve({ data: null, error: null } as any),
    supabase
      .from("kds_item_status")
      .select("order_item_id, status, started_at, completed_at")
      .eq("order_id", orderId)
      .not("status", "eq", "cancelled"),
  ]);

  if (paymentEventsRes?.error)
    console.error("[GetOrderFullHistory] Error getting payment events:", paymentEventsRes.error);
  if (reversalsRes?.error)
    console.error("[GetOrderFullHistory] Error getting reversals:", reversalsRes.error);
  if (discountsRes?.error)
    console.error("[GetOrderFullHistory] Error getting discounts:", discountsRes.error);
  if (chargebacksRes?.error)
    console.error("[GetOrderFullHistory] Error getting chargebacks:", chargebacksRes.error);
  if (auditRes?.error)
    console.error("[GetOrderFullHistory] Error getting audit log:", auditRes.error);
  if (sessionTablesRes?.error)
    console.error("[GetOrderFullHistory] Error getting session tables:", sessionTablesRes.error);
  if (staffProfilesRes?.error)
    console.error("[GetOrderFullHistory] Error getting staff profiles:", staffProfilesRes.error);
  if (stationRes?.error)
    console.error("[GetOrderFullHistory] Error getting station:", stationRes.error);
  if (createdByUserRes?.error)
    console.error("[GetOrderFullHistory] Error getting created-by user:", createdByUserRes.error);
  if (kdsItemStatusRes?.error)
    console.error("[GetOrderFullHistory] Error getting KDS item status:", kdsItemStatusRes.error);

  // Build map: order_item_id -> best KDS row (status, started_at, completed_at).
  // KDS is source of truth for kitchen status; order_items may not be synced.
  // Prefer most advanced status: completed > ready > preparing > new.
  const kdsStatusOrder: Record<string, number> = {
    completed: 4,
    ready: 3,
    preparing: 2,
    new: 1,
    pending: 0,
  };
  const kdsByOrderItemId = new Map<
    string,
    { status: string; started_at: string | null; completed_at: string | null }
  >();
  for (const row of kdsItemStatusRes?.data ?? []) {
    const existing = kdsByOrderItemId.get(row.order_item_id);
    const rank = kdsStatusOrder[row.status?.toLowerCase()] ?? 0;
    const existingRank = existing ? kdsStatusOrder[existing.status?.toLowerCase()] ?? 0 : -1;
    if (rank > existingRank) {
      kdsByOrderItemId.set(row.order_item_id, {
        status: row.status ?? "new",
        started_at: row.started_at ?? null,
        completed_at: row.completed_at ?? null,
      });
    }
  }

  // Normalize kitchen status for UI: "served" (order_items) and "completed" (KDS) both show as "completed".
  const normalizeKitchenStatus = (s: string | null | undefined): string | null => {
    if (s == null) return null;
    const lower = s.toLowerCase();
    return lower === "served" ? "completed" : lower;
  };

  const staffNameById = new Map<string, string>();
  for (const sp of staffProfilesRes?.data || []) {
    const name =
      sp.display_name ?? formatName(sp.first_name, sp.last_name) ?? null;
    if (sp.id && name) staffNameById.set(sp.id, name);
  }

  const getStaffName = (id?: string | null) => (id ? staffNameById.get(id) ?? null : null);

  const primaryTableName: string | null = (() => {
    const rows = sessionTablesRes?.data || [];
    const primary = rows.find((r: any) => r?.is_primary);
    const first = rows[0];
    const pick = primary ?? first;
    return pick?.floor_plan_objects?.name ?? null;
  })();

  const orderHeader: OrderFullHistory["order"] = {
    id: order.id,
    display_number: order.display_number ?? null,
    order_number: order.order_number,
    status: order.status,
    order_type: order.order_type,
    pricing_mode: order.payment_pricing_mode ?? null,
    created_at: order.created_at,
    completed_at: order.completed_at ?? null,
    cancelled_at: order.cancelled_at ?? null,
    cancellation_reason: order.cancellation_reason ?? null,
    created_by_staff_name:
      formatName(order.created_by_staff?.first_name, order.created_by_staff?.last_name) ??
      (order.created_by_staff?.display_name as string | null) ??
      getStaffName(order.created_by_staff_id),
    created_by_user_name:
      formatName(createdByUserRes?.data?.first_name, createdByUserRes?.data?.last_name),
    device_id: order.device_id ?? null,
    station_name:
      (order as any).station?.station_name ??
      (order as any).station?.device_name ??
      stationRes?.data?.station_name ??
      stationRes?.data?.device_name ??
      null,
    location_name: (order as any).location?.name ?? (order as any).locations?.name ?? null,
    table_session_id: sessionId,
    table_name: primaryTableName,
    server_name:
      getStaffName(order.table_sessions?.[0]?.server_staff_id) ??
      getStaffName(order.assigned_server_id),
    party_size: order.table_sessions?.[0]?.party_size ?? null,
    customer_name: order.customer_name ?? null,
    customer_phone: order.customer_phone ?? null,
    card_subtotal: order.card_subtotal ?? null,
    cash_subtotal: order.cash_subtotal ?? null,
    cash_discount_amount: order.cash_discount_amount ?? null,
    tax_amount: order.tax_amount,
    discount_amount: order.discount_amount,
    amount_paid: order.amount_paid,
    amount_due: order.amount_due,
    effective_total: order.effective_total ?? null,
    internal_notes: order.internal_notes ?? null,
    voided_at: (order as any).voided_at ?? null,
    voided_by_name: getStaffName((order as any).voided_by),
    voided_by: (order as any).voided_by ?? null,
    void_reason: (order as any).void_reason ?? null,
  };

  const paymentEvents = (paymentEventsRes?.data || []) as any[];
  const paymentEventsByPaymentId = new Map<string, any[]>();
  for (const pe of paymentEvents) {
    if (!pe?.payment_id) continue;
    const arr = paymentEventsByPaymentId.get(pe.payment_id) ?? [];
    arr.push(pe);
    paymentEventsByPaymentId.set(pe.payment_id, arr);
  }

  const payments: OrderFullHistory["payments"] = (order.order_payments || []).map(
    (op: any) => {
      const events = (paymentEventsByPaymentId.get(op.id) ?? []).map((pe) => ({
        event_type: pe.event_type,
        timestamp: pe.event_timestamp,
        previous_status: pe.previous_status ?? null,
        new_status: pe.new_status ?? null,
        amount: pe.amount ?? null,
        tip_amount: pe.tip_amount ?? null,
        auth_code: pe.auth_code ?? null,
        result_code: pe.result_code ?? null,
        response_message: pe.response_message ?? null,
        reason: pe.reason ?? null,
        terminal_id: pe.terminal_id ?? null,
        staff_name:
          formatName(pe.staff_profiles?.first_name, pe.staff_profiles?.last_name) ??
          getStaffName(pe.staff_id),
      }));

      const paymentItems = (op.order_payment_items || []).map((opi: any) => ({
        item_name: opi?.order_items?.item_name ?? "Item",
        quantity_paid: opi.quantity_paid,
        subtotal_paid: opi.subtotal_paid,
        tax_paid: opi.tax_paid ?? null,
      }));

      return {
        id: op.id,
        payment_method: op.payment_method,
        amount: op.amount,
        tip_amount: op.tip_amount,
        total_amount: op.total_amount,
        status: op.status,
        card_type: op.card_type ?? null,
        card_last_four: op.card_last_four ?? null,
        auth_code: op.auth_code ?? null,
        authorization_code: op.authorization_code ?? null,
        terminal_type: op.terminal_type ?? null,
        terminal_id: op.terminal_id ?? null,
        batch_number: op.batch_number ?? null,
        dejavoo_batch_number: op.dejavoo_batch_number ?? null,
        dejavoo_invoice_number: op.dejavoo_invoice_number ?? null,
        psp_reference: op.processor_response?.psp_reference ?? null,
        transaction_id: op.transaction_id ?? null,
        captured_at: op.captured_at ?? null,
        authorized_at: op.authorized_at ?? null,
        approved_at: op.approved_at ?? null,
        created_at: op.initiated_at,
        processed_by_name: getStaffName(op.processed_by_staff_id),
        amount_tendered: op.amount_tendered ?? null,
        change_given: op.change_given ?? null,
        voided_at: op.voided_at ?? null,
        voided_by_name: getStaffName(op.voided_by),
        voided_by: op.voided_by ?? null,
        void_reason: op.void_reason ?? null,
        tip_adjusted_at: op.tip_adjusted_at ?? null,
        original_tip_amount: op.original_tip_amount != null ? Number(op.original_tip_amount) : null,
        tip_adjusted_by_name: getStaffName(op.tip_adjusted_by) ?? null,
        result_code: op.result_code ?? null,
        response_message: op.response_message ?? op.dejavoo_response_message ?? null,
        split_count: op.split_count ?? null,
        split_portion_index: op.split_portion_index ?? null,
        covers_items: op.covers_items ?? null,
        payment_items: paymentItems.length ? paymentItems : null,
        events,
      };
    }
  );

  const items: OrderFullHistory["items"] = (order.order_items || []).map(
    (oi: any) => {
      const kds = oi.id ? kdsByOrderItemId.get(oi.id) : undefined;
      const kitchenStatus = normalizeKitchenStatus(
        kds?.status ?? oi.kitchen_status ?? null
      );
      const fireTime = oi.fire_time ?? oi.sent_to_kitchen_at ?? null;
      const completedAt = kds?.completed_at ?? oi.completed_at ?? null;
      const rawPreparingAt = kds?.started_at ?? oi.preparing_at ?? oi.started_preparing_at ?? null;
      const rawReadyAt = oi.ready_at ?? null;
      // Normalize to same-second for equality (ISO strings can differ by ms)
      const sameMoment = (a: string | null, b: string | null) => {
        if (!a || !b) return false;
        const tA = new Date(a).getTime();
        const tB = new Date(b).getTime();
        return Number.isFinite(tA) && Number.isFinite(tB) && tA === tB;
      };
      // Don't send duplicate timestamps: if Preparing/Ready equal fire or completed, send null so UI shows time once
      const preparingAt =
        !rawPreparingAt ||
        sameMoment(rawPreparingAt, fireTime) ||
        sameMoment(rawPreparingAt, completedAt)
          ? null
          : rawPreparingAt;
      const readyAt =
        !rawReadyAt || sameMoment(rawReadyAt, fireTime) || sameMoment(rawReadyAt, completedAt)
          ? null
          : rawReadyAt;
      return {
        id: oi.id,
        item_name: oi.item_name,
        quantity: oi.quantity,
        unit_price: oi.unit_price,
        subtotal: oi.subtotal,
        cash_unit_price: oi.cash_unit_price ?? oi.cash_price ?? null,
        category_name: oi.category_name ?? null,
        course_number: oi.course_number ?? null,
        is_voided: Boolean(oi.is_voided),
        void_reason: oi.void_reason ?? null,
        voided_at: oi.voided_at ?? null,
        voided_by_name: getStaffName(oi.voided_by),
        is_open_item: Boolean(oi.is_open_item),
        is_tax_exempt: Boolean(oi.is_tax_exempt),
        special_instructions: oi.special_instructions ?? null,
        kitchen_status: kitchenStatus,
        kitchen_notes: oi.kitchen_notes ?? null,
        fire_time: fireTime,
        preparing_at: preparingAt,
        ready_at: readyAt,
        completed_at: completedAt,
        item_status: oi.item_status,
        created_at: oi.created_at,
        discount_name: oi.discount_name ?? null,
        discount_amount: oi.discount_amount ?? null,
        discount_type: oi.discount_type ?? null,
        modifiers: (oi.order_item_modifiers || []).map((m: any) => ({
          modifier_group_name: m.modifier_group_name,
          modifier_name: m.modifier_name,
          price_modifier: m.price_modifier,
          quantity: m.quantity,
        })),
      };
    }
  );

  const reversals: OrderFullHistory["reversals"] = (reversalsRes?.data || []).map(
    (r: any) => ({
      // Resolve original payment info from already-loaded order_payments
      // (avoids an extra query/join)
      id: r.id,
      reversal_type: r.reversal_type,
      amount: r.amount,
      status: r.status,
      reason_code: r.reason_code ?? null,
      reason_description: r.reason_description ?? null,
      requested_at: r.requested_at,
      completed_at: r.processed_at ?? null,
      initiated_by_name:
        formatName(r.initiated_by_profile?.first_name, r.initiated_by_profile?.last_name) ??
        getStaffName(r.initiated_by),
      approved_by_name:
        formatName(r.approved_by_profile?.first_name, r.approved_by_profile?.last_name) ??
        getStaffName(r.approved_by),
      reversal_reference_id: r.reversal_reference_id,
      original_payment_method:
        (order.order_payments || []).find((p: any) => p?.id === r.original_payment_id)
          ?.payment_method ?? "unknown",
      original_card_last_four:
        (order.order_payments || []).find((p: any) => p?.id === r.original_payment_id)
          ?.card_last_four ?? null,
      result_code: r.result_code ?? null,
      response_message: r.response_message ?? null,
      refund_items: (r.order_refund_items || []).map((ri: any) => ({
        order_item_id: ri.order_item_id,
        item_name: ri.item_name ?? ri.order_items?.item_name ?? "Item",
        quantity_refunded: ri.quantity_refunded,
        amount: ri.amount ?? ri.subtotal ?? ri.refund_amount ?? 0,
        tax_refunded: ri.tax_refunded ?? ri.tax_amount ?? null,
        reason: ri.reason ?? null,
        returned_to_inventory: Boolean(ri.returned_to_inventory),
      })),
    })
  );

  const discounts: OrderFullHistory["discounts"] = (discountsRes?.data || []).map(
    (d: any) => ({
      discount_name: d.discounts?.name ?? "Discount",
      discount_amount: d.discount_amount,
      applied_at: d.applied_at,
      applied_by_name:
        formatName(d.applied_by?.first_name, d.applied_by?.last_name) ??
        getStaffName(d.applied_by_staff_profiles_id),
      voided: Boolean(d.voided),
      voided_at: d.voided_at ?? null,
      target: d.order_item_id ? "item" : "order",
      target_item_name: d.order_items?.item_name ?? null,
    })
  );

  const chargebacks: OrderFullHistory["chargebacks"] = (chargebacksRes?.data || []).map(
    (c: any) => ({
      id: c.id,
      amount: c.amount,
      reason_code: c.reason_code,
      reason_description: c.reason_description ?? null,
      status: c.status,
      received_at: c.received_at,
      defense_deadline: c.defense_deadline ?? null,
      resolution: c.resolution ?? null,
      resolved_at: c.resolved_at ?? null,
    })
  );

  const timeline: OrderFullHistoryTimelineEvent[] = [];

  // Order created
  timeline.push(
    makeEvent({
      timestamp: order.created_at,
      category: "status",
      event_type: "order_created",
      description: "Order created",
      actor_name: orderHeader.created_by_staff_name ?? orderHeader.created_by_user_name ?? "System",
      actor_role: orderHeader.created_by_staff_name ? "Staff" : orderHeader.created_by_user_name ? "User" : "System",
      details: { status: order.status },
      severity: "info",
    })
  );

  // Status transitions
  for (const osh of order.order_status_history || []) {
    const actor =
      formatName(osh.staff_profiles?.first_name, osh.staff_profiles?.last_name) ??
      formatName(osh.users?.first_name, osh.users?.last_name) ??
      getStaffName(osh.changed_by_staff_id) ??
      "System";

    timeline.push(
      makeEvent({
        timestamp: osh.changed_at,
        category: "status",
        event_type: "status_change",
        description: `Status: ${osh.from_status ?? "—"} → ${osh.to_status}${
          osh.reason ? ` — ${osh.reason}` : ""
        }`,
        actor_name: actor,
        actor_role: osh.changed_by_staff_id ? "Staff" : osh.changed_by_user_id ? "User" : "System",
        details: {
          from_status: osh.from_status,
          to_status: osh.to_status,
          reason: osh.reason,
          notes: osh.notes,
          device_id: osh.device_id,
          metadata: osh.metadata,
        },
        severity: severityForStatus(osh.to_status),
      })
    );
  }

  // Items
  for (const oi of items) {
    timeline.push(
      makeEvent({
        timestamp: oi.created_at,
        category: "item",
        event_type: "item_added",
        description: `Item added: ${oi.quantity}x ${oi.item_name} ($${oi.subtotal})`,
        actor_name: null,
        actor_role: null,
        details: { item_id: oi.id, item_name: oi.item_name, quantity: oi.quantity },
        severity: "info",
      })
    );

    if (oi.is_voided && oi.voided_at) {
      timeline.push(
        makeEvent({
          timestamp: oi.voided_at,
          category: "item",
          event_type: "item_voided",
          description: `Item voided: ${oi.quantity}x ${oi.item_name}${
            oi.void_reason ? ` — Reason: ${oi.void_reason}` : ""
          }`,
          actor_name: oi.voided_by_name ?? "System",
          actor_role: oi.voided_by_name ? "Staff" : "System",
          details: { item_id: oi.id, void_reason: oi.void_reason },
          severity: "warning",
        })
      );
    }

    if (oi.fire_time && oi.course_number != null) {
      timeline.push(
        makeEvent({
          timestamp: oi.fire_time,
          category: "kitchen",
          event_type: "course_fired",
          description: `Course ${oi.course_number} fired to kitchen`,
          actor_name: null,
          actor_role: null,
          details: { course_number: oi.course_number, item_id: oi.id },
          severity: "info",
        })
      );
    }

    if (oi.completed_at) {
      timeline.push(
        makeEvent({
          timestamp: oi.completed_at,
          category: "kitchen",
          event_type: "item_completed",
          description: `Kitchen completed: ${oi.item_name}`,
          actor_name: null,
          actor_role: null,
          details: { item_id: oi.id },
          severity: "success",
        })
      );
    }
  }

  // Payments: use payment_events as primary source to avoid duplicates.
  // Only add synthetic events when no payment_events exist (fallback for legacy data).
  const hasCaptureEvent = (events: { event_type: string }[]) =>
    events.some((e) => /capture|captured/i.test(e.event_type));
  const hasVoidEvent = (events: { event_type: string }[]) =>
    events.some((e) => /void/i.test(e.event_type));
  const hasInitEvent = (events: { event_type: string }[]) =>
    events.some((e) => /init|created|authorized|approve/i.test(e.event_type));
  const hasTipAdjustedEvent = (events: { event_type: string }[]) =>
    events.some((e) => /tip_adjusted/i.test(e.event_type));

  for (const p of payments) {
    const useSynthetic = p.events.length === 0;

    if (useSynthetic || !hasInitEvent(p.events)) {
      timeline.push(
        makeEvent({
          timestamp: p.created_at,
          category: "payment",
          event_type: "payment_created",
          description: `Payment initiated: $${p.amount} via ${p.payment_method}`,
          actor_name: p.processed_by_name ?? null,
          actor_role: p.processed_by_name ? "Staff" : null,
          details: { payment_id: p.id, amount: p.amount, method: p.payment_method },
          severity: "info",
        })
      );
    }

    if ((useSynthetic || !hasCaptureEvent(p.events)) && p.captured_at) {
      timeline.push(
        makeEvent({
          timestamp: p.captured_at,
          category: "payment",
          event_type: "payment_captured",
          description: `Payment captured: $${p.amount}${
            p.card_type && p.card_last_four
              ? ` — ${p.card_type} ****${p.card_last_four}`
              : ""
          }`,
          actor_name: p.processed_by_name ?? null,
          actor_role: p.processed_by_name ? "Staff" : null,
          details: { payment_id: p.id, amount: p.amount },
          severity: "success",
        })
      );
    }

    if ((useSynthetic || !hasVoidEvent(p.events)) && p.voided_at) {
      timeline.push(
        makeEvent({
          timestamp: p.voided_at,
          category: "payment",
          event_type: "payment_voided",
          description: `Payment voided: $${p.amount}${
            p.void_reason ? ` — Reason: ${p.void_reason}` : ""
          }`,
          actor_name: p.voided_by_name ?? null,
          actor_role: p.voided_by_name ? "Staff" : null,
          details: { payment_id: p.id, void_reason: p.void_reason },
          severity: "error",
        })
      );
    }

    if ((useSynthetic || !hasTipAdjustedEvent(p.events)) && p.tip_adjusted_at) {
      const tipStr =
        p.tip_amount != null
          ? `: $${p.tip_amount}`
          : p.original_tip_amount != null
            ? ` (was $${p.original_tip_amount})`
            : "";
      timeline.push(
        makeEvent({
          timestamp: p.tip_adjusted_at,
          category: "payment",
          event_type: "payment_tip_adjusted",
          description: `Tip adjusted${tipStr}`,
          actor_name: p.tip_adjusted_by_name ?? null,
          actor_role: p.tip_adjusted_by_name ? "Staff" : null,
          details: {
            payment_id: p.id,
            tip_amount: p.tip_amount,
            original_tip_amount: p.original_tip_amount,
          },
          severity: "info",
        })
      );
    }

    // Show tip on timeline when payment has a tip but no tip_adjusted event (e.g. tip added at payment time)
    const hasTipEvent =
      hasTipAdjustedEvent(p.events) || (p.tip_adjusted_at != null);
    if (
      (p.tip_amount != null && Number(p.tip_amount) > 0) &&
      !hasTipEvent
    ) {
      const tipTimestamp = p.captured_at ?? p.created_at;
      timeline.push(
        makeEvent({
          timestamp: tipTimestamp,
          category: "payment",
          event_type: "payment_tip",
          description: `Tip: $${Number(p.tip_amount).toFixed(2)}`,
          actor_name: p.processed_by_name ?? null,
          actor_role: p.processed_by_name ? "Staff" : null,
          details: {
            payment_id: p.id,
            tip_amount: p.tip_amount,
          },
          severity: "info",
        })
      );
    }

    for (const ev of p.events) {
      const isTipAdjusted = /tip_adjusted/i.test(ev.event_type);
      const description = isTipAdjusted
        ? `Tip adjusted${ev.tip_amount != null || ev.amount != null ? `: $${ev.tip_amount ?? ev.amount}` : ""}`
        : `Payment ${ev.event_type}${ev.amount != null ? `: $${ev.amount}` : ""}`;
      timeline.push(
        makeEvent({
          timestamp: ev.timestamp,
          category: "payment",
          event_type: isTipAdjusted ? "payment_tip_adjusted" : `payment_${ev.event_type}`,
          description,
          actor_name: ev.staff_name ?? null,
          actor_role: ev.staff_name ? "Staff" : null,
          details: ev as any,
          severity: isTipAdjusted ? "info" : severityForPaymentEvent(ev.event_type),
        })
      );
    }
  }

  // Reversals
  for (const r of reversals) {
    timeline.push(
      makeEvent({
        timestamp: r.requested_at,
        category: "refund",
        event_type: `reversal_${r.reversal_type}`,
        description: `Reversal: ${r.reversal_type} — $${r.amount}${
          r.reason_description ? ` — ${r.reason_description}` : ""
        }`,
        actor_name: r.initiated_by_name ?? null,
        actor_role: r.initiated_by_name ? "Staff" : null,
        details: r as any,
        severity: "warning",
      })
    );
  }

  // Discounts
  for (const d of discounts) {
    timeline.push(
      makeEvent({
        timestamp: d.applied_at,
        category: "discount",
        event_type: d.voided ? "discount_voided" : "discount_applied",
        description: d.voided
          ? `Discount removed: ${d.discount_name}`
          : `Discount applied: ${d.discount_name} -$${d.discount_amount}`,
        actor_name: d.applied_by_name ?? null,
        actor_role: d.applied_by_name ? "Staff" : null,
        details: d as any,
        severity: d.voided ? "warning" : "info",
      })
    );
  }

  // Session events
  for (const ts of order.table_sessions || []) {
    for (const tse of ts?.table_session_events || []) {
      const actor =
        formatName(tse.staff_profiles?.first_name, tse.staff_profiles?.last_name) ??
        getStaffName(tse.triggered_by_staff_id) ??
        (tse.triggered_by_system ? "System" : null);
      timeline.push(
        makeEvent({
          timestamp: tse.occurred_at,
          category: "session",
          event_type: `session_${tse.event_type}`,
          description: `Table: ${tse.event_type}`,
          actor_name: actor,
          actor_role: tse.triggered_by_staff_id ? "Staff" : tse.triggered_by_system ? "System" : null,
          details: {
            event_type: tse.event_type,
            notes: tse.notes,
            event_data: tse.event_data,
          },
          severity: "info",
        })
      );
    }
  }

  // Chargebacks
  for (const c of chargebacks) {
    timeline.push(
      makeEvent({
        timestamp: c.received_at,
        category: "chargeback",
        event_type: `chargeback_${c.status}`,
        description: `Chargeback received: $${c.amount}${
          c.reason_description ? ` — ${c.reason_description}` : ""
        }`,
        actor_name: "System",
        actor_role: "System",
        details: c as any,
        severity: "error",
      })
    );
  }

  // Payment audit log (system/security)
  for (const a of auditRes?.data || []) {
    timeline.push(
      makeEvent({
        timestamp: a.event_timestamp,
        category: "system",
        event_type: `payment_audit_${a.action}`,
        description: `Payment audit: ${a.action}`,
        actor_name: a.user_email ?? null,
        actor_role: a.user_role ?? null,
        details: {
          resource_id: a.resource_id,
          request_path: a.request_path,
          success: a.success,
          fields_accessed: a.fields_accessed,
          error_message: a.error_message,
          ip_address: a.ip_address,
          user_agent: a.user_agent,
        },
        severity: a.success ? "info" : "warning",
      })
    );
  }

  // Order completed/cancelled (from orders timestamps)
  if (order.completed_at) {
    timeline.push(
      makeEvent({
        timestamp: order.completed_at,
        category: "status",
        event_type: "order_completed",
        description: "Order completed",
        actor_name: null,
        actor_role: null,
        details: null,
        severity: "success",
      })
    );
  }

  if (order.cancelled_at) {
    timeline.push(
      makeEvent({
        timestamp: order.cancelled_at,
        category: "status",
        event_type: "order_cancelled",
        description: `Order cancelled${order.cancellation_reason ? ` — ${order.cancellation_reason}` : ""}`,
        actor_name: getStaffName(order.voided_by) ?? null,
        actor_role: order.voided_by ? "Staff" : null,
        details: { cancellation_reason: order.cancellation_reason ?? null },
        severity: "error",
      })
    );
  }

  const parseTs = (ts?: string | null) => {
    if (!ts) return Number.POSITIVE_INFINITY;
    const t = Date.parse(ts);
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  };

  // Deduplicate: keep first occurrence of (timestamp, category, event_type, description)
  const seen = new Set<string>();
  const deduped = timeline.filter((e) => {
    if (!e.timestamp) return false;
    const key = `${e.timestamp}|${e.category}|${e.event_type}|${e.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const sortedTimeline = deduped.sort(
    (a, b) => parseTs(a.timestamp) - parseTs(b.timestamp)
  );

  const full: OrderFullHistory = {
    order: orderHeader,
    items,
    payments,
    reversals,
    discounts,
    chargebacks,
    timeline: sortedTimeline,
  };

  return full;
}

// ============================================================================
// Accept / Decline Online Orders (merchant-side)
// ============================================================================

/** Fire-and-forget: broadcast to the storefront's Realtime channel so the customer page refreshes instantly. */
async function broadcastOrderStatus(orderId: string, status: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  try {
    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `order-update:${orderId}`,
            event: "status_changed",
            payload: { orderId, status },
          },
        ],
      }),
    });
  } catch (err) {
    console.error("broadcastOrderStatus error:", err);
  }
}

/** Fire-and-forget: send an SMS to the customer via Twilio. */
async function sendOrderSms(toPhone: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return;

  try {
    const client = twilio(accountSid, authToken);
    await client.messages.create({ body, from: fromNumber, to: toPhone });
  } catch (err) {
    console.error("sendOrderSms error:", err);
  }
}

export async function AcceptOnlineOrder(
  clerkOrgId: string,
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceRoleClient();

  // Verify caller owns this order
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!merchant) return { success: false, error: "Merchant not found" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, merchant_id")
    .eq("id", orderId)
    .single();

  if (!order || order.merchant_id !== merchant.id) {
    return { success: false, error: "Order not found" };
  }

  const { data, error } = await supabase.rpc("accept_online_order", {
    p_order_id: orderId,
  });

  if (error) {
    console.error("accept_online_order error:", error);
    return { success: false, error: "Failed to accept order" };
  }

  const result = data as any;
  if (!result?.success) {
    return { success: false, error: result?.error ?? "Failed to accept order" };
  }

  // Fetch order info for SMS + broadcast (fire-and-forget)
  const { data: orderInfo } = await supabase
    .from("orders")
    .select("customer_phone, display_number, location_id, locations(name)")
    .eq("id", orderId)
    .single();

  void broadcastOrderStatus(orderId, "accepted");

  if (orderInfo?.customer_phone) {
    const storeName = (orderInfo as any).locations?.name ?? "the restaurant";
    const locationId = (orderInfo as any).location_id;
    let eta = "";
    if (locationId) {
      const { data: storeConfig } = await supabase
        .from("online_store_config")
        .select("estimated_prep_minutes")
        .eq("location_id", locationId)
        .single();
      if (storeConfig?.estimated_prep_minutes) {
        eta = ` Estimated ready in ${storeConfig.estimated_prep_minutes} min.`;
      }
    }
    void sendOrderSms(
      (orderInfo as any).customer_phone,
      `Your order ${(orderInfo as any).display_number} from ${storeName} has been accepted!${eta}`
    );
  }

  return { success: true };
}

export async function DeclineOnlineOrder(
  clerkOrgId: string,
  orderId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceRoleClient();

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!merchant) return { success: false, error: "Merchant not found" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, merchant_id")
    .eq("id", orderId)
    .single();

  if (!order || order.merchant_id !== merchant.id) {
    return { success: false, error: "Order not found" };
  }

  const { data, error } = await supabase.rpc("decline_online_order", {
    p_order_id: orderId,
    p_reason:   reason ?? null,
  });

  if (error) {
    console.error("decline_online_order error:", error);
    return { success: false, error: "Failed to decline order" };
  }

  const result = data as any;
  if (!result?.success) {
    return { success: false, error: result?.error ?? "Failed to decline order" };
  }

  // Fetch order info for SMS + broadcast (fire-and-forget)
  const { data: orderInfo } = await supabase
    .from("orders")
    .select("customer_phone, display_number, locations(name)")
    .eq("id", orderId)
    .single();

  void broadcastOrderStatus(orderId, "declined");

  if (orderInfo?.customer_phone) {
    const storeName = (orderInfo as any).locations?.name ?? "the restaurant";
    const reasonSuffix = reason ? ` Reason: ${reason}.` : "";
    void sendOrderSms(
      (orderInfo as any).customer_phone,
      `Your order ${(orderInfo as any).display_number} from ${storeName} was declined.${reasonSuffix} Please contact us for more information.`
    );
  }

  return { success: true };
}
