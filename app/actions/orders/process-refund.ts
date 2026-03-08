"use server";

// ─── Refund Request Types ───

export interface RefundItemRequest {
  orderItemId: string;
  quantity: number;
  returnToInventory: boolean;
  reason: string;
}

export interface RefundRequest {
  orderId: string;
  refundType: "full" | "partial" | "item_return";
  amount: number;
  paymentId: string;
  reasonCode: string;
  reasonDetail?: string;
  approvedBy?: string;
  items?: RefundItemRequest[];
}

/**
 * Process a refund request.
 *
 * TODO: Implement when payment provider is finalized.
 * Future implementation will:
 *   1. Call create_reversal RPC
 *   2. Call record_refund_items RPC (for item returns)
 *   3. Send reversal to payment terminal/processor
 *   4. Update order status if fully refunded
 */
export async function processRefund(
  request: RefundRequest
): Promise<{ success: boolean; message: string; stub?: boolean }> {
  void request; // Acknowledge params for future implementation
  return {
    success: false,
    message:
      "Refund processing is not yet available. This feature is pending payment provider integration.",
    stub: true,
  };
}
