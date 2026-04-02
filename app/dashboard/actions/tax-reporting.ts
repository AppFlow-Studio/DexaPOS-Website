"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  TaxSummary,
  TaxBreakdownRow,
  TaxCategoryRow,
  TaxLocationRow,
} from "@/app/dashboard/reports/tax/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getMerchantId(clerkOrgId: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();
  if (error || !data) {
    console.error("[TaxReport] getMerchantId error:", error);
    return null;
  }
  return data.id;
}

function resolveTaxAmount(order: {
  tax_amount: number;
  cash_tax_amount: number | null;
  payment_pricing_mode: string | null;
}): number {
  if (order.payment_pricing_mode === "cash") {
    return order.cash_tax_amount ?? order.tax_amount ?? 0;
  }
  return order.tax_amount ?? 0;
}

async function buildRefundsByOrderMap(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  orderIds: string[]
): Promise<Record<string, number>> {
  if (orderIds.length === 0) return {};

  const { data: orderItems } = await supabase
    .from("order_items")
    .select("id, order_id")
    .in("order_id", orderIds);

  if (!orderItems || orderItems.length === 0) return {};

  const itemToOrder: Record<string, string> = {};
  orderItems.forEach((oi) => {
    itemToOrder[oi.id] = oi.order_id;
  });

  const { data: refunds } = await supabase
    .from("order_refund_items")
    .select("order_item_id, tax_refunded")
    .in("order_item_id", orderItems.map((oi) => oi.id));

  const refundsByOrder: Record<string, number> = {};
  (refunds ?? []).forEach((r) => {
    const orderId = itemToOrder[r.order_item_id];
    if (orderId) {
      refundsByOrder[orderId] =
        (refundsByOrder[orderId] ?? 0) + (r.tax_refunded ?? 0);
    }
  });

  return refundsByOrder;
}

// ─── GetTaxSummary ────────────────────────────────────────────────────────────

export async function GetTaxSummary(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<{ data?: TaxSummary; error?: string }> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return { error: "Merchant not found" };

  const supabase = createServerSupabaseClient();

  let ordersQuery = supabase
    .from("orders")
    .select("id, tax_amount, cash_tax_amount, payment_pricing_mode, subtotal")
    .eq("merchant_id", merchantId)
    .eq("status", "completed")
    .is("voided_at", null)
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    ordersQuery = ordersQuery.eq("location_id", locationId);
  }

  const { data: orders, error: ordersError } = await ordersQuery;
  if (ordersError) {
    console.error("[TaxReport] summary orders error:", ordersError);
    return { error: ordersError.message };
  }

  const totalOrders = orders?.length ?? 0;
  const grossTaxCollected = (orders ?? []).reduce(
    (sum, o) => sum + resolveTaxAmount(o),
    0
  );
  const taxableSales = (orders ?? []).reduce(
    (sum, o) => sum + (o.subtotal ?? 0),
    0
  );

  const orderIds = (orders ?? []).map((o) => o.id);
  let taxRefunded = 0;
  let totalRefunds = 0;
  let taxExemptSales = 0;

  if (orderIds.length > 0) {
    const { data: exemptItems } = await supabase
      .from("order_items")
      .select("subtotal")
      .in("order_id", orderIds)
      .eq("is_tax_exempt", true)
      .eq("is_voided", false);

    taxExemptSales = (exemptItems ?? []).reduce(
      (sum, i) => sum + (i.subtotal ?? 0),
      0
    );

    const refundsByOrder = await buildRefundsByOrderMap(supabase, orderIds);
    taxRefunded = Object.values(refundsByOrder).reduce((s, v) => s + v, 0);
    totalRefunds = Object.values(refundsByOrder).filter((v) => v > 0).length;
  }

  const netTaxLiability = grossTaxCollected - taxRefunded;
  const effectiveTaxRate =
    taxableSales > 0
      ? parseFloat(((netTaxLiability / taxableSales) * 100).toFixed(4))
      : 0;

  return {
    data: {
      grossTaxCollected,
      taxRefunded,
      netTaxLiability,
      taxableSales,
      taxExemptSales,
      effectiveTaxRate,
      totalOrders,
      totalRefunds,
    },
  };
}

// ─── GetTaxBreakdown ──────────────────────────────────────────────────────────

export async function GetTaxBreakdown(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date,
  page = 0,
  pageSize = 50,
  filters?: { orderType?: string; paymentMethod?: string }
): Promise<{ data?: TaxBreakdownRow[]; count?: number; error?: string }> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return { error: "Merchant not found" };

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, created_at, order_type, subtotal, tax_amount, cash_tax_amount, payment_pricing_mode, location_id",
      { count: "exact" }
    )
    .eq("merchant_id", merchantId)
    .eq("status", "completed")
    .is("voided_at", null)
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString())
    .order("created_at", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }
  if (filters?.orderType) {
    query = query.eq("order_type", filters.orderType);
  }

  const { data: orders, count, error } = await query;
  if (error) {
    console.error("[TaxReport] breakdown error:", error);
    return { error: error.message };
  }

  const orderIds = (orders ?? []).map((o) => o.id);

  const paymentMethodByOrder: Record<string, string | null> = {};
  if (orderIds.length > 0) {
    const { data: payments } = await supabase
      .from("order_payments")
      .select("order_id, payment_method, is_voided, status")
      .in("order_id", orderIds)
      .eq("is_voided", false)
      .eq("status", "paid");

    (payments ?? []).forEach((p) => {
      if (!paymentMethodByOrder[p.order_id]) {
        paymentMethodByOrder[p.order_id] = p.payment_method ?? null;
      }
    });
  }

  const refundsByOrder = await buildRefundsByOrderMap(supabase, orderIds);

  let rows: TaxBreakdownRow[] = (orders ?? []).map((o) => {
    const taxAmount = resolveTaxAmount(o);
    const taxRate =
      taxAmount > 0 && o.subtotal > 0
        ? parseFloat(((taxAmount / o.subtotal) * 100).toFixed(4))
        : 0;

    return {
      orderId: o.id,
      orderNumber: o.order_number,
      createdAt: o.created_at,
      orderType: o.order_type,
      subtotal: o.subtotal ?? 0,
      taxAmount,
      taxRate,
      paymentMethod: paymentMethodByOrder[o.id] ?? null,
      pricingMode: o.payment_pricing_mode,
      taxRefunded: refundsByOrder[o.id] ?? 0,
      locationId: o.location_id,
    };
  });

  if (filters?.paymentMethod) {
    rows = rows.filter((r) => r.paymentMethod === filters.paymentMethod);
  }

  return { data: rows, count: count ?? 0 };
}

// ─── GetTaxByCategory ─────────────────────────────────────────────────────────

export async function GetTaxByCategory(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<{ data?: TaxCategoryRow[]; error?: string }> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return { error: "Merchant not found" };

  const supabase = createServerSupabaseClient();

  let ordersQuery = supabase
    .from("orders")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("status", "completed")
    .is("voided_at", null)
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    ordersQuery = ordersQuery.eq("location_id", locationId);
  }

  const { data: orders, error: ordersError } = await ordersQuery;
  if (ordersError) return { error: ordersError.message };

  const orderIds = (orders ?? []).map((o) => o.id);
  if (orderIds.length === 0) return { data: [] };

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("category_name, subtotal, tax_amount, is_tax_exempt, is_voided")
    .in("order_id", orderIds)
    .neq("is_voided", true);

  if (itemsError) return { error: itemsError.message };

  const categoryMap: Record<
    string,
    { taxableSales: number; taxCollected: number; taxExemptCount: number }
  > = {};

  (items ?? []).forEach((item) => {
    const cat = item.category_name ?? "Uncategorized";
    if (!categoryMap[cat]) {
      categoryMap[cat] = { taxableSales: 0, taxCollected: 0, taxExemptCount: 0 };
    }
    if (item.is_tax_exempt) {
      categoryMap[cat].taxExemptCount += 1;
    } else {
      categoryMap[cat].taxableSales += item.subtotal ?? 0;
      categoryMap[cat].taxCollected += item.tax_amount ?? 0;
    }
  });

  const result: TaxCategoryRow[] = Object.entries(categoryMap)
    .map(([categoryName, vals]) => ({
      categoryName,
      taxableSales: vals.taxableSales,
      taxCollected: vals.taxCollected,
      taxExemptCount: vals.taxExemptCount,
      effectiveRate:
        vals.taxableSales > 0
          ? parseFloat(
              ((vals.taxCollected / vals.taxableSales) * 100).toFixed(4)
            )
          : 0,
    }))
    .sort((a, b) => b.taxCollected - a.taxCollected);

  return { data: result };
}

// ─── GetTaxByLocation ─────────────────────────────────────────────────────────

export async function GetTaxByLocation(
  clerkOrgId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<{ data?: TaxLocationRow[]; error?: string }> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return { error: "Merchant not found" };

  const supabase = createServerSupabaseClient();

  const [{ data: locations, error: locError }, { data: orders, error: ordersError }] =
    await Promise.all([
      supabase
        .from("locations")
        .select("id, name, sales_tax_rate")
        .eq("merchant_id", merchantId),
      supabase
        .from("orders")
        .select(
          "id, location_id, tax_amount, cash_tax_amount, payment_pricing_mode, subtotal"
        )
        .eq("merchant_id", merchantId)
        .eq("status", "completed")
        .is("voided_at", null)
        .gte("created_at", dateFrom.toISOString())
        .lte("created_at", dateTo.toISOString()),
    ]);

  if (locError) return { error: locError.message };
  if (ordersError) return { error: ordersError.message };

  const ordersByLocation: Record<string, typeof orders> = {};
  (orders ?? []).forEach((o) => {
    if (!ordersByLocation[o.location_id]) ordersByLocation[o.location_id] = [];
    ordersByLocation[o.location_id]!.push(o);
  });

  const allOrderIds = (orders ?? []).map((o) => o.id);
  const refundsByOrder = await buildRefundsByOrderMap(supabase, allOrderIds);

  const result: TaxLocationRow[] = (locations ?? []).map((loc) => {
    const locOrders = ordersByLocation[loc.id] ?? [];
    const grossTax = locOrders.reduce((sum, o) => sum + resolveTaxAmount(o), 0);
    const taxRefunded = locOrders.reduce(
      (sum, o) => sum + (refundsByOrder[o.id] ?? 0),
      0
    );
    const taxableSales = locOrders.reduce(
      (sum, o) => sum + (o.subtotal ?? 0),
      0
    );

    return {
      locationId: loc.id,
      locationName: loc.name,
      salesTaxRate: loc.sales_tax_rate,
      grossTax,
      taxRefunded,
      netLiability: grossTax - taxRefunded,
      taxableSales,
    };
  });

  return { data: result };
}
