import { createClient } from 'npm:@supabase/supabase-js'

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const WEBHOOK_SECRET = Deno.env.get('ORDEROUT_WEBHOOK_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

function successResponse(data: unknown, message?: string): Response {
  return new Response(
    JSON.stringify({ success: true, data, message }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

function errorResponse(error: string, status: number = 500, details?: unknown): Response {
  console.error(`[ERROR] ${error}`, details || '')
  return new Response(
    JSON.stringify({ success: false, error, details }),
    { status, headers: { 'Content-Type': 'application/json' } }
  )
}

// ============================================================================
// LOGGING HELPERS
// ============================================================================

function logEvent(eventType: string, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] [${eventType}] ${message}`, data ? JSON.stringify(data) : '')
}

function logError(eventType: string, message: string, error: unknown): void {
  const timestamp = new Date().toISOString()
  console.error(`[${timestamp}] [${eventType}] ERROR: ${message}`, error)
}

// ============================================================================
// DEAD LETTER QUEUE HELPER
// ============================================================================

async function insertDeadLetter(
  supabase: ReturnType<typeof createClient>,
  payload: unknown,
  errorMessage: string,
  eventType?: string
): Promise<void> {
  const { error } = await supabase.from('webhook_dead_letter_queue').insert({
    source: 'orderout',
    event_type: eventType || 'unknown',
    raw_payload: payload,
    error_message: errorMessage,
    status: 'pending',
  })

  if (error) {
    logError('DLQ', 'Failed to insert into dead letter queue', error)
  } else {
    logEvent('DLQ', `Payload stored in dead letter queue: ${errorMessage}`)
  }
}

// ============================================================================
// AUTH VALIDATION
// ============================================================================

function validateAuth(req: Request): { valid: boolean; error?: string } {
  if (!WEBHOOK_SECRET) {
    return { valid: false, error: 'ORDEROUT_WEBHOOK_SECRET not configured' }
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header' }
  }

  const [scheme, token] = authHeader.split(' ')
  if (scheme !== 'Bearer' || !token) {
    return { valid: false, error: 'Invalid Authorization format. Expected: Bearer <token>' }
  }

  // Constant-time comparison to prevent timing attacks
  const encoder = new TextEncoder()
  const a = encoder.encode(token)
  const b = encoder.encode(WEBHOOK_SECRET)

  if (a.byteLength !== b.byteLength) {
    return { valid: false, error: 'Invalid webhook token' }
  }

  let mismatch = 0
  for (let i = 0; i < a.byteLength; i++) {
    mismatch |= a[i] ^ b[i]
  }

  if (mismatch !== 0) {
    return { valid: false, error: 'Invalid webhook token' }
  }

  return { valid: true }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
  // Only accept POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  // 1. Validate auth
  const auth = validateAuth(req)
  if (!auth.valid) {
    logError('AUTH', 'Authentication failed', auth.error)
    return errorResponse('Unauthorized', 401)
  }

  // 2. Parse body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  logEvent('WEBHOOK', 'Received OrderOut webhook', {
    hasDestination: !!body.destination,
    hasSource: !!body.source,
    hasPayload: !!body.payload,
  })

  // 3. Init Supabase service-role client (bypasses RLS)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 4. Extract key fields from the webhook payload
  const destination = body.destination as Record<string, unknown> | undefined
  const source = body.source as Record<string, unknown> | undefined

  const restaurantId = destination?.restaurantId as string | undefined
  const ooOrderNumber = source?.orderNumber as string | undefined
  const eventType = (source?.event as string) || 'received'

  // 5. Look up the restaurant by pos_uuid or oo_restaurant_id
  if (!restaurantId) {
    logError('WEBHOOK', 'Missing destination.restaurantId in payload', body)
    await insertDeadLetter(supabase, body, 'Missing destination.restaurantId', eventType)
    // Return 200 so OrderOut doesn't retry — we've stored the payload
    return successResponse(null, 'Payload stored for manual review (missing restaurantId)')
  }

  const { data: restaurant, error: restaurantError } = await supabase
    .from('orderout_restaurants')
    .select('id, location_id, orderout_account_id, oo_account_id, merchant_id, auto_accept_orders, is_accepting_orders')
    .or(`pos_uuid.eq.${restaurantId},oo_restaurant_id.eq.${restaurantId}`)
    .maybeSingle()

  if (restaurantError) {
    logError('WEBHOOK', 'Database error looking up restaurant', restaurantError)
    await insertDeadLetter(supabase, body, `DB error: ${restaurantError.message}`, eventType)
    return successResponse(null, 'Payload stored for retry (database error)')
  }

  if (!restaurant) {
    logError('WEBHOOK', `No restaurant found for ID: ${restaurantId}`, null)
    await insertDeadLetter(supabase, body, `Restaurant not found: ${restaurantId}`, eventType)
    return successResponse(null, 'Payload stored for manual review (restaurant not found)')
  }

  // 6. Check if restaurant is accepting orders
  if (!restaurant.is_accepting_orders) {
    logEvent('WEBHOOK', `Restaurant ${restaurant.id} is not accepting orders`)
    await insertDeadLetter(supabase, body, `Restaurant not accepting orders: ${restaurant.id}`, eventType)
    return successResponse(null, 'Payload stored (restaurant not accepting orders)')
  }

  // 7. Check for duplicate by oo_order_number (idempotency)
  if (ooOrderNumber) {
    const { data: existing } = await supabase
      .from('orderout_orders')
      .select('id')
      .eq('oo_order_number', ooOrderNumber)
      .maybeSingle()

    if (existing) {
      logEvent('WEBHOOK', `Duplicate order detected: ${ooOrderNumber}`)
      return successResponse({ id: existing.id }, 'Order already processed (duplicate)')
    }
  }

  // 8. Store raw payload in dead letter queue for processing
  //    Full order creation (orders + orderout_orders) is handled by a separate ticket.
  //    This webhook stores the validated, restaurant-matched payload for downstream processing.
  const { data: dlqEntry, error: dlqError } = await supabase
    .from('webhook_dead_letter_queue')
    .insert({
      source: 'orderout',
      event_type: eventType,
      raw_payload: {
        ...body,
        _matched_restaurant_id: restaurant.id,
        _matched_location_id: restaurant.location_id,
        _matched_account_id: restaurant.orderout_account_id,
        _matched_oo_account_id: restaurant.oo_account_id,
        _matched_merchant_id: restaurant.merchant_id,
        _auto_accept: restaurant.auto_accept_orders,
      },
      error_message: 'Pending order creation (awaiting order processing implementation)',
      status: 'pending',
    })
    .select('id')
    .single()

  if (dlqError) {
    logError('WEBHOOK', 'Failed to store webhook payload', dlqError)
    return errorResponse('Failed to store payload', 500)
  }

  // 9. Update restaurant's last_order_received_at
  await supabase
    .from('orderout_restaurants')
    .update({ last_order_received_at: new Date().toISOString() })
    .eq('id', restaurant.id)

  logEvent('WEBHOOK', `Order webhook stored successfully`, {
    dlqId: dlqEntry?.id,
    restaurantId: restaurant.id,
    orderNumber: ooOrderNumber,
    eventType,
  })

  return successResponse(
    { id: dlqEntry?.id, status: 'pending_processing' },
    'Webhook received and stored successfully'
  )
})
