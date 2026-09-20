import type { SupabaseClient } from "@supabase/supabase-js";
import type { SmsSendResult } from "@/lib/messaging/telnyx";
import { writeOutboundLedger, type LedgerClient, type LedgerWriteResult } from "@/supabase/functions/_shared/message-ledger";

export type MessageLogResult = LedgerWriteResult;

interface SmsLedgerContext {
  merchantId: string;
  toNumber: string;
  body: string;
  customerId?: string | null;
  campaignId?: string | null;
  recipientId?: string | null;
}

/**
 * Records an outbound message in the message_log ledger at send time via the
 * log_outbound_message RPC (Part C). Telnyx delivery/finalized webhooks later
 * advance the same row (matched on telnyx_message_id) through record_telnyx_message.
 *
 * A logging failure cannot undo a provider send, so return it to the caller for
 * explicit handling without encouraging an unsafe retry that could send twice.
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
    fromNumber?: string | null;
    messagingProfileId?: string | null;
  }
): Promise<MessageLogResult> {
  return writeOutboundLedger(supabase as unknown as LedgerClient, {
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
    p_from_number: params.fromNumber ?? null,
    p_messaging_profile_id: params.messagingProfileId ?? null,
  });
}

export function logSmsSendResult(
  supabase: SupabaseClient,
  context: SmsLedgerContext,
  result: SmsSendResult,
): Promise<MessageLogResult> {
  const failed = "error" in result;
  return logOutboundMessage(supabase, {
    ...context,
    telnyxMessageId: result.id ?? null,
    status: failed ? "failed" : "sent",
    errorCode: failed ? (result.errorCode ?? result.error) : null,
    fromNumber: result.fromNumber ?? null,
    messagingProfileId: result.messagingProfileId ?? null,
  });
}
