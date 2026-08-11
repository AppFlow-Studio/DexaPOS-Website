// [OrderOut] Outbound status relay worker.
//
// Drains public.orderout_status_relay_queue and tells OrderOut that a POS/KDS
// "Ready" actually happened, so UberEats / DoorDash / Grubhub advance the order
// and the customer and courier get notified.
//
// Invoked two ways, both best-effort on their own:
//   - pg_net poke from trg_relay_orderout_status the instant a row is enqueued
//   - the `orderout-status-relay-drain` cron job, every minute
// The queue is the source of truth; a lost invocation only costs latency.
//
// Auth: x-internal-secret must equal INTERNAL_NOTIFICATION_SECRET. Deploy with
// --no-verify-jwt so pg_net can reach it without a user token.
//
// Endpoint: POST {base}/channel/order/{order_id}/mark-ready — no request body,
// answers 202 Accepted and processes asynchronously. The `order_id` is the
// value OrderOut delivered as `externalReferenceId` on the inbound order
// webhook, stored by us as online_orders.external_reference and snapshotted
// onto the queue row as oo_order_id.

import { createClient } from 'npm:@supabase/supabase-js'

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const ORDEROUT_API_KEY = Deno.env.get('ORDEROUT_API_KEY')
const ORDEROUT_BASE_URL = 'https://api.orderout.co/api'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const INTERNAL_SECRET = Deno.env.get('INTERNAL_NOTIFICATION_SECRET')

const BATCH_SIZE = 20

// Deliberately shorter than orderout-onboard's 3 x 1s/2s/4s. Here the queue is
// itself the retry mechanism (exponential backoff via next_attempt_at), so the
// in-request retry only needs to absorb a momentary blip. Keeping onboard's
// schedule would let one batch of 20 stall the worker for minutes.
const MAX_RETRIES = 2
const BASE_DELAY_MS = 500

// ============================================================================
// TYPES
// ============================================================================

interface RelayRow {
  id: string
  order_id: string
  online_order_id: string
  provider: string
  target_status: string
  oo_order_id: string
  attempts: number
  max_attempts: number
}

interface ApiResponse<T = unknown> {
  ok: boolean
  status: number
  data?: T
  error?: string
}

// ============================================================================
// RESPONSE / LOGGING HELPERS
// ============================================================================

function successResponse(data: unknown, message?: string): Response {
  return new Response(
    JSON.stringify({ success: true, data, message }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function errorResponse(error: string, status = 500, details?: unknown): Response {
  console.error(`[ERROR] ${error}`, details || '')
  return new Response(
    JSON.stringify({ success: false, error, details }),
    { status, headers: { 'Content-Type': 'application/json' } },
  )
}

function logEvent(eventType: string, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] [${eventType}] ${message}`, data ? JSON.stringify(data) : '')
}

function logError(eventType: string, message: string, error: unknown): void {
  const timestamp = new Date().toISOString()
  console.error(`[${timestamp}] [${eventType}] ERROR: ${message}`, error)
}

// ============================================================================
// AUTH — internal shared secret (constant-time compare)
// ============================================================================

function validateAuth(req: Request): { valid: boolean; error?: string } {
  if (!INTERNAL_SECRET) return { valid: false, error: 'INTERNAL_NOTIFICATION_SECRET not configured' }

  const provided = req.headers.get('x-internal-secret')
  if (!provided) return { valid: false, error: 'Missing x-internal-secret header' }

  const encoder = new TextEncoder()
  const a = encoder.encode(provided)
  const b = encoder.encode(INTERNAL_SECRET)
  if (a.byteLength !== b.byteLength) return { valid: false, error: 'Invalid internal secret' }

  let mismatch = 0
  for (let i = 0; i < a.byteLength; i++) mismatch |= a[i] ^ b[i]
  if (mismatch !== 0) return { valid: false, error: 'Invalid internal secret' }

  return { valid: true }
}

// ============================================================================
// ORDEROUT API CLIENT — same contract as orderout-onboard
// ============================================================================

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function orderOutRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  if (!ORDEROUT_API_KEY) {
    return { ok: false, status: 0, error: 'ORDEROUT_API_KEY not configured' }
  }

  const url = `${ORDEROUT_BASE_URL}${path}`
  const headers: Record<string, string> = {
    'api-key': ORDEROUT_API_KEY,
    'Content-Type': 'application/json',
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const options: RequestInit = { method, headers }
      if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.body = JSON.stringify(body)
      }

      const response = await fetch(url, options)
      const responseText = await response.text()

      let data: T | undefined
      try {
        data = JSON.parse(responseText) as T
      } catch {
        data = responseText as unknown as T
      }

      if (response.ok) {
        return { ok: true, status: response.status, data }
      }

      // Don't retry client errors (4xx) except 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return { ok: false, status: response.status, error: `API error ${response.status}`, data }
      }

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt)
        logEvent('API', `Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
        await sleep(delay)
        continue
      }

      return { ok: false, status: response.status, error: `API error after ${MAX_RETRIES} retries`, data }
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt)
        logEvent('API', `Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
        await sleep(delay)
        continue
      }
      return { ok: false, status: 0, error: `Network error: ${(err as Error).message}` }
    }
  }

  return { ok: false, status: 0, error: 'Exhausted retries' }
}

// ============================================================================
// OUTCOME CLASSIFICATION
// ============================================================================

/**
 * Terminal failures are those a retry can never fix, so they go straight to the
 * dead-letter queue instead of burning the row's remaining attempts:
 *   400/422 — malformed or the order isn't in a markable state
 *   404     — OrderOut doesn't know this order id
 *   401/403 — credential problem. Our POS key is verified working on
 *             /api/channel/ (202, 2026-07-27), so in bulk these mean the key
 *             is missing or wrong in this environment, not bad order data.
 *   411     — we sent no body. A code bug, not a transient one; retrying it
 *             five times only delays the diagnosis.
 */
function isTerminal(status: number): boolean {
  return status === 400 || status === 401 || status === 403 ||
         status === 404 || status === 411 || status === 422
}

// ============================================================================
// MAIN
// ============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const auth = validateAuth(req)
  if (!auth.valid) {
    return errorResponse(auth.error || 'Unauthorized', 401)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: claimed, error: claimError } = await supabase
    .rpc('claim_orderout_status_relay', { p_limit: BATCH_SIZE })

  if (claimError) {
    logError('CLAIM', 'Failed to claim relay batch', claimError)
    return errorResponse('Failed to claim relay batch', 500, claimError.message)
  }

  const rows = (claimed || []) as RelayRow[]
  if (rows.length === 0) {
    return successResponse({ claimed: 0, sent: 0, failed: 0, retrying: 0 }, 'Nothing to relay')
  }

  logEvent('DRAIN', `Claimed ${rows.length} row(s)`)

  let sent = 0
  let failed = 0
  let retrying = 0

  // Sequential on purpose: batches are small in practice (~10-15 delivery
  // orders/day per merchant) and serialising keeps us clear of 429s.
  for (const row of rows) {
    // The path parameter is typed <int:order_id> on OrderOut's side — a
    // non-numeric reference can never route, so fail it fast and loudly rather
    // than spending attempts on a guaranteed 404.
    if (!/^\d+$/.test(row.oo_order_id)) {
      logError('RELAY', `Non-numeric oo_order_id on row ${row.id}`, row.oo_order_id)
      await supabase.rpc('complete_orderout_status_relay', {
        p_id: row.id,
        p_ok: false,
        p_status_code: null,
        p_error: `Non-numeric oo_order_id: ${row.oo_order_id}`,
        p_terminal: true,
      })
      failed++
      continue
    }

    // The `{}` is required, not cosmetic. OrderOut's docs say mark-ready takes
    // no request body, but their edge answers 411 Length Required to a POST
    // without one — and fetch() omits Content-Length when there is no body.
    // Verified live 2026-07-27: no body -> 411, `{}` -> 202.
    const res = await orderOutRequest('POST', `/channel/order/${row.oo_order_id}/mark-ready`, {})

    if (res.ok) {
      logEvent('RELAY', `Marked ready on OrderOut`, {
        row: row.id, oo_order_id: row.oo_order_id, status: res.status,
      })
      const { error } = await supabase.rpc('complete_orderout_status_relay', {
        p_id: row.id,
        p_ok: true,
        p_status_code: res.status,
      })
      if (error) logError('SETTLE', `Failed to settle sent row ${row.id}`, error)
      sent++
      continue
    }

    const terminal = isTerminal(res.status)
    if (res.status === 401 || res.status === 403) {
      // Config failure, not data. Surfaced loudly because every row will fail.
      logError('AUTH', `OrderOut rejected credentials on /channel (status ${res.status})`, res.error)
    }

    logEvent('RELAY', `Relay attempt failed`, {
      row: row.id, status: res.status, terminal, attempts: row.attempts, error: res.error,
    })

    const { error } = await supabase.rpc('complete_orderout_status_relay', {
      p_id: row.id,
      p_ok: false,
      p_status_code: res.status || null,
      p_error: res.error || `HTTP ${res.status}`,
      p_terminal: terminal,
    })
    if (error) logError('SETTLE', `Failed to settle failed row ${row.id}`, error)

    if (terminal || row.attempts >= row.max_attempts) failed++
    else retrying++
  }

  const summary = { claimed: rows.length, sent, failed, retrying }
  logEvent('DRAIN', 'Batch complete', summary)
  return successResponse(summary, 'Relay batch processed')
})
