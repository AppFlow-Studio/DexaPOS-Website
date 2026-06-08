"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  OrderFullHistory,
  OrderFullHistoryChargeback,
  OrderFullHistoryDiscount,
  OrderFullHistoryHeader,
  OrderFullHistoryItem,
  OrderFullHistoryPayment,
  OrderFullHistoryReversal,
  OrderFullHistoryTimeline,
} from "@/types/order-full-history";

type StaffProfileRow = {
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  role?: string | null;
} | null;

type UserRow = {
  first_name?: string | null;
  last_name?: string | null;
} | null;

function formatStaffName(p: StaffProfileRow): string | null {
  if (!p) return null;
  if (p.display_name) return p.display_name;
  const full = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return full || null;
}

function formatUserName(u: UserRow): string | null {
  if (!u) return null;
  const full = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  return full || null;
}

function n(v: unknown): number {
  const x = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(x) ? x : 0;
}

export async function GetOrderFullHistory(
  orderId: string
): Promise<OrderFullHistory | null> {
  if (!orderId) return null;

  const supabase = createServerSupabaseClient();

  // 1. Order header with relations (single round-trip).
  const { data: orderRow, error: orderErr } = await supabase
    .from("orders")
    .select(
      `
      *,
      location:locations!orders_location_id_fkey(name),
      station:stations(station_name),
      creator:staff_profiles!orders_created_by_staff_id_fkey(first_name,last_name,display_name),
      server:staff_profiles!orders_assigned_server_id_fkey(first_name,last_name,display_name)
    `
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) {
    if (orderErr.code === "42501") {
      const err = new Error("Access denied") as Error & { code?: string };
      err.code = "ACCESS_DENIED";
      throw err;
    }
    console.error("[GetOrderFullHistory] order fetch error:", orderErr);
    return null;
  }
  if (!orderRow) return null;

  const order = orderRow as any;
  const sessionId: string | null = order.session_id ?? null;

  // 2-7. Parallel fan-out for everything else.
  const [
    itemsRes,
    paymentsRes,
    discountsRes,
    statusHistoryRes,
    sessionEventsRes,
  ] = await Promise.all([
    supabase
      .from("order_items")
      .select(
        `
        *,
        order_item_modifiers(*),
        voider:staff_profiles!order_items_voided_by_fkey(first_name,last_name,display_name)
      `
      )
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    supabase
      .from("order_payments")
      .select(
        `
        *,
        order_payment_items(*, order_items(id, item_name, quantity)),
        voider:staff_profiles!order_payments_voided_by_fkey(first_name,last_name,display_name),
        processor:staff_profiles!order_payments_processed_by_staff_id_fkey(first_name,last_name,display_name),
        reversals!reversals_original_payment_id_fkey(
          *,
          order_refund_items(*),
          initiator:staff_profiles!reversals_initiated_by_fkey(first_name,last_name,display_name),
          approver:staff_profiles!reversals_approved_by_fkey(first_name,last_name,display_name)
        ),
        chargebacks!chargebacks_original_payment_id_fkey(*)
      `
      )
      .eq("order_id", orderId)
      .order("initiated_at", { ascending: true }),
    supabase
      .from("order_discounts")
      .select(
        `
        *,
        applier:staff_profiles!order_discounts_applied_by_staff_profiles_id_fkey(first_name,last_name,display_name)
      `
      )
      .eq("order_id", orderId)
      .order("applied_at", { ascending: true }),
    supabase
      .from("order_status_history")
      .select(
        `
        *,
        changed_by_user:users!order_status_history_changed_by_user_id_fkey(first_name,last_name),
        changed_by_staff:staff_profiles!order_status_history_changed_by_staff_id_fkey(first_name,last_name,display_name)
      `
      )
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    sessionId
      ? supabase
          .from("table_session_events")
          .select(
            `
            *,
            triggered_by:staff_profiles!table_session_events_triggered_by_staff_id_fkey(first_name,last_name,display_name)
          `
          )
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  if (itemsRes.error) console.error("[GetOrderFullHistory] items:", itemsRes.error);
  if (paymentsRes.error) console.error("[GetOrderFullHistory] payments:", paymentsRes.error);
  if (discountsRes.error) console.error("[GetOrderFullHistory] discounts:", discountsRes.error);
  if (statusHistoryRes.error) console.error("[GetOrderFullHistory] status_history:", statusHistoryRes.error);
  if (sessionEventsRes.error) console.error("[GetOrderFullHistory] session_events:", sessionEventsRes.error);

  const items = (itemsRes.data ?? []) as any[];
  const payments = (paymentsRes.data ?? []) as any[];
  const discounts = (discountsRes.data ?? []) as any[];
  const statusHistory = (statusHistoryRes.data ?? []) as any[];
  const sessionEvents = (sessionEventsRes.data ?? []) as any[];

  // Flatten reversals + chargebacks across all payments.
  const reversalsFlat: any[] = [];
  const chargebacksFlat: any[] = [];
  for (const p of payments) {
    if (Array.isArray(p.reversals)) reversalsFlat.push(...p.reversals.map((r: any) => ({ ...r, _payment: p })));
    if (Array.isArray(p.chargebacks)) chargebacksFlat.push(...p.chargebacks);
  }

  // refundsByItem index — used to populate items[].refund_info.
  const refundsByItem = new Map<string, OrderFullHistoryItem["refund_info"] extends (infer R)[] | null ? R : never>();
  const refundsByItemArr = new Map<string, NonNullable<OrderFullHistoryItem["refund_info"]>>();
  for (const r of reversalsFlat) {
    const refundItems = (r.order_refund_items ?? []) as any[];
    for (const ri of refundItems) {
      if (!ri.order_item_id) continue;
      const list = refundsByItemArr.get(ri.order_item_id) ?? [];
      list.push({
        quantity_refunded: n(ri.quantity_refunded),
        total_refunded: n(ri.total_refunded ?? ri.amount),
        refund_reason: r.reason_code ?? r.reason ?? "",
        refund_reason_detail: r.reason_description ?? ri.refund_reason_detail ?? null,
        refunded_at: ri.created_at ?? r.completed_at ?? r.processed_at ?? r.created_at,
      });
      refundsByItemArr.set(ri.order_item_id, list);
    }
  }
  void refundsByItem;

  // ── Projections ─────────────────────────────────────────────
  const header: OrderFullHistoryHeader = {
    id: order.id,
    display_number: order.display_number ?? order.order_number ?? "",
    status: String(order.status ?? ""),
    order_type: String(order.order_type ?? ""),
    order_channel: order.order_source ?? "",
    pricing_mode: order.payment_pricing_mode ?? "standard",
    created_at: order.created_at,
    completed_at: order.completed_at ?? null,
    cancelled_at: order.cancelled_at ?? null,
    cancellation_reason: order.cancellation_reason ?? null,
    created_by_staff_name: formatStaffName(order.creator),
    device_id: order.device_id ?? null,
    station_name: order.station?.station_name ?? null,
    location_name: order.location?.name ?? "",
    table_name: order.table_number ?? null,
    server_name: formatStaffName(order.server),
    party_size: order.party_size ?? null,
    card_subtotal: n(order.card_subtotal ?? order.subtotal),
    cash_subtotal: n(order.cash_subtotal ?? order.subtotal),
    cash_discount_amount: n(order.cash_discount_amount),
    tax_amount: n(order.tax_amount),
    discount_amount: n(order.discount_amount),
    amount_paid: n(order.amount_paid),
    amount_due: n(order.amount_due),
    effective_total: n(order.effective_total ?? order.total_amount),
    internal_notes: order.internal_notes ?? null,
  };

  const projectedItems: OrderFullHistoryItem[] = items.map((it: any) => ({
    id: it.id,
    item_name: it.item_name,
    quantity: n(it.quantity),
    unit_price: n(it.unit_price ?? it.price_paid),
    subtotal: n(it.subtotal),
    cash_price: it.cash_price != null ? n(it.cash_price) : null,
    category_name: it.category_name ?? null,
    course_number: it.course_number ?? null,
    is_voided: !!it.is_voided,
    void_reason: it.void_reason ?? null,
    voided_at: it.voided_at ?? null,
    voided_by_name: formatStaffName(it.voider),
    special_instructions: it.special_instructions ?? it.kitchen_notes ?? null,
    kitchen_status: it.kitchen_status ?? null,
    fire_time: it.fire_time ?? null,
    completed_at: it.completed_at ?? null,
    item_status: String(it.item_status ?? ""),
    created_at: it.created_at,
    discount_name: it.discount_name ?? null,
    discount_amount: it.discount_amount != null ? n(it.discount_amount) : null,
    modifiers: ((it.order_item_modifiers ?? []) as any[]).map((m: any) => ({
      modified_group_name: m.modifier_group_name ?? m.group_name ?? "",
      modifier_name: m.modifier_name ?? m.name ?? "",
      price_modifier: n(m.price_modifier ?? m.price ?? 0),
      quantity: n(m.quantity ?? 1),
    })),
    refund_info: refundsByItemArr.get(it.id) ?? null,
  }));

  const projectedPayments: OrderFullHistoryPayment[] = payments.map((p: any) => ({
    id: p.id,
    payment_method: String(p.payment_method ?? ""),
    amount: n(p.amount),
    tip_amount: n(p.tip_amount),
    total_amount: n(p.total_amount),
    status: String(p.status ?? ""),
    card_type: p.card_type ?? null,
    card_last_four: p.card_last_four ?? null,
    auth_code: p.authorization_code ?? p.auth_code ?? null,
    terminal_type: p.terminal_type ?? null,
    terminal_id: p.terminal_id ?? null,
    batch_number: p.batch_number ?? p.dejavoo_batch_number ?? null,
    psp_reference: p.transaction_id ?? p.reference_number ?? null,
    captured_at: p.captured_at ?? null,
    voided_at: p.voided_at ?? null,
    voided_by_name: formatStaffName(p.voider),
    void_reason: p.void_reason ?? null,
    created_at: p.initiated_at ?? p.created_at,
    processed_by_name: formatStaffName(p.processor),
    payment_items: Array.isArray(p.order_payment_items)
      ? p.order_payment_items.map((pi: any) => ({
          item_name: pi.order_items?.item_name ?? "",
          quantity_paid: n(pi.quantity_paid),
          subtotal_paid: n(pi.subtotal_paid),
          tax_paid: n(pi.tax_paid),
        }))
      : null,
  }));

  const projectedReversals: OrderFullHistoryReversal[] = reversalsFlat.map((r: any) => ({
    id: r.id,
    reversal_type: (r.reversal_type ?? "refund") as OrderFullHistoryReversal["reversal_type"],
    amount: n(r.amount),
    status: String(r.status ?? ""),
    reason_code: r.reason_code ?? r.reason ?? "",
    reason_description: r.reason_description ?? null,
    completed_at: r.completed_at ?? r.processed_at ?? null,
    initiated_by_name: formatStaffName(r.initiator),
    approved_by_name: formatStaffName(r.approver),
    reversal_reference_id:
      r.reversal_reference_id ?? r.reference_number ?? r.transaction_id ?? r.id,
    original_payment_method: r._payment?.payment_method ?? "",
    original_card_last_four: r._payment?.card_last_four ?? null,
    refund_items: ((r.order_refund_items ?? []) as any[]).map((ri: any) => ({
      item_name: ri.item_name ?? "",
      quantity_refunded: n(ri.quantity_refunded),
      subtotal_refunded: n(ri.subtotal_refunded ?? ri.amount),
      tax_refunded: n(ri.tax_refunded),
      total_refunded: n(ri.total_refunded ?? ri.amount),
      refund_reason: r.reason_code ?? r.reason ?? "",
      refund_reason_detail: r.reason_description ?? null,
      return_to_inventory: !!ri.return_to_inventory,
    })),
  }));

  const projectedDiscounts: OrderFullHistoryDiscount[] = discounts.map((d: any) => ({
    discount_name: d.discount_name ?? "",
    discount_amount: n(d.calculated_amount ?? d.discount_value),
    applied_at: d.applied_at,
    applied_by_name: formatStaffName(d.applier),
    voided: !!d.voided_at,
    voided_at: d.voided_at ?? null,
    target:
      Array.isArray(d.applied_to_item_ids) && d.applied_to_item_ids.length > 0
        ? "item"
        : "order",
    target_item_name: null,
  }));

  const projectedChargebacks: OrderFullHistoryChargeback[] = chargebacksFlat.map(
    (c: any) => ({
      id: c.id,
      amount: n(c.amount),
      reason_code: c.reason_code ?? "",
      reason_description: c.reason_description ?? null,
      status: String(c.status ?? ""),
      received_at: c.received_at ?? c.created_at,
      defense_deadline: c.defense_deadline ?? null,
      resolution: c.resolution ?? null,
      resolved_at: c.resolved_at ?? null,
    })
  );

  // ── Timeline assembly ───────────────────────────────────────
  const timeline: OrderFullHistoryTimeline[] = [];

  timeline.push({
    timestamp: order.created_at,
    category: "status",
    event_type: "order_created",
    description: `Order ${header.display_number} created`,
    actor_name: header.created_by_staff_name ?? null,
    actor_role: order.creator?.role ?? null,
    details: { order_type: header.order_type, channel: header.order_channel },
    severity: "info",
  });

  for (const s of statusHistory) {
    const actorName =
      formatStaffName(s.changed_by_staff) ?? formatUserName(s.changed_by_user);
    const newStatus = String(s.new_status ?? s.to_status ?? s.status ?? "");
    const sev: OrderFullHistoryTimeline["severity"] =
      newStatus === "cancelled" || newStatus === "voided"
        ? "warning"
        : newStatus === "completed" || newStatus === "ready"
          ? "success"
          : "info";
    timeline.push({
      timestamp: s.created_at,
      category: "status",
      event_type: `status_${newStatus || "change"}`,
      description: `Status → ${newStatus || "updated"}${s.reason ? ` (${s.reason})` : ""}`,
      actor_name: actorName,
      actor_role: s.changed_by_staff?.role ?? null,
      details: { from: s.previous_status ?? null, to: newStatus, reason: s.reason ?? null },
      severity: sev,
    });
  }

  for (const it of items) {
    timeline.push({
      timestamp: it.created_at,
      category: "item",
      event_type: "item_added",
      description: `Item added: ${it.quantity}× ${it.item_name}`,
      actor_name: null,
      actor_role: null,
      details: { item_id: it.id, unit_price: n(it.unit_price) },
      severity: "info",
    });
    if (it.voided_at) {
      timeline.push({
        timestamp: it.voided_at,
        category: "item",
        event_type: "item_voided",
        description: `Item voided: ${it.quantity}× ${it.item_name}${it.void_reason ? ` (${it.void_reason})` : ""}`,
        actor_name: formatStaffName(it.voider),
        actor_role: it.voider?.role ?? null,
        details: { item_id: it.id, reason: it.void_reason ?? null },
        severity: "warning",
      });
    }
    if (it.fire_time) {
      timeline.push({
        timestamp: it.fire_time,
        category: "kitchen",
        event_type: "kitchen_fired",
        description: `Sent to kitchen: ${it.item_name}`,
        actor_name: null,
        actor_role: null,
        details: { item_id: it.id },
        severity: "info",
      });
    }
    if (it.completed_at) {
      timeline.push({
        timestamp: it.completed_at,
        category: "kitchen",
        event_type: "kitchen_ready",
        description: `Ready: ${it.item_name}`,
        actor_name: null,
        actor_role: null,
        details: { item_id: it.id },
        severity: "success",
      });
    }
  }

  for (const p of payments) {
    if (p.captured_at) {
      timeline.push({
        timestamp: p.captured_at,
        category: "payment",
        event_type: "payment_captured",
        description: `Payment captured: ${String(p.payment_method ?? "").replace(/_/g, " ")} $${n(p.total_amount).toFixed(2)}`,
        actor_name: formatStaffName(p.processor),
        actor_role: p.processor?.role ?? null,
        details: {
          payment_id: p.id,
          card_last_four: p.card_last_four ?? null,
          auth_code: p.authorization_code ?? null,
        },
        severity: "success",
      });
    }
    if (p.voided_at) {
      timeline.push({
        timestamp: p.voided_at,
        category: "payment",
        event_type: "payment_voided",
        description: `Payment voided${p.void_reason ? `: ${p.void_reason}` : ""}`,
        actor_name: formatStaffName(p.voider),
        actor_role: p.voider?.role ?? null,
        details: { payment_id: p.id, reason: p.void_reason ?? null },
        severity: "warning",
      });
    }
  }

  for (const r of reversalsFlat) {
    const ts = r.completed_at ?? r.processed_at ?? r.created_at;
    if (!ts) continue;
    timeline.push({
      timestamp: ts,
      category: "refund",
      event_type: `reversal_${r.reversal_type ?? "refund"}`,
      description: `${(r.reversal_type ?? "refund").replace(/_/g, " ")} $${n(r.amount).toFixed(2)}${r.reason_code ? ` — ${r.reason_code}` : ""}`,
      actor_name: formatStaffName(r.initiator),
      actor_role: r.initiator?.role ?? null,
      details: {
        reversal_id: r.id,
        reason: r.reason_description ?? null,
        approved_by: formatStaffName(r.approver),
      },
      severity: "warning",
    });
  }

  for (const d of discounts) {
    if (d.applied_at) {
      timeline.push({
        timestamp: d.applied_at,
        category: "discount",
        event_type: "discount_applied",
        description: `Discount applied: ${d.discount_name ?? ""} (-$${n(d.calculated_amount).toFixed(2)})`,
        actor_name: formatStaffName(d.applier),
        actor_role: d.applier?.role ?? null,
        details: { discount_id: d.id, reason: d.reason ?? null },
        severity: "info",
      });
    }
    if (d.voided_at) {
      timeline.push({
        timestamp: d.voided_at,
        category: "discount",
        event_type: "discount_voided",
        description: `Discount voided: ${d.discount_name ?? ""}`,
        actor_name: null,
        actor_role: null,
        details: { discount_id: d.id, reason: d.void_reason ?? null },
        severity: "warning",
      });
    }
  }

  for (const e of sessionEvents) {
    const evType = String(e.event_type ?? "session_event");
    timeline.push({
      timestamp: e.created_at,
      category: "session",
      event_type: evType,
      description:
        e.description ?? evType.replace(/_/g, " "),
      actor_name: formatStaffName(e.triggered_by),
      actor_role: e.triggered_by?.role ?? null,
      details: e.metadata ?? null,
      severity: "info",
    });
  }

  for (const c of chargebacksFlat) {
    if (c.received_at ?? c.created_at) {
      timeline.push({
        timestamp: c.received_at ?? c.created_at,
        category: "chargeback",
        event_type: "chargeback_received",
        description: `Chargeback received: $${n(c.amount).toFixed(2)}${c.reason_code ? ` — ${c.reason_code}` : ""}`,
        actor_name: null,
        actor_role: null,
        details: { chargeback_id: c.id, reason: c.reason_description ?? null },
        severity: "error",
      });
    }
    if (c.resolved_at) {
      timeline.push({
        timestamp: c.resolved_at,
        category: "chargeback",
        event_type: "chargeback_resolved",
        description: `Chargeback resolved: ${c.resolution ?? c.status ?? ""}`,
        actor_name: null,
        actor_role: null,
        details: { chargeback_id: c.id },
        severity: "info",
      });
    }
  }

  if (order.completed_at) {
    timeline.push({
      timestamp: order.completed_at,
      category: "status",
      event_type: "order_completed",
      description: "Order completed",
      actor_name: null,
      actor_role: null,
      details: null,
      severity: "success",
    });
  }
  if (order.cancelled_at) {
    timeline.push({
      timestamp: order.cancelled_at,
      category: "status",
      event_type: "order_cancelled",
      description: `Order cancelled${order.cancellation_reason ? `: ${order.cancellation_reason}` : ""}`,
      actor_name: null,
      actor_role: null,
      details: { reason: order.cancellation_reason ?? null },
      severity: "warning",
    });
  }

  timeline.sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );

  return {
    order: header,
    items: projectedItems,
    payments: projectedPayments,
    reversals: projectedReversals,
    discounts: projectedDiscounts,
    chargebacks: projectedChargebacks,
    timeline,
  };
}
