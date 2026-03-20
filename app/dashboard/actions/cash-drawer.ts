"use server";

// ============================================================================
// Cash Drawer Server Actions
// Description: Audit logging for cash drawer events triggered by the POS tablet.
//              The POS writes cash_drawer_operations records directly, but
//              high-risk operations (no-sale opens, paid-outs, adjustments)
//              must also surface in audit_logs for the merchant dashboard view.
// ============================================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LogAuditEvent } from "./audit-logs";

// Operation types that always warrant an audit log entry
const HIGH_RISK_OPERATIONS = new Set([
  "paid_out",
  "adjustment",
  "no_sale", // drawer opened with no linked order/payment
]);

// Severity map per operation type
function getSeverity(
  operationType: string,
  linkedToOrder: boolean,
): "info" | "warning" | "critical" {
  if (operationType === "paid_out") return "warning";
  if (operationType === "adjustment") return "warning";
  if (!linkedToOrder && operationType === "opening") return "warning"; // no-sale open
  return "info";
}

// ============================================================================
// LOG CASH DRAWER EVENT
// Called by the POS tablet for auditable cash drawer operations.
// ============================================================================

export async function logCashDrawerEvent(params: {
  merchantId: string;
  locationId: string;
  drawerId: string;
  drawerName: string;
  operationType: string;
  amount: number; // in cents
  performedByStaffId?: string;
  performedByName?: string;
  orderId?: string | null;
  reason?: string | null;
  balanceAfter?: number | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServerSupabaseClient();

    const linkedToOrder = !!params.orderId;
    const severity = getSeverity(params.operationType, linkedToOrder);

    // Only log high-risk ops OR all ops if you want full coverage
    // For now: always log so merchants can see cash drawer activity
    await LogAuditEvent({
      merchantId: params.merchantId,
      locationId: params.locationId,
      action: buildCashDrawerAction(params.operationType, linkedToOrder),
      actionCategory: "cash_drawer",
      resourceType: "cash_drawer",
      resourceId: params.drawerId,
      resourceName: params.drawerName,
      severity,
      metadata: {
        operation_type: params.operationType,
        amount_cents: params.amount,
        amount_dollars: (params.amount / 100).toFixed(2),
        linked_to_order: linkedToOrder,
        order_id: params.orderId ?? null,
        balance_after_cents: params.balanceAfter ?? null,
        performed_by_name: params.performedByName ?? null,
        reason: params.reason ?? null,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("[logCashDrawerEvent] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function buildCashDrawerAction(
  operationType: string,
  linkedToOrder: boolean,
): string {
  switch (operationType) {
    case "opening":
      return linkedToOrder
        ? "Cash Drawer: Opened for sale"
        : "Cash Drawer: Opened without sale (no-sale)";
    case "closing":
      return "Cash Drawer: Session closed";
    case "paid_out":
      return "Cash Drawer: Cash paid out";
    case "paid_in":
      return "Cash Drawer: Cash paid in";
    case "tip_out":
      return "Cash Drawer: Tip payout";
    case "drop":
      return "Cash Drawer: Cash drop";
    case "adjustment":
      return "Cash Drawer: Manual adjustment";
    case "refund":
      return "Cash Drawer: Refund issued";
    case "sale":
      return "Cash Drawer: Opened for sale";
    default:
      return `Cash Drawer: ${operationType}`;
  }
}

// ============================================================================
// GET CASH DRAWER SESSIONS FOR LOCATION
// Merchant dashboard read: view open/closed sessions for a location.
// ============================================================================

export async function getCashDrawerSessions(
  locationId: string,
  limit = 50,
): Promise<{ success: boolean; data?: CashDrawerSession[]; error?: string }> {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("cash_drawer_sessions")
      .select(
        `
        id,
        cash_drawer_id,
        merchant_id,
        location_id,
        business_date,
        opened_by,
        opened_at,
        opening_amount,
        closed_by,
        closed_at,
        closing_amount,
        variance,
        variance_notes,
        status
      `,
      )
      .eq("location_id", locationId)
      .order("opened_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[getCashDrawerSessions] Error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: (data ?? []) as CashDrawerSession[] };
  } catch (error) {
    console.error("[getCashDrawerSessions] Exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export interface CashDrawerSession {
  id: string;
  cash_drawer_id: string;
  merchant_id: string;
  location_id: string;
  business_date: string;
  opened_by: string;
  opened_at: string;
  opening_amount: number;
  closed_by: string | null;
  closed_at: string | null;
  closing_amount: number | null;
  variance: number | null;
  variance_notes: string | null;
  status: "open" | "closed" | "reconciled";
}
