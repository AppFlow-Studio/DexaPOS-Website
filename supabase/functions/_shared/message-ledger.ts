// Shared by Node and Edge senders. This module NEVER sends a provider message.
export interface LedgerClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: { code?: string } | null }>;
  from(name: string): { insert(row: Record<string, unknown>): PromiseLike<{ error: { code?: string } | null }> };
}

export type LedgerWriteResult = { ok: true } | {
  ok: false; error: string; recoveryQueued: boolean; providerMessageId: string | null;
};

export async function writeOutboundLedger(client: LedgerClient, args: Record<string, unknown>): Promise<LedgerWriteResult> {
  const providerMessageId = typeof args.p_telnyx_message_id === 'string' ? args.p_telnyx_message_id : null;
  let errorCode = 'transport_error';
  try {
    const { error } = await client.rpc('log_outbound_message', args);
    if (!error) return { ok: true };
    errorCode = error.code ?? 'rpc_error';
  } catch { /* A transport failure cannot undo an accepted SMS. */ }

  let recoveryQueued = false;
  try {
    const { error } = await client.from('webhook_dead_letter_queue').insert({
      source: 'telnyx_outbound',
      external_event_id: providerMessageId ?? crypto.randomUUID(),
      event_type: 'outbound.ledger_repair',
      // The caller supplies the ledger-safe body (OTP senders redact it).
      raw_payload: { version: 1, rpc_args: args },
      error_message: `log_outbound_message failed: ${errorCode}`,
    });
    recoveryQueued = !error || error.code === '23505';
  } catch { /* Report both failures; never tell the caller to resend. */ }
  console.error('[sms-ledger] tracking_write_failed', {
    merchantId: args.p_merchant_id, providerMessageId, recoveryQueued, code: errorCode,
  });
  return {
    ok: false, recoveryQueued, providerMessageId,
    error: recoveryQueued
      ? 'Message tracking is pending recovery. Do not resend the message.'
      : `Message tracking could not be saved. Contact support with provider reference ${providerMessageId ?? 'unavailable'}. Do not resend the message.`,
  };
}
