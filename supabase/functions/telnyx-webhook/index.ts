// Telnyx messaging webhook — inbound/outbound message ledger writer.
//
// Contract (Telnyx Messaging API):
//   * Events: message.received (inbound), message.sent (accepted by carrier),
//     message.finalized (terminal: delivered / failed). Shape:
//     { data: { event_type, id, occurred_at, payload, record_type }, meta }.
//   * Security: Ed25519 signature over `${timestamp}|${rawBody}`, sent in headers
//     `telnyx-signature-ed25519` (base64) + `telnyx-timestamp` (unix seconds),
//     verified against the Telnyx public key. 300s timestamp tolerance blocks replays.
//     VERIFY BEFORE PARSING — a forged/unsigned request writes nothing (4xx).
//   * Ack: return 2xx fast or Telnyx retries (up to 3) then hits the failover URL.
//   * Idempotency: Telnyx can redeliver — dedupe handled in record_telnyx_message
//     (unique telnyx_message_id), so a redelivered event is a harmless no-op upsert.

import { createClient } from 'npm:@supabase/supabase-js'

const TELNYX_PUBLIC_KEY = Deno.env.get('TELNYX_PUBLIC_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const TIMESTAMP_TOLERANCE_SECONDS = 300

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** base64 string -> Uint8Array */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * Verify Telnyx's Ed25519 signature over `${timestamp}|${rawBody}`.
 * Returns false on any error (missing headers, bad key, bad signature).
 */
async function verifyTelnyxSignature(
  rawBody: string,
  signatureB64: string | null,
  timestamp: string | null,
): Promise<boolean> {
  if (!TELNYX_PUBLIC_KEY || !signatureB64 || !timestamp) return false

  // Replay guard: reject stale timestamps.
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  const ageSeconds = Math.abs(Date.now() / 1000 - ts)
  if (ageSeconds > TIMESTAMP_TOLERANCE_SECONDS) return false

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      b64ToBytes(TELNYX_PUBLIC_KEY),
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
    const signedPayload = new TextEncoder().encode(`${timestamp}|${rawBody}`)
    return await crypto.subtle.verify('Ed25519', key, b64ToBytes(signatureB64), signedPayload)
  } catch (err) {
    console.error('[telnyx-webhook] signature verification threw', err)
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'server_not_configured' }, 500)
  }

  // Read the raw body BEFORE parsing — the signature covers the exact bytes.
  const rawBody = await req.text()
  const signature = req.headers.get('telnyx-signature-ed25519')
  const timestamp = req.headers.get('telnyx-timestamp')

  const verified = await verifyTelnyxSignature(rawBody, signature, timestamp)
  if (!verified) {
    // Forged / unsigned / stale -> reject, write nothing.
    return json({ error: 'invalid_signature' }, 401)
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const eventType =
    (payload as { data?: { event_type?: string } })?.data?.event_type ?? 'unknown'

  // Only message.* events carry a ledger-relevant payload; ack anything else.
  if (!eventType.startsWith('message.')) {
    return json({ ok: true, ignored: eventType }, 200)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Single writer: idempotent upsert + recipient rollup + STOP/START all happen
  // inside record_telnyx_message. The RPC is a single fast statement, so we await
  // it and surface a 500 (=> Telnyx retry, protected by idempotency) on failure.
  const { data, error } = await supabase.rpc('record_telnyx_message', {
    p_payload: payload,
  })

  if (error) {
    console.error('[telnyx-webhook] record_telnyx_message failed', error)
    return json({ error: 'ledger_write_failed', detail: error.message }, 500)
  }

  return json({ ok: true, result: data }, 200)
})
