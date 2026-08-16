// Valor auto-batch webhook receiver.
//
// Contract (Valor webhook user guide — https://valorapi.readme.io/reference/webhook-user-guide):
//   * Events: batch_summary (batch-level totals) on every batch close, including
//     the nightly auto-batch. Keyed on the device EPI (epi_id).
//   * Security: HMAC-SHA256 over `${rawBody}${timestamp}`, hex digest in header
//     `Valor-Signature`; `Valor-Timestamp` is an ISO-8601 UTC timestamp.
//     VERIFY BEFORE PARSING — a forged/unsigned request writes nothing (4xx).
//   * Ack: return 2xx within ~2s or Valor retries (max 3). Idempotency handled
//     in record_valor_batch_webhook (unique webhook batch per terminal+batch_no),
//     so a redelivered summary is a harmless no-op.
//
// Model: supabase/functions/telnyx-webhook/index.ts (verify-before-parse over the
// raw body, then a SECURITY DEFINER RPC via the service-role client).

import { createClient } from 'npm:@supabase/supabase-js'

const VALOR_WEBHOOK_SECRET = Deno.env.get('VALOR_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const TIMESTAMP_TOLERANCE_SECONDS = 600

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Lowercase hex of an ArrayBuffer. */
function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time string compare (equal length hex strings). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

/**
 * Verify Valor's HMAC-SHA256 hex signature over `${rawBody}${timestamp}`.
 * Returns false on any error (missing secret/headers, stale timestamp, mismatch).
 */
async function verifyValorSignature(
  rawBody: string,
  signatureHex: string | null,
  timestamp: string | null,
): Promise<boolean> {
  if (!VALOR_WEBHOOK_SECRET || !signatureHex || !timestamp) return false

  // Replay guard: reject stale timestamps (ISO-8601 UTC).
  const tsMs = Date.parse(timestamp)
  if (!Number.isFinite(tsMs)) return false
  const ageSeconds = Math.abs(Date.now() - tsMs) / 1000
  if (ageSeconds > TIMESTAMP_TOLERANCE_SECONDS) return false

  try {
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(VALOR_WEBHOOK_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${rawBody}${timestamp}`))
    return timingSafeEqual(toHex(mac), signatureHex.trim().toLowerCase())
  } catch (err) {
    console.error('[valor-webhook] signature verification threw', err)
    return false
  }
}

Deno.serve(async (req) => {
  // Reachability / URL-validation ping (the Valor dashboard "validate URL" step)
  // and CORS preflight — always ack 200, no secret or signature required. These
  // carry no batch data, so there is nothing to protect.
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return json({ ok: true, service: 'valor-webhook' }, 200)
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  // Read the raw body BEFORE parsing — the signature covers the exact bytes.
  const rawBody = await req.text()

  // Classify: only a real `batch_summary` writes data. Anything else (a validation
  // POST, an empty body, an out-of-scope event) is ack'd 200 WITHOUT requiring a
  // signature — so URL validation passes even before VALOR_WEBHOOK_SECRET is set.
  let payload: unknown = null
  try {
    payload = rawBody ? JSON.parse(rawBody) : null
  } catch {
    payload = null
  }
  const data =
    (payload as { data?: Record<string, unknown> } | null)?.data ??
    (payload as Record<string, unknown> | null)
  const looksLikeBatchSummary =
    !!data &&
    typeof data === 'object' &&
    (('batch_no' in data && 'epi_id' in data) || 'batches_id' in data)

  if (!looksLikeBatchSummary) {
    return json({ ok: true, ignored: true }, 200)
  }

  // From here on we are processing a real event: require config + valid HMAC.
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VALOR_WEBHOOK_SECRET) {
    return json({ error: 'server_not_configured' }, 500)
  }

  const signature = req.headers.get('Valor-Signature') ?? req.headers.get('valor-signature')
  const timestamp = req.headers.get('Valor-Timestamp') ?? req.headers.get('valor-timestamp')

  const verified = await verifyValorSignature(rawBody, signature, timestamp)
  if (!verified) {
    return json({ error: 'invalid_signature' }, 401)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: result, error } = await supabase.rpc('record_valor_batch_webhook', {
    p_payload: payload,
  })

  if (error) {
    console.error('[valor-webhook] record_valor_batch_webhook failed', error)
    // 500 => Valor retries (idempotency-protected).
    return json({ error: 'record_failed', detail: error.message }, 500)
  }

  return json({ ok: true, result }, 200)
})
