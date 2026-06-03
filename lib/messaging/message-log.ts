import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Records an outbound message in the message_log ledger at send time via the
 * log_outbound_message RPC (Part C). Telnyx delivery/finalized webhooks later
 * advance the same row (matched on telnyx_message_id) through record_telnyx_message.
 *
 * Best-effort: a logging failure must never break the actual send, so this
 * swallows errors and only logs them.
 */
export async function logOutboundMessage(
  supabase: SupabaseClient,
  params: {
    merchantId: string;
    toNumber: string;
    body: string;
    telnyxMessageId?: string | null;
    channel?: "sms" | "email";
    customerId?: string | null;
    campaignId?: string | null;
    recipientId?: string | null;
    status?: string;
    errorCode?: string | null;
  }
): Promise<void> {
  try {
    const { error } = await (supabase as any).rpc("log_outbound_message", {
      p_merchant_id: params.merchantId,
      p_to_number: params.toNumber,
      p_body: params.body,
      p_telnyx_message_id: params.telnyxMessageId ?? null,
      p_channel: params.channel ?? "sms",
      p_customer_id: params.customerId ?? null,
      p_campaign_id: params.campaignId ?? null,
      p_recipient_id: params.recipientId ?? null,
      p_status: params.status ?? "sent",
      p_error_code: params.errorCode ?? null,
    });
    if (error) {
      console.error("[logOutboundMessage] RPC error (non-fatal)", error);
    }
  } catch (err) {
    console.error("[logOutboundMessage] threw (non-fatal)", err);
  }
}
