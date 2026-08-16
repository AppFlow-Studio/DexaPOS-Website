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
  const t0 = Date.now()
  // Lazily-created service-role client, reused for logging + the record RPC.
  const supabase =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null

  // Durable per-request log (valor_webhook_events). Best-effort — never blocks
  // or fails the response.
  async function logEvent(
    outcome: string,
    verified: boolean,
    httpStatus: number,
    opts: { epi?: string | null; batchNo?: string | null; batchUuid?: string | null; detail?: string | null; raw?: unknown } = {},
  ): Promise<void> {
    if (!supabase) return
    try {
      await supabase.rpc('log_valor_webhook_event', {
        p_epi: opts.epi ?? null,
        p_batch_no: opts.batchNo ?? null,
        p_verified: verified,
        p_outcome: outcome,
        p_http_status: httpStatus,
        p_latency_ms: Date.now() - t0,
        p_detail: opts.detail ?? null,
        p_settlement_batch_id: opts.batchUuid ?? null,
        p_raw: (opts.raw ?? null) as Record<string, unknown> | null,
      })
    } catch (err) {
      console.error('[valor-webhook] logEvent failed', err)
    }
  }

  // Reachability / URL-validation ping (the Valor dashboard validate-URL step)
  // and CORS preflight — always ack 200, no secret or signature required.
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    await logEvent('validation', false, 200, { detail: req.method })
    return json({ ok: true, service: 'valor-webhook' }, 200)
  }

  if (req.method !== 'POST') {
    await logEvent('error', false, 405, { detail: `method_not_allowed:${req.method}` })
    return json({ error: 'method_not_allowed' }, 405)
  }

  // Read the raw body BEFORE parsing — the signature covers the exact bytes.
  const rawBody = await req.text()

  let payload: unknown = null
  try {
    payload = rawBody ? JSON.parse(rawBody) : null
  } catch {
    payload = null
  }
  const data =
    (payload as { data?: Record<string, unknown> } | null)?.data ??
    (payload as Record<string, unknown> | null)
  const epi = (data && typeof data === 'object' ? (data['epi_id'] as string | undefined) : undefined) ?? null
  const batchNo =
    data && typeof data === 'object'
      ? ((data['batch_no'] as string | number | undefined)?.toString() ?? null)
      : null
  const looksLikeBatchSummary =
    !!data &&
    typeof data === 'object' &&
    (('batch_no' in data && 'epi_id' in data) || 'batches_id' in data)

  // Anything that isn't a batch_summary (validation POST, empty body, other
  // event) is ack'd 200 without a signature — so URL validation passes even
  // before the secret is set.
  if (!looksLikeBatchSummary) {
    await logEvent('ignored', false, 200, { epi, batchNo, raw: payload })
    return json({ ok: true, ignored: true }, 200)
  }

  // From here we are processing a real event: require config + valid HMAC.
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VALOR_WEBHOOK_SECRET) {
    await logEvent('error', false, 500, { epi, batchNo, detail: 'server_not_configured', raw: payload })
    return json({ error: 'server_not_configured' }, 500)
  }

  const signature = req.headers.get('Valor-Signature') ?? req.headers.get('valor-signature')
  const timestamp = req.headers.get('Valor-Timestamp') ?? req.headers.get('valor-timestamp')

  const verified = await verifyValorSignature(rawBody, signature, timestamp)
  if (!verified) {
    await logEvent('invalid_signature', false, 401, { epi, batchNo, detail: 'HMAC verification failed or stale timestamp', raw: payload })
    return json({ error: 'invalid_signature' }, 401)
  }

  const { data: result, error } = await supabase!.rpc('record_valor_batch_webhook', {
    p_payload: payload,
  })

  if (error) {
    console.error('[valor-webhook] record_valor_batch_webhook failed', error)
    await logEvent('error', true, 500, { epi, batchNo, detail: error.message, raw: payload })
    // 500 => Valor retries (idempotency-protected).
    return json({ error: 'record_failed', detail: error.message }, 500)
  }

  // Map the RPC result to a log outcome.
  const r = (result ?? {}) as {
    ok?: boolean; reason?: string; status?: string; batch_uuid?: string
  }
  const outcome =
    r.ok === false ? 'dead_letter' : r.status === 'needs_review' ? 'needs_review' : 'processed'
  await logEvent(outcome, true, 200, {
    epi,
    batchNo,
    batchUuid: r.batch_uuid ?? null,
    detail: r.reason ?? r.status ?? null,
    raw: payload,
  })

  return json({ ok: true, result }, 200)
})
