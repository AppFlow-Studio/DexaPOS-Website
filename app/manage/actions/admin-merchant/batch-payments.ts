"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { PaymentRecord } from "@/types/payment";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin counterpart to dashboard's GetBatchPayments — scoped by merchant UUID
 * (not clerk org), uses service-role for cross-merchant HQ context. Returns
 * full PaymentRecord rows for a settlement batch so the admin Settlements view
 * can render the same rich expandable detail (auth code, RRN, terminal info,
 * items paid, EMV) the merchant sees.
 *
 * `batchId` may be:
 *  - a `settlement_batches.id` UUID (preferred) — resolved to the canonical
 *    (batch_number, acquirer) tuple before joining order_payments;
 *  - a legacy `settlement_batches.batch_id` text label ('LAZY-...', 'DEXA-...')
 *    — same lookup path;
 *  - a raw host batch number ('009') — used directly.
 */
export async function GetAdminBatchPayments(
    merchantId: string,
    batchId: string
): Promise<PaymentRecord[]> {
    if (!merchantId || !batchId) return [];

    const supabase = createServiceRoleClient();

    // Resolve `batchId` to the settlement_batches row so we can prefer the
    // FK link (order_payments.settlement_batch_id = sb.id) and fall back to
    // a host-batch-number match scoped by terminal + business date.
    let batchUuid: string | null = null;
    let hostBatchNumber: string | null = null;
    let acquirer: string | null = null;
    let terminalId: string | null = null;
    let businessDate: string | null = null;

    if (UUID_RE.test(batchId)) {
        const { data: sb } = await supabase
            .from("settlement_batches")
            .select("id, batch_number, acquirer, terminal_id, business_date")
            .eq("id", batchId)
            .eq("merchant_id", merchantId)
            .maybeSingle();
        batchUuid = sb?.id ?? null;
        hostBatchNumber = sb?.batch_number ?? null;
        acquirer = sb?.acquirer ?? null;
        terminalId = sb?.terminal_id ?? null;
        businessDate = sb?.business_date ?? null;
    } else {
        const { data: sb } = await supabase
            .from("settlement_batches")
            .select("id, batch_number, acquirer, terminal_id, business_date")
            .eq("batch_id", batchId)
            .eq("merchant_id", merchantId)
            .maybeSingle();
        batchUuid = sb?.id ?? null;
        hostBatchNumber = sb?.batch_number ?? null;
        acquirer = sb?.acquirer ?? null;
        terminalId = sb?.terminal_id ?? null;
        businessDate = sb?.business_date ?? null;
        if (!batchUuid && !hostBatchNumber) {
            // Treat the input as a raw host batch number (no scoping context).
            hostBatchNumber = batchId;
        }
    }

    if (!batchUuid && !hostBatchNumber) return [];

    const baseSelect = `
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
    `;

    // Preferred path: FK match. If the batch has a UUID, try this first.
    let data: any[] | null = null;
    if (batchUuid) {
        const { data: fkRows, error: fkErr } = await supabase
            .from("order_payments")
            .select(baseSelect)
            .eq("orders.merchant_id", merchantId)
            .eq("settlement_batch_id", batchUuid)
            .order("initiated_at", { ascending: false });
        if (fkErr) {
            console.error("[GetAdminBatchPayments] FK lookup error:", fkErr);
            return [];
        }
        data = fkRows ?? [];
    }

    // Fallback: host-batch-number match, scoped by terminal + business date
    // (±1 day) so recycled batch numbers from other terminals/days don't leak.
    if ((!data || data.length === 0) && hostBatchNumber) {
        let q = supabase
            .from("order_payments")
            .select(baseSelect)
            .eq("orders.merchant_id", merchantId)
            .is("settlement_batch_id", null)
            .or(`batch_number.eq.${hostBatchNumber},dejavoo_batch_number.eq.${hostBatchNumber}`)
            .order("initiated_at", { ascending: false });

        if (terminalId) {
            q = q.eq("terminal_id", terminalId);
        }

        if (businessDate) {
            const d = new Date(`${businessDate}T00:00:00Z`);
            const from = new Date(d.getTime() - 24 * 60 * 60 * 1000).toISOString();
            const to = new Date(d.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
            q = q.gte("initiated_at", from).lt("initiated_at", to);
        }

        const { data: fbRows, error: fbErr } = await q;
        if (fbErr) {
            console.error("[GetAdminBatchPayments] Fallback lookup error:", fbErr);
            return [];
        }
        data = fbRows ?? [];
    }

    return (data as PaymentRecord[]) || [];
}
