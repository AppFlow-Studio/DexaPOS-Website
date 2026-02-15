"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface OrderAnalytics {
  salesToday: number;
  salesThisWeek: number;
  totalOrders: number;
  avgOrderValue: number;
  bestSellingItems: Array<{
    item_name: string;
    quantity: number;
    revenue: number;
  }>;
  orderTypeBreakdown: {
    dine_in: number;
    takeout: number;
    delivery: number;
    online: number;
    catering: number;
  };
  salesByDate: Array<{ date: string; sales: number; orders: number }>;
  previousPeriodSales?: number;
}

export interface SalesByDateRange {
  date: string;
  sales: number;
  orders: number;
}

export interface BestSellingItem {
  item_name: string;
  quantity: number;
  revenue: number;
}

export interface OrderTypeBreakdown {
  dine_in: number;
  takeout: number;
  delivery: number;
  online: number;
  catering: number;
}

export interface OrderStats {
  totalOrders: number;
  avgOrderValue: number;
  totalSales: number;
  completedOrders: number;
}

/**
 * Get merchant ID from clerk org ID
 */
async function getMerchantId(clerkOrgId: string) {
  const supabase = createServerSupabaseClient();
  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (error || !merchant) {
    console.error("[OrderAnalytics] Error getting merchant:", error);
    return null;
  }

  return merchant.id;
}

/**
 * Get order analytics for a date range
 */
export async function GetOrderAnalytics(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<OrderAnalytics> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return getEmptyAnalytics();
  }

  const supabase = createServerSupabaseClient();

  // Build base query
  let query = supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("merchant_id", merchantId)
    .not("status", "in", "(draft,cancelled,void)")
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data: orders, error } = await query;

  if (error) {
    console.error("[GetOrderAnalytics] Error fetching orders:", error);
    return getEmptyAnalytics();
  }

  const ordersList = orders || [];

  // Calculate today's sales
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const salesToday = ordersList
    .filter((o) => {
      const orderDate = new Date(o.created_at);
      orderDate.setHours(0, 0, 0, 0);
      return orderDate.getTime() === today.getTime();
    })
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

  // Calculate this week's sales (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const salesThisWeek = ordersList
    .filter((o) => new Date(o.created_at) >= weekAgo)
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

  // Total orders
  const totalOrders = ordersList.length;

  // Average order value
  const totalSales = ordersList.reduce(
    (sum, o) => sum + Number(o.total_amount || 0),
    0
  );
  const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

  // Best selling items
  const itemMap = new Map<string, { quantity: number; revenue: number }>();
  ordersList.forEach((order) => {
    if (order.order_items) {
      order.order_items.forEach((item: any) => {
        const itemName = item.item_name || "Unknown Item";
        const quantity = item.quantity || 0;
        const revenue = Number(item.subtotal || 0);

        if (itemMap.has(itemName)) {
          const existing = itemMap.get(itemName)!;
          itemMap.set(itemName, {
            quantity: existing.quantity + quantity,
            revenue: existing.revenue + revenue,
          });
        } else {
          itemMap.set(itemName, { quantity, revenue });
        }
      });
    }
  });

  const bestSellingItems = Array.from(itemMap.entries())
    .map(([item_name, data]) => ({
      item_name,
      quantity: data.quantity,
      revenue: data.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Order type breakdown
  const orderTypeBreakdown = {
    dine_in: 0,
    takeout: 0,
    delivery: 0,
    online: 0,
    catering: 0,
  };

  ordersList.forEach((order) => {
    const orderType = order.order_type || "dine_in";
    if (orderType in orderTypeBreakdown) {
      orderTypeBreakdown[orderType as keyof typeof orderTypeBreakdown]++;
    }
  });

  // Sales by date
  const salesByDateMap = new Map<string, { sales: number; orders: number }>();
  ordersList.forEach((order) => {
    const date = new Date(order.created_at).toISOString().split("T")[0];
    const amount = Number(order.total_amount || 0);

    if (salesByDateMap.has(date)) {
      const existing = salesByDateMap.get(date)!;
      salesByDateMap.set(date, {
        sales: existing.sales + amount,
        orders: existing.orders + 1,
      });
    } else {
      salesByDateMap.set(date, { sales: amount, orders: 1 });
    }
  });

  // Convert to array and sort by date
  const salesByDate = Array.from(salesByDateMap.entries())
    .map(([date, data]) => ({
      date,
      sales: data.sales,
      orders: data.orders,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calculate previous period for comparison
  const periodDays = Math.ceil(
    (dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)
  );
  const previousDateFrom = new Date(dateFrom);
  previousDateFrom.setDate(previousDateFrom.getDate() - periodDays);
  const previousDateTo = new Date(dateFrom);

  let previousPeriodQuery = supabase
    .from("orders")
    .select("total_amount")
    .eq("merchant_id", merchantId)
    .eq("status", "completed")
    .gte("created_at", previousDateFrom.toISOString())
    .lt("created_at", previousDateTo.toISOString());

  if (locationId && locationId !== "all") {
    previousPeriodQuery = previousPeriodQuery.eq("location_id", locationId);
  }

  const { data: previousOrders } = await previousPeriodQuery;
  const previousPeriodSales =
    previousOrders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) ||
    0;

  return {
    salesToday,
    salesThisWeek,
    totalOrders,
    avgOrderValue,
    bestSellingItems,
    orderTypeBreakdown,
    salesByDate,
    previousPeriodSales,
  };
}

/**
 * Get sales by date range
 */
export async function GetSalesByDateRange(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<SalesByDateRange[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("orders")
    .select("created_at, total_amount")
    .eq("merchant_id", merchantId)
    .not("status", "in", '("draft", "cancelled", "void")')
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data: orders, error } = await query;

  if (error) {
    console.error("[GetSalesByDateRange] Error:", error);
    return [];
  }

  const salesByDateMap = new Map<string, { sales: number; orders: number }>();
  orders?.forEach((order) => {
    const date = new Date(order.created_at).toISOString().split("T")[0];
    const amount = Number(order.total_amount || 0);

    if (salesByDateMap.has(date)) {
      const existing = salesByDateMap.get(date)!;
      salesByDateMap.set(date, {
        sales: existing.sales + amount,
        orders: existing.orders + 1,
      });
    } else {
      salesByDateMap.set(date, { sales: amount, orders: 1 });
    }
  });

  return Array.from(salesByDateMap.entries())
    .map(([date, data]) => ({
      date,
      sales: data.sales,
      orders: data.orders,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get best selling items
 */
export async function GetBestSellingItems(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date,
  limit: number = 10
): Promise<BestSellingItem[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("orders")
    .select("order_items(item_name, quantity, subtotal)")
    .eq("merchant_id", merchantId)
    .not("status", "in", '("draft", "cancelled", "void")')
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data: orders, error } = await query;

  if (error) {
    console.error("[GetBestSellingItems] Error:", error);
    return [];
  }

  const itemMap = new Map<string, { quantity: number; revenue: number }>();
  orders?.forEach((order: any) => {
    if (order.order_items) {
      order.order_items.forEach((item: any) => {
        const itemName = item.item_name || "Unknown Item";
        const quantity = item.quantity || 0;
        const revenue = Number(item.subtotal || 0);

        if (itemMap.has(itemName)) {
          const existing = itemMap.get(itemName)!;
          itemMap.set(itemName, {
            quantity: existing.quantity + quantity,
            revenue: existing.revenue + revenue,
          });
        } else {
          itemMap.set(itemName, { quantity, revenue });
        }
      });
    }
  });

  return Array.from(itemMap.entries())
    .map(([item_name, data]) => ({
      item_name,
      quantity: data.quantity,
      revenue: data.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

/**
 * Get order type breakdown
 */
export async function GetOrderTypeBreakdown(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<OrderTypeBreakdown> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return {
      dine_in: 0,
      takeout: 0,
      delivery: 0,
      online: 0,
      catering: 0,
    };
  }

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("orders")
    .select("order_type")
    .eq("merchant_id", merchantId)
    .not("status", "in", '("draft", "cancelled", "void")')
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data: orders, error } = await query;

  if (error) {
    console.error("[GetOrderTypeBreakdown] Error:", error);
    return {
      dine_in: 0,
      takeout: 0,
      delivery: 0,
      online: 0,
      catering: 0,
    };
  }

  const breakdown: OrderTypeBreakdown = {
    dine_in: 0,
    takeout: 0,
    delivery: 0,
    online: 0,
    catering: 0,
  };

  orders?.forEach((order: any) => {
    const orderType = order.order_type || "dine_in";
    if (orderType in breakdown) {
      breakdown[orderType as keyof OrderTypeBreakdown]++;
    }
  });

  return breakdown;
}

/**
 * Get order stats
 */
export async function GetOrderStats(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<OrderStats> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return {
      totalOrders: 0,
      avgOrderValue: 0,
      totalSales: 0,
      completedOrders: 0,
    };
  }

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("orders")
    .select("total_amount, status")
    .eq("merchant_id", merchantId)
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data: orders, error } = await query;

  if (error) {
    console.error("[GetOrderStats] Error:", error);
    return {
      totalOrders: 0,
      avgOrderValue: 0,
      totalSales: 0,
      completedOrders: 0,
    };
  }

  const ordersList = orders || [];
  const totalOrders = ordersList.length;
  const completedOrders = ordersList.filter(
    (o: any) => o.status === "completed"
  ).length;
  const totalSales = ordersList
    .filter((o: any) => o.status === "completed")
    .reduce((sum, o: any) => sum + Number(o.total_amount || 0), 0);
  const avgOrderValue = completedOrders > 0 ? totalSales / completedOrders : 0;

  return {
    totalOrders,
    avgOrderValue,
    totalSales,
    completedOrders,
  };
}

/**
 * Helper function to return empty analytics
 */
function getEmptyAnalytics(): OrderAnalytics {
  return {
    salesToday: 0,
    salesThisWeek: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    bestSellingItems: [],
    orderTypeBreakdown: {
      dine_in: 0,
      takeout: 0,
      delivery: 0,
      online: 0,
      catering: 0,
    },
    salesByDate: [],
    previousPeriodSales: 0,
  };
}

export interface VoidItem {
  item_name: string;
  quantity: number;
  amount: number;
  reason: string;
  voided_at: string;
  voided_by: string;
  order_number: string;
  order_id: string;
}

export interface RefundItem {
  order_number: string;
  order_id: string;
  amount: number;
  reason: string;
  refunded_at: string;
  refunded_by: string;
}

export interface VoidsReport {
  voids: VoidItem[];
  refunds: RefundItem[];
}

export interface SalesByItemReportItem {
  item_name: string;
  category: string;
  quantity_sold: number;
  gross_sales: number;
  net_sales: number;
}

export interface CashFlowReportItem {
  order_number: string;
  order_id: string;
  amount_collected: number;
  tip_amount: number;
  total_amount: number;
  created_at: string;
  staff_name: string;
}

/**
 * Get Voids and Refunds Report
 */
export async function GetVoidsReport(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<VoidsReport> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return { voids: [], refunds: [] };
  }

  const supabase = createServerSupabaseClient();

  const { data: report, error } = await supabase.rpc("get_voids_report", {
    p_merchant_id: merchantId,
    p_location_id: locationId === "all" ? null : locationId,
    p_start_date: dateFrom.toISOString(),
    p_end_date: dateTo.toISOString(),
  });

  if (error) {
    console.error("[GetVoidsReport] Error:", error);
    return { voids: [], refunds: [] };
  }

  return report as VoidsReport;
}

/**
 * Get Sales By Item Report
 */
export async function GetSalesByItemReport(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<SalesByItemReportItem[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  const { data: report, error } = await supabase.rpc(
    "get_sales_by_item_report",
    {
      p_merchant_id: merchantId,
      p_location_id: locationId === "all" ? null : locationId,
      p_start_date: dateFrom.toISOString(),
      p_end_date: dateTo.toISOString(),
    }
  );

  if (error) {
    console.error("[GetSalesByItemReport] Error:", error);
    return [];
  }

  return report as SalesByItemReportItem[];
}

/**
 * Get Cash Flow Report
 */
export async function GetCashFlowReport(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<CashFlowReportItem[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) {
    return [];
  }
  const supabase = createServerSupabaseClient();

  const { data: report, error } = await supabase.rpc("get_cash_flow_report", {
    p_merchant_id: merchantId,
    p_location_id: locationId === "all" ? null : locationId,
    p_start_date: dateFrom.toISOString(),
    p_end_date: dateTo.toISOString(),
  });

  if (error) {
    console.error("[GetCashFlowReport] Error:", error);
    return [];
  }

  return report as CashFlowReportItem[];
}

export interface FinancialKPIs {
  summary: {
    gross_sales: number;
    net_sales: number;
    discounts_total: number;
    refunds_total: number;
    tax_total: number;
    tip_total: number;
    order_count: number;
    avg_order_value: number;
    paid_in_total: number;
  };
  payment_methods: Array<{
    method: string;
    amount: number;
    count: number;
  }>;
  daily_stats: Array<{
    date: string;
    net_sales: number;
    order_count: number;
    guest_count: number;
  }>;
  best_sellers: Array<{
    item_name: string;
    quantity: number;
    revenue: number;
  }>;
  order_types: Array<{
    type: string;
    count: number;
    revenue: number;
  }>;
}

/**
 * Get Financial KPIs for Dashboard
 */
export async function GetFinancialKPIs(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<FinancialKPIs | null> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return null;

  const supabase = createServerSupabaseClient();

  const { data: kpis, error } = await supabase.rpc("get_financial_kpis", {
    p_merchant_id: merchantId,
    p_location_id: locationId === "all" ? null : locationId,
    p_start_date: dateFrom.toISOString(),
    p_end_date: dateTo.toISOString(),
  });

  if (error) {
    console.error("[GetFinancialKPIs] Error:", error);
    return null;
  }

  return kpis as FinancialKPIs;
}

// ============================================================================
// Phase 1: New Server Actions
// ============================================================================

import type {
  RevenueBreakdown,
  DualPricingComparison,
  DiscountImpact,
  SalesSummaryRow,
  HourlySalesRow,
  KitchenPerformanceStats,
  TablePerformanceStats,
  ServerLeaderboardRow,
  TipsAnalysis,
  StaffOrderActivityRow,
  StaffPerformanceStats,
  OrderFlowStats,
} from "@/types/analytics";

/**
 * A1 — Revenue Breakdown (subtotal, tax, tips, service charges, discounts)
 */
export async function GetRevenueBreakdown(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<RevenueBreakdown> {
  const empty: RevenueBreakdown = {
    subtotal: 0,
    tax: 0,
    tips: 0,
    serviceCharges: 0,
    discounts: 0,
    netRevenue: 0,
    byDate: [],
  };

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return empty;

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("orders")
    .select(
      "created_at, subtotal, tax_amount, tip_amount, service_charge, discount_amount, total_amount"
    )
    .eq("merchant_id", merchantId)
    .not("status", "in", "(draft,cancelled,void)")
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data: orders, error } = await query;
  if (error || !orders) {
    console.error("[GetRevenueBreakdown] Error:", error);
    return empty;
  }

  let subtotal = 0;
  let tax = 0;
  let tips = 0;
  let serviceCharges = 0;
  let discounts = 0;

  const byDateMap = new Map<
    string,
    {
      subtotal: number;
      tax: number;
      tips: number;
      serviceCharges: number;
      discounts: number;
    }
  >();

  for (const o of orders) {
    const s = Number(o.subtotal || 0);
    const t = Number(o.tax_amount || 0);
    const tp = Number(o.tip_amount || 0);
    const sc = Number(o.service_charge || 0);
    const d = Number(o.discount_amount || 0);

    subtotal += s;
    tax += t;
    tips += tp;
    serviceCharges += sc;
    discounts += d;

    const date = new Date(o.created_at).toISOString().split("T")[0];
    const existing = byDateMap.get(date) || {
      subtotal: 0,
      tax: 0,
      tips: 0,
      serviceCharges: 0,
      discounts: 0,
    };
    byDateMap.set(date, {
      subtotal: existing.subtotal + s,
      tax: existing.tax + t,
      tips: existing.tips + tp,
      serviceCharges: existing.serviceCharges + sc,
      discounts: existing.discounts + d,
    });
  }

  const byDate = Array.from(byDateMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    subtotal,
    tax,
    tips,
    serviceCharges,
    discounts,
    netRevenue: subtotal + tax + tips + serviceCharges - discounts,
    byDate,
  };
}

/**
 * A2 — Dual Pricing Comparison (card vs cash revenue)
 */
export async function GetDualPricingComparison(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<DualPricingComparison> {
  const empty: DualPricingComparison = {
    cardRevenue: 0,
    cashRevenue: 0,
    cardTransactions: 0,
    cashTransactions: 0,
    cashDiscountSavings: 0,
    hasDualPricing: false,
    byDate: [],
  };

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return empty;

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("orders")
    .select(
      "created_at, total_amount, card_total, cash_total, cash_discount_applied, payment_pricing_mode"
    )
    .eq("merchant_id", merchantId)
    .not("status", "in", "(draft,cancelled,void)")
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data: orders, error } = await query;
  if (error || !orders) {
    console.error("[GetDualPricingComparison] Error:", error);
    return empty;
  }

  const hasDualPricing = orders.some(
    (o: any) => o.cash_discount_applied === true
  );
  if (!hasDualPricing) return { ...empty, hasDualPricing: false };

  let cardRevenue = 0;
  let cashRevenue = 0;
  let cardTransactions = 0;
  let cashTransactions = 0;
  let cashDiscountSavings = 0;

  const byDateMap = new Map<
    string,
    { cardRevenue: number; cashRevenue: number }
  >();

  for (const o of orders as any[]) {
    const cardAmt = Number(o.card_total || 0);
    const cashAmt = Number(o.cash_total || 0);
    const total = Number(o.total_amount || 0);

    if (o.cash_discount_applied) {
      cashRevenue += cashAmt || total;
      cashTransactions++;
      cashDiscountSavings += cardAmt > 0 ? cardAmt - (cashAmt || total) : 0;
    } else {
      cardRevenue += cardAmt || total;
      cardTransactions++;
    }

    const date = new Date(o.created_at).toISOString().split("T")[0];
    const existing = byDateMap.get(date) || {
      cardRevenue: 0,
      cashRevenue: 0,
    };
    if (o.cash_discount_applied) {
      existing.cashRevenue += cashAmt || total;
    } else {
      existing.cardRevenue += cardAmt || total;
    }
    byDateMap.set(date, existing);
  }

  const byDate = Array.from(byDateMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    cardRevenue,
    cashRevenue,
    cardTransactions,
    cashTransactions,
    cashDiscountSavings,
    hasDualPricing: true,
    byDate,
  };
}

/**
 * A3 — Discount Impact
 */
export async function GetDiscountImpact(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<DiscountImpact> {
  const empty: DiscountImpact = {
    totalDiscounts: 0,
    discountedOrderCount: 0,
    totalOrderCount: 0,
    discountedOrderPercent: 0,
    avgDiscountPerOrder: 0,
    bySource: [],
    topDiscounts: [],
  };

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return empty;

  const supabase = createServerSupabaseClient();

  // Get total order count for the period
  let orderCountQuery = supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .not("status", "in", "(draft,cancelled,void)")
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    orderCountQuery = orderCountQuery.eq("location_id", locationId);
  }

  const { count: totalOrderCount } = await orderCountQuery;

  // Get discount data
  let discountQuery = supabase
    .from("order_discounts")
    .select(
      "order_id, discount_name, source, calculated_amount, orders!inner(merchant_id, location_id, created_at, status)"
    )
    .eq("orders.merchant_id", merchantId)
    .not("orders.status", "in", "(draft,cancelled,void)")
    .gte("orders.created_at", dateFrom.toISOString())
    .lte("orders.created_at", dateTo.toISOString())
    .is("voided_at", null);

  if (locationId && locationId !== "all") {
    discountQuery = discountQuery.eq("orders.location_id", locationId);
  }

  const { data: discounts, error } = await discountQuery;
  if (error) {
    console.error("[GetDiscountImpact] Error:", error);
    return { ...empty, totalOrderCount: totalOrderCount || 0 };
  }

  if (!discounts || discounts.length === 0) {
    return { ...empty, totalOrderCount: totalOrderCount || 0 };
  }

  let totalDiscounts = 0;
  const uniqueOrderIds = new Set<string>();
  const sourceMap = new Map<string, { amount: number; count: number }>();
  const nameMap = new Map<string, { amount: number; count: number }>();

  for (const d of discounts) {
    const amount = Number(d.calculated_amount || 0);
    totalDiscounts += amount;
    uniqueOrderIds.add(d.order_id);

    // By source
    const source = (d as any).source || "unknown";
    const srcEntry = sourceMap.get(source) || { amount: 0, count: 0 };
    srcEntry.amount += amount;
    srcEntry.count++;
    sourceMap.set(source, srcEntry);

    // By name
    const name = d.discount_name || "Unknown";
    const nameEntry = nameMap.get(name) || { amount: 0, count: 0 };
    nameEntry.amount += amount;
    nameEntry.count++;
    nameMap.set(name, nameEntry);
  }

  const discountedOrderCount = uniqueOrderIds.size;
  const total = totalOrderCount || 0;

  return {
    totalDiscounts,
    discountedOrderCount,
    totalOrderCount: total,
    discountedOrderPercent:
      total > 0 ? (discountedOrderCount / total) * 100 : 0,
    avgDiscountPerOrder:
      discountedOrderCount > 0 ? totalDiscounts / discountedOrderCount : 0,
    bySource: Array.from(sourceMap.entries())
      .map(([source, data]) => ({ source, ...data }))
      .sort((a, b) => b.amount - a.amount),
    topDiscounts: Array.from(nameMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
  };
}

/**
 * Sales Summary Report — aggregated by date
 */
export async function GetSalesSummaryReport(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<SalesSummaryRow[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return [];

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("orders")
    .select(
      "created_at, subtotal, tax_amount, tip_amount, discount_amount, total_amount, status"
    )
    .eq("merchant_id", merchantId)
    .not("status", "in", "(draft,cancelled,void)")
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data: orders, error } = await query;
  if (error || !orders) {
    console.error("[GetSalesSummaryReport] Error:", error);
    return [];
  }

  const byDateMap = new Map<
    string,
    {
      orderCount: number;
      grossSales: number;
      discounts: number;
      tax: number;
      tips: number;
      refunds: number;
    }
  >();

  for (const o of orders) {
    const date = new Date(o.created_at).toISOString().split("T")[0];
    const existing = byDateMap.get(date) || {
      orderCount: 0,
      grossSales: 0,
      discounts: 0,
      tax: 0,
      tips: 0,
      refunds: 0,
    };

    existing.orderCount++;
    existing.grossSales += Number(o.subtotal || 0);
    existing.discounts += Number(o.discount_amount || 0);
    existing.tax += Number(o.tax_amount || 0);
    existing.tips += Number(o.tip_amount || 0);
    if ((o as any).status === "refunded") {
      existing.refunds += Number(o.total_amount || 0);
    }

    byDateMap.set(date, existing);
  }

  return Array.from(byDateMap.entries())
    .map(([date, data]) => ({
      date,
      ...data,
      netSales: data.grossSales - data.discounts,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Hourly Sales Report — aggregated by hour of day
 */
export async function GetHourlySalesReport(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<HourlySalesRow[]> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return [];

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("orders")
    .select("created_at, total_amount")
    .eq("merchant_id", merchantId)
    .not("status", "in", "(draft,cancelled,void)")
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data: orders, error } = await query;
  if (error || !orders) {
    console.error("[GetHourlySalesReport] Error:", error);
    return [];
  }

  const hourMap = new Map<number, { count: number; sales: number }>();

  for (const o of orders) {
    const hour = new Date(o.created_at).getHours();
    const amount = Number(o.total_amount || 0);
    const existing = hourMap.get(hour) || { count: 0, sales: 0 };
    existing.count++;
    existing.sales += amount;
    hourMap.set(hour, existing);
  }

  const hourLabels = [
    "12 AM", "1 AM", "2 AM", "3 AM", "4 AM", "5 AM",
    "6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM",
    "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM",
    "6 PM", "7 PM", "8 PM", "9 PM", "10 PM", "11 PM",
  ];

  return Array.from({ length: 24 }, (_, hour) => {
    const data = hourMap.get(hour) || { count: 0, sales: 0 };
    return {
      hour,
      hourLabel: hourLabels[hour],
      orderCount: data.count,
      grossSales: data.sales,
      avgOrderValue: data.count > 0 ? data.sales / data.count : 0,
    };
  });
}

// ============================================================================
// Phase 2: Kitchen Performance Analytics
// ============================================================================

/**
 * K1 — Kitchen Performance Stats
 * Calls RPC function for comprehensive kitchen analytics
 */
export async function GetKitchenPerformance(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<KitchenPerformanceStats | null> {
  const empty: KitchenPerformanceStats = {
    avg_ticket_time_minutes: 0,
    total_items_processed: 0,
    by_station: [],
    by_hour_and_day: [],
    rush_stats: {
      rush_items: 0,
      total_items: 0,
      rush_percentage: 0,
      avg_rush_time_minutes: 0,
      avg_normal_time_minutes: 0,
    },
    auto_bump_stats: {
      auto_bumped: 0,
      manual_completed: 0,
      total_items: 0,
      auto_bump_rate: 0,
    },
    daily_trend: [],
  };

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return empty;

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_kitchen_performance_stats", {
    p_merchant_id: merchantId,
    p_location_id: locationId === "all" ? null : locationId,
    p_start_date: dateFrom.toISOString(),
    p_end_date: dateTo.toISOString(),
  });

  if (error) {
    console.error("[GetKitchenPerformance] Error:", error);
    return empty;
  }

  // Sanitize nulls from RPC response — PostgreSQL NULLIF / division can produce nulls
  const raw = data as Record<string, unknown>;
  const rushStats = (raw.rush_stats as Record<string, unknown>) || {};
  const autoBumpStats = (raw.auto_bump_stats as Record<string, unknown>) || {};

  return {
    avg_ticket_time_minutes: (raw.avg_ticket_time_minutes as number) ?? 0,
    total_items_processed: (raw.total_items_processed as number) ?? 0,
    by_station: (raw.by_station as KitchenPerformanceStats["by_station"]) ?? [],
    by_hour_and_day: (raw.by_hour_and_day as KitchenPerformanceStats["by_hour_and_day"]) ?? [],
    rush_stats: {
      rush_items: (rushStats.rush_items as number) ?? 0,
      total_items: (rushStats.total_items as number) ?? 0,
      rush_percentage: (rushStats.rush_percentage as number) ?? 0,
      avg_rush_time_minutes: (rushStats.avg_rush_time_minutes as number) ?? 0,
      avg_normal_time_minutes: (rushStats.avg_normal_time_minutes as number) ?? 0,
    },
    auto_bump_stats: {
      auto_bumped: (autoBumpStats.auto_bumped as number) ?? 0,
      manual_completed: (autoBumpStats.manual_completed as number) ?? 0,
      total_items: (autoBumpStats.total_items as number) ?? 0,
      auto_bump_rate: (autoBumpStats.auto_bump_rate as number) ?? 0,
    },
    daily_trend: (raw.daily_trend as KitchenPerformanceStats["daily_trend"]) ?? [],
  };
}

/**
 * C1-C6 — Table & Dine-In Performance Stats
 * Calls RPC function for comprehensive dine-in analytics
 */
export async function GetTablePerformance(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<TablePerformanceStats | null> {
  const empty: TablePerformanceStats = {
    avg_turn_time_minutes: 0,
    total_sessions: 0,
    total_covers: 0,
    by_party_size: [],
    daily_trend: [],
    service_phases: [],
    hourly_revpash: [],
    table_utilization: [],
    section_stats: [],
  };

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return empty;

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_table_performance_stats", {
    p_merchant_id: merchantId,
    p_location_id: locationId === "all" ? null : locationId,
    p_start_date: dateFrom.toISOString(),
    p_end_date: dateTo.toISOString(),
  });

  if (error) {
    console.error("[GetTablePerformance] Error:", error);
    return empty;
  }

  // Sanitize nulls from RPC response
  const raw = data as Record<string, unknown>;

  return {
    avg_turn_time_minutes: (raw.avg_turn_time_minutes as number) ?? 0,
    total_sessions: (raw.total_sessions as number) ?? 0,
    total_covers: (raw.total_covers as number) ?? 0,
    by_party_size: (raw.by_party_size as TablePerformanceStats["by_party_size"]) ?? [],
    daily_trend: (raw.daily_trend as TablePerformanceStats["daily_trend"]) ?? [],
    service_phases: (raw.service_phases as TablePerformanceStats["service_phases"]) ?? [],
    hourly_revpash: (raw.hourly_revpash as TablePerformanceStats["hourly_revpash"]) ?? [],
    table_utilization: (raw.table_utilization as TablePerformanceStats["table_utilization"]) ?? [],
    section_stats: (raw.section_stats as TablePerformanceStats["section_stats"]) ?? [],
  };
}

/**
 * D1-D3 — Staff Performance Stats (leaderboard, tips analysis, order activity)
 */
export async function GetStaffPerformance(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<StaffPerformanceStats | null> {
  const empty: StaffPerformanceStats = {
    total_active_staff: 0,
    total_orders: 0,
    total_tips: 0,
    avg_tip_pct: 0,
    leaderboard: [],
    tips_analysis: {
      total_tips: 0,
      avg_tip_pct: 0,
      cash_tips: 0,
      card_tips: 0,
      tip_distribution: [],
      by_staff: [],
    },
    order_activity: [],
  };

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return empty;

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_staff_performance_stats", {
    p_merchant_id: merchantId,
    p_location_id: locationId === "all" ? null : locationId,
    p_start_date: dateFrom.toISOString(),
    p_end_date: dateTo.toISOString(),
  });

  if (error) {
    console.error("[GetStaffPerformance] Error:", error);
    return empty;
  }

  // Sanitize nulls from RPC response
  const raw = data as Record<string, unknown>;

  return {
    total_active_staff: (raw.total_active_staff as number) ?? 0,
    total_orders: (raw.total_orders as number) ?? 0,
    total_tips: (raw.total_tips as number) ?? 0,
    avg_tip_pct: (raw.avg_tip_pct as number) ?? 0,
    leaderboard: (raw.leaderboard as ServerLeaderboardRow[]) ?? [],
    tips_analysis: (raw.tips_analysis as TipsAnalysis) ?? empty.tips_analysis,
    order_activity: (raw.order_activity as StaffOrderActivityRow[]) ?? [],
  };
}

/**
 * E1-E4 — Order Flow Stats (funnel, voids/refunds, order type breakdown, completion times)
 */
export async function GetOrderFlow(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<OrderFlowStats | null> {
  const empty: OrderFlowStats = {
    total_orders: 0,
    completion_rate: 0,
    cancellation_rate: 0,
    void_rate: 0,
    funnel: [],
    void_refund: {
      total_voids: 0,
      void_amount: 0,
      total_refunds: 0,
      refund_amount: 0,
      by_reason: [],
      top_voided_items: [],
      staff_voids: [],
    },
    order_types: [],
    completion_times: [],
  };

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return empty;

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_order_flow_stats", {
    p_merchant_id: merchantId,
    p_location_id: locationId === "all" ? null : locationId,
    p_start_date: dateFrom.toISOString(),
    p_end_date: dateTo.toISOString(),
  });

  if (error) {
    console.error("[GetOrderFlow] Error:", error);
    return empty;
  }

  // Sanitize nulls from RPC response
  const raw = data as Record<string, unknown>;

  return {
    total_orders: (raw.total_orders as number) ?? 0,
    completion_rate: (raw.completion_rate as number) ?? 0,
    cancellation_rate: (raw.cancellation_rate as number) ?? 0,
    void_rate: (raw.void_rate as number) ?? 0,
    funnel: (raw.funnel as OrderFlowStats["funnel"]) ?? [],
    void_refund: (raw.void_refund as OrderFlowStats["void_refund"]) ?? empty.void_refund,
    order_types: (raw.order_types as OrderFlowStats["order_types"]) ?? [],
    completion_times: (raw.completion_times as OrderFlowStats["completion_times"]) ?? [],
  };
}
