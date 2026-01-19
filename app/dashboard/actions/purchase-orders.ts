"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { LogAuditEvent } from "./audit-logs";
import {
  PurchaseOrderPayment,
  DiscrepancyReportItem,
  PurchaseOrderWithDetails,
} from "@/types/inventory";

// ============================================================================
// LOG DELIVERY (Goods Received)
// ============================================================================

interface LogDeliveryParams {
  purchaseOrderId: string;
  deliveredBy: string;
  deliveryNotes?: string;
  receivedItems: Array<{
    item_id: string;
    quantity_received: number;
  }>;
}

interface LogDeliveryResult {
  success?: boolean;
  discrepancies?: DiscrepancyReportItem[];
  error?: string;
}

/**
 * Log a delivery for a purchase order
 * - Records who delivered and when
 * - Updates received quantities for each item
 * - Automatically increments location stock
 * - Calculates discrepancy report
 */
export async function LogPurchaseOrderDelivery(
  params: LogDeliveryParams,
): Promise<LogDeliveryResult> {
  const { purchaseOrderId, deliveredBy, deliveryNotes, receivedItems } = params;

  if (!purchaseOrderId) {
    return { error: "Purchase order ID is required" };
  }

  if (!receivedItems || receivedItems.length === 0) {
    return { error: "Received items are required" };
  }

  const supabase = createServerSupabaseClient();

  // Fetch PO for info
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("merchant_id, po_number, location_id")
    .eq("id", purchaseOrderId)
    .single();

  if (!po) return { error: "Purchase Order not found" };

  // Get current user info
  const user = await currentUser();
  const userId = user?.id || null;
  const userName = user?.fullName || user?.firstName || "Unknown User";

  // Call RPC function to log delivery and increment stock
  const { data, error } = await supabase.rpc("log_purchase_order_delivery", {
    p_purchase_order_id: purchaseOrderId,
    p_delivered_by: deliveredBy || null,
    p_delivery_notes: deliveryNotes || null,
    p_logged_by_user_id: userId,
    p_logged_by_name: userName,
    p_received_items: receivedItems,
  });

  if (error) {
    console.error("Error logging delivery:", error);
    return { error: error.message };
  }

  // Log audit event
  await LogAuditEvent({
    merchantId: po.merchant_id,
    action: `Received Delivery for PO #${po.po_number}`,
    actionCategory: "inventory",
    resourceType: "purchase_order",
    resourceId: purchaseOrderId,
    resourceName: `PO #${po.po_number}`,
    locationId: po.location_id,
    metadata: {
      received_items_count: receivedItems.length,
      delivered_by: deliveredBy,
      delivery_notes: deliveryNotes,
    },
  });

  return {
    success: true,
    discrepancies: data?.discrepancies as DiscrepancyReportItem[],
  };
}

// ============================================================================
// LOG PAYMENT
// ============================================================================

interface LogPaymentParams {
  purchaseOrderId: string;
  paymentMethod: "card" | "cash" | "check" | "bank_transfer";
  cardLastFour?: string;
  amount: number;
  paidTo: string;
  notes?: string;
}

interface LogPaymentResult {
  success?: boolean;
  paymentId?: string;
  error?: string;
}

/**
 * Log a payment for a purchase order
 * - Records payment method and details
 * - Captures card last 4 if card payment
 * - Records who made the payment
 * - Updates PO status to "paid"
 */
export async function LogPurchaseOrderPayment(
  params: LogPaymentParams,
): Promise<LogPaymentResult> {
  const {
    purchaseOrderId,
    paymentMethod,
    cardLastFour,
    amount,
    paidTo,
    notes,
  } = params;

  if (!purchaseOrderId) {
    return { error: "Purchase order ID is required" };
  }

  if (!paymentMethod) {
    return { error: "Payment method is required" };
  }

  if (paymentMethod === "card" && !cardLastFour) {
    return { error: "Card last 4 digits are required for card payments" };
  }

  if (!amount || amount <= 0) {
    return { error: "Valid payment amount is required" };
  }

  const supabase = createServerSupabaseClient();

  // Fetch PO for info
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("merchant_id, po_number, location_id")
    .eq("id", purchaseOrderId)
    .single();

  if (!po) return { error: "Purchase Order not found" };

  // Get current user info
  const user = await currentUser();
  const userId = user?.id || null;
  const userName = user?.fullName || user?.firstName || "Unknown User";

  // Call RPC function to log payment
  const { data, error } = await supabase.rpc("log_purchase_order_payment", {
    p_purchase_order_id: purchaseOrderId,
    p_payment_method: paymentMethod,
    p_card_last_four: cardLastFour || null,
    p_amount: amount,
    p_paid_to: paidTo || null,
    p_paid_by_user_id: userId,
    p_paid_by_name: userName,
    p_notes: notes || null,
  });

  if (error) {
    console.error("Error logging payment:", error);
    return { error: error.message };
  }

  await LogAuditEvent({
    merchantId: po.merchant_id,
    action: `Recorded Payment for PO #${po.po_number}`,
    actionCategory: "inventory",
    resourceType: "purchase_order",
    resourceId: purchaseOrderId,
    resourceName: `PO #${po.po_number}`,
    locationId: po.location_id,
    changes: {
      after: {
        amount,
        payment_method: paymentMethod,
        paid_to: paidTo,
      },
    },
  });

  return {
    success: true,
    paymentId: data as string,
  };
}

// ============================================================================
// GET DISCREPANCY REPORT
// ============================================================================

/**
 * Get discrepancy report for a purchase order
 * Shows ordered vs received quantities and status for each item
 */
export async function GetDiscrepancyReport(
  purchaseOrderId: string,
): Promise<{ data?: DiscrepancyReportItem[]; error?: string }> {
  if (!purchaseOrderId) {
    return { error: "Purchase order ID is required" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_discrepancy_report", {
    p_purchase_order_id: purchaseOrderId,
  });

  if (error) {
    console.error("Error getting discrepancy report:", error);
    return { error: error.message };
  }

  return { data: data as DiscrepancyReportItem[] };
}

// ============================================================================
// GET PURCHASE ORDER PAYMENTS
// ============================================================================

/**
 * Get all payments for a purchase order
 */
export async function GetPurchaseOrderPayments(
  purchaseOrderId: string,
): Promise<{ data?: PurchaseOrderPayment[]; error?: string }> {
  if (!purchaseOrderId) {
    return { error: "Purchase order ID is required" };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("purchase_order_payments")
    .select("*")
    .eq("purchase_order_id", purchaseOrderId)
    .order("paid_at", { ascending: false });

  if (error) {
    console.error("Error getting PO payments:", error);
    return { error: error.message };
  }

  return { data: data as PurchaseOrderPayment[] };
}

// ============================================================================
// GET PURCHASE ORDER DETAILS
// ============================================================================

/**
 * Get full purchase order details including items, payments, and delivery info
 */
export async function GetPurchaseOrderDetails(
  purchaseOrderId: string,
): Promise<{ data?: PurchaseOrderWithDetails; error?: string }> {
  if (!purchaseOrderId) {
    return { error: "Purchase order ID is required" };
  }

  const supabase = createServerSupabaseClient();

  // Get PO with joined data
  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .select(
      `
      *,
      vendor:vendors(id, name),
      location:locations(id, name),
      items:purchase_order_items(
        id,
        inventory_item_id,
        quantity_ordered,
        quantity_received,
        unit_cost,
        line_total,
        item_name,
        item_sku,
        item_unit_type,
        item_category,
        inventory_item:inventory_items(id, name, unit_type)
      )
    `,
    )
    .eq("id", purchaseOrderId)
    .single();

  if (poError) {
    console.error("Error getting PO details:", poError);
    return { error: poError.message };
  }

  // Get payments
  const { data: payments } = await supabase
    .from("purchase_order_payments")
    .select("*")
    .eq("purchase_order_id", purchaseOrderId)
    .order("paid_at", { ascending: false });

  // Transform response
  const result: PurchaseOrderWithDetails = {
    ...po,
    vendor: Array.isArray(po.vendor) ? po.vendor[0] : po.vendor || null,
    location: Array.isArray(po.location) ? po.location[0] : po.location || null,
    items: (po.items || []).map(
      (item: { inventory_item: unknown[] | unknown }) => ({
        ...item,
        inventory_item: Array.isArray(item.inventory_item)
          ? item.inventory_item[0]
          : item.inventory_item || null,
      }),
    ),
    payments: payments || [],
  };

  return { data: result };
}
