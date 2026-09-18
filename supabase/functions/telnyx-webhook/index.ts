// Telnyx messaging webhook: verified inbound/outbound message ledger writer.
// The signature covers the exact `${timestamp}|${rawBody}` bytes, so verify
// before parsing. Message rows dedupe on provider message ID; DLQ rows dedupe
// on provider event ID.

import { createClient } from 'npm:@supabase/supabase-js'

const TELNYX_PUBLIC_KEY = Deno.env.get('TELNYX_PUBLIC_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const TIMESTAMP_TOLERANCE_SECONDS = 300
const MESSAGE_EVENTS = new Set([
  'message.received',
  'message.sent',
  'message.finalized',
])

interface TelnyxEnvelope {
  data?: {
    id?: string
    event_type?: string
    payload?: unknown
  }
  meta?: unknown
}

interface LedgerResult {
  ok?: boolean
  reason?: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function b64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer as ArrayBuffer
}

async function verifyTelnyxSignature(
  rawBody: string,
  signatureB64: string | null,
  timestamp: string | null,
): Promise<boolean> {
  if (!TELNYX_PUBLIC_KEY || !signatureB64 || !timestamp) return false

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  const ageSeconds = Math.abs(Date.now() / 1000 - ts)
  if (ageSeconds > TIMESTAMP_TOLERANCE_SECONDS) return false

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      b64ToBuffer(TELNYX_PUBLIC_KEY),
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
    const signedPayload = new TextEncoder().encode(`${timestamp}|${rawBody}`)
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      b64ToBuffer(signatureB64),
      signedPayload,
    )
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

  const rawBody = await req.text()
  const signature = req.headers.get('telnyx-signature-ed25519')
  const timestamp = req.headers.get('telnyx-timestamp')

  if (!(await verifyTelnyxSignature(rawBody, signature, timestamp))) {
    return json({ error: 'invalid_signature' }, 401)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return json({ error: 'invalid_payload' }, 400)
  }
  const payload = parsed as TelnyxEnvelope

  const eventType = payload.data?.event_type ?? 'unknown'
  const eventId = payload.data?.id ?? null
  if (!MESSAGE_EVENTS.has(eventType)) {
    return json({ ok: true, ignored: eventType }, 200)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  async function deadLetter(errorMessage: string): Promise<boolean> {
    const { error: dlqError } = await supabase
      .from('webhook_dead_letter_queue')
      .insert({
        source: 'telnyx',
        external_event_id: eventId,
        event_type: eventType,
        raw_payload: payload,
        error_message: errorMessage,
      })

    if (!dlqError || dlqError.code === '23505') return true
    console.error('[telnyx-webhook] DLQ write failed', {
      code: dlqError.code,
      message: dlqError.message,
    })
    return false
  }

  const { data, error } = await supabase.rpc('record_telnyx_message', {
    p_payload: payload,
  })
  const ledgerResult = data as LedgerResult | null

  if (error || ledgerResult?.ok !== true) {
    const reason = error?.message ?? ledgerResult?.reason ?? 'ledger_write_failed'
    const captured = await deadLetter(reason)
    console.error('[telnyx-webhook] ledger write failed', {
      eventId,
      eventType,
      captured,
      code: error?.code,
    })
    return json({ error: 'ledger_write_failed', captured }, 500)
  }

  return json({ ok: true, result: ledgerResult }, 200)
})
