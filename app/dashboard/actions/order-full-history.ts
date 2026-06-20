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
    kdsStatusRes,
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
      .order("changed_at", { ascending: true }),
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
          .order("occurred_at", { ascending: true })
      : Promise.resolve({ data: [] as any[], error: null }),
    supabase
      .from("kds_item_status")
      .select(
        `
        order_item_id,
        status,
        started_at,
        completed_at,
        bumped_at,
        bumped_by,
        acknowledged_at,
        kds_display:kds_displays(display_name),
        acknowledger:staff_profiles!kds_item_status_acknowledged_by_fkey(first_name,last_name,display_name),
        bumper:location_members!kds_item_status_bumped_by_fkey(staff_profile:staff_profiles(first_name,last_name,display_name))
      `
      )
      .eq("order_id", orderId),
  ]);

  if (itemsRes.error) console.error("[GetOrderFullHistory] items:", itemsRes.error);
  if (paymentsRes.error) console.error("[GetOrderFullHistory] payments:", paymentsRes.error);
  if (discountsRes.error) console.error("[GetOrderFullHistory] discounts:", discountsRes.error);
  if (statusHistoryRes.error) console.error("[GetOrderFullHistory] status_history:", statusHistoryRes.error);
  if (sessionEventsRes.error) console.error("[GetOrderFullHistory] session_events:", sessionEventsRes.error);
  if (kdsStatusRes.error) console.error("[GetOrderFullHistory] kds_item_status:", kdsStatusRes.error);

  const items = (itemsRes.data ?? []) as any[];
  const payments = (paymentsRes.data ?? []) as any[];
  const discounts = (discountsRes.data ?? []) as any[];
  const statusHistory = (statusHistoryRes.data ?? []) as any[];
  const sessionEvents = (sessionEventsRes.data ?? []) as any[];
  const kdsStatusRows = (kdsStatusRes.data ?? []) as any[];

  // Index kds_item_status by order_item_id (one item can fan out to multiple
  // displays; we keep them all and let downstream dedupe/sort).
  const kdsByItem = new Map<string, any[]>();
  for (const k of kdsStatusRows) {
    if (!k.order_item_id) continue;
    const list = kdsByItem.get(k.order_item_id) ?? [];
    list.push(k);
    kdsByItem.set(k.order_item_id, list);
  }

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

  // Build the per-item kitchen event list once — reused by both the projected
  // items (KitchenActivitySection reads it) and the unified timeline.
  const buildKitchenEvents = (it: any): OrderFullHistoryItem["kitchen_events"] => {
    const out: OrderFullHistoryItem["kitchen_events"] = [];
    const kdsRows = (kdsByItem.get(it.id) ?? []) as any[];

    const sentAt = it.sent_to_kitchen_at ?? null;
    const firedAt = it.fire_time ?? null;

    if (sentAt) {
      out.push({
        event_type: "kitchen_sent",
        timestamp: sentAt,
        actor_name: null,
        display_name: null,
      });
    }
    // Only emit a separate "fired" event when the merchant actually held + fired
    // it (fire_time distinct from the original send-to-kitchen moment).
    if (firedAt && firedAt !== sentAt) {
      out.push({
        event_type: "kitchen_fired",
        timestamp: firedAt,
        actor_name: null,
        display_name: null,
      });
    }

    // Earliest acknowledgement across all displays this item routed to.
    const acks = kdsRows
      .filter((k) => k.acknowledged_at)
      .sort(
        (a, b) =>
          Date.parse(a.acknowledged_at) - Date.parse(b.acknowledged_at)
      );
    if (acks.length > 0) {
      out.push({
        event_type: "kitchen_acknowledged",
        timestamp: acks[0].acknowledged_at,
        actor_name: formatStaffName(acks[0].acknowledger),
        display_name: acks[0].kds_display?.display_name ?? null,
      });
    }

    // "preparing" — prefer the column on order_items, fall back to the earliest
    // KDS row's started_at if a station picked it up without writing back.
    const startedAt =
      it.started_preparing_at ??
      kdsRows
        .map((k) => k.started_at)
        .filter(Boolean)
        .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ??
      null;
    if (startedAt) {
      out.push({
        event_type: "kitchen_preparing",
        timestamp: startedAt,
        actor_name: null,
        display_name: null,
      });
    }

    // "ready" — order_items.completed_at is the canonical "all stations done"
    // marker; fall back to the latest per-display completed_at if missing.
    const readyAt =
      it.completed_at ??
      kdsRows
        .map((k) => k.completed_at)
        .filter(Boolean)
        .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ??
      null;
    if (readyAt) {
      out.push({
        event_type: "kitchen_ready",
        timestamp: readyAt,
        actor_name: null,
        display_name: null,
      });
    }

    // Bumps (per display) — appended after the main lifecycle steps.
    for (const k of kdsRows) {
      if (k.bumped_at) {
        out.push({
          event_type: "kitchen_bumped",
          timestamp: k.bumped_at,
          actor_name: formatStaffName(k.bumper?.staff_profile),
          display_name: k.kds_display?.display_name ?? null,
        });
      }
    }

    out.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    return out;
  };

  const projectedItems: OrderFullHistoryItem[] = items.map((it: any) => {
    const { order_item_modifiers: _mods, voider: _vv, ...itemRow } = it;
    return {
      // Preserve raw order_items columns for downstream consumers (KitchenSection
      // / EnhancedItemsSection read several fields not in the declared type).
      ...(itemRow as any),
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
      sent_to_kitchen_at: it.sent_to_kitchen_at ?? null,
      started_preparing_at: it.started_preparing_at ?? null,
      // KitchenSection reads preparing_at / ready_at; map from the real columns.
      preparing_at: it.started_preparing_at ?? null,
      ready_at: it.completed_at ?? null,
      completed_at: it.completed_at ?? null,
      kitchen_events: buildKitchenEvents(it),
      item_status: String(it.item_status ?? ""),
      created_at: it.created_at,
      discount_name: it.discount_name ?? null,
      discount_amount: it.discount_amount != null ? n(it.discount_amount) : null,
      modifiers: ((it.order_item_modifiers ?? []) as any[]).map((m: any) => ({
        modified_group_name: m.modifier_group_name ?? "",
        modifier_name: m.modifier_name ?? "",
        price_modifier: n(m.price_modifier ?? 0),
        quantity: n(m.quantity ?? 1),
      })),
      refund_info: refundsByItemArr.get(it.id) ?? null,
    } as OrderFullHistoryItem;
  });

  const projectedPayments: OrderFullHistoryPayment[] = payments.map((p: any) => {
    // Strip nested relations we project explicitly below so they don't shadow.
    const {
      order_payment_items: _opi,
      voider: _v,
      processor: _pr,
      reversals: _rv,
      chargebacks: _cb,
      ...payRow
    } = p;
    return {
      // Preserve every raw column from order_payments. EnhancedPayments reads
      // many fields (events, result_code, response_message, tip_adjusted_at,
      // original_tip_amount, dual_pricing_fee, tip_fee, dejavoo_*, etc.) that
      // aren't in the declared type but exist at runtime.
      ...(payRow as any),
      id: p.id,
      payment_method: String(p.payment_method ?? ""),
      amount: n(p.amount),
      tip_amount: n(p.tip_amount),
      total_amount: n(p.total_amount),
      status: String(p.status ?? ""),
      card_type: p.card_type ?? null,
      card_last_four: p.card_last_four ?? null,
      auth_code: p.authorization_code ?? p.auth_code ?? null,
      authorization_code: p.authorization_code ?? null,
      terminal_type: p.terminal_type ?? null,
      terminal_id: p.terminal_id ?? null,
      batch_number: p.batch_number ?? p.dejavoo_batch_number ?? null,
      dejavoo_batch_number: p.dejavoo_batch_number ?? null,
      dejavoo_invoice_number: p.dejavoo_invoice_number ?? null,
      transaction_id: p.transaction_id ?? null,
      psp_reference: p.transaction_id ?? p.reference_number ?? null,
      captured_at: p.captured_at ?? null,
      authorized_at: p.authorized_at ?? null,
      approved_at: p.approved_at ?? null,
      voided_at: p.voided_at ?? null,
      voided_by: p.voided_by ?? null,
      voided_by_name: formatStaffName(p.voider),
      void_reason: p.void_reason ?? null,
      created_at: p.initiated_at ?? p.created_at,
      processed_by_name: formatStaffName(p.processor),
      tip_adjusted_at: p.tip_adjusted_at ?? null,
      tip_adjusted_by_name: null,
      original_tip_amount: p.original_tip_amount ?? null,
      result_code: p.result_code ?? null,
      response_message: p.result_message ?? null,
      events: [],
      payment_items: Array.isArray(p.order_payment_items)
        ? p.order_payment_items.map((pi: any) => ({
            item_name: pi.order_items?.item_name ?? "",
            quantity_paid: n(pi.quantity_paid),
            subtotal_paid: n(pi.subtotal_paid),
            tax_paid: n(pi.tax_paid),
          }))
        : null,
    } as OrderFullHistoryPayment;
  });

  const projectedReversals: OrderFullHistoryReversal[] = reversalsFlat.map((r: any) => {
    const {
      order_refund_items: _ri,
      initiator: _in,
      approver: _ap,
      _payment,
      ...revRow
    } = r;
    return {
      // Preserve raw reversals columns; ReversalsSection reads result_code,
      // response_message, requested_at directly off the row.
      ...(revRow as any),
      id: r.id,
      reversal_type: (r.reversal_type ?? "refund") as OrderFullHistoryReversal["reversal_type"],
      amount: n(r.amount),
      status: String(r.status ?? ""),
      reason_code: r.reason_code ?? "",
      reason_description: r.reason_description ?? null,
      completed_at: r.completed_at ?? r.processed_at ?? null,
      initiated_by_name: formatStaffName(r.initiator),
      approved_by_name: formatStaffName(r.approver),
      reversal_reference_id: r.reversal_reference_id ?? r.id,
      original_payment_method: _payment?.payment_method ?? "",
      original_card_last_four: _payment?.card_last_four ?? null,
      result_code: r.result_code ?? null,
      response_message: r.response_message ?? null,
      requested_at: r.requested_at ?? r.created_at ?? null,
      refund_items: ((r.order_refund_items ?? []) as any[]).map((ri: any) => ({
        item_name: ri.item_name ?? "",
        quantity_refunded: n(ri.quantity_refunded),
        subtotal_refunded: n(ri.subtotal_refunded),
        tax_refunded: n(ri.tax_refunded),
        total_refunded: n(ri.total_refunded),
        refund_reason: r.reason_code ?? "",
        refund_reason_detail: r.reason_description ?? null,
        return_to_inventory: !!ri.return_to_inventory,
      })),
    } as OrderFullHistoryReversal;
  });

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
    const newStatus = String(s.to_status ?? "");
    const sev: OrderFullHistoryTimeline["severity"] =
      newStatus === "cancelled" || newStatus === "voided"
        ? "warning"
        : newStatus === "completed" || newStatus === "ready"
          ? "success"
          : "info";
    timeline.push({
      timestamp: s.changed_at,
      category: "status",
      event_type: `status_${newStatus || "change"}`,
      description: `Status → ${newStatus || "updated"}${s.reason ? ` (${s.reason})` : ""}`,
      actor_name: actorName,
      actor_role: null,
      details: { from: s.from_status ?? null, to: newStatus, reason: s.reason ?? null, notes: s.notes ?? null },
      severity: sev,
    });
  }

  const kitchenEventLabel: Record<string, { description: (name: string) => string; severity: OrderFullHistoryTimeline["severity"] }> = {
    kitchen_sent:         { description: (n) => `Sent to kitchen: ${n}`,            severity: "info" },
    kitchen_fired:        { description: (n) => `Fired: ${n}`,                       severity: "info" },
    kitchen_acknowledged: { description: (n) => `Acknowledged at KDS: ${n}`,         severity: "info" },
    kitchen_preparing:    { description: (n) => `Preparing started: ${n}`,           severity: "info" },
    kitchen_ready:        { description: (n) => `Ready: ${n}`,                       severity: "success" },
    kitchen_bumped:       { description: (n) => `Bumped from KDS: ${n}`,             severity: "info" },
  };

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

    const kitchenEvents = buildKitchenEvents(it);
    for (const ke of kitchenEvents) {
      const meta = kitchenEventLabel[ke.event_type] ?? {
        description: (n: string) => `Kitchen update: ${n}`,
        severity: "info" as const,
      };
      timeline.push({
        timestamp: ke.timestamp,
        category: "kitchen",
        event_type: ke.event_type,
        description: meta.description(it.item_name),
        actor_name: ke.actor_name,
        actor_role: null,
        details: {
          item_id: it.id,
          display_name: ke.display_name,
        },
        severity: meta.severity,
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
      timestamp: e.occurred_at,
      category: "session",
      event_type: evType,
      description: e.notes ?? evType.replace(/_/g, " "),
      actor_name: formatStaffName(e.triggered_by),
      actor_role: null,
      details: e.event_data ?? null,
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
