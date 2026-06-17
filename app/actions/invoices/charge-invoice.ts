"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

// =============================================================================
// chargeInvoice() — the payment boundary §§1–5 build against and Ali Dika fills
// with live NMI in §8. This file owns the *contract*: server-side amount
// resolution, already-paid + idempotency guards, and the marked NMI SEAM. The
// actual gateway sale is intentionally NOT implemented here yet.
// =============================================================================

export interface ChargeInvoiceInput {
  /** Opaque invoice link token (never the invoice UUID, never a client amount). */
  publicToken: string;
  /** NMI Collect.js token (opaque, single-use). Wired into the SEAM in §8. */
  paymentToken: string;
  /** Per-attempt key — guards double-submit from the public pay page. */
  idempotencyKey: string;
}

export interface ChargeInvoiceResult {
  success: boolean;
  status: "paid" | "declined" | "error";
  message: string;
}

export async function chargeInvoice(
  input: ChargeInvoiceInput,
): Promise<ChargeInvoiceResult> {
  const { publicToken, idempotencyKey } = input;

  if (!publicToken || !idempotencyKey) {
    return { success: false, status: "error", message: "Missing required fields." };
  }

  // Service-role: the payer is anonymous (public page), so RLS can't scope this.
  // Trust comes from the unguessable publicToken, not from the session.
  const supabase = createServiceRoleClient();

  // ── Resolve invoice + canonical total SERVER-SIDE from the token ───────────
  // The amount to charge is always derived here; a client-supplied amount is
  // never trusted.
  const { data: invoice, error: invoiceErr } = await supabase
    .from("invoices")
    .select("id, merchant_id, location_id, status, total_amount, amount_paid")
    .eq("public_token", publicToken)
    .single();

  if (invoiceErr || !invoice) {
    return { success: false, status: "error", message: "Invoice not found." };
  }

  const inv = invoice as {
    id: string;
    merchant_id: string;
    location_id: string | null;
    status: string;
    total_amount: number;
    amount_paid: number;
  };

  // ── Guard: already paid ────────────────────────────────────────────────────
  if (inv.status === "paid") {
    return { success: false, status: "error", message: "This invoice is already paid." };
  }
  if (inv.status === "cancelled") {
    return { success: false, status: "error", message: "This invoice has been cancelled." };
  }

  // ── Guard: duplicate idempotency key (double-submit) ───────────────────────
  const { data: existingAttempt } = await supabase
    .from("invoice_payments")
    .select("id, status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingAttempt) {
    const prior = existingAttempt as { status: string };
    if (prior.status === "captured" || prior.status === "paid") {
      return { success: true, status: "paid", message: "Payment already processed." };
    }
    return {
      success: false,
      status: "error",
      message: "A payment attempt with this key is already in progress.",
    };
  }

  // The canonical amount to charge: remaining balance.
  const amountDue = Math.max(0, Number(inv.total_amount) - Number(inv.amount_paid));
  if (amountDue <= 0) {
    return { success: false, status: "error", message: "Nothing left to pay on this invoice." };
  }

  // ════════════════════════════════════════════════════════════════════════
  // NMI SEAM — §8 (Ali Dika)
  // ────────────────────────────────────────────────────────────────────────
  // Resolve the merchant's NMI config from location_payment_devices
  // (provider='nmi'), then call createNmiSale() from @/lib/payments/nmi with
  // `input.paymentToken` and `amountDue`. On approval:
  //   1. insert invoice_payments {invoice_id, merchant_id, location_id, amount,
  //      status:'captured', transaction_id, authorization_code, card_*,
  //      idempotency_key}
  //   2. insert payment_events {payment_id, invoice_id, event_type:'captured', …}
  //   3. update invoices set status='paid', paid_at=now(),
  //      amount_paid = amount_paid + amountDue
  // On decline: write a failed invoice_payments row + 'declined' event and
  // return { success:false, status:'declined', message }.
  //
  // Until then, the boundary is intentionally inert so nothing can mark an
  // invoice paid without a real gateway result.
  // ════════════════════════════════════════════════════════════════════════
  return {
    success: false,
    status: "error",
    message: "NMI not yet wired (payment processing arrives in §8).",
  };
}
