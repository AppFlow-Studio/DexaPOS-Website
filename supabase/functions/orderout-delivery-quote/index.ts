// ============================================================================
// OrderOut Direct — delivery quote for the storefront checkout
// ============================================================================
// Called from the browser (anon key) when the delivery address is complete.
// Asks OrderOut for courier quotes, stores every quote server-side, picks the
// cheapest, and returns only our own quote row id + fee + ETA. The browser
// never sees provider ids or the api-key, and create-online-order charges the
// stored price — never a number the client sends back.
//
// Responses are always 200 for "we asked and delivery isn't possible"
// (available:false) so the checkout can fall back to pickup without treating
// it as an error. Real errors (bad request, store missing, rate limit) use
// 4xx like create-online-order.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@^2'
import {
  fetchAndStoreQuotes,
  normalizeDropoff,
  resolveDirectEligibility,
} from '../_shared/orderout-direct.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Quote batches allowed per session per window. Address retyping is bursty; couriers are not free to poll. */
const RATE_LIMIT_BATCHES = 12
const RATE_LIMIT_WINDOW_MINUTES = 10

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function errorResponse(error: string, code: string, status: number, details?: unknown): Response {
  console.error(`[orderout-delivery-quote] ${code}: ${error}`, details ?? '')
  return json({ success: false, error, code, details }, status)
}

interface QuoteRequest {
  store_config_id?: string
  session_token?: string
  dropoff?: Record<string, unknown>
}

/** Customer-facing copy per eligibility/quote reason. Provider messages are never surfaced. */
function unavailableMessage(reason: string): string {
  switch (reason) {
    case 'no_coverage':
      return "Delivery isn't available for this address. Pickup is still available."
    case 'fulfillment_self':
    case 'delivery_disabled':
    case 'restaurant_missing':
    case 'restaurant_inactive':
    case 'restaurant_unlinked':
      return "This store isn't offering delivery right now. Pickup is still available."
    default:
      return "We couldn't get a delivery quote right now. Pickup is still available."
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 'method_not_allowed', 405)
  }

  let body: QuoteRequest
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 'invalid_request', 400)
  }

  if (!body.store_config_id) {
    return errorResponse('store_config_id is required', 'invalid_request', 400)
  }

  const dropoff = normalizeDropoff(body.dropoff)
  if (!dropoff) {
    return errorResponse(
      'dropoff.street, city, state (2 letters) and zip (5 digits) are required',
      'invalid_request',
      400,
    )
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const eligibility = await resolveDirectEligibility(supabase, body.store_config_id)
    if (eligibility.reason === 'store_not_found') {
      return errorResponse('Store not found', 'store_not_found', 404)
    }
    if (!eligibility.eligible) {
      // Not an error from the customer's point of view: the store simply
      // doesn't do Direct delivery. Zero OrderOut calls happen on this path.
      return json({
        success: true,
        available: false,
        reason: eligibility.reason,
        message: unavailableMessage(eligibility.reason ?? 'ineligible'),
      })
    }

    // Session is optional (guest checkout creates one later) but when present
    // it must belong to this store, and it is the rate-limit key.
    let sessionId: string | null = null
    if (body.session_token) {
      const { data: session } = await supabase
        .from('online_order_sessions')
        .select('id, store_config_id, expires_at')
        .eq('session_token', body.session_token)
        .maybeSingle()

      if (session && session.store_config_id === body.store_config_id) {
        sessionId = session.id
      }
    }

    if (sessionId) {
      const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString()
      const { data: recent } = await supabase
        .from('orderout_delivery_quotes')
        .select('request_key')
        .eq('session_id', sessionId)
        .gte('fetched_at', since)

      const batches = new Set((recent ?? []).map((r: { request_key: string }) => r.request_key)).size
      if (batches >= RATE_LIMIT_BATCHES) {
        return errorResponse(
          'Too many delivery quotes requested. Please wait a moment and try again.',
          'rate_limited',
          429,
        )
      }
    }

    const result = await fetchAndStoreQuotes(supabase, eligibility, dropoff, sessionId)

    if (!result.available) {
      const isStoreFailure = result.reason === 'store_failed'
      if (isStoreFailure) {
        return errorResponse('Could not save delivery quote', 'quote_store_failed', 500, result.detail)
      }
      console.warn('[orderout-delivery-quote] unavailable', { reason: result.reason, detail: result.detail, store: body.store_config_id })
      return json({
        success: true,
        available: false,
        reason: result.reason,
        message: unavailableMessage(result.reason),
      })
    }

    return json({
      success: true,
      available: true,
      quote_id: result.selected.quoteRowId,
      fee: result.selected.fee,
      eta_minutes: result.selected.deliveryMinutes,
      pickup_minutes: result.selected.pickupMinutes,
      expires_at: result.selected.expiresAt,
    })
  } catch (err) {
    return errorResponse(
      'Unexpected error while quoting delivery',
      'quote_failed',
      500,
      err instanceof Error ? err.message : String(err),
    )
  }
})
