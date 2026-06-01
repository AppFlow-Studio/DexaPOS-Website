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
    qr_dine_in: number;
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
  qr_dine_in: number;
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
    qr_dine_in: 0,
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
      qr_dine_in: 0,
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
      qr_dine_in: 0,
      takeout: 0,
      delivery: 0,
      online: 0,
      catering: 0,
    };
  }

  const breakdown: OrderTypeBreakdown = {
    dine_in: 0,
    qr_dine_in: 0,
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
      qr_dine_in: 0,
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
    card: "Card",
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
    qr_dine_in: "QR Table",
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
