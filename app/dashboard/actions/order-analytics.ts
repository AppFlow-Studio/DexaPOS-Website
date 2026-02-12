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

// ============================================================================
// Revenue by Category Report (Tree Map)
// ============================================================================

export interface CategoryModifier {
  modifier_name: string;
  modifier_group_name: string;
  quantity: number;
  revenue: number;
}

export interface CategoryItem {
  item_name: string;
  quantity: number;
  gross_revenue: number;
  discount_amount: number;
  net_revenue: number;
  percent_count: number;
  percent_revenue: number;
  modifiers: CategoryModifier[];
  modifier_revenue: number;
}

export interface RevenueCategoryNode {
  category_name: string;
  quantity: number;
  gross_revenue: number;
  discount_amount: number;
  net_revenue: number;
  percent_count: number;
  percent_revenue: number;
  items: CategoryItem[];
  modifier_revenue: number;
}

export interface RevenueByCategoryReport {
  categories: RevenueCategoryNode[];
  total_quantity: number;
  total_net_revenue: number;
  total_gross_revenue: number;
  total_discount_amount: number;
  total_modifier_revenue: number;
}

/**
 * Get Revenue By Category Report — Category → Item → Modifier hierarchy
 * Used for the Tree Map / nested table on the dashboard
 */
export async function GetRevenueByCategoryReport(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<RevenueByCategoryReport> {
  const emptyReport: RevenueByCategoryReport = {
    categories: [],
    total_quantity: 0,
    total_net_revenue: 0,
    total_gross_revenue: 0,
    total_discount_amount: 0,
    total_modifier_revenue: 0,
  };

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return emptyReport;

  const supabase = createServerSupabaseClient();

  // Query orders → order_items + nested order_item_modifiers
  let query = supabase
    .from("orders")
    .select(
      `
      id,
      order_items(
        id,
        item_name,
        category_name,
        quantity,
        subtotal,
        discount_amount,
        is_voided,
        order_item_modifiers(
          modifier_name,
          modifier_group_name,
          quantity,
          total_price
        )
      )
    `
    )
    .eq("merchant_id", merchantId)
    .not("status", "in", "(draft,cancelled,void)")
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data: orders, error } = await query;

  if (error) {
    console.error("[GetRevenueByCategoryReport] Error:", error);
    return emptyReport;
  }

  // Aggregate into Category → Item → Modifier hierarchy
  const categoryMap = new Map<
    string,
    {
      quantity: number;
      gross_revenue: number;
      discount_amount: number;
      items: Map<
        string,
        {
          quantity: number;
          gross_revenue: number;
          discount_amount: number;
          modifiers: Map<
            string,
            {
              modifier_group_name: string;
              quantity: number;
              revenue: number;
            }
          >;
        }
      >;
    }
  >();

  let totalQuantity = 0;

  (orders || []).forEach((order: any) => {
    if (!order.order_items) return;
    order.order_items.forEach((item: any) => {
      if (item.is_voided) return;

      const categoryName = item.category_name || "Uncategorized";
      const itemName = item.item_name || "Unknown Item";
      const qty = Number(item.quantity || 0);
      const subtotal = Number(item.subtotal || 0);
      const discountAmt = Number(item.discount_amount || 0);

      totalQuantity += qty;

      // Init category
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, {
          quantity: 0,
          gross_revenue: 0,
          discount_amount: 0,
          items: new Map(),
        });
      }
      const cat = categoryMap.get(categoryName)!;
      cat.quantity += qty;
      cat.gross_revenue += subtotal;
      cat.discount_amount += discountAmt;

      // Init item within category
      if (!cat.items.has(itemName)) {
        cat.items.set(itemName, {
          quantity: 0,
          gross_revenue: 0,
          discount_amount: 0,
          modifiers: new Map(),
        });
      }
      const itm = cat.items.get(itemName)!;
      itm.quantity += qty;
      itm.gross_revenue += subtotal;
      itm.discount_amount += discountAmt;

      // Process modifiers
      if (item.order_item_modifiers) {
        item.order_item_modifiers.forEach((mod: any) => {
          const modKey = `${mod.modifier_group_name}::${mod.modifier_name}`;
          const modQty = Number(mod.quantity || 1);
          const modRevenue = Number(mod.total_price || 0);

          if (!itm.modifiers.has(modKey)) {
            itm.modifiers.set(modKey, {
              modifier_group_name: mod.modifier_group_name || "",
              quantity: 0,
              revenue: 0,
            });
          }
          const m = itm.modifiers.get(modKey)!;
          m.quantity += modQty;
          m.revenue += modRevenue;
        });
      }
    });
  });

  // Calculate totals for percentage computation
  let totalGross = 0;
  let totalDiscount = 0;
  let totalModifierRevenue = 0;

  categoryMap.forEach((cat) => {
    totalGross += cat.gross_revenue;
    totalDiscount += cat.discount_amount;
    cat.items.forEach((itm) => {
      itm.modifiers.forEach((mod) => {
        totalModifierRevenue += mod.revenue;
      });
    });
  });

  const totalNet = totalGross - totalDiscount;

  // Build the structured report
  const categories: RevenueCategoryNode[] = Array.from(
    categoryMap.entries()
  ).map(([categoryName, cat]) => {
    const catNet = cat.gross_revenue - cat.discount_amount;
    let catModifierRevenue = 0;

    const items: CategoryItem[] = Array.from(cat.items.entries()).map(
      ([itemName, itm]) => {
        const itemNet = itm.gross_revenue - itm.discount_amount;
        let itemModRevenue = 0;

        const modifiers: CategoryModifier[] = Array.from(
          itm.modifiers.entries()
        ).map(([, mod]) => {
          itemModRevenue += mod.revenue;
          return {
            modifier_name: mod.modifier_group_name
              ? `${mod.modifier_group_name}: ${
                  mod.modifier_group_name.split("::")[1] || mod.modifier_group_name
                }`
              : "",
            modifier_group_name: mod.modifier_group_name,
            quantity: mod.quantity,
            revenue: mod.revenue,
          };
        });

        // Fix modifier_name to use the right key
        const fixedModifiers: CategoryModifier[] = Array.from(
          itm.modifiers.entries()
        ).map(([key, mod]) => {
          const parts = key.split("::");
          return {
            modifier_name: parts[1] || parts[0],
            modifier_group_name: parts[0] || "",
            quantity: mod.quantity,
            revenue: mod.revenue,
          };
        });

        catModifierRevenue += itemModRevenue;

        return {
          item_name: itemName,
          quantity: itm.quantity,
          gross_revenue: itm.gross_revenue,
          discount_amount: itm.discount_amount,
          net_revenue: itemNet,
          percent_count:
            totalQuantity > 0 ? (itm.quantity / totalQuantity) * 100 : 0,
          percent_revenue: totalNet > 0 ? (itemNet / totalNet) * 100 : 0,
          modifiers: fixedModifiers,
          modifier_revenue: itemModRevenue,
        };
      }
    );

    // Sort items by net_revenue desc
    items.sort((a, b) => b.net_revenue - a.net_revenue);

    return {
      category_name: categoryName,
      quantity: cat.quantity,
      gross_revenue: cat.gross_revenue,
      discount_amount: cat.discount_amount,
      net_revenue: catNet,
      percent_count:
        totalQuantity > 0 ? (cat.quantity / totalQuantity) * 100 : 0,
      percent_revenue: totalNet > 0 ? (catNet / totalNet) * 100 : 0,
      items,
      modifier_revenue: catModifierRevenue,
    };
  });

  // Sort categories by net_revenue desc
  categories.sort((a, b) => b.net_revenue - a.net_revenue);

  return {
    categories,
    total_quantity: totalQuantity,
    total_net_revenue: totalNet,
    total_gross_revenue: totalGross,
    total_discount_amount: totalDiscount,
    total_modifier_revenue: totalModifierRevenue,
  };
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
// ============================================================================
// Transaction Volume Report (Credits vs Debits by Payment Type)
// ============================================================================

export interface TransactionVolumeRow {
  type: string; // "Cash", "Card", "Gift Card", etc.
  credits: number; // Count of completed sale payments
  debits: number; // Count of refunds + voids
  netCount: number; // credits - debits
}

export interface TransactionVolumeReport {
  rows: TransactionVolumeRow[];
  totals: {
    credits: number;
    debits: number;
    netCount: number;
  };
}

/**
 * Get Transaction Volume Report — counts of inflow vs outflow by payment type
 */
export async function GetTransactionVolumeReport(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<TransactionVolumeReport> {
  const emptyReport: TransactionVolumeReport = {
    rows: [],
    totals: { credits: 0, debits: 0, netCount: 0 },
  };

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return emptyReport;

  const supabase = createServerSupabaseClient();

  // Query order_payments with reversals, joined through orders for merchant scoping
  let query = supabase
    .from("order_payments")
    .select(
      `
      payment_method,
      status,
      reversals(
        reversal_type,
        status
      ),
      orders!inner(
        merchant_id,
        location_id,
        status
      )
    `
    )
    .eq("orders.merchant_id", merchantId)
    .gte("initiated_at", dateFrom.toISOString())
    .lte("initiated_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    query = query.eq("orders.location_id", locationId);
  }

  const { data: payments, error } = await query;

  if (error) {
    console.error("[GetTransactionVolumeReport] Error:", error);
    return emptyReport;
  }

  // Group payment methods into display categories
  const methodDisplayMap: Record<string, string> = {
    cash: "Cash",
    card_spinapi: "Card",
    card_dvpaylite: "Card",
    card_manual: "Card",
    gift_card: "Gift Card",
    house_account: "House Account",
    external: "External",
  };

  const volumeMap = new Map<string, { credits: number; debits: number }>();

  (payments || []).forEach((payment: any) => {
    const displayType = methodDisplayMap[payment.payment_method] || "Other";

    if (!volumeMap.has(displayType)) {
      volumeMap.set(displayType, { credits: 0, debits: 0 });
    }
    const entry = volumeMap.get(displayType)!;

    // Count as credit if payment is in a successful state
    const successStatuses = ["captured", "paid", "authorized"];
    if (successStatuses.includes(payment.status)) {
      entry.credits += 1;
    }

    // Count reversals as debits
    if (payment.reversals && Array.isArray(payment.reversals)) {
      payment.reversals.forEach((rev: any) => {
        if (rev.status === "completed" || rev.status === "processed") {
          entry.debits += 1;
        }
      });
    }
  });

  // Ensure the three main types always appear, in order
  const displayOrder = ["Cash", "Card", "Gift Card", "House Account", "External"];
  const rows: TransactionVolumeRow[] = [];

  for (const type of displayOrder) {
    const entry = volumeMap.get(type);
    if (entry && (entry.credits > 0 || entry.debits > 0)) {
      rows.push({
        type,
        credits: entry.credits,
        debits: entry.debits,
        netCount: entry.credits - entry.debits,
      });
    }
  }

  // Add any remaining types not in displayOrder
  volumeMap.forEach((entry, type) => {
    if (!displayOrder.includes(type) && (entry.credits > 0 || entry.debits > 0)) {
      rows.push({
        type,
        credits: entry.credits,
        debits: entry.debits,
        netCount: entry.credits - entry.debits,
      });
    }
  });

  const totals = rows.reduce(
    (acc, row) => ({
      credits: acc.credits + row.credits,
      debits: acc.debits + row.debits,
      netCount: acc.netCount + row.netCount,
    }),
    { credits: 0, debits: 0, netCount: 0 }
  );

  return { rows, totals };
}

// ============================================================================
// Net Collected by Order Source (TICKET-005)
// ============================================================================

export interface NetCollectedBySourceRow {
  source: string;
  transactionCount: number;
  netCollected: number;
}

export interface NetCollectedBySourceReport {
  rows: NetCollectedBySourceRow[];
  totals: {
    transactionCount: number;
    netCollected: number;
  };
}

/**
 * Get Net Collected by Order Source — groups orders by channel (POS, Kiosk, Online, Third-Party)
 * and computes transaction count + net collected per channel.
 *
 * Mapping:
 *   POS (Staff-Assisted) = dine_in + takeout
 *   Online               = online
 *   Third-Party          = delivery
 *   Catering             = catering
 */
export async function GetNetCollectedBySourceReport(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<NetCollectedBySourceReport> {
  const emptyReport: NetCollectedBySourceReport = {
    rows: [],
    totals: { transactionCount: 0, netCollected: 0 },
  };

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return emptyReport;

  const supabase = createServerSupabaseClient();

  let query = supabase
    .from("orders")
    .select("order_type, total_amount, discount_amount, status")
    .eq("merchant_id", merchantId)
    .not("status", "in", "(draft,cancelled,void)")
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data: orders, error } = await query;

  if (error) {
    console.error("[GetNetCollectedBySourceReport] Error:", error);
    return emptyReport;
  }

  // Map order_type → display source
  const sourceMap: Record<string, string> = {
    dine_in: "POS",
    takeout: "POS",
    online: "Online",
    delivery: "Third-Party",
    catering: "Catering",
  };

  const sourceAgg = new Map<string, { count: number; net: number }>();

  (orders || []).forEach((order: any) => {
    const source = sourceMap[order.order_type] || "Other";
    const net = Number(order.total_amount || 0);

    if (!sourceAgg.has(source)) {
      sourceAgg.set(source, { count: 0, net: 0 });
    }
    const entry = sourceAgg.get(source)!;
    entry.count += 1;
    entry.net += net;
  });

  // Fixed display order
  const displayOrder = ["POS", "Kiosk", "Online", "Third-Party", "Catering"];
  const rows: NetCollectedBySourceRow[] = [];

  for (const source of displayOrder) {
    const entry = sourceAgg.get(source);
    if (entry && (entry.count > 0 || entry.net > 0)) {
      rows.push({
        source,
        transactionCount: entry.count,
        netCollected: entry.net,
      });
    }
  }

  // Add any remaining sources not in displayOrder
  sourceAgg.forEach((entry, source) => {
    if (!displayOrder.includes(source) && (entry.count > 0 || entry.net > 0)) {
      rows.push({
        source,
        transactionCount: entry.count,
        netCollected: entry.net,
      });
    }
  });

  const totals = rows.reduce(
    (acc, row) => ({
      transactionCount: acc.transactionCount + row.transactionCount,
      netCollected: acc.netCollected + row.netCollected,
    }),
    { transactionCount: 0, netCollected: 0 }
  );

  return { rows, totals };
}

// ============================================================================
// Taxable Revenue by Tender Type (TICKET-002)
// ============================================================================

export interface TaxableRevenueByTenderRow {
  taxName: string;
  taxRate: number;
  totalTaxCollected: number;
  totalTaxableRevenue: number;
  cashTaxableRevenue: number;
  cardTaxableRevenue: number;
}

export interface TaxableRevenueByTenderReport {
  rows: TaxableRevenueByTenderRow[];
  nonTaxableRevenue: number;
  totals: {
    totalTaxCollected: number;
    totalTaxableRevenue: number;
    cashTaxableRevenue: number;
    cardTaxableRevenue: number;
  };
}

/**
 * Get Taxable Revenue by Tender Type
 *
 * For each tax rate applied, breaks down taxable revenue by Cash vs Card.
 * Split payments are pro-rated: Cash_Taxable_Rev = (Cash_Payment / Total_Payment) * Order_Taxable_Rev
 */
export async function GetTaxableRevenueByTenderReport(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<TaxableRevenueByTenderReport> {
  const emptyReport: TaxableRevenueByTenderReport = {
    rows: [],
    nonTaxableRevenue: 0,
    totals: {
      totalTaxCollected: 0,
      totalTaxableRevenue: 0,
      cashTaxableRevenue: 0,
      cardTaxableRevenue: 0,
    },
  };

  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return emptyReport;

  const supabase = createServerSupabaseClient();

  // 1. Get all completed orders with their payments and item-level tax info
  let orderQuery = supabase
    .from("orders")
    .select(
      `
      id,
      subtotal,
      tax_amount,
      total_amount,
      discount_amount,
      order_items(
        subtotal,
        tax_amount,
        tax_rate,
        is_tax_exempt,
        is_voided
      ),
      order_payments(
        payment_method,
        amount,
        status
      )
    `
    )
    .eq("merchant_id", merchantId)
    .not("status", "in", "(draft,cancelled,void)")
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    orderQuery = orderQuery.eq("location_id", locationId);
  }

  const { data: orders, error: ordersError } = await orderQuery;

  if (ordersError) {
    console.error("[GetTaxableRevenueByTenderReport] Orders error:", ordersError);
    return emptyReport;
  }

  // 2. Get tax rates for the location(s) to map rate → name
  let taxRatesQuery = supabase
    .from("tax_rates")
    .select("name, percentage, location_id")
    .eq("is_active", true);

  if (locationId && locationId !== "all") {
    taxRatesQuery = taxRatesQuery.eq("location_id", locationId);
  }

  const { data: taxRates } = await taxRatesQuery;

  // Build a map from rate percentage → tax name (use first match)
  const rateToName = new Map<number, string>();
  (taxRates || []).forEach((tr: any) => {
    const pct = Number(tr.percentage);
    if (!rateToName.has(pct)) {
      rateToName.set(pct, tr.name);
    }
  });

  // 3. Aggregate per tax rate
  const taxAgg = new Map<
    number,
    {
      taxName: string;
      totalTaxCollected: number;
      totalTaxableRevenue: number;
      cashTaxableRevenue: number;
      cardTaxableRevenue: number;
    }
  >();

  let nonTaxableRevenue = 0;

  (orders || []).forEach((order: any) => {
    // Determine cash vs card ratio from payments
    const successStatuses = ["captured", "paid", "authorized"];
    const payments = (order.order_payments || []).filter((p: any) =>
      successStatuses.includes(p.status)
    );

    let cashPayment = 0;
    let cardPayment = 0;
    let totalPayment = 0;

    payments.forEach((p: any) => {
      const amt = Number(p.amount || 0);
      totalPayment += amt;
      if (p.payment_method === "cash") {
        cashPayment += amt;
      } else {
        cardPayment += amt;
      }
    });

    // If no payments recorded, treat total_amount as the denominator
    if (totalPayment === 0) {
      totalPayment = Number(order.total_amount || 0);
    }

    const cashRatio = totalPayment > 0 ? cashPayment / totalPayment : 0;
    const cardRatio = totalPayment > 0 ? cardPayment / totalPayment : 1;

    // Process each order item
    (order.order_items || []).forEach((item: any) => {
      if (item.is_voided) return;

      const itemSubtotal = Number(item.subtotal || 0);
      const itemTax = Number(item.tax_amount || 0);
      const taxRate = Number(item.tax_rate || 0);

      if (item.is_tax_exempt || taxRate === 0) {
        nonTaxableRevenue += itemSubtotal;
        return;
      }

      // Initialize tax rate bucket
      if (!taxAgg.has(taxRate)) {
        const name = rateToName.get(taxRate) || `Tax ${taxRate}%`;
        taxAgg.set(taxRate, {
          taxName: name,
          totalTaxCollected: 0,
          totalTaxableRevenue: 0,
          cashTaxableRevenue: 0,
          cardTaxableRevenue: 0,
        });
      }

      const bucket = taxAgg.get(taxRate)!;
      bucket.totalTaxCollected += itemTax;
      bucket.totalTaxableRevenue += itemSubtotal;
      // Pro-rate by payment method ratio
      bucket.cashTaxableRevenue += itemSubtotal * cashRatio;
      bucket.cardTaxableRevenue += itemSubtotal * cardRatio;
    });
  });

  // Build rows sorted by tax rate descending
  const rows: TaxableRevenueByTenderRow[] = Array.from(taxAgg.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([rate, data]) => ({
      taxName: data.taxName,
      taxRate: rate,
      totalTaxCollected: data.totalTaxCollected,
      totalTaxableRevenue: data.totalTaxableRevenue,
      cashTaxableRevenue: data.cashTaxableRevenue,
      cardTaxableRevenue: data.cardTaxableRevenue,
    }));

  const totals = rows.reduce(
    (acc, row) => ({
      totalTaxCollected: acc.totalTaxCollected + row.totalTaxCollected,
      totalTaxableRevenue: acc.totalTaxableRevenue + row.totalTaxableRevenue,
      cashTaxableRevenue: acc.cashTaxableRevenue + row.cashTaxableRevenue,
      cardTaxableRevenue: acc.cardTaxableRevenue + row.cardTaxableRevenue,
    }),
    {
      totalTaxCollected: 0,
      totalTaxableRevenue: 0,
      cashTaxableRevenue: 0,
      cardTaxableRevenue: 0,
    }
  );

  return { rows, nonTaxableRevenue, totals };
}

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
