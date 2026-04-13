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

  // End of day so orders placed after page-load time are always included
  const dateToEOD = new Date(dateTo);
  dateToEOD.setHours(23, 59, 59, 999);

  let ordersQuery = supabase
    .from("orders")
    .select("id, tax_amount, cash_tax_amount, payment_pricing_mode, subtotal")
    .eq("merchant_id", merchantId)
    // Include all paid/active statuses — tax is collected at payment time,
    // not when the kitchen workflow finishes. Exclude only orders that were
    // never paid (draft) or fully reversed (cancelled, void).
    .not("status", "in", "(draft,cancelled,void)")
    .is("voided_at", null)
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateToEOD.toISOString());

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

  // Sum of all order subtotals — exempt amounts will be subtracted below
  const totalOrderSubtotals = (orders ?? []).reduce(
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

  // Fix: taxable sales = all order subtotals minus exempt item amounts.
  // This ensures the "Taxable Sales" card and effectiveTaxRate use the
  // correct denominator (genuinely taxable revenue only).
  const taxableSales = Math.max(0, totalOrderSubtotals - taxExemptSales);

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

// Columns that can be sorted directly by the database
const DB_SORT_COLS: Partial<Record<string, string>> = {
  createdAt: "created_at",
  subtotal: "subtotal",
  taxAmount: "tax_amount",
};

export async function GetTaxBreakdown(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date,
  page = 0,
  pageSize = 50,
  filters?: { orderType?: string; paymentMethod?: string },
  sortBy = "createdAt",
  sortDir: "asc" | "desc" = "desc"
): Promise<{ data?: TaxBreakdownRow[]; count?: number; error?: string }> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return { error: "Merchant not found" };

  const supabase = createServerSupabaseClient();

  // Fix: pre-filter by payment method at DB level BEFORE pagination so that
  // the paginated count and rows are always correct for the active filter.
  // Previously this was applied in JS after fetching, causing wrong counts
  // and missing rows across pages.
  let paymentFilteredIds: string[] | null = null;
  if (filters?.paymentMethod) {
    const { data: paymentRows } = await supabase
      .from("order_payments")
      .select("order_id")
      .eq("payment_method", filters.paymentMethod)
      .eq("is_voided", false)
      .eq("status", "paid");

    const uniqueIds = [...new Set((paymentRows ?? []).map((p) => p.order_id))];
    // No orders match this payment method — return early with correct empty state
    if (uniqueIds.length === 0) {
      return { data: [], count: 0 };
    }
    paymentFilteredIds = uniqueIds;
  }

  // End of day so orders placed after page-load time are always included
  const dateToEOD = new Date(dateTo);
  dateToEOD.setHours(23, 59, 59, 999);

  // Use DB-level sort for columns that map to real columns;
  // computed columns (taxRate, taxRefunded) fall back to created_at and
  // are sorted client-side in the component.
  const dbSortCol = DB_SORT_COLS[sortBy] ?? "created_at";
  const dbSortAsc = sortDir === "asc";

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, created_at, order_type, subtotal, tax_amount, cash_tax_amount, payment_pricing_mode, location_id",
      { count: "exact" }
    )
    .eq("merchant_id", merchantId)
    .not("status", "in", "(draft,cancelled,void)")
    .is("voided_at", null)
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateToEOD.toISOString())
    .order(dbSortCol, { ascending: dbSortAsc })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }
  if (filters?.orderType) {
    query = query.eq("order_type", filters.orderType);
  }
  if (paymentFilteredIds !== null) {
    query = query.in("id", paymentFilteredIds);
  }

  const { data: orders, count, error } = await query;
  if (error) {
    console.error("[TaxReport] breakdown error:", error);
    return { error: error.message };
  }

  const orderIds = (orders ?? []).map((o) => o.id);

  // Fetch payment methods for display (not for filtering — that's handled above)
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

  const rows: TaxBreakdownRow[] = (orders ?? []).map((o) => {
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

  const dateToEOD = new Date(dateTo);
  dateToEOD.setHours(23, 59, 59, 999);

  // Fix: fetch pricing mode fields so we can resolve cash vs regular tax
  // at the item level — previously item.tax_amount was used directly for
  // all orders, which disagreed with the summary's resolveTaxAmount logic.
  let ordersQuery = supabase
    .from("orders")
    .select("id, payment_pricing_mode, tax_amount, cash_tax_amount")
    .eq("merchant_id", merchantId)
    .not("status", "in", "(draft,cancelled,void)")
    .is("voided_at", null)
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateToEOD.toISOString());

  if (locationId && locationId !== "all") {
    ordersQuery = ordersQuery.eq("location_id", locationId);
  }

  const { data: orders, error: ordersError } = await ordersQuery;
  if (ordersError) return { error: ordersError.message };

  const orderIds = (orders ?? []).map((o) => o.id);
  if (orderIds.length === 0) return { data: [] };

  // Build per-order pricing map for proportional cash tax scaling
  const orderPricingMap: Record<
    string,
    { mode: string | null; taxAmount: number; cashTaxAmount: number | null }
  > = {};
  (orders ?? []).forEach((o) => {
    orderPricingMap[o.id] = {
      mode: o.payment_pricing_mode,
      taxAmount: o.tax_amount ?? 0,
      cashTaxAmount: o.cash_tax_amount,
    };
  });

  // Include order_id so we can look up the pricing mode per item
  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("order_id, category_name, subtotal, tax_amount, is_tax_exempt, is_voided")
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
      // Resolve effective item tax respecting cash pricing mode.
      // When an order uses cash pricing, scale each item's tax proportionally
      // by (order.cash_tax_amount / order.tax_amount) so category totals
      // stay consistent with the summary's resolveTaxAmount logic.
      const orderInfo = orderPricingMap[item.order_id];
      let effectiveTax = item.tax_amount ?? 0;
      if (
        orderInfo?.mode === "cash" &&
        orderInfo.cashTaxAmount != null &&
        orderInfo.taxAmount > 0
      ) {
        effectiveTax =
          effectiveTax * (orderInfo.cashTaxAmount / orderInfo.taxAmount);
      }
      categoryMap[cat].taxableSales += item.subtotal ?? 0;
      categoryMap[cat].taxCollected += effectiveTax;
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

  const dateToEOD = new Date(dateTo);
  dateToEOD.setHours(23, 59, 59, 999);

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
        .not("status", "in", "(draft,cancelled,void)")
        .is("voided_at", null)
        .gte("created_at", dateFrom.toISOString())
        .lte("created_at", dateToEOD.toISOString()),
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
