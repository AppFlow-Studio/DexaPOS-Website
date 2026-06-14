"use server";

import { auth } from "@clerk/nextjs/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  getEffectiveMerchantContext,
  UnauthorizedOrgError,
} from "@/lib/admin/merchant-context";
import {
  loadInvoiceForSend,
  dispatchInvoiceSend,
  type SendInvoiceChannel,
  type ChannelResult,
  type SendInvoiceResult,
} from "@/lib/messaging/invoice-send-core";

// Re-export the shared channel/result types so existing consumers
// (useSendInvoice, SendInvoiceDialog) keep importing them from here.
export type { SendInvoiceChannel, ChannelResult, SendInvoiceResult };

export interface SendInvoiceParams {
  invoiceId: string;
  channels: SendInvoiceChannel[];
  /** Overrides the customer's email; falls back to the linked customer. */
  email?: string;
  /** Overrides the customer's phone; falls back to the linked customer. */
  phone?: string;
  /** When true, persist a provided email/phone to the linked customer profile. */
  saveToProfile?: boolean;
}

/** Confirms the invoice belongs to the caller's effective merchant. */
async function effectiveMerchantOwns(merchantId: string | null | undefined): Promise<boolean> {
  if (!merchantId) return false;
  try {
    const ctx = await getEffectiveMerchantContext(null);
    return ctx.merchantId === merchantId;
  } catch (err) {
    if (err instanceof UnauthorizedOrgError) return false;
    throw err;
  }
}

export async function sendInvoice(
  params: SendInvoiceParams,
): Promise<SendInvoiceResult> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, message: "Unauthorized", results: [] };
  }

  const channels = Array.from(new Set(params.channels ?? []));
  if (channels.length === 0) {
    return { success: false, message: "Select at least one channel.", results: [] };
  }

  const supabase = createServiceRoleClient();
  const invoice = await loadInvoiceForSend(supabase, params.invoiceId);
  if (!invoice) {
    return { success: false, message: "Invoice not found", results: [] };
  }

  const merchantId = invoice.merchant_id as string | undefined;
  if (!(await effectiveMerchantOwns(merchantId))) {
    return { success: false, message: "Invoice not found", results: [] };
  }

  // Recipients: explicit overrides win, else fall back to the linked customer.
  const customer = (invoice.customer as {
    id?: string;
    email?: string | null;
    phone?: string | null;
  } | null) ?? null;
  const emailRecipient = (params.email || customer?.email || "").trim();
  const phoneRecipient = (params.phone || customer?.phone || "").trim();

  return dispatchInvoiceSend({
    supabase,
    userId,
    invoice,
    channels,
    emailRecipient,
    phoneRecipient,
    onEmailDelivered:
      params.saveToProfile && customer?.id && params.email
        ? async () => {
            await supabase
              .from("customers")
              .update({ email: emailRecipient })
              .eq("id", customer.id!);
          }
        : undefined,
    onSmsDelivered:
      params.saveToProfile && customer?.id && params.phone
        ? async () => {
            await supabase
              .from("customers")
              .update({ phone: phoneRecipient })
              .eq("id", customer.id!);
          }
        : undefined,
  });
}
