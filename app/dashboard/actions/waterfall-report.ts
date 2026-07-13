"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isOrderReportable } from "@/lib/reporting/recognized-order";

// ============================================================================
// Types
// ============================================================================

export interface WaterfallTransaction {
  order_id: string;
  order_number: string;
  amount: number;
  created_at: string;
}

export interface WaterfallLineItem {
  label: string;
  amount: number;
  type: "add" | "subtract" | "total";
  transactions: WaterfallTransaction[];
}

export interface WaterfallReport {
  revenue: {
    gross_sales: WaterfallLineItem;
    voids: WaterfallLineItem;
    refunds: WaterfallLineItem;
    discounts: WaterfallLineItem;
    net_revenue: WaterfallLineItem;
  };
  collections: {
    taxes: WaterfallLineItem;
    tips: WaterfallLineItem;
    service_fees: WaterfallLineItem;
    net_collected: WaterfallLineItem;
  };
  validation: {
    payments_total: number;
    net_collected: number;
    is_balanced: boolean;
    discrepancy: number;
  };
}

// ============================================================================
// Helper
// ============================================================================

async function getMerchantId(clerkOrgId: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data: merchant, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (error || !merchant) {
    console.error("[WaterfallReport] Error getting merchant:", error);
    return null;
  }
  return merchant.id;
}

// ============================================================================
// Main Server Action
// ============================================================================

export async function GetWaterfallReport(
  clerkOrgId: string,
  locationId: string | null,
  dateFrom: Date,
  dateTo: Date
): Promise<WaterfallReport> {
  const merchantId = await getMerchantId(clerkOrgId);
  if (!merchantId) return getEmptyReport();

  const supabase = createServerSupabaseClient();

  // -------------------------------------------------------------------
  // 1. Fetch orders with items and payments
  // -------------------------------------------------------------------
  let query = supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      status,
      payment_status,
      subtotal,
      tax_amount,
      tip_amount,
      discount_amount,
      service_charge,
      total_amount,
      created_at,
      order_items(
        id,
        item_name,
        subtotal,
        is_voided,
        quantity,
        unit_price
      ),
      order_payments(
        id,
        amount,
        tip_amount,
        total_amount,
        status,
        refunded_amount
      )
    `
    )
    .eq("merchant_id", merchantId)
    .gte("created_at", dateFrom.toISOString())
    .lte("created_at", dateTo.toISOString());

  if (locationId && locationId !== "all") {
    query = query.eq("location_id", locationId);
  }

  const { data: orders, error } = await query;

  if (error) {
    console.error("[GetWaterfallReport] Error fetching orders:", error);
    return getEmptyReport();
  }

  const ordersList = orders || [];

  // -------------------------------------------------------------------
  // 2. Compute each waterfall line item
  // -------------------------------------------------------------------

  // Recognized orders (payment collected) drive the revenue lines (gross sales,
  // discounts). Voids and refunds are computed from the FULL ordersList below,
  // so excluding refunded/unpaid here doesn't lose them — refunded orders are
  // netted via the dedicated refunds line, matching the canonical predicate.
  const activeOrders = ordersList.filter((o) => isOrderReportable(o));

  // --- Gross Sales: sum of non-voided order_items.subtotal ---
  let grossSalesAmount = 0;
  const grossSalesTransactions: WaterfallTransaction[] = [];

  for (const order of activeOrders) {
    const items = (order.order_items as any[]) || [];
    const nonVoidedTotal = items
      .filter((item) => !item.is_voided)
      .reduce((sum, item) => sum + Number(item.subtotal || 0), 0);

    if (nonVoidedTotal > 0) {
      grossSalesAmount += nonVoidedTotal;
      grossSalesTransactions.push({
        order_id: order.id,
        order_number: order.order_number,
        amount: nonVoidedTotal,
        created_at: order.created_at,
      });
    }
  }

  // --- Voids: sum of voided order_items.subtotal ---
  let voidsAmount = 0;
  const voidsTransactions: WaterfallTransaction[] = [];

  for (const order of ordersList) {
    const items = (order.order_items as any[]) || [];
    const voidedTotal = items
      .filter((item) => item.is_voided)
      .reduce((sum, item) => sum + Number(item.subtotal || 0), 0);

    if (voidedTotal > 0) {
      voidsAmount += voidedTotal;
      voidsTransactions.push({
        order_id: order.id,
        order_number: order.order_number,
        amount: voidedTotal,
        created_at: order.created_at,
      });
    }
  }

  // --- Refunds: from refunded orders or payments with refunded_amount ---
  let refundsAmount = 0;
  const refundsTransactions: WaterfallTransaction[] = [];

  for (const order of ordersList) {
    let orderRefundTotal = 0;

    // Check order-level refund status
    if (order.status === "refunded") {
      orderRefundTotal = Number(order.total_amount || 0);
    } else {
      // Check payment-level refunds
      const payments = (order.order_payments as any[]) || [];
      orderRefundTotal = payments.reduce(
        (sum, p) => sum + Number(p.refunded_amount || 0),
        0
      );
    }

    if (orderRefundTotal > 0) {
      refundsAmount += orderRefundTotal;
      refundsTransactions.push({
        order_id: order.id,
        order_number: order.order_number,
        amount: orderRefundTotal,
        created_at: order.created_at,
      });
    }
  }

  // --- Discounts ---
  let discountsAmount = 0;
  const discountsTransactions: WaterfallTransaction[] = [];

  for (const order of activeOrders) {
    const discount = Number(order.discount_amount || 0);
    if (discount > 0) {
      discountsAmount += discount;
      discountsTransactions.push({
        order_id: order.id,
        order_number: order.order_number,
        amount: discount,
        created_at: order.created_at,
      });
    }
  }

  // --- Net Revenue ---
  const netRevenueAmount =
    grossSalesAmount - voidsAmount - refundsAmount - discountsAmount;

  // --- Taxes ---
  let taxesAmount = 0;
  const taxesTransactions: WaterfallTransaction[] = [];

  for (const order of activeOrders) {
    const tax = Number(order.tax_amount || 0);
    if (tax > 0) {
      taxesAmount += tax;
      taxesTransactions.push({
        order_id: order.id,
        order_number: order.order_number,
        amount: tax,
        created_at: order.created_at,
      });
    }
  }

  // --- Tips ---
  let tipsAmount = 0;
  const tipsTransactions: WaterfallTransaction[] = [];

  for (const order of activeOrders) {
    const tip = Number(order.tip_amount || 0);
    if (tip > 0) {
      tipsAmount += tip;
      tipsTransactions.push({
        order_id: order.id,
        order_number: order.order_number,
        amount: tip,
        created_at: order.created_at,
      });
    }
  }

  // --- Service Fees ---
  let serviceFeesAmount = 0;
  const serviceFeesTransactions: WaterfallTransaction[] = [];

  for (const order of activeOrders) {
    const fee = Number(order.service_charge || 0);
    if (fee > 0) {
      serviceFeesAmount += fee;
      serviceFeesTransactions.push({
        order_id: order.id,
        order_number: order.order_number,
        amount: fee,
        created_at: order.created_at,
      });
    }
  }

  // --- Net Collected ---
  const netCollectedAmount =
    netRevenueAmount + taxesAmount + tipsAmount + serviceFeesAmount;

  // --- Payments Total (for validation) ---
  let paymentsTotal = 0;
  for (const order of ordersList) {
    const payments = (order.order_payments as any[]) || [];
    paymentsTotal += payments
      .filter((p) => p.status === "captured" || p.status === "paid")
      .reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
  }

  // -------------------------------------------------------------------
  // 3. Build report
  // -------------------------------------------------------------------
  const discrepancy = Math.abs(netCollectedAmount - paymentsTotal);

  return {
    revenue: {
      gross_sales: {
        label: "Gross Sales",
        amount: grossSalesAmount,
        type: "add",
        transactions: grossSalesTransactions,
      },
      voids: {
        label: "Voids",
        amount: voidsAmount,
        type: "subtract",
        transactions: voidsTransactions,
      },
      refunds: {
        label: "Refunds",
        amount: refundsAmount,
        type: "subtract",
        transactions: refundsTransactions,
      },
      discounts: {
        label: "Discounts / Losses",
        amount: discountsAmount,
        type: "subtract",
        transactions: discountsTransactions,
      },
      net_revenue: {
        label: "Net Revenue",
        amount: netRevenueAmount,
        type: "total",
        transactions: [],
      },
    },
    collections: {
      taxes: {
        label: "Taxes",
        amount: taxesAmount,
        type: "add",
        transactions: taxesTransactions,
      },
      tips: {
        label: "Tips & Gratuity",
        amount: tipsAmount,
        type: "add",
        transactions: tipsTransactions,
      },
      service_fees: {
        label: "Service Fees / Non-Cash Adj.",
        amount: serviceFeesAmount,
        type: "add",
        transactions: serviceFeesTransactions,
      },
      net_collected: {
        label: "Net Collected",
        amount: netCollectedAmount,
        type: "total",
        transactions: [],
      },
    },
    validation: {
      payments_total: paymentsTotal,
      net_collected: netCollectedAmount,
      is_balanced: discrepancy < 0.01,
      discrepancy,
    },
  };
}

// ============================================================================
// Empty report helper
// ============================================================================

function getEmptyReport(): WaterfallReport {
  const emptyLine = (
    label: string,
    type: "add" | "subtract" | "total"
  ): WaterfallLineItem => ({
    label,
    amount: 0,
    type,
    transactions: [],
  });

  return {
    revenue: {
      gross_sales: emptyLine("Gross Sales", "add"),
      voids: emptyLine("Voids", "subtract"),
      refunds: emptyLine("Refunds", "subtract"),
      discounts: emptyLine("Discounts / Losses", "subtract"),
      net_revenue: emptyLine("Net Revenue", "total"),
    },
    collections: {
      taxes: emptyLine("Taxes", "add"),
      tips: emptyLine("Tips & Gratuity", "add"),
      service_fees: emptyLine("Service Fees / Non-Cash Adj.", "add"),
      net_collected: emptyLine("Net Collected", "total"),
    },
    validation: {
      payments_total: 0,
      net_collected: 0,
      is_balanced: true,
      discrepancy: 0,
    },
  };
}
