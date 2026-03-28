import { createClient } from 'npm:@supabase/supabase-js'
import type {
  OnlineOrderRpcParams,
  OnlineOrderRpcResult,
  OnlineOrderItem,
  ProviderRestaurantMatch,
  WebhookValidation,
} from './online-order-types.ts'
import {
  buildDeliveryAddress,
  sanitizeItems,
} from './online-order-types.ts'

// ============================================================================
// OrderOut Webhook Translator
// ============================================================================
// This Edge Function is the THIN TRANSLATION LAYER for OrderOut.
// It handles:
//   1. Auth validation (OrderOut-specific bearer token)
//   2. Restaurant lookup (orderout_restaurants table)
//   3. Payload translation (OrderOut format → universal OnlineOrderRpcParams)
//   4. Calling the universal process_online_order RPC
//   5. DLQ fallback on failure
//
// TO ADD A NEW PROVIDER (e.g. DoorDash):
//   1. Copy this file to supabase/functions/doordash-webhook/index.ts
//   2. Define DoorDash's payload types
//   3. Write translateDoorDashPayload() → OnlineOrderRpcParams
//   4. Update the restaurant lookup to use doordash_stores table
//   5. Keep everything else (RPC call, DLQ, response helpers) the same
// ============================================================================

const WEBHOOK_SECRET = Deno.env.get('ORDEROUT_WEBHOOK_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ============================================================================
// ORDEROUT-SPECIFIC PAYLOAD TYPES
// ============================================================================

interface OrderOutWebhookPayload {
  event: string
  source: {
    ods: { name: string }
    leadTime: string | null
    placedOn: string
    orderNumber: string
    additionalInfo: string
    timeOfDelivery: string | null
    deliveryCompany: { name: string }
    externalReferenceId: string
  }
  payload: {
    order: {
      tax: number
      items: OrderOutRawItem[]
      total: number
      payment: { status: string; ccNumber: string | null; ccExpirationDate: string | null }
      discount: number | null
      gratuity: number | null
      ready_by: string | null
      subtotal: number
      orderType: string       // 'DELIVERY' | 'PICKUP'
      surcharge: number | null
      driverComp: number | null
      orderNotes: string | null
      deliveryCharge: number | null
    }
    customer: {
      city: string | null
      unit: string | null
      state: string | null
      zipCode: string | null
      streetName: string | null
      phoneNumber: string | null
      customerName: string | null
      deliveryNotes: string | null
    }
  }
  destination: {
    restaurantId: string
    restaurantName: string
    externalRestaurantId: number
  }
}

interface OrderOutRawItem {
  id: string
  name: string
  note: string | null
  price: number
  total: number
  quantity: number
  modifiers: OrderOutRawModifier[]
  external_id: string           // THIS IS OUR POS MENU_ITEM_ID
}

interface OrderOutRawModifier {
  id?: string
  name: string
  price?: number
  quantity?: number
  group_name?: string
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

function successResponse(data: unknown, message?: string): Response {
  return new Response(
    JSON.stringify({ success: true, data, message }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

function errorResponse(error: string, status = 500, details?: unknown): Response {
  console.error(`[ERROR] ${error}`, details || '')
  return new Response(
    JSON.stringify({ success: false, error, details }),
    { status, headers: { 'Content-Type': 'application/json' } }
  )
}

// ============================================================================
// LOGGING
// ============================================================================

function logEvent(tag: string, message: string, data?: unknown): void {
  console.log(`[${new Date().toISOString()}] [${tag}] ${message}`, data ? JSON.stringify(data) : '')
}

function logError(tag: string, message: string, error: unknown): void {
  console.error(`[${new Date().toISOString()}] [${tag}] ERROR: ${message}`, error)
}

// ============================================================================
// DLQ — Dead Letter Queue (shared fallback for failed processing)
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
  if (error) logError('DLQ', 'Failed to insert into dead letter queue', error)
  else logEvent('DLQ', `Payload stored: ${errorMessage}`)
}

// ============================================================================
// AUTH — OrderOut uses Bearer token
// ============================================================================

function validateAuth(req: Request): WebhookValidation {
  if (!WEBHOOK_SECRET) return { valid: false, error: 'ORDEROUT_WEBHOOK_SECRET not configured' }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { valid: false, error: 'Missing Authorization header' }

  const [scheme, token] = authHeader.split(' ')
  if (scheme !== 'Bearer' || !token) return { valid: false, error: 'Invalid Authorization format' }

  // Constant-time comparison
  const encoder = new TextEncoder()
  const a = encoder.encode(token)
  const b = encoder.encode(WEBHOOK_SECRET)
  if (a.byteLength !== b.byteLength) return { valid: false, error: 'Invalid webhook token' }

  let mismatch = 0
  for (let i = 0; i < a.byteLength; i++) mismatch |= a[i] ^ b[i]
  if (mismatch !== 0) return { valid: false, error: 'Invalid webhook token' }

  return { valid: true }
}

// ============================================================================
// RESTAURANT LOOKUP — OrderOut-specific (uses orderout_restaurants table)
// ============================================================================
// Each provider has its own config/mapping table. This function is the
// provider-specific piece that resolves a webhook to a DEXA POS location.
// ============================================================================

async function lookupRestaurant(
  supabase: ReturnType<typeof createClient>,
  restaurantId: string
): Promise<{ match: ProviderRestaurantMatch | null; error: string | null }> {
  const { data, error } = await supabase
    .from('orderout_restaurants')
    .select('id, location_id, orderout_account_id, auto_accept_orders, is_accepting_orders')
    .or(`pos_uuid.eq.${restaurantId},oo_restaurant_id.eq.${restaurantId}`)
    .maybeSingle()

  if (error) return { match: null, error: `DB error: ${error.message}` }
  if (!data) return { match: null, error: `Restaurant not found: ${restaurantId}` }

  return {
    match: {
      provider_record_id: data.id,
      location_id: data.location_id,
      auto_accept_orders: data.auto_accept_orders ?? false,
      is_accepting_orders: data.is_accepting_orders ?? false,
      provider_restaurant_id: restaurantId,
    },
    error: null,
  }
}

// ============================================================================
// TRANSLATOR — OrderOut payload → universal OnlineOrderRpcParams
// ============================================================================
// This is THE key function for each provider. It maps the provider's
// unique payload shape into the universal format the RPC expects.
// ============================================================================

function translateOrderOutPayload(
  body: OrderOutWebhookPayload,
  restaurant: ProviderRestaurantMatch
): OnlineOrderRpcParams {
  const { source, payload, destination } = body
  const { order, customer } = payload

  // Map OrderOut items → universal OnlineOrderItem format
  const items: Partial<OnlineOrderItem>[] = (order.items || []).map((item) => ({
    id: item.id,
    name: item.name,
    note: item.note,
    price: item.price,
    total: item.total,
    quantity: item.quantity,
    external_id: item.external_id,  // Our POS menu_item_id
    modifiers: (item.modifiers || []).map((mod) => ({
      id: mod.id ?? null,
      name: mod.name,
      price: mod.price ?? 0,
      quantity: mod.quantity ?? 1,
      group_name: mod.group_name ?? null,
    })),
  }))

  return {
    // ---- Location & Provider ----
    p_location_id: restaurant.location_id,
    p_provider: 'orderout',
    p_provider_order_id: source.orderNumber,

    // ---- Provider metadata ----
    p_provider_restaurant_id: restaurant.provider_restaurant_id,
    p_external_reference: source.externalReferenceId,
    p_delivery_company: source.deliveryCompany?.name ?? null,
    p_provider_metadata: {
      oo_account_id: restaurant.provider_record_id,
      ods_name: source.ods?.name,
      lead_time: source.leadTime,
      time_of_delivery: source.timeOfDelivery,
      additional_info: source.additionalInfo,
      destination_name: destination.restaurantName,
      destination_external_id: destination.externalRestaurantId,
      payment_status: order.payment?.status,
    },

    // ---- Order details ----
    p_order_type_raw: order.orderType || 'DELIVERY',
    p_customer_name: customer?.customerName,
    p_customer_phone: customer?.phoneNumber,

    // ---- Money (dollars e.g. 55.50 — stored as-is, no conversion) ----
    p_subtotal: order.subtotal || 0,
    p_tax: order.tax || 0,
    p_total: order.total || 0,
    p_gratuity: order.gratuity ?? 0,
    p_surcharge: order.surcharge ?? 0,
    p_delivery_charge: order.deliveryCharge ?? 0,
    p_discount: order.discount ?? 0,

    // ---- Timestamps ----
    p_placed_at: source.placedOn ?? null,
    p_ready_by: order.ready_by ?? null,
    p_estimated_delivery: source.timeOfDelivery ?? null,

    // ---- Items ----
    p_items: sanitizeItems(items),

    // ---- Address ----
    p_delivery_address: buildDeliveryAddress(
      customer?.streetName,
      customer?.unit,
      customer?.city,
      customer?.state,
      customer?.zipCode,
      customer?.deliveryNotes,
    ),

    // ---- Notes ----
    p_order_notes: order.orderNotes ?? null,

    // ---- Raw payload ----
    p_raw_payload: body as unknown as Record<string, unknown>,

    // ---- Behavior ----
    p_auto_accept: restaurant.auto_accept_orders,
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  // 1. Auth
  const auth = validateAuth(req)
  if (!auth.valid) {
    logError('AUTH', 'Authentication failed', auth.error)
    return errorResponse('Unauthorized', 401)
  }

  // 2. Parse
  let body: OrderOutWebhookPayload
  try {
    body = await req.json() as OrderOutWebhookPayload
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const eventType = body.source?.ods?.name
    ? `${body.source.ods.name}_${body.event || 'received'}`
    : body.event || 'received'

  logEvent('WEBHOOK', 'Received OrderOut webhook', {
    orderNumber: body.source?.orderNumber,
    deliveryCompany: body.source?.deliveryCompany?.name,
    orderType: body.payload?.order?.orderType,
    restaurantId: body.destination?.restaurantId,
  })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 3. Validate restaurant ID present
  const restaurantId = body.destination?.restaurantId
  if (!restaurantId) {
    logError('WEBHOOK', 'Missing destination.restaurantId', body)
    await insertDeadLetter(supabase, body, 'Missing destination.restaurantId', eventType)
    return successResponse(null, 'Payload stored for manual review (missing restaurantId)')
  }

  // 4. Restaurant lookup (OrderOut-specific)
  const { match: restaurant, error: lookupError } = await lookupRestaurant(supabase, restaurantId)

  if (lookupError || !restaurant) {
    logError('WEBHOOK', lookupError || 'Restaurant not found', { restaurantId })
    await insertDeadLetter(supabase, body, lookupError || `Restaurant not found: ${restaurantId}`, eventType)
    return successResponse(null, 'Payload stored for manual review (restaurant lookup failed)')
  }

  // 5. Check accepting orders
  if (!restaurant.is_accepting_orders) {
    logEvent('WEBHOOK', `Restaurant ${restaurant.provider_record_id} not accepting orders`)
    await insertDeadLetter(supabase, body, `Restaurant not accepting orders`, eventType)
    return successResponse(null, 'Payload stored (restaurant not accepting orders)')
  }

  // 6. First-pass idempotency check
  const ooOrderNumber = body.source?.orderNumber
  if (ooOrderNumber) {
    const { data: existing } = await supabase
      .from('online_orders')
      .select('id, order_id')
      .eq('provider', 'orderout')
      .eq('provider_order_id', ooOrderNumber)
      .maybeSingle()

    if (existing) {
      logEvent('WEBHOOK', `Duplicate order: ${ooOrderNumber}`)
      return successResponse(
        { order_id: existing.order_id, online_order_id: existing.id },
        'Order already processed (duplicate)'
      )
    }
  }

  // ========================================================================
  // 7. TRANSLATE & PROCESS
  // ========================================================================

  try {
    // Translate OrderOut format → universal format
    const rpcParams = translateOrderOutPayload(body, restaurant)

    // Call the universal RPC
    const { data: result, error: rpcError } = await supabase.rpc(
      'process_online_order',
      rpcParams
    )

    // Handle Supabase transport error
    if (rpcError) {
      logError('RPC', 'Supabase RPC call failed', rpcError)
      await insertDeadLetter(
        supabase,
        { ...body, _matched_location_id: restaurant.location_id },
        `RPC error: ${rpcError.message}`,
        eventType
      )
      return successResponse(null, 'Payload stored for retry (RPC transport error)')
    }

    const processResult = result as OnlineOrderRpcResult

    // Handle application-level error from inside the RPC
    if (!processResult.success) {
      logError('RPC', 'Order processing failed', processResult)
      await insertDeadLetter(
        supabase,
        { ...body, _matched_location_id: restaurant.location_id, _rpc_error: processResult.error },
        `Processing error: ${processResult.error}`,
        eventType
      )
      return successResponse(null, `Payload stored for retry (${processResult.error})`)
    }

    // ================================================================
    // SUCCESS
    // ================================================================

    if (processResult.warnings?.length) {
      logEvent('WEBHOOK', 'Order processed with warnings', {
        orderId: processResult.order_id,
        warnings: processResult.warnings,
      })
    }

    // Update last_order_received_at
    await supabase
      .from('orderout_restaurants')
      .update({ last_order_received_at: new Date().toISOString() })
      .eq('id', restaurant.provider_record_id)

    logEvent('WEBHOOK', 'Order processed successfully', {
      orderId: processResult.order_id,
      orderNumber: processResult.order_number,
      status: processResult.status,
      itemCount: processResult.item_count,
      autoAccepted: processResult.auto_accepted,
      duplicate: processResult.duplicate ?? false,
      warningCount: processResult.warnings?.length ?? 0,
    })

    return successResponse(
      {
        order_id: processResult.order_id,
        order_number: processResult.order_number,
        display_number: processResult.display_number,
        status: processResult.status,
        payment_status: processResult.payment_status,
        item_count: processResult.item_count,
        auto_accepted: processResult.auto_accepted,
        duplicate: processResult.duplicate ?? false,
        warnings: processResult.warnings,
      },
      processResult.duplicate
        ? 'Order already processed (duplicate)'
        : 'Order created successfully'
    )
  } catch (unexpectedError) {
    logError('WEBHOOK', 'Unexpected error', unexpectedError)
    await insertDeadLetter(
      supabase,
      { ...body, _matched_location_id: restaurant.location_id, _error: String(unexpectedError) },
      `Unexpected: ${String(unexpectedError)}`,
      eventType
    )
    return successResponse(null, 'Payload stored for retry (unexpected error)')
  }
})