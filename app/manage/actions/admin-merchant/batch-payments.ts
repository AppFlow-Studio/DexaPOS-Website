"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { PaymentRecord } from "@/types/payment";

/**
 * Admin counterpart to dashboard's GetBatchPayments — scoped by merchant UUID
 * (not clerk org), uses service-role for cross-merchant HQ context. Returns
 * full PaymentRecord rows for a settlement batch so the admin Settlements view
 * can render the same rich expandable detail (auth code, RRN, terminal info,
 * items paid, EMV) the merchant sees.
 */
export async function GetAdminBatchPayments(
    merchantId: string,
    batchId: string
): Promise<PaymentRecord[]> {
    if (!merchantId || !batchId) return [];

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
        .from("order_payments")
        .select(
            `
      *,
      orders!inner(
        order_number,
        display_number,
        location_id,
        status,
        order_type,
        customer_name,
        created_at,
        merchant_id
      ),
      order_payment_items(
        *,
        order_items(id, item_name, quantity)
      ),
      reversals(
        *,
        order_refund_items(*)
      )
    `
        )
        .eq("orders.merchant_id", merchantId)
        .or(`batch_number.eq.${batchId},dejavoo_batch_number.eq.${batchId}`)
        .order("initiated_at", { ascending: false });

    if (error) {
        console.error("[GetAdminBatchPayments] Error:", error);
        return [];
    }

    return (data as PaymentRecord[]) || [];
}
