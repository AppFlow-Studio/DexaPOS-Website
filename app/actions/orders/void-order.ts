"use server";

// ─── Void Order Request Types ───

export interface VoidOrderRequest {
  orderId: string;
  reason: string;
  reasonDetail?: string;
  approvedBy: string;
  paymentIds: string[];
}

/**
 * Void an entire order and reverse all payments.
 *
 * TODO: Implement when payment provider is finalized.
 * Future implementation will:
 *   1. Call create_reversal with type='void' for each payment
 *   2. Send void to payment terminal/processor per payment
 *   3. Update order status to 'void'
 *   4. Set orders.cancelled_at and cancellation_reason
 */
export async function voidOrder(
  request: VoidOrderRequest
): Promise<{ success: boolean; message: string; stub?: boolean }> {
  void request; // Acknowledge params for future implementation
  return {
    success: false,
    message:
      "Void processing not yet available — pending payment provider integration.",
    stub: true,
  };
}
